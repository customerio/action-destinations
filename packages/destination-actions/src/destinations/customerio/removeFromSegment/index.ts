import type { ActionDefinition } from '@segment/actions-core'
import type { Settings, AudienceSettings } from '../generated-types'
import type { Payload } from './generated-types'
import { performBatch, performSingle, segmentMembershipFields } from '../segments'

const action: ActionDefinition<Settings, Payload, AudienceSettings> = {
  title: 'Remove Person from Segment',
  description: 'Remove a person from a Customer.io manual segment, such as the segment synced from an Engage audience.',
  defaultSubscription: 'event = "Audience Exited"',
  fields: {
    ...segmentMembershipFields,
    batch_keys: {
      label: 'Batch Keys',
      description: 'The keys to use for batching the events.',
      type: 'string',
      unsafe_hidden: true,
      required: false,
      multiple: true,
      default: ['segment_id']
    }
  },
  perform: (request, { settings, payload }) => {
    return performSingle(request, settings, payload, 'remove_customers')
  },
  performBatch: (request, { settings, payload }) => {
    return performBatch(request, settings, payload, 'remove_customers')
  }
}

export default action
