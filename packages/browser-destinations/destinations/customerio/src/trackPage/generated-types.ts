// Generated file. DO NOT MODIFY IT BY HAND.

export interface Payload {
  /**
   * The page name sent to Customer.io. Defaults to the page URL, which is what the Customer.io snippet uses for its own page views and what in-app page rules match against. If empty, the snippet uses the current URL.
   */
  name?: string
  /**
   * Additional data to send with the page view.
   */
  properties?: {
    [k: string]: unknown
  }
}
