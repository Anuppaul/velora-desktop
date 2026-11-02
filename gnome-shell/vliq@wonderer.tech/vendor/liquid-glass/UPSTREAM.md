# Vendored Liquid Glass renderer

Velora vendors the GNOME Liquid Glass implementation from:

- Upstream: https://github.com/ryohsuke1231/liquid-glass
- Upstream commit: 8b216405aff906e56204fc0fa747e7ff69fe4451
- License: MIT; see LICENSE in this directory.

The upstream source, compiled GJS runtime, shaders, schema XML, preferences code,
and package metadata are retained here without renderer rewrites. Generated
binary resources and demo screenshots are intentionally not vendored.

Velora-specific integration lives outside this directory in
`liquidGlassDock.js`, which supplies the custom floating dock geometry to the
upstream capture/rendering pipeline.
