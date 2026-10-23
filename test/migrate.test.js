import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { collectLegacySessions, copyTree, isDirEmpty, migrateToNewDataDir } from '../src/migrate.js'
import { sessionDir, workspaceSlug } from '../src/store.js'

function tmp(prefix = 'ffm-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('isDirEmpty distinguishes empty, missing and filled', () => {
  const root = tmp()
  assert.equal(isDirEmpty(root), true)
  assert.equal(isDirEmpty(path.join(root, 'nope')), true)
  fs.writeFileSync(path.join(root, 'x'), '1', 'utf8')
  assert.equal(isDirEmpty(root), false)
})

test('copyTree copies nested content', () => {
  const from = tmp()
  fs.mkdirSync(path.join(from, 'a', 'b'), { recursive: true })
  fs.writeFileSync(path.join(from, 'a', 'b', 'f.txt'), 'hello', 'utf8')
  const to = tmp()
  assert.equal(copyTree(from, to), true)
  assert.equal(fs.readFileSync(path.join(to, 'a', 'b', 'f.txt'), 'utf8'), 'hello')
})

test('migrateToNewDataDir only copies into an empty target', () => {
  const from = tmp()
  fs.writeFileSync(path.join(from, 'profile.json'), '{}', 'utf8')

  const emptyTarget = path.join(tmp(), 'new')
  fs.mkdirSync(emptyTarget, { recursive: true })
  const moved = migrateToNewDataDir({ from, to: emptyTarget })
  assert.equal(moved.moved, true)
  assert.ok(fs.existsSync(path.join(emptyTarget, 'profile.json')))

  const fullTarget = path.join(tmp(), 'busy')
  fs.mkdirSync(path.join(fullTarget, 'x'), { recursive: true })
  assert.equal(migrateToNewDataDir({ from, to: fullTarget }).reason, 'target-not-empty')
  assert.equal(migrateToNewDataDir({ from, to: from }).reason, 'same-path')
})

test('collectLegacySessions moves flat session dirs into _legacy', () => {
  const root = tmp()
  fs.mkdirSync(path.join(root, 'session-aaa'), { recursive: true })
  fs.mkdirSync(path.join(root, 'default-workspace'), { recursive: true })
  const moved = collectLegacySessions(root)
  assert.equal(moved, 1)
  assert.ok(fs.existsSync(path.join(root, '_legacy', 'session-aaa')))
  assert.ok(fs.existsSync(path.join(root, 'default-workspace')))
})

test('workspaceSlug takes the last path segment safely', () => {
  assert.equal(workspaceSlug('C:\\Users\\me\\Documents\\deepseek-harness\\default-workspace'), 'default-workspace')
  assert.equal(workspaceSlug('/home/me/proj'), 'proj')
  assert.equal(workspaceSlug(''), '_unknown')
  assert.equal(workspaceSlug('C:\\a b\\c d'), 'c_d')
})

test('sessionDir nests under workspace when given', () => {
  const flat = sessionDir('C:\\root', 'session-1')
  assert.ok(flat.endsWith(path.join('root', 'session-1')))
  const nested = sessionDir('C:\\root', 'session-1', 'my-ws')
  assert.ok(nested.endsWith(path.join('root', 'my-ws', 'session-1')))
})
