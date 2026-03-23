/**
 * platform.js — 平台适配层
 *
 * Electron 环境：直接转发给 preload 注入的 window.hana（IPC）
 * Web 环境：降级到 HTTP API + 浏览器原生 API
 *
 * 使用方式：所有前端代码调 platform.xxx()，不再直接碰 window.hana。
 */
(function () {
  if (window.hana) {
    // Electron — 直接用 preload 注入的 IPC bridge
    window.platform = window.hana;
    return;
  }

  // Web / 非 Electron 环境 — HTTP fallback
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || localStorage.getItem("hana-token") || "";
  const baseUrl = `${location.protocol}//${location.host}`;
  const popupWindows = new Map();
  const settingsChannel = "hana-web-settings";
  const browserUpdateCallbacks = new Set();
  let browserPollTimer = null;

  function apiFetch(path, opts = {}) {
    const headers = { ...opts.headers };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { ...opts, headers });
  }

  function openPopup(name, url, features = "width=1200,height=820,resizable=yes,scrollbars=yes") {
    const key = String(name || "popup");
    const existing = popupWindows.get(key);
    if (existing && !existing.closed) {
      existing.focus();
      return existing;
    }
    const win = window.open(url, key, features);
    if (win) popupWindows.set(key, win);
    return win;
  }

  async function pollBrowserStatus() {
    try {
      const res = await apiFetch("/api/browser/status");
      if (!res.ok) return;
      const data = await res.json();
      const payload = {
        title: data.title || "",
        canGoBack: false,
        canGoForward: false,
        running: !!data.running,
      };
      for (const cb of browserUpdateCallbacks) {
        try { cb(payload); } catch {}
      }
    } catch {}
  }

  function ensureBrowserPolling() {
    if (browserPollTimer || browserUpdateCallbacks.size === 0) return;
    pollBrowserStatus();
    browserPollTimer = setInterval(pollBrowserStatus, 1200);
  }

  function maybeStopBrowserPolling() {
    if (browserUpdateCallbacks.size > 0) return;
    if (browserPollTimer) clearInterval(browserPollTimer);
    browserPollTimer = null;
  }

  const _fileWatchers = new Map();
  const _fileChangedCallbacks = new Set();
  const _emitFileChanged = (filePath) => {
    for (const cb of _fileChangedCallbacks) {
      try { cb(filePath); } catch {}
    }
  };
  window.addEventListener("beforeunload", () => {
    for (const st of _fileWatchers.values()) {
      if (st?.timer) clearInterval(st.timer);
    }
    _fileWatchers.clear();
  });

  async function _readText(filePath) {
    try {
      const res = await apiFetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`);
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  }

  window.platform = {
    // 服务器连接
    getServerPort: async () => location.port || "3000",
    getServerToken: async () => token,
    appReady: async () => {},

    // 文件 I/O → server HTTP
    readFile: (p) => apiFetch(`/api/fs/read?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readFileBase64: (p) => apiFetch(`/api/fs/read-base64?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readDocxHtml: (p) => apiFetch(`/api/fs/docx-html?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readXlsxHtml: (p) => apiFetch(`/api/fs/xlsx-html?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),

    // 文件写入 / 监听（Web 版通过 server API + 轮询实现）
    writeFile: async (filePath, content) => {
      try {
        const res = await apiFetch("/api/fs/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: filePath, content }),
        });
        return !!(res.ok && (await res.json()).ok);
      } catch {
        return false;
      }
    },
    watchFile: async (filePath) => {
      if (!filePath) return false;
      if (_fileWatchers.has(filePath)) {
        clearInterval(_fileWatchers.get(filePath).timer);
        _fileWatchers.delete(filePath);
      }
      const first = await _readText(filePath);
      const state = { last: first, timer: null };
      state.timer = setInterval(async () => {
        const next = await _readText(filePath);
        if (next == null) return;
        if (state.last !== next) {
          state.last = next;
          _emitFileChanged(filePath);
        }
      }, 1200);
      _fileWatchers.set(filePath, state);
      return true;
    },
    unwatchFile: async (filePath) => {
      const st = _fileWatchers.get(filePath);
      if (st?.timer) clearInterval(st.timer);
      _fileWatchers.delete(filePath);
      return true;
    },
    onFileChanged: (cb) => {
      if (typeof cb === "function") _fileChangedCallbacks.add(cb);
    },
    // 编辑器窗口在 Web 单页下退化为同页体验
    openEditorWindow: (data) => {
      const payload = encodeURIComponent(JSON.stringify(data || {}));
      const url = `${baseUrl}/editor-window.html?token=${encodeURIComponent(token)}&payload=${payload}`;
      openPopup("hana-editor-window", url, "width=1080,height=760,resizable=yes,scrollbars=yes");
    },
    onEditorDockFile: () => {},
    onEditorDetached: () => {},

    // 文件路径（Web 不支持系统路径）
    getFilePath: () => null,
    getAvatarPath: () => null,
    getSplashInfo: async () => ({}),

    // 系统对话框 → Web 降级（使用服务端工作空间，不读取浏览器本地目录）
    selectFolder: async () => {
      const w = openPopup("hana-folder-picker", "about:blank", "width=760,height=620,resizable=yes,scrollbars=yes");
      if (!w) return null;
      const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Select Folder</title>
        <style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#0f1115;color:#eaeef5}
        .bar{display:flex;gap:8px;padding:10px;border-bottom:1px solid #2a2f3a}
        button{background:#2a6df4;border:none;color:#fff;padding:6px 10px;border-radius:8px;cursor:pointer}
        button.sec{background:#2a2f3a}.list{padding:10px;max-height:470px;overflow:auto}
        .item{padding:8px 10px;border-radius:8px;cursor:pointer}.item:hover{background:#202531}
        .path{padding:8px 10px;font-size:12px;color:#9aa4b2;border-top:1px solid #2a2f3a;word-break:break-all}
        .hint{padding:10px;color:#9aa4b2;font-size:13px}</style></head>
        <body><div class="bar"><button id="up" class="sec">⬆</button><button id="choose">选择当前目录</button></div>
        <div id="list" class="list"></div><div id="path" class="path"></div></body></html>`);
      const doc = w.document;
      const listEl = doc.getElementById("list");
      const pathEl = doc.getElementById("path");
      const upBtn = doc.getElementById("up");
      const chooseBtn = doc.getElementById("choose");
      let current = "";
      let parent = "";
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        try { w.close(); } catch {}
        return val;
      };
      const loadDir = async (dir) => {
        const qs = dir ? `?dir=${encodeURIComponent(dir)}` : "";
        const res = await apiFetch(`/api/desk/folders${qs}`);
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        current = data.current || "";
        parent = data.parent || "";
        pathEl.textContent = current || "";
        listEl.innerHTML = "";
        const folders = Array.isArray(data.folders) ? data.folders : [];
        if (!folders.length) {
          const hint = doc.createElement("div");
          hint.className = "hint";
          hint.textContent = "当前目录下没有可进入的子目录";
          listEl.appendChild(hint);
        }
        for (const f of folders) {
          const row = doc.createElement("div");
          row.className = "item";
          row.innerHTML = "📁 " + esc(f.name) + `<div style="font-size:11px;color:#98a2b3">${esc(f.path)}</div>`;
          row.onclick = () => loadDir(f.path).catch(() => {});
          listEl.appendChild(row);
        }
      };
      await loadDir("");
      upBtn.onclick = () => { if (parent) loadDir(parent).catch(() => {}); };
      chooseBtn.onclick = () => { done = true; };
      return await new Promise((resolve) => {
        const timer = setInterval(() => {
          if (done) {
            clearInterval(timer);
            resolve(finish(current) || null);
          } else if (w.closed) {
            clearInterval(timer);
            resolve(null);
          }
        }, 200);
      });
    },
    selectSkill: async () => {
      try {
        if ("showOpenFilePicker" in window) {
          const [fh] = await window.showOpenFilePicker({
            multiple: false,
            types: [
              { description: "Skill file", accept: { "application/zip": [".zip", ".skill"], "text/markdown": [".md"] } },
            ],
          });
          return fh?.name ? `[web-file] ${fh.name}` : null;
        }
      } catch {}
      return null;
    },

    // OS 集成 → 静默降级
    openFolder: () => {},
    openFile: () => {},
    openExternal: (url) => { try { window.open(url, "_blank"); } catch {} },
    showInFinder: () => {},
    startDrag: (filePaths) => {
      const list = Array.isArray(filePaths) ? filePaths : [filePaths];
      for (const p of list.filter(Boolean)) {
        const a = document.createElement("a");
        a.href = `${baseUrl}/api/fs/download?path=${encodeURIComponent(p)}`;
        a.download = "";
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    },

    // 窗口管理 → 单页降级
    openSettings: () => {
      const url = `${baseUrl}/settings.html?token=${encodeURIComponent(token)}`;
      const win = openPopup("hana-settings", url, "width=980,height=760,resizable=yes,scrollbars=yes");
      if (win) win.focus();
    },
    reloadMainWindow: () => location.reload(),

    // 设置通信 → Web 环境暂不支持跨窗口
    settingsChanged: (type, data) => {
      try {
        localStorage.setItem(settingsChannel, JSON.stringify({ ts: Date.now(), type, data }));
      } catch {}
    },
    onSettingsChanged: (cb) => {
      const handler = (e) => {
        if (e.key !== settingsChannel || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue);
          cb?.(data.type, data.data);
        } catch {}
      };
      window.addEventListener("storage", handler);
    },

    // 浏览器查看器 → Web 环境暂不支持
    openBrowserViewer: (url) => {
      const qs = new URLSearchParams();
      if (token) qs.set("token", token);
      if (url) qs.set("url", url);
      openPopup("hana-browser-viewer", `${baseUrl}/browser-viewer.html?${qs.toString()}`);
    },
    closeBrowserViewer: () => {},
    onBrowserUpdate: (cb) => {
      if (typeof cb !== "function") return;
      browserUpdateCallbacks.add(cb);
      ensureBrowserPolling();
      return () => {
        browserUpdateCallbacks.delete(cb);
        maybeStopBrowserPolling();
      };
    },
    browserGoBack: () => {},
    browserGoForward: () => {},
    browserReload: () => {},
    browserEmergencyStop: () => {},

    // Skill 查看器 → Web 环境暂不支持
    openSkillViewer: (opts) => {
      const evt = new CustomEvent("hana:show-skill-viewer", { detail: opts || {} });
      window.dispatchEvent(evt);
    },
    listSkillFiles: async (baseDir) => {
      try {
        const res = await apiFetch(`/api/skills/tree?baseDir=${encodeURIComponent(baseDir || "")}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.files) ? data.files : [];
      } catch {
        return [];
      }
    },
    readSkillFile: async (filePath) => {
      try {
        const res = await apiFetch(`/api/skills/read?path=${encodeURIComponent(filePath || "")}`);
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    },
    onSkillViewerLoad: () => {},
    closeSkillViewer: () => {},

    // Onboarding
    onboardingComplete: async () => {},
    debugOpenOnboarding: async () => {},
    debugOpenOnboardingPreview: async () => {},

    // 窗口控制（Web 不需要）
    getPlatform: async () => "web",
    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    windowIsMaximized: async () => false,
    onMaximizeChange: () => {},
  };
  // 兼容仍调用 window.hana 的页面（browser-viewer / editor-window）
  if (!window.hana) window.hana = window.platform;
})();

// ── 平台检测 ──
(async function initPlatform() {
  const p = window.platform;
  if (!p?.getPlatform) return;
  const plat = await p.getPlatform();
  document.documentElement.setAttribute("data-platform", plat);
  // Windows/Linux 窗口控制按钮已迁移到 React (App.tsx WindowControls)
})();
