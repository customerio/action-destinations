import { Analytics, Context } from '@segment/analytics-next'
import type { Subscription } from '@segment/browser-destination-runtime'
import { defaultValues } from '@segment/actions-core'
import CustomerIODestination, { destination } from '../../index'
import identifyUser from '../index'
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
    partnerAction: 'identifyUser',
    name: 'Identify User',
    enabled: true,
    subscribe: 'type = "identify"',
    mapping: defaultValues(identifyUser.fields)
  }
]

describe('CustomerIO.identifyUser', () => {
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

  test('identifies by userId and sends traits as attributes', async () => {
    const event = await load()
    await event.identify?.(
      new Context({
        type: 'identify',
        userId: 'user-123',
        traits: { email: 'jane@example.com', first_name: 'Jane', tags: ['a', 'b'] }
      })
    )

    expect(client.identify).toHaveBeenCalledWith({
      id: 'user-123',
      email: 'jane@example.com',
      first_name: 'Jane',
      tags: ['a', 'b']
    })
  })

  test('falls back to email as the id when there is no userId', async () => {
    const event = await load()
    await event.identify?.(
      new Context({ type: 'identify', anonymousId: 'anon-1', traits: { email: 'lead@example.com' } })
    )

    expect(client.identify).toHaveBeenCalledWith({ id: 'lead@example.com', email: 'lead@example.com' })
  })

  test('converts createdAt to created_at in Unix seconds', async () => {
    const event = await load()
    await event.identify?.(
      new Context({
        type: 'identify',
        userId: 'user-123',
        traits: { createdAt: '2012-06-11T18:19:18.000Z', plan: 'premium' }
      })
    )

    expect(client.identify).toHaveBeenCalledWith({ id: 'user-123', created_at: 1339438758, plan: 'premium' })
  })

  test('prefers created_at and accepts Unix timestamps', async () => {
    const event = await load()
    await event.identify?.(
      new Context({
        type: 'identify',
        userId: 'user-123',
        traits: { created_at: 1339438758, createdAt: '2020-01-01T00:00:00Z' }
      })
    )

    expect(client.identify).toHaveBeenCalledWith({ id: 'user-123', created_at: 1339438758 })
  })

  test('does not let a traits.id override the mapped id', async () => {
    const event = await load()
    await event.identify?.(new Context({ type: 'identify', userId: 'user-123', traits: { id: 'other' } }))

    expect(client.identify).toHaveBeenCalledWith({ id: 'user-123' })
  })

  test('skips identify when there is neither a userId nor an email', async () => {
    const event = await load()
    await event.identify?.(new Context({ type: 'identify', anonymousId: 'anon-1', traits: { plan: 'free' } }))

    expect(client.identify).not.toHaveBeenCalled()
  })
})
