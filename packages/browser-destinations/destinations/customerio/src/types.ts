export type Attributes = {
  [k: string]: unknown
}

export interface IdentifyAttributes extends Attributes {
  id: string
}

/**
 * The public methods exposed on `window._cio` once
 * https://assets.customer.io/assets/track.js has loaded.
 *
 * Docs: https://docs.customer.io/integrations/data-in/connections/javascript/legacy-js/getting-started/#function-reference
 */
export interface CustomerIO {
  identify(attributes: IdentifyAttributes): void
  sidentify(attributes: IdentifyAttributes): void
  track(name: string, data?: Attributes, options?: { useArrayParams?: boolean }): void
  page(name?: string, data?: Attributes): void
  reset(): void
  on(event: string, listener: (event: unknown) => void, options?: AddEventListenerOptions): void
  off(event: string, listener: (event: unknown) => void): void
}

/**
 * Before track.js loads, `window._cio` is an array used as a command queue,
 * with stub methods that push `[methodName, ...args]` onto it. track.js only
 * initializes when it finds `_cio` as an array, then replaces it with the
 * real client and replays the queue.
 */
export type CustomerIOQueue = unknown[] & { [method: string]: unknown }

declare global {
  interface Window {
    _cio?: CustomerIO | CustomerIOQueue
  }
}
