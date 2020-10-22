import { get } from 'lodash'
import { Action } from '@/lib/destination-kit/action'
import payloadSchema from './payload.schema.json'
import { Settings } from '../generated-types'
import { DeletePerson } from './generated-types'

export default function(action: Action<Settings, DeletePerson>): Action<Settings, DeletePerson> {
  return action
    .validatePayload(payloadSchema)

    .cachedRequest({
      ttl: 60,
      key: ({ payload }) => payload.identifier,
      value: async (req, { payload }) => {
        const search = await req.get('persons/search', {
          searchParams: {
            term: payload.identifier
          }
        })

        return get(search.body, 'data.items[0].item.id')
      },
      as: 'personId'
    })

    .request(async (req, { cacheIds }) => {
      const personId = cacheIds.personId

      if (personId === undefined || personId === null) {
        return null
      }
      return req.delete(`persons/${personId}`)
    })
}
