// Generated file. DO NOT MODIFY IT BY HAND.

export interface Settings {
  /**
   * Customer.io site ID. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials).
   */
  siteId: string
  /**
   * Customer.io API key. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials).
   */
  apiKey: string
  /**
   * Learn about [Account Regions](https://customer.io/docs/data-centers/).
   */
  accountRegion?: string
  /**
   * Customer.io App API key. Required to automatically create a manual segment for each Engage audience; optional if you enter an existing segment ID on each audience. Only used to create and look up segments. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials?keyType=app).
   */
  appApiKey?: string
}
// Generated file. DO NOT MODIFY IT BY HAND.

export interface AudienceSettings {
  /**
   * The numeric ID of an existing Customer.io manual segment to sync this audience to. If empty, a new manual segment named after the audience is created (requires an App API Key).
   */
  segmentId?: string
}
