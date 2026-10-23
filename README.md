# FatFishsMemory

给 DeepSeek Harness 做的「类人记忆」插件：**上下文满了不丢事，而是像人一样分层记住。**

## 要解决的问题

DSH 的上下文窗口是 1,048,576 tokens。装满了，最早的对话会被挤掉——表现就是「它忘了我」。
这个插件不试图扩大窗口，而是**换一种存法**：

| 层 | 存什么 | 代价 |
|---|---|---|
| 热 | 当前上下文 | 贵，但快 |
| 温 | 记忆卡（标题 + 日期 + 要点） | 极便宜，常驻 |
| 冷 | `turns.jsonl` 原文 + 压缩摘要 | 磁盘，按线索召回 |

关键点：**压缩前先落盘**。摘要只是索引，原文才是真相。

## 状态（v0.0.1）

- [x] 订阅 `session/event`，按轮把原文写进 `turns.jsonl`
- [x] token 估算（中文按 1.4 字/token，英文按 3.8 字符/token，宁多勿少）
- [ ] 到阈值触发压缩（`compactAt`）
- [ ] 生成记忆卡（标题 + 日期 + 要点）
- [ ] 按线索召回并注入下一轮

## 安装

尚未发布，开发期通过本地路径安装：

```bash
dsh plugin --profile desktop add file:D:\Work\Code\FatFishsMemory
```

启用后数据落在 `~/.dsh/fatfish-memory/<sessionId>/`：

```
turns.jsonl   每轮问答原文（只追加）
index.json    记忆卡索引
```

## 开发

```bash
node test/store.test.js
```

（沙箱里 `node --test` 会因为 spawn 被拦，直接跑文件即可。）

## 设计笔记

- 压缩永远**从原文重新生成**，不在旧摘要上二次摘要——避免误差累积
- 检索计划三路召回：向量 + BM25 + 「记忆目录」自述，解决 hit 率问题
- 每轮注入的记忆要带**引用标记**，否则下次压缩分不清事实和转述