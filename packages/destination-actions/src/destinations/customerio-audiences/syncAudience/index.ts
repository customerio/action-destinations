import {
  ActionDefinition,
  HTTPError,
  JSONLikeObject,
  MultiStatusResponse,
  PayloadValidationError,
  RequestClient
} from '@segment/actions-core'
import type { AudienceSettings, Settings } from '../generated-types'
import type { Payload } from './generated-types'
import { convertTimestamp, Identifiers, resolveIdentifiers, trackApiEndpoint } from '../utils'

// Track API v2: https://docs.customer.io/integrations/api/track/tag/track_v2/batch/
// "Your batch request must be smaller than 500kb." An identify carrying one boolean attribute is a few
// hundred bytes, so 1000 operations stays well under that.
const MAX_BATCH_SIZE = 1000

interface IdentifyOperation {
  type: 'person'
  action: 'identify'
  identifiers: Identifiers
  attributes: Record<string, unknown>
  timestamp?: number
}

type BuildResult = { operation: IdentifyOperation; error?: undefined } | { operation?: undefined; error: string }

const action: ActionDefinition<Settings, Payload, AudienceSettings> = {
  title: 'Sync Audience Membership',
  description:
    'Set a boolean profile attribute named after the audience key: true when a person enters the audience and false when they exit.',
  defaultSubscription: 'event = "Audience Entered" or event = "Audience Exited"',
  fields: {
    person_id: {
      label: 'Person ID',
      description:
        'The ID used to uniquely identify a person in Customer.io. A value prefixed with `cio_` is sent as a Customer.io ID and an email address is sent as an email. [Learn more](https://customer.io/docs/identifying-people/#identifiers).',
      type: 'string',
      default: { '@path': '$.userId' }
    },
    anonymous_id: {
      label: 'Anonymous ID',
      description:
        'An anonymous ID to merge into the person, the same way the Customer.io (Actions) destination does. It cannot identify a person on its own.',
      type: 'string',
      default: { '@path': '$.anonymousId' }
    },
    email: {
      label: 'Email',
      description: 'The email address of the person. Used as the identifier when Person ID is empty.',
      type: 'string',
      default: {
        '@if': {
          exists: { '@path': '$.traits.email' },
          then: { '@path': '$.traits.email' },
          else: {
            '@if': {
              exists: { '@path': '$.context.traits.email' },
              then: { '@path': '$.context.traits.email' },
              else: { '@path': '$.properties.email' }
            }
          }
        }
      }
    },
    audience_key: {
      label: 'Audience Key',
      description:
        'The Engage audience key. It is used as the name of the boolean profile attribute in Customer.io and must match the attribute used by the audience segment.',
      type: 'string',
      required: true,
      unsafe_hidden: true,
      default: { '@path': '$.context.personas.computation_key' }
    },
    traits_or_properties: {
      label: 'Traits or Properties',
      description:
        'The traits (identify) or properties (track) object sent by Engage. The value of the audience key in this object says whether the person entered (true) or exited (false) the audience.',
      type: 'object',
      unsafe_hidden: true,
      default: {
        '@if': {
          exists: { '@path': '$.properties' },
          then: { '@path': '$.properties' },
          else: { '@path': '$.traits' }
        }
      }
    },
    event_name: {
      label: 'Event Name',
      description:
        'The Engage event name. Used to decide membership when the traits or properties do not contain the audience key: "Audience Entered" sets the attribute to true and "Audience Exited" sets it to false.',
      type: 'string',
      unsafe_hidden: true,
      default: { '@path': '$.event' }
    },
    timestamp: {
      label: 'Timestamp',
      description: 'When the membership change happened.',
      type: 'string',
      default: { '@path': '$.timestamp' }
    },
    enable_batching: {
      label: 'Batch Data to Customer.io',
      description: 'Send membership changes to Customer.io in batches.',
      type: 'boolean',
      default: true
    },
    batch_size: {
      label: 'Batch Size',
      description: `Maximum number of membership changes to include in each batch (at most ${MAX_BATCH_SIZE}).`,
      type: 'number',
      unsafe_hidden: true,
      default: MAX_BATCH_SIZE,
      minimum: 1,
      maximum: MAX_BATCH_SIZE
    }
  },
  perform: (request, { settings, payload }) => {
    const { operation, error } = buildOperation(payload)
    if (error !== undefined) {
      throw new PayloadValidationError(error)
    }

    return request(`${trackApiEndpoint(settings)}/api/v2/entity`, {
      method: 'post',
      json: operation
    })
  },
  performBatch: (request, { settings, payload }) => sendBatch(request, settings, payload)
}

export const resolveMembership = (payload: Payload): boolean | undefined => {
  const value = payload.traits_or_properties?.[payload.audience_key]
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false

  if (payload.event_name === 'Audience Entered') return true
  if (payload.event_name === 'Audience Exited') return false

  return undefined
}

const buildOperation = (payload: Payload): BuildResult => {
  const audienceKey = payload.audience_key?.trim()
  if (!audienceKey) {
    return { error: 'Audience Key is required.' }
  }

  const identifiers = resolveIdentifiers(payload.person_id, payload.email)
  if (!identifiers) {
    return { error: 'Either Person ID or Email is required.' }
  }

  const inAudience = resolveMembership({ ...payload, audience_key: audienceKey })
  if (inAudience === undefined) {
    return {
      error: `Could not determine audience membership: "${audienceKey}" is not a boolean in the traits or properties and the event is not "Audience Entered" or "Audience Exited".`
    }
  }

  const attributes: Record<string, unknown> = { [audienceKey]: inAudience }
  const anonymousId = payload.anonymous_id?.trim()
  if (anonymousId) {
    attributes.anonymous_id = anonymousId
  }

  const operation: IdentifyOperation = { type: 'person', action: 'identify', identifiers, attributes }
  const timestamp = convertTimestamp(payload.timestamp)
  if (timestamp !== undefined) {
    operation.timestamp = timestamp
  }

  return { operation }
}

interface BatchErrorResponse {
  errors?: { batch_index?: number; field?: string; message?: string; reason?: string }[]
}

const sendBatch = async (request: RequestClient, settings: Settings, payloads: Payload[]) => {
  const multiStatusResponse = new MultiStatusResponse()
  const operations: IdentifyOperation[] = []
  const operationIndexes: number[] = []

  payloads.forEach((payload, index) => {
    const { operation, error } = buildOperation(payload)
    if (error !== undefined) {
      multiStatusResponse.setErrorResponseAtIndex(index, {
        status: 400,
        errortype: 'PAYLOAD_VALIDATION_FAILED',
        errormessage: error
      })
      return
    }
    operations.push(operation)
    operationIndexes.push(index)
  })

  if (!operations.length) {
    return multiStatusResponse
  }

  try {
    const response = await request<BatchErrorResponse>(`${trackApiEndpoint(settings)}/api/v2/batch`, {
      method: 'post',
      json: { batch: operations }
    })

    // 207: some operations were rejected; `batch_index` is the position in the batch we sent.
    const rejected = new Map<number, string>()
    if (response.status === 207) {
      for (const err of response.data?.errors ?? []) {
        if (typeof err.batch_index === 'number') {
          rejected.set(err.batch_index, [err.field, err.reason, err.message].filter(Boolean).join(': '))
        }
      }
    }

    operations.forEach((operation, batchIndex) => {
      const index = operationIndexes[batchIndex]
      const message = rejected.get(batchIndex)
      if (message !== undefined) {
        multiStatusResponse.setErrorResponseAtIndex(index, {
          status: 400,
          errortype: 'PAYLOAD_VALIDATION_FAILED',
          errormessage: message || 'Customer.io rejected this operation.',
          sent: operation as unknown as JSONLikeObject
        })
      } else {
        multiStatusResponse.setSuccessResponseAtIndex(index, {
          status: 200,
          sent: operation as unknown as JSONLikeObject,
          body: 'success'
        })
      }
    })
  } catch (error) {
    if (!(error instanceof HTTPError)) {
      throw error
    }

    const status = error.response?.status ?? 400
    const body = await error.response?.text?.().catch(() => undefined)
    operations.forEach((operation, batchIndex) => {
      multiStatusResponse.setErrorResponseAtIndex(operationIndexes[batchIndex], {
        status,
        errormessage: error.response?.statusText || error.message,
        sent: operation as unknown as JSONLikeObject,
        body: body ?? ''
      })
    })
  }

  return multiStatusResponse
}

export default action
