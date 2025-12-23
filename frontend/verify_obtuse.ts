
import * as THREE from 'three';

// Logic to test
function calculateAngle(line1: { start: [number, number], end: [number, number] }, line2: { start: [number, number], end: [number, number] }) {
    // Calculate intersection to determine correct vectors relative to vertex
    const x1 = line1.start[0], y1 = line1.start[1];
    const x2 = line1.end[0], y2 = line1.end[1];
    const x3 = line2.start[0], y3 = line2.start[1];
    const x4 = line2.end[0], y4 = line2.end[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    let center: [number, number] = [0, 0];

    if (Math.abs(denom) > 0.0001) {
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        center = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    } else {
        center = [(x2 + x3) / 2, (y2 + y3) / 2];
    }

    // Determine correct direction vectors by checking which endpoint is further from intersection
    const dStart1 = (x1 - center[0]) ** 2 + (y1 - center[1]) ** 2;
    const dEnd1 = (x2 - center[0]) ** 2 + (y2 - center[1]) ** 2;
    let dx1, dy1;
    if (dEnd1 > dStart1) {
        dx1 = x2 - center[0];
        dy1 = y2 - center[1];
    } else {
        dx1 = x1 - center[0];
        dy1 = y1 - center[1];
    }

    const dStart2 = (x3 - center[0]) ** 2 + (y3 - center[1]) ** 2;
    const dEnd2 = (x4 - center[0]) ** 2 + (y4 - center[1]) ** 2;
    let dx2, dy2;
    if (dEnd2 > dStart2) {
        dx2 = x4 - center[0];
        dy2 = y4 - center[1];
    } else {
        dx2 = x3 - center[0];
        dy2 = y3 - center[1];
    }

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const angle = Math.abs(diff);

    return {
        deg: angle * 180 / Math.PI,
        vec1: [dx1, dy1],
        vec2: [dx2, dy2],
        center
    };
}

// TEST CASES

// 1. Obtuse (120 deg). Tail-to-Tail.
// L1: (0,0) -> (10,0).
// L2: (0,0) -> (-5, 8.66).
const t1 = calculateAngle(
    { start: [0, 0], end: [10, 0] },
    { start: [0, 0], end: [-5, 8.66] }
);

// 2. Obtuse (120 deg). Head-to-Tail (L2 flipped).
// L1: (0,0) -> (10,0).
// L2: (-5, 8.66) -> (0,0).
const t2 = calculateAngle(
    { start: [0, 0], end: [10, 0] },
    { start: [-5, 8.66], end: [0, 0] }
);

// 3. Obtuse (120 deg). Head-to-Head (Both flipped).
// L1: (10,0) -> (0,0).
// L2: (-5, 8.66) -> (0,0).
const t3 = calculateAngle(
    { start: [10, 0], end: [0, 0] },
    { start: [-5, 8.66], end: [0, 0] }
);

// 4. Nearly 180 (170 deg). Mixed.
// L1: (0,0) -> (10,0).
// L2: (-10, 2) -> (0,0). (From top-left to center)
// Vector L2 should be (-10, 2) - (0,0) = (-10, 2). Angle ~168 deg.
const t4 = calculateAngle(
    { start: [0, 0], end: [10, 0] },
    { start: [-10, 2], end: [0, 0] }
);

console.log("--- Test 1: Obtuse Tail-Tail ---");
console.log(`Angle: ${t1.deg.toFixed(2)} (Expected 120.00)`);
console.log(`Vec1: ${t1.vec1}, Vec2: ${t1.vec2}`);

console.log("\n--- Test 2: Obtuse Head-Tail (L2 Flipped) ---");
console.log(`Angle: ${t2.deg.toFixed(2)} (Expected 120.00)`);
console.log(`Vec1: ${t2.vec1}, Vec2: ${t2.vec2}`);

console.log("\n--- Test 3: Obtuse Head-Head ---");
console.log(`Angle: ${t3.deg.toFixed(2)} (Expected 120.00)`);
console.log(`Vec1: ${t3.vec1}, Vec2: ${t3.vec2}`);

console.log("\n--- Test 4: Wide Angle Head-Tail ---");
console.log(`Angle: ${t4.deg.toFixed(2)} (Expected ~168.7)`);
console.log(`Vec1: ${t4.vec1}, Vec2: ${t4.vec2}`);

if (Math.abs(t1.deg - 120) > 0.1 || Math.abs(t2.deg - 120) > 0.1 || Math.abs(t3.deg - 120) > 0.1) {
    console.log("FAILURE");
    process.exit(1);
} else {
    console.log("SUCCESS");
}
