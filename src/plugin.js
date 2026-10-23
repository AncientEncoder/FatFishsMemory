import os from 'node:os'
import path from 'node:path'
import { appendTurn, readIndex, writeIndex } from './store.js'

export const name = 'dsh-fatfish-memory'
export const inject = []

const DEFAULT_WINDOW = 1048576

function extractText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .filter(Boolean)
      .join('')
  }
  return ''
}

export function apply(ctx, config = {}) {
  const cfg = {
    enabled: true,
    dataDir: '',
    compactAt: 0.6,
    archiveTurns: true,
    ...config,
  }
  if (cfg.enabled === false) return

  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const root = cfg.dataDir || path.join(dshHome, 'fatfish-memory')
  const logger = (() => {
    try { return ctx.logger?.('fatfish-memory') ?? console } catch { return console }
  })()

  // Per-session write buffers: turn text arrives in pieces.
  const buffers = new Map()

  function bufferOf(sessionId) {
    let buf = buffers.get(sessionId)
    if (!buf) {
      buf = { user: '', assistant: '', turn: 0 }
      buffers.set(sessionId, buf)
    }
    return buf
  }

  function onEvent(session, event) {
    try {
      if (!event || typeof event.type !== 'string') return
      const sessionId = String(session?.header?.id ?? session?.id ?? 'unknown')
      const buf = bufferOf(sessionId)

      switch (event.type) {
        case 'turn/start':
          buf.user = ''
          buf.assistant = ''
          break
        case 'user/message': {
          const text = extractText(event.data?.message)
          if (text) buf.user = text
          break
        }
        case 'assistant/message': {
          const text = extractText(event.data?.message)
          if (text) buf.assistant = buf.assistant ? `${buf.assistant}\n${text}` : text
          break
        }
        case 'turn/end': {
          if (!buf.user && !buf.assistant) return
          buf.turn += 1
          if (cfg.archiveTurns) {
            appendTurn(root, sessionId, {
              turn: buf.turn,
              seq: event.seq,
              ts: Date.now(),
              user: buf.user,
              assistant: buf.assistant,
            })
          }
          // placeholder: compaction will hook here once pressure is known
          const index = readIndex(root, sessionId)
          if (!index.createdAt) {
            index.createdAt = new Date().toISOString()
            index.window = DEFAULT_WINDOW
            writeIndex(root, sessionId, index)
          }
          buf.user = ''
          buf.assistant = ''
          break
        }
        default:
          break
      }
    } catch (error) {
      // A memory bug must never take down the shared session bus.
      try { logger.error?.('[fatfish-memory] event handling failed', error) } catch { /* ignore */ }
    }
  }

  const off = ctx.on('session/event', onEvent, { global: true })
  ctx.effect(() => () => {
    try { off?.() } catch { /* ignore */ }
    buffers.clear()
  })

  logger.info?.(`[fatfish-memory] archiving to ${root} (compactAt=${cfg.compactAt})`)
}