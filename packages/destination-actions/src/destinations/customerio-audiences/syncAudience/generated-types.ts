// Generated file. DO NOT MODIFY IT BY HAND.

export interface Payload {
  /**
   * The ID used to uniquely identify a person in Customer.io. A value prefixed with `cio_` is sent as a Customer.io ID and an email address is sent as an email. [Learn more](https://customer.io/docs/identifying-people/#identifiers).
   */
  person_id?: string
  /**
   * An anonymous ID to merge into the person, the same way the Customer.io (Actions) destination does. It cannot identify a person on its own.
   */
  anonymous_id?: string
  /**
   * The email address of the person. Used as the identifier when Person ID is empty.
   */
  email?: string
  /**
   * The Engage audience key. It is used as the name of the boolean profile attribute in Customer.io and must match the attribute used by the audience segment.
   */
  audience_key: string
  /**
   * The traits (identify) or properties (track) object sent by Engage. The value of the audience key in this object says whether the person entered (true) or exited (false) the audience.
   */
  traits_or_properties?: {
    [k: string]: unknown
  }
  /**
   * The Engage event name. Used to decide membership when the traits or properties do not contain the audience key: "Audience Entered" sets the attribute to true and "Audience Exited" sets it to false.
   */
  event_name?: string
  /**
   * When the membership change happened.
   */
  timestamp?: string
  /**
   * Send membership changes to Customer.io in batches.
   */
  enable_batching?: boolean
  /**
   * Maximum number of membership changes to include in each batch (at most 1000).
   */
  batch_size?: number
}
