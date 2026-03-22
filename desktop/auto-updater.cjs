/**
 * auto-updater.cjs — 跨平台自动更新
 *
 * 所有平台统一使用 GitHub API 检测新版本，浏览器下载安装包。
 * 不依赖 electron-updater / latest.yml。
 *
 * beta 开关读 preferences.update_channel，通过 IPC 传入。
 */
const { ipcMain, shell } = require("electron");
const { app } = require("electron");

let _mainWindow = null;
let _updateChannel = "stable"; // "stable" | "beta"

let _updateState = {
  status: "idle",      // idle | checking | available | error | latest
  version: null,
  releaseNotes: null,
  releaseUrl: null,     // GitHub release page URL
  downloadUrl: null,    // direct download URL (asset)
  error: null,
};

function getState() {
  return { ..._updateState };
}

function sendToRenderer(channel, data) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send(channel, data);
  }
}

function setState(patch) {
  Object.assign(_updateState, patch);
  sendToRenderer("auto-update-state", getState());
}

function resetState() {
  _updateState = {
    status: "idle", version: null, releaseNotes: null,
    releaseUrl: null, downloadUrl: null, error: null,
  };
}

// ── 版本比较（支持 prerelease） ──
function parseVersion(version) {
  if (!version || typeof version !== "string") {
    return { major: 0, minor: 0, patch: 0, pre: [] };
  }
  const cleaned = version.trim().replace(/^v/i, "").split("+")[0];
  const [core, pre = ""] = cleaned.split("-");
  const [major = 0, minor = 0, patch = 0] = core.split(".").map((n) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : 0;
  });
  const preParts = pre
    ? pre.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p))
    : [];
  return { major, minor, patch, pre: preParts };
}

function comparePre(aPre, bPre) {
  const aHas = aPre.length > 0;
  const bHas = bPre.length > 0;
  if (!aHas && !bHas) return 0;
  if (!aHas) return 1;   // release > prerelease
  if (!bHas) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const a = aPre[i];
    const b = bPre[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aNum = typeof a === "number";
    const bNum = typeof b === "number";
    if (aNum && bNum) return a > b ? 1 : -1;
    if (aNum && !bNum) return -1; // numeric < non-numeric
    if (!aNum && bNum) return 1;
    return String(a).localeCompare(String(b));
  }
  return 0;
}

function compareVersions(a, b) {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (av.major !== bv.major) return av.major > bv.major ? 1 : -1;
  if (av.minor !== bv.minor) return av.minor > bv.minor ? 1 : -1;
  if (av.patch !== bv.patch) return av.patch > bv.patch ? 1 : -1;
  return comparePre(av.pre, bv.pre);
}

function isNewerVersion(latest, current) {
  return compareVersions(latest, current) > 0;
}

// ══════════════════════════════════════
// GitHub API 检测（所有平台共用）
// ══════════════════════════════════════
const GITHUB_RELEASES_URL = "https://api.github.com/repos/liliMozi/openhanako/releases";

/** 根据平台选择对应的安装包后缀 */
function getAssetExt() {
  switch (process.platform) {
    case "win32": return ".exe";
    case "darwin": return ".dmg";
    default: return ".AppImage";
  }
}

async function checkUpdate() {
  setState({ status: "checking", error: null, version: null });
  try {
    // beta: 取所有 releases 的第一个（含 prerelease）
    // stable: 取 /latest（只返回非 prerelease）
    const url = _updateChannel === "beta"
      ? GITHUB_RELEASES_URL + "?per_page=5"
      : GITHUB_RELEASES_URL + "/latest";
    const res = await fetch(url, {
      headers: { "User-Agent": "Hanako" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      setState({ status: "error", error: `GitHub API ${res.status}` });
      return null;
    }
    const data = await res.json();
    // /latest 返回对象；带 per_page 返回数组
    const release = Array.isArray(data) ? pickRelease(data) : data;
    if (!release) {
      setState({ status: "latest" });
      return null;
    }
    const latest = (release.tag_name || "").replace(/^v/, "");
    const current = app.getVersion();
    if (!latest || !isNewerVersion(latest, current)) {
      setState({ status: "latest" });
      return null;
    }
    const ext = getAssetExt();
    const asset = (release.assets || []).find(a => a.name?.endsWith(ext));
    setState({
      status: "available",
      version: latest,
      releaseNotes: release.body || null,
      releaseUrl: release.html_url,
      downloadUrl: asset?.browser_download_url || release.html_url,
    });
    return latest;
  } catch (err) {
    setState({ status: "error", error: err?.message || String(err) });
    return null;
  }
}

/** 从 releases 数组中选出最新的可用 release（beta 模式取第一个，含 prerelease） */
function pickRelease(releases) {
  if (!releases || releases.length === 0) return null;
  if (_updateChannel === "beta") return releases[0];
  return releases.find(r => !r.prerelease && !r.draft) || null;
}

// ══════════════════════════════════════
// 公共 API
// ══════════════════════════════════════

function initAutoUpdater(mainWindow) {
  _mainWindow = mainWindow;

  ipcMain.handle("auto-update-check", async () => {
    resetState();
    return checkUpdate();
  });

  ipcMain.handle("auto-update-download", async () => {
    if (_updateState.downloadUrl) {
      shell.openExternal(_updateState.downloadUrl);
    }
    return true;
  });

  ipcMain.handle("auto-update-install", () => {
    if (_updateState.releaseUrl) {
      shell.openExternal(_updateState.releaseUrl);
    }
  });

  ipcMain.handle("auto-update-state", () => {
    return getState();
  });

  ipcMain.handle("auto-update-set-channel", (_event, channel) => {
    _updateChannel = channel === "beta" ? "beta" : "stable";
  });
}

async function checkForUpdatesAuto() {
  return checkUpdate();
}

function setUpdateChannel(channel) {
  _updateChannel = channel === "beta" ? "beta" : "stable";
}

function setMainWindow(win) {
  _mainWindow = win;
}

module.exports = {
  initAutoUpdater,
  checkForUpdatesAuto,
  setMainWindow,
  setUpdateChannel,
  getState,
  __testUtils: { parseVersion, compareVersions, isNewerVersion },
};
