// TODO remove need for this
require('../../../lib/action-kit')

module.exports = action()
  // TODO make these automatic
  .validateSettings(require('../settings.schema.json'))
  .validatePayload(require('./payload.schema.json'))

  .deliver(async ({ payload, settings }) => {
    const { id, ...body } = payload
    const userPass = Buffer.from(`${settings.siteId}:${settings.apiKey}`)

    return fetch(`https://api.customer.io/v1/api/campaigns/${id}/triggers`, {
      method: 'post',
      headers: {
        Authorization: `Basic ${userPass.toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  })
