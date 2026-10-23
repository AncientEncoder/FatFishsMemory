// Rough token estimate. Chinese text is ~1 token per 1.5 chars, English ~1 per 4.
// We deliberately over-estimate a little so compaction triggers early rather than late.
export function estimateTokens(text) {
  if (!text) return 0
  const str = String(text)
  let cjk = 0
  for (const ch of str) if (ch.codePointAt(0) >= 0x2e80) cjk += 1
  const latin = str.length - cjk
  return Math.ceil(cjk / 1.4 + latin / 3.8)
}

export function pressureOf(surfaceTokens, contextWindow) {
  if (!contextWindow) return 0
  return surfaceTokens / contextWindow
}