
import * as THREE from 'three';

// --------------------------------------------------------------------------
// REPRODUCTION SCRIPT: Sketch Plane Coordinate Mismatch
// --------------------------------------------------------------------------
// Purpose: proper demonstration that intersecting the global Z=0 plane
// instead of the actual sketch plane results in coordinate deviation
// when the sketch plane is offset and the camera is perspective.
// --------------------------------------------------------------------------

// 1. Setup Mock Scene
const width = 800;
const height = 600;

// Camera at (0, 0, 50) looking at origin
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.set(0, 0, 50);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// 2. Define a "Sketch Plane" at Z = 10
// Plane equation: z = 10 -> 0x + 0y + 1z - 10 = 0
// Three.js Plane(normal, constant). constant is -limit distance.
// Plane defined by Normal(0,0,1) and point (0,0,10)
// dot(N, P) + w = 0 -> 1*10 + w = 0 -> w = -10
const sketchZ = 10;
const sketchPlaneParams = {
    origin: [0, 0, sketchZ],
    x_axis: [1, 0, 0],
    y_axis: [0, 1, 0]
};

// 3. Simulate Mouse Click at (200, 200) pixels
// Normalized Device Coordinates (NDC)
// Top-Left is (-1, 1), Bottom-Right is (1, -1)
// Let's pick a point not at center to see parallax
const mouseNDC = new THREE.Vector2(0.5, 0.5);

const raycaster = new THREE.Raycaster();
raycaster.setFromCamera(mouseNDC, camera);

// --------------------------------------------------------------------------
// Scenario A: Current Implementation (Bug)
// Viewport.tsx uses explicit `new THREE.Plane(new THREE.Vector3(0,0,1), 0)`
// --------------------------------------------------------------------------
const bugPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const bugTarget = new THREE.Vector3();
raycaster.ray.intersectPlane(bugPlane, bugTarget);

console.log("\n--- Scenario A: Current Implementation (Bug) ---");
console.log("Intersected global Z=0 plane at:", bugTarget);


// --------------------------------------------------------------------------
// Scenario B: Correct Implementation
// Should intersect the specific sketch plane
// --------------------------------------------------------------------------
const correctPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -sketchZ);
const correctTarget = new THREE.Vector3();
raycaster.ray.intersectPlane(correctPlane, correctTarget);


console.log("\n--- Scenario B: Correct Implementation ---");
console.log(`Intersected Sketch Plane (Z=${sketchZ}) at:`, correctTarget);


// --------------------------------------------------------------------------
// Verification
// --------------------------------------------------------------------------
console.log("\n--- Analysis ---");
const deviationX = Math.abs(bugTarget.x - correctTarget.x);
const deviationY = Math.abs(bugTarget.y - correctTarget.y);

console.log(`Deviation X: ${deviationX.toFixed(4)}`);
console.log(`Deviation Y: ${deviationY.toFixed(4)}`);

if (deviationX > 0.001 || deviationY > 0.001) {
    console.log("RESULT: BUG REPRODUCED. Coordinates diverge.");
    // Simulate what App.tsx does: taking X/Y directly
    console.log("App.tsx sees (Bug):", [bugTarget.x, bugTarget.y]);
    console.log("App.tsx should see (Correct):", [correctTarget.x, correctTarget.y]);
} else {
    console.log("RESULT: NO BUG FOUND. Coordinates match.");
}
