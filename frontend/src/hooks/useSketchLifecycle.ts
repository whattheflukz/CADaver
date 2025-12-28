
import { createSignal, createEffect, type Accessor, type Setter } from 'solid-js';
import { type Sketch, type FeatureGraphState, type SketchPlane, type Feature, type SketchToolType } from '../types';

interface UseSketchLifecycleProps {
    graph: Accessor<FeatureGraphState>;
    send: (msg: any) => void;
    setCurrentSketch: (s: Sketch) => void;
    currentSketch: Accessor<Sketch>;
    setCameraAlignPlane: (p: any) => void;

    // UI State Setters & Accessors
    setSketchMode: Setter<boolean>;
    setActiveSketchId: Setter<string | null>;
    setSketchSetupMode: Setter<boolean>;
    setPendingSketchId: Setter<string | null>;
    setSketchTool: Setter<SketchToolType>;

    activeSketchId: Accessor<string | null>;
    pendingSketchId: Accessor<string | null>;

    // Check if we need these accessor/setters from UI... 
    // Usually passing the individual signals is cleaner than passing the whole "ui" object 
    // if we only need a few. But "ui" object is likely what we have in useSketching.

    // Selection Setters
    setConstraintSelection: Setter<any[]>;
}

export function useSketchLifecycle(props: UseSketchLifecycleProps) {
    const {
        graph,
        send,
        setCurrentSketch,
        currentSketch,
        setCameraAlignPlane,
        setSketchMode,
        setActiveSketchId,
        setSketchSetupMode,
        setPendingSketchId,
        setSketchTool,
        activeSketchId,
        pendingSketchId,
        setConstraintSelection
    } = props;

    // --- Local State ---
    const [originalSketch, setOriginalSketch] = createSignal<Sketch | null>(null);
    const [autostartNextSketch, setAutostartNextSketch] = createSignal<string | null>(null);

    // --- Handlers ---

    const handleStartSketch = (id: string) => {
        console.log("Starting sketch for feature:", id);

        // Try to load existing sketch from graph
        const feat = graph().nodes[id];
        let loadedSketch: Sketch | null = null;

        if (feat && feat.parameters["sketch_data"]) {
            const val = feat.parameters["sketch_data"];
            if (val && typeof val === "object" && "Sketch" in val) {
                // @ts-ignore
                loadedSketch = val.Sketch;
            }
        }

        // Check if we have an existing sketch with a defined plane
        const hasExistingSketch = !!loadedSketch;
        console.log("Has existing sketch data:", hasExistingSketch);

        if (hasExistingSketch) {
            console.log("Existing sketch found, entering edit mode direct");
            // @ts-ignore
            setCurrentSketch(loadedSketch);
            // @ts-ignore
            setOriginalSketch(JSON.parse(JSON.stringify(loadedSketch))); // Deep copy for revert
            setActiveSketchId(id);
            setSketchMode(true);
            setSketchTool("select");

            // Trigger camera alignment to existing sketch plane
            // @ts-ignore
            setCameraAlignPlane(loadedSketch.plane);
            setTimeout(() => setCameraAlignPlane(null), 100);
        } else {
            console.log("No existing sketch (or empty), entering setup mode");
            setPendingSketchId(id);
            setSketchSetupMode(true);
            console.log("Sketch setup mode ENABLED. Waiting for plane select.");
        }
    };

    const handlePlaneSelected = (plane: SketchPlane) => {
        const id = pendingSketchId();
        if (!id) return;

        console.log("Plane Selected:", plane);

        // Create new sketch with selected plane
        const newSketch: Sketch = {
            plane: plane,
            entities: [],
            constraints: [],
            history: []
        };

        setCurrentSketch(newSketch);
        setActiveSketchId(id);
        setSketchMode(true);
        setSketchSetupMode(false);
        setPendingSketchId(null);
        setSketchTool("select");

        // Set Original Sketch as this new empty one
        setOriginalSketch(JSON.parse(JSON.stringify(newSketch)));

        // Persist immediately
        const payload = {
            id: id,
            params: {
                "sketch_data": { Sketch: newSketch }
            }
        };
        send({ command: 'UpdateFeature', payload: { id, params: payload.params } });

        // Trigger camera alignment to sketch plane
        setCameraAlignPlane(plane);
        setTimeout(() => setCameraAlignPlane(null), 100);
    };

    const handleCancelSketch = () => {
        console.log("Cancelling sketch...");
        if (activeSketchId()) {
            if (originalSketch()) {
                // Revert to original
                const payload = {
                    id: activeSketchId()!,
                    params: {
                        "sketch_data": { Sketch: originalSketch() }
                    }
                };
                send({ command: 'UpdateFeature', payload: { id: payload.id, params: payload.params } });
            } else {
                // Feature exists but revert logic handles empty sketch scenarios implicitly
            }
        }
        setSketchMode(false);
        setActiveSketchId(null);
        setConstraintSelection([]);
        setOriginalSketch(null);
        setSketchSetupMode(false);
        setPendingSketchId(null);
    };

    const handleSketchFinish = () => {
        if (activeSketchId()) {
            // Send UPDATE_FEATURE
            const payload = {
                id: activeSketchId()!,
                params: {
                    "sketch_data": { Sketch: currentSketch() }
                }
            };
            send({ command: 'UpdateFeature', payload: { id: payload.id, params: payload.params } });
        }
        setSketchMode(false);
        setActiveSketchId(null);
        setConstraintSelection([]);
        setSketchSetupMode(false);
    };

    // --- Effects ---

    createEffect(() => {
        // If autostart flag is set (contains target name), scan for a new sketch that matches the name
        // and trigger startSketch on it.
        const targetName = autostartNextSketch();
        if (targetName) {
            const nodes = graph().nodes;

            // Find the feature with the matching name
            const matchingNode = Object.values(nodes).find(
                (node: Feature) => node.feature_type === "Sketch" && node.name === targetName
            );

            if (matchingNode) {
                setAutostartNextSketch(null); // Reset flag
                handleStartSketch(matchingNode.id);
            }
        }
    });

    return {
        originalSketch, setOriginalSketch,
        autostartNextSketch, setAutostartNextSketch,
        handleStartSketch,
        handlePlaneSelected,
        handleCancelSketch,
        handleSketchFinish
    };
}
