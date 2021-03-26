export const NODE_ENV = process.env.NODE_ENV || 'development'
export const PORT = process.env.PORT

// Suppress the logs when running the tests
export const LOG_LEVEL = NODE_ENV === 'test' ? 'crit' : process.env.LOG_LEVEL || 'debug'
export const DATADOG_AGENT_ADDR = process.env.DATADOG_AGENT_ADDR || 'localhost:8125'
export const SENTRY_DSN = process.env.SENTRY_DSN || ''
export const STATS_PREFIX = process.env.STATS_PREFIX || 'fab-5-engine'
