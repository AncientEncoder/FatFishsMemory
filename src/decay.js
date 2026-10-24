/**
 * 记忆衰减。
 *
 * 人是这样记事的：昨天的记得清，半年前的只剩个轮廓。
 * 所以老记忆不是删掉，而是**更难被命中**——检索时降权。
 *
 * 半衰期默认 90 天，最低保留 0.2（再老的东西也不至于完全找不到）。
 */

const DAY = 24 * 60 * 60 * 1000

export function ageInDays(when, now = Date.now()) {
  let ts
  if (typeof when === 'number') ts = when
  else if (typeof when === 'string') {
    // 支持 YYYY-MM-DD 和 ISO 两种
    ts = when.length <= 10 ? Date.parse(`${when}T00:00:00Z`) : Date.parse(when)
  } else ts = NaN
  if (!Number.isFinite(ts)) return null
  return Math.max(0, (now - ts) / DAY)
}

export function decayFactor(when, { now = Date.now(), halfLifeDays = 90, floor = 0.2 } = {}) {
  const days = ageInDays(when, now)
  if (days === null) return 1
  const factor = Math.pow(0.5, days / halfLifeDays)
  return Math.max(floor, Math.min(1, factor))
}
