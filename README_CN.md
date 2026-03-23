[English](README.md)

<p align="center">
  <img src=".github/assets/banner.png" width="100%" alt="OpenHanako Banner">
</p>

<p align="center">
  <img src=".github/assets/Hanako-280.png" width="80" alt="Hanako">
</p>

<h1 align="center">OpenHanako</h1>

<p align="center">一个有记忆、有灵魂的私人 AI 助理</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20CLI%20%7C%20Web-lightgrey.svg)](https://github.com/liliMozi/openhanako)

---

## Hanako 是什么

OpenHanako 是一个更加易用的 AI agent，有记忆，有性格，会主动行动，还能多 Agent 在你的电脑上一同工作。

作为助手，Ta 是温柔的：不需要写复杂的配置，不需要理解晦涩的术语。Hanako 它不只面向 coder ，而是为每一个坐在电脑前工作的人设计的助手。
作为工具，Ta 是强大的：记住你说过的每一件事，操作你的电脑，浏览网页，搜索信息，读写文件，执行代码，管理日程，还能自主学习新技能。

我开这个项目的初衷是：弥合绝大多数人和 AI Agent 之间的缝隙，让强大的 Agent 能力不再只局限于命令行里。于是我做了比传统 Coding Agent 更多一些的优化：一方面是强化 Agent「像人」的属性，是你和他们沟通更自然；另一方面，因为我本职也是一介文员，所以我也针对日常办公场景做了很多工具性和流程性的优化，敬请探索。
此外，Hanako 有比较完备的图形页面。

如果你用过 claude code、codex、Manus 等 CLI 或是图形化的 Agent，你会在 Hanako 这里找到熟悉又新奇的感觉。

## 功能特性

**记忆** — 结合主流的记忆方案，自己又发挥了一下，做了个记忆系统，近期的事情记得非常牢固，但目前确实有待优化。

**人格** — 不是千篇一律的"AI 助手"。通过人格模板和自定义人格文件塑造独特的性格，每个 Agent 都有自己的说话方式和行为逻辑，Agent 之间分离做得很好，备份方便，Agent 就是文件夹，后续还会添加备份功能。

**工具** — 读写文件、执行终端命令、浏览网页、搜索互联网、截图、画布绘图、JavaScript 执行。能力覆盖日常办公的绝大多数场景。

**SKILLS 支持** — 内置兼容庞大 SKILLS 社区生态，之外，我也做了一些主动的优化：有时候干活之前，Agent 会从 GitHub 安装社区技能，Agent 也可以自己编写并学会新技能，有比较不错的主动性。当然，默认情况给 Agent 做了比较严格的 SKILLS 审核，如果发现 SKILLS 装不上可以自行关闭。

**多 Agent** — 创建多个 Agent，各自有独立的记忆、人格和定时任务。Agent 之间可以通过频道群聊协作，也可以互相委派任务。

**书桌** — 每个 Agent 都有自己的书桌，可以放文件、写笺（类似便签，Agent 会主动读取并执行）。支持拖拽操作，文件预览，是你和 Agent 之间的异步协作空间。

**定时任务与心跳** — Agent 可以设置定时任务（Cron），也会定期巡检书桌上的文件变化。你不在的时候，Ta 也能按计划自主工作。

**安全沙盒** — 双层隔离：应用层 PathGuard 四级访问控制 + 操作系统级沙盒（macOS Seatbelt / Linux Bubblewrap）。Agent 的权限在你的掌控之中。平时只能访问工作目录和一些用户文件，如果你想放开权限，可以点五下关于里面的 HANAKO 图表。

**多平台接入** — 同一个 Agent 可以同时接入 Telegram、飞书机器人、QQ机器人，在任何平台和 Ta 对话，可以远程操作电脑。



## 截图

<p align="center">
  <img src=".github/assets/screenshot-main.png" width="100%" alt="Hanako 主界面">
</p>

## 快速开始

### Quickstart（5 分钟）

```bash
git clone https://github.com/liliMozi/openhanako.git
cd openhanako
npm ci
npm run deploy:cli
```

启动后按引导完成 provider / base URL / 模型配置，即可开始使用。

### 运行目标

仓库已剪枝为仅保留 **Linux CLI + Web** 两种运行目标（已移除桌面安装包路线）。

### 首次运行

首次启动时，引导向导会带你完成配置：选择语言、输入你的名字、连接模型提供商（API key + base URL），并选择三个模型：**对话模型**（主对话）、**小工具模型**（摘要等轻量任务）、**大工具模型**（记忆编译和深度分析）。Hanako 使用 OpenAI 兼容协议，支持任意兼容的提供商（OpenAI、DeepSeek、通义千问、Ollama 本地模型等）。
目前也添加了 OpenAI 和 Minimax 的 Oauth 登录，鉴于 Anthropic 会有封号风险，所以暂时不提供。

### Linux CLI / Web 运行模式

```bash
npm run deploy:cli   # 一键部署并启动命令行版（可加 -- --mode server/web）
npm run cli          # 完整命令行交互（无 GUI）
npm run web          # 启动 Web 模式（前提是已构建过 renderer）
npm run web:start    # 一条命令完成构建并启动 Web（首次或前端代码变更后）
```

CLI、Web 模式都连接同一套 server + engine 路由，能力保持一致。

> 说明：Vite 输出 `Some chunks are larger than 500 kB after minification` 属于体积告警，不是构建失败。
>
> 如果你在旧版本仓库中遇到 `Missing script: "deploy:cli"`，可改用：
> `bash scripts/deploy-cli.sh --mode web --skip-install --no-start`
> 然后执行 `node scripts/launch.js web`。

## 架构

```
core/           引擎编排层 + Manager
lib/            核心库（记忆、工具、沙盒、Bridge 适配器）
server/         Fastify HTTP + WebSocket 服务
hub/            调度器、频道路由、事件总线
desktop/        React 前端资源（Web 模式下提供）
tests/          Vitest 测试
skills2set/     内置技能定义
```

引擎层协调多个 Manager（Agent、Session、Model、Preferences、Skill、Channel、BridgeSession 等），通过统一的 facade 暴露。Hub 负责后台任务（心跳巡检、定时任务、频道路由、Agent 间通信、DM 路由），独立于当前聊天会话运行。Web 模式由 `scripts/launch-web.js` 启动 server + renderer 代理并转发 API/WS。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 7 |
| 服务端 | Fastify 5 |
| Agent 运行时 | [Pi SDK](https://github.com/nicepkg/pi) |
| 数据库 | better-sqlite3（WAL 模式） |
| 测试 | Vitest |

## 平台支持

| 平台 | 状态 |
|------|------|
| Linux（CLI + Web） | 已支持 |

## 许可证

[Apache License 2.0](LICENSE)

## 链接

- [官网](https://openhanako.com)
- [提交 Issue](https://github.com/liliMozi/openhanako/issues)
- [安全页](https://github.com/liliMozi/openhanako/security)
- [安全政策](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)
