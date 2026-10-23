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
 * Push one message into a session's pending queue.
 * Returns the created event, or null when the session does not expose append().
 */
export function spliceInbox(session, message, { target = 'next-turn', index } = {}) {
  if (!session || typeof session.append !== 'function') return null
  const inbox = session.inbox?.() ?? session.inbox ?? null
  const list = Array.isArray(inbox?.[target]) ? inbox[target] : []
  const start = Number.isInteger(index) ? index : list.length
  return session.append('agent/inbox/spliced', {
    target,
    start,
    removedCount: 0,
    inserted: [message],
  })
}