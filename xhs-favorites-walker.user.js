// ==UserScript==
// @name         XHS Favorites Walker
// @namespace    https://wickend.dev/xhs-favorites-walker
// @version      1.0.0
// @description  小红书收藏夹「逐条走访」侧边栏 — 一键加载全部收藏、逐条打开、自动取消收藏、队列搜索、进度持久化
// @match        https://www.xiaohongshu.com/*
// @run-at       document-start
// @license      MIT
// @author       wickes1
// @grant        none
// @homepageURL  https://github.com/wickes1/xhs-favorites-walker
// @supportURL   https://github.com/wickes1/xhs-favorites-walker/issues
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/t2cn.js
// ==/UserScript==

(function() {
  'use strict';

  const VERSION = '1.0.0';
  const STATE_KEY = 'xhsWalker_state_v12';
  const QUEUE_KEY = 'xhsWalker_queue_v12';
  const PENDING_KEY = 'xhsWalker_pendingUncollect_v16';
  const UI_KEY = 'xhsWalker_ui_v30';
  const USER_ID_KEY = 'xhsWalker_userId';
  const SIDEBAR_W = 260;

  console.log(`%c[Walker v${VERSION}]`, 'background:#1890ff;color:#fff;padding:2px 6px;border-radius:3px;');

  // ----- Storage ----------------------------------------------------------

  function loadState() {
    try { return Object.assign({ idx: -1, total: 0, loadedAt: null },
                                JSON.parse(localStorage.getItem(STATE_KEY)) || {}); }
    catch (e) { return { idx: -1, total: 0, loadedAt: null }; }
  }
  function saveState(s) { localStorage.setItem(STATE_KEY, JSON.stringify(s)); }
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; }
    catch (e) { return []; }
  }
  function loadUi() {
    try { return Object.assign({ collapsed: false, autoUncollect: true, listExpanded: false, navCompact: false },
                                JSON.parse(localStorage.getItem(UI_KEY)) || {}); }
    catch (e) { return { collapsed: false, autoUncollect: true, listExpanded: false, navCompact: false }; }
  }
  function saveUi(patch) {
    const next = Object.assign(loadUi(), patch);
    localStorage.setItem(UI_KEY, JSON.stringify(next));
    return next;
  }

  // ----- Utils ------------------------------------------------------------

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const toSC = typeof OpenCC !== 'undefined' ? OpenCC.Converter({ from: 'tw', to: 'cn' }) : s => s;

  function getUserStore() {
    return document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get('user');
  }
  function currentNoteIdFromUrl() {
    const m = location.pathname.match(/^\/(?:explore|user\/profile\/[^/]+)\/([0-9a-f]{24})\/?$/);
    return m ? m[1] : null;
  }

  // Detect the currently-logged-in user's 24-hex profile ID, used to build
  // /user/profile/<uid>/<noteId> URLs. Falls back through multiple sources;
  // if none work, buildHref uses the /explore/ URL form which needs no UID.
  function detectUserId() {
    const cached = localStorage.getItem(USER_ID_KEY);
    if (cached && /^[0-9a-f]{24}$/.test(cached)) return cached;

    const store = getUserStore();
    const probes = [
      store?.$state?.userInfo?.userId,
      store?.$state?.userInfo?.user_id,
      store?.$state?.userInfo?.id,
      store?.$state?.userInfo?.redId,
      store?.$state?.user?.userId,
      store?.$state?.userId,
    ];
    for (const v of probes) {
      if (typeof v === 'string' && /^[0-9a-f]{24}$/.test(v)) {
        localStorage.setItem(USER_ID_KEY, v);
        return v;
      }
    }

    const m = location.pathname.match(/^\/user\/profile\/([0-9a-f]{24})/);
    if (m) {
      localStorage.setItem(USER_ID_KEY, m[1]);
      return m[1];
    }
    return null;
  }

  function buildHref(item) {
    const uid = detectUserId();
    const qs = '?xsec_token=' + encodeURIComponent(item.x) + '&xsec_source=pc_user';
    return uid
      ? '/user/profile/' + uid + '/' + item.id + qs
      : '/explore/' + item.id + qs;
  }

  // ----- Pinia favorites loader ------------------------------------------

  async function loadAllFavs(onProgress) {
    const store = getUserStore();
    if (!store) return { err: 'no-store' };
    if (!store.$state.notes?.[1]) return { err: 'no-favorites-array' };

    let calls = 0, sameCount = 0;
    while (store.$state.noteQueries?.[1]?.hasMore !== false && calls < 200) {
      const before = store.$state.notes[1].length;
      try { await store.fetchNotes(); }
      catch (e) { return { err: e.message }; }
      const after = store.$state.notes[1].length;
      calls++;
      onProgress?.(after);
      if (after === before) { sameCount++; if (sameCount >= 3) break; }
      else sameCount = 0;
      await sleep(300);
    }
    const queue = store.$state.notes[1].map(n => {
      const c = n.noteCard || {};
      return {
        id: c.noteId || n.id,
        x: n.xsecToken || c.xsecToken || '',
        t: c.displayTitle || '(无标题)',
        a: c.user?.nickname || ''
      };
    });
    return { queue };
  }

  // ----- CSS injection ---------------------------------------------------

  function injectStyles() {
    if (document.getElementById('__xhsWalkerStyles')) return;
    const style = document.createElement('style');
    style.id = '__xhsWalkerStyles';
    style.textContent = `
      /* === Layout: Walker fixed on the right, body width shrinks to fit. === */
      html.xhsW-active body {
        max-width: calc(100vw - ${SIDEBAR_W}px) !important;
        overflow-x: hidden !important;
        box-sizing: border-box !important;
        transition: max-width .25s ease;
      }
      html.xhsW-active.xhsW-collapsed body { max-width: calc(100vw - 36px) !important; }

      html.xhsW-active .header-container {
        width: calc(100vw - ${SIDEBAR_W}px) !important;
        max-width: calc(100vw - ${SIDEBAR_W}px) !important;
        box-sizing: border-box !important;
      }
      html.xhsW-active.xhsW-collapsed .header-container {
        width: calc(100vw - 36px) !important;
        max-width: calc(100vw - 36px) !important;
      }
      html.xhsW-active #app, html.xhsW-active #global,
      html.xhsW-active .main-container, html.xhsW-active .outer-link-container,
      html.xhsW-active .note-container, html.xhsW-active .with-side-bar.main-content {
        max-width: 100% !important; box-sizing: border-box !important;
      }

      html.xhsW-active .feeds-page,
      html.xhsW-active .feeds-container,
      html.xhsW-active .feeds-tab-container,
      html.xhsW-active .user-page,
      html.xhsW-active .user,
      html.xhsW-active .tab-content,
      html.xhsW-active .reds-tabs-content,
      html.xhsW-active .note-list,
      html.xhsW-active .channel-container {
        max-width: 100% !important;
        width: 100% !important;
        box-sizing: border-box !important;
        overflow-x: hidden !important;
      }

      /* Compact XHS native left sidebar to claw back horizontal space. */
      html.xhsW-active .side-bar {
        width: 144px !important; min-width: 144px !important;
        transition: width .2s ease;
      }
      html.xhsW-active .side-bar .channel-list-content > li {
        margin: 0 0 2px !important;
        padding-left: 4px !important;
      }
      html.xhsW-active .side-bar .link-wrapper {
        padding: 4px 8px !important;
      }
      html.xhsW-active .with-side-bar.main-content {
        padding-left: 152px !important;
        transition: padding-left .2s ease;
      }

      html.xhsW-navCompact .side-bar { width: 56px !important; min-width: 56px !important; }
      html.xhsW-navCompact .side-bar .channel,
      html.xhsW-navCompact .side-bar .information-container { display: none !important; }
      html.xhsW-navCompact .side-bar .channel-list-content > li { padding-left: 0 !important; }
      html.xhsW-navCompact .side-bar .link-wrapper { padding: 8px !important; justify-content: center !important; }
      html.xhsW-navCompact .with-side-bar.main-content { padding-left: 64px !important; }

      html.xhsW-active .note-container { max-width: 100% !important; box-sizing: border-box !important; }
      html.xhsW-active .note-container > * { min-width: 0 !important; }
      html.xhsW-active .content-container { max-width: 100% !important; }

      /* === Sidebar === */
      #__xhsWalkerSidebar {
        position: fixed; top: 0; right: 0; bottom: 0; width: ${SIDEBAR_W}px;
        z-index: 999999;
        background: linear-gradient(180deg, rgba(20,20,24,0.97) 0%, rgba(28,28,34,0.97) 100%);
        backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
        border-left: 1px solid rgba(255,255,255,0.08);
        color: #e8e8e8;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        display: flex; flex-direction: column;
        box-shadow: -4px 0 24px rgba(0,0,0,0.3);
        transition: transform .25s ease;
        overflow: hidden;
      }
      html.xhsW-collapsed #__xhsWalkerSidebar {
        transform: translateX(${SIDEBAR_W - 36}px);
      }

      #__xhsWalkerSidebar .xhsW_tab {
        position: absolute; top: 50%; left: 0;
        transform: translate(-100%, -50%);
        width: 28px; height: 60px;
        background: rgba(28,28,34,0.97);
        border: 1px solid rgba(255,255,255,0.08); border-right: 0;
        border-radius: 8px 0 0 8px;
        display: flex; align-items: center; justify-content: center;
        color: #69c0ff; cursor: pointer; font-size: 16px;
        backdrop-filter: blur(18px);
      }
      #__xhsWalkerSidebar .xhsW_tab:hover { background: rgba(40,40,50,0.97); }

      #__xhsWalkerSidebar .xhsW_scroll {
        flex: 1; overflow-y: auto; overflow-x: hidden;
        scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent;
      }
      #__xhsWalkerSidebar .xhsW_scroll::-webkit-scrollbar { width: 6px; }
      #__xhsWalkerSidebar .xhsW_scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12); border-radius: 3px;
      }

      #__xhsWalkerSidebar .xhsW_header {
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex; align-items: center; justify-content: space-between;
        flex: 0 0 auto;
      }
      #__xhsWalkerSidebar .xhsW_brand {
        font-weight: 700; font-size: 14px; color: #69c0ff; letter-spacing: 0.3px;
      }
      #__xhsWalkerSidebar .xhsW_ver { color:#666; font-size:10px; margin-left:6px; }

      #__xhsWalkerSidebar .xhsW_section {
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
      }
      #__xhsWalkerSidebar .xhsW_label {
        text-transform: uppercase; font-size: 10px; letter-spacing: 1px;
        color: #888; margin-bottom: 6px; font-weight: 600;
        display: flex; justify-content: space-between; align-items: center;
        user-select: none;
      }
      #__xhsWalkerSidebar .xhsW_label.expandable { cursor: pointer; }
      #__xhsWalkerSidebar .xhsW_label .arrow { transition: transform .15s; color:#666; }
      #__xhsWalkerSidebar .xhsW_label.expanded .arrow { transform: rotate(90deg); }

      #__xhsWalkerSidebar #xhsW_status { font-size: 13px; color: #ccc; margin-bottom: 4px; }
      #__xhsWalkerSidebar #xhsW_status b { color: #fff; font-size: 16px; }
      #__xhsWalkerSidebar .xhsW_age { font-size: 10px; color: #666; margin-top: 2px; }

      #__xhsWalkerSidebar #xhsW_title {
        font-size: 12px; line-height: 1.5; color: #e0e0e0;
        background: rgba(105,192,255,0.06);
        border-left: 3px solid #69c0ff;
        padding: 8px 10px; border-radius: 0 6px 6px 0;
        max-height: 80px; overflow: hidden;
      }
      #__xhsWalkerSidebar #xhsW_title.empty { display: none; }
      #__xhsWalkerSidebar #xhsW_title b { color: #fff; }
      #__xhsWalkerSidebar #xhsW_title .author { color: #888; font-size: 10px; }

      #__xhsWalkerSidebar button {
        font-family: inherit; cursor: pointer; transition: all 0.15s ease;
      }
      #__xhsWalkerSidebar .xhsW_btn-primary {
        width: 100%;
        background: linear-gradient(135deg,#1890ff 0%,#096dd9 100%);
        color: #fff; border: 0;
        padding: 12px; border-radius: 8px;
        font-weight: 600; font-size: 14px; margin-bottom: 8px;
        box-shadow: 0 2px 8px rgba(24,144,255,0.3);
      }
      #__xhsWalkerSidebar .xhsW_btn-primary:hover { box-shadow: 0 4px 12px rgba(24,144,255,0.5); transform: translateY(-1px); }

      #__xhsWalkerSidebar .xhsW_btn-secondary {
        width: 100%;
        background: rgba(82,196,26,0.12);
        color: #95de64;
        border: 1px solid rgba(82,196,26,0.3);
        padding: 9px; border-radius: 6px;
        font-size: 12px; font-weight: 500;
      }
      #__xhsWalkerSidebar .xhsW_btn-secondary:hover { background: rgba(82,196,26,0.2); }
      #__xhsWalkerSidebar .xhsW_btn-secondary:disabled { opacity: 0.5; cursor: wait; }

      #__xhsWalkerSidebar .xhsW_btn-row {
        display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;
        margin-top: 8px;
      }
      #__xhsWalkerSidebar .xhsW_btn-tiny {
        background: rgba(255,255,255,0.05);
        color: #aaa;
        border: 1px solid rgba(255,255,255,0.08);
        padding: 7px; border-radius: 5px; font-size: 11px;
      }
      #__xhsWalkerSidebar .xhsW_btn-tiny:hover { background: rgba(255,255,255,0.1); color: #fff; }
      #__xhsWalkerSidebar .xhsW_btn-tiny.danger:hover { background: rgba(255,77,79,0.2); color:#ff7875; border-color: rgba(255,77,79,0.4); }

      #__xhsWalkerSidebar #xhsW_hint {
        margin-top: 8px; padding: 6px 10px; font-size: 11px;
        color: #ffa940; background: rgba(250,173,20,0.08);
        border-radius: 4px; min-height: 14px;
        opacity: 0.55; transition: opacity .3s, background .3s;
      }
      #__xhsWalkerSidebar #xhsW_hint.flash {
        opacity: 1; background: rgba(250,173,20,0.18);
      }
      #__xhsWalkerSidebar #xhsW_hint:empty { display: none; }

      #__xhsWalkerSidebar .xhsW_toggle-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 0; font-size: 12px; color: #ccc;
      }
      #__xhsWalkerSidebar .xhsW_switch {
        position: relative; display: inline-block; width: 32px; height: 18px;
        cursor: pointer;
      }
      #__xhsWalkerSidebar .xhsW_switch input { opacity: 0; width: 0; height: 0; }
      #__xhsWalkerSidebar .xhsW_switch .slider {
        position: absolute; inset: 0;
        background: rgba(255,255,255,0.15); border-radius: 18px;
        transition: background .2s;
      }
      #__xhsWalkerSidebar .xhsW_switch .slider::before {
        content: ''; position: absolute; left: 2px; top: 2px;
        width: 14px; height: 14px;
        background: #fff; border-radius: 50%;
        transition: transform .2s;
      }
      #__xhsWalkerSidebar .xhsW_switch input:checked + .slider { background: #1890ff; }
      #__xhsWalkerSidebar .xhsW_switch input:checked + .slider::before { transform: translateX(14px); }

      #__xhsWalkerSidebar #xhsW_list {
        max-height: 320px; overflow-y: auto;
        margin-top: 6px;
        border-radius: 6px; background: rgba(0,0,0,0.2);
        font-size: 11px;
      }
      #__xhsWalkerSidebar #xhsW_list::-webkit-scrollbar { width: 6px; }
      #__xhsWalkerSidebar #xhsW_list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      #__xhsWalkerSidebar .xhsW_listItem {
        padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.04);
        cursor: pointer; line-height: 1.4;
        display: flex; gap: 6px;
      }
      #__xhsWalkerSidebar .xhsW_listItem:hover { background: rgba(105,192,255,0.08); }
      #__xhsWalkerSidebar .xhsW_listItem .num {
        flex: 0 0 28px; color: #666; font-size: 10px; padding-top: 1px;
      }
      #__xhsWalkerSidebar .xhsW_listItem .txt {
        flex: 1; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      #__xhsWalkerSidebar .xhsW_listItem.current {
        background: rgba(24,144,255,0.18); border-left: 2px solid #69c0ff;
      }
      #__xhsWalkerSidebar .xhsW_listItem.current .num,
      #__xhsWalkerSidebar .xhsW_listItem.current .txt { color: #fff; font-weight: 600; }
      #__xhsWalkerSidebar .xhsW_listItem.visited .num,
      #__xhsWalkerSidebar .xhsW_listItem.visited .txt { color: #555; }

      #__xhsWalkerSidebar #xhsW_filter {
        width: 100%; box-sizing: border-box;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: #e0e0e0; padding: 6px 8px;
        border-radius: 4px; font-size: 11px;
        margin-top: 6px; outline: none;
        font-family: inherit;
      }
      #__xhsWalkerSidebar #xhsW_filter:focus {
        border-color: rgba(105,192,255,0.4);
        background: rgba(255,255,255,0.08);
      }
      #__xhsWalkerSidebar #xhsW_filter::placeholder { color: #555; }

      #__xhsWalkerSidebar .xhsW_help {
        padding: 12px 16px; font-size: 11px; color: #888;
        line-height: 1.7; background: rgba(0,0,0,0.25);
      }
      #__xhsWalkerSidebar .xhsW_help b { color: #aaa; }

      .note-container .note-content,
      .note-container .desc { font-size: 15px !important; line-height: 1.7 !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
    applyHtmlClasses();
  }

  function applyHtmlClasses() {
    const ui = loadUi();
    const html = document.documentElement;
    html.classList.add('xhsW-active');
    html.classList.toggle('xhsW-collapsed', !!ui.collapsed);
    html.classList.toggle('xhsW-navCompact', !!ui.navCompact);
  }

  // ----- Sidebar UI ------------------------------------------------------

  function buildSidebar() {
    if (document.getElementById('__xhsWalkerSidebar')) return;
    if (!document.body) return;
    injectStyles();

    const ui = loadUi();
    const aside = document.createElement('aside');
    aside.id = '__xhsWalkerSidebar';
    aside.innerHTML = `
      <div class="xhsW_tab" id="xhsW_toggle" title="收起/展开">${ui.collapsed ? '⟨' : '⟩'}</div>

      <div class="xhsW_header">
        <span><span class="xhsW_brand">收藏 Walker</span><span class="xhsW_ver">v${VERSION}</span></span>
      </div>

      <div class="xhsW_scroll">
        <div class="xhsW_section">
          <div class="xhsW_label"><span>进度</span></div>
          <div id="xhsW_status">尚未加载</div>
        </div>

        <div class="xhsW_section">
          <div class="xhsW_label"><span>当前笔记</span></div>
          <div id="xhsW_title" class="empty"></div>
        </div>

        <div class="xhsW_section">
          <button id="xhsW_next" class="xhsW_btn-primary">下一个 →</button>
          <button id="xhsW_load" class="xhsW_btn-secondary">加载/刷新队列</button>
          <div class="xhsW_btn-row">
            <button id="xhsW_back" class="xhsW_btn-tiny">← 上一</button>
            <button id="xhsW_jump" class="xhsW_btn-tiny">跳到</button>
            <button id="xhsW_reset" class="xhsW_btn-tiny danger">重置</button>
          </div>
          <div id="xhsW_hint"></div>
        </div>

        <div class="xhsW_section">
          <div class="xhsW_label expandable" data-section="list">
            <span>笔记列表</span><span class="arrow">▶</span>
          </div>
          <input type="text" id="xhsW_filter" placeholder="搜索笔记..." style="display:none;">
          <div id="xhsW_list" style="display:none;"></div>
        </div>

        <div class="xhsW_section">
          <div class="xhsW_label"><span>设置</span></div>
          <div class="xhsW_toggle-row">
            <span>自动取消收藏</span>
            <label class="xhsW_switch">
              <input type="checkbox" id="xhsW_autoToggle" ${ui.autoUncollect ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
          <div class="xhsW_toggle-row">
            <span>左栏只显示图标</span>
            <label class="xhsW_switch">
              <input type="checkbox" id="xhsW_navCompactToggle" ${ui.navCompact ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="xhsW_help">
          <b>使用方式:</b><br>
          <b>留</b> — 点收藏 → 加入专辑<br>
          <b>不要</b> — 直接「下一个」<br>
          自动取消可关闭(纯导航模式)
        </div>
      </div>
    `;
    document.body.appendChild(aside);
    render();
    if (ui.listExpanded) toggleListExpanded(true);
  }

  // ----- Render (single source of truth) ---------------------------------

  function render() {
    const queue = loadQueue();
    const s = loadState();

    const statusEl = document.getElementById('xhsW_status');
    if (statusEl) {
      const age = s.loadedAt ? `<div class="xhsW_age">${Math.floor((Date.now() - s.loadedAt) / 60000)} 分钟前加载</div>` : '';
      if (queue.length === 0) statusEl.innerHTML = `<span style="color:#ff7875;">尚未加载</span>`;
      else if (s.idx < 0) statusEl.innerHTML = `<b>准备开始</b> / ${queue.length}${age}`;
      else if (s.idx >= queue.length) statusEl.innerHTML = `<b>${queue.length}</b> / ${queue.length} · 末尾${age}`;
      else statusEl.innerHTML = `<b>${s.idx + 1}</b> / ${queue.length}${age}`;
    }

    const titleEl = document.getElementById('xhsW_title');
    if (titleEl) {
      const item = (s.idx >= 0 && s.idx < queue.length) ? queue[s.idx] : null;
      if (!item) { titleEl.classList.add('empty'); titleEl.innerHTML = ''; }
      else {
        titleEl.classList.remove('empty');
        titleEl.innerHTML = `<b>#${s.idx + 1}</b> ${escapeHtml(item.t)}<br><span class="author">— ${escapeHtml(item.a)}</span>`;
      }
    }

    const list = document.getElementById('xhsW_list');
    if (list && list.style.display !== 'none') renderList(queue, s.idx);
  }

  function getFilterText() {
    const el = document.getElementById('xhsW_filter');
    return el ? el.value.trim().toLowerCase() : '';
  }

  function renderList(queue, currentIdx) {
    const list = document.getElementById('xhsW_list');
    if (!list) return;
    if (queue.length === 0) { list.innerHTML = '<div style="padding:10px;color:#666;">先加载队列</div>'; return; }
    const f = getFilterText();
    const fNorm = f ? toSC(f) : '';
    const html = queue.map((it, i) => {
      if (fNorm && !toSC(it.t).toLowerCase().includes(fNorm)) return '';
      const cls = i === currentIdx ? 'current' : (i < currentIdx ? 'visited' : '');
      return `<div class="xhsW_listItem ${cls}" data-idx="${i}"><span class="num">${i + 1}</span><span class="txt">${escapeHtml(it.t)}</span></div>`;
    }).join('');
    list.innerHTML = html || '<div style="padding:10px;color:#666;">无匹配结果</div>';
    if (!f) {
      const cur = list.querySelector('.current');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  // ----- Hint with cancellable timer ------------------------------------

  let hintTimer = null;
  function flashHint(text) {
    const el = document.getElementById('xhsW_hint');
    if (!el) return;
    el.textContent = text;
    el.classList.add('flash');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('flash'), 3000);
  }

  // ----- Actions ---------------------------------------------------------

  async function onLoad() {
    const btn = document.getElementById('xhsW_load');
    const store = getUserStore();
    if (!store) { flashHint('Pinia 还没就绪'); return; }
    if (!store.$state.notes?.[1]) { flashHint('请先到「我的主页 → 收藏 → 笔记」'); return; }
    btn.disabled = true;
    btn.textContent = '加载中... 0';
    const result = await loadAllFavs(n => { btn.textContent = `加载中... ${n}`; });
    if (!result || result.err) {
      btn.textContent = `失败(${result?.err || 'unknown'})`;
      btn.disabled = false;
      return;
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(result.queue));
    saveState({ idx: -1, total: result.queue.length, loadedAt: Date.now() });
    btn.textContent = `已缓存 ${result.queue.length} 条`;
    btn.disabled = false;
    render();
  }

  let advancing = false;
  async function advance(delta) {
    if (advancing) return;
    advancing = true;
    try {
      const queue = loadQueue();
      if (queue.length === 0) { flashHint('队列为空'); return; }
      const s = loadState();
      s.idx = Math.max(-1, Math.min(queue.length, (s.idx ?? -1) + delta));
      saveState(s);
      render();
      if (s.idx >= 0 && s.idx < queue.length) navigateToItem(queue[s.idx]);
    } finally {
      setTimeout(() => { advancing = false; }, 800);
    }
  }

  function jumpTo(idx) {
    const queue = loadQueue();
    if (idx < 0 || idx >= queue.length) return;
    const s = loadState();
    s.idx = idx;
    saveState(s);
    render();
    navigateToItem(queue[idx]);
  }

  function navigateToItem(item) {
    console.log('[Walker] →', item.id, item.t);
    const ui = loadUi();
    if (ui.autoUncollect) {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ noteId: item.id, ts: Date.now() }));
    } else {
      localStorage.removeItem(PENDING_KEY);
    }
    const a = document.createElement('a');
    a.href = buildHref(item);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function toggleCollapsed() {
    const ui = saveUi({ collapsed: !loadUi().collapsed });
    applyHtmlClasses();
    const ch = ui.collapsed ? '⟨' : '⟩';
    const tab = document.getElementById('xhsW_toggle'); if (tab) tab.textContent = ch;
  }

  function toggleListExpanded(forceState) {
    const ui = loadUi();
    const next = forceState !== undefined ? forceState : !ui.listExpanded;
    saveUi({ listExpanded: next });
    const list = document.getElementById('xhsW_list');
    const filter = document.getElementById('xhsW_filter');
    const label = document.querySelector('#__xhsWalkerSidebar [data-section="list"]');
    if (list) list.style.display = next ? 'block' : 'none';
    if (filter) filter.style.display = next ? 'block' : 'none';
    if (label) label.classList.toggle('expanded', next);
    if (next) renderList(loadQueue(), loadState().idx);
  }

  // ----- Auto-uncollect (post page-reload) -------------------------------

  async function autoUncollect(targetId) {
    flashHint('等待页面加载...');
    const startTs = Date.now();
    let wrapper = null;
    while (Date.now() - startTs < 12000) {
      if (location.search.includes('source=404')) { flashHint('死贴(404)— 按下一个'); return; }
      if (currentNoteIdFromUrl() === targetId) {
        const w = document.querySelector('.collect-wrapper');
        if (w?.querySelector('.count')?.innerText) { wrapper = w; break; }
      }
      await sleep(150);
    }
    if (!wrapper) { flashHint('wrapper 没加载,请手动处理'); return; }

    await sleep(400);
    const before = wrapper.querySelector('use')?.getAttribute('xlink:href');
    if (before === '#collect') { flashHint('已是未收藏'); return; }
    if (before !== '#collected') { flashHint('状态异常: ' + before); return; }

    wrapper.click();
    await sleep(400);
    if (document.querySelector('.collect-wrapper')?.querySelector('use')?.getAttribute('xlink:href') === '#collect') {
      flashHint('已自动取消收藏');
      return;
    }

    const icon = wrapper.querySelector('svg, .reds-icon');
    if (icon) {
      const opts = { bubbles: true, cancelable: true, view: window };
      icon.dispatchEvent(new MouseEvent('mousedown', opts));
      icon.dispatchEvent(new MouseEvent('mouseup', opts));
      icon.dispatchEvent(new MouseEvent('click', opts));
      await sleep(500);
      if (document.querySelector('.collect-wrapper')?.querySelector('use')?.getAttribute('xlink:href') === '#collect') {
        flashHint('已自动取消收藏 (fallback)');
        return;
      }
    }
    flashHint('自动取消失败,请手动点收藏');
  }

  async function checkPendingUncollect() {
    let pending;
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY)); }
    catch (e) { return; }
    if (!pending) return;
    if (Date.now() - pending.ts > 30000) { localStorage.removeItem(PENDING_KEY); return; }
    if (currentNoteIdFromUrl() !== pending.noteId) return;
    localStorage.removeItem(PENDING_KEY);
    await sleep(800);
    await autoUncollect(pending.noteId);
  }

  // ----- Event delegation ------------------------------------------------

  if (!window.__xhsWalkerDelegated) {
    document.addEventListener('click', e => {
      const listItem = e.target.closest('.xhsW_listItem');
      if (listItem && listItem.dataset.idx) {
        e.stopPropagation(); e.preventDefault();
        jumpTo(parseInt(listItem.dataset.idx, 10));
        return;
      }
      const sectionLabel = e.target.closest('[data-section="list"]');
      if (sectionLabel) {
        e.stopPropagation(); e.preventDefault();
        toggleListExpanded();
        return;
      }
      const btn = e.target.closest('button');
      if (!btn?.id?.startsWith('xhsW_')) return;
      e.stopPropagation(); e.preventDefault();
      switch (btn.id) {
        case 'xhsW_load':   onLoad(); break;
        case 'xhsW_next':   advance(1); break;
        case 'xhsW_back':   advance(-1); break;
        case 'xhsW_toggle': toggleCollapsed(); break;
        case 'xhsW_jump': {
          const total = loadQueue().length;
          if (total === 0) { alert('请先加载队列'); return; }
          const v = prompt(`跳到第几个?(1 - ${total})`);
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 1 && n <= total) jumpTo(n - 1);
          break;
        }
        case 'xhsW_reset':
          if (confirm('重置 walker?(只重置进度,不清队列)')) {
            const cur = loadState();
            saveState({ idx: -1, total: cur.total, loadedAt: cur.loadedAt });
            render();
          }
          break;
      }
    }, true);

    document.addEventListener('change', e => {
      if (e.target.id === 'xhsW_autoToggle') {
        saveUi({ autoUncollect: e.target.checked });
        flashHint(e.target.checked ? '自动取消已开' : '自动取消已关');
      } else if (e.target.id === 'xhsW_navCompactToggle') {
        saveUi({ navCompact: e.target.checked });
        applyHtmlClasses();
        flashHint(e.target.checked ? '左栏已收为图标' : '左栏已展开');
      }
    }, true);

    document.addEventListener('input', e => {
      if (e.target.id === 'xhsW_filter') {
        renderList(loadQueue(), loadState().idx);
      }
    }, true);

    window.__xhsWalkerDelegated = true;
  }

  // ----- Init ------------------------------------------------------------

  function init() {
    injectStyles();
    buildSidebar();
    checkPendingUncollect();
  }

  applyHtmlClasses();

  if (document.body) init();
  else window.addEventListener('DOMContentLoaded', init);

  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => { buildSidebar(); checkPendingUncollect(); });
  }

  setInterval(() => {
    if (!document.getElementById('__xhsWalkerSidebar') && document.body) buildSidebar();
  }, 2000);
})();
