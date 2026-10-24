/**
 * 保留策略。
 *
 * 卡片是要常驻的（目录、召回都要扫），所以不能无限涨。
 * 超过上限时，把最老的那批挪进 `archive/index-<日期>.json`——
 * **不是删除**，只是不再参与日常检索；需要考古时还能翻。
 */

export function splitForRetention(entries, { maxCards = 300 } = {}) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length <= maxCards) return { kept: list, dropped: [] }
  const cut = list.length - maxCards
  return { kept: list.slice(cut), dropped: list.slice(0, cut) }
}
