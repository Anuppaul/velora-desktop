# Velora product vision

## Product statement

Velora is a premium, lightweight Android launcher that turns the Home screen into a freeform spatial canvas instead of a fixed icon grid.

## Design principles

### Free, not chaotic
There is no mandatory Home grid. Users decide exact position and visual hierarchy. Normalized coordinates keep the composition stable across screens.

### Liquid glass without waste
Glass surfaces should feel layered, luminous and tactile. Visual effects must not become a reason for permanent GPU load or background battery drain.

### One visual language
Home, app groups, widgets, app drawer, launcher settings, control center and the custom navigation surface should feel like parts of one interface.

### Personal hierarchy
Important apps can be physically larger. Less important apps can be smaller. Groups are spatial objects, not just stock folders.

### Lightweight by architecture
Velora should not need an account, cloud synchronization, analytics or a persistent network connection to work.

## Core interaction system

- Freeform drag for Home items
- Continuous global icon-size slider
- Individual item scale from 0.6x to 1.8x
- Drag-to-group
- Swipe up: Apps
- Swipe down: Control Center
- Custom launcher navigation surface
- Premium native widgets
- Android widget hosting in a later slice

## Visual identity

Velora should use original branding. The center navigation control is the Velora Orb rather than copying another platform's trademarked logo.

The glass language combines translucent layers, subtle light edges, depth, rounded geometry and restrained motion.

## Roadmap

### Foundation
Launcher role, freeform icons, scale, grouping, app drawer, glass shell, Colab build.

### Native widgets
Clock variants, calendar, battery, media, weather provider abstraction, device status, configurable widget sizing and free placement.

### Control Center
Richer notification grouping, media session controls, brightness integration where Android permits it, device shortcuts and optional overlay entry points.

### Spatial editing
Multi-select, z-order, rotation, alignment guides that remain optional, group naming, group breakup, layout profiles and backup/export.

### Performance pass
Startup profiling, icon cache tuning, recomposition audit, animation quality tiers and low-power mode.

### Advanced personal mode
Optional capabilities for the owner's own device can be explored separately from the standard launcher build. These features must not contaminate the safe default architecture.
