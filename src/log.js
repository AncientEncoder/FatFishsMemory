/**
 * Tiny logger with a debug gate.
 *
 * Rules:
 * - `error` / `warn` always print — the user must see real problems.
 * - `info` / `debug` only print when the debug switch is on, so a normal
 *   install stays quiet and publishing with `debug: false` is the safe default.
 */
export function createLogger({ debug = false, prefix = '[fatfish-memory]', sink = console } = {}) {
  function emit(level, args) {
    try {
      const fn = sink?.[level] ?? sink?.log
      if (typeof fn === 'function') fn.call(sink, prefix, ...args)
    } catch {
      /* logging must never throw */
    }
  }

  return {
    get enabled() {
      return debug
    },
    debug(...args) {
      if (debug) emit('log', ['debug', ...args])
    },
    info(...args) {
      if (debug) emit('log', args)
    },
    warn(...args) {
      emit('warn', args)
    },
    error(...args) {
      emit('error', args)
    },
  }
}

/** Config value, overridable by env for one-off debugging without editing files. */
export function resolveDebug(configValue, env = process.env) {
  if (env?.DSH_FATFISH_DEBUG === '1') return true
  if (env?.DSH_FATFISH_DEBUG === '0') return false
  return configValue === true
}
