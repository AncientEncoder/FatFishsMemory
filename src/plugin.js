import os from 'node:os'
import path from 'node:path'
import { appendTurn, readIndex, writeIndex, readTurns, readProfile, writeProfile, writeProfileMarkdown, workspaceSlug } from './store.js'
import { estimateTokens, pressureOf } from './pressure.js'
import { makeCard } from './compact.js'
import { isCompactionEvent, recordCompaction } from './compaction.js'
import { emptyProfile, renderProfileCard, renderProfileMarkdown } from './profile.js'
import { createBreaker, ensureDataDir, probeWrite, resolveDataDir, writeWelcome } from './safety.js'
import { collectLegacySessions, migrateToNewDataDir } from './migrate.js'
import { createLogger, resolveDebug } from './log.js'
import { isRuntimeContext, messageText, turnNumber } from './message.js'

export const name = 'dsh-fatfish-memory'
export const inject = []

const DEFAULT_WINDOW = 1048576

export function apply(ctx, config = {}) {
  const cfg = {
    enabled: true,
    dataDir: '',
    compactAt: 0.6,
    // 攒够多少轮才折成一张记忆卡（太小会把对话切得太碎）
    minTurnsPerCard: 6,
    archiveTurns: true,
    // 默认关闭：正常安装保持安静，发布时也保持这个值
    debug: false,
    ...config,
  }
  if (cfg.enabled === false) return

  const debug = resolveDebug(cfg.debug, process.env)

  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const defaultRoot = path.join(dshHome, 'fatfish-memory')

  // 数据目录可配：没配走默认；配了但不可用就回落并警告，绝不静默降级
  const resolved = resolveDataDir({ configured: cfg.dataDir, fallback: defaultRoot })
  const root = resolved.dir

  // debug 模式下同时写文件：事后能查"注入到底有没有发生"
  ensureDataDir(root)
  const log = createLogger({
    debug,
    prefix: '[fatfish-memory]',
    file: debug ? path.join(root, 'debug.log') : null,
  })
  if (resolved.warning) log.warn(resolved.warning)

  // 换了目录且新目录是空的 → 把旧目录整体复制过来（只复制，不删原数据）
  if (resolved.source === 'config') {
    const migration = migrateToNewDataDir({ from: defaultRoot, to: root })
    if (migration.moved) log.warn(`已把旧数据从 ${migration.from} 复制到 ${migration.to}`)
  }

  // ---- first-run safety net -------------------------------------------------
  // A missing or unwritable data directory must degrade to read-only instead of
  // throwing once per turn: someone installing this for the first time should
  // get a working plugin, not a wall of errors.
  const dirReady = ensureDataDir(root)
  const writable = dirReady && probeWrite(root)
  if (!dirReady) {
    log.error(`无法创建数据目录 ${root}，本次会话只读运行`)
    cfg.archiveTurns = false
  } else if (!writable) {
    log.error(`数据目录不可写 ${root}，已关闭归档，仅保留内存统计`)
    cfg.archiveTurns = false
  } else {
    writeWelcome(root)
    let profile = readProfile(root)
    if (!profile) {
      try {
        profile = writeProfile(root, emptyProfile())
      } catch { /* 首次写入失败不致命 */ }
    }
    // 画像落盘成 markdown：人和 agent 都能直接读，取代原来的 splice 注入
    if (profile) {
      try { writeProfileMarkdown(root, renderProfileMarkdown(profile)) } catch { /* ignore */ }
    }
    const legacy = collectLegacySessions(root)
    if (legacy > 0) log.warn(`已把 ${legacy} 个旧的平铺会话目录收进 _legacy/`)
  }

  const breaker = createBreaker({
    limit: 3,
    onOpen: (error) => {
      cfg.archiveTurns = false
      log.error('连续写入失败，已停止落盘（本次会话）：', error?.message ?? error)
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
  const workspaces = new Map()

  /** 会话所属工作区：取 cwd 的最后一段；拿不到就归到 _unknown。 */
  function workspaceOf(session, sessionId) {
    let ws = workspaces.get(sessionId)
    if (!ws) {
      ws = workspaceSlug(session?.header?.cwd ?? session?.cwd)
      workspaces.set(sessionId, ws)
    }
    return ws
  }

  function bufferOf(sessionId) {
    let buf = buffers.get(sessionId)
    if (!buf) {
      buf = { user: '', assistant: '', turn: 0 }
      buffers.set(sessionId, buf)
    }
    return buf
  }

  function stateOf(sessionId, workspace) {
    let s = state.get(sessionId)
    if (!s) {
      const index = readIndex(root, sessionId, workspace)
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

  function maybeCompact(sessionId, workspace) {
    const s = stateOf(sessionId, workspace)
    s.index.entries = s.index.entries || []
    const pressure = pressureOf(s.tokens, s.index.window ?? DEFAULT_WINDOW)
    if (pressure < cfg.compactAt) return null

    const turns = readTurns(root, sessionId, workspace)
    const pending = turns.filter((t) => t.turn > s.compactedThrough)
    if (pending.length < cfg.minTurnsPerCard) return null

    const cut = Math.floor(pending.length / 2)
    const slice = pending.slice(0, cut)
    // 用切片里真实的轮次号，不要用游标+1——跨重启时游标和轮次号是两套计数
    const card = makeCard(slice, {
      from: slice[0].turn,
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
    guarded(() => writeIndex(root, sessionId, s.index, workspace))
    log.info(`compacted turns ${card.from}-${card.to} -> "${card.title}"`)
    return card
  }

  // 记忆注入已下线。
  //
  // 曾经用 session.append('agent/inbox/spliced', ...) 把画像塞进下一轮，
  // 但运行时会给消息打上 source.kind = "plugin:<name>"，这条消息会进入
  // 会话事件流。一旦客户端渲染不了这种来源，整个对话区就会白屏——
  // 一条消息能毁掉一个会话，风险不对称。
  //
  // 现在改为：画像落盘（profile.md），由 agent 在需要时主动读取。
  // 文件坏了顶多读不到，不会破坏任何东西。

  function onEvent(session, event) {
    try {
      if (!event || typeof event.type !== 'string') return
      const sessionId = String(session?.header?.id ?? session?.id ?? 'unknown')
      const workspace = workspaceOf(session, sessionId)
      log.debug(`event ${event.type} seq=${event.seq} session=${sessionId} ws=${workspace}`)

      if (isCompactionEvent(event.type)) {
        guarded(() => recordCompaction(root, sessionId, event, workspace))
        log.info(`recorded ${event.type}`)
        return
      }

      const buf = bufferOf(sessionId)

      switch (event.type) {
        case 'turn/start':
          // 注意：不要清 buf.user。新进程启动时排队的用户消息会先于 turn/start
          // 到达，这里清空会把真正的提问抹掉（曾经导致归档里 user 全空）。
          buf.assistant = ''
          buf.turn = turnNumber(event.data, buf.turn + 1)
          break
        case 'user/message': {
          // 时间/工作区这类 runtime-context 注入不是人说的话，跳过
          if (isRuntimeContext(event.data)) {
            log.debug('skipped runtime-context message')
            break
          }
          const text = messageText(event.data)
          if (text) buf.user = buf.user ? `${buf.user}\n${text}` : text
          break
        }
        case 'assistant/message': {
          const text = messageText(event.data)
          if (text) buf.assistant = buf.assistant ? `${buf.assistant}\n${text}` : text
          break
        }
        case 'turn/end': {
          if (!buf.user && !buf.assistant) return
          buf.turn = turnNumber(event.data, buf.turn)
          const turn = {
            turn: buf.turn,
            seq: event.seq,
            ts: Date.now(),
            user: buf.user,
            assistant: buf.assistant,
          }
          if (cfg.archiveTurns) guarded(() => appendTurn(root, sessionId, turn, workspace))

          const s = stateOf(sessionId, workspace)
          s.turn = buf.turn
          s.tokens += estimateTokens(`${turn.user} ${turn.assistant}`)
          s.index.window = s.index.window ?? DEFAULT_WINDOW
          s.index.createdAt = s.index.createdAt ?? new Date().toISOString()
          s.index.workspace = workspace
          s.index.cwd = session?.header?.cwd ?? null
          s.index.lastTurn = s.turn
          s.index.estimatedTokens = s.tokens
          guarded(() => writeIndex(root, sessionId, s.index, workspace))

          if (debug) {
            const pressure = pressureOf(s.tokens, s.index.window)
            log.debug(`turn ${s.turn} archived, tokens=${s.tokens}, pressure=${(pressure * 100).toFixed(1)}%`)
          }

          maybeCompact(sessionId, workspace)
          buf.user = ''
          buf.assistant = ''
          break
        }
        default:
          break
      }
    } catch (error) {
      log.error('event handling failed:', error?.stack ?? error?.message ?? String(error))
    }
  }

  const off = ctx.on('session/event', onEvent, { global: true })
  ctx.effect(() => () => {
    try { off?.() } catch { /* ignore */ }
    buffers.clear()
    state.clear()
  })

  // 启动横幅也受 debug 控制：正常安装不打扰
  log.info(`archiving to ${root} (compactAt=${cfg.compactAt}, writable=${writable}, debug=${debug})`)
}
