// User profile: preferences, habits, emotional patterns, active projects.
// Design rule: the profile is plain JSON + a human-readable card. The user can
// open it, edit it, or delete a line — memory you cannot see is memory you cannot trust.

export const SECTIONS = ['identity', 'preferences', 'habits', 'emotions', 'projects', 'recent']

const SECTION_LABELS = {
  identity: '身份',
  preferences: '偏好',
  habits: '习惯',
  emotions: '情绪',
  projects: '在做的事',
  recent: '最近',
}

/** 「最近」只留一条：它是会过期的那种记忆，堆起来就是噪音。 */
const ROLLING = new Set(['recent'])

export function emptyProfile(now = new Date()) {
  const sections = {}
  for (const name of SECTIONS) sections[name] = []
  return { version: 1, updatedAt: new Date(now).toISOString(), sections }
}

export function addFact(profile, section, text, { source = 'chat', now = new Date() } = {}) {
  if (!SECTIONS.includes(section)) throw new Error(`unknown profile section: ${section}`)
  const clean = String(text || '').trim()
  if (!clean) return profile
  const list = profile.sections[section]

  // 「最近」是滚动的：只保留最新一条，过期的不留。
  if (ROLLING.has(section)) {
    profile.sections[section] = [{
      text: clean,
      source,
      at: new Date(now).toISOString().slice(0, 10),
      hits: 1,
    }]
    profile.updatedAt = new Date(now).toISOString()
    return profile
  }

  // Same fact twice in a row is noise; update its timestamp instead of duplicating.
  const existing = list.find((item) => item.text === clean)
  if (existing) {
    existing.at = new Date(now).toISOString().slice(0, 10)
    existing.hits = (existing.hits || 1) + 1
  } else {
    list.push({ text: clean, source, at: new Date(now).toISOString().slice(0, 10), hits: 1 })
  }
  profile.updatedAt = new Date(now).toISOString()
  return profile
}

/** Render the card that gets injected into the next request. Keep it small. */
export function renderProfileCard(profile, { maxChars = 600 } = {}) {
  if (!profile || !profile.sections) return ''
  const lines = ['[用户画像] 你对这个人已知：']
  for (const name of SECTIONS) {
    const items = profile.sections[name] || []
    if (items.length === 0) continue
    // Keep the earliest fact (usually the stable one: who they are) plus the
    // newest few (what changed recently). Dropping the head loses identity.
    const picked = items.length <= 4 ? items : [items[0], ...items.slice(-3)]
    const text = picked
      .map((item) => (item.text.length > 40 ? `${item.text.slice(0, 40)}…` : item.text))
      .join('；')
    lines.push(`- ${SECTION_LABELS[name]}：${text}`)
  }
  if (lines.length === 1) return ''
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`
  return out
}

/** Markdown view for humans; the JSON stays the source of truth. */
export function renderProfileMarkdown(profile) {
  const lines = ['# 用户画像', '', `> 自动维护，可直接编辑；本文件由 FatFishsMemory 读取。更新时间：${profile.updatedAt}`, '']

  // 「最近」放在最前面：它是最容易过期、也最该被先看到的一行。
  const recent = (profile.sections.recent || [])[0]
  if (recent) {
    lines.push('## 最近', '', `**${recent.text}**  \`${recent.at}\``, '')
  }

  for (const name of SECTIONS) {
    if (ROLLING.has(name)) continue
    lines.push(`## ${SECTION_LABELS[name]}`, '')
    const items = profile.sections[name] || []
    if (items.length === 0) lines.push('_(空)_')
    for (const item of items) lines.push(`- ${item.text}  \`${item.at}${item.hits > 1 ? ` ×${item.hits}` : ''}\``)
    lines.push('')
  }
  return lines.join('\n')
}
