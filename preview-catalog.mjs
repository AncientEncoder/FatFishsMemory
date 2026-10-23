import fs from 'node:fs'
const f = process.env.USERPROFILE + '\\.dsh\\fatfish-memory\\default-workspace\\session-10d841fa-6514-4a8f-8bb2-6d4a3fe41e9f\\index.json'
const idx = JSON.parse(fs.readFileSync(f, 'utf8'))
console.log('cards:', (idx.entries || []).length, '| lastTurn:', idx.lastTurn)
const { buildCatalog } = await import('file:///D:/Work/Code/FatFishsMemory/src/hotmemory.js')
console.log('\n--- 重启后会注入的内容 ---')
console.log(buildCatalog(idx.entries || [], { maxEntries: 8 }) || '(空，没有卡片就不注入)')
