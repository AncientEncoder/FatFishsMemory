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

独立于会话，存在 `~/.dsh/fatfish-memory/profile.json`，同时渲染一份给人看。

```
身份  后端工程师
偏好  喜欢先看结论、再看细节
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
- [x] 首次运行保险机制（见下）
- [ ] **实测注入时序**（需要装进真实会话跑一轮）
- [ ] 向量召回（替换关键词打分，接口不变）

## 首次运行的保险机制

新手最容易被"目录不存在 / 没权限 / 文件坏了"劝退，所以这几种情况都只能降级，不能报错刷屏：

| 情况 | 处理 |
|---|---|
| 数据目录不存在 | 自动创建，并写一份 `README.md` 说明这里存了什么 |
| 目录不可写 | 关闭落盘，只做内存内统计，**只在启动时报一次** |
| 连续 3 次写入失败 | 熔断，停止落盘并提示一次，本会话内不再重试 |
| `profile.json` / `index.json` 损坏 | 改名为 `.corrupt-<时间戳>` 保留，用默认值继续 |
| 首次运行无画像 | 自动建一个空画像，不阻塞启动 |

## 数据布局

```
~/.dsh/fatfish-memory/
  profile.json        用户画像
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

沙箱里 `node --test` 会因 spawn 被拦，直接跑文件即可。

## 隐私

这是私人记忆，规则写死在代码里：

- **零网络调用**：`src/` 下没有 `fetch`/`http`/`net`，插件不外传任何东西
- **数据只在本地**：默认落在 `~/.dsh/fatfish-memory/`，不在仓库里
- **仓库兜底**：`.gitignore` 屏蔽 `profile.json`、`turns.jsonl`、`compactions.jsonl` 等
- **可读可删**：`profile.json` 是纯文本，不想要哪条直接删

一句话：**记忆属于用户，不属于仓库。**

## 设计决策

- **压缩永远从原文重新生成**，不在旧摘要上二次摘要——避免误差累积
- **中文没有空格**，关键词用 2-gram + 3-gram 提取，`服务器` 和 `服务` 才能互相命中
- **不跟框架抢压缩权**：只旁听 `compaction/*`，记录它丢了什么
- **注入默认关闭**，先用真实会话验证 `agent/inbox/spliced` 的时序再默认开
- 注入的记忆要带**引用标记**，否则下次压缩分不清事实和转述
