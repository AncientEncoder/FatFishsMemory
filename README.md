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
- [x] 用户画像（`profile.json` + `profile.md`，可读可改）
- [x] 数据目录可配、按工作区归类、迁移旧数据
- [x] 首次运行保险机制（见下）
- [x] 召回：关键词检索 + `recall.mjs` 命令行
- [x] 记忆目录（hot memory）：会话开始时以 system 消息注入
- [x] 结构化记忆卡：目标 / 动作 / 结果 / 涉及文件
- [x] 任务边界检测：不再盲目对半切
- [ ] 向量召回（替换关键词打分，接口不变）

## 怎么切：任务边界检测

压缩时不再"对半切"，而是找**自然的任务断点**。三个信号，纯规则，不调模型：

| 信号 | 判定 | 权重 |
|---|---|---|
| 话题漂移 | 前后两轮的关键词重合度低 | `1 - 重合度` |
| 收尾语 | 上一轮回答里出现「完成/好了/搞定/通过」 | +0.8 |
| 时间间隔 | 两轮之间隔了 20 分钟以上 | +0.9 |

综合分数 ≥ **0.78** 才认定是边界；否则退回对半切——**宁可切得笨，也不要切错**。

卡片上会记下这次是怎么切的：

```json
{ "cut": "detected", "cutScore": 1.0 }   // 找到了任务边界
{ "cut": "fallback", "cutScore": 0.7 }   // 没找到，对半切
```

阈值是拿真实对话校准出来的：统一话题最高 0.70，话题切换能到 1.00。


## 记忆卡长什么样

```json
{
  "date": "2026-10-23",
  "from": 118, "to": 124,
  "title": "插件装不上，帮我看下",
  "goal": "插件装不上，帮我看下",
  "actions": ["pwsh×3", "read"],
  "outcome": "装好了，路径是 D:\\Work\\Code\\FatFishsMemory",
  "files": ["D:\\Work\\Code\\FatFishsMemory"],
  "points": ["..."],
  "keywords": ["插件", "重启", "白屏"],
  "tokens": 412, "turns": 7
}
```

`actions` 来自 `tool/call` 事件，`outcome` 取最后一条回答的首句，`files` 用路径正则扫。
没有这些信息时卡片退化成"首句当标题"，不会更差。


## 怎么翻记忆

存了不等于能想起来，所以带了一个检索工具：

```bash
node tools/recall.mjs --list              # 有哪些会话
node tools/recall.mjs "白屏"               # 搜原文
node tools/recall.mjs "插件" --cards       # 只看记忆卡
node tools/recall.mjs "重启" --session 10d841fa
```

输出长这样：

```
=== default-workspace / session-10d841fa… （12 轮）===
  [轮 118] 2026/10/23 20:50:04  (score 9)
        …今天那次白屏就是这么来的…
```

打分规则：**完整词组命中 > 拆词命中**，再按出现次数和时间加权。
搜索范围是 `turns.jsonl` 原文 + `index.json` 里的记忆卡。

> 注意：这个 CLI 直接读数据目录，**不需要 DSH 在运行**。


## 为什么不做"注入"

早期版本用 `session.append("agent/inbox/spliced", …)` 把画像塞进下一轮上下文。功能确实跑通了——模型能在输入里看到画像。

但它有**不对称风险**：运行时会给这条消息打上 `source.kind = "plugin:<name>"`，而它会进入会话事件流。一旦客户端渲染不了这种来源，**整个对话区会白屏**——一条消息能毁掉一个会话。

现在改为：画像写进 `profile.md`，由 agent 在需要时主动读取。
文件坏了顶多读不到，不会破坏任何东西。

> 顺带记一笔：排查时曾误判白屏是注入消息导致的，实际是 profile 的 `bundles` 被改坏、
> 插件加载失败引起的。教训不是"注入没问题"，而是**别手工改 `package.json` 和 `node_modules`**，
> 一律走 `dsh plugin` 官方命令。

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

按**工作区**分组，同一目录下的会话放在一起：

```
~/.dsh/fatfish-memory/
  profile.json              用户画像（全局，不分工作区）
  README.md                 首次运行时自动生成，说明这里存了什么
  <workspace>/              工作区名 = 会话 cwd 的最后一段
    <sessionId>/
      turns.jsonl           每轮问答原文（只追加）
      compactions.jsonl     原生压缩事件原样记录
      index.json            记忆卡 + 压缩游标 + 所属工作区
  _legacy/                  旧版平铺结构迁移后的存放地
  _unknown/                 拿不到 cwd 的会话
```

## 数据目录可配

默认落在 `~/.dsh/fatfish-memory`，也可以指到任意位置：

```yaml
config:
  dataDir: "D:\\FatFishData"   # 绝对路径最稳
  # dataDir: "~/memory"        # 也支持 ~ 展开
```

规则：

| 情况 | 行为 |
|---|---|
| 留空 | 用默认目录 |
| 配了且可写 | 用它（转成绝对路径） |
| 配了但不可用（权限、指向文件、盘满） | **回落到默认目录**，并在日志里警告一次 |
| 默认目录也不可用 | 只读模式运行，不落盘 |
| 换了目录且新目录是空的 | **自动把旧目录整体复制过去**（只复制，不删原数据） |

不静默降级的原因：配置写错了却没人知道，比配置失败更糟。

## 安装

```bash
dsh plugin --profile desktop add file:D:\Work\Code\FatFishsMemory
```

## 调试

默认 **关**，正常使用和发布都保持 `debug: false`——这时只有 `error` / `warn` 会输出。

排查问题时，两种打开方式：

```yaml
# ~/.dsh/profiles/desktop/node_modules/dsh-fatfish-memory/cordis.patch.yml
config:
  debug: true
```

```bash
# 或者临时用环境变量，不用改文件（优先级更高）
set DSH_FATFISH_DEBUG=1
```

打开后会打印：每个事件的类型和 seq、每轮归档后的 token 数与压力百分比、压缩触发、注入结果。

## 开发

```bash
node test/store.test.js
node test/compact.test.js
node test/profile.test.js
node test/safety.test.js
node test/log.test.js
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
