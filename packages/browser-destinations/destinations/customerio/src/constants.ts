// https://docs.customer.io/integrations/data-in/connections/javascript/legacy-js/getting-started/#install-the-snippet
export const SCRIPT_URL = {
  US: 'https://assets.customer.io/assets/track.js',
  EU: 'https://assets.customer.io/assets/track-eu.js'
} as const

// The snippet's script tag id; track.js reads its configuration from this element.
export const SCRIPT_ID = 'cio-tracker'

// Methods the documented snippet stubs onto the `_cio` queue before track.js loads.
export const QUEUED_METHODS = ['load', 'identify', 'sidentify', 'track', 'page', 'on', 'off'] as const
