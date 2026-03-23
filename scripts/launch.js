#!/usr/bin/env node
/**
 * Cross-platform dev launcher
 * 解决 POSIX `VAR=val cmd` 语法和 `~` 在 Windows 上不工作的问题
 */
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
process.env.HANA_HOME = join(homedir(), ".hanako-dev");

const mode = process.argv[2];
const extra = process.argv.slice(3);

let bin, args;
switch (mode) {
  case "cli":
    process.env.HANA_INTERFACE = "cli";
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  case "web":
    process.env.HANA_ALLOW_UTILITY_LARGE_FALLBACK = process.env.HANA_ALLOW_UTILITY_LARGE_FALLBACK || "1";
    bin = process.execPath;
    args = ["scripts/launch-web.js", ...extra];
    break;
  case "server":
    bin = process.execPath;
    args = ["server/index.js", ...extra];
    break;
  default:
    console.error("Usage: node scripts/launch.js <cli|web|server>");
    process.exit(1);
}

// Electron 以子进程运行时（如 VS Code / Claude Code 终端），
// 父进程可能设了 ELECTRON_RUN_AS_NODE=1，会让 Electron 以纯 Node 模式启动，
// 导致 require('electron') 拿不到内置 API。spawn 前清掉。
if (["cli", "server", "web"].includes(mode)) {
  const ensure = spawnSync(process.execPath, ["scripts/ensure-native.cjs"], { stdio: "inherit", env: process.env });
  if (ensure.status !== 0) {
    console.warn("[launch] warning: ensure-native failed, continuing startup (you can run `npm run rebuild`).");
  }
}

if (["cli", "tui", "server", "web"].includes(mode)) {
  const ensure = spawnSync(process.execPath, ["scripts/ensure-native.cjs"], { stdio: "inherit", env: process.env });
  if (ensure.status !== 0) {
    console.warn("[launch] warning: ensure-native failed, continuing startup (you can run `npm run rebuild`).");
  }
}

const child = spawn(bin, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
