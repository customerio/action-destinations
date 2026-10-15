import type { BrowserActionDefinition } from '@segment/browser-destination-runtime/types'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import type { CustomerIO } from '../types'

const action: BrowserActionDefinition<Settings, CustomerIO, Payload> = {
  title: 'Track Event',
  description:
    'Send a custom event to Customer.io. Events sent before a person is identified are attributed to an anonymous visitor and merged when they are identified.',
  platform: 'web',
  defaultSubscription: 'type = "track"',
  fields: {
    name: {
      label: 'Event Name',
      description: 'The name of the event.',
      type: 'string',
      required: true,
      default: { '@path': '$.event' }
    },
    properties: {
      label: 'Event Properties',
      description: 'Additional data to send with the event.',
      type: 'object',
      required: false,
      default: { '@path': '$.properties' }
    }
  },
  perform: (cio, { payload }) => {
    cio.track(payload.name, payload.properties ?? {})
  }
}

export default action
