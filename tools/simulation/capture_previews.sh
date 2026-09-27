#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-}"
OUTPUT_DIR="${2:-velora-previews}"
ADB_BIN="${ADB:-adb}"
PACKAGE="tech.wonderer.velora"
ACTIVITY="tech.wonderer.velora/.SimulationActivity"

if [[ -z "${APK_PATH}" || ! -f "${APK_PATH}" ]]; then
  echo "Usage: $0 /path/to/Velora-debug.apk [output-directory]" >&2
  exit 2
fi

mkdir -p "${OUTPUT_DIR}"

"${ADB_BIN}" wait-for-device
"${ADB_BIN}" install -r "${APK_PATH}" >/dev/null

capture() {
  local screen="$1"
  local file="${OUTPUT_DIR}/velora-${screen}.png"

  "${ADB_BIN}" shell am force-stop "${PACKAGE}" >/dev/null 2>&1 || true
  "${ADB_BIN}" shell am start -W -n "${ACTIVITY}" --es screen "${screen}" >/dev/null
  sleep 2
  "${ADB_BIN}" exec-out screencap -p > "${file}"
  echo "Captured ${file}"
}

capture home
capture drawer
capture notifications
capture control
capture settings
capture widgets

echo "Velora preview capture complete: ${OUTPUT_DIR}"
