import { buildPayload, resolveIdentifiers } from '../utils'

describe('resolveIdentifiers', () => {
  it('should return object_id and object_type_id if both are provided', () => {
    const identifiers = { object_id: '123', object_type_id: '456' }

    expect(resolveIdentifiers(identifiers)).toEqual(identifiers)
  })

  it('should return cio_id if person_id starts with "cio_"', () => {
    const identifiers = { person_id: 'cio_123' }

    expect(resolveIdentifiers(identifiers)).toEqual({ cio_id: '123' })
  })

  it('should return email if person_id is a valid email', () => {
    const identifiers = { person_id: 'test@example.com' }

    expect(resolveIdentifiers(identifiers)).toEqual({ email: 'test@example.com' })
  })

  it('should return id if person_id is provided', () => {
    const identifiers = { person_id: '123' }

    expect(resolveIdentifiers(identifiers)).toEqual({ id: '123' })
  })

  it('should return email if email is provided', () => {
    const identifiers = { email: 'test@example.com' }

    expect(resolveIdentifiers(identifiers)).toEqual({ email: 'test@example.com' })
  })

  it('should return anonymous_id if anonymous_id is provided', () => {
    const identifiers = { anonymous_id: '123' }

    expect(resolveIdentifiers(identifiers)).toEqual({ anonymous_id: '123' })
  })

  it('should return undefined if no identifiers are provided', () => {
    expect(resolveIdentifiers({})).toBeUndefined()
  })
})

describe('buildPayload', () => {
  const settings = {}

  it('should add customer_ip to the root of identify requests', () => {
    const body = buildPayload({
      settings,
      type: 'person',
      action: 'identify',
      payload: { person_id: 'abc123', customer_ip: '203.0.113.9', attributes: { name: 'Test' } }
    })

    expect(body).toEqual({
      type: 'person',
      action: 'identify',
      customer_ip: '203.0.113.9',
      attributes: { name: 'Test' },
      identifiers: { id: 'abc123' }
    })
  })

  it('should not add customer_ip to other actions', () => {
    const body = buildPayload({
      settings,
      type: 'person',
      action: 'event',
      payload: { person_id: 'abc123', customer_ip: '203.0.113.9', name: 'purchase' }
    })

    expect(body).toEqual({
      type: 'person',
      action: 'event',
      name: 'purchase',
      identifiers: { id: 'abc123' }
    })
  })
})
