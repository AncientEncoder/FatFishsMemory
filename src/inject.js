// Injecting into the pending input queue.
// Confirmed against the DSH runtime: session.append("agent/inbox/spliced", splice)
// with splice = { target: "next-turn" | "next-step", start, removedCount, inserted }.
// Message ids must be unique among pending messages, hence the prefix + counter.

let counter = 0

export function nextMessageId(prefix = 'fatfish') {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

export function buildRecallMessage(text, { id = nextMessageId('fatfish-recall') } = {}) {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
  }
}

/**
 * 读当前待发队列。
 * `session.inbox` 可能是函数，也可能是对象——直接 `inbox?.()` 对对象会抛
 * TypeError，这一行曾经让整个注入静默失败。
 */
export function readInbox(session) {
  if (!session) return null
  const inbox = session.inbox
  if (typeof inbox === 'function') {
    try {
      return inbox()
    } catch {
      return null
    }
  }
  return inbox && typeof inbox === 'object' ? inbox : null
}

/**
 * Push one message into a session's pending queue.
 * Returns the created event, or null when the session does not expose append().
 */
export function spliceInbox(session, message, { target = 'next-turn', index } = {}) {
  if (!session || typeof session.append !== 'function') return null
  const inbox = readInbox(session)
  const list = Array.isArray(inbox?.[target]) ? inbox[target] : []
  const start = Number.isInteger(index) ? index : list.length
  return session.append('agent/inbox/spliced', {
    target,
    start,
    removedCount: 0,
    inserted: [message],
  })
}
