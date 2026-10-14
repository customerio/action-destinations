// Generated file. DO NOT MODIFY IT BY HAND.

export interface Settings {
  /**
   * Your Customer.io workspace Site ID, shown in the JavaScript snippet under Integrations > Customer.io API.
   */
  siteId: string
  /**
   * The region your Customer.io account is hosted in. EU accounts load track-eu.js.
   */
  region: string
  /**
   * Load the Customer.io in-app messaging plugin (sets data-use-in-app="true"). In-app messaging must also be enabled in your Customer.io workspace, and people must be identified to receive messages.
   */
  useInApp?: boolean
  /**
   * When enabled, the Customer.io snippet sends its own page view when it loads (data-auto-track-page). Leave disabled if the Track Page action forwards Segment page calls, to avoid duplicate page views.
   */
  autoTrackPage?: boolean
  /**
   * When enabled (data-use-array-params="true"), arrays in identify and track calls keep their shape. When disabled, Customer.io converts arrays into objects keyed by index.
   */
  useArrayParams?: boolean
  /**
   * When enabled (data-cross-site-support="true"), the snippet can set cookies from iframes within third-party domains, such as Shopify.
   */
  crossSiteSupport?: boolean
  /**
   * When enabled (data-enable-in-memory-storage="true"), the snippet stores identity in memory when cookies are unavailable.
   */
  enableInMemoryStorage?: boolean
}
