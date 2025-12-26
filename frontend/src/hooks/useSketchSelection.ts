import { createSignal } from 'solid-js';
import { type SelectionCandidate, type ConstraintPoint } from '../types';

export function useSketchSelection(sketchTool: () => string) {
    // Sketch Selection State (Local)
    const [sketchSelection, setSketchSelection] = createSignal<SelectionCandidate[]>([]);

    // State for multi-step constraint creation
    const [constraintSelection, setConstraintSelection] = createSignal<ConstraintPoint[]>([]);

    // Dimension Selection
    const [dimensionSelection, setDimensionSelection] = createSignal<SelectionCandidate[]>([]);

    // Measurement Selection
    const [measurementSelection, setMeasurementSelection] = createSignal<SelectionCandidate[]>([]);
    const [measurementPending, setMeasurementPending] = createSignal<SelectionCandidate | null>(null);

    const handleSelect = (topoId: any, modifier: "replace" | "add" | "remove" = "replace", send: (msg: any) => void, sketchMode: boolean) => {
        console.log("Selecting:", topoId, modifier);

        if (sketchMode) {
            if (topoId === null) {
                setSketchSelection([]);
                return;
            }
            // Handle Sketch Entity Selection locally
            let newSel = [...sketchSelection()];
            // If dimension tool is active, use dimensionSelection instead
            if (sketchTool() === "dimension") {
                newSel = [...dimensionSelection()];
            } else if (sketchTool() === "measure") {
                newSel = [...measurementSelection()];
            }

            const areEqual = (a: SelectionCandidate, b: SelectionCandidate) => {
                return a.id === b.id && a.type === b.type && a.index === b.index;
            };

            const candidate = topoId as SelectionCandidate;
            const existingIdx = newSel.findIndex(s => areEqual(s, candidate));
            const exists = existingIdx !== -1;

            // Handle Toggle behavior for "add" (Ctrl+Click / Shift+Click)
            if (modifier === "add") {
                if (exists) {
                    // Toggle OFF
                    newSel.splice(existingIdx, 1);
                } else {
                    // Toggle ON
                    newSel.push(candidate);
                }
            } else if (modifier === "remove") {
                if (exists) {
                    newSel.splice(existingIdx, 1);
                }
            } else {
                // Replace - default behavior
                // Special handling for dimension tool: Allow accumulating up to 2 items even without modifier
                if (sketchTool() === "dimension" && !exists && newSel.length < 2) {
                    console.log("[Selection] Dimension tool: accumulating selection", { newSel: newSel.length, candidate });
                    newSel.push(candidate);
                } else if (sketchTool() === "measure" && !exists && newSel.length < 2) {
                    // Same accumulation logic for measure tool
                    console.log("[Selection] Measure tool: accumulating selection", { newSel: newSel.length, candidate });
                    newSel.push(candidate);
                } else {
                    // Standard replace behavior
                    console.log("[Selection] Standard replace", { exists, newSel: newSel.length, tool: sketchTool() });
                    if (newSel.length === 1 && exists) {
                        newSel = []; // Deselect if clicking single selected item
                    } else {
                        newSel = [candidate];
                    }
                }
            }

            console.log("[Selection] Final selection:", { tool: sketchTool(), newSel });
            if (sketchTool() === "dimension") {
                setDimensionSelection(newSel);
            } else if (sketchTool() === "measure") {
                setMeasurementSelection(newSel);
            } else {
                setSketchSelection(newSel);
            }
            return;
        }

        if (topoId) {
            send({ command: 'Select', payload: { id: topoId, modifier } });
        } else if (!topoId) {
            send({ command: 'ClearSelection' });
        }
    };

    return {
        sketchSelection, setSketchSelection,
        constraintSelection, setConstraintSelection,
        dimensionSelection, setDimensionSelection,
        measurementSelection, setMeasurementSelection,
        measurementPending, setMeasurementPending,
        handleSelect
    };
}
