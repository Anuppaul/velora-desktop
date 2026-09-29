#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GNOME_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd -- "${GNOME_DIR}/.." && pwd)"
SOURCE_DIR="${GNOME_DIR}/velora@wonderer.tech"
VENDOR_DIR="${SOURCE_DIR}/vendor/liquid-glass"
MANIFEST="${VENDOR_DIR}/UPSTREAM-BLOBS.txt"
UUID="velora@wonderer.tech"
VELORA_SCHEMA="org.gnome.shell.extensions.velora"
GLASS_SCHEMA="org.gnome.shell.extensions.liquid-glass@thinkingcoding1231.gmail.com"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SINCE="${1:-2 minutes ago}"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

for command_name in git glib-compile-schemas gsettings journalctl grep sed awk wc tail; do
    command -v "${command_name}" >/dev/null 2>&1 ||
        fail "${command_name} was not found"
done

echo "=== VELORA / LIQUID GLASS HEALTH ==="
echo "Source: ${SOURCE_DIR}"
echo "Git HEAD: $(git -C "${REPO_DIR}" log -1 --oneline 2>/dev/null || echo unknown)"
echo

echo "=== UPSTREAM VENDOR INTEGRITY ==="
[[ -f "${MANIFEST}" ]] || fail "Missing upstream blob manifest"
checked=0
mismatches=0
while read -r expected relative; do
    [[ -n "${expected:-}" ]] || continue
    [[ "${expected:0:1}" == "#" ]] && continue

    file="${VENDOR_DIR}/${relative}"
    if [[ ! -f "${file}" ]]; then
        echo "MISSING  ${relative}"
        mismatches=$((mismatches + 1))
        continue
    fi

    actual="$(git hash-object "${file}")"
    if [[ "${actual}" != "${expected}" ]]; then
        echo "CHANGED  ${relative}"
        echo "  expected ${expected}"
        echo "  actual   ${actual}"
        mismatches=$((mismatches + 1))
    fi
    checked=$((checked + 1))
done < "${MANIFEST}"

echo "Checked: ${checked}"
echo "Mismatches: ${mismatches}"
[[ "${mismatches}" -eq 0 ]] ||
    fail "Vendored Liquid Glass differs from the pinned upstream source"
echo "Vendor integrity: PASS"
echo

echo "=== SOURCE SCHEMAS ==="
glib-compile-schemas --strict --dry-run "${SOURCE_DIR}/schemas"
glib-compile-schemas --strict --dry-run "${VENDOR_DIR}/schemas"
echo "Schema validation: PASS"
echo

if [[ -f "${TARGET_DIR}/schemas/gschemas.compiled" ]]; then
    echo "=== ACTIVE VELORA RUNTIME ==="
    runtime_revision="$(
        GSETTINGS_SCHEMA_DIR="${TARGET_DIR}/schemas"             gsettings get "${VELORA_SCHEMA}" runtime-loaded-revision 2>/dev/null || true
    )"
    runtime_error="$(
        GSETTINGS_SCHEMA_DIR="${TARGET_DIR}/schemas"             gsettings get "${VELORA_SCHEMA}" runtime-error 2>/dev/null || true
    )"
    echo "Revision: ${runtime_revision}"
    echo "Error:    ${runtime_error}"
    echo
else
    echo "=== ACTIVE VELORA RUNTIME ==="
    echo "Installed Velora schema not found: ${TARGET_DIR}/schemas/gschemas.compiled"
    echo
fi

GLASS_SCHEMA_DIR="${TARGET_DIR}/vendor/liquid-glass/schemas"
if [[ -f "${GLASS_SCHEMA_DIR}/gschemas.compiled" ]]; then
    echo "=== ACTIVE LIQUID GLASS SETTINGS ==="
    for key in         enable-dock-glass         enable-menu-glass         enable-extra-menu-glass         enable-notification-glass         enable-quick-settings-glass         enable-osd-glass         enable-application-glass         application-glass-all-windows         enable-desktop-menu-glass         blur-method         glass-blur-downscale; do
        value="$(
            GSETTINGS_SCHEMA_DIR="${GLASS_SCHEMA_DIR}"                 gsettings get "${GLASS_SCHEMA}" "${key}" 2>/dev/null || echo unavailable
        )"
        printf '%-34s %s\n' "${key}" "${value}"
    done
    echo
else
    echo "=== ACTIVE LIQUID GLASS SETTINGS ==="
    echo "Compiled vendor schema not found: ${GLASS_SCHEMA_DIR}/gschemas.compiled"
    echo
fi

echo "=== FRESH GNOME SHELL HEALTH (${SINCE}) ==="
logs="$(
    journalctl -b --since "${SINCE}" -o cat /usr/bin/gnome-shell 2>/dev/null |
        grep -i -E '\[Velora\]\[LiquidGlass\]|Liquid Glass|GType|shader|cogl|allocation' || true
)"

if [[ -z "${logs}" ]]; then
    echo "(no matching log lines)"
else
    printf '%s\n' "${logs}" |
        grep -i -E '\[Velora\]\[LiquidGlass\].*(active|health|root)|setup failed|runtime reload failed' || true

    allocation_count="$(
        printf '%s\n' "${logs}" |
            grep -c -i 'needs an allocation' || true
    )"
    cogl_count="$(
        printf '%s\n' "${logs}" |
            grep -c -i -E 'cogl_framebuffer_set_viewport|assertion.*width > 0.*height > 0' || true
    )"
    gtype_count="$(
        printf '%s\n' "${logs}" |
            grep -c -i -E 'GType|already registered' || true
    )"
    setup_fail_count="$(
        printf '%s\n' "${logs}" |
            grep -c -i -E 'setup failed|runtime reload failed|upstream Liquid Glass renderer failed' || true
    )"

    echo
    echo "Allocation warnings: ${allocation_count}"
    echo "COGL viewport assertions: ${cogl_count}"
    echo "GType conflicts: ${gtype_count}"
    echo "Setup/runtime failures: ${setup_fail_count}"

    if [[ "${allocation_count}" -gt 0 || "${cogl_count}" -gt 0 ]]; then
        echo
        echo "--- recent allocation / COGL lines ---"
        printf '%s\n' "${logs}" |
            grep -i -E 'needs an allocation|cogl_framebuffer_set_viewport|assertion.*width > 0.*height > 0' |
            tail -n 40 || true
    fi
fi

echo
echo "=== RESULT ==="
echo "Static integration checks passed."
echo "For runtime visual validation, open Calendar, Quick Settings, trigger an OSD and a notification, then rerun:"
echo "  bash gnome-shell/tools/liquid-glass-health.sh '30 seconds ago'"
