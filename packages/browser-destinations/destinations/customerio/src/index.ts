import type { Settings } from './generated-types'
import type { BrowserDestinationDefinition } from '@segment/browser-destination-runtime/types'
import { browserDestination } from '@segment/browser-destination-runtime/shim'
import { defaultValues } from '@segment/actions-core'
import type { CustomerIO, CustomerIOQueue } from './types'
import { QUEUED_METHODS, SCRIPT_ID, SCRIPT_URL } from './constants'
import identifyUser from './identifyUser'
import trackEvent from './trackEvent'
import trackPage from './trackPage'

function isLoaded(cio: Window['_cio']): cio is CustomerIO {
  return cio !== undefined && cio !== null && !Array.isArray(cio)
}

/**
 * Mirrors the queue set up by the documented Customer.io JavaScript snippet:
 * https://docs.customer.io/integrations/data-in/connections/javascript/legacy-js/getting-started/#install-the-snippet
 */
function createQueue(): void {
  const queue = ((window._cio as CustomerIOQueue | undefined) ?? []) as CustomerIOQueue
  for (const method of QUEUED_METHODS) {
    queue[method] = (...args: unknown[]) => {
      queue.push([method, ...args])
    }
  }
  window._cio = queue
}

export const destination: BrowserDestinationDefinition<Settings, CustomerIO> = {
  name: 'Customer.io Web (Actions)',
  slug: 'actions-customerio-web',
  mode: 'device',
  description:
    'Load the Customer.io JavaScript snippet in the browser to identify people, send events and page views, and display Customer.io web in-app messages.',
  settings: {
    siteId: {
      label: 'Site ID',
      description:
        'Your Customer.io workspace Site ID, shown in the JavaScript snippet under Integrations > Customer.io API.',
      type: 'string',
      required: true
    },
    region: {
      label: 'Region',
      description: 'The region your Customer.io account is hosted in. EU accounts load track-eu.js.',
      type: 'string',
      required: true,
      choices: [
        { label: 'US', value: 'US' },
        { label: 'EU', value: 'EU' }
      ],
      default: 'US'
    },
    useInApp: {
      label: 'Enable In-App Messages',
      description:
        'Load the Customer.io in-app messaging plugin (sets data-use-in-app="true"). In-app messaging must also be enabled in your Customer.io workspace, and people must be identified to receive messages.',
      type: 'boolean',
      default: true
    },
    autoTrackPage: {
      label: 'Automatically Track Page Views',
      description:
        'When enabled, the Customer.io snippet sends its own page view when it loads (data-auto-track-page). Leave disabled if the Track Page action forwards Segment page calls, to avoid duplicate page views.',
      type: 'boolean',
      default: false
    },
    useArrayParams: {
      label: 'Preserve Arrays',
      description:
        'When enabled (data-use-array-params="true"), arrays in identify and track calls keep their shape. When disabled, Customer.io converts arrays into objects keyed by index.',
      type: 'boolean',
      default: true
    },
    crossSiteSupport: {
      label: 'Cross-Site Cookie Support',
      description:
        'When enabled (data-cross-site-support="true"), the snippet can set cookies from iframes within third-party domains, such as Shopify.',
      type: 'boolean',
      default: false
    },
    enableInMemoryStorage: {
      label: 'In-Memory Storage Fallback',
      description:
        'When enabled (data-enable-in-memory-storage="true"), the snippet stores identity in memory when cookies are unavailable.',
      type: 'boolean',
      default: false
    }
  },

  initialize: async ({ settings }, deps) => {
    if (isLoaded(window._cio)) {
      return window._cio
    }

    createQueue()

    const attributes: Record<string, string> = {
      id: SCRIPT_ID,
      'data-site-id': settings.siteId,
      'data-use-array-params': String(settings.useArrayParams !== false),
      'data-auto-track-page': String(settings.autoTrackPage === true)
    }
    if (settings.useInApp !== false) {
      attributes['data-use-in-app'] = 'true'
    }
    if (settings.crossSiteSupport) {
      attributes['data-cross-site-support'] = 'true'
    }
    if (settings.enableInMemoryStorage) {
      attributes['data-enable-in-memory-storage'] = 'true'
    }

    const src = settings.region === 'EU' ? SCRIPT_URL.EU : SCRIPT_URL.US
    await deps.loadScript(src, attributes)

    // track.js replaces the `_cio` queue array with the real client once it runs.
    await deps.resolveWhen(() => isLoaded(window._cio), 100)

    const cio = window._cio
    if (!isLoaded(cio)) {
      throw new Error('Customer.io track.js did not initialize')
    }
    return cio
  },

  presets: [
    {
      name: 'Identify User',
      subscribe: 'type = "identify"',
      partnerAction: 'identifyUser',
      mapping: defaultValues(identifyUser.fields),
      type: 'automatic'
    },
    {
      name: 'Track Event',
      subscribe: 'type = "track"',
      partnerAction: 'trackEvent',
      mapping: defaultValues(trackEvent.fields),
      type: 'automatic'
    },
    {
      name: 'Track Page',
      subscribe: 'type = "page"',
      partnerAction: 'trackPage',
      mapping: defaultValues(trackPage.fields),
      type: 'automatic'
    }
  ],

  actions: {
    identifyUser,
    trackEvent,
    trackPage
  }
}

export default browserDestination(destination)
