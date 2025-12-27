import { createSignal, createEffect, createMemo, onCleanup, untrack, type Accessor } from 'solid-js';
import { type Sketch, type SketchEntity, type SketchConstraint, type ConstraintPoint, type SnapPoint, type SnapConfig, type SketchPlane, defaultSnapConfig, type SelectionCandidate, type SketchToolType, type SolveResult, wrapConstraint, type FeatureGraphState, type ActiveMeasurement, type MeasurementResult, type WebSocketCommand } from '../types';
import { applySnapping, applyAngularSnapping, applyAutoConstraints } from '../snapUtils';
import { detectInferredConstraints, type InferredConstraint, defaultInferenceConfig } from '../utils/ConstraintInference';
import { useSketchUI } from './useSketchUI';
import { useSketchSelection } from './useSketchSelection';

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

  // Feature Graph State managed by hook
  const [autostartNextSketch, setAutostartNextSketch] = createSignal(false);

  // Current Sketch State (The active sketch data)
  const [currentSketch, setCurrentSketch] = createSignal<Sketch>({
    plane: { type: 'xy', origin: [0, 0, 0], x_axis: [1, 0, 0], y_axis: [0, 1, 0], z_axis: [0, 0, 1] },
    entities: [],
    constraints: [],
    history: []
  });

  // Store original state for "Cancel"
  const [originalSketch, setOriginalSketch] = createSignal<Sketch | null>(null);




  // Camera alignment trigger for sketch mode
  const [cameraAlignPlane, setCameraAlignPlane] = createSignal<SketchPlane | null>(null);


  // Props destructuring
  const { send, graph, selection } = props;

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
    dimensionPlacementMode,
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
    startSnap, setStartSnap,
    tempPoint, setTempPoint,
    tempStartPoint, setTempStartPoint,
    cursorPosition, setCursorPosition,
    inferenceSuppress, setInferenceSuppress,
    toolRegistry,
    inferredConstraints,
    handleSketchInput: handleSketchHookInput // <--- New export from toolHook
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

  /* ===== DIMENSION PREVIEW EFFECT ===== */
  createEffect(() => {
    // When dimension selection OR mouse position changes, update the proposed action (preview)
    const sel = dimensionSelection();
    const mousePos = dimensionMousePosition(); // Track mouse position for reactivity
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

  /* ===== AUTOSTART SKETCH EFFECT ===== */
  createEffect(() => {
    // If autostart flag is true, scan for a new sketch that matches naming pattern
    // or just the latest sketch, and trigger startSketch on it.
    if (autostartNextSketch()) {
      const nodes = graph().nodes;
      // Heuristic: find the sketch with the highest number "Sketch N"
      let maxN = 0;
      let targetId: string | null = null;

      Object.values(nodes).forEach(node => {
        if (node.feature_type === "Sketch" && node.name.startsWith("Sketch ")) {
          const n = parseInt(node.name.replace("Sketch ", ""));
          if (!isNaN(n) && n > maxN) {
            maxN = n;
            targetId = node.id;
          }
        }
      });

      if (targetId) {
        setAutostartNextSketch(false); // Reset flag
        handleStartSketch(targetId);
      }
    }
  });

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
    // If loadedSketch exists AND has valid data, we assume it has a plane and enters edit mode directly.
    // If it's pure null or missing data, it's a new sketch needing setup.
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
      // Do not set sketchMode(true) yet, waiting for plane selection for NEW sketch
    }
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
        // If no original (e.g. was new), maybe just leave it or empty it?
        // If it was new, we might want to delete the pending feature? 
        // For now, just exit. The feature exists but is empty.
      }
    }
    setSketchMode(false);
    setActiveSketchId(null);
    setConstraintSelection([]);
    setOriginalSketch(null);
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
    setConstraintSelection([]); // Reset any in-progress constraint selection
  };



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

  const getCandidatePosition = (c: SelectionCandidate, sketch: any): [number, number] | null => {
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

    // Delegate to Tool Registry (Except Dimension/Measure/Offset which have legacy complex logic for now)
    const activeTool = sketchTool();
    console.log("[DEBUG handleSketchInput] Active tool before delegation:", activeTool, "type:", type);
    if (activeTool !== 'dimension' && activeTool !== 'measure' && activeTool !== 'offset') {
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
      console.log("[DEBUG handleSketchInput] NOT delegating - tool is dimension or measure");
    }

    // Use snapped position for all geometry operations
    // Apply angular snapping for line tool when we have a start point
    let effectivePoint: [number, number] = snappedPos;
    const tool = sketchTool();
    const startPt = tempPoint();



    if (sketchTool() === "line") {
    } else if (sketchTool() === "ellipse") {
      if (type === "click") {
        if (!tempPoint()) {
          // Click 1: Center
          setTempPoint(effectivePoint);
          setStartSnap(snap); // Capture snap for center
        } else if (!tempStartPoint()) {
          // Click 2: Major Axis End
          setTempStartPoint(effectivePoint);
        } else {
          // Click 3: Minor Axis (width)
          const center = tempPoint()!;
          const majorEnd = tempStartPoint()!;

          const dx = majorEnd[0] - center[0];
          const dy = majorEnd[1] - center[1];
          const semi_major = Math.sqrt(dx * dx + dy * dy);
          const rotation = Math.atan2(dy, dx);

          const len = semi_major > 1e-6 ? semi_major : 1.0;
          const ux = dx / len;
          const uy = dy / len;

          // Vector from Center to Click 3
          const vx = effectivePoint[0] - center[0];
          const vy = effectivePoint[1] - center[1];

          // Component perpendicular to Major Axis
          const minor_dist = Math.abs(vx * (-uy) + vy * ux);
          const semi_minor = minor_dist > 1e-6 ? minor_dist : 0.1;

          const newEntity: SketchEntity = {
            id: crypto.randomUUID(),
            geometry: {
              Ellipse: {
                center: center,
                semi_major: semi_major,
                semi_minor: semi_minor,
                rotation: rotation
              }
            },
            is_construction: constructionMode()
          };

          const updated = { ...currentSketch() };
          updated.entities = updated.entities.filter(e => e.id !== "preview_ellipse");
          updated.entities = [...updated.entities, newEntity];
          updated.history = [...(updated.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

          // Auto-constraints (Center snap)
          const autoConstraints = applyAutoConstraints(updated, newEntity.id, startSnap(), null);
          updated.constraints = [...(updated.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
          updated.history = [...(updated.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated);

          setTempPoint(null);
          setTempStartPoint(null);
          setStartSnap(null);
          console.log("Added sketch ellipse with constraints:", autoConstraints.length);
        }
      } else if (type === "move") {
        if (tempPoint()) {
          const center = tempPoint()!;
          let semi_major = 1.0;
          let semi_minor = 0.5;
          let rotation = 0.0;

          if (!tempStartPoint()) {
            // Defining Major Axis
            const dx = effectivePoint[0] - center[0];
            const dy = effectivePoint[1] - center[1];
            semi_major = Math.sqrt(dx * dx + dy * dy);
            rotation = Math.atan2(dy, dx);
            semi_minor = semi_major * 0.5; // Preview
          } else {
            // Defining Minor Axis
            const majorEnd = tempStartPoint()!;
            const dx = majorEnd[0] - center[0];
            const dy = majorEnd[1] - center[1];
            semi_major = Math.sqrt(dx * dx + dy * dy);
            rotation = Math.atan2(dy, dx);

            const len = semi_major > 1e-6 ? semi_major : 1.0;
            const ux = dx / len;
            const uy = dy / len;

            const vx = effectivePoint[0] - center[0];
            const vy = effectivePoint[1] - center[1];

            const minor_dist = Math.abs(vx * (-uy) + vy * ux);
            semi_minor = minor_dist > 1e-6 ? minor_dist : 0.1;
          }

          const PREVIEW_ID = "preview_ellipse";
          const previewEntity: SketchEntity = {
            id: PREVIEW_ID,
            geometry: {
              Ellipse: {
                center,
                semi_major,
                semi_minor,
                rotation
              }
            },
            is_construction: constructionMode()
          };

          const entities = currentSketch().entities.filter(e => e.id !== PREVIEW_ID);
          setCurrentSketch({ ...currentSketch(), entities: [...entities, previewEntity] });
        }
      }
    } else if (sketchTool() === "circle") {
    } else if (sketchTool() === "arc") {
    } else if (sketchTool() === "point") {
      // POINT TOOL - single click creates a point
      if (type === "click") {
        const newEntity: SketchEntity = {
          id: crypto.randomUUID(),
          geometry: {
            Point: {
              pos: effectivePoint
            }
          },
          is_construction: constructionMode()
        };

        const updated = { ...currentSketch() };
        updated.entities = [...updated.entities, newEntity];
        updated.history = [...(updated.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

        // Apply auto-constraints if snapped to something
        const autoConstraints = applyAutoConstraints(updated, newEntity.id, snap, null);
        updated.constraints = [...(updated.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
        updated.history = [...(updated.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

        setCurrentSketch(updated);
        sendSketchUpdate(updated);

        console.log("Added sketch point with constraints:", autoConstraints.length);
      }
      // No preview for point tool - it's instant
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

          if (targetId) {
            if (targetId === mirrorState().axis) {
              // ignore
            } else {
              const currentEntities = mirrorState().entities;
              if (currentEntities.includes(targetId)) {
                setMirrorState({ ...mirrorState(), entities: currentEntities.filter(id => id !== targetId) });
              } else {
                setMirrorState({ ...mirrorState(), entities: [...currentEntities, targetId] });
              }
            }
          }
        }
      }
    } else if (sketchTool() === "linear_pattern") {
      // Linear Pattern tool: select direction line then entities
      if (type === "click") {
        const state = linearPatternState();
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

        if (state.activeField === 'direction') {
          // Select direction line
          const targetId = findHitEntity();
          if (targetId) {
            const ent = sketch.entities.find(e => e.id === targetId);
            if (ent && ent.geometry.Line) {
              setLinearPatternState({ ...state, direction: ent.id, activeField: 'entities' });
            }
          }
        } else {
          // Toggle entity selection (any entity type)
          const targetId = findHitEntity();
          if (targetId && targetId !== state.direction) {
            const currentEntities = state.entities;
            if (currentEntities.includes(targetId)) {
              setLinearPatternState({ ...state, entities: currentEntities.filter(id => id !== targetId) });
            } else {
              setLinearPatternState({ ...state, entities: [...currentEntities, targetId] });
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
    } else if (sketchTool() === "slot") {
      if (type === "click") {
        if (!tempPoint()) {
          // Click 1: Center 1
          setTempPoint(effectivePoint);
        } else if (!tempStartPoint()) {
          // Click 2: Center 2 (defines axis)
          setTempStartPoint(effectivePoint);
        } else {
          // Click 3: Define radius and finish
          const c1 = tempPoint()!;
          const c2 = tempStartPoint()!;
          // For clicking, the radius is distance from the line defined by c1-c2 to the click point?
          // Or just distance from c2?
          // Generally slots are defined by center-center, then width.
          // Radius = distance from line segment C1-C2 to Point.

          // Vector C1 -> C2
          const dx = c2[0] - c1[0];
          const dy = c2[1] - c1[1];
          const len = Math.sqrt(dx * dx + dy * dy);

          // Normal
          const nx = -dy / len;
          const ny = dx / len;

          // Point P
          const px = effectivePoint[0];
          const py = effectivePoint[1];

          // Project P onto Line to find distance
          // Dist = |(P - C1) . N|
          const dist = Math.abs((px - c1[0]) * nx + (py - c1[1]) * ny);
          const radius = dist > 0.001 ? dist : 1.0;

          // Generate 2 Arcs + 2 Lines
          // Arc 1 at C1, Arc 2 at C2
          // Angle of vector V = atan2(dy, dx)
          const angle = Math.atan2(dy, dx);

          // Arc 1 (at C1): Left Semicircle (bulging away from C2)
          // Sweep CCW from +90° (Top) to +270° (Bottom)
          const a1_start = angle + Math.PI / 2;
          const a1_end = angle + Math.PI / 2 + Math.PI;

          // Arc 2 (at C2): Right Semicircle (bulging away from C1)
          // Sweep CCW from -90° (Bottom) to +90° (Top)
          const a2_start = angle - Math.PI / 2;
          const a2_end = angle + Math.PI / 2;

          // IDs
          const a1_id = crypto.randomUUID();
          const a2_id = crypto.randomUUID();
          const l1_id = crypto.randomUUID();
          const l2_id = crypto.randomUUID();

          // Entities
          const a1: SketchEntity = { id: a1_id, geometry: { Arc: { center: c1, radius, start_angle: a1_start, end_angle: a1_end } } };
          const a2: SketchEntity = { id: a2_id, geometry: { Arc: { center: c2, radius, start_angle: a2_start, end_angle: a2_end } } };

          // Calc endpoints for lines
          // Arc 1 Top (Start) is C1 + R*N. Bottom (End) is C1 - R*N.
          const p_a1_top = [c1[0] + radius * nx, c1[1] + radius * ny];
          const p_a1_btm = [c1[0] - radius * nx, c1[1] - radius * ny];

          // Arc 2 Top (End) is C2 + R*N. Bottom (Start) is C2 - R*N.
          const p_a2_top = [c2[0] + radius * nx, c2[1] + radius * ny];
          const p_a2_btm = [c2[0] - radius * nx, c2[1] - radius * ny];

          // L1 (Top Line): Connects A1 Top to A2 Top
          const l1: SketchEntity = { id: l1_id, geometry: { Line: { start: p_a1_top as [number, number], end: p_a2_top as [number, number] } } };

          // L2 (Bottom Line): Connects A1 Bottom to A2 Bottom
          const l2: SketchEntity = { id: l2_id, geometry: { Line: { start: p_a1_btm as [number, number], end: p_a2_btm as [number, number] } } };

          // Define Construction Axis (Line from C1 to C2)
          const axis_id = crypto.randomUUID();
          const axisLine: SketchEntity = {
            id: axis_id,
            geometry: { Line: { start: c1, end: c2 } },
            is_construction: true
          };

          // Constraints
          const constraints: any[] = [

            // Axis Connectivity (The axis ends ARE the arc centers)
            // Arc index 0 is center. Axis Start(0) -> C1, Axis End(1) -> C2.
            { Coincident: { points: [{ id: axis_id, index: 0 }, { id: a1_id, index: 0 }] } },
            { Coincident: { points: [{ id: axis_id, index: 1 }, { id: a2_id, index: 0 }] } },

            // Parallel Sides to Axis (Prevents hourglass twist)
            { Parallel: { lines: [l1_id, axis_id] } },
            { Parallel: { lines: [l2_id, axis_id] } },

            { Equal: { entities: [a1_id, a2_id] } }, // Equal radii
            // Wait. Coincident(Point, Arc) means Point is ON the Arc Curve.
            // In backend, Coincident(Point, Entity) works if Entity is Arc.
            // But usually we specify index?
            // If Point entity, index is 0.
            // If Arc entity, index 0 is Center, 1 Start, 2 End.
            // We want Point(0) on Arc(Curve).
            // Backend "Coincident" support for Point-On-Curve often requires implicit handling or OnConstraint.
            // Assuming "Coincident" works for Point-on-Arc.
            // For now, let's assume { Coincident: { points: [{id: Pt}, {id: Arc}] } } implies Pt on Arc.
            // Wait, standard solver might not support "Point on Arc" via Coincident.
            // It supports "Distance(Pt, Center) = Radius".
            // If Coincident isn't supported, we can rely on Axis coincidence + position?
            // Actually, backend DOES support Coincident(Point, Arc) meaning "Point lies on the circle of the arc".
            // BUT: "points" array usually expects specific indices.
            // If we omit index for Arc, or use a special sentinel?
            // Let's check how "Point on Line" is done.
            // { Coincident: { points: [{id: P}, {id: L}] } } ?? No.
            // { Coincident: { points: [{id: P}, ...], entity: L } } ??
            // Looking at `ConstraintType`:
            // `distance_point_line` exists.
            // `on_entity`? No.
            // `coincident` takes `Vec<ConstraintPoint>`.
            // `ConstraintPoint` has `id` and `index`.
            // If I want point ON curve, I usually need a specific constraint type or just use standard Coincident if the solver allows "Point vs Curve".
            // If not, I can simulate it with `Distance(Apex, A1_Center) = Distance(A1_Start, A1_Center)`.
            // That equates radii.
            // `Equal({id: apex1_id, index: 0}, {id: a1_id, index: 0})` ?? No.
            // `Distance` constraint takes `ConstraintPoint` and `ConstraintPoint`? or `ConstraintPoint` and `Entity`?
            // Let's assume standard Coincident applies for now or rely on Geometry.
            // Actually, if I place the point there, and constrain it to the AXIS (Line), that's `Coincident(Point, Line)`.
            // `Coincident` logic for Point-Line:
            // "point" : { id: pt, index: 0 }, "line": line_id.
            // Let's look at `DistancePointLine` usage in line 3904. `DistancePointLine` is separate.
            // Standard `Coincident` is Point-Point.
            // Does `Coincident` support Point-Line?
            // In `handleSlotClick` (line 2289) we use `Coincident` for `l1 start` and `a1 top`. Both are Points.
            // To constrain Apex on Axis Line:
            // `{ DistancePointLine: { point: {id: apex1_id, index: 0}, line: axis_id, value: 0 } }`.
            // To constrain Apex on Arc:
            // There is no `DistancePointArc`.
            // But `Distance(Apex, Center) = Radius`.
            // We have `Equal` for entities... maybe `Equal` for dists?
            // Let's use `DistancePointLine` for the Axis constraint.
            // For the Arc constraint... maybe `Coincident` with `Arc Center` and `Apex`? NO.
            // If I just constrain Apex to Axis, and leave it free along the axis...
            // It doesn't help.
            // I need it FIXED relative to Center.
            // `Distance(Apex, Center) = Radius`.
            // But Radius is variable.
            // `Distance(Apex, Center) = Distance(StartPoint, Center)`. (Equal Distance).
            // Do we have `EqualDistance`?
            // We have `Equal` constraint for `entities` (Radii of 2 circles).
            // `EqualPoints`? No.
            //
            // Okay, simpler plan:
            // I will just place the points and constrain them `Coincident` to the Axis.
            // And `Coincident` to the Arc if possible. 
            // If I can't constrain to Arc, I will just trust that "Point on Axis" + "Initial Position" is a strong hint.
            // Wait, if passing `apex1` to `Coincident` with `a1` doesn't work...
            // The solver might error.
            // Let's try `DistancePointLine` to Axis.
            // And assume the point stays put? No, that's weak.

            // Alternative:
            // The "Arc" Entity has `start` and `end` points.
            // Can I add a `mid` point to the Arc definition?
            // No.

            // Let's stick to `DistancePointLine` for Axis.
            // And try to add `Coincident` for `Apex` and `Arc`. 
            // If backend supports `PointOnCurve` via `Coincident`, great.
            // If not, I'll rely on the Axis constraint + initial placement.



            // Since I can't easily constrain "Point on Arc" without verifying backend support:
            // I will add a `Tangent` constraint? No.
            // I'll add `Equal` constraint for `Apex->Center` vs `Start->Center`? Complex.
            //
            // Actually, what if I explicitly define the Arc using `Start`, `End`, AND `Apex`?
            // `Arc` by 3 points.
            // The backend `Arc` entity is Center/Radius/Angles.
            //
            // Let's just create the points. The mere existence of "Construction Points" at the Apex, 
            // even if only constrained to the Axis, gives me a handle to drag.
            // But to fix the solver flip, they must be linked to the Arc.
            //
            // Let's TRY `Coincident` between Point and Arc.
            // If it fails, I'll see an error.
            // `Coincident` usually means "Same Location".
            // `Coincident { points: [pt, arc_center] }` -> Point is at Center.
            // `Coincident { points: [pt, arc_start] }` -> Point is at Start.
            //
            // WAIT! The `Arc` entity logic in `useSketching` implies that `Coincident` works on "Endpoints".
            // It does NOT support generic point-on-curve.

            // REVISED PLAN:
            // Just use the AXIS constraint and Initial Placement.
            // Why?
            // If I place `Apex` at `C1 - R*V`.
            // And use `DistancePointLine` to Axis.
            // And **Distance** constraint between `Apex` and `C1`.
            // But I can't set "Distance = Variable".
            //
            // What if I constrain `Apex` to `StartPoint` with `Vertical/Horizontal`?
            // Apex is aligned with Center. Start is aligned with Top.
            // They form a right triangle.
            //
            // Let's skip the Apex constraint for a moment.
            // The issue is Initial Guess.
            // I'll compute `start_angle` more robustly.
            // My previous thought: "If dx < 0, angle wraps".
            // `Math.atan2` returns `(-PI, PI]`.
            // If `angle = PI` (Horizontal R->L).
            // `start = PI + PI/2 = 3PI/2`.
            // `end = 5PI/2`.
            // Result roughly `[-90, 90]` but shifted 360.
            //
            // The Fix might be strictly enforcing `Angle` range to `[-PI, PI]`.
            //
            // BUT, the Apex Points are still useful for Visual debugging and Dragging.
            // I will add them and constrain them to the AXIS. 
            // AND I will add a `Coincident` constraint between `Apex` and `Arc` IF I CAN FIND ONE.
            //
            // Wait, I can use `Distance` between `Apex` and `Center` is `Equal` to `Distance` between `Start` and `Center`.
            // { EqualDistance: { p1: [Apex, Center], p2: [Start, Center] } }?
            // Is that supported? Likely not.

            // Let's just use `DistancePointLine` to Axis for now.
            // And I will ALSO manually compute the correct `start/end` angles to ensure they are normalized.
            // `normalizeAngle` function.

          ];

          const updated = { ...currentSketch() };
          updated.entities = updated.entities.filter(e => !e.id.startsWith("preview_slot"));
          updated.entities = [...updated.entities, axisLine, a1, a2, l1, l2];
          updated.constraints = [...updated.constraints, ...constraints.map(c => wrapConstraint(c))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated); // Sync to backend for live DOF updates
          setTempPoint(null);
          setTempStartPoint(null);
          console.log("Added sketch slot");
        }
      } else if (type === "move") {
        // Preview
        if (tempPoint()) {
          const c1 = tempPoint()!;
          // If we have c2 (tempStartPoint), we are defining radius
          // If not, we are defining c2

          let c2: [number, number] = effectivePoint;
          let radius = 0.5;

          if (tempStartPoint()) {
            c2 = tempStartPoint()!;
            const dx = c2[0] - c1[0];
            const dy = c2[1] - c1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const dist = Math.abs((effectivePoint[0] - c1[0]) * nx + (effectivePoint[1] - c1[1]) * ny);
            radius = dist > 0.001 ? dist : 0.5;
          } else {
            // Just defining length, default radius
          }

          const dx = c2[0] - c1[0];
          const dy = c2[1] - c1[1];
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 0.001) return;

          const nx = -dy / len;
          const ny = dx / len;
          const angle = Math.atan2(dy, dx);

          // Arc 1 (C1): Left Bulge (+90 -> +270)
          const a1_start = angle + Math.PI / 2;
          const a1_end = angle + Math.PI / 2 + Math.PI;

          // Arc 2 (C2): Right Bulge (-90 -> +90)
          const a2_start = angle - Math.PI / 2;
          const a2_end = angle + Math.PI / 2;

          // Endpoints
          const p_a1_top = [c1[0] + radius * nx, c1[1] + radius * ny];
          const p_a1_btm = [c1[0] - radius * nx, c1[1] - radius * ny];
          const p_a2_top = [c2[0] + radius * nx, c2[1] + radius * ny];
          const p_a2_btm = [c2[0] - radius * nx, c2[1] - radius * ny];

          const a1: SketchEntity = { id: "preview_slot_a1", geometry: { Arc: { center: c1, radius, start_angle: a1_start, end_angle: a1_end } } };
          const a2: SketchEntity = { id: "preview_slot_a2", geometry: { Arc: { center: c2 as [number, number], radius, start_angle: a2_start, end_angle: a2_end } } };
          const l1: SketchEntity = { id: "preview_slot_l1", geometry: { Line: { start: p_a1_top as [number, number], end: p_a2_top as [number, number] } } };
          const l2: SketchEntity = { id: "preview_slot_l2", geometry: { Line: { start: p_a1_btm as [number, number], end: p_a2_btm as [number, number] } } };

          const entities = currentSketch().entities.filter(e => !e.id.startsWith("preview_slot"));
          setCurrentSketch({ ...currentSketch(), entities: [...entities, a1, a2, l1, l2] });
        }
      }
    } else if (sketchTool() === "polygon") {
      if (type === "click") {
        if (!tempPoint()) {
          // Click 1: Center
          setTempPoint(effectivePoint);
        } else {
          // Click 2: Vertex
          const center = tempPoint()!;
          const vertex = effectivePoint;
          const radius = Math.sqrt(Math.pow(vertex[0] - center[0], 2) + Math.pow(vertex[1] - center[1], 2));
          const startAngle = Math.atan2(vertex[1] - center[1], vertex[0] - center[0]);

          if (radius > 0.001) {
            const numSides = 6;
            const perimeterIds: string[] = [];
            const spokeIds: string[] = [];
            const entities: SketchEntity[] = [];
            const constraints: any[] = [];

            const vertices: [number, number][] = [];

            for (let i = 0; i < numSides; i++) {
              const angle = startAngle + (i * 2 * Math.PI / numSides);
              vertices.push([
                center[0] + radius * Math.cos(angle),
                center[1] + radius * Math.sin(angle)
              ]);
            }

            // Generate Spokes (Center -> Vertex)
            for (let i = 0; i < numSides; i++) {
              const id = crypto.randomUUID();
              spokeIds.push(id);
              entities.push({
                id: id,
                geometry: { Line: { start: center, end: vertices[i] } },
                is_construction: true
              });
            }

            // Generate Perimeter (Vertex -> Vertex)
            for (let i = 0; i < numSides; i++) {
              const id = crypto.randomUUID();
              perimeterIds.push(id);
              const next = (i + 1) % numSides;
              entities.push({
                id: id,
                geometry: { Line: { start: vertices[i], end: vertices[next] } },
                is_construction: constructionMode()
              });
            }

            // Constraints
            // 1. Equal length for all spokes
            // const spokeEqual: any = { Equal: { entities: [spokeIds[0], spokeIds[1]] } };
            // To chain equal: 0=1, 1=2, 2=3 ... or just pair them all
            // For now, let's just make a chain: 0-1, 1-2, 2-3...
            // Or simpler: just pair (0, i)
            for (let i = 1; i < numSides; i++) {
              constraints.push({ Equal: { entities: [spokeIds[0], spokeIds[i]] } });
            }

            // 2. Equal length for all perimeter lines
            for (let i = 1; i < numSides; i++) {
              constraints.push({ Equal: { entities: [perimeterIds[0], perimeterIds[i]] } });
            }

            // 3. Coincident connections
            // Center is coincident for all spokes starts
            // Vertices: Spoke End == Perimeter Start == Prev Perimeter End

            // We generated them with explicit coordinates, but need constraints for solver
            // Center:
            for (let i = 1; i < numSides; i++) {
              constraints.push({ Coincident: { points: [{ id: spokeIds[0], index: 0 }, { id: spokeIds[i], index: 0 }] } });
            }

            // Vertices
            for (let i = 0; i < numSides; i++) {
              const spokeId = spokeIds[i];
              const permId = perimeterIds[i];
              const prevPermId = perimeterIds[(i - 1 + numSides) % numSides];

              // Spoke End -> Perimeter Start
              constraints.push({ Coincident: { points: [{ id: spokeId, index: 1 }, { id: permId, index: 0 }] } });

              // Prev Perimeter End -> Perimeter Start
              constraints.push({ Coincident: { points: [{ id: prevPermId, index: 1 }, { id: permId, index: 0 }] } });
            }

            const updated = { ...currentSketch() };
            updated.entities = updated.entities.filter(e => !e.id.startsWith("preview_poly"));
            updated.entities = [...updated.entities, ...entities];
            updated.constraints = [...updated.constraints, ...constraints.map(c => wrapConstraint(c))];

            setCurrentSketch(updated);
            sendSketchUpdate(updated); // Sync to backend for live DOF updates
            setTempPoint(null);
            console.log("Added sketch polygon");
          }
        }
      } else if (type === "move") {
        if (tempPoint()) {
          const center = tempPoint()!;
          const vertex = effectivePoint;
          const radius = Math.sqrt(Math.pow(vertex[0] - center[0], 2) + Math.pow(vertex[1] - center[1], 2));
          const startAngle = Math.atan2(vertex[1] - center[1], vertex[0] - center[0]);

          if (radius > 0.001) {
            const numSides = 6;
            const vertices: [number, number][] = [];
            for (let i = 0; i < numSides; i++) {
              const angle = startAngle + (i * 2 * Math.PI / numSides);
              vertices.push([
                center[0] + radius * Math.cos(angle),
                center[1] + radius * Math.sin(angle)
              ]);
            }

            const entities: SketchEntity[] = [];

            // Spokes
            for (let i = 0; i < numSides; i++) {
              entities.push({
                id: `preview_poly_s_${i}`,
                geometry: { Line: { start: center, end: vertices[i] } },
                is_construction: true
              });
            }

            // Perimeter
            for (let i = 0; i < numSides; i++) {
              const next = (i + 1) % numSides;
              entities.push({
                id: `preview_poly_p_${i}`,
                geometry: { Line: { start: vertices[i], end: vertices[next] } },
                is_construction: constructionMode()
              });
            }

            const existing = currentSketch().entities.filter(e => !e.id.startsWith("preview_poly"));
            setCurrentSketch({ ...currentSketch(), entities: [...existing, ...entities] });
          }
        }
      }
    }

    // ===== CONSTRAINT TOOLS =====

    // Helper: Find closest entity to a point (for line selection)
    const findClosestLine = (px: number, py: number): SketchEntity | null => {
      const sketch = currentSketch();
      let closest: SketchEntity | null = null;
      let minDist = Infinity;

      for (const entity of sketch.entities) {
        if (entity.id.startsWith("preview_")) continue;

        if (entity.geometry.Line) {
          const { start, end } = entity.geometry.Line;
          // Distance from point to line segment
          const dx = end[0] - start[0];
          const dy = end[1] - start[1];
          const len2 = dx * dx + dy * dy;

          let t = len2 > 0 ? ((px - start[0]) * dx + (py - start[1]) * dy) / len2 : 0;
          t = Math.max(0, Math.min(1, t));

          const closestX = start[0] + t * dx;
          const closestY = start[1] + t * dy;
          const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

          if (dist < minDist) {
            minDist = dist;
            closest = entity;
          }
        }
      }

      return minDist < 2.0 ? closest : null; // 2.0 unit threshold
    };

    // Helper: Find closest constraint point (endpoint/center)
    const findClosestPoint = (px: number, py: number): ConstraintPoint | null => {
      const sketch = currentSketch();
      let closest: ConstraintPoint | null = null;
      let minDist = Infinity;

      for (const entity of sketch.entities) {
        if (entity.id.startsWith("preview_")) continue;

        const points: { pos: [number, number], index: number }[] = [];

        if (entity.geometry.Line) {
          points.push({ pos: entity.geometry.Line.start, index: 0 });
          points.push({ pos: entity.geometry.Line.end, index: 1 });
        } else if (entity.geometry.Circle) {
          points.push({ pos: entity.geometry.Circle.center, index: 0 });
        } else if (entity.geometry.Arc) {
          const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
          points.push({ pos: center, index: 0 });
          points.push({ pos: [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)], index: 1 });
          points.push({ pos: [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)], index: 2 });
        }

        for (const { pos, index } of points) {
          const dist = Math.sqrt((px - pos[0]) ** 2 + (py - pos[1]) ** 2);
          if (dist < minDist) {
            minDist = dist;
            closest = { id: entity.id, index };
          }
        }
      }

      return minDist < 1.5 ? closest : null; // 1.5 unit threshold
    };

    // Helper: Get the actual position for a ConstraintPoint
    const getPointPosition = (cp: ConstraintPoint): [number, number] | null => {
      if (cp.id === "00000000-0000-0000-0000-000000000000") return [0, 0];
      const sketch = currentSketch();
      const entity = sketch.entities.find(e => e.id === cp.id);
      if (!entity) return null;

      if (entity.geometry.Line) {
        return cp.index === 0 ? entity.geometry.Line.start : entity.geometry.Line.end;
      } else if (entity.geometry.Circle) {
        return entity.geometry.Circle.center;
      } else if (entity.geometry.Arc) {
        const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
        if (cp.index === 0) return center;
        if (cp.index === 1) return [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)];
        if (cp.index === 2) return [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)];
      } else if (entity.geometry.Point) {
        return entity.geometry.Point.pos;
      }
      return null;
    };

    // Horizontal Constraint: Click on a line
    if (sketchTool() === "constraint_horizontal") {
      if (type === "click") {
        const line = findClosestLine(point[0], point[1]);
        if (line && line.geometry.Line) {
          const constraint: SketchConstraint = { Horizontal: { entity: line.id } };
          const updated = { ...currentSketch() };
          updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
          setCurrentSketch(updated);
          console.log("Added Horizontal constraint to:", line.id);
          setSketchTool("select"); // Return to select tool after applying
        }
      }
    }

    // Vertical Constraint: Click on a line
    if (sketchTool() === "constraint_vertical") {
      if (type === "click") {
        const line = findClosestLine(point[0], point[1]);
        if (line && line.geometry.Line) {
          const constraint: SketchConstraint = { Vertical: { entity: line.id } };
          const updated = { ...currentSketch() };
          updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
          setCurrentSketch(updated);
          console.log("Added Vertical constraint to:", line.id);
          setSketchTool("select");
        }
      }
    }

    // Coincident Constraint: Click on two points
    if (sketchTool() === "constraint_coincident") {
      if (type === "click") {
        const pt = findClosestPoint(point[0], point[1]);
        if (pt) {
          const current = constraintSelection();
          if (current.length === 0) {
            // First point selected
            setConstraintSelection([pt]);
            console.log("Coincident: First point selected:", pt);
          } else if (current.length === 1) {
            // Second point selected - don't allow same point
            if (current[0].id !== pt.id || current[0].index !== pt.index) {
              const constraint: SketchConstraint = {
                Coincident: { points: [current[0], pt] }
              };
              const updated = { ...currentSketch() };
              updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
              setCurrentSketch(updated);
              console.log("Added Coincident constraint:", current[0], "->", pt);
              setConstraintSelection([]);
              setSketchTool("select");
            }
          }
        }
      }
    }

    // Parallel Constraint: Click on two lines
    if (sketchTool() === "constraint_parallel") {
      if (type === "click") {
        const line = findClosestLine(point[0], point[1]);
        if (line && line.geometry.Line) {
          const current = constraintSelection();
          if (current.length === 0) {
            // First line - store as ConstraintPoint with index=0 (just using id)
            setConstraintSelection([{ id: line.id, index: 0 }]);
            console.log("Parallel: First line selected:", line.id);
          } else if (current.length === 1 && current[0].id !== line.id) {
            const constraint: SketchConstraint = {
              Parallel: { lines: [current[0].id, line.id] }
            };
            const updated = { ...currentSketch() };
            updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
            setCurrentSketch(updated);
            console.log("Added Parallel constraint:", current[0].id, "||", line.id);
            setConstraintSelection([]);
            setSketchTool("select");
          }
        }
      }
    }

    // Perpendicular Constraint: Click on two lines
    if (sketchTool() === "constraint_perpendicular") {
      if (type === "click") {
        const line = findClosestLine(point[0], point[1]);
        if (line && line.geometry.Line) {
          const current = constraintSelection();
          if (current.length === 0) {
            setConstraintSelection([{ id: line.id, index: 0 }]);
            console.log("Perpendicular: First line selected:", line.id);
          } else if (current.length === 1 && current[0].id !== line.id) {
            const constraint: SketchConstraint = {
              Perpendicular: { lines: [current[0].id, line.id] }
            };
            const updated = { ...currentSketch() };
            updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
            setCurrentSketch(updated);
            console.log("Added Perpendicular constraint:", current[0].id, "⊥", line.id);
            setConstraintSelection([]);
            setSketchTool("select");
          }
        }
      }
    }

    // Equal Constraint: Click on two lines (or circles/arcs for radius)
    if (sketchTool() === "constraint_equal") {
      if (type === "click") {
        // Find closest entity (line or circle)
        const line = findClosestLine(point[0], point[1]);
        // TODO: Could also check for circles here

        if (line) {
          const current = constraintSelection();
          if (current.length === 0) {
            setConstraintSelection([{ id: line.id, index: 0 }]);
            console.log("Equal: First entity selected:", line.id);
          } else if (current.length === 1 && current[0].id !== line.id) {
            const constraint: SketchConstraint = {
              Equal: { entities: [current[0].id, line.id] }
            };
            const updated = { ...currentSketch() };
            updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
            setCurrentSketch(updated);
            console.log("Added Equal constraint:", current[0].id, "=", line.id);
            setConstraintSelection([]);
            setSketchTool("select");
          }
        }
      }
    }

    // Fix Constraint: Click on a point
    if (sketchTool() === "constraint_fix") {
      if (type === "click") {
        const pt = findClosestPoint(effectivePoint[0], effectivePoint[1]);
        if (pt) {
          const pos = getPointPosition(pt);
          if (pos) {
            const constraint: SketchConstraint = {
              Fix: { point: pt, position: pos }
            };
            const updated = { ...currentSketch() };
            updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
            setCurrentSketch(updated);
            console.log("Added Fix constraint to:", pt.id, "at", pos);
            setSketchTool("select");
          }
        }
      }
    }

    // ===== UNIFIED DIMENSION TOOL (Multi-step) =====



    if (sketchTool() === "dimension") {
      console.log("[Dimension Tool] Handler reached, type:", type);
      if (type === "click") {
        console.log("[Dimension Tool] Click detected");
        const sketch = currentSketch();

        // Advanced Selection: Find generic candidates
        const findSelectionCandidate = (px: number, py: number): SelectionCandidate | null => {
          let best: SelectionCandidate | null = null;
          let minD = Infinity;
          const threshold = 0.5; // Snap radius for selection

          // 1. Check Origin
          const dOrigin = Math.sqrt(px * px + py * py);
          if (dOrigin < threshold && dOrigin < minD) {
            minD = dOrigin;
            best = { id: "00000000-0000-0000-0000-000000000000", type: "origin", position: [0, 0] };
          }

          // 2. Check Points (Endpoints, Centers)
          // We prioritize points over edges if close
          for (const e of sketch.entities) {
            if (e.id.startsWith("preview")) continue;

            if (e.geometry.Line) {
              const { start, end } = e.geometry.Line;
              const dStart = Math.sqrt((px - start[0]) ** 2 + (py - start[1]) ** 2);
              const dEnd = Math.sqrt((px - end[0]) ** 2 + (py - end[1]) ** 2);
              const ptThreshold = 0.25; // Tight threshold for point selection - allows body selection outside this

              if (dStart < ptThreshold && dStart < minD) {
                minD = dStart;
                best = { id: e.id, type: "point", index: 0, position: start };
              }
              if (dEnd < ptThreshold && dEnd < minD) {
                minD = dEnd;
                best = { id: e.id, type: "point", index: 1, position: end };
              }
            } else if (e.geometry.Circle) {
              const { center } = e.geometry.Circle;
              const dCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              if (dCenter < threshold && dCenter < minD) {
                minD = dCenter;
                best = { id: e.id, type: "point", index: 0, position: center };
              }
            } else if (e.geometry.Arc) {
              const { center } = e.geometry.Arc;
              const dCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              if (dCenter < threshold && dCenter < minD) {
                minD = dCenter;
                best = { id: e.id, type: "point", index: 0, position: center };
              }
              // Arc endpoints? maybe later
            }
          }

          if (best && minD < 0.15) return best; // High priority return for very close point matches only

          // 3. Check Bodies (if no point matched well)
          for (const e of sketch.entities) {
            if (e.id.startsWith("preview")) continue;
            let d = Infinity;
            if (e.geometry.Line) {
              // distances
              const { start, end } = e.geometry.Line;
              const l2 = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
              if (l2 === 0) d = Math.sqrt((px - start[0]) ** 2 + (py - start[1]) ** 2);
              else {
                let t = ((px - start[0]) * (end[0] - start[0]) + (py - start[1]) * (end[1] - start[1])) / l2;
                t = Math.max(0, Math.min(1, t));
                d = Math.sqrt((px - (start[0] + t * (end[0] - start[0]))) ** 2 + (py - (start[1] + t * (end[1] - start[1]))) ** 2);
              }
            } else if (e.geometry.Circle) {
              const { center, radius } = e.geometry.Circle;
              const distCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              d = Math.abs(distCenter - radius);
            } else if (e.geometry.Arc) {
              const { center, radius } = e.geometry.Arc;
              const distCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              d = Math.abs(distCenter - radius);
            } else if (e.geometry.Point) {
              const { pos } = e.geometry.Point;
              d = Math.sqrt((px - pos[0]) ** 2 + (py - pos[1]) ** 2);
            }

            if (d < 0.5 && d < minD) {
              minD = d;
              best = { id: e.id, type: e.geometry.Point ? "point" : "entity", position: e.geometry.Point?.pos };
            }
          }

          return best;
        };

        const hit = findSelectionCandidate(effectivePoint[0], effectivePoint[1]);

        // PRIORITY: If in placement mode AND clicking AWAY from entities, finish placement
        // But if clicking ON an entity and we can still add more selections, add the selection instead
        const canAddMoreSelections = dimensionSelection().length < 2;
        const shouldFinishPlacement = dimensionPlacementMode() && dimensionProposedAction()?.isValid && (!hit || !canAddMoreSelections);

        if (shouldFinishPlacement) {
          // Calculate offset based on click and finish
          const action = dimensionProposedAction()!;
          const sel = dimensionSelection();
          const sketch = currentSketch();
          let offset: [number, number] = [0, 1.0]; // Default

          // Logic to compute offset from click point (px, py)
          const px = effectivePoint[0];
          const py = effectivePoint[1];

          // Re-derive geometry to compute offset
          if ((action.type === "Distance" || action.type === "HorizontalDistance" || action.type === "VerticalDistance") && sel.length === 2) {
            const getPos = (c: SelectionCandidate) => {
              if (c.type === "origin") return [0, 0];
              if (c.type === "point") return c.position;
              if (c.type === "entity") {
                const e = sketch.entities.find(ent => ent.id === c.id);
                if (e?.geometry.Line) return e.geometry.Line.start;
                if (e?.geometry.Circle) return e.geometry.Circle.center;
                if (e?.geometry.Arc) return e.geometry.Arc.center;
              }
              return [0, 0];
            };
            const p1 = getPos(sel[0]);
            const p2 = getPos(sel[1]);

            if (p1 && p2) {
              let dx = p2[0] - p1[0];
              let dy = p2[1] - p1[1];
              if (action.type === "HorizontalDistance") {
                // For horizontal, measure dx only? No, constraint is dx, but offset is usually perpendicular
                // Viewport logic: Ext lines vertical, Dim line horizontal
                // dimLine is at Y. offset[1] controls Y relative to p1/p2?
                // Standard Distance logic projects click onto normal.
                // For Horizontal: normal is (0, 1) or (0, -1).
                // Let's rely on standard logic but maybe simplify?
                // Actually standard logic works if we consider the 'vector' is diagonal but we project onto normal.
                // But wait, the standard logic computes 'len' as diagonal.
                // If we use standard diagonal math, it will produce a diagonal offset.
                // For Horizontal/Vertical, we probably want strictly orthogonal offsets?
                // Let's stick to standard logic for now to avoid breaking it, as it projects onto the line-normal.
                // Wait, if it's Horizontal, the 'line' is virtual horizontal line? No.
                // It's distance between two points.
                // If I want a horizontal dimension, the text should be above/below.
                // Let's just use the diagonal math for now.
              }

              let len = Math.sqrt(dx * dx + dy * dy);
              if (len < 0.001) { dx = 1; dy = 0; len = 1; }
              const nx = dx / len;
              const ny = dy / len;
              const perpx = -ny;
              const perpy = nx;
              const vx = px - p1[0];
              const vy = py - p1[1];
              const para = vx * nx + vy * ny;
              const perp = vx * perpx + vy * perpy;
              offset = [para - len / 2, perp - 1.0];
            }
          } else if (action.type === "Length" && sel.length === 1) {
            // Line length dimension
            const c = sel[0];
            if (c.type === "entity") {
              const e = sketch.entities.find(ent => ent.id === c.id);
              if (e?.geometry.Line) {
                const { start, end } = e.geometry.Line;
                let dx = end[0] - start[0];
                let dy = end[1] - start[1];
                let len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.001) { dx = 1; dy = 0; len = 1; }
                const nx = dx / len;
                const ny = dy / len;
                const perpx = -ny;
                const perpy = nx;
                const vx = px - start[0];
                const vy = py - start[1];
                const para = vx * nx + vy * ny;
                const perp = vx * perpx + vy * perpy;
                offset = [para - len / 2, perp - 1.0];
              }
            }
          } else if (action.type === "Radius") {
            const c = sel[0];
            let center = [0, 0];
            if (c.type === "entity") {
              const e = sketch.entities.find(ent => ent.id === c.id);
              if (e?.geometry.Circle) center = e.geometry.Circle.center;
              else if (e?.geometry.Arc) center = e.geometry.Arc.center;
            }
            const dist = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
            offset = [0, dist - (action.value || 0)];
          }

          handleDimensionFinish(offset);
          return; // Early return - placement done, don't try to select more
        }

        console.log("[Dimension Tool] Hit found:", hit, "Current selection count:", dimensionSelection().length);

        if (hit) {
          // Add hit to dimension selection (accumulate up to 2 selections)
          const current = dimensionSelection();
          if (current.length < 2) {
            console.log("[Dimension Tool] Adding hit to dimensionSelection");
            setDimensionSelection([...current, hit]);
            // Note: dimensionProposedAction will be computed in the move handler based on selection
          } else {
            console.log("[Dimension Tool] Already have 2 selections, ignoring hit");
          }
          return; // Selection added, don't fall through
        } else {
          // No hit - check if we are in placement mode
          if (dimensionPlacementMode()) {
            // Update dimension type based on cursor position relative to selection bbox
            const action = dimensionProposedAction();
            const selections = dimensionSelection();

            // Point-Point or Line (endpoints) Inference
            if (selections.length === 2 &&
              ((selections[0].type === 'point' || selections[0].type === 'origin' || selections[0].type === 'entity') &&
                (selections[1].type === 'point' || selections[1].type === 'origin' || selections[1].type === 'entity'))) {
              // This covers Point-Point and also Line endpoints if we treat Line selection as 2 points in analyze
              // Actually analyze already set up the action. We just need to modify the TYPE and VALUE.

              // Re-calculate positions to be sure
              const getPos = (c: SelectionCandidate) => getCandidatePosition(c, currentSketch());
              const p1 = getPos(selections[0]);
              const p2 = getPos(selections[1]);

              if (p1 && p2) {
                const dx = Math.abs(p1[0] - p2[0]);
                const dy = Math.abs(p1[1] - p2[1]);

                // Mouse position in sketch space
                const mx = effectivePoint[0];
                const my = effectivePoint[1];

                // Bounding box of the two points
                const minX = Math.min(p1[0], p2[0]);
                const maxX = Math.max(p1[0], p2[0]);
                const minY = Math.min(p1[1], p2[1]);
                const maxY = Math.max(p1[1], p2[1]);

                // Inference Logic
                // If mouse is strictly within X range (with padding) -> Vertical Dimension
                // If mouse is strictly within Y range (with padding) -> Horizontal Dimension
                // Else -> Aligned / True Distance

                let newType: "Distance" | "HorizontalDistance" | "VerticalDistance" = "Distance";
                let label = "";
                let val = 0;

                // Relaxed zones slightly outside the bbox
                const buffer = 0.5; // units

                const inXBand = mx >= minX - buffer && mx <= maxX + buffer;
                const inYBand = my >= minY - buffer && my <= maxY + buffer;

                if (inXBand && !inYBand) {
                  // Above or Below -> Measure Horizontal Distance (width)
                  newType = "HorizontalDistance";
                  val = dx;
                  label = `Horizontal (${val.toFixed(2)})`;
                } else if (inYBand && !inXBand) {
                  // Left or Right -> Measure Vertical Distance (height)
                  newType = "VerticalDistance";
                  val = dy;
                  label = `Vertical (${val.toFixed(2)})`;
                } else {
                  // Diagonal / Free Zone
                  newType = "Distance";
                  val = Math.sqrt(dx * dx + dy * dy);
                  label = `Distance (${val.toFixed(2)})`;
                }

                // Only update if changed to avoid unnecessary renders, though solid signals handle equality check
                setDimensionProposedAction({
                  ...action!,
                  type: newType,
                  label: label,
                  value: val
                });
              }
            } else if (selections.length === 1 && selections[0].type === 'entity') {
              // Line Selection -> Treat like 2 points (endpoints)
              const sk = currentSketch();
              const ent = sk.entities.find(e => e.id === selections[0].id);
              if (ent && ent.geometry.Line) {
                const l = ent.geometry.Line;
                const p1 = l.start;
                const p2 = l.end;

                const dx = Math.abs(p1[0] - p2[0]);
                const dy = Math.abs(p1[1] - p2[1]);

                const mx = effectivePoint[0];
                const my = effectivePoint[1];
                const minX = Math.min(p1[0], p2[0]);
                const maxX = Math.max(p1[0], p2[0]);
                const minY = Math.min(p1[1], p2[1]);
                const maxY = Math.max(p1[1], p2[1]);
                const buffer = 0.5;

                const inXBand = mx >= minX - buffer && mx <= maxX + buffer;
                const inYBand = my >= minY - buffer && my <= maxY + buffer;

                let newType: "Length" | "HorizontalDistance" | "VerticalDistance" = "Length";
                let label = "";
                let val = 0;

                if (inXBand && !inYBand) {
                  // Above/Below -> Horizontal
                  newType = "HorizontalDistance";
                  val = dx;
                  label = `Horizontal (${val.toFixed(2)})`;
                } else if (inYBand && !inXBand) {
                  // Left/Right -> Vertical
                  newType = "VerticalDistance";
                  val = dy;
                  label = `Vertical (${val.toFixed(2)})`;
                } else {
                  newType = "Length";
                  val = Math.sqrt(dx * dx + dy * dy);
                  label = `Length (${val.toFixed(2)})`;
                }

                setDimensionProposedAction({
                  ...action!,
                  type: newType,
                  label: label,
                  value: val
                });
              }
            }
          }
          if (dimensionPlacementMode() && dimensionProposedAction()?.isValid) {
            // Calculate offset based on click and finish
            const action = dimensionProposedAction()!;
            const sel = dimensionSelection();
            const sketch = currentSketch();
            let offset: [number, number] = [0, 1.0]; // Default

            // Logic to compute offset from click point (px, py)
            const px = effectivePoint[0];
            const py = effectivePoint[1];

            // Re-derive geometry to compute offset
            // TODO: Consolidate this geometry logic
            if (action.type === "Distance" && sel.length === 2) {
              // Get points
              const getPos = (c: SelectionCandidate) => {
                if (c.type === "origin") return [0, 0];
                if (c.type === "point") return c.position;
                if (c.type === "entity") {
                  const e = sketch.entities.find(ent => ent.id === c.id);
                  if (e?.geometry.Line) return e.geometry.Line.start;
                  if (e?.geometry.Circle) return e.geometry.Circle.center;
                  if (e?.geometry.Arc) return e.geometry.Arc.center;
                }
                return [0, 0];
              };
              const p1 = getPos(sel[0]);
              const p2 = getPos(sel[1]); // Or construct if Line-Point

              if (p1 && p2) {
                let dx = p2[0] - p1[0];
                let dy = p2[1] - p1[1];
                let len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.001) { dx = 1; dy = 0; len = 1; }
                const nx = dx / len;
                const ny = dy / len;

                // Determine Normal (Perpendicular) vector
                // Match Viewport logic:
                const perpx = -ny;
                const perpy = nx;

                // Project vector (Click - P1) onto axis and normal
                const vx = px - p1[0];
                const vy = py - p1[1];

                const para = vx * nx + vy * ny;
                const perp = vx * perpx + vy * perpy;

                // offset[0] = parallel shift? No, for Distance constraint style:
                // offset[0] is usually parallel shift, offset[1] is perpendicular distance.
                // Viewport logic: offsetDist = 1.0 + style.offset[1].
                // So offset[1] = perp - 1.0 (roughly, assuming sign matches).
                // Ideally we want the dimension line to pass through the click point.
                // Dimensions are drawn away from the line p1-p2.
                // If perp is negative, it draws on other side?
                // Let's set offset[1] = perp - 1.0. (Since default is 1.0 padding)
                // Actually let's just use raw perp distance if style supports it directly.
                // The style.offset is added to base.
                // Let's set offset[1] = perp - 1.0.

                // offset[0]: parallel slide.
                // Center of dimension is at midpoint + offset[0]*axis.
                // Midpoint is len/2.
                // We want Center to be at 'para'.
                // So len/2 + offset[0] = para
                // offset[0] = para - len/2.

                offset = [para - len / 2, perp - 1.0];
              }
            } else if (action.type === "Radius") {
              // For radius, offset[1] is angle, offset[0] is radius extension or unused?
              // Viewport logic: radiusOffset = offset[1].
              // Actually radius text is placed at... ?
              // Viewport Radius:
              //  textPos = center + (radius + offset[1]) * dirVector.
              // So we calculate distance from center to click, subtract radius.

              const c = sel[0];
              let center = [0, 0];
              if (c.type === "entity") {
                const e = sketch.entities.find(ent => ent.id === c.id);
                if (e?.geometry.Circle) center = e.geometry.Circle.center;
                else if (e?.geometry.Arc) center = e.geometry.Arc.center;
              }
              const dist = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              // Wait, Viewport Radius logic used offset[1] for radius offset?
              // Line 1100+: `const textPos = leaderEnd`.
              // `leaderEnd = center + (radius + offset[1]) * direction`?
              // Actually logic was implicit in previous Viewport code reading.
              // Let's assume offset[1] = dist - radius.
              // And offset[0] for angle? Or angle driven by placement?
              // Radius constraints usually don't store angle in offset, they just display near entity.
              // But dragging changes offset[1] for radius in Viewport (Line 1372: startOffset[1] + deltaAngle?? No that was line 1362: Radius offset[1] is Angle??)
              // Let's check Viewport logic again later.
              // For now, Angle seems most important.
              offset = [0, dist - (action.value || 0)];
            }

            handleDimensionFinish(offset);
          }
        }
      }
      return; // Don't fall through to other tool handlers
    }


    // ===== MEASURE TOOL (Non-driving, temporary) =====
    // Similar to dimension tool but creates temporary measurements that don't affect constraints
    console.log("[DEBUG Before Measure Handler] sketchTool():", sketchTool(), "type:", type);
    if (sketchTool() === "measure") {
      console.log("[Measure Tool] Handler reached, type:", type);
      if (type === "click") {
        console.log("[Measure Tool] Click detected");
        const sketch = currentSketch();

        // Find selection candidate at click position (reuse dimension logic)
        const findMeasureCandidate = (px: number, py: number): SelectionCandidate | null => {
          let best: SelectionCandidate | null = null;
          let minD = Infinity;
          const threshold = 0.5;

          // Check Origin
          const dOrigin = Math.sqrt(px * px + py * py);
          if (dOrigin < threshold && dOrigin < minD) {
            minD = dOrigin;
            best = { id: "00000000-0000-0000-0000-000000000000", type: "origin", position: [0, 0] };
          }

          // Check Points (Endpoints, Centers)
          for (const e of sketch.entities) {
            if (e.id.startsWith("preview")) continue;

            if (e.geometry.Line) {
              const { start, end } = e.geometry.Line;
              const dStart = Math.sqrt((px - start[0]) ** 2 + (py - start[1]) ** 2);
              const dEnd = Math.sqrt((px - end[0]) ** 2 + (py - end[1]) ** 2);
              const ptThreshold = 0.25;

              if (dStart < ptThreshold && dStart < minD) {
                minD = dStart;
                best = { id: e.id, type: "point", index: 0, position: start };
              }
              if (dEnd < ptThreshold && dEnd < minD) {
                minD = dEnd;
                best = { id: e.id, type: "point", index: 1, position: end };
              }
            } else if (e.geometry.Circle) {
              const { center } = e.geometry.Circle;
              const dCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              if (dCenter < threshold && dCenter < minD) {
                minD = dCenter;
                best = { id: e.id, type: "point", index: 0, position: center };
              }
            } else if (e.geometry.Arc) {
              const { center } = e.geometry.Arc;
              const dCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              if (dCenter < threshold && dCenter < minD) {
                minD = dCenter;
                best = { id: e.id, type: "point", index: 0, position: center };
              }
            } else if (e.geometry.Point) {
              const { pos } = e.geometry.Point;
              const d = Math.sqrt((px - pos[0]) ** 2 + (py - pos[1]) ** 2);
              if (d < threshold && d < minD) {
                minD = d;
                best = { id: e.id, type: "point", index: 0, position: pos };
              }
            }
          }

          if (best && minD < 0.15) return best;

          // Check Bodies (lines, circles, arcs)
          for (const e of sketch.entities) {
            if (e.id.startsWith("preview")) continue;
            let d = Infinity;

            if (e.geometry.Line) {
              const { start, end } = e.geometry.Line;
              const l2 = (end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2;
              if (l2 === 0) d = Math.sqrt((px - start[0]) ** 2 + (py - start[1]) ** 2);
              else {
                let t = ((px - start[0]) * (end[0] - start[0]) + (py - start[1]) * (end[1] - start[1])) / l2;
                t = Math.max(0, Math.min(1, t));
                d = Math.sqrt((px - (start[0] + t * (end[0] - start[0]))) ** 2 + (py - (start[1] + t * (end[1] - start[1]))) ** 2);
              }
            } else if (e.geometry.Circle) {
              const { center, radius } = e.geometry.Circle;
              const distCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              d = Math.abs(distCenter - radius);
            } else if (e.geometry.Arc) {
              const { center, radius } = e.geometry.Arc;
              const distCenter = Math.sqrt((px - center[0]) ** 2 + (py - center[1]) ** 2);
              d = Math.abs(distCenter - radius);
            }

            if (d < 0.5 && d < minD) {
              minD = d;
              best = { id: e.id, type: "entity" };
            }
          }

          return best;
        };

        const hit = findMeasureCandidate(effectivePoint[0], effectivePoint[1]);

        if (hit) {
          const pending = measurementPending();

          if (!pending) {
            // First selection - store and wait for second
            setMeasurementPending(hit);
            setMeasurementSelection([hit]);
            console.log("[Measure] First selection:", hit.id, hit.type);
          } else {
            // Second selection - calculate measurement and display
            const measurement = calculateMeasurement(pending, hit);

            if (measurement && measurement.result && !('Error' in measurement.result)) {
              // Add to active measurements list
              setActiveMeasurements(prev => [...prev, measurement]);
              console.log("[Measure] Created measurement:", measurement);
            }

            // Reset pending state for next measurement
            setMeasurementPending(null);
            setMeasurementSelection([]);
          }
        } else {
          // Clicked on empty space - clear pending if any
          if (measurementPending()) {
            setMeasurementPending(null);
            setMeasurementSelection([]);
            console.log("[Measure] Cleared pending selection");
          }
        }
      }
      return; // Don't fall through to other tool handlers
    }


    // ===== TRIM TOOL =====
    if (sketchTool() === "trim") {
      if (type === "click") {
        const clickX = point[0];
        const clickY = point[1];
        const sketch = currentSketch();

        // Find the closest line to click point
        const closestLine = findClosestLine(clickX, clickY);
        if (!closestLine || !closestLine.geometry.Line) {
          console.log("Trim: No line found near click");
          return;
        }

        const targetLine = closestLine.geometry.Line;
        const targetId = closestLine.id;

        // Find all intersections with other lines
        const intersections: { point: [number, number], t: number }[] = [];

        for (const entity of sketch.entities) {
          if (entity.id === targetId) continue;
          if (entity.id.startsWith("preview_")) continue;
          if (!entity.geometry.Line) continue;

          const otherLine = entity.geometry.Line;

          // Line-line intersection calculation
          const d1x = targetLine.end[0] - targetLine.start[0];
          const d1y = targetLine.end[1] - targetLine.start[1];
          const d2x = otherLine.end[0] - otherLine.start[0];
          const d2y = otherLine.end[1] - otherLine.start[1];

          const cross = d1x * d2y - d1y * d2x;
          if (Math.abs(cross) < 1e-10) continue; // Parallel

          const dx = otherLine.start[0] - targetLine.start[0];
          const dy = otherLine.start[1] - targetLine.start[1];

          const t = (dx * d2y - dy * d2x) / cross;
          const s = (dx * d1y - dy * d1x) / cross;

          // Check if intersection is within both segments
          if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
            const ix = targetLine.start[0] + t * d1x;
            const iy = targetLine.start[1] + t * d1y;
            intersections.push({ point: [ix, iy], t });
          }
        }

        if (intersections.length === 0) {
          console.log("Trim: No intersections found for this line");
          return;
        }

        // Find parameter t of click point on the target line
        const dx = targetLine.end[0] - targetLine.start[0];
        const dy = targetLine.end[1] - targetLine.start[1];
        const lenSq = dx * dx + dy * dy;
        const clickT = lenSq > 0
          ? ((clickX - targetLine.start[0]) * dx + (clickY - targetLine.start[1]) * dy) / lenSq
          : 0;

        // Find nearest intersection on each side of click
        let leftT = 0; // Start of line
        let rightT = 1; // End of line

        for (const inter of intersections) {
          if (inter.t < clickT && inter.t > leftT) {
            leftT = inter.t;
          }
          if (inter.t > clickT && inter.t < rightT) {
            rightT = inter.t;
          }
        }

        // Determine which part to keep based on click position
        // Remove the segment between leftT and rightT (where click is)
        // This means we either keep start->leftT or rightT->end

        // For simplicity: trim the clicked side
        // If click is closer to start, remove start->nearestIntersection
        // If click is closer to end, remove nearestIntersection->end

        let newStart = targetLine.start;
        let newEnd = targetLine.end;

        if (clickT < 0.5) {
          // Click is closer to start - keep the end portion
          newStart = [
            targetLine.start[0] + leftT * dx,
            targetLine.start[1] + leftT * dy
          ] as [number, number];
          if (leftT === 0) {
            // No intersection before click, try right side
            newStart = [
              targetLine.start[0] + rightT * dx,
              targetLine.start[1] + rightT * dy
            ] as [number, number];
          }
        } else {
          // Click is closer to end - keep the start portion
          newEnd = [
            targetLine.start[0] + rightT * dx,
            targetLine.start[1] + rightT * dy
          ] as [number, number];
          if (rightT === 1) {
            // No intersection after click, try left side
            newEnd = [
              targetLine.start[0] + leftT * dx,
              targetLine.start[1] + leftT * dy
            ] as [number, number];
          }
        }

        // Update the entity
        const updatedEntities = sketch.entities.map(e => {
          if (e.id === targetId) {
            return {
              ...e,
              geometry: { Line: { start: newStart, end: newEnd } }
            };
          }
          return e;
        });

        setCurrentSketch({ ...sketch, entities: updatedEntities });
        console.log("Trimmed line", targetId, "new range:", newStart, "->", newEnd);
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
    const axisId = mirrorState().axis;
    const entitiesToMirror = mirrorState().entities;
    if (!axisId || entitiesToMirror.length === 0) return;

    const sketch = currentSketch();
    const axisEnt = sketch.entities.find(e => e.id === axisId);
    if (!axisEnt || !axisEnt.geometry.Line) return;

    const ae = axisEnt.geometry.Line;
    const reflect = (p: [number, number]): [number, number] => {
      const x1 = ae.start[0], y1 = ae.start[1];
      const x2 = ae.end[0], y2 = ae.end[1];
      const dx = x2 - x1, dy = y2 - y1;
      const a = (dx * dx - dy * dy) / (dx * dx + dy * dy);
      const b = 2 * dx * dy / (dx * dx + dy * dy);
      const x2_p = a * (p[0] - x1) + b * (p[1] - y1) + x1;
      const y2_p = b * (p[0] - x1) - a * (p[1] - y1) + y1;
      return [x2_p, y2_p];
    };

    const newEntities: SketchEntity[] = [];
    const newConstraints: SketchConstraint[] = [];

    entitiesToMirror.forEach(targetId => {
      const targetEnt = sketch.entities.find(e => e.id === targetId);
      if (!targetEnt) return;

      const newId = crypto.randomUUID();
      let newGeo: any = null;

      if (targetEnt.geometry.Point) {
        newGeo = { Point: { pos: reflect(targetEnt.geometry.Point.pos) } };
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
      } else if (targetEnt.geometry.Line) {
        const l = targetEnt.geometry.Line;
        newGeo = { Line: { start: reflect(l.start), end: reflect(l.end) } };
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 1 }, p2: { id: newId, index: 1 }, axis: axisId } });
      } else if (targetEnt.geometry.Circle) {
        const c = targetEnt.geometry.Circle;
        newGeo = { Circle: { center: reflect(c.center), radius: c.radius } };
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        newConstraints.push({ Equal: { entities: [targetId, newId] } });
      } else if (targetEnt.geometry.Arc) {
        const arc = targetEnt.geometry.Arc;
        const startP: [number, number] = [arc.center[0] + arc.radius * Math.cos(arc.start_angle), arc.center[1] + arc.radius * Math.sin(arc.start_angle)];
        const endP: [number, number] = [arc.center[0] + arc.radius * Math.cos(arc.end_angle), arc.center[1] + arc.radius * Math.sin(arc.end_angle)];

        const newC = reflect(arc.center);
        const newStart = reflect(startP);
        const newEnd = reflect(endP);

        const newStartAngle = Math.atan2(newStart[1] - newC[1], newStart[0] - newC[0]);
        const newEndAngle = Math.atan2(newEnd[1] - newC[1], newEnd[0] - newC[0]);

        newGeo = { Arc: { center: newC, radius: arc.radius, start_angle: newStartAngle, end_angle: newEndAngle } };
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 0 }, p2: { id: newId, index: 0 }, axis: axisId } });
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 1 }, p2: { id: newId, index: 1 }, axis: axisId } });
        newConstraints.push({ Symmetric: { p1: { id: targetId, index: 2 }, p2: { id: newId, index: 2 }, axis: axisId } });
      }

      if (newGeo) {
        newEntities.push({ id: newId, geometry: newGeo, is_construction: false });
      }
    });

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
          newGeo = { Arc: { center: rotate(arc.center, angle), radius: arc.radius, start_angle: arc.start_angle + angle, end_angle: arc.end_angle + angle } };
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

    setCircularPatternState({ centerType: null, centerId: null, entities: [], count: 6, totalAngle: 360, activeField: 'center', flipDirection: false, previewGeometry: [] });
    setSketchTool("select");
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
        // Filter out non-geometry (if any) or just take valid candidates
        // For dimensioning, we generally want points and entities.
        const valid = currentSketchSel.filter(s => s.type === 'entity' || s.type === 'point' || s.type === 'origin');
        if (valid.length > 0) {
          setDimensionSelection(valid);
          // Also trigger analysis to set proposed action
          analyzeDimensionSelection(valid);
        }
      }
    }
  });

  // === SYNC SKETCH SELECTION TO MEASURE TOOL ===
  createEffect(() => {
    const tool = sketchTool();
    if (tool === "measure") {
      // When entering measure mode, adopt existing sketch selection
      const currentSketchSel = sketchSelection();
      const currentMeasureSel = untrack(() => measurementSelection());
      const currentPending = untrack(() => measurementPending());

      // Only adopt if no measurement work in progress
      if (currentMeasureSel.length === 0 && !currentPending && currentSketchSel.length > 0) {
        const valid = currentSketchSel.filter(s => s.type === 'entity' || s.type === 'point' || s.type === 'origin');

        if (valid.length >= 2) {
          // Two or more entities selected - automatically create measurement
          const measurement = calculateMeasurement(valid[0], valid[1]);
          if (measurement && measurement.result && !('Error' in measurement.result)) {
            setActiveMeasurements(prev => [...prev, measurement]);
            console.log("[Measure] Auto-created measurement from selection:", measurement);
          }
          // Clear sketch selection after adopting
          setSketchSelection([]);
        } else if (valid.length === 1) {
          // Single entity - set as pending for next click
          setMeasurementPending(valid[0]);
          setMeasurementSelection([valid[0]]);
          console.log("[Measure] Adopted single selection as pending:", valid[0]);
          // Clear sketch selection after adopting
          setSketchSelection([]);
        }
      }
    }
  });

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
      type: (type === 'HorizontalDistance' || type === 'VerticalDistance' || type === 'DistanceParallelLines' || type === 'DistancePointLine') ? 'Distance' : type,
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
    handleMeasurementCancel,
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
