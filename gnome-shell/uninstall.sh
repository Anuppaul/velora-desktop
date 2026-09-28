#!/usr/bin/env bash
set -euo pipefail

UUID="velora@wonderer.tech"
VELORA_SCHEMA="org.gnome.shell.extensions.velora"
DOCK_SCHEMA="org.gnome.shell.extensions.dash-to-dock"

TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
UPDATE_DIR="${HOME}/.local/share/gnome-shell/extension-updates/${UUID}"
LIVE_CACHE_DIR="${HOME}/.cache/velora-live"
SCHEMA_DIR="${TARGET_DIR}/schemas"

for command_name in gnome-extensions gsettings python3 rm; do
    command -v "${command_name}" >/dev/null 2>&1 || {
        echo "ERROR: ${command_name} was not found." >&2
        exit 1
    }
done

restore_dock_from_saved_state() {
    local captured
    local original_fixed
    local original_manualhide
    local extension_captured
    local original_enabled_listed
    local original_disabled_listed

    [[ -d "${SCHEMA_DIR}" ]] || return 0

    if command -v glib-compile-schemas >/dev/null 2>&1 &&
       [[ -f "${SCHEMA_DIR}/org.gnome.shell.extensions.velora.gschema.xml" ]]; then
        glib-compile-schemas --strict "${SCHEMA_DIR}" >/dev/null 2>&1 || true
    fi

    captured="$(
        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
            gsettings get "${VELORA_SCHEMA}" dock-state-captured 2>/dev/null || true
    )"

    if [[ "${captured}" == "true" ]]; then
        if gsettings list-schemas | grep -Fxq "${DOCK_SCHEMA}"; then
            original_fixed="$(
                env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
                    gsettings get "${VELORA_SCHEMA}" dock-original-fixed
            )"
            original_manualhide="$(
                env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
                    gsettings get "${VELORA_SCHEMA}" dock-original-manualhide
            )"

            gsettings set "${DOCK_SCHEMA}" dock-fixed "${original_fixed}"
            gsettings set "${DOCK_SCHEMA}" manualhide "${original_manualhide}"

            echo "Restored Ubuntu Dock settings saved by Velora."
        else
            echo "WARNING: saved Ubuntu Dock settings exist, but Dash-to-Dock schema is unavailable." >&2
        fi

        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
            gsettings set "${VELORA_SCHEMA}" dock-state-captured false
    fi

    extension_captured="$(
        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
            gsettings get "${VELORA_SCHEMA}" dock-extension-state-captured 2>/dev/null || true
    )"

    if [[ "${extension_captured}" == "true" ]]; then
        original_enabled_listed="$(
            env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
                gsettings get "${VELORA_SCHEMA}" dock-original-enabled-listed 2>/dev/null || true
        )"
        original_disabled_listed="$(
            env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
                gsettings get "${VELORA_SCHEMA}" dock-original-disabled-listed 2>/dev/null || true
        )"

        python3 - "${original_enabled_listed}" "${original_disabled_listed}" <<'PY'
import ast
import subprocess
import sys

uuid = "ubuntu-dock@ubuntu.com"
want_enabled = sys.argv[1].strip().lower() == "true"
want_disabled = sys.argv[2].strip().lower() == "true"

def get_list(key):
    raw = subprocess.check_output(
        ["gsettings", "get", "org.gnome.shell", key],
        text=True,
    ).strip()
    return list(ast.literal_eval(raw))

enabled = [x for x in get_list("enabled-extensions") if x != uuid]
disabled = [x for x in get_list("disabled-extensions") if x != uuid]

if want_enabled:
    enabled.append(uuid)
if want_disabled:
    disabled.append(uuid)

subprocess.run(
    ["gsettings", "set", "org.gnome.shell", "enabled-extensions", repr(enabled)],
    check=True,
)
subprocess.run(
    ["gsettings", "set", "org.gnome.shell", "disabled-extensions", repr(disabled)],
    check=True,
)
PY

        env GSETTINGS_SCHEMA_DIR="${SCHEMA_DIR}" \
            gsettings set "${VELORA_SCHEMA}" dock-extension-state-captured false
        echo "Restored Ubuntu Dock extension-list state saved by Velora."
    fi
}

clean_shell_uuid_lists() {
    python3 - "${UUID}" <<'PY'
import ast
import subprocess
import sys

uuid = sys.argv[1]

for key in ("enabled-extensions", "disabled-extensions"):
    try:
        raw = subprocess.check_output(
            ["gsettings", "get", "org.gnome.shell", key],
            text=True,
        ).strip()
        values = ast.literal_eval(raw)
    except Exception:
        continue

    cleaned = [value for value in values if value != uuid]
    if cleaned == values:
        continue

    subprocess.run(
        ["gsettings", "set", "org.gnome.shell", key, repr(cleaned)],
        check=True,
    )
PY
}

restore_dock_from_saved_state

gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true

if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    gnome-extensions uninstall "${UUID}" >/dev/null 2>&1 || true
fi

rm -rf "${TARGET_DIR}"
rm -rf "${UPDATE_DIR}"
rm -rf "${LIVE_CACHE_DIR}"

clean_shell_uuid_lists

if command -v dconf >/dev/null 2>&1; then
    dconf reset -f /org/gnome/shell/extensions/velora/ >/dev/null 2>&1 || true
fi

if [[ -e "${TARGET_DIR}" ]]; then
    echo "ERROR: Velora user extension directory still exists: ${TARGET_DIR}" >&2
    exit 1
fi

if [[ -e "${UPDATE_DIR}" ]]; then
    echo "ERROR: Velora extension-update directory still exists: ${UPDATE_DIR}" >&2
    exit 1
fi

if [[ -e "${LIVE_CACHE_DIR}" ]]; then
    echo "ERROR: Velora live-load cache still exists: ${LIVE_CACHE_DIR}" >&2
    exit 1
fi

echo "Velora Desktop was fully removed."
