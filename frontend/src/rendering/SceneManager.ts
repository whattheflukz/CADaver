/**
 * SceneManager - Encapsulates Three.js scene setup, rendering, and lifecycle
 * 
 * Extracts scene initialization, camera, controls, lighting, and animation loop
 * from Viewport.tsx for better separation of concerns.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneManagerConfig {
    container: HTMLDivElement;
    backgroundColor?: number;
    cameraPosition?: [number, number, number];
    gridSize?: number;
    gridDivisions?: number;
}

export interface SceneManagerContext {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
}

export class SceneManager {
    private container: HTMLDivElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private raycaster: THREE.Raycaster;
    private animationId: number = 0;
    private resizeObserver: ResizeObserver | null = null;
    private onAnimateCallbacks: (() => void)[] = [];

    constructor(config: SceneManagerConfig) {
        this.container = config.container;
        this.raycaster = new THREE.Raycaster();

        // Configure raycaster
        (this.raycaster.params as any).Line2 = { threshold: 3.5 };
        this.raycaster.params.Points = { threshold: 5.0 };

        // Initialize scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(config.backgroundColor ?? 0x1e1e1e);

        // Resolution tracking for LineMaterial
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const resolution = new THREE.Vector2(width, height);
        (window as any).viewportLineResolution = resolution;

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        const camPos = config.cameraPosition ?? [20, 20, 20];
        this.camera.position.set(camPos[0], camPos[1], camPos[2]);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Helpers
        const gridSize = config.gridSize ?? 50;
        const gridDivisions = config.gridDivisions ?? 50;
        const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
        this.scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        // Setup resize observer
        this.setupResizeObserver();
    }

    private setupResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            if (!this.container) return;
            const newWidth = this.container.clientWidth;
            const newHeight = this.container.clientHeight;
            this.camera.aspect = newWidth / newHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(newWidth, newHeight);
            if ((window as any).viewportLineResolution) {
                (window as any).viewportLineResolution.set(newWidth, newHeight);
            }
        });
        this.resizeObserver.observe(this.container);
    }

    /**
     * Start the animation loop
     */
    public start(): void {
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            this.controls.update();

            // Execute registered callbacks
            for (const callback of this.onAnimateCallbacks) {
                callback();
            }

            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    /**
     * Stop the animation loop
     */
    public stop(): void {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = 0;
        }
    }

    /**
     * Register a callback to run on each animation frame (before render)
     */
    public onAnimate(callback: () => void): void {
        this.onAnimateCallbacks.push(callback);
    }

    /**
     * Get the context for external usage (raycasting, etc.)
     */
    public getContext(): SceneManagerContext {
        return {
            scene: this.scene,
            camera: this.camera,
            renderer: this.renderer,
            controls: this.controls,
            raycaster: this.raycaster
        };
    }

    /**
     * Get the raw scene for adding/removing objects
     */
    public getScene(): THREE.Scene {
        return this.scene;
    }

    /**
     * Get the camera
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * Get orbit controls
     */
    public getControls(): OrbitControls {
        return this.controls;
    }

    /**
     * Get raycaster
     */
    public getRaycaster(): THREE.Raycaster {
        return this.raycaster;
    }

    /**
     * Get canvas element
     */
    public getCanvas(): HTMLCanvasElement {
        return this.renderer.domElement;
    }

    /**
     * Get current resolution
     */
    public getResolution(): THREE.Vector2 {
        return new THREE.Vector2(this.container.clientWidth, this.container.clientHeight);
    }

    /**
     * Cleanup all resources
     */
    public dispose(): void {
        this.stop();

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        this.controls.dispose();
        this.renderer.dispose();

        // Remove canvas from DOM
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }

        // Clear callbacks
        this.onAnimateCallbacks = [];
    }
}
