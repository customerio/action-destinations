import nock from 'nock'
import { createTestEvent, createTestIntegration, IntegrationError, SegmentEvent } from '@segment/actions-core'
import Destination from '../index'
import { AccountRegion } from '../utils'
import { MAX_IDS_PER_SEGMENT_REQUEST } from '../segments'

const testDestination = createTestIntegration(Destination)

const siteId = 'site-id'
const apiKey = 'api-key'
const appApiKey = 'app-api-key'
const basicAuth = `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`
const timestamp = '2026-10-14T00:00:00.000Z'

const settings = { siteId, apiKey, accountRegion: AccountRegion.US }
const settingsWithAppKey = { ...settings, appApiKey }

const audienceEvent = (overrides: Partial<SegmentEvent> = {}, externalAudienceId = '42') =>
  createTestEvent({
    type: 'track',
    event: 'Audience Entered',
    userId: 'user-1',
    timestamp,
    properties: { audience_key: 'vip_users' },
    context: {
      personas: {
        computation_class: 'audience',
        computation_key: 'vip_users',
        computation_id: 'aud_123',
        external_audience_id: externalAudienceId
      }
    },
    ...overrides
  } as Partial<SegmentEvent>)

afterEach(() => {
  nock.cleanAll()
})

describe('Customer.io audience config', () => {
  it('declares synced mode and a segmentId audience field', () => {
    expect(Destination.audienceConfig.mode).toEqual({ type: 'synced', full_audience_sync: false })
    expect(Destination.audienceFields.segmentId).toMatchObject({ type: 'string' })
    expect(Destination.authentication?.fields.appApiKey).toMatchObject({ type: 'password', label: 'App API Key' })
    expect(Destination.authentication?.fields.appApiKey.required).toBeFalsy()
  })

  describe('createAudience', () => {
    it('returns the configured segmentId without calling Customer.io', async () => {
      const result = await testDestination.createAudience({
        settings,
        audienceName: 'VIP Users',
        audienceSettings: { segmentId: ' 123 ' }
      })

      expect(result).toEqual({ externalId: '123' })
    })

    it('rejects a non-numeric segmentId', async () => {
      await expect(
        testDestination.createAudience({
          settings: settingsWithAppKey,
          audienceName: 'VIP Users',
          audienceSettings: { segmentId: 'vip' }
        })
      ).rejects.toThrowError('Segment ID must be the numeric ID of a Customer.io manual segment.')
    })

    it('requires an App API Key when no segmentId is provided', async () => {
      await expect(
        testDestination.createAudience({
          settings,
          audienceName: 'VIP Users',
          audienceSettings: {}
        })
      ).rejects.toThrowError(IntegrationError)
    })

    it('creates a manual segment named after the audience with bearer auth', async () => {
      const scope = nock('https://api.customer.io', {
        reqheaders: { authorization: `Bearer ${appApiKey}` }
      })
        .post('/v1/segments', {
          segment: {
            name: 'VIP Users',
            description: 'Synced from Segment Engage audience "VIP Users" (vip_users).'
          }
        })
        .reply(200, { segment: { id: 77, name: 'VIP Users', type: 'manual' } })

      const result = await testDestination.createAudience({
        settings: settingsWithAppKey,
        audienceName: 'VIP Users',
        audienceSettings: {},
        personas: { computation_id: 'aud_123', computation_key: 'vip_users', namespace: 'spa_1' }
      })

      expect(result).toEqual({ externalId: '77' })
      expect(scope.isDone()).toBe(true)
    })

    it('uses the EU App API host for EU accounts', async () => {
      const scope = nock('https://api-eu.customer.io')
        .post('/v1/segments')
        .reply(200, { segment: { id: 88, name: 'EU Users', type: 'manual' } })

      const result = await testDestination.createAudience({
        settings: { ...settingsWithAppKey, accountRegion: AccountRegion.EU },
        audienceName: 'EU Users',
        audienceSettings: {}
      })

      expect(result).toEqual({ externalId: '88' })
      expect(scope.isDone()).toBe(true)
    })

    it('does not send Track API basic auth to the App API', async () => {
      const scope = nock('https://api.customer.io')
        .post('/v1/segments')
        .matchHeader('authorization', `Bearer ${appApiKey}`)
        .reply(200, { segment: { id: 2 } })

      const result = await testDestination.createAudience({
        settings: settingsWithAppKey,
        audienceName: 'Header check',
        audienceSettings: {}
      })
      expect(result).toEqual({ externalId: '2' })
      expect(scope.isDone()).toBe(true)
    })
  })

  describe('getAudience', () => {
    it('returns the externalId as is without an App API Key', async () => {
      const result = await testDestination.getAudience({ settings, externalId: '42' })
      expect(result).toEqual({ externalId: '42' })
    })

    it('prefers the audience segmentId setting over the stored externalId', async () => {
      const result = await testDestination.getAudience({
        settings,
        externalId: '42',
        audienceSettings: { segmentId: '99' }
      })
      expect(result).toEqual({ externalId: '99' })
    })

    it('verifies the segment through the App API when a key is present', async () => {
      const scope = nock('https://api.customer.io', {
        reqheaders: { authorization: `Bearer ${appApiKey}` }
      })
        .get('/v1/segments/42')
        .reply(200, { segment: { id: 42, name: 'VIP Users', type: 'manual' } })

      const result = await testDestination.getAudience({ settings: settingsWithAppKey, externalId: '42' })
      expect(result).toEqual({ externalId: '42' })
      expect(scope.isDone()).toBe(true)
    })

    it('uses the EU App API host for EU accounts', async () => {
      const scope = nock('https://api-eu.customer.io')
        .get('/v1/segments/42')
        .reply(200, { segment: { id: 42, type: 'manual' } })

      const result = await testDestination.getAudience({
        settings: { ...settingsWithAppKey, accountRegion: AccountRegion.EU },
        externalId: '42'
      })
      expect(result).toEqual({ externalId: '42' })
      expect(scope.isDone()).toBe(true)
    })

    it('throws when the returned segment id does not match', async () => {
      nock('https://api.customer.io')
        .get('/v1/segments/42')
        .reply(200, { segment: { id: 43, type: 'manual' } })

      await expect(
        testDestination.getAudience({ settings: settingsWithAppKey, externalId: '42' })
      ).rejects.toThrowError(
        "Unable to verify ownership over audience. Segment Audience ID doesn't match the Customer.io segment ID."
      )
    })

    it('throws when the segment is data-driven', async () => {
      nock('https://api.customer.io')
        .get('/v1/segments/42')
        .reply(200, { segment: { id: 42, type: 'dynamic' } })

      await expect(
        testDestination.getAudience({ settings: settingsWithAppKey, externalId: '42' })
      ).rejects.toThrowError('data-driven segment')
    })

    it('throws when the segment does not exist', async () => {
      nock('https://api.customer.io').get('/v1/segments/42').reply(404, {})

      await expect(
        testDestination.getAudience({ settings: settingsWithAppKey, externalId: '42' })
      ).rejects.toThrowError('Customer.io segment 42 does not exist.')
    })
  })
})

const segmentActions: { actionName: string; operation: string; eventName: string }[] = [
  { actionName: 'addToSegment', operation: 'add_customers', eventName: 'Audience Entered' },
  { actionName: 'removeFromSegment', operation: 'remove_customers', eventName: 'Audience Exited' }
]

segmentActions.forEach(({ actionName, operation, eventName }) =>
  describe(`CustomerIO ${actionName}`, () => {
    const action = Destination.actions[actionName]

    it('batches by segment_id and caps batch size at the documented limit', () => {
      expect(action.fields.batch_keys?.default).toEqual(['segment_id'])
      expect(action.fields.enable_batching.default).toBe(true)
      expect(action.fields.batch_size).toMatchObject({
        unsafe_hidden: true,
        default: MAX_IDS_PER_SEGMENT_REQUEST,
        maximum: MAX_IDS_PER_SEGMENT_REQUEST
      })
      expect(action.defaultSubscription).toBe(`event = "${eventName}"`)
    })

    it('sends a single person to the segment from the audience externalId', async () => {
      const scope = nock('https://track.customer.io', { reqheaders: { authorization: basicAuth } })
        .post(`/api/v1/segments/42/${operation}`, { ids: ['user-1'] })
        .query({ id_type: 'id' })
        .reply(200, {})

      const responses = await testDestination.testAction(actionName, {
        event: audienceEvent({ event: eventName }),
        settings,
        useDefaultMappings: true
      })

      expect(responses[0].status).toBe(200)
      expect(scope.isDone()).toBe(true)
    })

    it('uses the EU Track API host and email/cio_id id types', async () => {
      const scope = nock('https://track-eu.customer.io')
        .post(`/api/v1/segments/42/${operation}`, { ids: ['person@example.com'] })
        .query({ id_type: 'email' })
        .reply(200, {})
        .post(`/api/v1/segments/42/${operation}`, { ids: ['abc123'] })
        .query({ id_type: 'cio_id' })
        .reply(200, {})

      const euSettings = { ...settings, accountRegion: AccountRegion.EU }
      await testDestination.testAction(actionName, {
        event: audienceEvent({ userId: null, context: undefined, properties: { email: 'person@example.com' } }),
        mapping: { segment_id: '42' },
        settings: euSettings,
        useDefaultMappings: true
      })
      await testDestination.testAction(actionName, {
        event: audienceEvent({ userId: 'cio_abc123' }),
        settings: euSettings,
        useDefaultMappings: true
      })

      expect(scope.isDone()).toBe(true)
    })

    it('prefers audience_settings.segmentId over external_audience_id', async () => {
      const scope = nock('https://track.customer.io')
        .post(`/api/v1/segments/99/${operation}`, { ids: ['user-1'] })
        .query({ id_type: 'id' })
        .reply(200, {})

      const event = audienceEvent()
      ;(event.context as any).personas.audience_settings = { segmentId: '99' }

      await testDestination.testAction(actionName, { event, settings, useDefaultMappings: true })
      expect(scope.isDone()).toBe(true)
    })

    it('throws when neither person id nor email is present', async () => {
      await expect(
        testDestination.testAction(actionName, {
          event: audienceEvent({ userId: null, anonymousId: 'anon-1' }),
          settings,
          useDefaultMappings: true
        })
      ).rejects.toThrowError('Either Person ID or Email is required.')
    })

    it('throws when the segment id is not numeric', async () => {
      await expect(
        testDestination.testAction(actionName, {
          event: audienceEvent({}, 'not-a-number'),
          settings,
          useDefaultMappings: true
        })
      ).rejects.toThrowError('Segment ID must be the numeric ID of a Customer.io manual segment.')
    })

    it('sends one request per id_type and returns a multistatus response', async () => {
      const scope = nock('https://track.customer.io', { reqheaders: { authorization: basicAuth } })
        .post(`/api/v1/segments/42/${operation}`, { ids: ['user-1', 'user-2'] })
        .query({ id_type: 'id' })
        .reply(200, {})
        .post(`/api/v1/segments/42/${operation}`, { ids: ['person@example.com'] })
        .query({ id_type: 'email' })
        .reply(200, {})

      const response = await testDestination.executeBatch(actionName, {
        events: [
          audienceEvent({ userId: 'user-1' }),
          audienceEvent({ userId: null, anonymousId: 'anon-only' }),
          audienceEvent({ userId: 'user-2' }),
          audienceEvent({ userId: 'person@example.com' })
        ],
        settings,
        mapping: { ...defaultMapping(actionName) }
      })

      expect(scope.isDone()).toBe(true)
      expect(response).toHaveLength(4)
      expect(response[0]).toMatchObject({ status: 200, body: 'success' })
      expect(response[1]).toMatchObject({
        status: 400,
        errortype: 'PAYLOAD_VALIDATION_FAILED',
        errormessage: 'Either Person ID or Email is required.'
      })
      expect(response[2]).toMatchObject({ status: 200, body: 'success' })
      expect(response[3]).toMatchObject({ status: 200, body: 'success' })
    })

    it('keeps segments separate if a batch spans more than one segment', async () => {
      const scope = nock('https://track.customer.io')
        .post(`/api/v1/segments/1/${operation}`, { ids: ['user-1'] })
        .query({ id_type: 'id' })
        .reply(200, {})
        .post(`/api/v1/segments/2/${operation}`, { ids: ['user-2'] })
        .query({ id_type: 'id' })
        .reply(200, {})

      const response = await testDestination.executeBatch(actionName, {
        events: [audienceEvent({ userId: 'user-1' }, '1'), audienceEvent({ userId: 'user-2' }, '2')],
        settings,
        mapping: { ...defaultMapping(actionName) }
      })

      expect(scope.isDone()).toBe(true)
      expect(response.map((r) => r.status)).toEqual([200, 200])
    })

    it('marks every id in a failed request with the HTTP error', async () => {
      nock('https://track.customer.io')
        .post(`/api/v1/segments/42/${operation}`)
        .query({ id_type: 'id' })
        .reply(400, { meta: { errors: ['segment is not manual'] } })

      const response = await testDestination.executeBatch(actionName, {
        events: [audienceEvent({ userId: 'user-1' }), audienceEvent({ userId: 'user-2' })],
        settings,
        mapping: { ...defaultMapping(actionName) }
      })

      expect(response).toHaveLength(2)
      response.forEach((r) => {
        expect(r).toMatchObject({ status: 400 })
        expect((r as any).body).toContain('segment is not manual')
      })
    })
  })
)

describe('Customer.io audience presets', () => {
  it('maps Engage audience events to the segment actions', () => {
    const find = (name: string, action: string) =>
      Destination.presets?.find((preset) => preset.name === name && preset.partnerAction === action)

    expect(find('Audience Entered', 'addToSegment')).toMatchObject({
      type: 'automatic',
      subscribe: 'event = "Audience Entered"'
    })
    expect(find('Audience Exited', 'removeFromSegment')).toMatchObject({
      type: 'automatic',
      subscribe: 'event = "Audience Exited"'
    })
    expect(find('Entities Audience Entered', 'addToSegment')).toMatchObject({
      type: 'specificEvent',
      eventSlug: 'warehouse_audience_entered_track'
    })
    expect(find('Entities Audience Exited', 'removeFromSegment')).toMatchObject({
      type: 'specificEvent',
      eventSlug: 'warehouse_audience_exited_track'
    })
  })
})

function defaultMapping(actionName: string) {
  const fields = Destination.actions[actionName].fields
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default]))
}
