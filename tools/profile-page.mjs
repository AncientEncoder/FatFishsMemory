#!/usr/bin/env node
/**
 * 把画像渲染成一个独立的 HTML 页面（本地打开，不联网、不依赖 DSH）。
 *
 *   node tools/profile-page.mjs
 *   → 生成 ~/.dsh/fatfish-memory/profile.html
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SRC = pathToFileURL(path.join(here, '..', 'src')).href

const { readProfile } = await import(`${SRC}/store.js`)

const LABELS = {
  identity: '身份',
  preferences: '偏好',
  habits: '习惯',
  emotions: '情绪',
  projects: '在做的事',
}
const ORDER = ['identity', 'preferences', 'habits', 'emotions', 'projects']

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const profile = readProfile(ROOT) || { sections: {} }
const recent = (profile.sections.recent || [])[0]

const sections = ORDER.map((key) => {
  const items = profile.sections[key] || []
  const body = items.length
    ? `<ul>${items.map((i) => `<li>${esc(i.text)}<span class="when">${esc(i.at)}${i.hits > 1 ? ` ×${i.hits}` : ''}</span></li>`).join('')}</ul>`
    : '<p class="empty">（空）</p>'
  return `<section><h2>${LABELS[key]}</h2>${body}</section>`
}).join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>印象</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px; min-height: 100vh;
    font: 15px/1.7 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    background: radial-gradient(1200px 600px at 20% -10%, #1b3550 0%, #0d1620 60%, #0a0f14 100%);
    color: #e6edf3;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: .04em; margin: 0 0 4px; }
  .sub { color: #7d8b99; font-size: 12px; margin-bottom: 28px; }
  .recent {
    border: 1px solid #2a4a68; background: linear-gradient(180deg, #12263a, #0e1c2a);
    border-radius: 14px; padding: 18px 20px; margin-bottom: 28px;
  }
  .recent .label { color: #6fa8dc; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
  .recent .text { font-size: 17px; line-height: 1.6; margin-top: 6px; }
  .recent .when { color: #6b7c8c; font-size: 12px; margin-left: 8px; }
  section { margin-bottom: 22px; }
  h2 { font-size: 12px; letter-spacing: .16em; color: #6fa8dc; margin: 0 0 8px; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 7px 0; border-bottom: 1px solid #17222d; }
  li:last-child { border-bottom: none; }
  .when { color: #566575; font-size: 11px; margin-left: 8px; }
  .empty { color: #4a5763; margin: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>印象</h1>
    <div class="sub">${esc(ROOT)} · profile.json 生成于 ${esc(profile.updatedAt || '-')}</div>
    ${recent ? `<div class="recent"><div class="label">最近</div><div class="text">${esc(recent.text)}<span class="when">${esc(recent.at)}</span></div></div>` : ''}
    ${sections}
  </div>
</body>
</html>
`

const out = path.join(ROOT, 'profile.html')
fs.writeFileSync(out, html, 'utf8')
console.log(out)
