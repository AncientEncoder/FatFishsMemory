/**
 * 标题自愈：历史卡片里那些"来吧""要""35米"重新取一个像样的标题。
 *
 * 跟 heal.js 一个思路——与其让人工跑脚本、还要挑停机窗口，
 * 不如每次加载时顺手修一下：**改完了才有意义，改不了也无害**。
 */
import { pickTitle } from './compact.js'

/** 标题是不是"没有信息量"的那种。 */
export function isWeakTitle(title) {
  const t = String(title || '').trim()
  if (!t) return true
  if (t === '(无标题)') return true
  return t.length < 4
}

/**
 * @param {object} index  记忆索引
 * @param {Array} turns   该会话的全部轮次（用来重新取标题）
 * @returns {{index: object, changed: number}}
 */
export function retitleIndex(index, turns) {
  const entries = index?.entries
  if (!Array.isArray(entries) || !entries.length) return { index, changed: 0 }
  const byTurn = new Map()
  for (const t of Array.isArray(turns) ? turns : []) {
    if (t && typeof t.turn === 'number') byTurn.set(t.turn, t)
  }

  let changed = 0
  const next = {
    ...index,
    entries: entries.map((card) => {
      if (!isWeakTitle(card?.title)) return card
      const slice = []
      for (let i = Number(card.from) || 0; i <= (Number(card.to) || 0); i++) {
        const t = byTurn.get(i)
        if (t) slice.push(t)
      }
      if (!slice.length) return card
      const title = pickTitle(slice)
      if (!title || title === card.title) return card
      changed += 1
      return { ...card, title }
    }),
  }
  return { index: next, changed }
}
