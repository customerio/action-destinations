import { Action } from '@/lib/destination-kit/action'
import payloadSchema from './payload.schema.json'
import { Settings } from '../generated-types'
import { CreateOrUpdateDevice } from './generated-types'

export default function(action: Action<Settings, CreateOrUpdateDevice>): Action<Settings, CreateOrUpdateDevice> {
  return action
    .validatePayload(payloadSchema)

    .mapField('$.last_used', {
      '@timestamp': {
        timestamp: { '@path': '$.last_used' },
        format: 'X'
      }
    })

    .request(async (req, { payload }) => {
      const { person_id: customerId, device_id: deviceId, ...body } = payload

      return req.put(`customers/${customerId}/devices`, {
        json: {
          device: {
            id: deviceId,
            ...body
          }
        }
      })
    })
}
