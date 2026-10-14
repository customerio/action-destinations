import nock from 'nock'
import { createTestEvent, createTestIntegration, SegmentEvent } from '@segment/actions-core'
import Destination from '../index'
import { AccountRegion } from '../utils'

const testDestination = createTestIntegration(Destination)

const siteId = 'site-id'
const apiKey = 'api-key'
const basicAuth = `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`
const settings = { siteId, apiKey, appApiKey: 'app-api-key', accountRegion: AccountRegion.US }
const timestamp = '2026-10-14T00:00:00.000Z'
const unixTimestamp = 1791936000

const audienceEvent = (eventName: string, overrides: Partial<SegmentEvent> = {}, inAudience?: boolean) =>
  createTestEvent({
    type: 'track',
    event: eventName,
    userId: 'user-1',
    anonymousId: 'anon-1',
    timestamp,
    properties: {
      audience_key: 'vip_users',
      ...(inAudience === undefined ? {} : { vip_users: inAudience })
    },
    context: {
      traits: { email: 'person@example.com' },
      personas: {
        computation_class: 'audience',
        computation_key: 'vip_users',
        computation_id: 'aud_123',
        external_audience_id: '42'
      }
    },
    ...overrides
  } as Partial<SegmentEvent>)

const identify = (identifiers: Record<string, string>, inAudience: boolean, extra: Record<string, unknown> = {}) => ({
  type: 'person',
  action: 'identify',
  identifiers,
  attributes: { vip_users: inAudience, anonymous_id: 'anon-1', ...extra },
  timestamp: unixTimestamp
})

const defaultMapping = () =>
  Object.fromEntries(
    Object.entries(Destination.actions.syncAudience.fields).map(([key, field]) => [key, field.default])
  )

afterEach(() => {
  nock.cleanAll()
})

describe('Customer.io Audiences syncAudience', () => {
  it('sets the audience attribute to true on Audience Entered', async () => {
    const scope = nock('https://track.customer.io', { reqheaders: { authorization: basicAuth } })
      .post('/api/v2/entity', identify({ id: 'user-1' }, true))
      .reply(200, {})

    const responses = await testDestination.testAction('syncAudience', {
      event: audienceEvent('Audience Entered', {}, true),
      settings,
      useDefaultMappings: true
    })

    expect(responses[0].status).toBe(200)
    expect(scope.isDone()).toBe(true)
  })

  it('sets the audience attribute to false on Audience Exited', async () => {
    const scope = nock('https://track.customer.io')
      .post('/api/v2/entity', identify({ id: 'user-1' }, false))
      .reply(200, {})

    await testDestination.testAction('syncAudience', {
      event: audienceEvent('Audience Exited', {}, false),
      settings,
      useDefaultMappings: true
    })

    expect(scope.isDone()).toBe(true)
  })

  it('falls back to the event name when the property is missing', async () => {
    const scope = nock('https://track.customer.io')
      .post('/api/v2/entity', identify({ id: 'user-1' }, false))
      .reply(200, {})

    await testDestination.testAction('syncAudience', {
      event: audienceEvent('Audience Exited'),
      settings,
      useDefaultMappings: true
    })

    expect(scope.isDone()).toBe(true)
  })

  it('reads membership from identify traits', async () => {
    const scope = nock('https://track.customer.io')
      .post('/api/v2/entity', identify({ id: 'user-1' }, true))
      .reply(200, {})

    await testDestination.testAction('syncAudience', {
      event: audienceEvent('', {
        type: 'identify',
        event: undefined,
        properties: undefined,
        traits: { vip_users: true, email: 'person@example.com' }
      }),
      settings,
      useDefaultMappings: true
    })

    expect(scope.isDone()).toBe(true)
  })

  it('uses email when there is no user id, and cio_ ids as cio_id, on the EU host', async () => {
    const scope = nock('https://track-eu.customer.io')
      .post('/api/v2/entity', identify({ email: 'person@example.com' }, true))
      .reply(200, {})
      .post('/api/v2/entity', identify({ cio_id: 'abc123' }, true))
      .reply(200, {})

    const euSettings = { ...settings, accountRegion: AccountRegion.EU }
    await testDestination.testAction('syncAudience', {
      event: audienceEvent('Audience Entered', { userId: null }, true),
      settings: euSettings,
      useDefaultMappings: true
    })
    await testDestination.testAction('syncAudience', {
      event: audienceEvent('Audience Entered', { userId: 'cio_abc123' }, true),
      settings: euSettings,
      useDefaultMappings: true
    })

    expect(scope.isDone()).toBe(true)
  })

  it('throws when there is no person id or email', async () => {
    await expect(
      testDestination.testAction('syncAudience', {
        event: audienceEvent('Audience Entered', {
          userId: null,
          context: { personas: { computation_key: 'vip_users' } }
        }),
        settings,
        useDefaultMappings: true
      })
    ).rejects.toThrowError('Either Person ID or Email is required.')
  })

  it('throws when membership cannot be determined', async () => {
    await expect(
      testDestination.testAction('syncAudience', {
        event: audienceEvent('Some Other Event'),
        settings,
        useDefaultMappings: true
      })
    ).rejects.toThrowError('Could not determine audience membership')
  })

  it('sends a batch through /api/v2/batch and returns per-index statuses', async () => {
    const scope = nock('https://track.customer.io', { reqheaders: { authorization: basicAuth } })
      .post('/api/v2/batch', {
        batch: [identify({ id: 'user-1' }, true), identify({ id: 'user-2' }, false)]
      })
      .reply(200, {})

    const response = await testDestination.executeBatch('syncAudience', {
      events: [
        audienceEvent('Audience Entered', { userId: 'user-1' }, true),
        audienceEvent('Audience Entered', {
          userId: null,
          context: { personas: { computation_key: 'vip_users' } }
        }),
        audienceEvent('Audience Exited', { userId: 'user-2' }, false)
      ],
      settings,
      mapping: defaultMapping()
    })

    expect(scope.isDone()).toBe(true)
    expect(response).toHaveLength(3)
    expect(response[0]).toMatchObject({ status: 200, body: 'success' })
    expect(response[1]).toMatchObject({
      status: 400,
      errortype: 'PAYLOAD_VALIDATION_FAILED',
      errormessage: 'Either Person ID or Email is required.'
    })
    expect(response[2]).toMatchObject({ status: 200, body: 'success' })
  })

  it('maps 207 batch_index errors back to the original event index', async () => {
    nock('https://track.customer.io')
      .post('/api/v2/batch')
      .reply(207, { errors: [{ batch_index: 1, field: 'identifiers', reason: 'invalid', message: 'bad id' }] })

    const response = await testDestination.executeBatch('syncAudience', {
      events: [
        audienceEvent('Audience Entered', { userId: null, context: { personas: { computation_key: 'vip_users' } } }),
        audienceEvent('Audience Entered', { userId: 'user-1' }, true),
        audienceEvent('Audience Entered', { userId: 'user-2' }, true)
      ],
      settings,
      mapping: defaultMapping()
    })

    expect(response[0]).toMatchObject({ status: 400, errormessage: 'Either Person ID or Email is required.' })
    expect(response[1]).toMatchObject({ status: 200, body: 'success' })
    expect(response[2]).toMatchObject({ status: 400, errormessage: 'identifiers: invalid: bad id' })
  })

  it('marks every sent operation with the HTTP error when the batch fails', async () => {
    nock('https://track.customer.io')
      .post('/api/v2/batch')
      .reply(400, { errors: [{ message: 'malformed' }] })

    const response = await testDestination.executeBatch('syncAudience', {
      events: [
        audienceEvent('Audience Entered', { userId: 'user-1' }, true),
        audienceEvent('Audience Exited', { userId: 'user-2' }, false)
      ],
      settings,
      mapping: defaultMapping()
    })

    expect(response).toHaveLength(2)
    response.forEach((r) => {
      expect(r).toMatchObject({ status: 400 })
      expect((r as { body?: string }).body).toContain('malformed')
    })
  })
})
