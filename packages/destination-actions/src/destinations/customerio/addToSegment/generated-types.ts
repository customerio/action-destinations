// Generated file. DO NOT MODIFY IT BY HAND.

export interface Payload {
  /**
   * The ID used to uniquely identify a person in Customer.io. A value prefixed with `cio_` is sent as a Customer.io ID and an email address is sent as an email. [Learn more](https://customer.io/docs/identifying-people/#identifiers).
   */
  person_id?: string
  /**
   * The email address of the person. Used only when Person ID is empty.
   */
  email?: string
  /**
   * The numeric ID of the Customer.io manual segment. Defaults to the segment linked to the Engage audience.
   */
  segment_id: string
  /**
   * Send people to Customer.io in batches.
   */
  enable_batching?: boolean
  /**
   * Maximum number of people to include in each batch. Customer.io accepts at most 1000 IDs per request.
   */
  batch_size?: number
  /**
   * The keys to use for batching the events.
   */
  batch_keys?: string[]
}
