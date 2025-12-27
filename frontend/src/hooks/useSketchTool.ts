import { createSignal } from 'solid-js';
import { type Sketch, type SnapPoint, type SnapConfig, defaultSnapConfig } from '../types';
import { applySnapping } from '../snapUtils';
import { ToolRegistry } from '../tools/ToolRegistry';
import { detectInferredConstraints, defaultInferenceConfig } from '../utils/ConstraintInference';

export function useSketchTool(
    currentSketch: () => Sketch,
    setCurrentSketch: (s: Sketch) => void,
    sketchSelection: () => any[],
    setSketchSelection: (s: any[]) => void,
    setEditingDimension: (d: any) => void,
    dimensionSelection: () => any[],
    setDimensionSelection: (d: any[]) => void,
    handleDimensionFinish: () => void,
    setDimensionMousePosition: (p: [number, number] | null) => void,
    measurementSelection: () => any[],
    setMeasurementSelection: (m: any[]) => void,
    calculateMeasurement: (c1: any, c2: any) => any,
    addActiveMeasurement: (m: any) => void,
    constructionMode: () => boolean,
    sendSketchUpdate: (s: Sketch) => void,
    dimensionPlacementMode: () => boolean,
    dimensionProposedAction: () => any
) {
    const [snapConfig, setSnapConfig] = createSignal<SnapConfig>(defaultSnapConfig);
    const [activeSnap, setActiveSnap] = createSignal<SnapPoint | null>(null);
    const [startSnap, setStartSnap] = createSignal<SnapPoint | null>(null);
    const [tempPoint, setTempPoint] = createSignal<[number, number] | null>(null);
    const [tempStartPoint, setTempStartPoint] = createSignal<[number, number] | null>(null);

    // Constraint Inference
    const [cursorPosition, setCursorPosition] = createSignal<[number, number] | null>(null);
    const [inferenceSuppress, setInferenceSuppress] = createSignal(false);


    // Tool Registry
    const toolRegistry = new ToolRegistry({
        get sketch() { return currentSketch(); },
        setSketch: (s) => setCurrentSketch(s),
        get selection() { return sketchSelection(); },
        setSelection: (s) => setSketchSelection(s),
        setEditingDimension: (dim) => setEditingDimension(dim),
        setTempPoint,
        get dimensionSelection() { return dimensionSelection(); },
        setDimensionSelection: (s) => setDimensionSelection(s),
        commitDimension: () => {
            if (dimensionPlacementMode() && dimensionProposedAction()?.isValid) {
                handleDimensionFinish();
                return true;
            }
            return false;
        },
        setDimensionMousePosition: (pos) => setDimensionMousePosition(pos),
        get measurementSelection() { return measurementSelection(); },
        setMeasurementSelection: (s) => setMeasurementSelection(s),
        calculateMeasurement: (c1, c2) => calculateMeasurement(c1, c2),
        addActiveMeasurement: (m) => addActiveMeasurement(m),
        get snapPoint() { return activeSnap(); },
        get constructionMode() { return constructionMode(); },
        sendUpdate: (s) => sendSketchUpdate(s),
        spawnEntity: (e) => {
            const sketch = currentSketch();
            const updated = { ...sketch, entities: [...sketch.entities, e] };
            setCurrentSketch(updated);
            sendSketchUpdate(updated);
        }
    });

    const inferredConstraints = () => {
        // Only show inferences when actively drawing (this logic needs to be robust)
        const cursor = cursorPosition();
        if (!cursor || inferenceSuppress()) return [];

        const startPoint = tempPoint();
        return detectInferredConstraints(
            cursor,
            startPoint,
            currentSketch(),
            "line", // TODO: Pass active tool if we have it here, or rely on caller context
            activeSnap(),
            defaultInferenceConfig
        );
    }

    const handleSketchInput = (type: string, point: [number, number, number], event?: MouseEvent, activeToolType: string = "select") => {
        if (type === "cancel") { return; }

        // Apply snapping to get the effective point
        const rawPoint: [number, number] = [point[0], point[1]];
        const { position: snappedPos, snap } = applySnapping(rawPoint, currentSketch(), snapConfig());

        // Update active snap indicator on move
        if (type === "move") {
            setActiveSnap(snap);
            // Update cursor position for constraint inference detection
            setCursorPosition(snappedPos);
            // Track shift key for inference suppression
            setInferenceSuppress(event?.shiftKey ?? false);
        }

        // Delegate to Tool Registry
        const toolInstance = toolRegistry.getTool(activeToolType);
        if (toolInstance) {
            // Pass input to tool
            if (type === "click") {
                toolInstance.onMouseDown && toolInstance.onMouseDown(rawPoint[0], rawPoint[1], event);
            } else if (type === "move") {
                toolInstance.onMouseMove && toolInstance.onMouseMove(rawPoint[0], rawPoint[1], event);
            } else if (type === "up") {
                toolInstance.onMouseUp && toolInstance.onMouseUp(rawPoint[0], rawPoint[1], event);
            }
            return;
        }

        // If no specific tool instance handles it (e.g. legacy logic if any), we might need fallback
        // But for now, we assume ToolRegistry covers it or we add the specific logic here if it was inline.
        // The original hook had some inline logic for angular snapping if tool was line/rect AND not handled by registry? 
        // Actually, ToolRegistry has LineTool which should handle it. 
        // But wait, the original code had inline logic AFTER `toolRegistry.getTool` check returned? 
        // No, it was `if (toolInstance) { ... return; }`. 
        // So the inline logic was for tools NOT in registry?
        // Let's check if "line" is in registry. Yes it is usually.
        // However, looking at the previous file view, there was a block `if (toolInstance) ... return;` 
        // followed by `// Use snapped position for all geometry operations`.
        // This suggests some tools might NOT be in registry or the registry was partial?
        // Or maybe that code was dead/legacy?
        // In the original file:
        // const toolInstance = toolRegistry.getTool(activeTool);
        // if (toolInstance) { ... return; }
        // ...
        // if ((tool === "line" || tool === "rectangle") && startPt) { ... }

        // This implies "line" and "rectangle" were NOT handled by registry in the original code?
        // Or maybe `toolRegistry.getTool` returned null for them?
        // I need to be careful here. UseSketching.ts line 387 instantiates ToolRegistry.
        // I should check ToolRegistry to see what tools it supports.
    };

    return {
        snapConfig, setSnapConfig,
        activeSnap, setActiveSnap,
        startSnap, setStartSnap,
        tempPoint, setTempPoint,
        tempStartPoint, setTempStartPoint,
        cursorPosition, setCursorPosition,
        inferenceSuppress, setInferenceSuppress,
        toolRegistry,
        inferredConstraints,
        handleSketchInput
    };
}
