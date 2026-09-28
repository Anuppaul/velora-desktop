#!/usr/bin/env bash
set -euo pipefail

UUID="velora@wonderer.tech"
VELORA_SCHEMA="org.gnome.shell.extensions.velora"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/${UUID}"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SCHEMA_DIR="${SOURCE_DIR}/schemas"
BOOTSTRAP_MARKER="${TARGET_DIR}/.velora-bootstrap-generation"
BOOTSTRAP_REVISION_MARKER="${TARGET_DIR}/.velora-bootstrap-revision"
INSTALLER_VERSION="2026-09-28.10"

BOOTSTRAP_FILES=(
    "extension.js"
    "metadata.json"
    "stylesheet.css"
    "schemas/org.gnome.shell.extensions.velora.gschema.xml"
)

HOT_AUX_FILES=(
    "prefs.js"
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
    gnome-shell gnome-extensions glib-compile-schemas gsettings gdbus python3 \
    mktemp sed grep sha256sum mkdir cp rm sleep cat head tr env dirname; do
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
echo "Velora installer: ${INSTALLER_VERSION}"

GNOME_MAJOR="$(
    sed -nE 's/.* ([0-9]+)(\.[0-9]+.*)?$/\1/p' <<<"${GNOME_VERSION}"
)"
[[ -n "${GNOME_MAJOR}" ]] ||
    fail "Unable to parse GNOME Shell version: ${GNOME_VERSION}"
[[ "${GNOME_MAJOR}" == "50" ]] ||
    fail "This Velora branch targets GNOME Shell 50 only."

echo "Validating GSettings schema..."
glib-compile-schemas --strict --dry-run "${SCHEMA_DIR}"

SOURCE_BOOTSTRAP_GENERATION="$(
    sed -nE "s/^[[:space:]]*export[[:space:]]+const[[:space:]]+VELORA_BOOTSTRAP_GENERATION[[:space:]]*=[[:space:]]*'([^']+)'.*/\\1/p" \
        "${SOURCE_DIR}/extension.js" | head -n1
)"
[[ -n "${SOURCE_BOOTSTRAP_GENERATION}" ]] ||
    fail "Unable to read Velora bootstrap generation from extension.js"

bootstrap_revision_for_dir() {
    local root="$1"
    local file

    for file in "${BOOTSTRAP_FILES[@]}"; do
        [[ -f "${root}/${file}" ]] || return 1
    done

    {
        for file in "${BOOTSTRAP_FILES[@]}"; do
            printf '%s\0' "${file}"
            cat "${root}/${file}"
        done
    } | sha256sum | sed -E 's/^([0-9a-f]{24}).*/\1/'
}

SOURCE_BOOTSTRAP_REVISION="$(bootstrap_revision_for_dir "${SOURCE_DIR}")" ||
    fail "Unable to fingerprint Velora bootstrap scaffold."

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

read_marker() {
    local path="$1"

    [[ -f "${path}" ]] || return 1
    head -n1 "${path}" 2>/dev/null | tr -d '\r\n'
}

installed_bootstrap_generation() {
    local generation=""

    generation="$(read_marker "${BOOTSTRAP_MARKER}" || true)"
    if [[ -n "${generation}" ]]; then
        printf '%s' "${generation}"
        return 0
    fi

    if [[ -f "${TARGET_DIR}/extension.js" ]]; then
        generation="$(
            sed -nE "s/^[[:space:]]*export[[:space:]]+const[[:space:]]+VELORA_BOOTSTRAP_GENERATION[[:space:]]*=[[:space:]]*'([^']+)'.*/\\1/p" \
                "${TARGET_DIR}/extension.js" | head -n1
        )"
    fi

    [[ -n "${generation}" ]] || return 1
    printf '%s' "${generation}"
}

installed_bootstrap_revision() {
    local revision=""

    revision="$(read_marker "${BOOTSTRAP_REVISION_MARKER}" || true)"
    if [[ -n "${revision}" ]]; then
        printf '%s' "${revision}"
        return 0
    fi

    bootstrap_revision_for_dir "${TARGET_DIR}"
}

record_bootstrap_identity() {
    mkdir -p "${TARGET_DIR}"
    printf '%s\n' "${SOURCE_BOOTSTRAP_GENERATION}" > "${BOOTSTRAP_MARKER}"
    printf '%s\n' "${SOURCE_BOOTSTRAP_REVISION}" > "${BOOTSTRAP_REVISION_MARKER}"
}

bootstrap_scaffold_compatible() {
    local installed_generation
    local installed_revision

    [[ -d "${TARGET_DIR}" ]] || return 1
    [[ -f "${TARGET_DIR}/extension.js" ]] || return 1
    [[ -f "${TARGET_DIR}/metadata.json" ]] || return 1
    grep -Fq "VELORA_BOOTSTRAP_API = 1" "${TARGET_DIR}/extension.js" ||
        return 1

    installed_generation="$(installed_bootstrap_generation)" || return 1
    installed_revision="$(installed_bootstrap_revision)" || return 1

    if [[ "${installed_generation}" != "${SOURCE_BOOTSTRAP_GENERATION}" ||
          "${installed_revision}" != "${SOURCE_BOOTSTRAP_REVISION}" ]]; then
        echo "Installed bootstrap: ${installed_generation} / ${installed_revision}" >&2
        echo "Source bootstrap:    ${SOURCE_BOOTSTRAP_GENERATION} / ${SOURCE_BOOTSTRAP_REVISION}" >&2
        return 1
    fi

    if [[ ! -f "${BOOTSTRAP_MARKER}" ||
          ! -f "${BOOTSTRAP_REVISION_MARKER}" ]]; then
        record_bootstrap_identity
    fi

    return 0
}

sync_hot_aux() {
    local file
    local live_dir

    for file in "${HOT_AUX_FILES[@]}"; do
        cp -f "${SOURCE_DIR}/${file}" "${TARGET_DIR}/${file}"
    done

    shopt -s nullglob
    for live_dir in "${HOME}"/.cache/velora-live/"${SOURCE_BOOTSTRAP_REVISION}"-*/"${UUID}"; do
        [[ -d "${live_dir}" ]] || continue
        for file in "${HOT_AUX_FILES[@]}"; do
            cp -f "${SOURCE_DIR}/${file}" "${live_dir}/${file}"
        done
    done
    shopt -u nullglob
}

ensure_bootstrap_active() {
    local loaded_generation
    local loaded_bootstrap_revision
    local loaded_runtime_revision
    local runtime_error
    local enable_output
    local i

    if ! gnome-extensions info "${UUID}" >/dev/null 2>&1; then
        return 20
    fi

    if ! gnome-extensions list --active 2>/dev/null | grep -Fxq "${UUID}"; then
        if ! enable_output="$(gnome-extensions enable "${UUID}" 2>&1)"; then
            echo "GNOME knows Velora but could not enable it:" >&2
            [[ -n "${enable_output}" ]] && echo "  ${enable_output}" >&2
            return 21
        fi
    fi

    for ((i = 0; i < 80; i++)); do
        loaded_generation="$(read_string_setting bootstrap-loaded-generation)"
        loaded_bootstrap_revision="$(read_string_setting bootstrap-loaded-revision)"
        loaded_runtime_revision="$(read_string_setting runtime-loaded-revision)"
        runtime_error="$(read_string_setting runtime-error)"

        if [[ -n "${loaded_generation}" &&
              "${loaded_generation}" != "${SOURCE_BOOTSTRAP_GENERATION}" ]]; then
            return 22
        fi

        if [[ -n "${loaded_bootstrap_revision}" &&
              "${loaded_bootstrap_revision}" != "${SOURCE_BOOTSTRAP_REVISION}" ]]; then
            return 22
        fi

        if [[ "${loaded_generation}" == "${SOURCE_BOOTSTRAP_GENERATION}" &&
              "${loaded_bootstrap_revision}" == "${SOURCE_BOOTSTRAP_REVISION}" &&
              -n "${loaded_runtime_revision}" ]]; then
            return 0
        fi

        if [[ -n "${runtime_error}" ]]; then
            echo "Velora bootstrap runtime error: ${runtime_error}" >&2
            return 23
        fi

        sleep 0.1
    done

    return 24
}

runtime_revision() {
    local file

    {
        for file in "${RUNTIME_FILES[@]}"; do
            printf '%s\0' "${file}"
            cat "${SOURCE_DIR}/${file}"
        done
    } | sha256sum | sed -E 's/^([0-9a-f]{20}).*/\1/'
}

shell_eval() {
    local code="$1"

    gdbus call --session \
        --dest org.gnome.Shell \
        --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval \
        "${code}" 2>/dev/null
}

shell_unsafe_mode_enabled() {
    local output

    output="$(shell_eval 'global.context.unsafe_mode' || true)"

    [[ "${output}" == *"(true, 'true')"* ||
       "${output}" == *'(true, "true")'* ]]
}

wait_for_velora_active() {
    local i

    for ((i = 0; i < 80; i++)); do
        if gnome-extensions list --active 2>/dev/null | grep -Fxq "${UUID}"; then
            return 0
        fi
        sleep 0.1
    done

    return 1
}

try_live_register() {
    local runtime_rev
    local live_root
    local live_dir
    local uuid_json
    local dir_json
    local code
    local output
    local loaded_generation
    local loaded_bootstrap_revision
    local loaded_runtime_revision
    local runtime_error

    shell_unsafe_mode_enabled || return 31

    runtime_rev="$(runtime_revision)"
    live_root="${HOME}/.cache/velora-live/${SOURCE_BOOTSTRAP_REVISION}-${runtime_rev}"
    live_dir="${live_root}/${UUID}"

    rm -rf "${live_root}"
    mkdir -p "${live_dir}"

    local file
    local parent
    for file in "${BOOTSTRAP_FILES[@]}" "${HOT_AUX_FILES[@]}"; do
        parent="$(dirname "${live_dir}/${file}")"
        mkdir -p "${parent}"
        cp -f "${TARGET_DIR}/${file}" "${live_dir}/${file}"
    done

    cp -f "${BOOTSTRAP_MARKER}" "${live_dir}/.velora-bootstrap-generation"
    cp -f "${BOOTSTRAP_REVISION_MARKER}" "${live_dir}/.velora-bootstrap-revision"

    glib-compile-schemas --strict "${live_dir}/schemas"

    uuid_json="$(
        python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${UUID}"
    )"
    dir_json="$(
        python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${live_dir}"
    )"

    code="$(cat <<EOF
(async () => {
    const Main = await import('resource:///org/gnome/shell/ui/main.js');
    const {default: Gio} = await import('gi://Gio');
    const {ExtensionType} = await import('resource:///org/gnome/shell/misc/extensionUtils.js');

    const uuid = ${uuid_json};
    const dir = Gio.File.new_for_path(${dir_json});

    try {
        const existing = Main.extensionManager.lookup(uuid);
        if (existing)
            await Main.extensionManager.unloadExtension(existing);

        const extension = Main.extensionManager.createExtensionObject(
            uuid,
            dir,
            ExtensionType.PER_USER
        );

        await Main.extensionManager.loadExtension(extension);

        if (!Main.extensionManager.enableExtension(uuid))
            throw new Error('GNOME refused to enable Velora');

        return {
            path: Main.extensionManager.lookup(uuid)?.path ?? '',
        };
    } finally {
        global.context.unsafe_mode = false;
    }
})()
EOF
)"

    output="$(shell_eval "${code}" || true)"

    if [[ "${output}" != "(true,"* ]]; then
        echo "GNOME Shell live-load Eval failed:" >&2
        echo "  ${output}" >&2
        return 32
    fi

    if ! wait_for_velora_active; then
        echo "GNOME accepted the live-load request, but Velora did not become active." >&2
        echo "Eval result: ${output}" >&2
        return 33
    fi

    loaded_generation="$(read_string_setting bootstrap-loaded-generation)"
    loaded_bootstrap_revision="$(read_string_setting bootstrap-loaded-revision)"
    loaded_runtime_revision="$(read_string_setting runtime-loaded-revision)"
    runtime_error="$(read_string_setting runtime-error)"

    if [[ "${loaded_generation}" != "${SOURCE_BOOTSTRAP_GENERATION}" ||
          "${loaded_bootstrap_revision}" != "${SOURCE_BOOTSTRAP_REVISION}" ||
          -z "${loaded_runtime_revision}" ]]; then
        echo "Velora became active, but bootstrap/runtime acknowledgement is stale." >&2
        echo "Loaded generation: ${loaded_generation}" >&2
        echo "Loaded bootstrap:  ${loaded_bootstrap_revision}" >&2
        echo "Loaded runtime:    ${loaded_runtime_revision}" >&2
        return 34
    fi

    if [[ -n "${runtime_error}" ]]; then
        echo "Velora became active with runtime error: ${runtime_error}" >&2
        return 35
    fi

    echo "Velora was registered and activated in the current Shell session."
    echo "Bootstrap revision: ${SOURCE_BOOTSTRAP_REVISION}"
    echo "Runtime revision:   ${loaded_runtime_revision}"
    echo "No logout is required."
    return 0
}

print_live_load_instructions() {
    echo
    echo "Velora is installed, but the running Shell needs one developer live-registration."
    echo "To activate it WITHOUT logout:"
    echo "  1. Press Alt+F2"
    echo "  2. Type: lg"
    echo "  3. Open the Flags tab"
    echo "  4. Enable: unsafe-mode"
    echo "  5. Close Looking Glass"
    echo "  6. Run: bash gnome-shell/install.sh"
    echo
    echo "The installer turns unsafe-mode OFF automatically after the live-load call."
}

attempt_live_register_or_explain() {
    local status

    set +e
    try_live_register
    status=$?
    set -e

    if [[ "${status}" -eq 0 ]]; then
        return 0
    fi

    if [[ "${status}" -eq 31 ]]; then
        print_live_load_instructions
        return 31
    fi

    echo "Current-session live registration failed with status ${status}." >&2
    echo "Check:" >&2
    echo "  gnome-extensions info ${UUID}" >&2
    echo "  journalctl --user -b -o cat | grep -i -E 'velora|gnome-shell'" >&2
    return "${status}"
}

hot_deploy_runtime() {
    local revision
    local previous_revision
    local runtime_dir
    local loaded_revision
    local runtime_error
    local file
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

    for ((i = 0; i < 80; i++)); do
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

    for ((i = 0; i < 50; i++)); do
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
    sync_hot_aux

    set +e
    ensure_bootstrap_active
    BOOTSTRAP_STATUS=$?
    set -e

    case "${BOOTSTRAP_STATUS}" in
        0)
            echo "Velora bootstrap is active; using live runtime hot-swap."
            hot_deploy_runtime
            exit $?
            ;;
        20|22|24)
            echo "Velora bootstrap needs current-session registration/refresh."
            attempt_live_register_or_explain
            exit $?
            ;;
        21|23)
            echo "GNOME knows Velora, but activation/runtime failed." >&2
            echo "Check:" >&2
            echo "  gnome-extensions info ${UUID}" >&2
            echo "  journalctl --user -b -o cat | grep -i -E 'velora|gnome-shell'" >&2
            exit "${BOOTSTRAP_STATUS}"
            ;;
        *)
            fail "Unexpected bootstrap status ${BOOTSTRAP_STATUS}"
            ;;
    esac
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
    gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true
fi

echo "Installing Velora bootstrap with GNOME's extension installer..."
gnome-extensions install --force "${PACK_PATH}"

[[ -d "${TARGET_DIR}" ]] ||
    fail "Installation completed but ${TARGET_DIR} was not created."

glib-compile-schemas --strict "${TARGET_DIR}/schemas"
record_bootstrap_identity

for installed_file in \
    metadata.json extension.js prefs.js stylesheet.css \
    runtime.js runtime.css apps.js dock.js geometry.js; do
    [[ -f "${TARGET_DIR}/${installed_file}" ]] ||
        fail "Installed extension is incomplete: ${installed_file} is missing."
done

write_string_setting bootstrap-loaded-generation ""
write_string_setting bootstrap-loaded-revision ""
write_string_setting runtime-revision "base"
write_string_setting runtime-loaded-revision ""
write_string_setting runtime-error ""

echo
echo "Velora bootstrap/scaffold installed successfully:"
echo "  ${TARGET_DIR}"
echo
echo "Fresh local install is complete on disk."

attempt_live_register_or_explain
exit $?
