const MIN_RADIAL_GAP = 10;
export const ICON_HOVER_SCALE = 1.12;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function safeColor(value, fallback) {
    return /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value ?? '')
        ? value
        : fallback;
}

export function effectiveRingGap(iconSize, requestedGap) {
    return Math.max(requestedGap, iconSize + MIN_RADIAL_GAP);
}

function requiredCenterDistance(iconSize, iconGap) {
    const hoveredRadius = iconSize * ICON_HOVER_SCALE / 2;
    const normalRadius = iconSize / 2;
    return hoveredRadius + normalRadius + iconGap;
}

function minimumAngularStep(radius, iconSize, iconGap) {
    if (radius <= 0)
        return Math.PI;

    const centerDistance = requiredCenterDistance(iconSize, iconGap);
    const ratio = Math.min(1, centerDistance / (2 * radius));
    return 2 * Math.asin(ratio);
}

function anglesForRing(radius, arc, iconSize, iconGap) {
    const start = arc.start * Math.PI / 180;
    const end = arc.end * Math.PI / 180;
    const span = Math.abs(end - start);
    const minStep = minimumAngularStep(radius, iconSize, iconGap);

    if (span >= 350 * Math.PI / 180) {
        const count = Math.max(1, Math.floor((2 * Math.PI) / minStep));
        const circulationStart = Math.PI;

        // Screen-space angles increase clockwise because +Y points downward.
        // Starting at PI therefore gives the requested deterministic order:
        // Left -> Top -> Right -> Bottom -> back to Left.
        return Array.from(
            {length: count},
            (_unused, index) =>
                circulationStart + (2 * Math.PI * index / count)
        );
    }

    if (span < minStep)
        return [(start + end) / 2];

    const intervals = Math.max(1, Math.floor(span / minStep));
    const count = intervals + 1;
    return Array.from(
        {length: count},
        (_unused, index) => start + ((end - start) * index / intervals)
    );
}

export function slotsForRings(
    centerX,
    centerY,
    orbSize,
    ringGap,
    ringCount,
    arc,
    iconSize,
    iconGap,
    monitor,
    screenMargin
) {
    const minX = monitor.x + screenMargin;
    const maxX = monitor.x + monitor.width - iconSize - screenMargin;
    const minY = monitor.y + screenMargin;
    const maxY = monitor.y + monitor.height - iconSize - screenMargin;
    const ringSlots = [];
    const acceptedSlots = [];
    const minimumDistance = requiredCenterDistance(iconSize, iconGap);

    for (let ring = 0; ring < ringCount; ring++) {
        const radius = orbSize / 2 + (ring + 1) * ringGap;
        const angles = anglesForRing(radius, arc, iconSize, iconGap);
        const slots = [];

        for (const angle of angles) {
            const x = centerX + Math.cos(angle) * radius - iconSize / 2;
            const y = centerY + Math.sin(angle) * radius - iconSize / 2;

            if (x < minX || x > maxX || y < minY || y > maxY)
                continue;

            const candidate = {
                x: Math.round(x),
                y: Math.round(y),
            };

            const conflicts = acceptedSlots.some(existing => {
                const dx = candidate.x - existing.x;
                const dy = candidate.y - existing.y;
                return Math.hypot(dx, dy) < minimumDistance;
            });

            if (conflicts)
                continue;

            slots.push(candidate);
            acceptedSlots.push(candidate);
        }

        ringSlots.push(slots);
    }

    return ringSlots;
}

export function totalCapacity(capacities) {
    return capacities.reduce((total, value) => total + value, 0);
}

export function allocateAcrossRings(appCount, capacities) {
    const counts = Array(capacities.length).fill(0);
    let remaining = Math.min(appCount, totalCapacity(capacities));

    // Keep the radial launcher visually coherent: fill the nearest ring
    // completely before spilling into the next ring. Round-robin allocation
    // makes a small app set look scattered across multiple radii.
    for (let ring = 0; ring < capacities.length && remaining > 0; ring++) {
        const count = Math.min(remaining, capacities[ring]);
        counts[ring] = count;
        remaining -= count;
    }

    return counts;
}

export function selectOrganizedSlots(slots, count, arc) {
    if (count <= 0 || slots.length === 0)
        return [];

    if (count >= slots.length)
        return slots;

    const span = Math.abs(arc.end - arc.start);
    const isFullOrbit = span >= 350;

    if (isFullOrbit) {
        // Fill one orbit sequentially instead of distributing a small app set
        // around the whole circle. slotsForRings() already orders a full orbit
        // as Left -> Top -> Right -> Bottom, so taking the prefix produces the
        // compact circulation requested by the launcher design.
        return slots.slice(0, count);
    }

    // Near a monitor side/corner, the available slots already describe the
    // inward-facing safe part of the circle. Fill that arc sequentially from
    // its first safe slot instead of re-centering a small app set. This keeps
    // the visual circulation continuous while naturally avoiding the edge.
    return slots.slice(0, count);
}

export function arcForPosition(centerX, centerY, outerRadius, iconSize, monitor) {
    const margin = outerRadius + iconSize;
    const leftDistance = centerX - monitor.x;
    const rightDistance = monitor.x + monitor.width - centerX;
    const topDistance = centerY - monitor.y;
    const bottomDistance = monitor.y + monitor.height - centerY;

    const horizontalEdge =
        leftDistance < margin || rightDistance < margin
            ? (leftDistance <= rightDistance ? 'left' : 'right')
            : null;
    const verticalEdge =
        topDistance < margin || bottomDistance < margin
            ? (topDistance <= bottomDistance ? 'top' : 'bottom')
            : null;

    if (horizontalEdge === 'left' && verticalEdge === 'top')
        return {start: 5, end: 95};
    if (horizontalEdge === 'right' && verticalEdge === 'top')
        return {start: 175, end: 85};
    if (horizontalEdge === 'left' && verticalEdge === 'bottom')
        return {start: -95, end: -5};
    if (horizontalEdge === 'right' && verticalEdge === 'bottom')
        return {start: 185, end: 275};
    if (verticalEdge === 'top')
        // Top edge: fill the inward/downward semicircle.
        // Left -> Bottom -> Right.
        return {start: 175, end: 5};
    if (verticalEdge === 'bottom')
        return {start: 185, end: 355};
    if (horizontalEdge === 'left')
        return {start: -85, end: 85};
    if (horizontalEdge === 'right')
        // Right edge: fill the inward/left-facing semicircle.
        // Top -> Left -> Bottom.
        return {start: 265, end: 95};

    // Fully free space: deterministic circulation starts at the left-most
    // point, crosses the upper half left-to-right, then completes below.
    return {start: 180, end: 540};
}
