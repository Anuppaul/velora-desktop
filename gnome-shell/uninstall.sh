#!/usr/bin/env bash
set -euo pipefail

UUID="velora@wonderer.tech"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
VELORA_SCHEMA="org.gnome.shell.extensions.velora"
DOCK_SCHEMA="org.gnome.shell.extensions.dash-to-dock"
SCHEMA_DIR="${TARGET_DIR}/schemas"

for command_name in gnome-extensions gsettings; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
        echo "ERROR: ${command_name} was not found." >&2
        exit 1
    fi
done

gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true

restore_dock_from_saved_state() {
    [[ -d "${SCHEMA_DIR}" ]] || return 0

    if command -v glib-compile-schemas >/dev/null 2>&1 &&
       [[ -f "${SCHEMA_DIR}/org.gnome.shell.extensions.velora.gschema.xml" ]]; then
        glib-compile-schemas --strict "${SCHEMA_DIR}" >/dev/null 2>&1 || true
    fi

    local captured
    captured="$(
        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}"             gsettings get "${VELORA_SCHEMA}" dock-state-captured 2>/dev/null || true
    )"

    [[ "${captured}" == "true" ]] || return 0

    if ! gsettings list-schemas | grep -Fxq "${DOCK_SCHEMA}"; then
        echo "WARNING: saved Ubuntu Dock state exists, but Dash-to-Dock schema is unavailable." >&2
        return 0
    fi

    local original_fixed
    local original_manualhide

    original_fixed="$(
        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}"             gsettings get "${VELORA_SCHEMA}" dock-original-fixed
    )"
    original_manualhide="$(
        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}"             gsettings get "${VELORA_SCHEMA}" dock-original-manualhide
    )"

    gsettings set "${DOCK_SCHEMA}" dock-fixed "${original_fixed}"
    gsettings set "${DOCK_SCHEMA}" manualhide "${original_manualhide}"

    env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}"         gsettings set "${VELORA_SCHEMA}" dock-state-captured false

    echo "Restored the Ubuntu Dock state saved by Velora."
}

restore_dock_from_saved_state

if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    if ! gnome-extensions uninstall "${UUID}"; then
        rm -rf "${TARGET_DIR}"
    fi
else
    rm -rf "${TARGET_DIR}"
fi

if [[ -e "${TARGET_DIR}" ]]; then
    echo "ERROR: Velora Desktop still exists at ${TARGET_DIR}" >&2
    exit 1
fi

echo "Velora Desktop was removed."
