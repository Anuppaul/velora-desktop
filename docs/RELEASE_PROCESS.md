# Release Process

This document describes the intended release discipline for Velora.

Velora currently has no public GitHub release history, so the first tagged release should establish the release baseline rather than pretending prior semantic versions exist.

## Release principles

A release should be:

- reproducible from a specific Git commit;
- tested on the supported GNOME Shell line;
- accompanied by user-visible release notes;
- explicit about known limitations;
- auditable for vendored licenses/provenance;
- recoverable if a regression is discovered.

## Before a release

1. Ensure the intended release commit is on `main`.
2. Confirm repository checks are passing.
3. Review open high-severity bugs and security reports.
4. Verify `metadata.json` still targets the intended GNOME Shell version.
5. Run a clean install test.
6. Run an update/hot-swap test from the previous supported build when one exists.
7. Test enable → use → disable → re-enable.
8. Exercise:
   - Ubuntu Dock/native Dock integration;
   - Quick Settings;
   - Date/Calendar;
   - notifications;
   - panel/status popups;
   - App Grid/Overview;
   - Orb;
   - Spotlight.
9. Review `CHANGELOG.md`.
10. Confirm vendored/derived license and provenance files remain present.

## Packaging

Use the project installer/package path documented by the current source tree.

Do not publish a package assembled from uncommitted local changes.

A release artifact should correspond to a documented commit SHA.

## Versioning

Until the first public tagged release is cut, version numbering remains intentionally unset.

When public releases begin, prefer a consistent `vMAJOR.MINOR.PATCH` scheme unless GNOME Extensions packaging requirements make another scheme materially better.

Do not retroactively invent release versions for old untagged commits.

## Release notes

Release notes should include:

- highlights;
- user-visible changes;
- important fixes;
- compatibility/support statement;
- known issues;
- upgrade/install notes when needed;
- security fixes after coordinated disclosure;
- contributor credit.

## Tagging

Tags should identify the exact reviewed release commit.

Recommended shape once versioning begins:

```text
vMAJOR.MINOR.PATCH
```

## Post-release

After publishing:

1. verify the release artifact installs correctly;
2. update comparison links in `CHANGELOG.md`;
3. move released changelog entries out of `Unreleased`;
4. open follow-up issues for deferred known problems;
5. monitor early bug reports.

## Emergency fix

For a serious regression:

1. reproduce it on the released commit;
2. prepare the smallest safe fix;
3. run the relevant regression checks;
4. publish a patch release;
5. clearly document the affected version and mitigation.

Security incidents follow [../SECURITY.md](../SECURITY.md).
