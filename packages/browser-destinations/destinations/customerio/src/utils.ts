/**
 * Customer.io expects `created_at` as a Unix timestamp in seconds.
 * https://docs.customer.io/integrations/data-in/connections/javascript/legacy-js/identify/#identify-a-person
 */
export function toUnixSeconds(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (typeof value === 'number') {
    // Treat millisecond timestamps (13+ digits) as milliseconds.
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
  }

  if (/^\d+$/.test(value)) {
    return toUnixSeconds(Number(value))
  }

  const ms = Date.parse(value)
  return isNaN(ms) ? undefined : Math.floor(ms / 1000)
}
