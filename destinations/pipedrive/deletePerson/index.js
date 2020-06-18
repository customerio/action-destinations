const lodash = require('lodash')

module.exports = action => action
  // TODO make these automatic
  .validatePayload(require('./payload.schema.json'))

  .request(async (req, { payload }) => {
    const search = await req.get('persons/search', {
      searchParams: { term: payload.personIdentifier }
    })

    const personId = lodash.get(search.body, 'data.items[0].item.id')
    if (personId === undefined) return null

    return req.delete(`persons/${personId}`)
  })
