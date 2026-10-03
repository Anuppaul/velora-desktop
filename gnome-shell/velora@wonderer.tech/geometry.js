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
    const groups = [];

    for (let ring = 0; ring < ringCount; ring++) {
        const radius =
            orbSize / 2 +
            (ring + 1) * ringGap;
        const angles =
            anglesForRing(
                radius,
                arc,
                iconSize,
                iconGap
            );

        groups.push(
            angles.map(angle => ({
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
            }))
        );
    }

    // Preserve the original Orbit arc/ring ordering, but fit complete rings
    // into the active monitor instead of dropping individual off-screen slots.
    return fitGeometryGroups(
        groups,
        centerX,
        centerY,
        iconSize,
        iconGap,
        monitor,
        screenMargin
    );
}

function inwardAngle(centerX, centerY, monitor) {
    return Math.atan2(
        monitor.y + monitor.height / 2 - centerY,
        monitor.x + monitor.width / 2 - centerX
    );
}

function rotateLocal(x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos,
    };
}

function minimumPointDistance(groups) {
    const points = groups.flat();
    if (points.length < 2)
        return Infinity;

    let minimum = Infinity;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[i].x - points[j].x;
            const dy = points[i].y - points[j].y;
            const distance = Math.hypot(dx, dy);
            if (
                distance > 0.001 &&
                distance < minimum
            ) {
                minimum = distance;
            }
        }
    }

    return minimum;
}

function fitGeometryGroups(
    groups,
    centerX,
    centerY,
    iconSize,
    iconGap,
    monitor,
    screenMargin
) {
    const minCenterX =
        monitor.x +
        screenMargin +
        iconSize / 2;
    const maxCenterX =
        monitor.x +
        monitor.width -
        screenMargin -
        iconSize / 2;
    const minCenterY =
        monitor.y +
        screenMargin +
        iconSize / 2;
    const maxCenterY =
        monitor.y +
        monitor.height -
        screenMargin -
        iconSize / 2;

    const availableWidth =
        Math.max(
            1,
            maxCenterX - minCenterX
        );
    const availableHeight =
        Math.max(
            1,
            maxCenterY - minCenterY
        );
    const requiredDistance =
        requiredCenterDistance(
            iconSize,
            iconGap
        );

    let working =
        groups
            .map(group =>
                group.map(point => ({
                    x: point.x,
                    y: point.y,
                }))
            )
            .filter(group => group.length > 0);

    while (working.length > 0) {
        const points = working.flat();

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        const spanX =
            Math.max(1, maxX - minX);
        const spanY =
            Math.max(1, maxY - minY);
        const fitScale =
            Math.min(
                1,
                availableWidth / spanX,
                availableHeight / spanY
            );

        const naturalMinDistance =
            minimumPointDistance(
                working
            );
        const minimumUsableScale =
            Number.isFinite(
                naturalMinDistance
            ) &&
            naturalMinDistance > 0
                ? Math.min(
                    1,
                    requiredDistance /
                        naturalMinDistance
                )
                : 0;

        // Never keep a geometry depth that only "fits" by crushing icons into
        // each other. Drop the complete outer level and let paging absorb the
        // reduced capacity. This preserves shape integrity: no random missing
        // node inside a level.
        if (
            working.length > 1 &&
            fitScale + 0.001 <
                minimumUsableScale
        ) {
            working =
                working.slice(
                    0,
                    working.length - 1
                );
            continue;
        }

        const scale =
            Math.max(
                0.001,
                Math.min(1, fitScale)
            );

        const scaledMinX =
            minX * scale;
        const scaledMaxX =
            maxX * scale;
        const scaledMinY =
            minY * scale;
        const scaledMaxY =
            maxY * scale;

        let shiftX = 0;
        let shiftY = 0;

        const left =
            centerX + scaledMinX;
        const right =
            centerX + scaledMaxX;
        const top =
            centerY + scaledMinY;
        const bottom =
            centerY + scaledMaxY;

        if (left < minCenterX)
            shiftX += minCenterX - left;
        if (right + shiftX > maxCenterX)
            shiftX -=
                right +
                shiftX -
                maxCenterX;

        if (top < minCenterY)
            shiftY += minCenterY - top;
        if (bottom + shiftY > maxCenterY)
            shiftY -=
                bottom +
                shiftY -
                maxCenterY;

        return working.map(group =>
            group.map(point => ({
                x: Math.round(
                    centerX +
                    shiftX +
                    point.x * scale -
                    iconSize / 2
                ),
                y: Math.round(
                    centerY +
                    shiftY +
                    point.y * scale -
                    iconSize / 2
                ),
            }))
        );
    }

    return [];
}

function starGroups(
    centerX,
    centerY,
    orbSize,
    spacing,
    depth,
    monitor
) {
    const groups = [];
    const orientation =
        inwardAngle(
            centerX,
            centerY,
            monitor
        );

    // Five stable arms. Additional depth extends those same arms rather than
    // adding random orbit points, so the silhouette remains recognisably star.
    for (let level = 0; level < depth; level++) {
        const radius =
            orbSize / 2 +
            spacing * (level + 1);
        const points = [];

        for (let arm = 0; arm < 5; arm++) {
            const angle =
                orientation +
                2 * Math.PI *
                arm / 5;
            points.push({
                x: Math.cos(angle) *
                    radius,
                y: Math.sin(angle) *
                    radius,
            });
        }

        groups.push(points);
    }

    return groups;
}

function moleculeGroups(
    centerX,
    centerY,
    orbSize,
    spacing,
    depth,
    monitor
) {
    const groups = [];
    const orientation =
        inwardAngle(
            centerX,
            centerY,
            monitor
        );
    const step =
        Math.max(
            spacing * 0.72,
            orbSize * 0.9
        );
    const side =
        Math.max(
            spacing * 0.34,
            orbSize * 0.28
        );
    let index = 0;

    // A deterministic zig-zag carbon-chain style layout. Five atoms per level
    // gives enough capacity without turning it into another circular grid.
    for (let level = 0; level < depth; level++) {
        const points = [];

        for (let item = 0; item < 5; item++) {
            const n = index + 1;
            const localX =
                orbSize / 2 +
                n * step;
            const localY =
                (
                    n % 2 === 0
                        ? -1
                        : 1
                ) * side;
            points.push(
                rotateLocal(
                    localX,
                    localY,
                    orientation
                )
            );
            index++;
        }

        groups.push(points);
    }

    return groups;
}

function spiralGroups(
    centerX,
    centerY,
    orbSize,
    spacing,
    depth,
    monitor
) {
    const groups = [];
    const orientation =
        inwardAngle(
            centerX,
            centerY,
            monitor
        );
    let index = 0;

    for (let level = 0; level < depth; level++) {
        const points = [];

        for (let item = 0; item < 6; item++) {
            const radius =
                orbSize / 2 +
                spacing * 0.72 +
                index * spacing * 0.22;
            const angle =
                orientation +
                index * 0.72;
            points.push({
                x: Math.cos(angle) *
                    radius,
                y: Math.sin(angle) *
                    radius,
            });
            index++;
        }

        groups.push(points);
    }

    return groups;
}

function petalGroups(
    centerX,
    centerY,
    orbSize,
    spacing,
    depth,
    monitor
) {
    const groups = [];
    const orientation =
        inwardAngle(
            centerX,
            centerY,
            monitor
        );

    for (let level = 0; level < depth; level++) {
        const points = [];
        const baseRadius =
            orbSize / 2 +
            spacing * (level + 1);
        const amplitude =
            spacing * 0.23;

        for (let item = 0; item < 8; item++) {
            const angle =
                orientation +
                2 * Math.PI *
                item / 8;
            const radius =
                baseRadius +
                amplitude *
                Math.cos(4 * angle);
            points.push({
                x: Math.cos(angle) *
                    radius,
                y: Math.sin(angle) *
                    radius,
            });
        }

        groups.push(points);
    }

    return groups;
}

export function slotsForGeometry(
    geometry,
    centerX,
    centerY,
    orbSize,
    spacing,
    depth,
    arc,
    iconSize,
    iconGap,
    monitor,
    screenMargin
) {
    if (geometry === 'orbit') {
        return slotsForRings(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            arc,
            iconSize,
            iconGap,
            monitor,
            screenMargin
        );
    }

    let groups = null;

    switch (geometry) {
    case 'star':
        groups = starGroups(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            monitor
        );
        break;
    case 'molecule':
        groups = moleculeGroups(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            monitor
        );
        break;
    case 'spiral':
        groups = spiralGroups(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            monitor
        );
        break;
    case 'petal':
        groups = petalGroups(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            monitor
        );
        break;
    default:
        groups = starGroups(
            centerX,
            centerY,
            orbSize,
            spacing,
            depth,
            monitor
        );
        break;
    }

    return fitGeometryGroups(
        groups,
        centerX,
        centerY,
        iconSize,
        iconGap,
        monitor,
        screenMargin
    );
}

export function selectGeometrySlots(
    slots,
    count,
    geometry,
    arc
) {
    if (geometry === 'orbit') {
        return selectOrganizedSlots(
            slots,
            count,
            arc
        );
    }

    if (count <= 0)
        return [];

    return slots.slice(
        0,
        Math.min(count, slots.length)
    );
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
