/**
 * 记忆目录（hot memory）。
 *
 * 人不是靠"被提醒"想起事情的，是靠知道自己脑子里有什么。
 * 这张目录就是给模型的"我知道什么"：极短、只有日期和标题，
 * 需要细节时它会自己去翻。
 *
 * 目标：不超过 200 token，宁短勿长——它每轮都要占着上下文。
 */

export function buildCatalog(cards, { maxEntries = 8, maxChars = 600, recallCommand = '' } = {}) {
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
  // 告诉它"怎么查"——只说"可以查"是不够的，模型不会自己猜命令
  if (recallCommand) lines.push(`（查细节：${recallCommand}）`)

  let text = lines.join('\n')
  if (text.length > maxChars) {
    // 从末尾截断：最近的记忆更重要（但保留"怎么查"那一行）
    const head = lines[0]
    const hint = recallCommand ? lines[lines.length - 1] : null
    const body = lines.slice(1, hint ? lines.length - 1 : lines.length)
    while (body.length > 0 && [head, ...body, hint].filter(Boolean).join('\n').length > maxChars) body.shift()
    text = [head, ...body, hint].filter(Boolean).join('\n')
  }
  return text
}

/** 内容指纹：目录变了才值得再注入一次。 */
export function catalogId(text) {
  let h = 2166136261
  const str = String(text || '')
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fatfish-catalog-${(h >>> 0).toString(16)}`
}

/** 系统消息的形状，照抄 runtime 自己注册 system prompt 的那条。 */
export function buildCatalogMessage(text, { turn = 0, step = 1, id = catalogId(text) } = {}) {
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
