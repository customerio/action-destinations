import show from './show'
import type { Settings } from './generated-types'
import { BrowserDestinationDefinition } from '../../lib/browser-destinations'
import { initialize } from './initialize'

const destination: BrowserDestinationDefinition<Settings, Intercom_.IntercomStatic> = {
  name: 'Intercom',

  authentication: {
    fields: {
      app_id: {
        type: 'string',
        required: true,
        description:
          'Your workspace ID (this appears as app _id in your code) is a unique code assigned to your app when you create it in Intercom. https://www.intercom.com/help/en/articles/3539-where-can-i-find-my-workspace-id-app-id'
      }
    }
  },
  actions: {
    show
  },
  initialize
}

export default destination
