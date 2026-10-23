import test from 'node:test'
import assert from 'node:assert/strict'
import { createLogger, resolveDebug } from '../src/log.js'

function capture() {
  const lines = []
  const sink = {
    log: (...args) => lines.push(['log', ...args]),
    warn: (...args) => lines.push(['warn', ...args]),
    error: (...args) => lines.push(['error', ...args]),
  }
  return { lines, sink }
}

test('debug off keeps info/debug silent but errors loud', () => {
  const { lines, sink } = capture()
  const log = createLogger({ debug: false, sink })
  log.debug('nope')
  log.info('nope')
  log.error('boom')
  assert.equal(lines.length, 1)
  assert.equal(lines[0][0], 'error')
})

test('debug on prints info and debug', () => {
  const { lines, sink } = capture()
  const log = createLogger({ debug: true, sink })
  log.debug('detail')
  log.info('status')
  assert.equal(lines.length, 2)
  assert.equal(lines[0][0], 'log')
})

test('logging never throws when the sink is broken', () => {
  const log = createLogger({ debug: true, sink: { log() { throw new Error('sink down') } } })
  assert.doesNotThrow(() => log.info('x'))
})

test('env override wins over config', () => {
  assert.equal(resolveDebug(false, { DSH_FATFISH_DEBUG: '1' }), true)
  assert.equal(resolveDebug(true, { DSH_FATFISH_DEBUG: '0' }), false)
  assert.equal(resolveDebug(true, {}), true)
  assert.equal(resolveDebug(false, {}), false)
})
