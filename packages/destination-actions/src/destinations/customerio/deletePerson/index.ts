import type { ActionDefinition } from '@segment/actions-core'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import { sendBatch, sendSingle } from '../utils'

const action: ActionDefinition<Settings, Payload> = {
  title: 'Delete Person',
  description: `Track a "User Deleted" event to delete a person.`,
  defaultSubscription: 'event = "User Deleted"',
  fields: {
    person_id: {
      label: 'Person ID',
      description:
        'The ID used to uniquely identify a person in Customer.io. [Learn more](https://customer.io/docs/identifying-people/#identifiers).',
      type: 'string',
      default: {
        '@if': {
          exists: { '@path': '$.userId' },
          then: { '@path': '$.userId' },
          else: { '@path': '$.traits.email' }
        }
      },
      required: true
    }
  },

  performBatch: (request, { payload: payloads, ...rest }) => {
    return sendBatch(
      request,
      payloads.map((payload) => ({
        ...rest,
        action: 'delete',
        payload,
        type: 'person'
      }))
    )
  },

  perform: (request, { payload, ...rest }) => {
    return sendSingle(request, {
      ...rest,
      action: 'delete',
      payload,
      type: 'person'
    })
  }
}

export default action
