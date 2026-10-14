import { Analytics, Context } from '@segment/analytics-next'
import type { Subscription } from '@segment/browser-destination-runtime'
import { defaultValues } from '@segment/actions-core'
import CustomerIODestination, { destination } from '../../index'
import trackEvent from '../index'
import type { CustomerIO } from '../../types'

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

const subscriptions: Subscription[] = [
  {
    partnerAction: 'trackEvent',
    name: 'Track Event',
    enabled: true,
    subscribe: 'type = "track"',
    mapping: defaultValues(trackEvent.fields)
  }
]

describe('CustomerIO.trackEvent', () => {
  let client: jest.Mocked<CustomerIO>

  async function load() {
    jest.spyOn(destination, 'initialize').mockImplementation(async () => client)
    const [event] = await CustomerIODestination({ siteId: 'site_123', region: 'US', subscriptions })
    await event.load(Context.system(), {} as Analytics)
    return event
  }

  beforeEach(() => {
    client = createMockClient()
  })

  test('sends the event name and properties', async () => {
    const event = await load()
    await event.track?.(
      new Context({
        type: 'track',
        event: 'added_to_cart',
        properties: { price: '23.45', item_type: 'shoes', sku: 12345, sizes: [9, 10] }
      })
    )

    expect(client.track).toHaveBeenCalledWith('added_to_cart', {
      price: '23.45',
      item_type: 'shoes',
      sku: 12345,
      sizes: [9, 10]
    })
  })

  test('sends an empty data object when there are no properties', async () => {
    const event = await load()
    await event.track?.(new Context({ type: 'track', event: 'watchedIntroVideo' }))

    expect(client.track).toHaveBeenCalledWith('watchedIntroVideo', {})
  })
})
