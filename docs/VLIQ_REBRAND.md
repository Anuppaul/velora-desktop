# VLIQ — branding migration

**Public name: VLIQ.** Not "VLIQ Desktop."

VLIQ is the public-facing brand for the GNOME Shell 50 Liquid Glass and
Frosted Crystal project previously presented as Velora.

## What changes in this release

- The GNOME Extensions application listing reads **VLIQ**.
- Main README, About text, Preferences, runtime/installer messages,
  wallpaper preset labels, release titles, SVG diagram labels,
  contributor guides and GNOME Store submission documents use VLIQ.
- Public release source archives are named `vliq-<version>.tar.gz`.
- Supported Shell version remains **50**.
- The full Liquid Glass, Orb, Spotlight, wallpaper, Dock, brightness
  and Terminal Glass implementation stays the same.

## Legacy identifiers intentionally preserved

| Identifier | Existing value | Reason |
| --- | --- | --- |
| GNOME extension UUID | `velora@wonderer.tech` | GNOME treats a new UUID as a **different extension**. Preserving it avoids duplicate installs and lost update continuity. |
| User GSettings schema ID | `org.gnome.shell.extensions.velora` | Existing user preferences stay at the same dconf path. |
| User dconf path | `/org/gnome/shell/extensions/velora/` | Explicitly migrating/deleting this location could destroy saved settings. |
| Bootstrap API, hot-swap state and environment keys | Existing legacy names | The bootstrapped GNOME 50 loader must recognize existing local installations. |
| Internal CSS/shader/cache names | Existing `velora-` prefixes | Renaming compositor internals without a separate migration could break style/effect matching and hot reload. |
| GNOME Store inner ZIP | `velora@wonderer.tech.shell-extension.zip` | Matches the unchanged extension UUID; source release archive branding is independently VLIQ. |
| Screenshots filenames and legacy GitHub path | Existing names | Preserves image links and repository continuity while public captions say VLIQ. |

These identifiers are not user-visible branding. **Do not globally replace
every lowercase `velora` with `vliq` in code or remove the old GSettings
schema.** The legacy names also appear in historical logs and tests.

## Local update

```bash
cd ~/Documents/code/velora-desktop
git pull origin main
bash gnome-shell/install.sh
gnome-extensions info velora@wonderer.tech
```

The extension name in GNOME Extensions should display **VLIQ**. Because
the bootstrap source and metadata change, the existing installer may
require the GNOME session's normal logout/login cycle. Do not uninstall
the old UUID before reinstalling: that can delete settings and break Dock
state restoration.

## Repository rename (owner-only action)

The GitHub connector currently available for development cannot update
repository administration settings. After PR checks pass and the brand
is visible in the app, the owner can change the repository name:

1. Open the existing `Anuppaul/velora-desktop` GitHub repository.
2. Go to **Settings → General → Repository name**.
3. Rename the repository to **vliq**, if that exact slug is available.
4. Update the local remote, documentation URLs and badges after the
   rename. GitHub generally redirects old links, but check Actions,
   releases, issue templates and website references independently.

The rename has **not** been performed by changing README text.
No new domain or trademark is claimed, registered or reserved by this
source change.

## Trademark and public availability

Brand-name selection does not establish trademark rights or guarantee
availability of matching domains and handles. Obtain trademark counsel
or authoritative registry checks before commercial launch.

## Acceptance

- metadata name exactly `VLIQ`
- no public display string `VLIQ Desktop`
- no broken runtime imports, duplicate extension UUID or alternate
  canonical GSettings schema
- GNOME 50 unit/packaging and static review checks pass
- existing Settings, Orb, Spotlight, Brightness and native Dock remain
  operational after a local upgrade
