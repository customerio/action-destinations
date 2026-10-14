import { Analytics, Context } from '@segment/analytics-next'
import type { Subscription } from '@segment/browser-destination-runtime'
import { loadScript } from '@segment/browser-destination-runtime/load-script'
import CustomerIODestination, { destination } from '../index'
import type { Settings } from '../generated-types'
import type { CustomerIO, CustomerIOQueue } from '../types'

function createMockClient(): jest.Mocked<CustomerIO> {
  return {
    identify: jest.fn(),
    sidentify: jest.fn(),
    track: jest.fn(),
    page: jest.fn(),
    reset: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}

jest.mock('@segment/browser-destination-runtime/load-script')

const baseSettings: Settings = {
  siteId: 'site_123',
  region: 'US'
}

const subscriptions: Subscription[] = [
  {
    partnerAction: 'trackEvent',
    name: 'Track Event',
    enabled: true,
    subscribe: 'type = "track"',
    mapping: {
      name: { '@path': '$.event' },
      properties: { '@path': '$.properties' }
    }
  }
]

describe('Customer.io Web initialization', () => {
  let client: jest.Mocked<CustomerIO>
  let queueAtLoad: unknown
  const resolveWhen = jest.fn<Promise<void>, [() => boolean, number?]>()
  const fakeLoadScript = jest.fn<Promise<HTMLScriptElement>, [string, Record<string, string>?]>()

  const initialize = (settings: Partial<Settings> = {}) =>
    destination.initialize?.(
      { settings: { ...baseSettings, ...settings }, analytics: {} as Analytics },
      { loadScript: fakeLoadScript, resolveWhen }
    )

  beforeEach(() => {
    delete window._cio
    client = createMockClient()
    queueAtLoad = undefined
    // The shared test setup resets all mocks before each test, so implementations are set here.
    resolveWhen.mockImplementation(async (condition) => {
      if (!condition()) throw new Error('condition not met')
    })
    // Simulates track.js: it only boots when `_cio` is an array, then replaces it with the client.
    fakeLoadScript.mockImplementation(async () => {
      queueAtLoad = window._cio
      window._cio = client
      return document.createElement('script')
    })
  })

  test('loads the US script with the documented snippet attributes by default', async () => {
    const result = await initialize({ useInApp: true, autoTrackPage: false, useArrayParams: true })

    expect(fakeLoadScript).toHaveBeenCalledWith('https://assets.customer.io/assets/track.js', {
      id: 'cio-tracker',
      'data-site-id': 'site_123',
      'data-use-array-params': 'true',
      'data-auto-track-page': 'false',
      'data-use-in-app': 'true'
    })
    expect(result).toBe(client)
    expect(resolveWhen).toHaveBeenCalled()
  })

  test('treats unset optional settings as their documented defaults', async () => {
    await initialize()

    expect(fakeLoadScript).toHaveBeenCalledWith('https://assets.customer.io/assets/track.js', {
      id: 'cio-tracker',
      'data-site-id': 'site_123',
      'data-use-array-params': 'true',
      'data-auto-track-page': 'false',
      'data-use-in-app': 'true'
    })
  })

  test('loads track-eu.js for EU accounts', async () => {
    await initialize({ region: 'EU' })

    expect(fakeLoadScript).toHaveBeenCalledWith(
      'https://assets.customer.io/assets/track-eu.js',
      expect.objectContaining({ id: 'cio-tracker', 'data-site-id': 'site_123' })
    )
  })

  test('maps optional settings to snippet attributes', async () => {
    await initialize({
      useInApp: false,
      autoTrackPage: true,
      useArrayParams: false,
      crossSiteSupport: true,
      enableInMemoryStorage: true
    })

    expect(fakeLoadScript).toHaveBeenCalledWith('https://assets.customer.io/assets/track.js', {
      id: 'cio-tracker',
      'data-site-id': 'site_123',
      'data-use-array-params': 'false',
      'data-auto-track-page': 'true',
      'data-cross-site-support': 'true',
      'data-enable-in-memory-storage': 'true'
    })
  })

  test('creates the _cio queue with stub methods before the script loads', async () => {
    await initialize()

    expect(Array.isArray(queueAtLoad)).toBe(true)
    const queue = queueAtLoad as unknown[] & Record<string, (...args: unknown[]) => void>
    for (const method of ['load', 'identify', 'sidentify', 'track', 'page', 'on', 'off']) {
      expect(typeof queue[method]).toBe('function')
    }
    queue.track('queued_event', { a: 1 })
    expect(queue).toContainEqual(['track', 'queued_event', { a: 1 }])
  })

  test('preserves commands already queued on an existing _cio array', async () => {
    const existing = [['identify', { id: 'early' }]] as unknown[] as CustomerIOQueue
    window._cio = existing

    await initialize()

    expect(queueAtLoad).toBe(existing)
    expect(existing).toContainEqual(['identify', { id: 'early' }])
  })

  test('reuses an already-loaded Customer.io client without loading the script again', async () => {
    window._cio = client

    const result = await initialize()

    expect(result).toBe(client)
    expect(fakeLoadScript).not.toHaveBeenCalled()
  })

  test('loads through the browser destination plugin and inserts the script tag', async () => {
    const mockedLoadScript = loadScript as jest.MockedFunction<typeof loadScript>
    let insertedAttributes: Record<string, string> | undefined
    mockedLoadScript.mockImplementation(async (src, attributes) => {
      // Mirror load-script.ts without fetching over the network.
      const script = document.createElement('script')
      script.src = src
      for (const [k, v] of Object.entries(attributes ?? {})) script.setAttribute(k, v)
      document.head.appendChild(script)
      insertedAttributes = attributes
      window._cio = client
      return script
    })

    const [event] = await CustomerIODestination({ ...baseSettings, region: 'EU', subscriptions })
    await event.load(Context.system(), {} as Analytics)

    const tag = document.getElementById('cio-tracker') as HTMLScriptElement
    expect(tag).not.toBeNull()
    expect(tag.src).toBe('https://assets.customer.io/assets/track-eu.js')
    expect(tag.getAttribute('data-site-id')).toBe('site_123')
    expect(tag.getAttribute('data-use-in-app')).toBe('true')
    expect(tag.getAttribute('data-auto-track-page')).toBe('false')
    expect(tag.getAttribute('data-use-array-params')).toBe('true')
    expect(insertedAttributes).toBeDefined()

    await event.track?.(new Context({ type: 'track', event: 'Viewed Pricing', properties: { plan: 'pro' } }))
    expect(client.track).toHaveBeenCalledWith('Viewed Pricing', { plan: 'pro' })
  })

  test('exposes identify, track and page presets', () => {
    expect(destination.presets?.map((p) => 'partnerAction' in p && p.partnerAction)).toEqual([
      'identifyUser',
      'trackEvent',
      'trackPage'
    ])
  })
})
