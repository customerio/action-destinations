import {
  ErrorCodes,
  HTTPError,
  IntegrationError,
  JSONLikeObject,
  MultiStatusResponse,
  PayloadValidationError,
  RequestClient
} from '@segment/actions-core'
import type { InputField } from '@segment/actions-core'
import { AccountRegion, resolveIdentifiers, trackApiEndpoint } from './utils'
import { CUSTOMERIO_CUSTOMERS_API_VERSION } from './versioning-info'

// Track API: "You are limited to 1000 customer IDs per request."
// https://docs.customer.io/integrations/api/track/tag/track-segments/add_to_segment/
export const MAX_IDS_PER_SEGMENT_REQUEST = 1000

export type SegmentIdType = 'id' | 'email' | 'cio_id'
export type SegmentOperation = 'add_customers' | 'remove_customers'

export interface SegmentMembershipPayload {
  person_id?: string
  email?: string
  segment_id: string
}

interface RegionSettings {
  accountRegion?: string
}

export const appApiEndpoint = ({ accountRegion }: RegionSettings) => {
  if (accountRegion === AccountRegion.EU) {
    return 'https://api-eu.customer.io'
  }

  return 'https://api.customer.io'
}

/**
 * Request options for App API calls. `extendRequest` adds Track API basic auth to every request,
 * so we blank out the username/password to stop the basic auth middleware from replacing the
 * bearer token.
 */
const appApiRequestOptions = (appApiKey: string) => ({
  username: '',
  password: '',
  headers: {
    Authorization: `Bearer ${appApiKey}`
  }
})

export const isValidSegmentId = (segmentId: unknown): segmentId is string =>
  typeof segmentId === 'string' && /^\d+$/.test(segmentId.trim())

interface AppApiSegment {
  segment?: {
    id?: number | string
    name?: string
    type?: string
  }
}

export const createManualSegment = async (
  request: RequestClient,
  settings: RegionSettings & { appApiKey?: string },
  name: string,
  description: string
): Promise<string> => {
  if (!settings.appApiKey) {
    throw new IntegrationError(
      'An App API Key is required to create a Customer.io manual segment. Add an App API Key to the destination settings, or enter the ID of an existing manual segment in the audience settings.',
      ErrorCodes.CREATE_AUDIENCE_FAILED,
      400
    )
  }

  const response = await request<AppApiSegment>(`${appApiEndpoint(settings)}/v1/segments`, {
    method: 'post',
    ...appApiRequestOptions(settings.appApiKey),
    json: {
      segment: { name, description }
    }
  })

  const id = response.data?.segment?.id
  if (id === undefined || id === null || !isValidSegmentId(String(id))) {
    throw new IntegrationError(
      'Customer.io did not return a segment ID when creating the manual segment.',
      ErrorCodes.CREATE_AUDIENCE_FAILED,
      400
    )
  }

  return String(id)
}

export const getManualSegment = async (
  request: RequestClient,
  settings: RegionSettings & { appApiKey: string },
  segmentId: string
) => {
  const response = await request<AppApiSegment>(`${appApiEndpoint(settings)}/v1/segments/${segmentId}`, {
    method: 'get',
    ...appApiRequestOptions(settings.appApiKey),
    throwHttpErrors: false
  })

  if (response.status === 404) {
    throw new IntegrationError(`Customer.io segment ${segmentId} does not exist.`, ErrorCodes.GET_AUDIENCE_FAILED, 400)
  }

  if (!response.ok) {
    throw new IntegrationError(
      `Unable to retrieve Customer.io segment ${segmentId}: ${response.status} ${response.statusText}`,
      ErrorCodes.GET_AUDIENCE_FAILED,
      response.status
    )
  }

  return response.data?.segment
}

/**
 * Maps a payload to the identifier sent in the `ids` array and the matching `id_type`.
 * Mirrors `resolveIdentifiers` used by the other actions: a `cio_` prefix means a cio_id,
 * an email-shaped person ID is sent as an email, and anything else is sent as an id.
 */
export const resolveSegmentIdentifier = (
  payload: Pick<SegmentMembershipPayload, 'person_id' | 'email'>
): { idType: SegmentIdType; value: string } | undefined => {
  const identifiers = resolveIdentifiers({
    person_id: payload.person_id?.trim() || undefined,
    email: payload.email?.trim() || undefined
  })

  if (identifiers?.cio_id) return { idType: 'cio_id', value: identifiers.cio_id }
  if (identifiers?.email) return { idType: 'email', value: identifiers.email }
  if (identifiers?.id) return { idType: 'id', value: identifiers.id }

  return undefined
}

const segmentMembershipUrl = (
  settings: RegionSettings,
  segmentId: string,
  operation: SegmentOperation,
  idType: SegmentIdType
) =>
  `${trackApiEndpoint(settings)}/api/${CUSTOMERIO_CUSTOMERS_API_VERSION}/segments/${encodeURIComponent(
    segmentId.trim()
  )}/${operation}?id_type=${idType}`

export const sendSegmentMembership = (
  request: RequestClient,
  settings: RegionSettings,
  segmentId: string,
  operation: SegmentOperation,
  idType: SegmentIdType,
  ids: string[]
) => {
  return request(segmentMembershipUrl(settings, segmentId, operation, idType), {
    method: 'post',
    json: { ids }
  })
}

export const performSingle = (
  request: RequestClient,
  settings: RegionSettings,
  payload: SegmentMembershipPayload,
  operation: SegmentOperation
) => {
  if (!isValidSegmentId(payload.segment_id)) {
    throw new PayloadValidationError('Segment ID must be the numeric ID of a Customer.io manual segment.')
  }

  const identifier = resolveSegmentIdentifier(payload)
  if (!identifier) {
    throw new PayloadValidationError('Either Person ID or Email is required.')
  }

  return sendSegmentMembership(request, settings, payload.segment_id, operation, identifier.idType, [identifier.value])
}

/**
 * Sends a batch of membership changes. `batch_keys: ['segment_id']` means every payload in a
 * batch targets the same segment, but the Track API requires every entry in `ids` to share one
 * `id_type`, so we send one request per identifier type (at most three).
 */
export const performBatch = async (
  request: RequestClient,
  settings: RegionSettings,
  payloads: SegmentMembershipPayload[],
  operation: SegmentOperation
) => {
  const multiStatusResponse = new MultiStatusResponse()
  // segment_id -> id_type -> entries
  const groups = new Map<string, Map<SegmentIdType, { index: number; value: string }[]>>()

  payloads.forEach((payload, index) => {
    if (!isValidSegmentId(payload.segment_id)) {
      multiStatusResponse.setErrorResponseAtIndex(index, {
        status: 400,
        errortype: 'PAYLOAD_VALIDATION_FAILED',
        errormessage: 'Segment ID must be the numeric ID of a Customer.io manual segment.'
      })
      return
    }

    const identifier = resolveSegmentIdentifier(payload)
    if (!identifier) {
      multiStatusResponse.setErrorResponseAtIndex(index, {
        status: 400,
        errortype: 'PAYLOAD_VALIDATION_FAILED',
        errormessage: 'Either Person ID or Email is required.'
      })
      return
    }

    const segmentId = payload.segment_id.trim()
    const byType = groups.get(segmentId) ?? new Map<SegmentIdType, { index: number; value: string }[]>()
    const entries = byType.get(identifier.idType) ?? []
    entries.push({ index, value: identifier.value })
    byType.set(identifier.idType, entries)
    groups.set(segmentId, byType)
  })

  for (const [segmentId, byType] of groups) {
    for (const [idType, entries] of byType) {
      for (let start = 0; start < entries.length; start += MAX_IDS_PER_SEGMENT_REQUEST) {
        const chunk = entries.slice(start, start + MAX_IDS_PER_SEGMENT_REQUEST)
        const ids = chunk.map((entry) => entry.value)

        try {
          await sendSegmentMembership(request, settings, segmentId, operation, idType, ids)
          // The endpoint returns an empty object and no per-id results, so every id sent is a success.
          chunk.forEach(({ index }) => {
            multiStatusResponse.setSuccessResponseAtIndex(index, {
              status: 200,
              sent: payloads[index] as unknown as JSONLikeObject,
              body: 'success'
            })
          })
        } catch (error) {
          if (!(error instanceof HTTPError)) {
            throw error
          }

          const status = error.response?.status ?? 400
          const body = await error.response?.text?.().catch(() => undefined)
          chunk.forEach(({ index }) => {
            multiStatusResponse.setErrorResponseAtIndex(index, {
              status,
              errormessage: error.response?.statusText || error.message,
              sent: payloads[index] as unknown as JSONLikeObject,
              body: body ?? ''
            })
          })
        }
      }
    }
  }

  return multiStatusResponse
}

export const segmentMembershipFields: Record<string, InputField> = {
  person_id: {
    label: 'Person ID',
    description:
      'The ID used to uniquely identify a person in Customer.io. A value prefixed with `cio_` is sent as a Customer.io ID and an email address is sent as an email. [Learn more](https://customer.io/docs/identifying-people/#identifiers).',
    type: 'string',
    default: {
      '@path': '$.userId'
    }
  },
  email: {
    label: 'Email',
    description: 'The email address of the person. Used only when Person ID is empty.',
    type: 'string',
    default: {
      '@if': {
        exists: { '@path': '$.context.traits.email' },
        then: { '@path': '$.context.traits.email' },
        else: { '@path': '$.properties.email' }
      }
    }
  },
  segment_id: {
    label: 'Segment ID',
    description:
      'The numeric ID of the Customer.io manual segment. Defaults to the segment linked to the Engage audience.',
    type: 'string',
    required: true,
    default: {
      '@if': {
        exists: { '@path': '$.context.personas.audience_settings.segmentId' },
        then: { '@path': '$.context.personas.audience_settings.segmentId' },
        else: { '@path': '$.context.personas.external_audience_id' }
      }
    }
  },
  enable_batching: {
    label: 'Batch Data to Customer.io',
    description: 'Send people to Customer.io in batches.',
    type: 'boolean',
    default: true
  },
  batch_size: {
    label: 'Batch Size',
    description: `Maximum number of people to include in each batch. Customer.io accepts at most ${MAX_IDS_PER_SEGMENT_REQUEST} IDs per request.`,
    type: 'number',
    unsafe_hidden: true,
    default: MAX_IDS_PER_SEGMENT_REQUEST,
    minimum: 1,
    maximum: MAX_IDS_PER_SEGMENT_REQUEST
  }
}

interface AudienceSettingsLike {
  segmentId?: string
}

interface SegmentSettings extends RegionSettings {
  appApiKey?: string
}

export const createAudience = async (
  request: RequestClient,
  {
    settings,
    audienceSettings,
    audienceName,
    personas
  }: {
    settings: SegmentSettings
    audienceSettings?: AudienceSettingsLike
    audienceName: string
    personas?: { computation_key?: string }
  }
) => {
  const existingSegmentId = audienceSettings?.segmentId?.trim()

  if (existingSegmentId) {
    if (!isValidSegmentId(existingSegmentId)) {
      throw new IntegrationError(
        'Segment ID must be the numeric ID of a Customer.io manual segment.',
        ErrorCodes.CREATE_AUDIENCE_FAILED,
        400
      )
    }
    return { externalId: existingSegmentId }
  }

  if (!audienceName) {
    throw new IntegrationError('Missing audience name.', ErrorCodes.CREATE_AUDIENCE_FAILED, 400)
  }

  const description = personas?.computation_key
    ? `Synced from Segment Engage audience "${audienceName}" (${personas.computation_key}).`
    : `Synced from Segment Engage audience "${audienceName}".`

  const externalId = await createManualSegment(request, settings, audienceName, description)
  return { externalId }
}

export const getAudience = async (
  request: RequestClient,
  {
    settings,
    audienceSettings,
    externalId
  }: {
    settings: SegmentSettings
    audienceSettings?: AudienceSettingsLike
    externalId: string
  }
) => {
  const segmentId = audienceSettings?.segmentId?.trim() || externalId?.trim()

  if (!isValidSegmentId(segmentId)) {
    throw new IntegrationError(
      'Segment ID must be the numeric ID of a Customer.io manual segment.',
      ErrorCodes.GET_AUDIENCE_FAILED,
      400
    )
  }

  // Without an App API Key we cannot read segments, so trust the stored ID.
  if (!settings.appApiKey) {
    return { externalId: segmentId }
  }

  const segment = await getManualSegment(request, { ...settings, appApiKey: settings.appApiKey }, segmentId)

  if (segment?.id === undefined || String(segment.id) !== segmentId) {
    throw new IntegrationError(
      "Unable to verify ownership over audience. Segment Audience ID doesn't match the Customer.io segment ID.",
      'INVALID_REQUEST_DATA',
      400
    )
  }

  if (segment.type && segment.type !== 'manual') {
    throw new IntegrationError(
      `Customer.io segment ${segmentId} is a data-driven segment. People can only be added to manual segments.`,
      ErrorCodes.GET_AUDIENCE_FAILED,
      400
    )
  }

  return { externalId: segmentId }
}
