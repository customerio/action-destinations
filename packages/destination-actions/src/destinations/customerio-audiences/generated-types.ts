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
   * Customer.io App API key, used to create and look up the segment for each audience. This can be found on your [API Credentials page](https://fly.customer.io/settings/api_credentials?keyType=app).
   */
  appApiKey: string
  /**
   * Learn about [Account Regions](https://customer.io/docs/data-centers/).
   */
  accountRegion?: string
}
// Generated file. DO NOT MODIFY IT BY HAND.

export interface AudienceSettings {
  /**
   * Optional. The numeric ID of an existing Customer.io segment to link to this audience instead of creating a new one, for example a segment created earlier by this destination. The segment should select people whose attribute named after the audience key is true.
   */
  segmentId?: string
}
