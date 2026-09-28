#!/usr/bin/env bash
set -euo pipefail

UUID="velora@wonderer.tech"
VELORA_SCHEMA="org.gnome.shell.extensions.velora"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/${UUID}"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SCHEMA_DIR="${SOURCE_DIR}/schemas"
SCHEMA_FILE="${SCHEMA_DIR}/org.gnome.shell.extensions.velora.gschema.xml"

BOOTSTRAP_FILES=(
    "extension.js"
    "metadata.json"
    "stylesheet.css"
)

HOT_AUX_FILES=(
    "prefs.js"
    "schemas/org.gnome.shell.extensions.velora.gschema.xml"
)

RUNTIME_FILES=(
    "runtime.js"
    "runtime.css"
    "apps.js"
    "dock.js"
    "geometry.js"
)

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

for command_name in \
    gnome-shell gnome-extensions glib-compile-schemas gsettings \
    mktemp sed grep cmp sha256sum mkdir cp sleep cat env; do
    command -v "${command_name}" >/dev/null 2>&1 ||
        fail "${command_name} was not found."
done

for required_file in \
    "${BOOTSTRAP_FILES[@]}" "${HOT_AUX_FILES[@]}" "${RUNTIME_FILES[@]}"; do
    [[ -f "${SOURCE_DIR}/${required_file}" ]] ||
        fail "Required Velora file is missing: ${required_file}"
done

GNOME_VERSION="$(gnome-shell --version 2>/dev/null)" ||
    fail "Unable to read the GNOME Shell version."
echo "Detected: ${GNOME_VERSION}"

GNOME_MAJOR="$(sed -nE 's/.* ([0-9]+)(\.[0-9]+.*)?$/\1/p' <<<"${GNOME_VERSION}")"
[[ -n "${GNOME_MAJOR}" ]] ||
    fail "Unable to parse GNOME Shell version: ${GNOME_VERSION}"
[[ "${GNOME_MAJOR}" == "50" ]] ||
    fail "This Velora branch targets GNOME Shell 50 only."

echo "Validating GSettings schema..."
glib-compile-schemas --strict --dry-run "${SCHEMA_DIR}"

SOURCE_BOOTSTRAP_GENERATION="$(
    sed -nE "s/^export const VELORA_BOOTSTRAP_GENERATION = '([^']+)';/\\1/p" \
        "${SOURCE_DIR}/extension.js"
)"
[[ -n "${SOURCE_BOOTSTRAP_GENERATION}" ]] ||
    fail "Unable to read Velora bootstrap generation from extension.js"

read_string_setting() {
    local key="$1"
    env GSETTINGS_SCHEMA_DIR="${TARGET_DIR}/schemas" \
        gsettings get "${VELORA_SCHEMA}" "${key}" 2>/dev/null |
        sed -e "s/^'//" -e "s/'$//"
}

write_string_setting() {
    local key="$1"
    local value="$2"
    env GSETTINGS_SCHEMA_DIR="${TARGET_DIR}/schemas" \
        gsettings set "${VELORA_SCHEMA}" "${key}" "'${value}'"
}

bootstrap_scaffold_compatible() {
    [[ -d "${TARGET_DIR}" ]] || return 1
    [[ -f "${TARGET_DIR}/extension.js" ]] || return 1
    grep -Fq "VELORA_BOOTSTRAP_API = 1" "${TARGET_DIR}/extension.js" ||
        return 1

    local installed_generation
    installed_generation="$(
        sed -nE "s/^export const VELORA_BOOTSTRAP_GENERATION = '([^']+)';/\\1/p" \
            "${TARGET_DIR}/extension.js"
    )"

    [[ -n "${installed_generation}" ]] || return 1
    [[ "${installed_generation}" == "${SOURCE_BOOTSTRAP_GENERATION}" ]]
}

sync_compatible_scaffold() {
    local file
    local parent

    # A matching bootstrap generation is our compatibility contract.
    # These files can therefore be staged in-place without restarting the
    # currently running Shell. extension.js is picked up on the next session;
    # prefs/schema/metadata are immediately available to their next consumer.
    for file in "${BOOTSTRAP_FILES[@]}" "${HOT_AUX_FILES[@]}"; do
        parent="$(dirname "${TARGET_DIR}/${file}")"
        mkdir -p "${parent}"
        cp -f "${SOURCE_DIR}/${file}" "${TARGET_DIR}/${file}"
    done

    glib-compile-schemas --strict "${TARGET_DIR}/schemas"
}

ensure_bootstrap_active() {
    local loaded_generation
    local loaded_revision
    local runtime_error
    local i

    if ! gnome-extensions list --active 2>/dev/null | grep -Fxq "${UUID}"; then
        gnome-extensions enable "${UUID}" >/dev/null 2>&1 || return 1
    fi

    for ((i = 0; i < 30; i++)); do
        loaded_generation="$(read_string_setting bootstrap-loaded-generation)"
        loaded_revision="$(read_string_setting runtime-loaded-revision)"
        runtime_error="$(read_string_setting runtime-error)"

        if [[ -n "${loaded_generation}" &&
              "${loaded_generation}" != "${SOURCE_BOOTSTRAP_GENERATION}" ]]; then
            echo "Running Shell has Velora bootstrap ${loaded_generation}," >&2
            echo "but source requires ${SOURCE_BOOTSTRAP_GENERATION}." >&2
            return 1
        fi

        if [[ "${loaded_generation}" == "${SOURCE_BOOTSTRAP_GENERATION}" &&
              -n "${loaded_revision}" ]]; then
            return 0
        fi

        if [[ -n "${runtime_error}" ]]; then
            echo "Velora bootstrap runtime error: ${runtime_error}" >&2
            return 1
        fi

        sleep 0.1
    done

    return 1
}

runtime_revision() {
    {
        local file
        for file in "${RUNTIME_FILES[@]}"; do
            printf '%s\0' "${file}"
            cat "${SOURCE_DIR}/${file}"
        done
    } | sha256sum | sed -E 's/^([0-9a-f]{20}).*/\1/'
}

hot_deploy_runtime() {
    local revision
    local previous_revision
    local runtime_dir
    local loaded_revision
    local runtime_error
    local i

    revision="$(runtime_revision)"
    previous_revision="$(read_string_setting runtime-revision)"
    [[ -n "${previous_revision}" ]] || previous_revision="base"

    loaded_revision="$(read_string_setting runtime-loaded-revision)"
    if [[ "${revision}" == "${loaded_revision}" ]]; then
        echo "Velora runtime is already current: ${revision}"
        echo "No logout is required."
        return 0
    fi

    runtime_dir="${TARGET_DIR}/runtime-revisions/${revision}"
    mkdir -p "${runtime_dir}"

    for file in "${RUNTIME_FILES[@]}"; do
        cp -f "${SOURCE_DIR}/${file}" "${runtime_dir}/${file}"
    done

    for file in "${RUNTIME_FILES[@]}"; do
        [[ -f "${runtime_dir}/${file}" ]] ||
            fail "Hot runtime copy is incomplete: ${file}"
    done

    write_string_setting runtime-error ""
    write_string_setting runtime-revision "${revision}"

    echo "Hot-loading Velora runtime revision ${revision}..."

    for ((i = 0; i < 60; i++)); do
        loaded_revision="$(read_string_setting runtime-loaded-revision)"
        runtime_error="$(read_string_setting runtime-error)"

        if [[ "${loaded_revision}" == "${revision}" ]]; then
            echo "Velora runtime hot-swap succeeded."
            echo "No logout is required."
            return 0
        fi

        if [[ -n "${runtime_error}" ]]; then
            break
        fi

        sleep 0.1
    done

    runtime_error="$(read_string_setting runtime-error)"
    echo "Hot-swap did not complete successfully." >&2
    if [[ -n "${runtime_error}" ]]; then
        echo "Runtime error: ${runtime_error}" >&2
    else
        echo "Runtime acknowledgement timed out." >&2
    fi

    echo "Rolling back to runtime revision ${previous_revision}..." >&2
    write_string_setting runtime-error ""
    write_string_setting runtime-revision "${previous_revision}"

    for ((i = 0; i < 40; i++)); do
        loaded_revision="$(read_string_setting runtime-loaded-revision)"
        if [[ "${loaded_revision}" == "${previous_revision}" ]]; then
            echo "Rollback succeeded." >&2
            break
        fi
        sleep 0.1
    done

    return 1
}

if bootstrap_scaffold_compatible; then
    sync_compatible_scaffold

    if ensure_bootstrap_active; then
        echo "Velora bootstrap is active; using live runtime hot-swap."
        hot_deploy_runtime
        exit $?
    fi

    echo "Velora bootstrap is installed but not active in this Shell session."
    echo "Falling back to full local install."
fi

BUILD_DIR="$(mktemp -d)"
cleanup() {
    rm -rf "${BUILD_DIR}"
}
trap cleanup EXIT

PACK_ARGS=(pack --force --out-dir="${BUILD_DIR}")
for source_name in "${RUNTIME_FILES[@]}"; do
    PACK_ARGS+=(--extra-source="${source_name}")
done
PACK_ARGS+=("${SOURCE_DIR}")

echo "Building GNOME extension bundle..."
gnome-extensions "${PACK_ARGS[@]}"

PACK_PATH="${BUILD_DIR}/${UUID}.shell-extension.zip"
[[ -f "${PACK_PATH}" ]] ||
    fail "gnome-extensions pack did not create ${PACK_PATH}"

if command -v unzip >/dev/null 2>&1; then
    REQUIRED_PACKED_FILES=(
        "metadata.json"
        "extension.js"
        "prefs.js"
        "stylesheet.css"
        "runtime.js"
        "runtime.css"
        "apps.js"
        "dock.js"
        "geometry.js"
        "schemas/org.gnome.shell.extensions.velora.gschema.xml"
    )

    PACK_LIST="$(unzip -Z1 "${PACK_PATH}")"
    for packed_file in "${REQUIRED_PACKED_FILES[@]}"; do
        grep -Fxq "${packed_file}" <<<"${PACK_LIST}" ||
            fail "Bundle verification failed: ${packed_file} is missing."
    done
fi

if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    echo "Disabling the currently registered Velora build before scaffold update..."
    gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true
fi

echo "Installing Velora bootstrap with GNOME's extension installer..."
gnome-extensions install --force "${PACK_PATH}"

[[ -d "${TARGET_DIR}" ]] ||
    fail "Installation completed but ${TARGET_DIR} was not created."

glib-compile-schemas --strict "${TARGET_DIR}/schemas"

for installed_file in     metadata.json extension.js prefs.js stylesheet.css     runtime.js runtime.css apps.js dock.js geometry.js; do
    [[ -f "${TARGET_DIR}/${installed_file}" ]] ||
        fail "Installed extension is incomplete: ${installed_file} is missing."
done

write_string_setting bootstrap-loaded-generation ""
write_string_setting runtime-revision "base"
write_string_setting runtime-loaded-revision ""
write_string_setting runtime-error ""

echo
echo "Velora bootstrap/scaffold installed successfully:"
echo "  ${TARGET_DIR}"
echo
echo "This is the first install, or the Velora bootstrap generation changed."
echo "GNOME 50 loads that new local extension bootstrap in the next Shell session."
echo "Log out and log back in once, then run:"
echo "  gnome-extensions enable ${UUID}"
echo
echo "After this one-time bootstrap load, ordinary runtime/style updates use"
echo "live hot-swap and do not require logout."
