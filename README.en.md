# XHS Favorites Walker

> A Tampermonkey user script that turns your **Xiaohongshu (小红书) saved-posts pile** into a **one-by-one walkthrough workflow**.

[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-brightgreen)](https://www.tampermonkey.net/)
[![Violentmonkey](https://img.shields.io/badge/Violentmonkey-supported-brightgreen)](https://violentmonkey.github.io/)

**English** · [简体中文](README.md)

---

## Why this exists

Your Xiaohongshu (XHS) favorites list is almost certainly in this state:

- Hundreds, maybe thousands of saved posts — you keep telling yourself you'll get around to them
- When you actually try to clean up, XHS's UI gives you exactly one option: **open → read → back to list → scroll back to where you were → repeat hundreds of times**
- The moment the feed refreshes, **you lose your place**, and tomorrow you start from zero
- The built-in UI cannot tell you "I'm on item N of M"

So the favorites pile stays a **graveyard you never visit**.

### What this script does

Turns the pile into a **Tinder-style workflow**: open one item, then make exactly one of two decisions —

- **Keep**: tap the favorite ❤️ → move into an album (archive)
- **Drop**: just click "Next" → the script auto-uncollects it for you

Progress is **persisted to `localStorage`**. Close the browser, come back tomorrow, you resume from the exact item you left on.

Thousands of stale saves clear out in a single evening.

---

## Features

- 🚀 **One-click load of all favorites** — calls XHS's own Pinia store via `fetchNotes()` until `hasMore` flips false. No XHR scraping, no API hacks.
- 📍 **Walk + persist** — current index, total, time-since-load — all in `localStorage`.
- 🗑️ **Auto-uncollect (toggleable)** — when you open the next item, it auto-clicks the favorite button on the previous page (with a `dispatchEvent` fallback).
- 🔍 **Queue search with TC→SC normalization** — uses OpenCC, so typing a Simplified term finds Traditional-titled posts too.
- 📋 **Full queue list** — every title at a glance, click any one to jump.
- 🎨 **Page-wide layout reflow** — compresses XHS's native left nav (144px, or icon-only 56px), claims the right side for the Walker, content area stays aligned.
- 💾 **Zero backend, zero outbound traffic** — everything lives in your local `localStorage`. Nothing uploaded anywhere.

---

## Install

### 1. Install a user-script manager

Pick one (either works):

- [**Tampermonkey**](https://www.tampermonkey.net/) — Chrome / Edge / Firefox / Safari
- [**Violentmonkey**](https://violentmonkey.github.io/) — open-source alternative, Chrome / Firefox

### 2. Install the script

<a href="https://greasyfork.org/scripts/578808-xhs-favorites-walker" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/badge/%E2%9E%9C%20Install-Greasy%20Fork-d33?style=for-the-badge" alt="Install on Greasy Fork"></a>

### 3. Use it

1. Log in to [xiaohongshu.com](https://www.xiaohongshu.com/)
2. Navigate to **My Profile → Favorites → Notes** (this matters — the script reads the favorites from this page's Pinia store)
3. The Walker panel appears on the right. Click **「加载/刷新队列」** (Load/refresh queue) and wait for it to finish
4. Click **「下一个 →」** (Next) to start walking

> The script's UI is in Simplified Chinese because XHS's user base is Chinese-speaking. The button mapping is straightforward — see the Interface section below.

---

## Workflow

```
              ┌──── Keep ────→  click ❤️ → add to album → "Next"
              │
  Open one ───┤
              │
              └──── Drop ────→  click "Next" (auto-uncollects previous)
```

---

## Interface

| Section | Function |
|---------|----------|
| **进度** (Progress) | Current / total + time since last load |
| **当前笔记** (Current note) | Title + author |
| **下一个 →** (Next) | Primary button, opens the next item |
| **加载/刷新队列** (Load/refresh queue) | Re-fetches favorites from Pinia store |
| **← 上一 / 跳到 / 重置** (Back / Jump / Reset) | Fine controls |
| **笔记列表** (Note list) | All titles, TC↔SC search, click to jump |
| **自动取消收藏** (Auto-uncollect) | Toggle — off = pure navigation mode |
| **左栏只显示图标** (Icon-only nav) | Compress XHS native left nav 144px → 56px for more content space |

A `⟩` handle on the left edge of the sidebar collapses it (keeping a 36px strip), so it never gets in the way of reading.

---

## Design notes

A few non-obvious choices, written down here so anyone forking knows what they're touching:

- **Use the Pinia store, not XHR / a custom API client** — XHS has already wrapped cursor pagination in `fetchNotes()`. Reusing it is more stable than re-implementing. The trade-off: the script can only do its initial load on the *favorites* page where this store is mounted.
- **`localStorage`, not IndexedDB** — A queue of ~5K items × ~200B fits comfortably in the 5MB quota, in exchange for synchronous reads/writes and simpler code.
- **One CSS class (`html.xhsW-active`) controls all selectors** — Cleaner to debug than per-element inline styles.
- **Auto-uncollect has a `dispatchEvent` fallback** — XHS's favorite button occasionally doesn't respond to a plain `.click()`. A synthetic mousedown/mouseup/click sequence is the workaround.
- **OpenCC `t2cn` for TC→SC search normalization** — Pulled from CDN via `@require` instead of bundled, to keep the script small.
- **`STATE_KEY` / `QUEUE_KEY` have version suffixes** — Future schema changes can run old/new in parallel without nuking existing user progress.

---

## Known limitations

- ❌ **Notes only** — no support for video collections or album entities inside favorites
- ❌ **Dead posts (410/404 from XHS)** are skipped at navigation time but not removed from the queue (a re-load still includes them)
- ❌ **XHS frontend changes break things** — that's the user-script tax. Open an issue, I'll see it and patch.
- ⚠️ **No undo on auto-uncollect** — with the toggle on, clicking Next *will* uncollect the previous item. Think before you click.

---

## Troubleshooting

**"Load/refresh queue" does nothing, or shows `no-store`**
→ You're not on the *My Profile → Favorites → Notes* page. Navigate there first.

**Sidebar doesn't appear**
→ Open DevTools console. If you don't see `[Walker v1.0.0]`, Tampermonkey isn't running the script, or XHS changed its `#app` structure.

**Auto-uncollect failed**
→ Console will log `自动取消失败,请手动点收藏` (auto-cancel failed, please click favorite manually). Click it once by hand — the next iteration will retry.

**Want to wipe progress and start fresh**
→ The Reset button only clears progress, not the queue. To wipe everything: DevTools → Application → Local Storage → delete all `xhsWalker_*` keys.

---

## Privacy

- ❌ **No external requests** (other than the jsDelivr CDN for OpenCC, which you can remove from `@require` if you want)
- ❌ **Nothing is uploaded** — your favorites data never leaves your browser
- ✅ **Everything in `localStorage`** — close the browser and clear site data, it's all gone

