#!/usr/bin/env node
/**
 * 快速更新用户画像。给 agent 自己用，也给人在终端里用。
 *
 *   node tools/remember.mjs show
 *   node tools/remember.mjs recent "今天在打战争雷霆周年庆，心情不错"
 *   node tools/remember.mjs add preferences "喜欢先看结论、再看细节"
 *   node tools/remember.mjs forget recent
 *
 * 「recent」是滚动的：只保留最新一条，适合"最近的心情/状态"。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.env.DSH_FATFISH_DIR || path.join(os.homedir(), '.dsh', 'fatfish-memory')
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const SRC = pathToFileURL(path.join(here, '..', 'src')).href

const { readProfile, writeProfile, writeProfileMarkdown } = await import(`${SRC}/store.js`)
const { emptyProfile, addFact, renderProfileMarkdown, SECTIONS } = await import(`${SRC}/profile.js`)

const args = process.argv.slice(2)
const cmd = args[0]

function load() {
  return readProfile(ROOT) || emptyProfile()
}

function save(profile) {
  writeProfile(ROOT, profile)
  writeProfileMarkdown(ROOT, renderProfileMarkdown(profile))
  return profile
}

if (!cmd || cmd === 'show') {
  const profile = load()
  console.log(`数据目录: ${ROOT}`)
  console.log('')
  console.log(renderProfileMarkdown(profile))
  process.exit(0)
}

if (cmd === 'recent' || cmd === 'add') {
  const section = cmd === 'recent' ? 'recent' : args[1]
  const text = cmd === 'recent' ? args.slice(1).join(' ') : args.slice(2).join(' ')
  if (!SECTIONS.includes(section)) {
    console.error(`未知分区: ${section}\n可用: ${SECTIONS.join(' / ')}`)
    process.exit(1)
  }
  if (!text.trim()) {
    console.error('要写点什么')
    process.exit(1)
  }
  const profile = addFact(load(), section, text)
  save(profile)
  console.log(`已写入 ${section}: ${text}`)
  process.exit(0)
}

if (cmd === 'forget') {
  const section = args[1]
  const profile = save(load())
  if (section && profile.sections[section]) {
    profile.sections[section] = []
    save(profile)
    console.log(`已清空 ${section}`)
  } else {
    console.error(`未知分区: ${section}`)
    process.exit(1)
  }
  process.exit(0)
}

console.error('用法: node tools/remember.mjs show | recent <一句话> | add <分区> <内容> | forget <分区>')
process.exit(1)
