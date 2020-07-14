const get = require('lodash/get')

module.exports = action => action
  // TODO make these automatic
  .validatePayload(require('./payload.schema.json'))

  .mapField('$.organization.add_time', {
    '@timestamp': {
      timestamp: { '@path': '$.organization.add_time' },
      format: 'YYYY-MM-DD HH:MM:SS'
    }
  })

  .request(async (req, { payload }) => {
    const search = await req.get('organizations/search', {
      searchParams: { term: payload.organizationIdentifier }
    })

    const organizationId = get(search.body, 'data.items[0].item.id')

    if (organizationId === undefined) {
      return req.post('organizations', { json: payload.organization })
    } else {
      const { add_time: x, ...organization } = payload.organization
      return req.put(`organizations/${organizationId}`, { json: organization })
    }
  })
