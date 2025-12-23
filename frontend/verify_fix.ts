
import * as THREE from 'three';

// --------------------------------------------------------------------------
// VERIFICATION SCRIPT: Correct Sketch Plane Intersection Logic
// --------------------------------------------------------------------------

// 1. Setup Mock Scene
const width = 800;
const height = 600;
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.set(0, 0, 50);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// 2. Define "Sketch Plane"
const sketchZ = 10;
// Plane definition from ClientSketch
const sketchPlaneParams = {
    origin: [0, 0, sketchZ] as [number, number, number],
    x_axis: [1, 0, 0] as [number, number, number],
    y_axis: [0, 1, 0] as [number, number, number]
};

// 3. Proposed Fix Function
function getSketchPlaneIntersection(
    mouseNDC: THREE.Vector2,
    camera: THREE.Camera,
    planeParams: { origin: [number, number, number], x_axis: [number, number, number], y_axis: [number, number, number] }
): [number, number, number] | null {

    // A. Construct the geometric plane
    const origin = new THREE.Vector3().fromArray(planeParams.origin);
    const xAxis = new THREE.Vector3().fromArray(planeParams.x_axis);
    const yAxis = new THREE.Vector3().fromArray(planeParams.y_axis);

    // Normal = X cross Y
    const normal = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

    // Plane constant w = -dot(Origin, Normal)
    // Three.js Plane equation: Ax + By + Cz + w = 0
    // So w = - (Ox*Nx + Oy*Ny + Oz*Nz)
    const constant = -origin.dot(normal);

    const plane = new THREE.Plane(normal, constant);

    // B. Raycast
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseNDC, camera);

    const targetWorld = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, targetWorld);

    if (!hit) return null;

    // C. Project to Local Coordinates
    // P_local = P_world - Origin
    // u = dot(P_local, xAxis)
    // v = dot(P_local, yAxis)

    const diff = new THREE.Vector3().subVectors(targetWorld, origin);
    const u = diff.dot(xAxis);
    const v = diff.dot(yAxis);

    // Return local coordinate (z=0 relative to sketch plane)
    return [u, v, 0];
}


// 4. Test Case
// We want to simulate a click that SHOULD correspond to local (20, 20) on the sketch plane.
// Why (20, 20)? Just an arbitrary point.
// Let's go the other way: Pick a point in World Space on the plane, project it to screen, then unproject it back.

// Point on plane in World Space:
const expectedLocal = new THREE.Vector3(20, 15, 0);
const origin = new THREE.Vector3().fromArray(sketchPlaneParams.origin);
const xAxis = new THREE.Vector3().fromArray(sketchPlaneParams.x_axis);
const yAxis = new THREE.Vector3().fromArray(sketchPlaneParams.y_axis);

const P_world = origin.clone()
    .add(xAxis.clone().multiplyScalar(expectedLocal.x))
    .add(yAxis.clone().multiplyScalar(expectedLocal.y));

// Project to NDC
const P_ndc = P_world.clone().project(camera);
const mouseNDC = new THREE.Vector2(P_ndc.x, P_ndc.y);


// 5. Run Fix Logic
console.log("\n--- Verification ---");
console.log(`Test Point Local: (${expectedLocal.x}, ${expectedLocal.y})`);
console.log(`Test Point World: (${P_world.x}, ${P_world.y}, ${P_world.z})`);

const result = getSketchPlaneIntersection(mouseNDC, camera, sketchPlaneParams);

if (result) {
    console.log(`Result Local:     (${result[0].toFixed(4)}, ${result[1].toFixed(4)})`);

    const devX = Math.abs(result[0] - expectedLocal.x);
    const devY = Math.abs(result[1] - expectedLocal.y);

    console.log(`Deviation: X=${devX.toFixed(6)}, Y=${devY.toFixed(6)}`);

    if (devX < 0.001 && devY < 0.001) {
        console.log("SUCCESS: Calculated local coordinates match expected values.");
    } else {
        console.log("FAILURE: Significant deviation found.");
    }
} else {
    console.log("FAILURE: No intersection found.");
    process.exit(1);
}
