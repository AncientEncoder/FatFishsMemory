import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendTurn, readIndex, writeIndex, readTurns, readProfile, writeProfile, writeProfileMarkdown, workspaceSlug, archiveCards } from './store.js'
import { estimateTokens, pressureOf } from './pressure.js'
import { makeCard } from './compact.js'
import { isCompactionEvent, recordCompaction } from './compaction.js'
import { emptyProfile, renderProfileCard, renderProfileMarkdown } from './profile.js'
import { applyRecentSignal, applyStableFacts, detectRecentSignal, findStableFacts } from './impressions.js'
import { createBreaker, ensureDataDir, probeWrite, resolveDataDir, writeWelcome } from './safety.js'
import { collectLegacySessions, migrateToNewDataDir } from './migrate.js'
import { createLogger, resolveDebug } from './log.js'
import { isRuntimeContext, messageText, turnNumber } from './message.js'
import { buildCatalog, buildCatalogMessage, catalogId } from './hotmemory.js'
import { findBoundary } from './boundary.js'
import { splitForRetention } from './retention.js'
import { buildRecallDigest, countIndexHits, hasRecallCue } from './autorecall.js'
import { sealOverflow, sealTask } from './task.js'
import { healIndex } from './heal.js'

const DEFAULT_WINDOW = 1048576

/** 把回调推到当前任务之后执行（append 有重入保护，回调里不能直接 append）。 */
function defer(fn) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn)
  else setTimeout(fn, 0)
}

export const name = 'dsh-fatfish-memory'
export const inject = []

export function apply(ctx, config = {}) {
  const cfg = {
    enabled: true,
    dataDir: '',
    compactAt: 0.6,
    // 攒够多少轮才折成一张记忆卡（太小会把对话切得太碎）
    minTurnsPerCard: 6,
    archiveTurns: true,
    // 记忆目录：会话开始时把最近的卡片标题塞成一条 system 消息
    hotMemory: true,
    hotMemoryEntries: 8,
    // 卡片保留上限：超出的挪进 archive/，不是删除
    maxCards: 300,
    // 自动查表：回指过去的问题，先翻温层和冷层再回答
    autoRecall: true,
    autoRecallMax: 3,
    // 任务级压缩：一件事做完了当场封卡，不等上下文压力
    taskCompaction: true,
    minTurnsPerTask: 3,
    // 单张任务卡最多覆盖多少轮（防止隔太久后封出一张巨卡）
    maxTurnsPerTask: 12,
    // 兜底：待封轮数超过这个值就强制封卡（闲聊永远等不到"完成语"）
    maxPendingTurns: 30,
    // 自动更新画像印象：「最近」看当下语气，「长期」看反复出现
    impressions: true,
    // 「最近」最多多久更新一次（毫秒），默认一小时
    recentEveryMs: 60 * 60 * 1000,
    // 换 dataDir 时是否自动从旧目录复制数据
    migrate: true,
    // 默认关闭：正常安装保持安静，发布时也保持这个值
    debug: false,
    ...config,
  }
  if (cfg.enabled === false) return

  const debug = resolveDebug(cfg.debug, process.env)

  // 目录里告诉模型"怎么查"：命令写死成绝对路径，模型不用猜
  const here = path.dirname(fileURLToPath(import.meta.url))
  const recallCommand = cfg.recallHint === false
    ? ''
    : `node "${path.join(here, '..', 'tools', 'recall.mjs')}" "关键词"`

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
  // migrate: false 可关闭（测试用临时目录时需要，否则会把真实数据拷进去）
  if (cfg.migrate !== false && resolved.source === 'config') {
    const migration = migrateToNewDataDir({ from: defaultRoot, to: root })
    if (migration.moved) log.warn(`已把旧数据从 ${migration.from} 复制到 ${migration.to}`)
  }

  // ---- first-run safety net -------------------------------------------------
  // A missing or unwritable data directory must degrade to read-only instead of
  // throwing once per turn: someone installing this for the first time should
  // get a working plugin, not a wall of errors.
  // 人设文件：目录里指路，让"我是谁"和"怎么查"一样随手可得
  const personaLHint = cfg.persona === false ? '' : path.join(root, 'persona.md')
  let profile = null
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
    profile = readProfile(root)
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

  /** 画像落盘（JSON + markdown）。失败不致命。 */
  function saveProfile() {
    if (!profile) return
    try {
      writeProfile(root, profile)
      writeProfileMarkdown(root, renderProfileMarkdown(profile))
    } catch (error) {
      log.error('profile write failed:', error?.message ?? error)
    }
  }

  /**
   * 「最近」层：看当下的语气。
   * 节流管的是「多久才允许换一次最近印象」——不是「多久检查一次」。
   * 所以只有真的写入了才更新时间戳；没命中就什么都不记，下一轮继续看。
   */
  function maybeUpdateRecent(buf) {
    if (!cfg.impressions || !profile) return
    const lastApplied = profile.meta?.lastRecentAt ? Date.parse(profile.meta.lastRecentAt) : 0
    const now = Date.now()
    if (Number.isFinite(lastApplied) && lastApplied > 0 && now - lastApplied < cfg.recentEveryMs) return

    const signal = detectRecentSignal((buf.userLines || []).map((text) => ({ user: text })))
    if (!signal) return
    if (!applyRecentSignal(profile, signal)) return
    profile.meta = { ...(profile.meta || {}), lastRecentAt: new Date(now).toISOString() }
    saveProfile()
    log.info(`recent updated: ${signal.text}`)
  }

  /**
   * 长期层：跨卡片找反复出现的事实。
   * 只在压缩出新卡片之后跑，避免每次结束都扫全量。
   */
  function maybePromoteFacts(entries) {
    if (!cfg.impressions || !profile) return
    const facts = findStableFacts(entries)
    const added = applyStableFacts(profile, facts)
    if (!added) return
    saveProfile()
    log.info(`promoted ${added} stable facts into the profile`)
  }

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
  const catalogInjected = new Map()
  const recallInjected = new Map()

  /**
   * 记忆目录：把最近的记忆卡标题作为一条 system 消息注入。
   * 用 system/message 而不是 user/message —— 它是运行时注册系统提示的通道，
   * 客户端有专门的处理路径；而 plugin:* 的 user 消息会污染对话流。
   *
   * 去重按**内容指纹**：目录没变就不重复注入，新卡片出现后自动刷新一次。
   */
  function maybeInjectCatalog(session, sessionId, workspace, turn, step = 1) {
    if (!cfg.hotMemory) return
    const s = stateOf(sessionId, workspace)
    const entries = s.index.entries || []
    const text = buildCatalog(entries, { maxEntries: cfg.hotMemoryEntries, recallCommand, personaLHint })
    if (!text) return

    const id = catalogId(text)
    if (catalogInjected.get(sessionId) === id) return
    if (hasCatalogMessage(session, id)) {
      catalogInjected.set(sessionId, id)
      return
    }

    catalogInjected.set(sessionId, id)
    defer(() => {
      try {
        const { event, data } = buildCatalogMessage(text, { turn, step })
        // system/message 是 surface-eligible 事件，必须带 surfaceOp 标记，
        // 且只能在 turn/step 已打开、且系统提示已经占住 surface head 时追加。
        session.append(event, data, { surfaceOp: 'append' })
        log.info(`catalog injected (${text.length} chars, ${entries.length} cards, id ${id})`)
      } catch (error) {
        log.error('catalog injection failed:', error?.stack ?? error?.message ?? String(error))
      }
    })
  }

  /**
   * 自动查表：「先看看温备，没有就照旧」。
   *
   * 只在两件事同时成立时才动手：这句话像是在回指过去，而且温层里确实有相关记录。
   * 查不到就什么都不做——宁可不提示，也不塞无关记忆。
   */
  function maybeAutoRecall(session, sessionId, workspace, query, turn, step) {
    if (!cfg.autoRecall || !query) return
    if (recallInjected.get(sessionId) === turn) return

    const s = stateOf(sessionId, workspace)
    const cards = s.index.entries || []
    // 第一道闸：有回指线索才查；没有线索时，至少命中 2 个目录关键词才算数
    // （单个关键词太容易撞上，比如"重启"——那只会带来噪音）
    if (!hasRecallCue(query) && countIndexHits(cards, query) < 2) return
    recallInjected.set(sessionId, turn)

    defer(() => {
      try {
        const recent = turnsOf(sessionId, workspace).slice(-200)
        const { text } = buildRecallDigest(query, { cards, turns: recent, limit: cfg.autoRecallMax })
        if (!text) return
        session.append('system/message', {
          turn,
          step,
          message: {
            id: `fatfish-recall-${catalogId(text)}`,
            role: 'system',
            source: { kind: 'system-prompt' },
            content: [{ type: 'text', text }],
          },
        }, { surfaceOp: 'append' })
        log.info(`auto-recall injected (${text.length} chars)`)
      } catch (error) {
        log.error('auto-recall failed:', error?.stack ?? error?.message ?? String(error))
      }
    })
  }

  /**
   * surface 上是否已经有 system/message。
   * 新会话的第一步里，runtime 会先追加主系统提示；在它之前追加 catalog
   * 会抢占 protected surface head，导致后续系统提示替换错位。
   */
  function hasSystemPrompt(session) {
    try {
      const nodes = session?.surface?.nodes
      if (!Array.isArray(nodes)) return false
      return nodes.some((seq) => session.eventAt?.(seq)?.type === 'system/message')
    } catch {
      return false
    }
  }

  /** 已落盘的 catalog 用内容指纹识别：同一个指纹说明目录没变，不用再注入。 */
  function hasCatalogMessage(session, id) {
    try {
      const nodes = session?.surface?.nodes
      if (!Array.isArray(nodes)) return false
      return nodes.some((seq) => {
        const event = session.eventAt?.(seq)
        if (event?.type !== 'system/message') return false
        return event.data?.message?.id === id
      })
    } catch {
      return false
    }
  }

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
      buf = { user: '', assistant: '', turn: 0, step: 1, tools: [], userLines: [] }
      buffers.set(sessionId, buf)
    }
    return buf
  }

  function stateOf(sessionId, workspace) {
    let s = state.get(sessionId)
    if (!s) {
      const index = readIndex(root, sessionId, workspace)
      // 自愈：老版本留下的"超大任务卡"（没有 span 且跨度超过上限）在建状态时清掉，
      // 并把游标退回到它的起点，让后面的封卡重新算。
      const healed = healIndex(index, cfg.maxTurnsPerTask)
      s = {
        index: healed.index,
        turn: index.lastTurn ?? 0,
        compactedThrough: healed.compactedThrough,
        tokens: index.estimatedTokens ?? 0,
        // 内存里的轮次缓存：懒加载，之后每轮追加，避免每轮全量读 turns.jsonl
        turns: null,
      }
      if (healed.changed) guarded(() => writeIndex(root, sessionId, healed.index, workspace))
      state.set(sessionId, s)
    }
    return s
  }

  /** 取某个会话的轮次（内存缓存，冷启动时才读盘）。 */
  function turnsOf(sessionId, workspace) {
    const s = stateOf(sessionId, workspace)
    if (!Array.isArray(s.turns)) s.turns = readTurns(root, sessionId, workspace)
    return s.turns
  }

  function maybeCompact(sessionId, workspace) {
    const s = stateOf(sessionId, workspace)
    s.index.entries = s.index.entries || []
    const pressure = pressureOf(s.tokens, s.index.window ?? DEFAULT_WINDOW)
    if (pressure < cfg.compactAt) return null

    const turns = turnsOf(sessionId, workspace)
    const pending = turns.filter((t) => t.turn > s.compactedThrough)
    if (pending.length < cfg.minTurnsPerCard) return null

    const boundary = findBoundary(pending, { minTurns: cfg.minTurnsPerCard })
    const slice = pending.slice(0, boundary.index)
    // 用切片里真实的轮次号，不要用游标+1——跨重启时游标和轮次号是两套计数
    const card = makeCard(slice, {
      from: slice[0].turn,
      to: slice[slice.length - 1].turn,
    })
    // 记下是怎么切的：detected（找到任务边界）/ fallback（没找到，对半切）
    card.cut = boundary.reason
    card.cutScore = Number(boundary.score.toFixed(2))
    s.index.entries.push(card)
    s.compactedThrough = card.to
    s.tokens = turns
      .filter((t) => t.turn > s.compactedThrough)
      .reduce((sum, t) => sum + estimateTokens(`${t.user} ${t.assistant}`), 0)
    s.index.compactedThrough = s.compactedThrough
    s.index.estimatedTokens = s.tokens
    s.index.lastTurn = s.turn

    // 卡片不能无限涨：超上限时把最老的挪进 archive/（不是删除）
    const { kept, dropped } = splitForRetention(s.index.entries, { maxCards: cfg.maxCards })
    if (dropped.length) {
      s.index.entries = kept
      guarded(() => archiveCards(root, sessionId, dropped, workspace))
      log.info(`retention: moved ${dropped.length} old cards to archive/`)
    }

    guarded(() => writeIndex(root, sessionId, s.index, workspace))
    // 新卡片落盘后，看看有没有反复出现的事实值得提升为长期印象
    guarded(() => maybePromoteFacts(s.index.entries))
    log.info(`compacted turns ${card.from}-${card.to} -> "${card.title}"`)
    return card
  }

  /**
   * 任务级压缩：这一轮的回答明确收尾，而且攒够了几轮，就当场封卡。
   * 不等压力阈值——"这件事做完了"本身就是最好的压缩时机。
   */
  function maybeSealTask(sessionId, workspace) {
    if (!cfg.taskCompaction) return null
    const s = stateOf(sessionId, workspace)
    const turns = turnsOf(sessionId, workspace)
    const pending = turns.filter((t) => t.turn > s.compactedThrough)
    if (pending.length < cfg.minTurnsPerTask) return null

    // 优先按"任务完成"封卡；攒太多还没等到完成语（比如一直闲聊），兜底封一张
    const sealed = sealTask(pending, { minTurns: cfg.minTurnsPerTask, maxTurns: cfg.maxTurnsPerTask })
      ?? (pending.length > cfg.maxPendingTurns
        ? sealOverflow(pending, { maxTurns: cfg.maxTurnsPerTask })
        : null)
    if (!sealed) return null

    s.index.entries = s.index.entries || []
    s.index.entries.push(sealed.card)
    s.compactedThrough = sealed.to
    s.index.compactedThrough = sealed.to
    s.tokens = turns
      .filter((t) => t.turn > sealed.to)
      .reduce((sum, t) => sum + estimateTokens(`${t.user} ${t.assistant}`), 0)
    s.index.estimatedTokens = s.tokens
    s.index.lastTurn = s.turn

    const { kept, dropped } = splitForRetention(s.index.entries, { maxCards: cfg.maxCards })
    if (dropped.length) {
      s.index.entries = kept
      guarded(() => archiveCards(root, sessionId, dropped, workspace))
    }

    guarded(() => writeIndex(root, sessionId, s.index, workspace))
    guarded(() => maybePromoteFacts(s.index.entries))
    log.info(`task sealed: turns ${sealed.from}-${sealed.to} -> "${sealed.card.title}"`)
    return sealed.card
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
          buf.tools = []
          buf.turn = turnNumber(event.data, buf.turn + 1)
          break
        case 'tool/call': {
          // 记录这一轮用过哪些工具，用来生成卡片的 actions
          const name = event.data?.name
          if (typeof name === 'string' && name) buf.tools.push(name)
          break
        }
        case 'step/start': {
          // system/message 必须落在已打开的 turn/step 内；turn/start 时 step
          // 还没开始，追加会被 “does not match an open turn and step” 拒绝。
          // 新会话此时可能还没有主系统提示，先等 system/message 事件。
          const turn = turnNumber(event.data, buf.turn)
          const step = Number.isInteger(event.data?.step) && event.data.step > 0 ? event.data.step : 1
          buf.turn = turn
          buf.step = step
          if (hasSystemPrompt(session)) {
            maybeInjectCatalog(session, sessionId, workspace, turn, step)
            // 「干事之前先看看温备」：拿这一轮最后一句人话去查表
            const query = (buf.userLines || []).slice(-1)[0] || ''
            maybeAutoRecall(session, sessionId, workspace, query, turn, step)
          }
          break
        }
        case 'system/message': {
          // 新会话的主系统提示在这里落盘；它成为 protected head 后再注入 catalog。
          if (event.data?.message?.source?.kind === 'system-prompt') {
            const turn = turnNumber(event.data, buf.turn)
            const step = Number.isInteger(event.data?.step) && event.data.step > 0 ? event.data.step : 1
            maybeInjectCatalog(session, sessionId, workspace, turn, step)
          }
          break
        }
        case 'user/message': {
          // 时间/工作区这类 runtime-context 注入不是人说的话，跳过
          if (isRuntimeContext(event.data)) {
            log.debug('skipped runtime-context message')
            break
          }
          const text = messageText(event.data)
          if (text) {
            buf.user = buf.user ? `${buf.user}\n${text}` : text
            // 留一小段最近的人话，用来判断「当下的状态」
            buf.userLines.push(text)
            if (buf.userLines.length > 12) buf.userLines.shift()
          }
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
            tools: [...new Set(buf.tools)],
          }
          if (cfg.archiveTurns) {
            // 把内存里的最近轮次当增量基准，省掉每次追加都全量读文件
            const cached = stateOf(sessionId, workspace).turns
            const recent = Array.isArray(cached) ? cached.slice(-20) : undefined
            guarded(() => appendTurn(root, sessionId, turn, workspace, { recent }))
            // 同步进内存缓存（没加载过就不管，下一次读盘时会自然带上）
            if (Array.isArray(cached)) cached.push(turn)
          }

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
          // 任务级压缩：这件事收尾了就当场封卡（不等压力）
          guarded(() => maybeSealTask(sessionId, workspace))
          // 「最近」印象：看这一轮的语气有没有时间/状态线索（内部有一小时节流）
          guarded(() => maybeUpdateRecent(buf))
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
