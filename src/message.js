/**
 * 把 DSH 的 content 块数组拍平成纯文本。
 *
 * 两个坑（都是从 runtime 源码里确认的）：
 * 1. user/message 的 event.data 就是 message 本身；assistant/message 是 { turn, step, message }。
 * 2. content 里除了 text 块，还有 reasoning / thinking 块——那是模型的思考过程，
 *    不是回答，不能混进归档里。
 */

const TEXT_TYPES = new Set(['text', 'output_text', 'input_text'])

function partText(part) {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''
  const type = part.type
  if (type && !TEXT_TYPES.has(type)) return ''
  return part.text ?? ''
}

export function contentToText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map(partText).filter(Boolean).join('')
}

/** 兼容两种事件形状：data 是 message，或 data.message 是 message。 */
export function messageText(data) {
  if (!data || typeof data !== 'object') return ''
  const message = data.message ?? data
  return contentToText(message?.content)
}

/** 轮次号优先用 runtime 给的 turn，缺失才回退到自增。 */
export function turnNumber(data, fallback) {
  const value = data?.turn
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

/**
 * DSH 每轮都会注入一条 source.kind === 'runtime-context' 的 user/message
 * （时间、时区、工作目录之类）。它不是人说的话，不能当成"用户输入"归档，
 * 否则真正的提问会被它覆盖掉。
 */
export function isRuntimeContext(data) {
  if (!data || typeof data !== 'object') return false
  const source = data.source ?? data.message?.source
  return source?.kind === 'runtime-context'
}

