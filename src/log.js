import fs from 'node:fs'

/**
 * Tiny logger with a debug gate.
 *
 * Rules:
 * - `error` / `warn` always print — the user must see real problems.
 * - `info` / `debug` only print when the debug switch is on, so a normal
 *   install stays quiet and publishing with `debug: false` is the safe default.
 * - When `file` is given (debug mode), every line is also appended there, so
 *   behaviour can be verified after the fact without watching the console.
 */
export function createLogger({ debug = false, prefix = '[fatfish-memory]', sink = console, file = null } = {}) {
  function format(args) {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        try { return JSON.stringify(arg) } catch { return String(arg) }
      })
      .join(' ')
  }

  function emit(level, args) {
    const line = format(args)
    if (file) {
      try {
        fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${line}\n`, 'utf8')
      } catch {
        /* 写日志失败不能影响主流程 */
      }
    }
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
      if (debug) emit('debug', args)
    },
    info(...args) {
      if (debug) emit('info', args)
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
