/**
 * 索引自愈。
 *
 * 老版本曾经把 138 轮封成一张卡（没有 span 字段，跨度远超上限）。
 * 这类卡的信息价值极低，还会一直霸占记忆目录。
 *
 * 规则：任务级卡片如果**没有 span 且跨度超过上限**，就丢掉它，
 * 并把游标退回它的起点——让后续的封卡重新算，原文本来也还在。
 */

export function healIndex(index, { maxTurnsPerTask = 12 } = {}) {
  const source = index && typeof index === 'object' ? index : {}
  const entries = Array.isArray(source.entries) ? source.entries : []
  let compactedThrough = Number.isInteger(source.compactedThrough) ? source.compactedThrough : 0

  const dropped = []
  const kept = entries.filter((card) => {
    const from = Number(card?.from)
    const to = Number(card?.to)
    const span = Number(card?.span)
    // 只清"任务级"的历史坏卡：早期压力压缩留下来的卡没有 cut 字段，不能动
    const oversized = card?.cut === 'task'
      && !Number.isFinite(span)
      && Number.isFinite(from) && Number.isFinite(to)
      && (to - from + 1) > maxTurnsPerTask
    if (oversized) {
      dropped.push(card)
      return false
    }
    return true
  })

  if (dropped.length === 0) {
    return { index: source, compactedThrough, changed: false, dropped: [] }
  }

  const earliest = Math.min(...dropped.map((c) => Number(c.from)).filter(Number.isFinite))
  if (Number.isFinite(earliest)) {
    // 退到这张卡开始之前，让重封从那里接着来
    compactedThrough = Math.max(0, Math.min(compactedThrough, earliest - 1))
  }

  return {
    index: { ...source, entries: kept, compactedThrough },
    compactedThrough,
    changed: true,
    dropped,
  }
}
