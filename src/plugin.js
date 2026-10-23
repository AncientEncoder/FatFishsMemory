import os from 'node:os'
import path from 'node:path'
import { appendTurn, readIndex, writeIndex, readTurns, readProfile, writeProfile } from './store.js'
import { estimateTokens, pressureOf } from './pressure.js'
import { makeCard } from './compact.js'
import { isCompactionEvent, recordCompaction } from './compaction.js'
import { emptyProfile, renderProfileCard } from './profile.js'
import { buildRecallMessage, spliceInbox } from './inject.js'
import { createBreaker, ensureDataDir, probeWrite, writeWelcome } from './safety.js'

export const name = 'dsh-fatfish-memory'
export const inject = []

const DEFAULT_WINDOW = 1048576
const MIN_TURNS_PER_CARD = 6

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
    injectProfile: false,
    profileTarget: 'next-step',
    ...config,
  }
  if (cfg.enabled === false) return

  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const root = cfg.dataDir || path.join(dshHome, 'fatfish-memory')
  const logger = (() => {
    try { return ctx.logger?.('fatfish-memory') ?? console } catch { return console }
  })()

  // ---- first-run safety net -------------------------------------------------
  // A missing or unwritable data directory must degrade to read-only instead of
  // throwing once per turn: someone installing this for the first time should
  // get a working plugin, not a wall of errors.
  const dirReady = ensureDataDir(root)
  const writable = dirReady && probeWrite(root)
  if (!dirReady) {
    logger.error?.(`[fatfish-memory] 无法创建数据目录 ${root}，本次会话只读运行`)
    cfg.archiveTurns = false
  } else if (!writable) {
    logger.error?.(`[fatfish-memory] 数据目录不可写 ${root}，已关闭归档，仅保留内存统计`)
    cfg.archiveTurns = false
  } else {
    writeWelcome(root)
    if (!readProfile(root)) {
      try { writeProfile(root, emptyProfile()) } catch { /* 首次写入失败不致命 */ }
    }
  }

  const breaker = createBreaker({
    limit: 3,
    onOpen: (error) => {
      cfg.archiveTurns = false
      logger.error?.('[fatfish-memory] 连续写入失败，已停止落盘（本次会话）：', error?.message ?? error)
    },
  })

  /** 所有磁盘写入都走这里：失败只记一次，不刷屏。 */
  function guarded(fn) {
    if (breaker.open) return undefined
    try {
      const result = fn()
      breaker.ok()
      return result
    } catch (error) {
      breaker.fail(error)
      return undefined
    }
  }

  const buffers = new Map()
  const state = new Map()
  const profileSeeded = new Set()

  function bufferOf(sessionId) {
    let buf = buffers.get(sessionId)
    if (!buf) {
      buf = { user: '', assistant: '', turn: 0 }
      buffers.set(sessionId, buf)
    }
    return buf
  }

  function stateOf(sessionId) {
    let s = state.get(sessionId)
    if (!s) {
      const index = readIndex(root, sessionId)
      s = {
        index,
        turn: index.lastTurn ?? 0,
        compactedThrough: index.compactedThrough ?? 0,
        tokens: index.estimatedTokens ?? 0,
      }
      state.set(sessionId, s)
    }
    return s
  }

  function maybeCompact(sessionId) {
    const s = stateOf(sessionId)
    s.index.entries = s.index.entries || []
    const pressure = pressureOf(s.tokens, s.index.window ?? DEFAULT_WINDOW)
    if (pressure < cfg.compactAt) return null

    const turns = readTurns(root, sessionId)
    const pending = turns.filter((t) => t.turn > s.compactedThrough)
    if (pending.length < MIN_TURNS_PER_CARD) return null

    const cut = Math.floor(pending.length / 2)
    const slice = pending.slice(0, cut)
    const card = makeCard(slice, {
      from: s.compactedThrough + 1,
      to: slice[slice.length - 1].turn,
    })
    s.index.entries.push(card)
    s.compactedThrough = card.to
    s.tokens = turns
      .filter((t) => t.turn > s.compactedThrough)
      .reduce((sum, t) => sum + estimateTokens(`${t.user} ${t.assistant}`), 0)
    s.index.compactedThrough = s.compactedThrough
    s.index.estimatedTokens = s.tokens
    s.index.lastTurn = s.turn
    guarded(() => writeIndex(root, sessionId, s.index))
    logger.info?.(`[fatfish-memory] compacted turns ${card.from}-${card.to} -> "${card.title}"`)
    return card
  }

  function maybeInjectProfile(session, sessionId) {
    if (!cfg.injectProfile) return
    if (profileSeeded.has(sessionId)) return
    const profile = readProfile(root)
    const card = renderProfileCard(profile)
    if (!card) return
    const event = spliceInbox(session, buildRecallMessage(card), { target: cfg.profileTarget })
    if (event) {
      profileSeeded.add(sessionId)
      logger.info?.('[fatfish-memory] profile card injected')
    }
  }

  function onEvent(session, event) {
    try {
      if (!event || typeof event.type !== 'string') return
      const sessionId = String(session?.header?.id ?? session?.id ?? 'unknown')

      if (isCompactionEvent(event.type)) {
        guarded(() => recordCompaction(root, sessionId, event))
        return
      }

      const buf = bufferOf(sessionId)

      switch (event.type) {
        case 'turn/start':
          buf.user = ''
          buf.assistant = ''
          maybeInjectProfile(session, sessionId)
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
          const turn = {
            turn: buf.turn,
            seq: event.seq,
            ts: Date.now(),
            user: buf.user,
            assistant: buf.assistant,
          }
          if (cfg.archiveTurns) guarded(() => appendTurn(root, sessionId, turn))

          const s = stateOf(sessionId)
          s.turn = buf.turn
          s.tokens += estimateTokens(`${turn.user} ${turn.assistant}`)
          s.index.window = s.index.window ?? DEFAULT_WINDOW
          s.index.createdAt = s.index.createdAt ?? new Date().toISOString()
          s.index.lastTurn = s.turn
          s.index.estimatedTokens = s.tokens
          guarded(() => writeIndex(root, sessionId, s.index))

          maybeCompact(sessionId)
          buf.user = ''
          buf.assistant = ''
          break
        }
        default:
          break
      }
    } catch (error) {
      try { logger.error?.('[fatfish-memory] event handling failed', error) } catch { /* ignore */ }
    }
  }

  const off = ctx.on('session/event', onEvent, { global: true })
  ctx.effect(() => () => {
    try { off?.() } catch { /* ignore */ }
    buffers.clear()
    state.clear()
    profileSeeded.clear()
  })

  logger.info?.(`[fatfish-memory] archiving to ${root} (compactAt=${cfg.compactAt}, writable=${writable})`)
}
