import nock from 'nock'
import { createTestIntegration, IntegrationError } from '@segment/actions-core'
import Destination from '../index'
import { AccountRegion } from '../utils'

const testDestination = createTestIntegration(Destination)

const siteId = 'site-id'
const apiKey = 'api-key'
const appApiKey = 'app-api-key'
const basicAuth = `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`
const settings = { siteId, apiKey, appApiKey, accountRegion: AccountRegion.US }
const euSettings = { ...settings, accountRegion: AccountRegion.EU }
const personas = { computation_id: 'aud_123', computation_key: 'vip_users', namespace: 'spa_1' }

const expectedConditions = {
  and: [
    {
      event: {
        type: 'attribute_change',
        name: 'vip_users',
        filters: {
          and: [
            { field: 'to', operator: 'eq', value: 'true', inverse: false },
            { field: 'from', operator: 'eq', value: 'true', inverse: true }
          ]
        }
      },
      times: 1,
      within: 0,
      inverse: false
    }
  ]
}

afterEach(() => {
  nock.cleanAll()
})

describe('Customer.io Audiences', () => {
  it('is a synced audience destination with a required App API key', () => {
    expect(Destination.slug).toBe('actions-customerio-audiences')
    expect(Destination.audienceConfig.mode).toEqual({ type: 'synced', full_audience_sync: false })
    expect(Destination.audienceFields.segmentId).toMatchObject({ type: 'string' })
    expect(Destination.authentication?.fields.appApiKey).toMatchObject({
      type: 'password',
      label: 'App API Key',
      required: true
    })
  })

  describe('testAuthentication', () => {
    it('checks the Track API credentials and the App API key', async () => {
      const track = nock('https://track.customer.io', { reqheaders: { authorization: basicAuth } })
        .get('/api/v1/accounts/region')
        .reply(200, { url: 'https://track.customer.io', region: 'us', environment_id: 1 })
      const app = nock('https://api.customer.io')
        .get('/v1/workspaces')
        .matchHeader('authorization', `Bearer ${appApiKey}`)
        .reply(200, { workspaces: [] })

      await expect(testDestination.testAuthentication(settings)).resolves.not.toThrow()
      expect(track.isDone()).toBe(true)
      expect(app.isDone()).toBe(true)
    })

    it('uses EU hosts for EU accounts', async () => {
      const track = nock('https://track-eu.customer.io').get('/api/v1/accounts/region').reply(200, {})
      const app = nock('https://api-eu.customer.io').get('/v1/workspaces').reply(200, {})

      await expect(testDestination.testAuthentication(euSettings)).resolves.not.toThrow()
      expect(track.isDone()).toBe(true)
      expect(app.isDone()).toBe(true)
    })

    it('fails when the App API key is rejected', async () => {
      nock('https://track.customer.io').get('/api/v1/accounts/region').reply(200, {})
      nock('https://api.customer.io').get('/v1/workspaces').reply(401, {})

      await expect(testDestination.testAuthentication(settings)).rejects.toThrow()
    })
  })

  describe('createAudience', () => {
    it('returns the configured segmentId without calling Customer.io', async () => {
      const result = await testDestination.createAudience({
        settings,
        audienceName: 'VIP Users',
        audienceSettings: { segmentId: ' 123 ' },
        personas
      })
      expect(result).toEqual({ externalId: '123' })
    })

    it('rejects a non-numeric segmentId', async () => {
      await expect(
        testDestination.createAudience({
          settings,
          audienceName: 'VIP Users',
          audienceSettings: { segmentId: 'vip' },
          personas
        })
      ).rejects.toThrowError('Segment ID must be the numeric ID of a Customer.io segment.')
    })

    it('requires the audience key', async () => {
      await expect(
        testDestination.createAudience({ settings, audienceName: 'VIP Users', audienceSettings: {} })
      ).rejects.toThrowError(IntegrationError)
    })

    it('creates a dynamic segment on the audience attribute with the exact request body', async () => {
      let body: unknown
      const scope = nock('https://api.customer.io')
        .post('/v1/segments', (b) => {
          body = b
          return true
        })
        .matchHeader('authorization', `Bearer ${appApiKey}`)
        .reply(200, { segment: { id: 77, name: 'VIP Users', type: 'dynamic' } })

      const result = await testDestination.createAudience({
        settings,
        audienceName: 'VIP Users',
        audienceSettings: {},
        personas
      })

      expect(result).toEqual({ externalId: '77' })
      expect(scope.isDone()).toBe(true)
      expect(body).toEqual({
        segment: {
          name: 'VIP Users',
          description:
            'Synced from Segment Engage audience "vip_users". People are in this segment while their "vip_users" attribute is true.',
          type: 'dynamic',
          conditions: expectedConditions
        }
      })
    })

    it('uses the EU App API host for EU accounts', async () => {
      const scope = nock('https://api-eu.customer.io')
        .post('/v1/segments')
        .reply(200, { segment: { id: 88, type: 'dynamic' } })

      const result = await testDestination.createAudience({
        settings: euSettings,
        audienceName: 'VIP Users',
        audienceSettings: {},
        personas
      })
      expect(result).toEqual({ externalId: '88' })
      expect(scope.isDone()).toBe(true)
    })

    it('surfaces App API errors such as the data-driven segment limit', async () => {
      nock('https://api.customer.io')
        .post('/v1/segments')
        .reply(400, { errors: [{ detail: 'data-driven segment limit reached' }] })

      await expect(
        testDestination.createAudience({ settings, audienceName: 'VIP Users', audienceSettings: {}, personas })
      ).rejects.toThrow()
    })
  })

  describe('getAudience', () => {
    it('verifies the segment through the App API', async () => {
      const scope = nock('https://api.customer.io')
        .get('/v1/segments/42')
        .matchHeader('authorization', `Bearer ${appApiKey}`)
        .reply(200, { segment: { id: 42, type: 'dynamic' } })

      const result = await testDestination.getAudience({ settings, externalId: '42' })
      expect(result).toEqual({ externalId: '42' })
      expect(scope.isDone()).toBe(true)
    })

    it('uses the EU App API host and prefers the segmentId audience setting', async () => {
      const scope = nock('https://api-eu.customer.io')
        .get('/v1/segments/99')
        .reply(200, { segment: { id: 99, type: 'dynamic' } })

      const result = await testDestination.getAudience({
        settings: euSettings,
        externalId: '42',
        audienceSettings: { segmentId: '99' }
      })
      expect(result).toEqual({ externalId: '99' })
      expect(scope.isDone()).toBe(true)
    })

    it('throws when the returned segment id does not match', async () => {
      nock('https://api.customer.io')
        .get('/v1/segments/42')
        .reply(200, { segment: { id: 43 } })

      await expect(testDestination.getAudience({ settings, externalId: '42' })).rejects.toThrowError(
        "Unable to verify ownership over audience. Segment Audience ID doesn't match the Customer.io segment ID."
      )
    })

    it('throws when the segment does not exist', async () => {
      nock('https://api.customer.io').get('/v1/segments/42').reply(404, {})

      await expect(testDestination.getAudience({ settings, externalId: '42' })).rejects.toThrowError(
        'Customer.io segment 42 does not exist.'
      )
    })
  })

  describe('presets', () => {
    it('maps Engage audience events to syncAudience', () => {
      const presets = Destination.presets ?? []
      expect(presets.map((p) => [p.name, p.partnerAction, p.type])).toEqual([
        ['Audience Entered', 'syncAudience', 'automatic'],
        ['Audience Exited', 'syncAudience', 'automatic'],
        ['Entities Audience Entered', 'syncAudience', 'specificEvent'],
        ['Entities Audience Exited', 'syncAudience', 'specificEvent']
      ])
      expect(presets[0]).toMatchObject({ subscribe: 'event = "Audience Entered"' })
      expect(presets[1]).toMatchObject({ subscribe: 'event = "Audience Exited"' })
      expect(presets[2]).toMatchObject({ eventSlug: 'warehouse_audience_entered_track' })
      expect(presets[3]).toMatchObject({ eventSlug: 'warehouse_audience_exited_track' })
    })
  })
})
