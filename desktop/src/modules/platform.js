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
      try {
        const res = await apiFetch("/api/config");
        if (!res.ok) return null;
        const cfg = await res.json();
        return cfg?.desk?.home_folder || cfg?.last_cwd || cfg?.cwd_history?.[0] || null;
      } catch {}
      return null;
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
