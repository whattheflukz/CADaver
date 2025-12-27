import { createSignal, createEffect, createMemo, untrack, type Accessor } from 'solid-js';
import { type Sketch, type SketchEntity, type SketchConstraint, type SketchPlane, type SelectionCandidate, type SolveResult, wrapConstraint, type FeatureGraphState, type WebSocketCommand } from '../types';
import { applySnapping } from '../snapUtils';
import { useSketchUI } from './useSketchUI';
import { useSketchSelection } from './useSketchSelection';
import { useSketchLifecycle } from './useSketchLifecycle';
import { executeMirror, executeLinearPattern, executeCircularPattern } from './usePatternTools';
interface UseSketchingProps {
  send: (msg: WebSocketCommand) => void;
  graph: Accessor<FeatureGraphState>;
  selection: Accessor<string[]>;
  setSelection: (sel: string[]) => void;
  // For validation/status if needed
  solveResult?: Accessor<SolveResult | null>;
}
import { useSketchTool } from './useSketchTool';
import { useDimensionSystem } from './useDimensionSystem';
export function useSketching(props: UseSketchingProps) {
  // --- Decomposed Hooks ---
  const ui = useSketchUI();
  const sel = useSketchSelection(ui.sketchTool);
  // Destructure UI State
  const {
    sketchMode, setSketchMode,
    activeSketchId, setActiveSketchId,
    sketchTool, setSketchTool,
    constructionMode, setConstructionMode,
    sketchSetupMode, setSketchSetupMode,
    pendingSketchId, setPendingSketchId,
    offsetState, setOffsetState,
    linearPatternState, setLinearPatternState,
    circularPatternState, setCircularPatternState,
    mirrorState, setMirrorState,
    editingDimension, setEditingDimension
  } = ui;
  // Destructure Selection State
  const {
    sketchSelection, setSketchSelection,
    constraintSelection, setConstraintSelection,
    dimensionSelection, setDimensionSelection,
    measurementSelection, setMeasurementSelection,
    measurementPending, setMeasurementPending
  } = sel;
  // Current Sketch State (The active sketch data)
  const [currentSketch, setCurrentSketch] = createSignal<Sketch>({
    plane: { type: 'xy', origin: [0, 0, 0], x_axis: [1, 0, 0], y_axis: [0, 1, 0], z_axis: [0, 0, 1] },
    entities: [],
    constraints: [],
    history: []
  });
  // Camera alignment trigger for sketch mode
  const [cameraAlignPlane, setCameraAlignPlane] = createSignal<SketchPlane | null>(null);
  // Props destructuring
  const { send, graph, selection } = props;
  // --- Lifecycle Hook ---
  const {
    originalSketch, setOriginalSketch,
    autostartNextSketch, setAutostartNextSketch,
    handleStartSketch,
    handlePlaneSelected,
    handleCancelSketch,
    handleSketchFinish
  } = useSketchLifecycle({
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
  });
  // --- Hoisted Helper Functions ---
  // Send sketch update to backend to run solver and update geometry live
  const sendSketchUpdate = (sketch: Sketch) => {
    if (activeSketchId()) {
      const payload = {
        id: activeSketchId()!,
        // Rust Feature serializes as "parameters", and ParameterValue::Sketch as {"Sketch": {...}}
        params: {
          "sketch_data": { Sketch: sketch }
        }
      };
      send({ command: 'UpdateFeature', payload: { id: payload.id, params: payload.params } });
      console.log("Sent sketch update to backend for solving");
    }
  };
  const dim = useDimensionSystem({
    currentSketch,
    setCurrentSketch,
    sendSketchUpdate,
    setSketchTool,
    setEditingDimension,
    dimensionSelection: () => dimensionSelection(),
    setDimensionSelection,
    measurementSelection: () => measurementSelection(),
    setMeasurementSelection,
    measurementPending: () => measurementPending(),
    setMeasurementPending
  });
  const {
    dimensionProposedAction,
    setDimensionProposedAction,
    analyzeDimensionSelection,
    dimensionPlacementMode,
    setDimensionPlacementMode,
    dimensionMousePosition,
    activeMeasurements,
    setActiveMeasurements,
    setDimensionMousePosition,
    calculateMeasurement,
    handleDimensionFinish,
    handleDimensionDrag,
    handleDimensionCancel,
    handleMeasurementClearPending
  } = dim;
  // --- Initialize Tool Hook ---
  const toolHook = useSketchTool(
    currentSketch,
    setCurrentSketch,
    sketchSelection,
    setSketchSelection,
    setEditingDimension,
    dimensionSelection,
    setDimensionSelection,
    handleDimensionFinish,
    setDimensionMousePosition,
    measurementSelection,
    setMeasurementSelection,
    calculateMeasurement,
    (m) => setActiveMeasurements(prev => [...prev, m]),
    constructionMode,
    sendSketchUpdate,
    dimensionPlacementMode,
    dimensionProposedAction
  );
  // Destructure Tool Hook State
  const {
    snapConfig, setSnapConfig,
    activeSnap, setActiveSnap,
    setStartSnap,
    tempPoint, setTempPoint,
    setTempStartPoint,
    setCursorPosition,
    setInferenceSuppress,
    toolRegistry,
    inferredConstraints,
  } = toolHook;
  // Pattern Preview
  const patternPreview = createMemo<SketchEntity[]>(() => {
    const tool = sketchTool();
    if (tool === 'linear_pattern') {
      const state = linearPatternState();
      const directionId = state.direction;
      const entitiesToPattern = state.entities;
      const count = state.count;
      const spacing = state.spacing;
      const flip = state.flipDirection;
      if (!directionId || entitiesToPattern.length === 0 || count < 2) return [];
      const sketch = currentSketch();
      const dirEnt = sketch.entities.find(e => e.id === directionId);
      if (!dirEnt || !dirEnt.geometry.Line) return [];
      const line = dirEnt.geometry.Line;
      const dx = line.end[0] - line.start[0];
      const dy = line.end[1] - line.start[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) return [];
      let nx = dx / len;
      let ny = dy / len;
      if (flip) {
        nx = -nx;
        ny = -ny;
      }
      const newEntities: SketchEntity[] = [];
      for (let copyIdx = 1; copyIdx < count; copyIdx++) {
        const offset = spacing * copyIdx;
        const translate = (p: [number, number]): [number, number] => [p[0] + nx * offset, p[1] + ny * offset];
        entitiesToPattern.forEach(targetId => {
          const targetEnt = sketch.entities.find(e => e.id === targetId);
          if (!targetEnt) return;
          let newGeo: any = null;
          if (targetEnt.geometry.Point) {
            newGeo = { Point: { pos: translate(targetEnt.geometry.Point.pos) } };
          } else if (targetEnt.geometry.Line) {
            const l = targetEnt.geometry.Line;
            newGeo = { Line: { start: translate(l.start), end: translate(l.end) } };
          } else if (targetEnt.geometry.Circle) {
            const c = targetEnt.geometry.Circle;
            newGeo = { Circle: { center: translate(c.center), radius: c.radius } };
          } else if (targetEnt.geometry.Arc) {
            const arc = targetEnt.geometry.Arc;
            newGeo = { Arc: { center: translate(arc.center), radius: arc.radius, start_angle: arc.start_angle, end_angle: arc.end_angle } };
          }
          if (newGeo) {
            newEntities.push({ id: crypto.randomUUID(), geometry: newGeo, is_construction: false });
          }
        });
      }
      return newEntities;
    } else if (tool === 'circular_pattern') {
      const state = circularPatternState();
      const entitiesToPattern = state.entities;
      const count = state.count;
      const flip = state.flipDirection;
      const totalAngleRad = (flip ? -1 : 1) * state.totalAngle * Math.PI / 180;
      if (entitiesToPattern.length === 0 || count < 2) return [];
      const sketch = currentSketch();
      let center: [number, number] = [0, 0];
      if (state.centerType === 'point' && state.centerId) {
        const centerEnt = sketch.entities.find(e => e.id === state.centerId);
        if (centerEnt?.geometry.Point) {
          center = centerEnt.geometry.Point.pos;
        } else if (centerEnt?.geometry.Circle) {
          center = centerEnt.geometry.Circle.center;
        } else if (centerEnt?.geometry.Arc) {
          center = centerEnt.geometry.Arc.center;
        } else {
          if (!centerEnt) return [];
        }
      } else if (state.centerType === 'point' && !state.centerId) {
        return [];
      }
      const rotate = (p: [number, number], angle: number): [number, number] => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = p[0] - center[0];
        const dy = p[1] - center[1];
        return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
      };
      const newEntities: SketchEntity[] = [];
      for (let copyIdx = 1; copyIdx < count; copyIdx++) {
        const angle = totalAngleRad * copyIdx / count;
        entitiesToPattern.forEach(targetId => {
          const targetEnt = sketch.entities.find(e => e.id === targetId);
          if (!targetEnt) return;
          let newGeo: any = null;
          if (targetEnt.geometry.Point) {
            newGeo = { Point: { pos: rotate(targetEnt.geometry.Point.pos, angle) } };
          } else if (targetEnt.geometry.Line) {
            const l = targetEnt.geometry.Line;
            newGeo = { Line: { start: rotate(l.start, angle), end: rotate(l.end, angle) } };
          } else if (targetEnt.geometry.Circle) {
            const c = targetEnt.geometry.Circle;
            newGeo = { Circle: { center: rotate(c.center, angle), radius: c.radius } };
          } else if (targetEnt.geometry.Arc) {
            const arc = targetEnt.geometry.Arc;
            newGeo = { Arc: { center: rotate(arc.center, angle), radius: arc.radius, start_angle: arc.start_angle + angle, end_angle: arc.end_angle + angle } };
          }
          if (newGeo) {
            newEntities.push({ id: crypto.randomUUID(), geometry: newGeo, is_construction: false });
          }
        });
      }
      return newEntities;
    }
    return [];
  });
  // Effect to sync solved sketch
  createEffect(() => {
    const data = graph();
    if (sketchMode() && activeSketchId()) {
      const activeFeature = data.nodes[activeSketchId()!];
      // Rust Feature serializes as "parameters", and ParameterValue::Sketch as {"Sketch": {...}}
      if (activeFeature && activeFeature.parameters?.sketch_data?.Sketch) {
        const solvedSketch = activeFeature.parameters.sketch_data.Sketch;
        // console.log("Syncing solved sketch to currentSketch"); 
        // Note: avoiding log spam, hook logs update
        setCurrentSketch(solvedSketch as Sketch);
      }
    }
  });
  const handleEsc = () => {
    // 1. Cancel Dimension Placement
    if (dimensionPlacementMode()) {
      handleDimensionCancel();
      return;
    }
    // 2. Clear Constraint Selection
    if (constraintSelection().length > 0) {
      setConstraintSelection([]);
      return;
    }
    // 3. Clear Dimension Selection
    if (dimensionSelection().length > 0) {
      handleDimensionCancel();
      return;
    }
    // 4. Clear Measurement Selection (NEW)
    if (measurementSelection().length > 0 || measurementPending()) {
      handleMeasurementClearPending();
      return;
    }
    // 5. Reset Tool to Select
    if (sketchTool() !== "select") {
      setSketchTool("select");
      setTempPoint(null);
      setTempStartPoint(null);
      setStartSnap(null);
      // Also clear any active measurements when leaving measure tool
      if (activeMeasurements().length > 0) {
        setActiveMeasurements([]);
      }
      return;
    }
    // 6. Clear Sketch Selection
    if (sketchSelection().length > 0) {
      setSketchSelection([]);
      return;
    }
    // 7. Clear Backend Selection
    if (selection().length > 0) {
      handleSelect(null); // Sends SELECT:CLEAR
      return;
    }
  };
  // Keyboard shortcuts are now handled centrally by useKeyboardShortcuts in App.tsx
  const handleSelect = (topoId: string | null, modifier: "replace" | "add" | "remove" = "replace") => {
    sel.handleSelect(topoId, modifier, send, sketchMode());
  };
  /* ===== SYNC SKETCH SELECTION TO TOOL SELECTION ===== */
  createEffect(() => {
    const tool = sketchTool();
    if (tool === "dimension") {
      // When entering dimension mode, if there is an existing sketch selection, adopt it.
      // But only if dimensionSelection is empty to avoid overwriting ongoing work.
      const currentSketchSel = sketchSelection();
      const currentDimSel = untrack(() => dimensionSelection());

      if (currentDimSel.length === 0 && currentSketchSel.length > 0) {
        // Filter to valid candidates for dimensioning
        const valid = currentSketchSel.filter(s => s.type === 'entity' || s.type === 'point' || s.type === 'origin');
        if (valid.length > 0) {
          console.log("Syncing sketch selection to dimension tool:", valid);
          setDimensionSelection(valid);
          analyzeDimensionSelection(valid);
          // Clear sketch selection after adopting
          setSketchSelection([]);
        }
      }
    } else if (tool === "measure") {
      // Similar logic for measure tool
      const currentSketchSel = sketchSelection();
      const currentMeasSel = untrack(() => measurementSelection());

      if (currentMeasSel.length === 0 && currentSketchSel.length > 0) {
        const valid = currentSketchSel.filter(s => s.type === 'entity' || s.type === 'point' || s.type === 'origin');
        if (valid.length > 0) {
          console.log("Syncing sketch selection to measure tool:", valid);
          setMeasurementSelection(valid);
          setSketchSelection([]);
        }
      }
    }
  });
  /* ===== DIMENSION PREVIEW EFFECT ===== */
  createEffect(() => {
    // When dimension selection OR mouse position changes, update the proposed action (preview)
    const sel = dimensionSelection();
    dimensionMousePosition(); // Track mouse position for reactivity
    // console.log("[DimPreview Effect] Selection changed:", sel.length, "items, mouse:", mousePos);
    if (sel.length > 0) {
      analyzeDimensionSelection(sel);
      // console.log("[DimPreview Effect] After analyze:", {
      //   proposedAction: dimensionProposedAction(),
      //   placementMode: dimensionPlacementMode()
      // });
    } else {
      setDimensionProposedAction(null);
    }
  });
  // Handle dimension text drag to update offset
  const handleSketchDelete = () => {
    const selection = sketchSelection();
    if (selection.length === 0) return;
    // Map to IDs for deletion. 
    // Note: If a point on a line is selected, s.id is the Line ID. Deleting it deletes the line.
    const toDelete = selection.map(s => s.id);
    const sketch = currentSketch();
    const newEntities = sketch.entities.filter(e => !toDelete.includes(e.id));
    // Cleanup Constraints
    const newConstraints = sketch.constraints.filter(entry => {
      // Check if constraint refers to any deleted ID
      // Robust checking by inspecting constraint structure or stringify
      const json = JSON.stringify(entry.constraint);
      // Check if any deleted ID is substring of JSON. Valid since IDs are UUIDs.
      return !toDelete.some(id => json.includes(id));
    });
    const updated = { ...sketch, entities: newEntities, constraints: newConstraints };
    setCurrentSketch(updated);
    sendSketchUpdate(updated);
    setSketchSelection([]);
  };
  const handleToggleConstruction = () => {
    const selection = sketchSelection();
    // Filter to Entity candidates only (type='entity')
    const entityIds = selection.filter(c => c.type === 'entity').map(c => c.id);
    if (entityIds.length > 0) {
      const sketch = currentSketch();
      // Determine target state: if any selected entity is NOT construction, make ALL construction.
      // Otherwise (all construction), make ALL normal.
      const anySolid = sketch.entities.some(e => entityIds.includes(e.id) && !e.is_construction);
      const targetState = anySolid ? true : false;
      let hasUpdates = false;
      const updatedEntities = sketch.entities.map(e => {
        if (entityIds.includes(e.id)) {
          // Only update if changes
          if (e.is_construction !== targetState) {
            hasUpdates = true;
            return { ...e, is_construction: targetState };
          }
        }
        return e;
      });
      if (hasUpdates) {
        const updatedSketch = { ...sketch, entities: updatedEntities };
        setCurrentSketch(updatedSketch);
        sendSketchUpdate(updatedSketch);
      }
    } else {
      // Valid toggle for global mode (no selection)
      setConstructionMode(!constructionMode());
    }
  };
  // ===== UNIFIED DIMENSION TOOL (Multi-step) =====
  const _getCandidatePosition = (c: SelectionCandidate, sketch: any): [number, number] | null => {
    if (c.type === "origin") return [0, 0];
    if (c.type === "point" && c.position) return c.position;
    // Look up in sketch
    const ent = sketch.entities.find((e: any) => e.id === c.id);
    if (!ent) return null;
    if (c.type === "point" && ent.geometry.Point) return ent.geometry.Point.pos;
    if (c.type === "entity") {
      if (ent.geometry.Line) return ent.geometry.Line.start; // Default
      if (ent.geometry.Circle) return ent.geometry.Circle.center;
      if (ent.geometry.Arc) return ent.geometry.Arc.center;
    }
    return null;
  };
  /**
   * Determines dimension mode based on mouse position relative to two points.
   * - Mouse outside bounding box horizontally (left/right): HorizontalDistance
   * - Mouse outside bounding box vertically (above/below): VerticalDistance  
   * - Mouse inside bounding box: Distance (aligned/diagonal)
   */
  // const [tempPoint, setTempPoint] declared at top (moved)
  // const [tempStartPoint, setTempStartPoint] declared at top (moved)
  // ===== CONSTRAINT INFERENCE STATE =====
  const handleSketchInput = (type: string, point: [number, number, number], event?: MouseEvent) => {
    if (type === "cancel") { return; }
    if (!sketchMode()) return;
    // Apply snapping to get the effective point
    const rawPoint: [number, number] = [point[0], point[1]];
    const { position: snappedPos, snap } = applySnapping(rawPoint, currentSketch(), snapConfig());
    // Update active snap indicator on move
    if (type === "move") {
      if (snap?.snap_type !== activeSnap()?.snap_type) {
        console.log("Active Snap Changed:", snap?.snap_type, snap?.position);
      }
      setActiveSnap(snap);
      // Update cursor position for constraint inference detection
      setCursorPosition(snappedPos);
      // Track shift key for inference suppression
      setInferenceSuppress(event?.shiftKey ?? false);
    }
    // DEBUG: Log tool state on click
    if (type === "click") {
      console.log("[DEBUG handleSketchInput] Click detected, activeTool:", sketchTool());
    }
    // Delegate to Tool Registry (Except Offset which has legacy complex logic for now)
    const activeTool = sketchTool();
    console.log("[DEBUG handleSketchInput] Active tool before delegation:", activeTool, "type:", type);
    if (activeTool !== 'offset') {
      console.log("[DEBUG handleSketchInput] Delegating to ToolRegistry for tool:", activeTool);
      const toolInstance = toolRegistry.getTool(activeTool);
      if (toolInstance) {
        // Pass input to tool
        if (type === "click") {
          toolInstance.onMouseDown && toolInstance.onMouseDown(rawPoint[0], rawPoint[1], event);
        } else if (type === "move") {
          toolInstance.onMouseMove && toolInstance.onMouseMove(rawPoint[0], rawPoint[1], event);
        } else if (type === "up") { // Assuming "up" type is passed or mapped
          toolInstance.onMouseUp && toolInstance.onMouseUp(rawPoint[0], rawPoint[1], event);
        }
        return;
      }
    } else {
      console.log("[DEBUG handleSketchInput] NOT delegating - tool is offset");
    }
    // Use snapped position for all geometry operations
    // Apply angular snapping for line tool when we have a start point
    let effectivePoint: [number, number] = snappedPos;
    const _tool = sketchTool();
    const _startPt = tempPoint();
    if (sketchTool() === "line") {
    } else if (sketchTool() === "circle") {
    } else if (sketchTool() === "arc") {
    } else if (sketchTool() === "point") {
    } else if (sketchTool() === "rectangle") {
    } else if (sketchTool() === "mirror") {
      if (type === "click") {
        if (mirrorState().activeField === 'axis') {
          // Select Axis
          let targetId: string | null = null;
          // Priority to snap
          if (snap && snap.entity_id) {
            targetId = snap.entity_id;
          } else {
            // Fallback to geometry hit test
            // Simple distance check to lines
            const p = effectivePoint;
            let minDist = 0.5; // Threshold
            const sketch = currentSketch();
            for (const ent of sketch.entities) {
              if (ent.geometry.Line) {
                // Point to line segment distance
                const l = ent.geometry.Line;
                const v = [l.end[0] - l.start[0], l.end[1] - l.start[1]];
                const w = [p[0] - l.start[0], p[1] - l.start[1]];
                const c1 = w[0] * v[0] + w[1] * v[1];
                const c2 = v[0] * v[0] + v[1] * v[1];
                let b = c1 / c2;
                if (b < 0) b = 0;
                if (b > 1) b = 1;
                const pb = [l.start[0] + b * v[0], l.start[1] + b * v[1]];
                const dist = Math.sqrt((p[0] - pb[0]) ** 2 + (p[1] - pb[1]) ** 2);
                if (dist < minDist) {
                  minDist = dist;
                  targetId = ent.id;
                }
              }
            }
          }
          if (targetId) {
            const ent = currentSketch().entities.find(e => e.id === targetId);
            if (ent && ent.geometry.Line) {
              setMirrorState({ ...mirrorState(), axis: ent.id, activeField: 'entities' });
            }
          }
        } else {
          // Toggle entity selection
          let targetId: string | null = null;
          if (snap && snap.entity_id) {
            targetId = snap.entity_id;
          } else {
            // Fallback hit test for all types
            const p = effectivePoint;
            let minDist = 0.5;
            const sketch = currentSketch();
            for (const ent of sketch.entities) {
              let dist = Infinity;
              if (ent.geometry.Point) {
                const ep = ent.geometry.Point.pos;
                dist = Math.sqrt((p[0] - ep[0]) ** 2 + (p[1] - ep[1]) ** 2);
              } else if (ent.geometry.Line) {
                const l = ent.geometry.Line;
                const v = [l.end[0] - l.start[0], l.end[1] - l.start[1]];
                const w = [p[0] - l.start[0], p[1] - l.start[1]];
                const c1 = w[0] * v[0] + w[1] * v[1];
                const c2 = v[0] * v[0] + v[1] * v[1];
                let b = c1 / c2;
                if (b < 0) b = 0;
                if (b > 1) b = 1;
                const pb = [l.start[0] + b * v[0], l.start[1] + b * v[1]];
                dist = Math.sqrt((p[0] - pb[0]) ** 2 + (p[1] - pb[1]) ** 2);
              } else if (ent.geometry.Circle) {
                const c = ent.geometry.Circle;
                const dCenter = Math.sqrt((p[0] - c.center[0]) ** 2 + (p[1] - c.center[1]) ** 2);
                dist = Math.abs(dCenter - c.radius);
              } else if (ent.geometry.Arc) {
                const a = ent.geometry.Arc;
                const dCenter = Math.sqrt((p[0] - a.center[0]) ** 2 + (p[1] - a.center[1]) ** 2);
                // Check angle range roughly? Or just circle distance for ease
                dist = Math.abs(dCenter - a.radius);
              }
              if (dist < minDist) {
                minDist = dist;
                targetId = ent.id;
              }
            }
          }

          if (targetId && targetId !== mirrorState().axis) {
            const current = mirrorState().entities;
            if (current.includes(targetId)) {
              setMirrorState({ ...mirrorState(), entities: current.filter(id => id !== targetId) });
            } else {
              setMirrorState({ ...mirrorState(), entities: [...current, targetId] });
            }
          }
        }
      }
    } else if (sketchTool() === "linear_pattern") {
      if (type === "click") {
        const state = linearPatternState();
        const p = effectivePoint;
        const sketch = currentSketch();

        const findHitEntity = (): string | null => {
          if (snap && snap.entity_id) return snap.entity_id;
          let minDist = 0.5;
          let foundId: string | null = null;
          for (const ent of sketch.entities) {
            let dist = Infinity;
            if (ent.geometry.Line) {
              const l = ent.geometry.Line;
              const v = [l.end[0] - l.start[0], l.end[1] - l.start[1]];
              const w = [p[0] - l.start[0], p[1] - l.start[1]];
              const c1 = w[0] * v[0] + w[1] * v[1];
              const c2 = v[0] * v[0] + v[1] * v[1];
              let b = c2 > 0 ? c1 / c2 : 0;
              if (b < 0) b = 0; if (b > 1) b = 1;
              const pb = [l.start[0] + b * v[0], l.start[1] + b * v[1]];
              dist = Math.sqrt((p[0] - pb[0]) ** 2 + (p[1] - pb[1]) ** 2);
            } else if (ent.geometry.Circle) {
              const c = ent.geometry.Circle;
              const dCenter = Math.sqrt((p[0] - c.center[0]) ** 2 + (p[1] - c.center[1]) ** 2);
              dist = Math.abs(dCenter - c.radius);
            } else if (ent.geometry.Arc) {
              const a = ent.geometry.Arc;
              const dCenter = Math.sqrt((p[0] - a.center[0]) ** 2 + (p[1] - a.center[1]) ** 2);
              dist = Math.abs(dCenter - a.radius);
            } else if (ent.geometry.Point) {
              const ep = ent.geometry.Point.pos;
              dist = Math.sqrt((p[0] - ep[0]) ** 2 + (p[1] - ep[1]) ** 2);
            }
            if (dist < minDist) {
              minDist = dist;
              foundId = ent.id;
            }
          }
          return foundId;
        };

        if (state.activeField === 'direction') {
          const targetId = findHitEntity();
          if (targetId) {
            const ent = sketch.entities.find(e => e.id === targetId);
            if (ent && ent.geometry.Line) {
              setLinearPatternState({ ...state, direction: ent.id, activeField: 'entities' });
            }
          }
        } else {
          const targetId = findHitEntity();
          if (targetId && targetId !== state.direction) {
            const current = state.entities;
            if (current.includes(targetId)) {
              setLinearPatternState({ ...state, entities: current.filter(id => id !== targetId) });
            } else {
              setLinearPatternState({ ...state, entities: [...current, targetId] });
            }
          }
        }
      }
    } else if (sketchTool() === "circular_pattern") {
      // Circular Pattern tool: select center point then entities
      if (type === "click") {
        const state = circularPatternState();
        const p = effectivePoint;
        const sketch = currentSketch();
        // Hit test helper
        const findHitEntity = (): string | null => {
          if (snap && snap.entity_id) return snap.entity_id;
          let minDist = 0.5;
          let foundId: string | null = null;
          for (const ent of sketch.entities) {
            let dist = Infinity;
            if (ent.geometry.Line) {
              const l = ent.geometry.Line;
              const v = [l.end[0] - l.start[0], l.end[1] - l.start[1]];
              const w = [p[0] - l.start[0], p[1] - l.start[1]];
              const c1 = w[0] * v[0] + w[1] * v[1];
              const c2 = v[0] * v[0] + v[1] * v[1];
              let b = c2 > 0 ? c1 / c2 : 0;
              if (b < 0) b = 0;
              if (b > 1) b = 1;
              const pb = [l.start[0] + b * v[0], l.start[1] + b * v[1]];
              dist = Math.sqrt((p[0] - pb[0]) ** 2 + (p[1] - pb[1]) ** 2);
            } else if (ent.geometry.Circle) {
              const c = ent.geometry.Circle;
              const dCenter = Math.sqrt((p[0] - c.center[0]) ** 2 + (p[1] - c.center[1]) ** 2);
              dist = Math.abs(dCenter - c.radius);
            } else if (ent.geometry.Arc) {
              const a = ent.geometry.Arc;
              const dCenter = Math.sqrt((p[0] - a.center[0]) ** 2 + (p[1] - a.center[1]) ** 2);
              dist = Math.abs(dCenter - a.radius);
            } else if (ent.geometry.Point) {
              const ep = ent.geometry.Point.pos;
              dist = Math.sqrt((p[0] - ep[0]) ** 2 + (p[1] - ep[1]) ** 2);
            }
            if (dist < minDist) {
              minDist = dist;
              foundId = ent.id;
            }
          }
          return foundId;
        };
        if (state.activeField === 'center' && state.centerType === 'point') {
          // Select center point (any entity with a center/position)
          const targetId = findHitEntity();
          if (targetId) {
            setCircularPatternState({ ...state, centerId: targetId, activeField: 'entities' });
          }
        } else if (state.activeField === 'entities' || state.centerType === 'origin') {
          // For origin mode, auto-advance to entity selection
          // Toggle entity selection (any entity type)
          const targetId = findHitEntity();
          if (targetId && targetId !== state.centerId) {
            const currentEntities = state.entities;
            if (currentEntities.includes(targetId)) {
              setCircularPatternState({ ...state, entities: currentEntities.filter(id => id !== targetId), activeField: 'entities' });
            } else {
              setCircularPatternState({ ...state, entities: [...currentEntities, targetId], activeField: 'entities' });
            }
          }
        }
      }
    }
  };
  function setOffsetDist(d: number) {
    setOffsetState(prev => {
      const next = { ...prev, distance: d };
      const res = calculateOffsetGeometry(currentSketch(), next.selection, next.distance, next.flip);
      return { ...next, previewGeometry: res ? res.entities : [] };
    });
  };
  function setOffsetFlip() {
    setOffsetState(prev => {
      const next = { ...prev, flip: !prev.flip };
      const res = calculateOffsetGeometry(currentSketch(), next.selection, next.distance, next.flip);
      return { ...next, previewGeometry: res ? res.entities : [] };
    });
  };
  function confirmOffset() {
    const s = offsetState();
    const result = calculateOffsetGeometry(currentSketch(), s.selection, s.distance, s.flip);
    if (result) {
      const sketch = currentSketch();
      const updatedSketch = {
        ...sketch,
        entities: [...sketch.entities, ...result.entities],
        constraints: [...sketch.constraints, ...result.constraints.map(c => wrapConstraint(c))],
        history: [...(sketch.history || []),
        ...result.entities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
        ...result.constraints.map(c => ({ AddConstraint: { constraint: c } }))
        ]
      };
      setCurrentSketch(updatedSketch);
      sendSketchUpdate(updatedSketch);
    }
    setOffsetState(prev => ({ ...prev, isPanelOpen: false, previewGeometry: [] }));
    setSketchTool("select");
    setSketchSelection([]);
  };
  function cancelOffset() {
    setOffsetState(prev => ({ ...prev, isPanelOpen: false, previewGeometry: [] }));
    setSketchTool("select");
  };
  function handleOffsetTool() {
    const isPanelCurrentlyOpen = untrack(() => offsetState().isPanelOpen);
    console.log("handleOffsetTool called. sketchSelection:", sketchSelection(), "isPanelOpen:", isPanelCurrentlyOpen);
    const selectionCandidates = sketchSelection();
    // Offset needs Entity IDs
    const selection = selectionCandidates.map(s => s.id);
    // Support Verb-Noun: If empty, stay in offset tool and wait for selection
    if (selection.length === 0) {
      console.log("Offset Tool: No selection yet. Waiting for user to select entities.");
      return;
    }
    // If panel is already open, DO NOT update state to avoid infinite loop
    // The user should use the modal controls (setDistance, flip) to update preview
    if (isPanelCurrentlyOpen) {
      console.log("Offset Tool: Panel already open. State stable.");
      return; // CRITICAL: Do not update state here to break the loop!
    }
    // First time opening with valid selection
    console.log("Offset Tool: Opening panel with selection:", selection);
    const initialDist = 0.5;
    const initialFlip = false;
    const result = calculateOffsetGeometry(currentSketch(), selection, initialDist, initialFlip);
    console.log("Offset Tool: Setting isPanelOpen=true, previewGeometry count:", result?.entities.length ?? 0);
    setOffsetState({
      isPanelOpen: true,
      distance: initialDist,
      flip: initialFlip,
      selection: selection, // offsetState expects string[]? Check types.
      previewGeometry: result ? result.entities : []
    });
  };
  createEffect(() => {
    const tool = sketchTool();
    const selection = sketchSelection();
    if (tool === "offset") {
      console.log("Effect: Offset tool active. Selection len:", selection.length);
      // Use untrack to prevent offsetState from being a dependency
      const isPanelOpen = untrack(() => offsetState().isPanelOpen);
      if (!isPanelOpen) {
        handleOffsetTool();
      }
    }
  });
  /* ===== MODAL CONFIRMATION HANDLERS ===== */
  const confirmMirror = () => {
    const updated = executeMirror(currentSketch(), mirrorState());
    if (!updated) return;
    setCurrentSketch(updated);
    sendSketchUpdate(updated);
    setMirrorState({ axis: null, entities: [], activeField: 'axis', previewGeometry: [] });
    setSketchTool("select");
  };
  const confirmLinearPattern = () => {
    const directionId = linearPatternState().direction;
    const entitiesToPattern = linearPatternState().entities;
    const count = linearPatternState().count;
    const spacing = linearPatternState().spacing;
    const flip = linearPatternState().flipDirection;
    if (!directionId || entitiesToPattern.length === 0 || count < 2) return;
    const sketch = currentSketch();
    const dirEnt = sketch.entities.find(e => e.id === directionId);
    if (!dirEnt || !dirEnt.geometry.Line) return;
    // Calculate direction vector
    const line = dirEnt.geometry.Line;
    const dx = line.end[0] - line.start[0];
    const dy = line.end[1] - line.start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;
    let nx = dx / len;
    let ny = dy / len;
    if (flip) {
      nx = -nx;
      ny = -ny;
    }
    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];
    // For each copy (starting from 1 since original is copy 0)
    for (let copyIdx = 1; copyIdx < count; copyIdx++) {
      const offset = spacing * copyIdx;
      const translate = (p: [number, number]): [number, number] => [p[0] + nx * offset, p[1] + ny * offset];
      entitiesToPattern.forEach(targetId => {
        const targetEnt = sketch.entities.find(e => e.id === targetId);
        if (!targetEnt) return;
        const newId = crypto.randomUUID();
        let newGeo: any = null;
        if (targetEnt.geometry.Point) {
          newGeo = { Point: { pos: translate(targetEnt.geometry.Point.pos) } };
        } else if (targetEnt.geometry.Line) {
          const l = targetEnt.geometry.Line;
          newGeo = { Line: { start: translate(l.start), end: translate(l.end) } };
          // Add Equal constraint for length
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        } else if (targetEnt.geometry.Circle) {
          const c = targetEnt.geometry.Circle;
          newGeo = { Circle: { center: translate(c.center), radius: c.radius } };
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        } else if (targetEnt.geometry.Arc) {
          const arc = targetEnt.geometry.Arc;
          newGeo = { Arc: { center: translate(arc.center), radius: arc.radius, start_angle: arc.start_angle, end_angle: arc.end_angle } };
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        }
        if (newGeo) {
          newEntities.push({ id: newId, geometry: newGeo, is_construction: false });
        }
      });
    }
    const updated = { ...currentSketch() };
    updated.entities = [...updated.entities, ...newEntities];
    updated.constraints = [...updated.constraints, ...newConstraints.map(c => wrapConstraint(c))];
    updated.history = [
      ...(updated.history || []),
      ...newEntities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
      ...newConstraints.map(c => ({ AddConstraint: { constraint: c } }))
    ];
    setCurrentSketch(updated);
    sendSketchUpdate(updated);

    setLinearPatternState({ direction: null, entities: [], count: 3, spacing: 2.0, activeField: 'direction', flipDirection: false, previewGeometry: [] });
    setSketchTool("select");
  };

  const confirmCircularPattern = () => {
    const state = circularPatternState();
    const entitiesToPattern = state.entities;
    const count = state.count;
    const flip = state.flipDirection;
    const totalAngleRad = (flip ? -1 : 1) * state.totalAngle * Math.PI / 180;
    if (entitiesToPattern.length === 0 || count < 2) return;

    // Get center point
    let center: [number, number] = [0, 0];
    if (state.centerType === 'point' && state.centerId) {
      const sketch = currentSketch();
      const centerEnt = sketch.entities.find(e => e.id === state.centerId);
      if (centerEnt?.geometry.Point) {
        center = centerEnt.geometry.Point.pos;
      } else if (centerEnt?.geometry.Circle) {
        center = centerEnt.geometry.Circle.center;
      } else if (centerEnt?.geometry.Arc) {
        center = centerEnt.geometry.Arc.center;
      }
    }

    const rotate = (p: [number, number], angle: number): [number, number] => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = p[0] - center[0];
      const dy = p[1] - center[1];
      return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
    };

    const sketch = currentSketch();
    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];

    // For each copy (starting from 1)
    for (let copyIdx = 1; copyIdx < count; copyIdx++) {
      const angle = totalAngleRad * copyIdx / count;

      entitiesToPattern.forEach(targetId => {
        const targetEnt = sketch.entities.find(e => e.id === targetId);
        if (!targetEnt) return;

        const newId = crypto.randomUUID();
        let newGeo: any = null;

        if (targetEnt.geometry.Point) {
          newGeo = { Point: { pos: rotate(targetEnt.geometry.Point.pos, angle) } };
        } else if (targetEnt.geometry.Line) {
          const l = targetEnt.geometry.Line;
          newGeo = { Line: { start: rotate(l.start, angle), end: rotate(l.end, angle) } };
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        } else if (targetEnt.geometry.Circle) {
          const c = targetEnt.geometry.Circle;
          newGeo = { Circle: { center: rotate(c.center, angle), radius: c.radius } };
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        } else if (targetEnt.geometry.Arc) {
          const arc = targetEnt.geometry.Arc;
          const startP: [number, number] = [arc.center[0] + arc.radius * Math.cos(arc.start_angle), arc.center[1] + arc.radius * Math.sin(arc.start_angle)];
          const endP: [number, number] = [arc.center[0] + arc.radius * Math.cos(arc.end_angle), arc.center[1] + arc.radius * Math.sin(arc.end_angle)];

          const newC = rotate(arc.center, angle);
          const newStart = rotate(startP, angle);
          const newEnd = rotate(endP, angle);

          const newStartAngle = Math.atan2(newStart[1] - newC[1], newStart[0] - newC[0]);
          const newEndAngle = Math.atan2(newEnd[1] - newC[1], newEnd[0] - newC[0]);

          newGeo = { Arc: { center: newC, radius: arc.radius, start_angle: newStartAngle, end_angle: newEndAngle } };
          newConstraints.push({ Equal: { entities: [targetId, newId] } });
        }

        if (newGeo) {
          newEntities.push({ id: newId, geometry: newGeo, is_construction: false });
        }
      });
    }

    const updated = { ...currentSketch() };
    updated.entities = [...updated.entities, ...newEntities];
    updated.constraints = [...updated.constraints, ...newConstraints.map(c => wrapConstraint(c))];
    updated.history = [
      ...(updated.history || []),
      ...newEntities.map(e => ({ AddGeometry: { id: e.id, geometry: e.geometry } })),
      ...newConstraints.map(c => ({ AddConstraint: { constraint: c } }))
    ];
    setCurrentSketch(updated);
    sendSketchUpdate(updated);

    setCircularPatternState({ centerId: null, entities: [], count: 3, totalAngle: 360, activeField: 'center', centerType: 'point', flipDirection: false, previewGeometry: [] });
    setSketchTool("select");
  };
  // Expose state for E2E testing
  createEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).sketchState = {
        sketchMode: sketchMode(),
        sketchTool: sketchTool(),
        currentSketch: currentSketch(),
        sketchSelection: sketchSelection(),
        constraintSelection: constraintSelection(),
        activeSnap: activeSnap(),
        dimensionSelection: dimensionSelection(),
        setSketchTool: setSketchTool
      };
    }
  });
  // Offset Geometry Calculation (for offset tool preview and confirmation)
  function calculateOffsetGeometry(
    sketch: Sketch,
    selection: string[],
    distance: number,
    flip: boolean
  ): { entities: SketchEntity[], constraints: SketchConstraint[] } | null {
    const lines = selection.map(id => sketch.entities.find(e => e.id === id))
      .filter(e => e && e.geometry.Line)
      .map(e => ({ id: e!.id, geometry: e!.geometry.Line! }));
    if (lines.length === 0) return null;
    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];
    const createdLines: { originalId: string, newId: string, start: [number, number], end: [number, number] }[] = [];
    const d = flip ? -distance : distance;
    lines.forEach(line => {
      const dx = line.geometry.end[0] - line.geometry.start[0];
      const dy = line.geometry.end[1] - line.geometry.start[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-9) return;
      const nx = -dy / len;
      const ny = dx / len;
      const ox = nx * d;
      const oy = ny * d;
      const newStart: [number, number] = [line.geometry.start[0] + ox, line.geometry.start[1] + oy];
      const newEnd: [number, number] = [line.geometry.end[0] + ox, line.geometry.end[1] + oy];
      const newId = crypto.randomUUID();
      newEntities.push({
        id: newId,
        geometry: { Line: { start: newStart, end: newEnd } },
        is_construction: false
      });
      createdLines.push({ originalId: line.id, newId, start: newStart, end: newEnd });
      newConstraints.push({ Parallel: { lines: [line.id, newId] } });
      newConstraints.push({
        DistancePointLine: {
          point: { id: newId, index: 0 },
          line: line.id,
          value: Math.abs(distance),
          style: { driven: false, offset: [0, 0] }
        }
      });
    });
    const tol = 1e-6;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const l1 = lines[i];
        const l2 = lines[j];
        const startDiffStart = Math.hypot(l1.geometry.start[0] - l2.geometry.start[0], l1.geometry.start[1] - l2.geometry.start[1]);
        const startDiffEnd = Math.hypot(l1.geometry.start[0] - l2.geometry.end[0], l1.geometry.start[1] - l2.geometry.end[1]);
        const endDiffStart = Math.hypot(l1.geometry.end[0] - l2.geometry.start[0], l1.geometry.end[1] - l2.geometry.start[1]);
        const endDiffEnd = Math.hypot(l1.geometry.end[0] - l2.geometry.end[0], l1.geometry.end[1] - l2.geometry.end[1]);
        if (startDiffStart < tol) {
          const newL1 = createdLines[i];
          const newL2 = createdLines[j];
          newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 0 }, { id: newL2.newId, index: 0 }] } });
        } else if (startDiffEnd < tol) {
          const newL1 = createdLines[i];
          const newL2 = createdLines[j];
          newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 0 }, { id: newL2.newId, index: 1 }] } });
        } else if (endDiffStart < tol) {
          const newL1 = createdLines[i];
          const newL2 = createdLines[j];
          newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 1 }, { id: newL2.newId, index: 0 }] } });
        } else if (endDiffEnd < tol) {
          const newL1 = createdLines[i];
          const newL2 = createdLines[j];
          newConstraints.push({ Coincident: { points: [{ id: newL1.newId, index: 1 }, { id: newL2.newId, index: 1 }] } });
        }
      }
    }
    return { entities: newEntities, constraints: newConstraints };
  }
  const handleDimensionEdit = (index: number, type: string) => {
    const sketch = currentSketch();
    const entry = sketch.constraints[index];
    if (!entry) return;
    const constraint = entry.constraint;
    let currentValue = 0;
    let expression: string | undefined = undefined;
    if (type === 'Distance' && constraint.Distance) {
      currentValue = constraint.Distance.value;
      expression = constraint.Distance.style?.expression;
    } else if (type === 'HorizontalDistance' && constraint.HorizontalDistance) {
      currentValue = constraint.HorizontalDistance.value;
      expression = constraint.HorizontalDistance.style?.expression;
    } else if (type === 'VerticalDistance' && constraint.VerticalDistance) {
      currentValue = constraint.VerticalDistance.value;
      expression = constraint.VerticalDistance.style?.expression;
    } else if (type === 'Angle' && constraint.Angle) {
      currentValue = constraint.Angle.value;
      expression = constraint.Angle.style?.expression;
    } else if (type === 'Radius' && constraint.Radius) {
      currentValue = constraint.Radius.value;
      expression = constraint.Radius.style?.expression;
    } else if (type === 'DistanceParallelLines' && constraint.DistanceParallelLines) {
      currentValue = constraint.DistanceParallelLines.value;
      expression = constraint.DistanceParallelLines.style?.expression;
    } else if (type === 'DistancePointLine' && constraint.DistancePointLine) {
      currentValue = (constraint.DistancePointLine as any).value || 0;
      expression = (constraint.DistancePointLine as any).style?.expression;
    }
    setEditingDimension({
      constraintIndex: index,
      type: (type === 'HorizontalDistance' || type === 'VerticalDistance' || type === 'DistanceParallelLines' || type === 'DistancePointLine') ? 'Distance' : type as "Distance" | "Angle" | "Radius",
      currentValue,
      expression
    });
  };
  return {
    handleDimensionEdit,
    sketchMode, setSketchMode,
    activeSketchId, setActiveSketchId,
    sketchTool, setSketchTool,
    sketchSelection, setSketchSelection,
    constraintSelection, setConstraintSelection,
    currentSketch, setCurrentSketch,
    originalSketch, setOriginalSketch,
    sketchSetupMode, setSketchSetupMode,
    pendingSketchId, setPendingSketchId,
    constructionMode, setConstructionMode,
    cameraAlignPlane, setCameraAlignPlane,
    // Helper states for tools
    offsetState, setOffsetState,
    mirrorState, setMirrorState,
    linearPatternState, setLinearPatternState,
    circularPatternState, setCircularPatternState,
    patternPreview,
    // Handlers
    handleSketchInput,
    handleSketchFinish,
    handleCancelSketch,
    handlePlaneSelected,
    handleStartSketch,
    handleSelect,
    handleToggleConstruction,
    handleEsc,
    handleSketchDelete,
    // Snap/Dimension
    snapConfig, setSnapConfig,
    activeSnap, setActiveSnap,
    editingDimension, setEditingDimension,
    dimensionSelection, setDimensionSelection,
    dimensionPlacementMode, setDimensionPlacementMode,
    dimensionProposedAction, setDimensionProposedAction,
    setDimensionMousePosition,
    handleDimensionFinish,
    handleDimensionCancel,
    handleDimensionDrag,
    // Measurement Tool (non-driving, temporary)
    measurementSelection, setMeasurementSelection,
    measurementPending, setMeasurementPending,
    activeMeasurements, setActiveMeasurements,

    handleMeasurementClearPending,
    // Modal Actions
    confirmOffset,
    cancelOffset,
    setOffsetDist,
    setOffsetFlip,
    confirmMirror,
    confirmLinearPattern,
    confirmCircularPattern,
    // Autostart
    autostartNextSketch, setAutostartNextSketch,
    sendSketchUpdate,
    // Constraint Inference Previews
    inferredConstraints,
    setInferenceSuppress
  };
};
// Force update
