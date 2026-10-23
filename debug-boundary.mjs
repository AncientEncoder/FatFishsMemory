import { boundaryScores } from './src/boundary.js'
const t = (n, u, a, ts) => ({ turn: n, user: u, assistant: a, ts })
const uniform = [
  t(1, '服务器 ssh 连不上', '先看 22 端口'),
  t(2, '服务器 ssh 还是连不上', '看看 sshd 状态'),
  t(3, '服务器 ssh 状态正常', '那就是防火墙'),
  t(4, '服务器 ssh 防火墙也正常', '再查路由'),
]
console.log('uniform:', JSON.stringify(boundaryScores(uniform).map(s => [s.index, +s.score.toFixed(2), +s.overlap.toFixed(2)])))
const switch_ = [
  t(1, '服务器 ssh 连不上', '先看 22 端口'),
  t(2, '服务器 ssh 端口通了', '那就是 sshd 的问题'),
  t(3, '今天玩某个游戏通关了', '某条线确实好看'),
  t(4, '那个游戏的支线也很多', '支线内容很上瘾'),
]
console.log('switch:', JSON.stringify(boundaryScores(switch_).map(s => [s.index, +s.score.toFixed(2), +s.overlap.toFixed(2)])))
