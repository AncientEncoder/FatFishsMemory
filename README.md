# FatFishsMemory

给 DeepSeek Harness 做的「类人记忆」插件：**上下文满了不丢事，而是像人一样分层记住。**

## 要解决的问题

DSH 的上下文窗口是 1,048,576 tokens。装满了，最早的对话会被挤掉——表现就是「它忘了我」。
这个插件不试图扩大窗口，而是**换一种存法**：

| 层 | 存什么 | 代价 |
|---|---|---|
| 热 | 当前上下文 | 贵，但快 |
| 温 | 记忆卡（标题 + 日期 + 要点 + 关键词） | 极便宜，常驻 |
| 冷 | `turns.jsonl` 原文 | 磁盘，按线索召回 |

关键点：**压缩前先落盘**。摘要只是索引，原文才是真相。

## 状态

- [x] 订阅 `session/event`，按轮把原文写进 `turns.jsonl`
- [x] token 估算（中文 1.4 字/token，英文 3.8 字符/token，宁多勿少）
- [x] 压力到 `compactAt` 阈值触发压缩
- [x] 记忆卡生成（标题 + 日期 + 要点 + 关键词）
- [x] 召回：关键词打分 + 「回忆」块渲染
- [ ] 把「回忆」块注入下一轮对话（等 DSH 的 inbox API 确认）
- [ ] 向量召回（替换关键词打分，接口不变）

## 工作方式

每轮结束：

```
turn/end → turns.jsonl 追加原文
        → 累计 estimatedTokens
        → pressure = tokens / 1,048,576
        → pressure >= compactAt(0.6) 且待压缩 >= 6 轮
        → 取前一半生成记忆卡，写 index.json
```

记忆卡只存**索引信息**（标题、要点、关键词、时间戳），正文永远在 `turns.jsonl`。
这样即使卡片写歪了，真相也没丢——最多是「想不起来去查」。

## 数据布局

```
~/.dsh/fatfish-memory/<sessionId>/
  turns.jsonl   每轮问答原文（只追加，不修改）
  index.json    记忆卡 + 压缩游标 compactedThrough
```

## 安装

开发期通过本地路径安装：

```bash
dsh plugin --profile desktop add file:D:\Work\Code\FatFishsMemory
```

## 开发

```bash
node test/store.test.js
node test/compact.test.js
```

（沙箱里 `node --test` 会因 spawn 被拦，直接跑文件即可。）

## 设计决策

- **压缩永远从原文重新生成**，不在旧摘要上二次摘要——避免误差累积
- **中文没有空格**，关键词用 2-gram + 3-gram 提取，`服务器` 和 `服务` 才能互相命中
- **召回三路**：关键词（已实现）→ 向量（待做）→ 「记忆目录」自述（待做）
- 注入的记忆要带**引用标记**，否则下次压缩分不清事实和转述