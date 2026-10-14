import { Analytics, Context } from '@segment/analytics-next'
import type { Subscription } from '@segment/browser-destination-runtime'
import { defaultValues } from '@segment/actions-core'
import CustomerIODestination, { destination } from '../../index'
import trackPage from '../index'
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
    partnerAction: 'trackPage',
    name: 'Track Page',
    enabled: true,
    subscribe: 'type = "page"',
    mapping: defaultValues(trackPage.fields)
  }
]

describe('CustomerIO.trackPage', () => {
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

  test('sends the page URL as the page name with page properties', async () => {
    const event = await load()
    await event.page?.(
      new Context({
        type: 'page',
        name: 'Billing',
        properties: { title: 'Billing', path: '/ui/billing' },
        context: { page: { url: 'https://example.com/ui/billing' } }
      })
    )

    expect(client.page).toHaveBeenCalledWith('https://example.com/ui/billing', {
      title: 'Billing',
      path: '/ui/billing'
    })
  })

  test('lets the snippet default the name when no URL is available', async () => {
    const event = await load()
    await event.page?.(new Context({ type: 'page', properties: {} }))

    expect(client.page).toHaveBeenCalledWith(undefined, {})
  })
})
