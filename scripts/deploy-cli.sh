#!/usr/bin/env bash
set -euo pipefail

# Hanako CLI 一键部署脚本
# 用法:
#   bash scripts/deploy-cli.sh
#   bash scripts/deploy-cli.sh --mode tui
#   bash scripts/deploy-cli.sh --skip-install --no-start

MODE="cli"
SKIP_INSTALL=0
NO_START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=1
      shift
      ;;
    --no-start)
      NO_START=1
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Hanako CLI 一键部署脚本

Options:
  --mode <cli|tui|server>  启动模式（默认 cli）
  --skip-install           跳过 npm ci
  --no-start               只部署不启动
  -h, --help               显示帮助
EOF
      exit 0
      ;;
    *)
      echo "[deploy-cli] unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$MODE" != "cli" && "$MODE" != "tui" && "$MODE" != "server" ]]; then
  echo "[deploy-cli] invalid mode: $MODE (expected: cli|tui|server)" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[deploy-cli] node 未安装，请先安装 Node.js 22+" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[deploy-cli] npm 未安装，请先安装 npm" >&2
  exit 1
fi

echo "[deploy-cli] mode=$MODE skip_install=$SKIP_INSTALL no_start=$NO_START"

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "[deploy-cli] installing dependencies..."
  npm ci
fi

echo "[deploy-cli] checking native modules..."
node scripts/ensure-native.cjs

if [[ "$NO_START" -eq 1 ]]; then
  echo "[deploy-cli] done. start later with: npm run $MODE"
  exit 0
fi

echo "[deploy-cli] starting Hanako ($MODE)..."
npm run "$MODE"
