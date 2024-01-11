import type { ActionDefinition } from '@segment/actions-core'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import { sendBatch, sendSingle } from '../utils'

const action: ActionDefinition<Settings, Payload> = {
  title: 'Delete Object',
  description: `Track a "Group Deleted" event to delete an object.`,
  defaultSubscription: 'event = "Group Deleted"',
  fields: {
    object_id: {
      label: 'Object ID',
      description: 'An object ID used to identify an object.',
      type: 'string',
      default: {
        '@path': '$.groupId'
      }
    },
    object_type_id: {
      label: 'Object Type ID',
      description: 'An object ID type used to identify the type of object.',
      type: 'string',
      default: {
        '@if': {
          exists: { '@path': '$.properties.object_type_id' },
          then: { '@path': '$.properties.object_type_id' },
          else: { '@path': '$.properties.objectTypeId' }
        }
      }
    }
  },

  performBatch: (request, { payload: payloads, ...rest }) => {
    return sendBatch(
      request,
      payloads.map((payload) => ({
        ...rest,
        action: 'delete',
        payload,
        type: 'object'
      }))
    )
  },

  perform: (request, { payload, ...rest }) => {
    return sendSingle(request, {
      ...rest,
      action: 'delete',
      payload,
      type: 'object'
    })
  }
}

export default action
