#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GNOME_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd -- "${GNOME_DIR}/.." && pwd)"
OUT_DIR="${REPO_DIR}/docs/screenshots"
UUID="velora@wonderer.tech"
BUS_NAME="tech.wonderer.Velora.ReadmeCapture"
OBJECT_PATH="/tech/wonderer/Velora/ReadmeCapture"
INTERFACE_NAME="tech.wonderer.Velora.ReadmeCapture"
DTD_SCHEMA="org.gnome.shell.extensions.dash-to-dock"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
TOKEN_FILE="${RUNTIME_DIR}/velora-readme-capture.token"
CAPTURE_DIR="${RUNTIME_DIR}/velora-readme-capture"
SETTLE_SECONDS="${VELORA_CAPTURE_SETTLE_SECONDS:-0.75}"
SEARCH_QUERY="${VELORA_CAPTURE_SEARCH_QUERY:-terminal}"
SKIP_INSTALL=0

usage() {
    cat <<'USAGE'
Usage: bash gnome-shell/tools/capture-readme.sh [--skip-install]

Captures the curated Velora README screenshot set from the primary monitor.
The command deploys the current local runtime first unless --skip-install is
passed. Generated PNGs are written to docs/screenshots/ with stable names.

Environment overrides:
  VELORA_CAPTURE_SETTLE_SECONDS   UI settle delay (default: 0.75)
  VELORA_CAPTURE_SEARCH_QUERY     Spotlight demo query (default: terminal)
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-install)
            SKIP_INSTALL=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

for command_name in \
    bash gnome-shell gnome-extensions gdbus gsettings grep mkdir rm cp mv \
    sleep stat id cat date; do
    command -v "${command_name}" >/dev/null 2>&1 ||
        fail "${command_name} was not found"
done

GNOME_VERSION="$(gnome-shell --version 2>/dev/null)" ||
    fail "Unable to read GNOME Shell version"
[[ "${GNOME_VERSION}" =~ [[:space:]]50([.]|$) ]] ||
    fail "This capture workflow targets GNOME Shell 50: ${GNOME_VERSION}"

if [[ "${SKIP_INSTALL}" -eq 0 ]]; then
    echo "==> Deploy current Velora runtime"
    bash "${GNOME_DIR}/install.sh"
fi

gnome-extensions info "${UUID}" >/dev/null 2>&1 ||
    fail "Velora is not installed in the current GNOME session"

mkdir -p "${OUT_DIR}" "${CAPTURE_DIR}"
umask 077
if [[ -r /proc/sys/kernel/random/uuid ]]; then
    TOKEN="$(cat /proc/sys/kernel/random/uuid)"
else
    TOKEN="$(date +%s%N)-$$-${RANDOM}"
fi
printf '%s\n' "${TOKEN}" > "${TOKEN_FILE}"

DBUS_CALL=(
    gdbus call --session
    --dest "${BUS_NAME}"
    --object-path "${OBJECT_PATH}"
)

bridge_ready=0
for _ in {1..50}; do
    if "${DBUS_CALL[@]}" --method "${INTERFACE_NAME}.Ping" >/dev/null 2>&1; then
        bridge_ready=1
        break
    fi
    sleep 0.1
done
[[ "${bridge_ready}" -eq 1 ]] ||
    fail "Velora README capture bridge did not become available"

declare -A DTD_SAVED=()
declare -a DTD_KEYS=()

schema_exists() {
    gsettings list-schemas | grep -Fxq "$1"
}

dtd_has_key() {
    gsettings list-keys "${DTD_SCHEMA}" 2>/dev/null | grep -Fxq "$1"
}

save_dtd_settings() {
    schema_exists "${DTD_SCHEMA}" || return 0

    local key
    for key in extend-height dock-fixed autohide intellihide; do
        if dtd_has_key "${key}"; then
            DTD_KEYS+=("${key}")
            DTD_SAVED["${key}"]="$(gsettings get "${DTD_SCHEMA}" "${key}")"
        fi
    done
}

set_dtd() {
    local key="$1"
    local value="$2"
    schema_exists "${DTD_SCHEMA}" || return 0
    dtd_has_key "${key}" || return 0
    gsettings set "${DTD_SCHEMA}" "${key}" "${value}"
}

restore_dtd_settings() {
    local key
    for key in "${DTD_KEYS[@]:-}"; do
        [[ -n "${key}" ]] || continue
        gsettings set "${DTD_SCHEMA}" "${key}" "${DTD_SAVED[${key}]}" || true
    done
}

reset_capture_state() {
    if [[ -f "${TOKEN_FILE}" ]]; then
        "${DBUS_CALL[@]}" \
            --method "${INTERFACE_NAME}.Reset" \
            "${TOKEN}" >/dev/null 2>&1 || true
    fi
}

cleanup() {
    reset_capture_state
    restore_dtd_settings
    rm -f "${TOKEN_FILE}"
    rm -f "${CAPTURE_DIR}"/*.part 2>/dev/null || true
}
trap cleanup EXIT INT TERM

prepare_state() {
    local state="$1"
    local detail="${2:-}"

    "${DBUS_CALL[@]}" \
        --method "${INTERFACE_NAME}.Prepare" \
        "${TOKEN}" "${state}" "${detail}" >/dev/null
}

capture_current() {
    local filename="$1"
    local runtime_file="${CAPTURE_DIR}/${filename}"
    local target_file="${OUT_DIR}/${filename}"
    local temporary_target="${target_file}.tmp"

    rm -f "${runtime_file}" "${runtime_file}.part" "${temporary_target}"

    "${DBUS_CALL[@]}" \
        --method "${INTERFACE_NAME}.Capture" \
        "${TOKEN}" "${filename}" >/dev/null

    local ready=0
    for _ in {1..100}; do
        if [[ -s "${runtime_file}" ]]; then
            ready=1
            break
        fi
        sleep 0.1
    done
    [[ "${ready}" -eq 1 ]] ||
        fail "Timed out waiting for ${filename}"

    cp "${runtime_file}" "${temporary_target}"
    mv -f "${temporary_target}" "${target_file}"
    printf '  ✓ %s\n' "${filename}"
}

capture_state() {
    local state="$1"
    local filename="$2"
    local detail="${3:-}"
    local settle="${4:-${SETTLE_SECONDS}}"

    prepare_state "${state}" "${detail}"
    sleep "${settle}"
    capture_current "${filename}"
}

save_dtd_settings

echo "==> Capture README screenshots"

# Force the native Ubuntu Dock visible only while the documentation capture is
# running. Every touched Dash-to-Dock setting is restored by the EXIT trap.
set_dtd dock-fixed true
set_dtd autohide false
set_dtd intellihide false
set_dtd extend-height false
sleep "${SETTLE_SECONDS}"
capture_state desktop velora-desktop-dock.png

set_dtd extend-height true
sleep "${SETTLE_SECONDS}"
capture_state desktop velora-desktop-panel.png

set_dtd extend-height false
sleep "${SETTLE_SECONDS}"
capture_state orb velora-orb.png "" 0.95
capture_state spotlight velora-spotlight.png "" 0.85
capture_state spotlight velora-spotlight-results.png "${SEARCH_QUERY}" 0.95
capture_state calendar velora-calendar.png "" 0.95
capture_state quick-settings velora-quick-settings.png "" 0.95
capture_state app-grid velora-app-grid.png "" 1.15

reset_capture_state

echo
echo "README screenshot set refreshed:"
echo "  ${OUT_DIR}"
echo
echo "Next:"
echo "  git status --short docs/screenshots"
echo "  git add docs/screenshots"
echo "  git commit -m 'docs: refresh Velora screenshots'"
