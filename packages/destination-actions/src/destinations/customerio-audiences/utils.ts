import { ErrorCodes, IntegrationError, RequestClient } from '@segment/actions-core'
import { fullFormats } from 'ajv-formats/dist/formats'
import dayjs from '../../lib/dayjs'

// Copied from the Customer.io (Actions) destination so the two destinations can evolve independently.
export enum AccountRegion {
  US = 'US 🇺🇸',
  EU = 'EU 🇪🇺'
}

interface RegionSettings {
  accountRegion?: string
}

export const trackApiEndpoint = ({ accountRegion }: RegionSettings) =>
  accountRegion === AccountRegion.EU ? 'https://track-eu.customer.io' : 'https://track.customer.io'

export const appApiEndpoint = ({ accountRegion }: RegionSettings) =>
  accountRegion === AccountRegion.EU ? 'https://api-eu.customer.io' : 'https://api.customer.io'

/**
 * Options for App API requests. `extendRequest` adds Track API basic auth to every request, so the
 * username/password are blanked out to stop the basic auth middleware from replacing the bearer token.
 */
export const appApiRequestOptions = (appApiKey: string) => ({
  username: '',
  password: '',
  headers: {
    Authorization: `Bearer ${appApiKey}`
  }
})

const isEmail = (value: string): boolean => (fullFormats.email as RegExp).test(value)

export type Identifiers = { id: string } | { email: string } | { cio_id: string }

/**
 * Same precedence as the Customer.io (Actions) destination: a `cio_` prefixed person ID is a cio_id,
 * an email-shaped person ID is an email, any other person ID is an id, and email is the fallback.
 * Anonymous IDs alone cannot identify a person, so they are not an identifier here.
 */
export const resolveIdentifiers = (personId?: string, email?: string): Identifiers | undefined => {
  const id = personId?.trim()
  const fallbackEmail = email?.trim()

  if (id) {
    if (id.startsWith('cio_')) return { cio_id: id.slice(4) }
    if (isEmail(id)) return { email: id }
    return { id }
  }

  if (fallbackEmail) return { email: fallbackEmail }

  return undefined
}

// Customer.io expects unix timestamps (seconds).
export const convertTimestamp = (value?: string | number): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return value
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value)

  const date = dayjs.utc(value)
  return date.isValid() ? date.unix() : undefined
}

export const isValidSegmentId = (segmentId: unknown): segmentId is string =>
  typeof segmentId === 'string' && /^\d+$/.test(segmentId.trim())

/**
 * Segment conditions for "profile attribute <audienceKey> is true", in the format the App API uses for
 * segment conditions: a profile attribute condition is an `attribute_change` event with a `to` filter
 * and an inverted `from` filter, and filter values are always strings.
 */
export const audienceConditions = (audienceKey: string) => ({
  and: [
    {
      event: {
        type: 'attribute_change',
        name: audienceKey,
        filters: {
          and: [
            { field: 'to', operator: 'eq', value: 'true', inverse: false },
            { field: 'from', operator: 'eq', value: 'true', inverse: true }
          ]
        }
      },
      times: 1,
      within: 0,
      inverse: false
    }
  ]
})

interface AppApiSegmentResponse {
  segment?: {
    id?: number | string
    name?: string
    type?: string
  }
}

export const createDynamicSegment = async (
  request: RequestClient,
  settings: RegionSettings & { appApiKey: string },
  name: string,
  audienceKey: string
): Promise<string> => {
  const response = await request<AppApiSegmentResponse>(`${appApiEndpoint(settings)}/v1/segments`, {
    method: 'post',
    ...appApiRequestOptions(settings.appApiKey),
    json: {
      segment: {
        name,
        description: `Synced from Segment Engage audience "${audienceKey}". People are in this segment while their "${audienceKey}" attribute is true.`,
        type: 'dynamic',
        conditions: audienceConditions(audienceKey)
      }
    }
  })

  const id = response.data?.segment?.id
  if (id === undefined || id === null || !isValidSegmentId(String(id))) {
    throw new IntegrationError(
      'Customer.io did not return a segment ID when creating the segment.',
      ErrorCodes.CREATE_AUDIENCE_FAILED,
      400
    )
  }

  return String(id)
}

export const getSegment = async (
  request: RequestClient,
  settings: RegionSettings & { appApiKey: string },
  segmentId: string
) => {
  const response = await request<AppApiSegmentResponse>(`${appApiEndpoint(settings)}/v1/segments/${segmentId}`, {
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
