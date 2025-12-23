
import * as THREE from 'three';

// Mock Geometry Types
interface Line {
    start: [number, number];
    end: [number, number];
}

// The logic extracted from Viewport.tsx (lines 1070-1127 approximately)
function calculateAngleData(line1: Line, line2: Line) {
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

    // CURRENT IMPLEMENTATION (suspected buggy)
    // Get direction angles for the two lines (from intersection point)
    // It always uses (x2, y2) and (x4, y4) which are line.end
    const dx1 = x2 - center[0];
    const dy1 = y2 - center[1];
    const dx2 = x4 - center[0];
    const dy2 = y4 - center[1];

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

// Case 1: Standard (Tail-to-Tail)
// L1: (0,0) -> (10,0) [0 deg]
// L2: (0,0) -> (0,10) [90 deg]
// Intersection: (0,0)
const case1 = calculateAngleData(
    { start: [0, 0], end: [10, 0] },
    { start: [0, 0], end: [0, 10] }
);

// Case 2: Head-to-Tail (Faulty?)
// L1: (10,0) -> (0,0) [End is (0,0)]
// L2: (0,0) -> (0,10)
// Intersection: (0,0)
// Expected: 90 deg.
// Actual prediction: L1 end is (0,0). Center is (0,0). dx1=0. angle1 = 0.
// L2 end is (0,10). dx2=0, dy2=10. angle2 = 90.
// Diff = 90. 
// BUT: angle1 is 0 because atan2(0,0) is 0. 
// If L1 was at 45 deg: (10,10) -> (0,0). angle1=0. Real angle should be 45 (or 225).
// Relative to L2 (90), diff is 90. 
// Use a specific angle to test logic failure.
const case2 = calculateAngleData(
    { start: [10, 10], end: [0, 0] }, // 45 deg line ending at origin
    { start: [0, 0], end: [0, 10] }   // Vertical line starting at origin
);

// Case 3: Head-to-Head (Both lines end at intersection)
const case3 = calculateAngleData(
    { start: [10, 0], end: [0, 0] },
    { start: [0, 10], end: [0, 0] }
);


console.log("--- Case 1: Tail-to-Tail (0,0)->(10,0) & (0,0)->(0,10) ---");
console.log(`Diff: ${case1.diffDeg.toFixed(2)} (Expected 90.00)`);
console.log(`Vec1: [${case1.vector1[0].toFixed(2)}, ${case1.vector1[1].toFixed(2)}]`);

console.log("\n--- Case 2: Head-to-Tail (10,10)->(0,0) & (0,0)->(0,10) ---");
console.log("Expected Angle between lines: 45 degrees");
console.log(`Diff: ${case2.diffDeg.toFixed(2)}`);
console.log(`Vec1: [${case2.vector1[0].toFixed(2)}, ${case2.vector1[1].toFixed(2)}] (Should NOT be 0,0)`);
console.log(`Angle1: ${case2.angle1Deg.toFixed(2)}`);

console.log("\n--- Case 3: Head-to-Head (10,0)->(0,0) & (0,10)->(0,0) ---");
console.log("Expected Angle: 90 degrees");
console.log(`Diff: ${case3.diffDeg.toFixed(2)}`);
console.log(`Vec1: [${case3.vector1[0].toFixed(2)}, ${case3.vector1[1].toFixed(2)}]`);
console.log(`Vec2: [${case3.vector2[0].toFixed(2)}, ${case3.vector2[1].toFixed(2)}]`);
