/**
 * 记忆目录（hot memory）。
 *
 * 人不是靠"被提醒"想起事情的，是靠知道自己脑子里有什么。
 * 这张目录就是给模型的"我知道什么"：极短、只有日期和标题，
 * 需要细节时它会自己去翻。
 *
 * 目标：不超过 200 token，宁短勿长——它每轮都要占着上下文。
 */

import { randomUUID } from 'node:crypto'

export function buildCatalog(cards, { maxEntries = 8, maxChars = 600 } = {}) {
  const list = (cards || []).filter(Boolean)
  if (list.length === 0) return ''

  const recent = list.slice(-maxEntries)
  const lines = ['[记忆目录] 你之前经历过这些（细节需要时再查）：']
  for (const card of recent) {
    const title = String(card.title || '').trim()
    if (!title) continue
    const date = card.date ? `${card.date} ` : ''
    lines.push(`- ${date}${title}`)
  }
  if (lines.length === 1) return ''

  let text = lines.join('\n')
  if (text.length > maxChars) {
    // 从末尾截断：最近的记忆更重要
    const head = lines[0]
    const body = lines.slice(1)
    while (body.length > 0 && (head + '\n' + body.join('\n')).length > maxChars) body.shift()
    text = [head, ...body].join('\n')
  }
  return text
}

/** 系统消息的形状，照抄 runtime 自己注册 system prompt 的那条。 */
export function buildCatalogMessage(text, { turn = 0, step = 1, id = `fatfish-catalog-${randomUUID()}` } = {}) {
  return {
    event: 'system/message',
    data: {
      turn,
      step,
      message: {
        id,
        role: 'system',
        // system/message 的 source 必须归 system-prompt 所有；用 plugin:* 会被
        // Session 校验拒绝（“message must have system-prompt source”）。
        source: { kind: 'system-prompt' },
        content: [{ type: 'text', text }],
      },
    },
  }
}
