#!/usr/bin/env node
/**
 * Cross-platform dev launcher
 * 解决 POSIX `VAR=val cmd` 语法和 `~` 在 Windows 上不工作的问题
 */
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.HANA_HOME = join(homedir(), ".hanako-dev");

const mode = process.argv[2];
const extra = process.argv.slice(3);

let bin, args;
switch (mode) {
  case "electron":
    bin = require("electron");
    args = [".", ...extra];
    break;
  case "electron-dev":
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "electron-vite":
    process.env.VITE_DEV_URL = "http://localhost:5173";
    bin = require("electron");
    args = [".", "--dev", ...extra];
    break;
  case "cli":
    process.env.HANA_INTERFACE = "cli";
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  case "tui":
    process.env.HANA_INTERFACE = "tui";
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  case "web":
    bin = process.execPath;
    args = ["scripts/launch-web.js", ...extra];
    break;
  case "server":
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  default:
    console.error("Usage: node scripts/launch.js <electron|electron-dev|electron-vite|cli|tui|web|server>");
    process.exit(1);
}

// Electron 以子进程运行时（如 VS Code / Claude Code 终端），
// 父进程可能设了 ELECTRON_RUN_AS_NODE=1，会让 Electron 以纯 Node 模式启动，
// 导致 require('electron') 拿不到内置 API。spawn 前清掉。
delete process.env.ELECTRON_RUN_AS_NODE;

if (["cli", "tui", "server", "web"].includes(mode)) {
  const ensure = spawnSync(process.execPath, ["scripts/ensure-native.cjs"], { stdio: "inherit", env: process.env });
  if (ensure.status !== 0) {
    process.exit(ensure.status ?? 1);
  }
}

const child = spawn(bin, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
