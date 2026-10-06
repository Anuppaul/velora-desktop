# Repository Settings Checklist

Most open-source project configuration lives in the repository and is version-controlled. A few important GitHub settings live only in repository administration and cannot be represented fully by committed files.

Use this checklist when maintaining Velora's GitHub repository.

## About / discoverability

Recommended repository description:

> GNOME Shell 50 extension adding Liquid Glass surfaces, Velora Orb, and Super+Space Spotlight while preserving native GNOME behavior.

Recommended topics:

- `gnome-shell`
- `gnome-extension`
- `gnome-shell-extension`
- `gnome`
- `ubuntu`
- `linux`
- `desktop`
- `desktop-customization`
- `liquid-glass`
- `gjs`
- `javascript`
- `wayland`
- `app-launcher`
- `spotlight`

Do not claim official GNOME Extensions publication until it actually exists.

## General repository settings

Recommended:

- Issues: enabled
- Discussions: enabled
- Pull requests: enabled
- Squash merge: enabled
- Automatically delete head branches after merge: enabled when comfortable with the workflow

Avoid enabling features solely for appearance if they are not used.

## Default branch

Default branch:

`main`

Direct pushes by the maintainer may be practical during early development, but contributor-facing work is safer when `main` is protected.

## Main branch protection / ruleset

Recommended baseline once the project is accepting external PRs regularly:

- require a pull request before merging;
- require at least 1 approval for non-maintainer contributor changes where practical;
- dismiss stale approvals when materially new commits are pushed;
- require conversation resolution before merge;
- require status checks to pass;
- block force pushes;
- block branch deletion.

Recommended required checks:

- `Repository checks / validate`
- CodeQL analysis, once the workflow has completed successfully and GitHub exposes its check name consistently

Do not require a check before it has a stable successful run, or the branch can become unnecessarily blocked.

## Security settings

Recommended for a public repository:

- enable Private Vulnerability Reporting;
- enable Dependabot alerts;
- enable dependency graph;
- enable secret scanning where GitHub makes it available;
- enable push protection where available and appropriate;
- keep CodeQL/code scanning enabled.

Security reporting policy:

[../SECURITY.md](../SECURITY.md)

## Actions

Recommended Actions policy:

- allow GitHub-authored actions and explicitly trusted third-party actions;
- keep workflow token permissions minimal;
- use read-only `contents` permissions by default;
- grant `security-events: write` only to the CodeQL job that needs it.

Current workflows follow least-privilege intent.

## Merge policy

Prefer focused pull requests.

Squash merge is a good default for small contributor PRs because it keeps `main` history readable while preserving PR discussion and authorship on GitHub.

Do not rewrite contributor authorship manually.

## Releases

Before the first public tagged release, follow:

[RELEASE_PROCESS.md](RELEASE_PROCESS.md)

Do not create historical versions for commits that were never released as versions.

## Review cadence

Periodically review:

- repository description/topics;
- branch rules;
- Actions permissions;
- security settings;
- CODEOWNERS;
- stale workflow versions;
- open security alerts;
- release/support policy;
- third-party provenance.

This checklist should evolve when GitHub or the project's maintenance model changes.
