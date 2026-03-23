#!/usr/bin/env bash
set -euo pipefail

artifact="$(find dist -maxdepth 1 -type f -name '*.AppImage' | head -n 1)"

if [[ -z "${artifact}" ]]; then
  echo "[linux-package-test] 未找到 AppImage 产物（dist/*.AppImage）"
  exit 1
fi

echo "[linux-package-test] 使用产物: ${artifact}"

artifact="$(realpath "${artifact}")"
chmod +x "${artifact}"

echo "[linux-package-test] 检查 AppImage 运行时版本"
"${artifact}" --appimage-version

extract_dir="$(mktemp -d)"
trap 'rm -rf "${extract_dir}"' EXIT

echo "[linux-package-test] 解包 AppImage 进行结构检查"
(
  cd "${extract_dir}"
  "${artifact}" --appimage-extract >/dev/null
)

if [[ ! -f "${extract_dir}/squashfs-root/AppRun" ]]; then
  echo "[linux-package-test] 解包后缺少 AppRun，包结构异常"
  exit 1
fi

echo "[linux-package-test] AppImage smoke test 通过"
