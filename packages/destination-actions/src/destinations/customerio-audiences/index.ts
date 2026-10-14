import { AudienceDestinationDefinition, ErrorCodes, IntegrationError, defaultValues } from '@segment/actions-core'
import type { AudienceSettings, Settings } from './generated-types'
import syncAudience from './syncAudience'
import {
  AccountRegion,
  appApiEndpoint,
  appApiRequestOptions,
  createDynamicSegment,
  getSegment,
  isValidSegmentId,
  trackApiEndpoint
} from './utils'

const destination: AudienceDestinationDefinition<Settings, AudienceSettings> = {
  name: 'Customer.io Audiences (Actions)',
  slug: 'actions-customerio-audiences',
  mode: 'cloud',
  description:
    'Sync Segment Engage audiences to Customer.io. Each audience becomes a data-driven segment on a boolean profile attribute named after the audience key.',

  authentication: {
    scheme: 'basic',
    fields: {
      siteId: {
        description:
          'Customer.io site ID. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials).',
        label: 'Site ID',
        type: 'password',
        required: true
      },
      apiKey: {
        description:
          'Customer.io API key. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials).',
        label: 'API Key',
        type: 'password',
        required: true
      },
      appApiKey: {
        description:
          'Customer.io App API key, used to create and look up the segment for each audience. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials?keyType=app).',
        label: 'App API Key',
        type: 'password',
        required: true
      },
      accountRegion: {
        description: 'Learn about [Account Regions](https://customer.io/docs/data-centers/).',
        label: 'Account Region',
        type: 'string',
        choices: Object.values(AccountRegion).map((dc) => ({ label: dc, value: dc })),
        default: AccountRegion.US
      }
    },
    testAuthentication: async (request, { settings }) => {
      // Track API credentials (site ID + API key, basic auth).
      await request(`${trackApiEndpoint(settings)}/api/v1/accounts/region`, { method: 'get' })
      // App API key (bearer auth).
      return request(`${appApiEndpoint(settings)}/v1/workspaces`, {
        method: 'get',
        ...appApiRequestOptions(settings.appApiKey)
      })
    }
  },

  extendRequest({ settings }) {
    return {
      username: settings.siteId,
      password: settings.apiKey
    }
  },

  audienceFields: {
    segmentId: {
      label: 'Segment ID',
      description:
        'Optional. The numeric ID of an existing Customer.io segment to link to this audience instead of creating a new one, for example a segment created earlier by this destination. The segment should select people whose attribute named after the audience key is true.',
      type: 'string'
    }
  },

  audienceConfig: {
    mode: {
      type: 'synced',
      full_audience_sync: false
    },
    async createAudience(request, { settings, audienceSettings, audienceName, personas }) {
      const existingSegmentId = audienceSettings?.segmentId?.trim()
      if (existingSegmentId) {
        if (!isValidSegmentId(existingSegmentId)) {
          throw new IntegrationError(
            'Segment ID must be the numeric ID of a Customer.io segment.',
            ErrorCodes.CREATE_AUDIENCE_FAILED,
            400
          )
        }
        return { externalId: existingSegmentId }
      }

      const audienceKey = personas?.computation_key
      if (!audienceKey) {
        throw new IntegrationError('Missing computation parameters: Key', 'MISSING_REQUIRED_FIELD', 422)
      }

      const externalId = await createDynamicSegment(request, settings, audienceName || audienceKey, audienceKey)
      return { externalId }
    },
    async getAudience(request, { settings, audienceSettings, externalId }) {
      const segmentId = audienceSettings?.segmentId?.trim() || externalId?.trim()
      if (!isValidSegmentId(segmentId)) {
        throw new IntegrationError(
          'Segment ID must be the numeric ID of a Customer.io segment.',
          ErrorCodes.GET_AUDIENCE_FAILED,
          400
        )
      }

      const segment = await getSegment(request, settings, segmentId)
      if (segment?.id === undefined || String(segment.id) !== segmentId) {
        throw new IntegrationError(
          "Unable to verify ownership over audience. Segment Audience ID doesn't match the Customer.io segment ID.",
          'INVALID_REQUEST_DATA',
          400
        )
      }

      return { externalId: segmentId }
    }
  },

  actions: {
    syncAudience
  },

  presets: [
    {
      name: 'Audience Entered',
      subscribe: 'event = "Audience Entered"',
      partnerAction: 'syncAudience',
      mapping: defaultValues(syncAudience.fields),
      type: 'automatic'
    },
    {
      name: 'Audience Exited',
      subscribe: 'event = "Audience Exited"',
      partnerAction: 'syncAudience',
      mapping: defaultValues(syncAudience.fields),
      type: 'automatic'
    },
    {
      name: 'Entities Audience Entered',
      partnerAction: 'syncAudience',
      mapping: defaultValues(syncAudience.fields),
      type: 'specificEvent',
      eventSlug: 'warehouse_audience_entered_track'
    },
    {
      name: 'Entities Audience Exited',
      partnerAction: 'syncAudience',
      mapping: defaultValues(syncAudience.fields),
      type: 'specificEvent',
      eventSlug: 'warehouse_audience_exited_track'
    }
  ]
}

export default destination
