// TODO remove need for this
require('../../../lib/action-kit')

module.exports = action()
  // TODO make these automatic
  .validateSettings(require('../settings.schema.json'))
  .validatePayload(require('./payload.schema.json'))

  .deliver(async ({ payload, settings }) => {
    const userPass = Buffer.from(`${settings.siteId}:${settings.apiKey}`)

    return fetch('https://track.customer.io/api/v1/events', {
      method: 'post',
      headers: {
        Authorization: `Basic ${userPass.toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
  })
