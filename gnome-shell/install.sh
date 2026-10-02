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
INSTALLER_VERSION="2026-10-02.197"

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
    "orbThemeRuntime.js"
    "runtime.css"
    "apps.js"
    "geometry.js"
    "liquidGlassDock.js"
    "glassMaterialSystem.js"
    "notificationGlass.js"
    "popupGlass.js"
    "shellCards.js"
    "appGridBackdrop.js"
    "overviewSearchGlass.js"
    "overviewCloseGlass.js"
    "searchSurface.js"
    "spotlightGlass.js"
    "spotlightSearch.js"
    "sharedAdaptiveText.js"
    "orbGlass.js"
)

RUNTIME_DIRS=(
    "vendor/liquid-glass"
)

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

refresh_prefs_process() {
    # GNOME Extensions can keep prefs.js imported from the same URI after
    # the file changes. Quit the app after prefs/schema sync so the next
    # preferences window imports the current module.
    if command -v gapplication >/dev/null 2>&1; then
        gapplication quit org.gnome.Extensions >/dev/null 2>&1 || true
    fi
}

for command_name in \
    gnome-shell gnome-extensions glib-compile-schemas gsettings gdbus python3 \
    mktemp sed grep sha256sum mkdir cp rm sleep cat head tr env dirname find sort; do
    command -v "${command_name}" >/dev/null 2>&1 ||
        fail "${command_name} was not found."
done

for required_file in \
    "${BOOTSTRAP_FILES[@]}" "${HOT_AUX_FILES[@]}" "${RUNTIME_FILES[@]}"; do
    [[ -f "${SOURCE_DIR}/${required_file}" ]] ||
        fail "Required Velora file is missing: ${required_file}"
done

for required_dir in "${RUNTIME_DIRS[@]}"; do
    [[ -d "${SOURCE_DIR}/${required_dir}" ]] ||
        fail "Required Velora runtime directory is missing: ${required_dir}"
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
    installed_revision="$(bootstrap_revision_for_dir "${TARGET_DIR}")" || return 1

    if [[ "${installed_generation}" != "${SOURCE_BOOTSTRAP_GENERATION}" ||
          "${installed_revision}" != "${SOURCE_BOOTSTRAP_REVISION}" ]]; then
        echo "Installed bootstrap: ${installed_generation} / ${installed_revision}" >&2
        echo "Source bootstrap:    ${SOURCE_BOOTSTRAP_GENERATION} / ${SOURCE_BOOTSTRAP_REVISION}" >&2
        return 1
    fi

    # Schema/prefs are hot auxiliary data; only stable bootstrap bytes define this marker.
    record_bootstrap_identity

    return 0
}

sync_hot_aux() {
    local file
    local live_dir
    local runtime_source
    local destination

    for file in "${HOT_AUX_FILES[@]}"; do
        mkdir -p "$(dirname "${TARGET_DIR}/${file}")"
        cp -f "${SOURCE_DIR}/${file}" "${TARGET_DIR}/${file}"
    done

    # Liquid Glass registers GObject classes whose type names live for the
    # lifetime of the GNOME Shell process. Keep one canonical vendor tree
    # outside hashed runtime revisions so all later hot-swaps can reuse the
    # same cached module URI instead of evaluating registerClass() again.
    for runtime_source in "${RUNTIME_DIRS[@]}"; do
        destination="${TARGET_DIR}/${runtime_source}"
        rm -rf "${destination}"
        mkdir -p "$(dirname "${destination}")"
        cp -a "${SOURCE_DIR}/${runtime_source}" "${destination}"
    done

    [[ -f "${TARGET_DIR}/vendor/liquid-glass/dist/liquidEffect.js" ]] ||
        fail "Canonical Liquid Glass renderer sync failed."
    [[ -f "${TARGET_DIR}/vendor/liquid-glass/shaders/glass.frag" ]] ||
        fail "Canonical Liquid Glass shader sync failed."

    glib-compile-schemas --strict "${TARGET_DIR}/vendor/liquid-glass/schemas"

    [[ -f "${TARGET_DIR}/vendor/liquid-glass/schemas/gschemas.compiled" ]] ||
        fail "Canonical Liquid Glass GSettings compilation failed."

    glib-compile-schemas --strict "${TARGET_DIR}/schemas"
    [[ -f "${TARGET_DIR}/schemas/gschemas.compiled" ]] ||
        fail "Canonical Velora GSettings compilation failed."

    shopt -s nullglob
    for live_dir in "${HOME}"/.cache/velora-live/"${SOURCE_BOOTSTRAP_REVISION}"-*/"${UUID}"; do
        [[ -d "${live_dir}" ]] || continue
        for file in "${HOT_AUX_FILES[@]}"; do
            mkdir -p "$(dirname "${live_dir}/${file}")"
            cp -f "${SOURCE_DIR}/${file}" "${live_dir}/${file}"
        done

        # prefs.js imports the upstream preference implementation relative to
        # the extension root. A developer live-registration uses live_dir as
        # that root, so mirror the vendored tree there as well.
        for runtime_source in "${RUNTIME_DIRS[@]}"; do
            destination="${live_dir}/${runtime_source}"
            rm -rf "${destination}"
            mkdir -p "$(dirname "${destination}")"
            cp -a "${SOURCE_DIR}/${runtime_source}" "${destination}"
        done

        glib-compile-schemas --strict             "${live_dir}/vendor/liquid-glass/schemas"
        glib-compile-schemas --strict "${live_dir}/schemas"
    done
    shopt -u nullglob

    refresh_prefs_process
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


        if [[ "${loaded_generation}" == "${SOURCE_BOOTSTRAP_GENERATION}" &&
              -n "${loaded_runtime_revision}" ]]; then
            # Stable bootstrap bytes already match; normalize the old marker value.
            write_string_setting bootstrap-loaded-revision "${SOURCE_BOOTSTRAP_REVISION}"
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
    local runtime_source
    local relative

    {
        for file in "${RUNTIME_FILES[@]}"; do
            printf '%s\0' "${file}"
            cat "${SOURCE_DIR}/${file}"
        done

        printf '%s\0' "schemas/org.gnome.shell.extensions.velora.gschema.xml"
        cat "${SOURCE_DIR}/schemas/org.gnome.shell.extensions.velora.gschema.xml"

        for runtime_source in "${RUNTIME_DIRS[@]}"; do
            while IFS= read -r file; do
                relative="${file#${SOURCE_DIR}/}"
                printf '%s\0' "${relative}"
                cat "${file}"
            done < <(
                find "${SOURCE_DIR}/${runtime_source}" -type f -print |
                    LC_ALL=C sort
            )
        done
    } | sha256sum | sed -E 's/^([0-9a-f]{20}).*/\1/'
}

stage_runtime_revision() {
    local revision="$1"
    local runtime_dir
    local file
    local runtime_source
    local destination

    runtime_dir="${TARGET_DIR}/runtime-revisions/${revision}"
    mkdir -p "${runtime_dir}"

    for file in "${RUNTIME_FILES[@]}"; do
        cp -f "${SOURCE_DIR}/${file}" "${runtime_dir}/${file}"
    done

    for runtime_source in "${RUNTIME_DIRS[@]}"; do
        destination="${runtime_dir}/${runtime_source}"
        rm -rf "${destination}"
        mkdir -p "$(dirname "${destination}")"
        cp -a "${SOURCE_DIR}/${runtime_source}" "${destination}"
    done

    for file in "${RUNTIME_FILES[@]}"; do
        [[ -f "${runtime_dir}/${file}" ]] ||
            fail "Runtime staging is incomplete: ${file}"
    done

    for runtime_source in "${RUNTIME_DIRS[@]}"; do
        [[ -d "${runtime_dir}/${runtime_source}" ]] ||
            fail "Runtime staging is incomplete: ${runtime_source}"
    done

    [[ -f "${runtime_dir}/vendor/liquid-glass/dist/liquidEffect.js" ]] ||
        fail "Vendored Liquid Glass renderer is missing from staged runtime."
    [[ -f "${runtime_dir}/vendor/liquid-glass/shaders/glass.frag" ]] ||
        fail "Vendored Liquid Glass shader is missing from staged runtime."
    [[ -f "${runtime_dir}/vendor/liquid-glass/LICENSE" ]] ||
        fail "Vendored Liquid Glass license is missing from staged runtime."
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
    stage_runtime_revision "${runtime_rev}"

    write_string_setting runtime-error ""
    write_string_setting runtime-loaded-revision ""
    write_string_setting runtime-revision "${runtime_rev}"

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

    for runtime_source in "${RUNTIME_DIRS[@]}"; do
        destination="${live_dir}/${runtime_source}"
        rm -rf "${destination}"
        mkdir -p "$(dirname "${destination}")"
        cp -a "${TARGET_DIR}/${runtime_source}" "${destination}"
    done

    glib-compile-schemas --strict         "${live_dir}/vendor/liquid-glass/schemas"

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
    const {
        ExtensionState,
        ExtensionType,
    } = await import('resource:///org/gnome/shell/misc/extensionUtils.js');

    const uuid = ${uuid_json};
    const dir = Gio.File.new_for_path(${dir_json});
    const manager = Main.extensionManager;

    try {
        if (global.settings.get_boolean('disable-user-extensions'))
            throw new Error('GNOME user extensions are globally disabled');

        const existing = manager.lookup(uuid);
        if (existing)
            await manager.unloadExtension(existing);

        const extension = manager.createExtensionObject(
            uuid,
            dir,
            ExtensionType.PER_USER
        );

        await manager.loadExtension(extension);

        if (
            extension.state === ExtensionState.ERROR ||
            extension.state === ExtensionState.OUT_OF_DATE
        ) {
            throw new Error(
                'Velora could not be loaded: ' +
                (extension.error || extension.state)
            );
        }

        const shellSettings = new Gio.Settings({
            schema_id: 'org.gnome.shell',
        });
        let enabled = shellSettings
            .get_strv('enabled-extensions')
            .filter(item => item !== uuid);
        const disabled = shellSettings
            .get_strv('disabled-extensions')
            .filter(item => item !== uuid);

        enabled.push(uuid);

        manager._enabledExtensions =
            manager._enabledExtensions.filter(item => item !== uuid);
        manager._enabledExtensions.push(uuid);
        extension.enabled = true;

        shellSettings.delay();
        shellSettings.set_strv('disabled-extensions', disabled);
        shellSettings.set_strv('enabled-extensions', enabled);
        shellSettings.apply();

        await manager._callExtensionEnable(uuid);

        const current = manager.lookup(uuid);
        if (!current || current.state !== ExtensionState.ACTIVE) {
            throw new Error(
                'Velora did not reach ACTIVE state: ' +
                (current?.state ?? 'missing') + ' ' +
                (current?.error ?? '')
            );
        }

        return {
            state: current.state,
            path: current.path,
            error: current.error ?? '',
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

    local ready=0
    local i

    for ((i = 0; i < 120; i++)); do
        loaded_generation="$(read_string_setting bootstrap-loaded-generation)"
        loaded_bootstrap_revision="$(read_string_setting bootstrap-loaded-revision)"
        loaded_runtime_revision="$(read_string_setting runtime-loaded-revision)"
        runtime_error="$(read_string_setting runtime-error)"

        if [[ -n "${runtime_error}" ]]; then
            break
        fi

        if gnome-extensions list --active 2>/dev/null | grep -Fxq "${UUID}" &&
           [[ "${loaded_generation}" == "${SOURCE_BOOTSTRAP_GENERATION}" ]] &&
           [[ "${loaded_bootstrap_revision}" == "${SOURCE_BOOTSTRAP_REVISION}" ]] &&
           [[ -n "${loaded_runtime_revision}" ]]; then
            ready=1
            break
        fi

        sleep 0.1
    done

    if [[ -n "${runtime_error}" ]]; then
        echo "Velora became active with runtime error: ${runtime_error}" >&2
        return 35
    fi

    if [[ "${ready}" -ne 1 ]]; then
        echo "Velora live registration did not finish its bootstrap/runtime handshake." >&2
        echo "Source generation: ${SOURCE_BOOTSTRAP_GENERATION}" >&2
        echo "Loaded generation: ${loaded_generation}" >&2
        echo "Source bootstrap:  ${SOURCE_BOOTSTRAP_REVISION}" >&2
        echo "Loaded bootstrap:  ${loaded_bootstrap_revision}" >&2
        echo "Loaded runtime:    ${loaded_runtime_revision}" >&2
        echo "Eval result:       ${output}" >&2
        return 34
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
    stage_runtime_revision "${revision}"

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
        23)
            echo "Velora bootstrap is active, but the current runtime failed."
            echo "Attempting automatic recovery with a fresh hashed runtime..."
            hot_deploy_runtime
            exit $?
            ;;
        21)
            echo "GNOME knows Velora, but activation failed." >&2
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

# Only package Velora-owned bootstrap/runtime files. Do NOT pass the vendored
# upstream extension tree as --extra-source: it contains its own metadata.json
# and UUID, and GNOME 50 may treat that nested metadata as the package identity.
# The complete vendor tree is copied deterministically into TARGET_DIR after
# gnome-extensions install and before Velora is enabled/live-registered.
for source_name in "${RUNTIME_FILES[@]}"; do
    PACK_ARGS+=(--extra-source="${source_name}")
done

PACK_ARGS+=("${SOURCE_DIR}")

echo "Building GNOME extension bundle..."
gnome-extensions "${PACK_ARGS[@]}"

# GNOME versions do not all use the same generated archive basename.
# The output directory is a fresh mktemp directory, so discover the bundle
# that pack actually created instead of assuming ${UUID}.shell-extension.zip.
mapfile -t PACK_CANDIDATES < <(
    find "${BUILD_DIR}" -maxdepth 1 -type f -name '*.zip' -print |
        LC_ALL=C sort
)

if [[ "${#PACK_CANDIDATES[@]}" -eq 0 ]]; then
    echo "gnome-extensions pack returned success but created no zip in:" >&2
    echo "  ${BUILD_DIR}" >&2
    echo "Build directory contents:" >&2
    find "${BUILD_DIR}" -maxdepth 2 -type f -print >&2 || true
    fail "GNOME extension bundle was not produced."
fi

if [[ "${#PACK_CANDIDATES[@]}" -gt 1 ]]; then
    echo "gnome-extensions pack created multiple zip bundles:" >&2
    printf '  %s\n' "${PACK_CANDIDATES[@]}" >&2
    fail "Unable to choose the Velora extension bundle safely."
fi

PACK_PATH="${PACK_CANDIDATES[0]}"
echo "Bundle: ${PACK_PATH}"

if command -v unzip >/dev/null 2>&1; then
    REQUIRED_PACKED_FILES=(
        "metadata.json"
        "extension.js"
        "prefs.js"
        "stylesheet.css"
        "runtime.js"
        "orbThemeRuntime.js"
        "runtime.css"
        "apps.js"
        "geometry.js"
        "liquidGlassDock.js"
        "notificationGlass.js"
        "popupGlass.js"
        "shellCards.js"
        "schemas/org.gnome.shell.extensions.velora.gschema.xml"
    )

    PACK_LIST="$(unzip -Z1 "${PACK_PATH}")"
    for packed_file in "${REQUIRED_PACKED_FILES[@]}"; do
        grep -Fxq "${packed_file}" <<<"${PACK_LIST}" ||
            fail "Bundle verification failed: ${packed_file} is missing."
    done

    PACK_UUID="$(
        unzip -p "${PACK_PATH}" metadata.json |
            python3 -c 'import json,sys; print(json.load(sys.stdin).get("uuid", ""))'
    )"
    [[ "${PACK_UUID}" == "${UUID}" ]] ||
        fail "Bundle UUID mismatch: expected ${UUID}, got ${PACK_UUID:-<empty>}"
fi

if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    gnome-extensions disable "${UUID}" >/dev/null 2>&1 || true
fi

echo "Installing Velora bootstrap with GNOME's extension installer..."
gnome-extensions install --force "${PACK_PATH}"

[[ -d "${TARGET_DIR}" ]] ||
    fail "Installation completed but ${TARGET_DIR} was not created."

# Do not rely on gnome-extensions install --force to refresh every
# extra source in an already existing user-extension directory. Make the
# canonical on-disk copy deterministic before any current-session live load.
for file in "${BOOTSTRAP_FILES[@]}" "${HOT_AUX_FILES[@]}" "${RUNTIME_FILES[@]}"; do
    parent="$(dirname "${TARGET_DIR}/${file}")"
    mkdir -p "${parent}"
    cp -f "${SOURCE_DIR}/${file}" "${TARGET_DIR}/${file}"
done

for runtime_source in "${RUNTIME_DIRS[@]}"; do
    destination="${TARGET_DIR}/${runtime_source}"
    rm -rf "${destination}"
    mkdir -p "$(dirname "${destination}")"
    cp -a "${SOURCE_DIR}/${runtime_source}" "${destination}"
done

# Remove launcher-era modules left by older Velora installs.
rm -f \
    "${TARGET_DIR}/dock.js" \
    "${TARGET_DIR}/floatingDock.js" \
    "${TARGET_DIR}/dateMenuGlass.js"

glib-compile-schemas --strict "${TARGET_DIR}/vendor/liquid-glass/schemas"
[[ -f "${TARGET_DIR}/vendor/liquid-glass/schemas/gschemas.compiled" ]] ||
    fail "Installed Liquid Glass GSettings compilation failed."

glib-compile-schemas --strict "${TARGET_DIR}/schemas"
record_bootstrap_identity
refresh_prefs_process

for installed_file in \
    metadata.json extension.js prefs.js stylesheet.css \
    runtime.js orbThemeRuntime.js runtime.css apps.js geometry.js \
    liquidGlassDock.js notificationGlass.js popupGlass.js shellCards.js; do
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
