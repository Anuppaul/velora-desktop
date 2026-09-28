# Velora Liquid Glass Concept

## Purpose

Velora Liquid Glass is the retained visual identity from the former Android launcher prototype. This document is platform-neutral: it defines the material language and behavior, not an Android UI architecture.

The goal is a surface that feels luminous, translucent and tactile without becoming visually noisy or computationally wasteful.

## Core material model

A Velora glass surface is built from several restrained layers rather than one opaque fill:

1. Background transmission — the wallpaper or scene remains perceptible beneath the surface.
2. Soft blur — native backdrop/window blur where supported.
3. Neutral luminous film — a low-alpha white layer keeps the surface readable.
4. Ambient color refraction — wallpaper-derived accent and secondary colors tint the glass.
5. Specular sheen — a bright, soft highlight concentrated toward the upper-left.
6. Secondary glow — cyan/blue light can bloom toward the lower-right.
7. Accent refraction — violet/accent light can appear toward the lower-left.
8. Luminous edge — a thin highlight border separates glass from the scene.
9. Depth — soft shadow only; no heavy black card treatment.

The result should read as transparent material floating above the wallpaper, not as a dark rectangle with opacity.

## Wallpaper-aware palette

The original prototype derived a palette from wallpaper colors and then moved those colors toward white for readability.

Reference defaults:

- Accent fallback: #B7A7FF
- Secondary fallback: #78D9FF
- Dark glass base: approximately #080910

Reference adaptation behavior:

- Primary wallpaper color -> mix roughly 38% toward white.
- Secondary wallpaper color -> mix roughly 42% toward white.
- If only one useful wallpaper color exists, it may drive both accent roles with different lightness treatment.

These percentages are visual references, not a rigid cross-platform API contract.

## Reference panel composition

The Android prototype's strongest Liquid Glass panel used a gradient similar to:

- white at about 24% alpha;
- secondary accent at about 17% alpha;
- primary accent at about 12% alpha;
- deep blue-black at about 34% alpha.

The border was intentionally brighter than the fill, with a gradient roughly ranging from white 82% alpha at the brightest edge through white 24%, secondary accent 52%, and accent 24%.

A platform implementation should tune these values for its compositor, color space and wallpaper while preserving the same perceived hierarchy.

## Specular and refraction geometry

### Upper-left highlight

Use a broad radial or elliptical sheen:

- origin near the upper-left, around 20% of width and 5-8% of height;
- brightest point white, roughly 40-46% alpha at full material intensity;
- fades through weaker white into transparency;
- large enough to feel like reflected environmental light rather than a sticker.

### Lower-right secondary glow

Use the secondary/cyan family near the lower-right:

- center can sit close to 95% width / 95% height;
- broad radius;
- around one-third alpha at the strongest point in a full-intensity local panel;
- fades quickly enough to avoid turning the whole surface blue.

### Lower-left accent glow

A smaller violet/accent refraction may originate near the lower-left:

- low-to-medium alpha;
- broad feather;
- supports depth without competing with content.

## Blur

Blur is enhancement, not the sole source of the glass effect.

The former Android implementation exposed a normalized blur-strength control and mapped it to native platform blur.

Reference Android prototype maxima were approximately:

- background blur radius: 96 px;
- behind/backdrop blur radius: 72 px.

Other platforms should map normalized strength to native blur units rather than copying Android pixel radii literally.

### Fallback

If real blur is unavailable, the design must remain recognizable using:

- translucent gradient film;
- wallpaper-derived color;
- luminous edge;
- specular/refraction overlays;
- restrained shadow.

Do not simulate blur with a continuously expensive custom rendering loop merely to match the reference.

## Full-page glass

Large surfaces should not look like one huge rounded card floating inside the screen.

For full-page surfaces:

- use an edge-to-edge or borderless glass field;
- keep the wallpaper/scene visibly connected underneath;
- use soft global ambient gradients;
- reserve rounded glass cards for local groups, controls or contained items;
- avoid double-card borders and nested heavy frames.

This principle came from the later Android prototype where large launcher surfaces moved to borderless full-page glass.

## Local glass cards

Contained controls can use rounded local glass surfaces.

Reference traits:

- generous radius;
- translucent fill;
- thin luminous border;
- upper-left sheen;
- optional cyan/violet ambient reflection;
- soft shadow;
- no thick outline;
- no opaque backing unless required for accessibility.

## Pills and compact controls

Pills use the same material language:

- capsule geometry;
- compact padding;
- high-contrast foreground text or icon;
- subdued translucency compared with hero glass panels.

## Icon treatment

Icons placed on glass should feel integrated rather than boxed.

Preferred treatment:

- preserve native/app icon artwork;
- use a restrained translucent circular bed only when needed for contrast;
- avoid excessive colored backing plates;
- active state can use a tiny luminous dot or subtle ring;
- hover/focus may use modest scale and highlight changes.

## Motion

Motion should be restrained and material-like:

- short ease-out expansion;
- soft collapse;
- no constant shimmer;
- no perpetual animation;
- no exaggerated spring unless interaction specifically calls for it.

Glass must still look premium when animation is disabled.

## Contrast and accessibility

Glass transparency must never win over readability.

Required behavior:

- foreground text/icons maintain sufficient contrast against changing wallpaper;
- adapt tint/film strength when wallpaper is unusually bright or low-contrast;
- focused/selected controls need more than color alone when practical;
- reduced-motion settings should be respected;
- low-power or compositor-limited environments retain usable contrast with simplified effects.

## Performance contract

Liquid Glass must not become an excuse for permanent render cost.

Principles:

- prefer compositor/native backdrop blur;
- avoid continuously recomputing wallpaper colors;
- update wallpaper-derived palette only when wallpaper/theme context changes;
- cache reusable visual data where appropriate;
- stop animations when idle;
- provide a cheap non-blur fallback;
- do not require an always-running background service for appearance.

## Design intensity

Implementations may expose one normalized intensity control.

A useful range is approximately:

- low: 0.35;
- default/full-page: 0.7-0.8;
- strong/local panel: 1.0.

Intensity may scale translucent fill alpha, edge sheen, ambient tint, highlight strength, shadow depth and blur radius. It should not simply multiply every layer equally if that harms readability.

## Not part of the retained concept

The following former Android product features are not part of the retained Liquid Glass identity:

- Android launcher/Home replacement;
- phone Home pages and app drawer implementation;
- Android widgets;
- custom phone navigation and Recents;
- Android Control Center and notification integration;
- accessibility navigation services;
- Android permissions/setup flows;
- APK/AAB release and signing;
- Colab Android builds;
- Android simulation mode;
- phone-specific gestures and release channels.

Those were implementation/product decisions around the material, not the material itself.

## Canonical summary

Velora Liquid Glass is wallpaper-aware luminous material with real depth, translucent color refraction and a bright edge — visually rich while idle, lightweight in implementation, and readable on changing backgrounds.

That is the part of the former Android work intentionally preserved on main.
