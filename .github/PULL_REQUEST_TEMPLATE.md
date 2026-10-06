## What changed

Describe the focused change and why it is needed.

## Related issue

Closes #

## Testing

- GNOME Shell version:
- Distribution/version:
- Session: Wayland / X11
- Steps tested:

## Evidence

Add relevant logs, screenshots, screen recordings, or before/after performance observations.

## User / release impact

- Does this change user-visible behavior?
- Does it require an install/update note?
- Should `CHANGELOG.md` be updated?
- Does it affect supported environments or known limitations?

## Security and provenance

Mention any security-sensitive behavior, new command/file access, new dependency, vendored-code change, or licensing/provenance impact.

## Velora contract

- [ ] Native GNOME/Ubuntu layout and interaction remain intact.
- [ ] The PR solves one focused problem and avoids unrelated cleanup.
- [ ] Enable/disable cleanup is safe for runtime changes.
- [ ] No unnecessary polling or CPU screenshot/capture loop was introduced.
- [ ] GNOME Shell 50 behavior was tested where applicable.
- [ ] Documentation and changelog were updated when needed.
- [ ] Third-party license/provenance notices remain intact.
- [ ] Security-sensitive details are not being disclosed publicly before a coordinated fix.
