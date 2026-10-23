import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 首次使用的安全网。
 * 原则：任何本地文件问题都只能降级，不能让插件崩、更不能刷屏报错。
 */

export function ensureDataDir(root) {
  try {
    fs.mkdirSync(root, { recursive: true })
    return true
  } catch {
    return false
  }
}

/** 展开 `~`、`~/x`、`~\x`——配置里写波浪号不该变成字面目录名。 */
export function expandHome(value, homeDir = os.homedir()) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text === '~') return homeDir
  if (text.startsWith('~/') || text.startsWith('~\\')) return path.join(homeDir, text.slice(2))
  return text
}

/**
 * 解析数据目录：
 * - 没配 → 用默认目录
 * - 配了且可写 → 用配置的（转绝对路径）
 * - 配了但不可用 → 回落到默认目录，并返回 warning（让用户知道配置没生效）
 */
export function resolveDataDir({ configured, fallback, homeDir = os.homedir() } = {}) {
  const wanted = expandHome(configured, homeDir)
  if (!wanted) return { dir: fallback, source: 'default', warning: null }

  const absolute = path.resolve(wanted)
  if (ensureDataDir(absolute) && probeWrite(absolute)) {
    return { dir: absolute, source: 'config', warning: null }
  }
  return {
    dir: fallback,
    source: 'fallback',
    warning: `配置的数据目录不可用：${absolute}，已回落到 ${fallback}`,
  }
}

/** 真写一次再删掉：比 existsSync 可信，能发现只读目录、磁盘满、权限错。 */
export function probeWrite(root) {
  const probe = path.join(root, '.write-probe')
  try {
    fs.writeFileSync(probe, 'ok', 'utf8')
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

/**
 * 读 JSON 的三种结果：ok / missing / corrupt。
 * corrupt 时把坏文件改名保留（绝不静默覆盖），返回 fallback。
 */
export function safeReadJson(file, fallback) {
  if (!fs.existsSync(file)) return { value: fallback, status: 'missing' }
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')), status: 'ok' }
  } catch {
    try {
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`)
    } catch {
      /* 改名也失败就随它去，下面照样返回 fallback */
    }
    return { value: fallback, status: 'corrupt' }
  }
}

/**
 * 连续失败 N 次就断电，避免每轮都抛异常刷日志。
 * 成功一次即复位。
 */
export function createBreaker({ limit = 3, onOpen } = {}) {
  let fails = 0
  let open = false
  return {
    get open() {
      return open
    },
    ok() {
      fails = 0
    },
    fail(error) {
      fails += 1
      if (!open && fails >= limit) {
        open = true
        onOpen?.(error, fails)
      }
      return open
    },
    reset() {
      fails = 0
      open = false
    },
  }
}

/** 首次运行时的说明文件，让人知道这里存了什么、怎么删。 */
export function writeWelcome(root) {
  const file = path.join(root, 'README.md')
  if (fs.existsSync(file)) return false
  const body = [
    '# FatFishsMemory 数据目录',
    '',
    '这个目录是 DSH 记忆插件自动生成的，内容全部在本机，不会上传。',
    '',
    '| 文件 | 内容 |',
    '|---|---|',
    '| `profile.json` | 用户画像（偏好、习惯、情绪、在做的事）|',
    '| `<sessionId>/turns.jsonl` | 每轮问答原文（只追加）|',
    '| `<sessionId>/compactions.jsonl` | 框架压缩事件的原样记录 |',
    '| `<sessionId>/index.json` | 记忆卡索引 |',
    '',
    '## 想删掉某条记忆',
    '',
    '直接编辑 `profile.json`，删掉对应那一行即可。',
    '',
    '## 想彻底不用',
    '',
    '删掉整个目录，或在 DSH 里禁用 `dsh-fatfish-memory` 插件。',
    '',
  ].join('\n')
  try {
    fs.writeFileSync(file, body, 'utf8')
    return true
  } catch {
    return false
  }
}
