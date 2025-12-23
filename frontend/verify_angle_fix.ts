
import * as THREE from 'three';

// Mock Geometry Types
interface Line {
    start: [number, number];
    end: [number, number];
}

// THE PROPOSED FIXED LOGIC
function calculateAngleDataFixed(line1: Line, line2: Line) {
    // Calculate line-line intersection
    const x1 = line1.start[0], y1 = line1.start[1];
    const x2 = line1.end[0], y2 = line1.end[1];
    const x3 = line2.start[0], y3 = line2.start[1];
    const x4 = line2.end[0], y4 = line2.end[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    let center: [number, number];

    if (Math.abs(denom) > 0.0001) {
        // Lines intersect - calculate intersection point
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        center = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    } else {
        // Parallel lines - use midpoint of closest endpoints
        center = [(x2 + x3) / 2, (y2 + y3) / 2];
    }

    // FIX START: Determine correct direction vectors
    // Instead of assuming line.end is the direction, find which endpoint is further from intersection

    // Line 1 Direction
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

    // Line 2 Direction
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
    // FIX END

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    // Calculate diff for smallest angle
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Result
    return {
        center,
        angle1Deg: angle1 * 180 / Math.PI,
        angle2Deg: angle2 * 180 / Math.PI,
        diffDeg: Math.abs(diff) * 180 / Math.PI,
        vector1: [dx1, dy1],
        vector2: [dx2, dy2]
    };
}

// Test Cases

// Case 1: Tail-to-Tail (0,0)->(10,0) & (0,0)->(0,10)
// Expected: 90
const case1 = calculateAngleDataFixed(
    { start: [0, 0], end: [10, 0] },
    { start: [0, 0], end: [0, 10] }
);

// Case 2: Head-to-Tail (10,10)->(0,0) & (0,0)->(0,10)
// Expected: 45
const case2 = calculateAngleDataFixed(
    { start: [10, 10], end: [0, 0] },
    { start: [0, 0], end: [0, 10] }
);

// Case 3: Head-to-Head (10,0)->(0,0) & (0,10)->(0,0)
// Expected: 90
const case3 = calculateAngleDataFixed(
    { start: [10, 0], end: [0, 0] },
    { start: [0, 10], end: [0, 0] }
);

console.log("--- Case 1: Tail-to-Tail ---");
console.log(`Diff: ${case1.diffDeg.toFixed(2)} (Expected 90.00)`);
console.log(`Vec1: [${case1.vector1[0].toFixed(2)}, ${case1.vector1[1].toFixed(2)}]`);

console.log("\n--- Case 2: Head-to-Tail ---");
console.log(`Diff: ${case2.diffDeg.toFixed(2)} (Expected 45.00)`);
console.log(`Vec1: [${case2.vector1[0].toFixed(2)}, ${case2.vector1[1].toFixed(2)}]`);

console.log("\n--- Case 3: Head-to-Head ---");
console.log(`Diff: ${case3.diffDeg.toFixed(2)} (Expected 90.00)`);
console.log(`Vec1: [${case3.vector1[0].toFixed(2)}, ${case3.vector1[1].toFixed(2)}]`);

if (Math.abs(case1.diffDeg - 90) < 0.01 &&
    Math.abs(case2.diffDeg - 45) < 0.01 &&
    Math.abs(case3.diffDeg - 90) < 0.01) {
    console.log("\nSUCCESS: All cases passed.");
} else {
    console.log("\nFAILURE: Some cases failed.");
    process.exit(1);
}
