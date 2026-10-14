import type { BrowserActionDefinition } from '@segment/browser-destination-runtime/types'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import type { CustomerIO } from '../types'

const action: BrowserActionDefinition<Settings, CustomerIO, Payload> = {
  title: 'Track Page',
  description:
    'Send a page view to Customer.io. Web in-app message page rules match against the page name, so single-page apps should forward every page call.',
  platform: 'web',
  defaultSubscription: 'type = "page"',
  fields: {
    name: {
      label: 'Page Name',
      description:
        'The page name sent to Customer.io. Defaults to the page URL, which is what the Customer.io snippet uses for its own page views and what in-app page rules match against. If empty, the snippet uses the current URL.',
      type: 'string',
      required: false,
      default: { '@path': '$.context.page.url' }
    },
    properties: {
      label: 'Page Properties',
      description: 'Additional data to send with the page view.',
      type: 'object',
      required: false,
      default: { '@path': '$.properties' }
    }
  },
  perform: (cio, { payload }) => {
    cio.page(payload.name || undefined, payload.properties ?? {})
  }
}

export default action
