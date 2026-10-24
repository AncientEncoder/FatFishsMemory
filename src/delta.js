/**
 * 冷层的增量存储。
 *
 * 想法来自最初那张图：「同一件事做多了，diff 的压缩能力更强」。
 * 对话里最常见的重复就是：一样的开场、一样的结尾、只改中间几个字。
 *
 * 这里做的是**前缀 / 后缀 delta**：
 *   找到上一段最像的文字 → 只存"共同前缀长度 + 共同后缀长度 + 中间那段"。
 * 比整段存省得多，而且解码不用 bring 任何依赖。
 *
 * 判断值不值得：中间那段必须比原文短 40% 以上，否则老实存原文。
 */

const MIN_SHARED = 24
const MIN_SAVING = 0.4

function commonPrefix(a, b) {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a[i] === b[i]) i += 1
  return i
}

function commonSuffix(a, b, limit) {
  const max = Math.min(a.length, b.length) - limit
  let i = 0
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1
  return i
}

/**
 * @returns {{ pre: number, suf: number, mid: string, saved: number } | null}
 */
export function makeDelta(baseText, text) {
  const base = String(baseText || '')
  const next = String(text || '')
  if (!base || !next) return null
  if (next.length < 80) return null

  const pre = commonPrefix(base, next)
  const suf = pre >= next.length ? 0 : commonSuffix(base, next, pre)
  if (pre + suf < MIN_SHARED) return null

  const mid = next.slice(pre, next.length - suf)
  const saved = 1 - mid.length / next.length
  if (saved < MIN_SAVING) return null
  return { pre, suf, mid, saved }
}

export function applyDelta(baseText, delta) {
  const base = String(baseText || '')
  const { pre = 0, suf = 0, mid = '' } = delta || {}
  const head = base.slice(0, pre)
  const tail = suf ? base.slice(base.length - suf) : ''
  return `${head}${mid}${tail}`
}

/** 在候选里挑"前缀最长"的那条当基准。 */
export function pickBase(candidates, text) {
  const next = String(text || '')
  let best = null
  for (const item of candidates || []) {
    const baseText = typeof item === 'string' ? item : item?.text
    if (!baseText) continue
    const pre = commonPrefix(String(baseText), next)
    if (!best || pre > best.pre) best = { ref: item, text: baseText, pre }
  }
  return best
}
