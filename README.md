# 小红书收藏夹 Walker

> 把你那堆 **「等下再看」变成「一个一个过」** 的 Tampermonkey 油猴脚本。

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-brightgreen)](https://www.tampermonkey.net/)
[![Violentmonkey](https://img.shields.io/badge/Violentmonkey-supported-brightgreen)](https://violentmonkey.github.io/)

**简体中文** · [English](README.en.md)

---

## 为什么会有这个脚本?

你的小红书收藏夹,多半已经变成这个样子:

- 几百、几千条 — 点进去前永远觉得「等下会看」
- 真的想清理的时候, 小红书给你的工具只有: **点开 → 看完 → 退回列表 → 滚回刚才的位置 → 重复几百次**
- 中途列表一刷新, 你的位置就**丢了**, 下次打开又从头开始
- 内置界面没办法告诉你「我已经看到第几个了」

于是这个收藏夹, 永远是一座**永远看不完的坟墓**。

### 这个脚本解决什么?

把收藏夹变成一个**像 Tinder 一样的工作流**: 一条一条打开, 看完只有两个动作 ——

- **留**: 点收藏 → 加入专辑(归档)
- **不要**: 直接「下一个」, 自动帮你取消收藏

进度**写进 localStorage**, 重新打开浏览器、明天再来, 都从上次那一条继续。

几千条的旧收藏, 一晚就能扫完。

---

## 它做了什么

- 🚀 **一键加载全部收藏** — 通过小红书内部 Pinia store 连续拉取直到没有 `hasMore`, 不打 XHR 也不绕 API
- 📍 **逐条走访 + 进度持久化** — 第几条 / 总共几条 / 距上次加载多久, 全部写进 localStorage
- 🗑️ **自动取消收藏(可关)** — 打开下一条后, 自动点掉收藏按钮(带 fallback dispatchEvent)
- 🔍 **队列搜索** — 支持繁简转换(OpenCC), 输入「美食」也能找到繁体标题「美食」
- 📋 **完整队列列表** — 一眼看到全部标题, 点任意一条直接跳转
- 🎨 **整页布局重排** — 小红书原生左栏压缩到 144px(或纯图标 56px), 右侧让给 Walker, 内容区永远对齐
- 💾 **零后端 / 零外发** — 全部在你本机 localStorage, 不会上传任何数据

---

## 安装

### 1. 装一个油猴脚本管理器

挑一个就行(二选一):

- [**Tampermonkey**](https://www.tampermonkey.net/) — Chrome / Edge / Firefox / Safari
- [**Violentmonkey**](https://violentmonkey.github.io/) — 开源替代品, Chrome / Firefox

### 2. 安装脚本

[![Install](https://img.shields.io/badge/%E2%9E%9C%20Install-Greasy%20Fork-d33?style=for-the-badge)](https://greasyfork.org/scripts/578808-xhs-favorites-walker)

### 3. 开始用

1. 登录 [xiaohongshu.com](https://www.xiaohongshu.com/)
2. 进到 **我的主页 → 收藏 → 笔记**(这一步很关键 — 脚本是从这个页面的 Pinia store 抓收藏数据的)
3. 右边会出现 Walker 侧边栏, 点 **「加载/刷新队列」** 等它跑完
4. 点 **「下一个 →」** 开始走

---

## 工作流

```
              ┌──── 留下 ────→  点 ❤️ 收藏 → 加入专辑 → 「下一个」
              │
  打开一条 ───┤
              │
              └──── 不要 ───→  直接「下一个」(自动取消收藏)
```

---

## 界面说明

| 区块 | 功能 |
|------|------|
| **进度** | 当前 / 总数 + 距上次加载多久 |
| **当前笔记** | 标题 + 作者 |
| **下一个** | 主按钮, 打开下一条 |
| **加载/刷新队列** | 从 Pinia store 重新抓收藏列表 |
| **← 上一 / 跳到 / 重置** | 微调控制 |
| **笔记列表** | 全部标题, 支持繁简搜索, 点击即跳 |
| **自动取消收藏** | 开关, 关掉就变成纯导航模式 |
| **左栏只显示图标** | 小红书原生左栏 144px → 56px, 给笔记内容更多空间 |

侧边栏左边有个 `⟩` 拉手, 点一下可以收起来(保留 36px), 不影响阅读。

---

## 设计决定

几个非典型选择, 写在这里省得后面改的人踩坑:

- **用 Pinia store 而非 XHR/API** — 小红书已经把 `fetchNotes()` 的 cursor 逻辑包好了, 复用比自己重写稳。代价: 脚本只能在「我的主页 → 收藏」这个 store mount 过的页面首次加载。
- **localStorage, 不是 IndexedDB** — 整个 queue(~5K 条 × ~200B/条)完全塞得下 5MB 配额, 换来同步读写的简单。
- **整页 CSS 重排走 `html.xhsW-active` 这个 class** — 一个 class 控所有 selector, 比逐个元素 inline style 好调试。
- **自动取消收藏带 fallback dispatchEvent** — 小红书的收藏按钮偶尔不吃单纯的 `.click()`, 多发一轮 mousedown/up/click 比较稳。
- **繁简搜索走 OpenCC `t2cn`** — 用 CDN require, 不打包进脚本, 体积小。
- **STATE_KEY / QUEUE_KEY 带版本后缀** — 将来 schema 改了可以同时跑旧版读新版, 避免一升级就清掉用户进度。

---

## 已知限制

- ❌ 只支持**笔记**(notes), 不支持收藏夹里的视频合辑/专辑本体
- ❌ 死贴(小红书端返回 410/404)会直接跳过, 但不会从 queue 里移除(刷新还在)
- ❌ 小红书改前端结构就会坏 — 这是油猴脚本的宿命, 开 issue 我看到会修
- ⚠️ 「自动取消收藏」开启时, 按 **下一个** 就真的会取消上一条, 没有 undo, 三思

---

## 常见问题

**「加载/刷新队列」点了没反应 / 显示 `no-store`**
→ 你不在「我的主页 → 收藏 → 笔记」页面。先导航到那里再点。

**侧边栏没出现**
→ 打开 DevTools console 看有没有 `[Walker v1.0.0]` 字样。没有的话是 Tampermonkey 没启用, 或者小红书改了 `#app` 结构。

**自动取消失败**
→ console 会打印 `自动取消失败,请手动点收藏`。手动点一次, 下一轮会再试。

**进度想清掉重来**
→ 点「重置」只清进度不清 queue。要全清: DevTools → Application → Local Storage → 删 `xhsWalker_*`。

---

## 隐私

- ❌ 不发任何外部请求(除了 jsDelivr CDN 抓 OpenCC, 可以在 `@require` 里删掉)
- ❌ 不上传收藏数据到任何地方
- ✅ 所有数据只在 `localStorage`, 你关掉浏览器、清掉站点数据就没了

