# FatFishsMemory

给 DeepSeek Harness 做的「类人记忆」插件：**上下文满了不丢事，而是像人一样分层记住。**

## 为什么要做

DSH 的上下文窗口是 1,048,576 tokens。装满了，最早的对话会被挤掉——表现就是「它忘了我」。

而 DSH **本来就会压缩**（`compaction/start|prune|summary|end`），只是压完就丢了。
这个插件不重新发明压缩，只做两件框架没做的事：

1. **把压掉的东西留下来**（归档 + 索引）
2. **在该想起来的时候，把它递回给模型**（按线索召回，注入下一轮）

## 三层记忆

| 层 | 存什么 | 代价 |
|---|---|---|
| 热 | 当前上下文 | 贵，但快 |
| 温 | 记忆卡（标题 + 日期 + 要点 + 关键词）、用户画像 | 极便宜，常驻 |
| 冷 | `turns.jsonl` 原文、`compactions.jsonl` | 磁盘，按线索召回 |

## 用户画像

独立于会话，存在 `~/.dsh/fatfish-memory/profile.json`，同时渲染一份 `profile.md` 给人看。

```
身份  软件工程师，某大学 
偏好  喜欢简洁、讨厌被催
习惯  晚上十点后不太回消息
情绪  最近在准备一个考试
在做  一个本地笔记工具
```

**原则：存在本地、人能读、人能改。** 不想要哪条，直接编辑 `profile.json` 删掉。

## 状态

- [x] 订阅 `session/event`，按轮把原文写进 `turns.jsonl`
- [x] token 估算（中文 1.4 字/token，英文 3.8 字符/token，宁多勿少）
- [x] 压力到 `compactAt` 触发压缩，生成记忆卡
- [x] 原生 `compaction/*` 事件归档
- [x] 用户画像（JSON + Markdown 渲染）
- [x] inbox 注入实现（`agent/inbox/spliced`，默认关闭）
- [ ] **实测注入时序**（需要装进真实会话跑一轮）
- [ ] 向量召回（替换关键词打分，接口不变）

## 数据布局

```
~/.dsh/fatfish-memory/
  profile.json        用户画像
  profile.md          画像的可读视图
  <sessionId>/
    turns.jsonl       每轮问答原文（只追加）
    compactions.jsonl 原生压缩事件原样记录
    index.json        记忆卡 + 压缩游标 compactedThrough
```

## 安装

```bash
dsh plugin --profile desktop add file:D:\Work\Code\FatFishsMemory
```

## 开发

```bash
node test/store.test.js
node test/compact.test.js
node test/profile.test.js
```

（沙箱里 `node --test` 会因 spawn 被拦，直接跑文件即可。）

## 设计决策

- **压缩永远从原文重新生成**，不在旧摘要上二次摘要——避免误差累积
- **中文没有空格**，关键词用 2-gram + 3-gram 提取，`服务器` 和 `服务` 才能互相命中
- **不跟框架抢压缩权**：只旁听 `compaction/*`，记录它丢了什么
- **注入默认关闭**，先用真实会话验证 `agent/inbox/spliced` 的时序再默认开
- 注入的记忆要带**引用标记**，否则下次压缩分不清事实和转述