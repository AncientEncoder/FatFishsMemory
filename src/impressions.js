import { addFact } from './profile.js'

/**
 * 印象的自动更新规则。
 *
 * 分两层，触发方式完全不同：
 *
 *   最近（recent）  ← 看"当下的语气"：今天/明天/心情/累/烦
 *   长期（五类）    ← 看"反复出现"：同一个事实在不同卡片里出现 ≥2 次才算数
 *
 * 宁可不写，也不要写错。两条规则都刻意保守。
 */

// 时间线索
const TIME_CUES = /(今天|明天|后天|今晚|昨晚|这周|下周|最近|刚才|这几天|周末)/
// 状态线索
const MOOD_CUES = /(开心|高兴|爽|舒服|累|困|烦|焦虑|压力|无聊|难受|兴奋|期待|摆烂|加班|生病|不舒服)/

function firstSentence(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/[。！？!?\n]/u)[0]
    .trim()
}

/**
 * 从最近若干轮里挑出最能代表"当下状态"的一句。
 * @returns {{ text: string, score: number } | null}
 */
export function detectRecentSignal(turns, { lookback = 12, minScore = 2, maxChars = 60 } = {}) {
  const list = (Array.isArray(turns) ? turns : []).slice(-lookback)
  let best = null

  for (const turn of list) {
    const line = firstSentence(turn?.user)
    if (!line || line.length < 4 || line.length > 120) continue
    const time = TIME_CUES.test(line) ? 1 : 0
    const mood = MOOD_CUES.test(line) ? 2 : 0
    const score = time + mood
    if (score < minScore) continue
    // 分数高的赢；同分取更近的（后面的覆盖前面的）
    if (!best || score >= best.score) {
      best = { text: line.slice(0, maxChars), score }
    }
  }
  return best
}

// 长期层的归类规则：按"这句话在说什么"落进对应的分区
const CLASSIFIERS = [
  [/喜欢|不喜欢|讨厌|偏爱|更愿意|受不了/, 'preferences'],
  [/每天|总是|一般|平常|习惯|通常|经常/, 'habits'],
  [/焦虑|压力|累|开心|难受|烦|情绪|心情/, 'emotions'],
  [/在做|正在|项目|准备|要做|打算|目标/, 'projects'],
]

function normalize(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?~～…]/g, '')
    .trim()
}

function classify(text) {
  for (const [re, section] of CLASSIFIERS) if (re.test(text)) return section
  return null
}

/**
 * 跨卡片找"反复出现的事实"，提升为长期印象。
 * 只认卡片的目标句（goal），且归一化后完全相同的才算重复。
 *
 * @returns {Array<{ section: string, text: string, count: number }>}
 */
export function findStableFacts(cards, { minCount = 2, maxFacts = 5, maxChars = 80 } = {}) {
  const counts = new Map()
  for (const card of cards || []) {
    const raw = firstSentence(card?.goal || card?.title)
    const key = normalize(raw)
    if (key.length < 6) continue
    const entry = counts.get(key) || { text: raw.slice(0, maxChars), count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }

  const out = []
  for (const entry of counts.values()) {
    if (entry.count < minCount) continue
    // 反复出现但又没明显归类线索的，按"在做的事"处理——重复本身已经是信号
    const section = classify(entry.text) || 'projects'
    out.push({ section, text: entry.text, count: entry.count })
  }
  return out.sort((a, b) => b.count - a.count).slice(0, maxFacts)
}

/** 把稳定事实写进画像（已有的跳过）。返回新增了几条。 */
export function applyStableFacts(profile, facts, { now = new Date() } = {}) {
  let added = 0
  for (const fact of facts || []) {
    const list = profile.sections?.[fact.section] || []
    if (list.some((item) => item.text === fact.text)) continue
    addFact(profile, fact.section, fact.text, { source: 'auto', now })
    added += 1
  }
  return added
}

/** 最近一层：直接覆盖（滚动一行）。 */
export function applyRecentSignal(profile, signal, { now = new Date() } = {}) {
  if (!signal?.text) return false
  const current = (profile.sections?.recent || [])[0]
  if (current && current.text === signal.text) return false
  addFact(profile, 'recent', signal.text, { source: 'auto', now })
  return true
}
