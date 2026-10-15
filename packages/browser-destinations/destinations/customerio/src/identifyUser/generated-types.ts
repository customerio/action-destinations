// Generated file. DO NOT MODIFY IT BY HAND.

export interface Payload {
  /**
   * The ID that identifies the person in Customer.io. If empty, the email address is used as the ID, which Customer.io detects as an email identifier.
   */
  userId?: string
  /**
   * The person's email address. Used as the ID when Person ID is empty.
   */
  email?: string
  /**
   * When the person was first created. Converted to a Unix timestamp (seconds) and sent as `created_at`. Customer.io recommends sending this only when you first identify someone.
   */
  createdAt?: string | number
  /**
   * Attributes to set on the person in Customer.io.
   */
  attributes?: {
    [k: string]: unknown
  }
}
