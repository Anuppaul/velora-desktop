# VLIQ — complete GNOME Shell identity migration

**Public name: VLIQ.** This is the sole product name. The GitHub repository
is `Anuppaul/vliq`; the canonical extension UUID, schema, CSS/shaders,
runtime, tests, screenshot files and new release bundles are VLIQ.

## New canonical identity

| Component | New VLIQ identity |
| --- | --- |
| GNOME Extensions display name | `VLIQ` |
| GNOME Shell UUID | `vliq@wonderer.tech` |
| Source directory | `gnome-shell/vliq@wonderer.tech` |
| GSettings schema | `org.gnome.shell.extensions.vliq` |
| GSettings/dconf path | `/org/gnome/shell/extensions/vliq/` |
| Source repository | `https://github.com/Anuppaul/vliq` |
| Store-review ZIP | `vliq@wonderer.tech.shell-extension.zip` |
| GitHub source archive | `vliq-<version>.tar.gz` |
| User-facing name | `VLIQ` |

All first-party runtime constants, CSS IDs, shader cache identifiers,
extension metadata, documentation and build/test paths refer to VLIQ.
Vendored third-party Liquid Glass dependencies retain their legally
required original package identifiers and attribution; these are not
product branding.

## Upgrade from a previous local installation

GNOME Shell treats a new UUID as a **different extension**. A naive
rename could leave two compositors fighting over the screen or discard
saved preferences. The developer installer now performs a one-time,
reversible migration:

1. Validate GNOME Shell 50 and compile the new VLIQ schema before writing
   any settings.
2. Inspect the previous local extension and its dconf settings. The
   migration helper `gnome-shell/migrate_legacy_install.py` is the **only
   place that must identify the former extension UUID and dconf path**.
3. Back up old dconf settings privately to
   `~/.local/state/vliq/legacy-settings-backup.ini` (mode 0600).
4. Import real user preferences into `/org/gnome/shell/extensions/vliq/`
   only if that destination has no existing user settings. Exclude
   process-specific runtime revisions, diagnostics and captured Ubuntu
   Dock ownership flags. Never reset or delete the previous dconf values.
5. Install the new VLIQ files, compile schemas and prepare startup.
6. Only after the new extension is successfully installed, **disable**
   the previous extension so there are no two active glass renderers.
7. If VLIQ activation fails, the installer attempts to restore the
   previous extension. A first-time GNOME extension UUID may require
   logging out and logging in once.

To update an existing source checkout **after pulling the VLIQ changes**:

```bash
cd ~/Documents/code/velora-desktop
git remote set-url origin https://github.com/Anuppaul/vliq.git
git pull origin main
bash gnome-shell/install.sh
gnome-extensions info vliq@wonderer.tech
```

Your existing local checkout directory name is not an extension identity.
It can be renamed later, once it is safe to do so.

To verify or open preferences:

```bash
gnome-extensions list --active | grep -F 'vliq@wonderer.tech'
gnome-extensions prefs vliq@wonderer.tech
```

If GNOME has not registered the new UUID in the current Wayland session,
log out/in once before concluding that the install has failed.

## Manual rollback if the new extension does not activate

The installer automatically attempts rollback on a detected activation
failure. A newly registered UUID may still require **one GNOME Wayland
logout/login**, so missing immediate activation is not by itself a failure.

If, after the session refresh, VLIQ still fails to load, restore the previous
extension without deleting its settings:

```bash
python3 gnome-shell/migrate_legacy_install.py rollback
```

The rollback removes `vliq@wonderer.tech` from the persisted
`org.gnome.shell enabled-extensions` list and re-enables the previous
extension if it was enabled when migration began. It does **not** reset
either dconf path, delete the migration backup, or touch other installed
extensions. If the old UUID is not immediately recognized, log out/in
once after rollback. Run this **before** optional `finalize`.

The migration checkpoint and original settings backup are saved under
`~/.local/state/vliq/`. Do not delete this directory until you have
verified that your preferences and native Ubuntu Dock behavior are preserved.

## Optional cleanup after successful visual verification

Once VLIQ is active and its Orb, Liquid Glass, Dock and saved settings
work on the device, the following deliberately explicit operation can
uninstall the **disabled** previous GNOME extension:

```bash
python3 gnome-shell/migrate_legacy_install.py finalize
```

This refuses to run unless VLIQ is active. It does **not** erase the
original dconf backup, preserving a recovery option. Do not run the old
project's `uninstall.sh` after migration: that utility can modify saved
Ubuntu Dock and extension-list state while the new project is active.

The migration's backup and state files are intentionally retained in a
private user-owned location. For diagnosis of failed activation:

```bash
journalctl --user -b --no-pager -o cat |
  grep -i -E 'vliq|gnome-shell' | tail -n 40
```

## GNOME Store / releases

- A new GNOME UUID generally means a **new extension listing**, not an
  update to any listing registered under the previous UUID.
- VLIQ Store artifacts use the VLIQ UUID and canonical schema. No
  migration utility or developer installer is included inside the
  review ZIP.
- CI packaging and schema validation do not constitute GNOME Store
  approval or actual GNOME 50.1 visual acceptance.

## Brand and legal checks

Rebranding source code does not register a trademark or reserve domains.
Vendor licenses and provenance must remain available to downstream
users even after renaming. Trademarks, social handles and matching domain
availability require separate authoritative verification.
