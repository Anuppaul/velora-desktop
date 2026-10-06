# Issue and Pull Request Triage

This document defines a lightweight triage process for Velora.

## Issue quality

A bug is ready for investigation when it has enough information to reproduce or meaningfully narrow the problem.

Useful fields include:

- GNOME Shell version;
- distribution/version;
- Wayland/X11 session;
- Velora revision;
- reproduction steps;
- expected vs actual behavior;
- relevant logs;
- visual evidence where applicable.

If information is missing, ask for the smallest additional evidence needed.

## Core labels

Velora uses GitHub's standard labels where they fit:

- `bug` — reproducible incorrect behavior;
- `enhancement` — improvement or feature request;
- `documentation` — docs-only or docs-primary work;
- `good first issue` — tightly scoped work suitable for a newcomer;
- `help wanted` — contributor participation is especially welcome.

Labels describe work; they are not severity ratings.

## Good first issue standard

A good first issue should have:

- a clear goal;
- bounded scope;
- relevant file/component hints;
- acceptance criteria;
- no hidden architecture dependency;
- a reviewer path.

Do not label an issue `good first issue` merely because it looks small.

## Help wanted standard

Use `help wanted` when the work is useful and maintainers actively welcome outside ownership.

## Duplicates

When closing a duplicate, link the canonical issue so discussion and evidence stay consolidated.

## Feature proposals

Broad ideas should start in Discussions.

Convert them into issues when the user goal and implementation boundary are sufficiently clear.

## Pull requests

A PR should normally:

- address one clear problem;
- link a relevant issue when one exists;
- include testing evidence;
- avoid unrelated cleanup;
- satisfy the PR template;
- preserve licensing/provenance.

Draft PRs are appropriate for early technical feedback.

## Inactivity

Velora does not automatically close valid issues merely because they are old.

An issue may be closed when:

- it is fixed;
- it is a duplicate;
- it no longer reproduces on the supported version;
- it is outside project scope;
- the underlying upstream behavior has changed enough that the report is no longer actionable.

## Security

Potential vulnerabilities follow [../SECURITY.md](../SECURITY.md), not ordinary public triage.
