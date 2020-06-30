const get = require('lodash/get')

// SendGrid uses a custom "SGQL" query language for finding contacts. To protect us from basic
// injection attacks (e.g. "email = 'x@x.com' or email like '%@%'"), we can just strip all quotes
// from untrusted values.
const sgqlEscape = (s) => {
  return s.replace(/['"]/g, '')
}

module.exports = action => action
  // TODO make these automatic
  .validatePayload(require('./payload.schema.json'))

  .request(async (req, { payload }) => {
    const search = await req.post('marketing/contacts/search', {
      json: { query: `email = '${sgqlEscape(payload.email)}'` }
    })

    const id = get(search.body, 'result[0].id')
    if (id === undefined) return null

    return req.delete(`marketing/contacts?ids=${id}`)
  })
