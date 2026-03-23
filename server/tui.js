import readline from "readline";
import WebSocket from "ws";
import { t } from "./i18n.js";

const MAX_LINES = 200;

export function startTUI({ port, token, agentName, userName }) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const lines = [];
  let input = "";
  let cursor = 0;
  let isStreaming = false;

  const pushLine = (text = "") => {
    lines.push(text);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  };

  const render = () => {
    if (!process.stdout.isTTY) return;
    const cols = process.stdout.columns || 100;
    const rows = process.stdout.rows || 30;
    const chatRows = Math.max(8, rows - 6);
    const visible = lines.slice(-chatRows);

    process.stdout.write("\x1b[?25l\x1b[2J\x1b[H");
    process.stdout.write(`\x1b[1mHanako TUI\x1b[0m  ${agentName}  \x1b[2m${t("cli.inputHelp")}\x1b[0m\n`);
    process.stdout.write("─".repeat(Math.max(10, cols)) + "\n");
    for (const line of visible) process.stdout.write(line + "\n");
    const used = 2 + visible.length;
    for (let i = used; i < chatRows + 2; i++) process.stdout.write("\n");
    process.stdout.write("─".repeat(Math.max(10, cols)) + "\n");
    process.stdout.write(`\x1b[36m${userName}\x1b[0m › ${input}`);
    const move = input.length - cursor;
    if (move > 0) process.stdout.write(`\x1b[${move}D`);
    process.stdout.write("\x1b[?25h");
  };

  const submit = () => {
    const line = input.trim();
    input = "";
    cursor = 0;
    if (!line) return render();
    if (line === "/quit" || line === "/exit") {
      process.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
      process.exit(0);
    }
    if (line === "/help") {
      pushLine("[help] /help /quit ESC中断");
      return render();
    }
    pushLine(`\x1b[36m${userName}\x1b[0m: ${line}`);
    ws.send(JSON.stringify({ type: "prompt", text: line }));
    isStreaming = true;
    render();
  };

  const onData = (buf) => {
    const s = buf.toString("utf8");
    if (s === "\u0003") {
      process.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
      process.exit(0);
    }
    if (s === "\u001b") {
      if (isStreaming) ws.send(JSON.stringify({ type: "abort" }));
      isStreaming = false;
      pushLine(`\x1b[2m${t("cli.interrupted")}\x1b[0m`);
      return render();
    }
    if (s === "\r") return submit();
    if (s === "\u007f") {
      if (cursor > 0) {
        input = input.slice(0, cursor - 1) + input.slice(cursor);
        cursor--;
      }
      return render();
    }
    if (s === "\u001b[D") {
      cursor = Math.max(0, cursor - 1);
      return render();
    }
    if (s === "\u001b[C") {
      cursor = Math.min(input.length, cursor + 1);
      return render();
    }
    if (s >= " ") {
      input = input.slice(0, cursor) + s + input.slice(cursor);
      cursor += s.length;
      return render();
    }
  };

  ws.on("open", () => {
    pushLine(`\x1b[2mConnected: :${port}\x1b[0m`);
    render();
  });

  ws.on("message", (payload) => {
    const msg = JSON.parse(payload.toString());
    if (msg.type === "text_delta") {
      const last = lines[lines.length - 1] || "";
      if (!last.startsWith(`${agentName}: `)) pushLine(`${agentName}: `);
      lines[lines.length - 1] += msg.delta;
    } else if (msg.type === "tool_start") {
      pushLine(`\x1b[2m⚙ ${msg.name}\x1b[0m`);
    } else if (msg.type === "error") {
      pushLine(`\x1b[31m${msg.message}\x1b[0m`);
      isStreaming = false;
    } else if (msg.type === "turn_end") {
      isStreaming = false;
    }
    render();
  });

  ws.on("close", () => {
    pushLine("\x1b[31mDisconnected\x1b[0m");
    render();
    process.exit(0);
  });

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  process.stdout.on("resize", render);
}
