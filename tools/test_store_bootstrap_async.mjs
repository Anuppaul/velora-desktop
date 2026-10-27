import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercises the actual shipped GNOME 50 bootstrap marker loader so the
// EGO-X-004 synchronous-IO warning cannot regress unnoticed.
const path = new URL(
    '../gnome-shell/velora@wonderer.tech/extension.js',
    import.meta.url
);
const code = await readFile(path, 'utf8');

assert.doesNotMatch(code, /\.load_contents\s*\(\s*null\s*\)/,
    'the GNOME Shell bootstrap must never synchronously read the marker');
assert.match(code, /load_contents_async\(/);
assert.match(code, /load_contents_finish\(result\)/);
assert.match(code, /if \(!this\._enabled \|\| !this\._settings\)\s*return;/,
    'async enable() must not write to Settings after disable');

const start = code.indexOf('    async _readBootstrapRevision() {');
const end = code.indexOf('\n    _canonicalExtensionDir() {', start);
assert.ok(start >= 0 && end > start);
const methodCode = code.slice(start, end);
const fallback = '2026-09-28-b';
const loadRevision = new Function(
    'BOOTSTRAP_REVISION_FILE', 'VELORA_BOOTSTRAP_GENERATION',
    'return ({' + methodCode + '})._readBootstrapRevision;',
)('.velora-bootstrap-revision', fallback);

function make(marker) {
    return {
        dir: {
            get_child(name) {
                assert.equal(name, '.velora-bootstrap-revision');
                return marker;
            },
        },
    };
}

const absent = {
    query_exists() {return false;},
    load_contents_async() {throw Error('should not read missing marker');},
};
assert.equal(await loadRevision.call(make(absent)), fallback);

const revision = 'be901a2b44cc\n';
const loaded = {
    query_exists() {return true;},
    load_contents_async(_token, callback) {
        queueMicrotask(() => callback(this, 33));
    },
    load_contents_finish(result) {
        assert.equal(result, 33);
        return [true, new TextEncoder().encode(revision), 'etag'];
    },
};
assert.equal(await loadRevision.call(make(loaded)), 'be901a2b44cc');

const corrupt = {
    query_exists() {return true;},
    load_contents_async(_token, callback) {
        queueMicrotask(() => callback(this, 99));
    },
    load_contents_finish() {
        throw Error('permissions changed');
    },
};
assert.equal(await loadRevision.call(make(corrupt)), fallback,
    'store installs must not fail because the optional developer marker is invalid');

const startFailure = {
    query_exists() {return true;},
    load_contents_async() {throw Error('async source unavailable');},
};
assert.equal(await loadRevision.call(make(startFailure)), fallback);
console.log('GNOME Store bootstrap async marker read, missing marker fallback and no writes after disable PASS.');
