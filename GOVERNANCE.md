# Governance

Velora Desktop is an open-source project maintained through a lightweight maintainer-led model.

## Project maintainer

The current lead maintainer is [@Anuppaul](https://github.com/Anuppaul).

The maintainer is responsible for:

- project direction and architecture;
- reviewing and merging pull requests;
- release decisions;
- security coordination;
- repository administration;
- protecting the native-GNOME product contract;
- recognizing and expanding contributor responsibility over time.

## Decision making

Most changes are decided through normal issue, discussion and pull-request review.

The preferred process is:

1. define the user problem;
2. gather evidence or a reproducible case;
3. discuss architecture when the change is substantial;
4. implement the smallest useful change;
5. review lifecycle, performance and native-GNOME impact;
6. merge when the change is sufficiently safe and maintainable.

For routine fixes, documentation and clearly scoped improvements, a pull request may be enough.

For architectural changes, start with an issue or Discussion.

## Product contract

Velora's core architectural rule is:

> **Native GNOME/Ubuntu behavior first. Velora changes supported material and adds focused Velora features without replacing the desktop interaction model.**

Changes that conflict with this contract may be declined even if they work technically.

## Contributor roles

Participation is based on demonstrated contribution, not title.

### Contributor

Anyone who contributes code, documentation, testing, bug reports, design feedback, accessibility review or other useful work.

### Reviewer

A contributor who repeatedly demonstrates reliable understanding of a project area may be invited to review work in that area.

### Maintainer

A maintainer has merge/release/repository responsibility and is trusted to apply the project contract consistently.

Maintainer access is granted explicitly. There is no automatic promotion schedule.

## Review expectations

Pull requests should be reviewed for:

- correctness;
- scope;
- GNOME Shell 50 compatibility;
- enable/disable lifecycle safety;
- accessibility;
- performance impact;
- documentation;
- licensing and provenance.

A maintainer may request changes before merge.

## Conflicts of interest

Contributors should disclose a material conflict of interest when relevant to a proposal or review, especially when a change promotes a commercial product, external dependency or project they control.

## Security decisions

Security reports follow [SECURITY.md](SECURITY.md). Security fixes may be handled privately until coordinated disclosure is safe.

## Changes to governance

Governance changes should be proposed publicly through a pull request or Discussion unless the change itself is security-sensitive.

As the contributor base grows, this document can evolve toward shared maintainership without changing the project's technical contract.
