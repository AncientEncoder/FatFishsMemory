import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ensureDataDir,
  probeWrite,
  safeReadJson,
  createBreaker,
  writeWelcome,
  expandHome,
  resolveDataDir,
} from '../src/safety.js'

test('ensureDataDir creates nested directories', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-')), 'a', 'b', 'c')
  assert.equal(ensureDataDir(root), true)
  assert.ok(fs.existsSync(root))
})

test('probeWrite leaves nothing behind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  assert.equal(probeWrite(root), true)
  assert.equal(fs.existsSync(path.join(root, '.write-probe')), false)
})

test('safeReadJson reports missing / ok / corrupt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  const file = path.join(root, 'x.json')

  assert.equal(safeReadJson(file, {}).status, 'missing')

  fs.writeFileSync(file, JSON.stringify({ a: 1 }), 'utf8')
  const ok = safeReadJson(file, {})
  assert.equal(ok.status, 'ok')
  assert.equal(ok.value.a, 1)

  fs.writeFileSync(file, '{ this is not json', 'utf8')
  const corrupt = safeReadJson(file, { fallback: true })
  assert.equal(corrupt.status, 'corrupt')
  assert.equal(corrupt.value.fallback, true)
  // 坏文件被改名保留，而不是被静默覆盖
  const leftovers = fs.readdirSync(root).filter((name) => name.includes('.corrupt-'))
  assert.equal(leftovers.length, 1)
})

test('breaker opens after N failures and resets on success', () => {
  let opened = 0
  const breaker = createBreaker({ limit: 3, onOpen: () => { opened += 1 } })
  breaker.fail(new Error('x'))
  breaker.fail(new Error('x'))
  assert.equal(breaker.open, false)
  breaker.fail(new Error('x'))
  assert.equal(breaker.open, true)
  assert.equal(opened, 1)
  breaker.fail(new Error('x'))
  assert.equal(opened, 1, 'onOpen 只触发一次')
  breaker.reset()
  assert.equal(breaker.open, false)
})

test('writeWelcome only writes once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-'))
  assert.equal(writeWelcome(root), true)
  assert.equal(writeWelcome(root), false)
  assert.ok(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('FatFishsMemory'))
})

test('expandHome handles ~ forms', () => {
  const home = 'C:\\Users\\tester'
  assert.equal(expandHome('~', home), home)
  assert.equal(expandHome('~/mem', home), path.join(home, 'mem'))
  assert.equal(expandHome('C:\\data', home), 'C:\\data')
  assert.equal(expandHome('', home), '')
})

test('resolveDataDir: default / configured / fallback', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ffm-home-'))
  const fallback = path.join(home, '.dsh', 'fatfish-memory')

  const none = resolveDataDir({ configured: '', fallback, homeDir: home })
  assert.equal(none.source, 'default')
  assert.equal(none.dir, fallback)

  const custom = path.join(home, 'custom-mem')
  const configured = resolveDataDir({ configured: custom, fallback, homeDir: home })
  assert.equal(configured.source, 'config')
  assert.ok(fs.existsSync(custom))

  // 指向一个"文件"而不是目录，必然建不出来 → 回落 + 警告
  const blocker = path.join(home, 'blocker')
  fs.writeFileSync(blocker, 'x', 'utf8')
  const broken = resolveDataDir({ configured: blocker, fallback, homeDir: home })
  assert.equal(broken.source, 'fallback')
  assert.equal(broken.dir, fallback)
  assert.match(broken.warning, /不可用/)
})
