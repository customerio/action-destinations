import type { BrowserActionDefinition } from '@segment/browser-destination-runtime/types'
import type { Settings } from '../generated-types'
import type { Payload } from './generated-types'
import type { CustomerIO, IdentifyAttributes } from '../types'
import { toUnixSeconds } from '../utils'

const action: BrowserActionDefinition<Settings, CustomerIO, Payload> = {
  title: 'Identify User',
  description:
    'Identify a person in Customer.io and update their attributes. People must be identified to receive web in-app messages.',
  platform: 'web',
  defaultSubscription: 'type = "identify"',
  fields: {
    userId: {
      label: 'Person ID',
      description:
        'The ID that identifies the person in Customer.io. If empty, the email address is used as the ID, which Customer.io detects as an email identifier.',
      type: 'string',
      required: false,
      default: { '@path': '$.userId' }
    },
    email: {
      label: 'Email Address',
      description: "The person's email address. Used as the ID when Person ID is empty.",
      type: 'string',
      format: 'email',
      required: false,
      default: { '@path': '$.traits.email' }
    },
    createdAt: {
      label: 'Created At',
      description:
        'When the person was first created. Converted to a Unix timestamp (seconds) and sent as `created_at`. Customer.io recommends sending this only when you first identify someone.',
      type: 'datetime',
      required: false,
      default: {
        '@if': {
          exists: { '@path': '$.traits.created_at' },
          then: { '@path': '$.traits.created_at' },
          else: { '@path': '$.traits.createdAt' }
        }
      }
    },
    attributes: {
      label: 'Person Attributes',
      description: 'Attributes to set on the person in Customer.io.',
      type: 'object',
      required: false,
      default: { '@path': '$.traits' }
    }
  },
  perform: (cio, { payload }) => {
    const id = payload.userId || payload.email
    if (!id) {
      return
    }

    const attributes: IdentifyAttributes = { ...(payload.attributes ?? {}), id }
    // id, email and created_at are reserved attributes; they come from their own fields.
    delete attributes.createdAt
    delete attributes.created_at

    if (payload.email) {
      attributes.email = payload.email
    }

    const createdAt = toUnixSeconds(payload.createdAt)
    if (createdAt !== undefined) {
      attributes.created_at = createdAt
    }

    cio.identify(attributes)
  }
}

export default action
