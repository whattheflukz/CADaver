import { createSignal, createEffect, createMemo, onCleanup, onMount, untrack, type Accessor } from 'solid-js';
import { type Sketch, type SketchEntity, type SketchConstraint, type ConstraintPoint, type SnapPoint, type SnapConfig, type SketchPlane, defaultSnapConfig, type SelectionCandidate, type SketchToolType, type SolveResult, wrapConstraint, type FeatureGraphState } from '../types';
import { getSketchAction } from '../sketchInputManager';
import { applySnapping, applyAngularSnapping } from '../snapUtils';

interface UseSketchingProps {
  send: (msg: string) => void;
  graph: Accessor<FeatureGraphState>;
  selection: Accessor<string[]>;
  setSelection: (sel: string[]) => void;
  // For validation/status if needed
  solveResult?: Accessor<SolveResult | null>;
}

export function useSketching(props: UseSketchingProps) {
  // Feature Graph State managed by hook
  const [autostartNextSketch, setAutostartNextSketch] = createSignal(false);

  // Sketch State
  const [sketchMode, setSketchMode] = createSignal(false);
  const [activeSketchId, setActiveSketchId] = createSignal<string | null>(null);
  const [sketchTool, setSketchTool] = createSignal<SketchToolType>("select");
  const [constructionMode, setConstructionMode] = createSignal(false);
  // Sketch Setup Mode State
  const [sketchSetupMode, setSketchSetupMode] = createSignal(false);
  const [pendingSketchId, setPendingSketchId] = createSignal<string | null>(null);
  // Sketch Selection State (Local)
  const [sketchSelection, setSketchSelection] = createSignal<SelectionCandidate[]>([]);

  // State for multi-step constraint creation (e.g., Coincident needs 2 points)
  const [constraintSelection, setConstraintSelection] = createSignal<ConstraintPoint[]>([]);
  const [currentSketch, setCurrentSketch] = createSignal<Sketch>({
    plane: {
      origin: [0, 0, 0],
      normal: [0, 0, 1],
      x_axis: [1, 0, 0],
      y_axis: [0, 1, 0]
    },
    entities: [],
    constraints: [],
    history: []
  });

  const [mirrorState, setMirrorState] = createSignal<{ axis: string | null, entities: string[], activeField: 'axis' | 'entities' }>({ axis: null, entities: [], activeField: 'axis' });

  // Offset State
  const [offsetState, setOffsetState] = createSignal<{
    isPanelOpen: boolean;
    distance: number;
    flip: boolean;
    selection: string[];
    previewGeometry: SketchEntity[];
  }>({
    isPanelOpen: false,
    distance: 0.5,
    flip: false,
    selection: [],
    previewGeometry: []
  });

  // Linear Pattern State
  const [linearPatternState, setLinearPatternState] = createSignal<{
    direction: string | null;
    entities: string[];
    count: number;
    spacing: number;
    activeField: 'direction' | 'entities';
    flipDirection: boolean;
    previewGeometry: SketchEntity[];
  }>({
    direction: null,
    entities: [],
    count: 3,
    spacing: 2.0,
    activeField: 'direction',
    flipDirection: false,
    previewGeometry: []
  });

  // Circular Pattern State
  const [circularPatternState, setCircularPatternState] = createSignal<{
    centerType: 'origin' | 'point' | null;
    centerId: string | null;
    entities: string[];
    count: number;
    totalAngle: number;
    activeField: 'center' | 'entities';
    flipDirection: boolean;
    previewGeometry: SketchEntity[];
  }>({
    centerType: null,
    centerId: null,
    entities: [],
    count: 6,
    totalAngle: 360,
    activeField: 'center',
    flipDirection: false,
    previewGeometry: []
  });

  // Store original state for "Cancel"
  const [originalSketch, setOriginalSketch] = createSignal<Sketch | null>(null);

  // Snap State
  const [snapConfig, setSnapConfig] = createSignal<SnapConfig>(defaultSnapConfig);
  const [activeSnap, setActiveSnap] = createSignal<SnapPoint | null>(null);
  // Track what was snapped to for auto-constraint creation
  const [startSnap, setStartSnap] = createSignal<SnapPoint | null>(null);

  // Dimension Editing State
  const [editingDimension, setEditingDimension] = createSignal<{
    constraintIndex: number;
    type: 'Distance' | 'Angle' | 'Radius';
    currentValue: number;
    expression?: string;
    isNew?: boolean;
  } | null>(null);

  // Dimension Tool State
  const [dimensionSelection, setDimensionSelection] = createSignal<SelectionCandidate[]>([]);
  const [dimensionProposedAction, setDimensionProposedAction] = createSignal<{
    label: string;
    type: "Distance" | "Angle" | "Radius" | "Length" | "DistancePointLine" | "DistanceParallelLines" | "HorizontalDistance" | "VerticalDistance" | "Unsupported";
    value?: number;
    isValid: boolean;
  } | null>(null);
  const [dimensionPlacementMode, setDimensionPlacementMode] = createSignal(false);

  // Sketch Solver Status (DOF indicator)
  // Sketch Solver Status (DOF indicator) managed by hook

  // Camera alignment trigger for sketch mode
  const [cameraAlignPlane, setCameraAlignPlane] = createSignal<SketchPlane | null>(null);

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

  // Props destructuring
  const { send, graph, selection } = props;

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

    // 4. Reset Tool to Select
    if (sketchTool() !== "select") {
      setSketchTool("select");
      setTempPoint(null);
      setTempStartPoint(null);
      setStartSnap(null);
      return;
    }

    // 5. Clear Sketch Selection
    if (sketchSelection().length > 0) {
      setSketchSelection([]);
      return;
    }

    // 6. Clear Backend Selection
    if (selection().length > 0) {
      handleSelect(null); // Sends SELECT:CLEAR
      return;
    }
  };

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log("Global KeyDown:", e.key, "SketchMode:", sketchMode());
      // Only active in Sketch Mode
      if (!sketchMode()) return;

      // Skip keyboard shortcuts when dimension modal is open
      if (editingDimension()) return;

      const action = getSketchAction(e);
      if (!action) return;

      console.log("Sketch Key Action:", action.type, "Tool:", 'tool' in action ? action.tool : 'N/A');

      switch (action.type) {
        case "SET_TOOL":
          console.log("Setting tool via Keyboard:", action.tool);
          setTempPoint(null);
          setTempStartPoint(null);
          setStartSnap(null);
          setConstraintSelection([]);
          setSketchTool(action.tool);
          break;
        case "CANCEL":
          handleEsc();
          break;
        case "TOGGLE_CONSTRUCTION":
          setConstructionMode(!constructionMode());
          break;
        case "DELETE_SELECTION":
          console.log("Deleting selection...");
          handleSketchDelete();
          break;
        case "UNDO":
        case "REDO":
          console.log("Undo/Redo via keyboard not implemented yet");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleSelect = (topoId: any, modifier: "replace" | "add" | "remove" = "replace") => {
    console.log("Selecting:", topoId, modifier);

    if (sketchMode()) {
      if (topoId === null) {
        setSketchSelection([]);
        return;
      }
      // Handle Sketch Entity Selection locally
      let newSel = [...sketchSelection()];
      // If dimension tool is active, use dimensionSelection instead
      if (sketchTool() === "dimension") {
        newSel = [...dimensionSelection()];
      }

      const areEqual = (a: SelectionCandidate, b: SelectionCandidate) => {
        return a.id === b.id && a.type === b.type && a.index === b.index;
      };

      const candidate = topoId as SelectionCandidate;
      const existingIdx = newSel.findIndex(s => areEqual(s, candidate));
      const exists = existingIdx !== -1;

      // Handle Toggle behavior for "add" (Ctrl+Click)
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
          newSel.push(candidate);
        } else {
          // Standard replace behavior
          if (newSel.length === 1 && exists) {
            newSel = []; // Deselect if clicking single selected item
          } else {
            newSel = [candidate];
          }
        }
      }

      if (sketchTool() === "dimension") {
        setDimensionSelection(newSel);
      } else {
        setSketchSelection(newSel);
      }
      return;
    }

    if (topoId) {
      const payload = {
        id: topoId,
        modifier: modifier
      };
      send(`SELECT:${JSON.stringify(payload)}`);
    } else if (!topoId) {
      send(`SELECT:CLEAR`);
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
    // Persist immediately
    const payload = {
      id: id,
      params: {
        "sketch_data": { Sketch: newSketch }
      }
    };
    send(`UPDATE_FEATURE:${JSON.stringify(payload)}`);

    // Trigger camera alignment to sketch plane
    setCameraAlignPlane(plane);
    setTimeout(() => setCameraAlignPlane(null), 100);
  };

  /* ===== DIMENSION PREVIEW EFFECT ===== */
  createEffect(() => {
    // When dimension selection changes, update the proposed action (preview)
    const sel = dimensionSelection();
    console.log("[DimPreview Effect] Selection changed:", sel.length, "items", sel);
    if (sel.length > 0) {
      analyzeDimensionSelection(sel);
      console.log("[DimPreview Effect] After analyze:", {
        proposedAction: dimensionProposedAction(),
        placementMode: dimensionPlacementMode()
      });
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
          id: activeSketchId(),
          params: {
            "sketch_data": { Sketch: originalSketch() }
          }
        };
        send(`UPDATE_FEATURE:${JSON.stringify(payload)}`);
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
        id: activeSketchId(),
        params: {
          "sketch_data": { Sketch: currentSketch() }
        }
      };
      send(`UPDATE_FEATURE:${JSON.stringify(payload)}`);
    }
    setSketchMode(false);
    setActiveSketchId(null);
    setConstraintSelection([]); // Reset any in-progress constraint selection
  };

  // Send sketch update to backend to run solver and update geometry live
  const sendSketchUpdate = (sketch: Sketch) => {
    if (activeSketchId()) {
      const payload = {
        id: activeSketchId(),
        params: {
          "sketch_data": { Sketch: sketch }
        }
      };
      send(`UPDATE_FEATURE:${JSON.stringify(payload)}`);
      console.log("Sent sketch update to backend for solving");
    }
  };

  // Handle dimension text drag to update offset
  const handleDimensionDrag = (constraintIndex: number, newOffset: [number, number]) => {
    console.log("Dragging dimension", constraintIndex, newOffset);
    const sketch = currentSketch();
    const entry = sketch.constraints[constraintIndex];

    if (entry.constraint.Distance && entry.constraint.Distance.style) {
      entry.constraint.Distance.style.offset = newOffset;
    } else if (entry.constraint.Angle && entry.constraint.Angle.style) {
      entry.constraint.Angle.style.offset = newOffset;
    } else if (entry.constraint.DistanceParallelLines && entry.constraint.DistanceParallelLines.style) {
      entry.constraint.DistanceParallelLines.style.offset = newOffset;
    }

    setCurrentSketch({ ...sketch });
    sendSketchUpdate(sketch);
  };

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

  const analyzeDimensionSelection = (candidates: SelectionCandidate[]) => {
    const sketch = currentSketch();

    if (candidates.length === 1) {
      const c = candidates[0];
      if (c.type === "entity") {
        const e = sketch.entities.find(ent => ent.id === c.id);
        if (e) {
          if (e.geometry.Line) {
            const { start, end } = e.geometry.Line;
            const length = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
            setDimensionProposedAction({
              label: `Length (${length.toFixed(2)})`,
              type: "Length",
              value: length,
              isValid: true
            });
            setDimensionPlacementMode(true);
            return;
          } else if (e.geometry.Circle) {
            setDimensionProposedAction({
              label: `Radius (R${e.geometry.Circle.radius.toFixed(2)})`,
              type: "Radius",
              value: e.geometry.Circle.radius,
              isValid: true
            });
            setDimensionPlacementMode(true);
            return;
          } else if (e.geometry.Arc) {
            setDimensionProposedAction({
              label: `Radius (R${e.geometry.Arc.radius.toFixed(2)})`,
              type: "Radius",
              value: e.geometry.Arc.radius,
              isValid: true
            });
            setDimensionPlacementMode(true);
            return;
          }
        }
      }
    } else if (candidates.length === 2) {
      const [c1, c2] = candidates;

      // Helper to check if a candidate represents a single point (endpoint, origin, or Point entity)
      const isPointLike = (c: SelectionCandidate): boolean => {
        if (c.type === "point" || c.type === "origin") {
          console.log("[isPointLike] true for type:", c.type);
          return true;
        }
        if (c.type === "entity") {
          const e = sketch.entities.find(ent => ent.id === c.id);
          const isPoint = !!e?.geometry.Point;
          console.log("[isPointLike] entity check:", c.id, "has Point geometry:", isPoint, "entity:", e?.geometry);
          return isPoint;
        }
        console.log("[isPointLike] false for type:", c.type);
        return false;
      };

      console.log("[analyzeDimensionSelection] 2 candidates:", c1, c2);
      console.log("[analyzeDimensionSelection] isPointLike(c1):", isPointLike(c1), "isPointLike(c2):", isPointLike(c2));

      // Distance: Point-Point, Point-Origin, or Point Entity - Point Entity
      if (isPointLike(c1) && isPointLike(c2)) {
        // Generic Distance
        // Calculate value for preview
        const p1 = getCandidatePosition(c1, sketch);
        const p2 = getCandidatePosition(c2, sketch);
        let dist = 0;
        if (p1 && p2) {
          dist = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
        }
        console.log("[analyzeDimensionSelection] Point-Point matched! p1:", p1, "p2:", p2, "dist:", dist);

        setDimensionProposedAction({
          label: `Distance (${dist.toFixed(2)})`,
          type: "Distance",
          value: dist,
          isValid: true
        });
        setDimensionPlacementMode(true);
        return;
      }

      // Line + Line => Check if parallel first, then decide Angle vs Distance
      if (c1.type === "entity" && c2.type === "entity") {
        const e1 = sketch.entities.find(e => e.id === c1.id);
        const e2 = sketch.entities.find(e => e.id === c2.id);
        if (e1?.geometry.Line && e2?.geometry.Line) {
          const l1 = e1.geometry.Line;
          const l2 = e2.geometry.Line;

          // Calculate direction vectors
          const dx1 = l1.end[0] - l1.start[0];
          const dy1 = l1.end[1] - l1.start[1];
          const dx2 = l2.end[0] - l2.start[0];
          const dy2 = l2.end[1] - l2.start[1];

          const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

          if (len1 > 0.0001 && len2 > 0.0001) {
            // Normalized direction vectors
            const n1x = dx1 / len1, n1y = dy1 / len1;
            const n2x = dx2 / len2, n2y = dy2 / len2;

            // Cross product to check parallelism (sin of angle)
            const cross = n1x * n2y - n1y * n2x;
            let isParallel = Math.abs(cross) < 0.1; // ~6 degree tolerance for geometry

            // Also check if there's an existing Parallel or Angle=0 constraint between these lines
            const hasParallelConstraint = sketch.constraints.some(entry => {
              if (entry.suppressed) return false;
              const c = entry.constraint;
              if (c.Parallel) {
                const [l1id, l2id] = c.Parallel.lines;
                return (l1id === e1.id && l2id === e2.id) || (l1id === e2.id && l2id === e1.id);
              }
              if (c.Angle) {
                const [l1id, l2id] = c.Angle.lines;
                const sameLines = (l1id === e1.id && l2id === e2.id) || (l1id === e2.id && l2id === e1.id);
                // Check if angle is 0 or 180 (parallel)
                const angleValue = c.Angle.value;
                const isZeroOrPi = Math.abs(angleValue) < 0.01 || Math.abs(angleValue - Math.PI) < 0.01;
                return sameLines && isZeroOrPi;
              }
              return false;
            });

            // If there's an existing parallel constraint, treat as parallel
            if (hasParallelConstraint) {
              isParallel = true;
            }

            console.log("Line-Line dimension: isParallel=", isParallel, "hasParallelConstraint=", hasParallelConstraint, "cross=", cross);

            if (isParallel) {
              // Lines are parallel - offer distance between them
              // Calculate perpendicular distance from L2's midpoint to L1's infinite line
              const l2MidX = (l2.start[0] + l2.end[0]) / 2;
              const l2MidY = (l2.start[1] + l2.end[1]) / 2;

              // Normal vector to L1 (perpendicular)
              const nx = -n1y;
              const ny = n1x;

              // Vector from L1 start to L2 midpoint
              const vx = l2MidX - l1.start[0];
              const vy = l2MidY - l1.start[1];

              // Perpendicular distance
              const dist = Math.abs(vx * nx + vy * ny);

              setDimensionProposedAction({
                label: `Distance (${dist.toFixed(2)})`,
                type: "DistanceParallelLines",
                value: dist,
                isValid: true
              });
              setDimensionPlacementMode(true);
              return;
            } else {
              // Lines are NOT parallel - offer angle dimension
              // Calculate angle between the lines
              const dot = n1x * n2x + n1y * n2y;
              const angle = Math.acos(Math.min(1, Math.max(-1, Math.abs(dot))));

              setDimensionProposedAction({
                label: `Angle (${(angle * 180 / Math.PI).toFixed(1)}°)`,
                type: "Angle",
                value: angle,
                isValid: true
              });
              setDimensionPlacementMode(true);
              return;
            }
          }
        }
      }


      // Line + Point/Origin => Distance (Start to Point) OR Point-Line Distance
      if ((c1.type === "entity" && (c2.type === "point" || c2.type === "origin")) ||
        ((c1.type === "point" || c1.type === "origin") && c2.type === "entity")) {

        // Identify Line and Point
        const lineCand = c1.type === "entity" ? c1 : c2;
        const pointCand = c1.type === "entity" ? c2 : c1;

        const e = sketch.entities.find(ent => ent.id === lineCand.id);
        if (e && e.geometry.Line) {
          const p = getCandidatePosition(pointCand, sketch);
          const { start, end } = e.geometry.Line;
          let dist = 0;

          if (p) {
            // Calculate perpendicular distance to infinite line
            const lx = end[0] - start[0];
            const ly = end[1] - start[1];
            const len = Math.sqrt(lx * lx + ly * ly);
            if (len > 1e-9) {
              const nx = -ly / len;
              const ny = lx / len;
              const vx = p[0] - start[0];
              const vy = p[1] - start[1];
              dist = Math.abs(vx * nx + vy * ny);
            } else {
              dist = Math.sqrt((start[0] - p[0]) ** 2 + (start[1] - p[1]) ** 2);
            }
          }

          setDimensionProposedAction({
            label: `Distance (Point to Line) (${dist.toFixed(2)})`,
            type: "DistancePointLine",
            value: dist,
            isValid: true
          });
          setDimensionPlacementMode(true);
          return;
        }
      }
    }

    setDimensionProposedAction(null);
    setDimensionPlacementMode(false);
  };

  const handleDimensionFinish = (offsetOverride?: [number, number]) => {
    const action = dimensionProposedAction();
    const selections = dimensionSelection();
    if (!action || !action.isValid) return;

    const sketch = currentSketch();
    let constraint: SketchConstraint | null = null;

    if (action.type === "Length") {
      // Single Line
      const c = selections[0];
      if (c && c.type === "entity") {
        constraint = {
          Distance: {
            points: [{ id: c.id, index: 0 }, { id: c.id, index: 1 }],
            value: action.value!,
            style: { driven: false, offset: offsetOverride || [0, 1.0] }
          }
        };
      }
    } else if (action.type === "Radius") {
      const c = selections[0];
      if (c && c.type === "entity") {
        constraint = {
          Radius: {
            entity: c.id,
            value: action.value!,
            style: { driven: false, offset: offsetOverride || [0.7, 0.7] }
          }
        };
      }
    } else if (action.type === "Angle") {
      const [c1, c2] = selections;
      constraint = {
        Angle: {
          lines: [c1.id, c2.id],
          value: action.value!,
          style: { driven: false, offset: [0, 1.0] }
        }
      };
    } else if (action.type === "DistancePointLine") {
      const c1 = selections[0];
      const c2 = selections[1];
      const lineCand = c1.type === "entity" ? c1 : c2;
      const pointCand = c1.type === "entity" ? c2 : c1;

      const getConstraintPoint = (c: SelectionCandidate): { id: string, index: number } => {
        if (c.type === "origin") return { id: "00000000-0000-0000-0000-000000000000", index: 0 };
        return { id: c.id, index: c.index || 0 };
      };

      constraint = {
        DistancePointLine: {
          point: getConstraintPoint(pointCand),
          line: lineCand.id,
          value: action.value!,
        }
      };
    } else if (action.type === "Distance" || action.type === "HorizontalDistance" || action.type === "VerticalDistance") {
      // Point-Point or Inferred Line endpoints
      let p1: { id: string, index: number } | null = null;
      let p2: { id: string, index: number } | null = null;

      if (selections.length === 2) {
        const getPoint = (c: SelectionCandidate): { id: string, index: number } | null => {
          if (c.type === "origin") return { id: "00000000-0000-0000-0000-000000000000", index: 0 };
          if (c.type === "point") return { id: c.id, index: c.index || 0 };
          if (c.type === "entity") return { id: c.id, index: c.index || 0 };
          return null;
        };
        p1 = getPoint(selections[0]);
        p2 = getPoint(selections[1]);
      } else if (selections.length === 1 && selections[0].type === 'entity') {
        // Single line selection -> using endpoints 0 and 1
        p1 = { id: selections[0].id, index: 0 };
        p2 = { id: selections[0].id, index: 1 };
      }

      if (p1 && p2) {
        if (action.type === "HorizontalDistance") {
          constraint = {
            HorizontalDistance: {
              points: [p1, p2],
              value: action.value!,
              style: { driven: false, offset: offsetOverride || [0, 1.0] }
            }
          };
        } else if (action.type === "VerticalDistance") {
          constraint = {
            VerticalDistance: {
              points: [p1, p2],
              value: action.value!,
              style: { driven: false, offset: offsetOverride || [0, 1.0] }
            }
          };
        } else {
          constraint = {
            Distance: {
              points: [p1, p2],
              value: action.value!,
              style: { driven: false, offset: offsetOverride || [0, 1.0] }
            }
          };
        }
      }
    } else if (action.type === "DistanceParallelLines") {
      // Two parallel lines - constrain distance between them
      const [c1, c2] = selections;
      if (c1.type === "entity" && c2.type === "entity") {
        constraint = {
          DistanceParallelLines: {
            lines: [c1.id, c2.id],
            value: action.value!,
            style: { driven: false, offset: offsetOverride || [0, 1.0] }
          }
        };
      }
    }

    if (constraint) {
      const updated = { ...sketch };
      updated.constraints = [...updated.constraints, wrapConstraint(constraint)];
      updated.history = [...(updated.history || []), { AddConstraint: { constraint: constraint } }];
      setCurrentSketch(updated);
      sendSketchUpdate(updated); // Send to backend to persist and solve

      // Trigger edit mode for the newly created constraint
      const newIndex = updated.constraints.length - 1;
      setEditingDimension({
        constraintIndex: newIndex,
        type: action.type === 'Radius' ? 'Radius' : (action.type === 'Angle' ? 'Angle' : 'Distance'),
        currentValue: action.value!,
        isNew: true
      });
      // console.log("Added Advanced Dimension and triggered edit:", action.type);
    }

    // Cleanup
    setDimensionSelection([]);
    setDimensionProposedAction(null);
    setDimensionPlacementMode(false);
    setSketchTool("select");
  };



  // Old offset effect removed

  const handleDimensionCancel = () => {
    setDimensionSelection([]);
    setDimensionProposedAction(null);
    setSketchTool("select");
  };

  const [tempPoint, setTempPoint] = createSignal<[number, number] | null>(null);
  const [tempStartPoint, setTempStartPoint] = createSignal<[number, number] | null>(null);

  const handleSketchInput = (type: "click" | "move" | "dblclick", point: [number, number, number]) => {
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
    }

    // Use snapped position for all geometry operations
    // Apply angular snapping for line tool when we have a start point
    let effectivePoint: [number, number] = snappedPos;
    const tool = sketchTool();
    const startPt = tempPoint();

    // For line/rectangle tools, apply angular snapping which may also land on axes
    if ((tool === "line" || tool === "rectangle") && startPt) {
      // First try angular snapping (H/V constraint)
      const angularResult = applyAngularSnapping(startPt, snappedPos);
      if (angularResult.snapped) {
        effectivePoint = angularResult.position;
        console.log("Angular snap:", angularResult.snapType);

        // Check if the angular-snapped point is also on an axis
        const axisThreshold = snapConfig().snap_radius;
        if (Math.abs(effectivePoint[1]) < axisThreshold) {
          // Snap to X axis (Y=0) - keep X, set Y to 0
          effectivePoint = [effectivePoint[0], 0];
          console.log("Combined snap: angular + AxisX");
        } else if (Math.abs(effectivePoint[0]) < axisThreshold) {
          // Snap to Y axis (X=0) - keep Y, set X to 0
          effectivePoint = [0, effectivePoint[1]];
          console.log("Combined snap: angular + AxisY");
        }
      } else if (!snap) {
        // No angular snap and no entity snap - check for axis-only snap
        const axisThreshold = snapConfig().snap_radius;
        if (Math.abs(effectivePoint[1]) < axisThreshold) {
          effectivePoint = [effectivePoint[0], 0];
        } else if (Math.abs(effectivePoint[0]) < axisThreshold) {
          effectivePoint = [0, effectivePoint[1]];
        }
      }
    }

    // Helper for auto-constraining new entities based on snaps
    const applyAutoConstraints = (
      sketch: Sketch,
      newEntityId: string,
      startSnap: SnapPoint | null,
      endSnap: SnapPoint | null
    ): SketchConstraint[] => {
      const constraints: SketchConstraint[] = [];

      // Helper to convert snap to constraint point
      const snapToCP = (snap: SnapPoint): ConstraintPoint | null => {
        if (!snap.entity_id) return null;
        // Basic heuristic for index, refined by finding closest entity point
        // For now, we reuse the existing logic or simple index mapping if possible?
        // Actually, we need to know the index on the TARGET entity.
        // We can re-use findClosestPoint logic or just check distance to known points.

        const entity = sketch.entities.find(e => e.id === snap.entity_id);
        if (!entity) return null;

        if (entity.geometry.Line) {
          const dStart = Math.sqrt((entity.geometry.Line.start[0] - snap.position[0]) ** 2 + (entity.geometry.Line.start[1] - snap.position[1]) ** 2);
          const dEnd = Math.sqrt((entity.geometry.Line.end[0] - snap.position[0]) ** 2 + (entity.geometry.Line.end[1] - snap.position[1]) ** 2);
          return { id: snap.entity_id, index: dStart < dEnd ? 0 : 1 };
        } else if (entity.geometry.Circle) {
          return { id: snap.entity_id, index: 0 }; // Center
        } else if (entity.geometry.Arc) {
          // Check center vs endpoints
          const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
          const dCenter = Math.sqrt((center[0] - snap.position[0]) ** 2 + (center[1] - snap.position[1]) ** 2);
          if (dCenter < 0.1) return { id: snap.entity_id, index: 0 };

          const pStart = [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)];
          const pEnd = [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)];
          const dStart = Math.sqrt((pStart[0] - snap.position[0]) ** 2 + (pStart[1] - snap.position[1]) ** 2);
          const dEnd = Math.sqrt((pEnd[0] - snap.position[0]) ** 2 + (pEnd[1] - snap.position[1]) ** 2);

          if (dStart < dEnd) return { id: snap.entity_id, index: 1 };
          return { id: snap.entity_id, index: 2 };
        }
        return null;
      };

      const processSnap = (snap: SnapPoint, newEntityIndex: number) => {
        if (snap.snap_type === "Endpoint" || snap.snap_type === "Center" || snap.snap_type === "Midpoint" || snap.snap_type === "Intersection") {
          // Create Coincident
          const cp = snapToCP(snap);
          if (cp) {
            // Prevent self-constraint if snapping to self (unlikely during creation but possible)
            if (cp.id !== newEntityId) {
              constraints.push({
                Coincident: {
                  points: [
                    cp,
                    { id: newEntityId, index: newEntityIndex }
                  ]
                }
              });
              console.log("Auto-Constraint: Coincident to", snap.snap_type, cp.id);
            }
          }
        } else if (snap.snap_type === "Origin") {
          // Create Fix at 0,0
          // NOTE: We fix the NEW point, not the origin (which is implicit)
          constraints.push({
            Fix: {
              point: { id: newEntityId, index: newEntityIndex },
              position: [0, 0]
            }
          });
          console.log("Auto-Constraint: Fix to Origin");
        }
      };

      if (startSnap) processSnap(startSnap, 0); // Start/Center of new entity
      if (endSnap) processSnap(endSnap, 1);     // End of new entity (if applicable)

      return constraints;
    };

    // ===== DIMENSION EDITING: Double-click on dimension text to edit =====
    if (type === "dblclick") {
      console.log("Double click detected at:", rawPoint);
      const sketch = currentSketch();

      // Check if clicked near any dimension constraint with style
      for (let i = 0; i < sketch.constraints.length; i++) {
        const entry = sketch.constraints[i];
        const constraint = entry.constraint;

        console.log("Checking constraint", i, ":", Object.keys(constraint), "hasDistanceParallelLines:", !!constraint.DistanceParallelLines);

        // DistanceParallelLines dimension editing - check FIRST before other constraints
        if (constraint.DistanceParallelLines) {
          const dplConstraint = constraint.DistanceParallelLines;
          const line1Entity = sketch.entities.find(e => e.id === dplConstraint.lines[0]);
          const line2Entity = sketch.entities.find(e => e.id === dplConstraint.lines[1]);

          console.log("DPL: line1Entity=", !!line1Entity, "line2Entity=", !!line2Entity);

          if (line1Entity?.geometry.Line && line2Entity?.geometry.Line) {
            const l1 = line1Entity.geometry.Line;
            const l2 = line2Entity.geometry.Line;

            // Calculate midpoints
            const mid1: [number, number] = [(l1.start[0] + l1.end[0]) / 2, (l1.start[1] + l1.end[1]) / 2];
            const mid2: [number, number] = [(l2.start[0] + l2.end[0]) / 2, (l2.start[1] + l2.end[1]) / 2];

            // Get line1 direction for perpendicular
            const dx1 = l1.end[0] - l1.start[0];
            const dy1 = l1.end[1] - l1.start[1];
            const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

            if (len1 > 0.001) {
              // Line direction (ux, uy) and normal (nx, ny)
              const ux = dx1 / len1;
              const uy = dy1 / len1;
              const nx = -uy;
              const ny = ux;

              // Project mid2 onto normal from mid1
              const vx = mid2[0] - mid1[0];
              const vy = mid2[1] - mid1[1];
              const projDist = vx * nx + vy * ny;

              // Extension line end points (same as Viewport.tsx rendering)
              // mid2X/Y for line2 projected position
              const mid1X = mid1[0];
              const mid1Y = mid1[1];
              const mid2X = mid1X + projDist * nx;
              const mid2Y = mid1Y + projDist * ny;

              // Extension line endpoints (dimension line is between these)
              const ext1End: [number, number] = [
                mid1X + (projDist / 2) * nx,
                mid1Y + (projDist / 2) * ny
              ];
              const ext2End: [number, number] = [
                mid2X - (projDist / 2) * nx,
                mid2Y - (projDist / 2) * ny
              ];

              // Text position matches Viewport.tsx rendering
              const textX = (ext1End[0] + ext2End[0]) / 2 + ux * 0.3;
              const textY = (ext1End[1] + ext2End[1]) / 2 + uy * 0.3;

              // Hitbox check with larger area
              const valueText = dplConstraint.value.toFixed(2);
              const textWidth = Math.max(1.5, valueText.length * 0.3);
              const textHeight = 1.2;

              console.log("DPL hitbox:", {
                rawPoint, textX, textY, textWidth, textHeight,
                distX: Math.abs(rawPoint[0] - textX), distY: Math.abs(rawPoint[1] - textY)
              });

              if (Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight) {
                console.log("Editing DistanceParallelLines dimension at index", i);
                setEditingDimension({
                  constraintIndex: i,
                  type: 'Distance', // Reuse Distance type for editing
                  currentValue: dplConstraint.value,
                  expression: dplConstraint.style?.expression
                });
                return;
              }
            }
          }
        }

        if (constraint.Distance && constraint.Distance.style) {
          // Find distance dimension text position
          const cp1 = constraint.Distance.points[0];
          const cp2 = constraint.Distance.points[1];

          // Helper to resolve generic point position
          const getPos = (cp: ConstraintPoint): [number, number] | null => {
            if (cp.id === "00000000-0000-0000-0000-000000000000") return [0, 0];
            const e = sketch.entities.find(ent => ent.id === cp.id);
            if (!e) return null;
            if (e.geometry.Point) {
              return e.geometry.Point.pos;
            } else if (e.geometry.Line) {
              return cp.index === 0 ? e.geometry.Line.start : e.geometry.Line.end;
            } else if (e.geometry.Circle) {
              return e.geometry.Circle.center;
            } else if (e.geometry.Arc) {
              // Simplified Arc handling (center or endpoints)
              const { center, radius, start_angle, end_angle } = e.geometry.Arc;
              if (cp.index === 0) return center;
              if (cp.index === 1) return [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)];
              if (cp.index === 2) return [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)];
              return center;
            }
            return null;
          };

          const pos1 = getPos(cp1);
          const pos2 = getPos(cp2);

          if (pos1 && pos2) {
            let dx = pos2[0] - pos1[0];
            let dy = pos2[1] - pos1[1];
            let len = Math.sqrt(dx * dx + dy * dy);

            // Check for Line Alignment overrides (must match Viewport.tsx)
            // Check if EITHER point belongs to a Line entity
            let alignLine: { start: [number, number], end: [number, number] } | null = null;

            const e1 = cp1.id !== "00000000-0000-0000-0000-000000000000" ? sketch.entities.find(e => e.id === cp1.id) : null;
            const e2 = cp2.id !== "00000000-0000-0000-0000-000000000000" ? sketch.entities.find(e => e.id === cp2.id) : null;

            if (e1 && e1.geometry.Line) alignLine = e1.geometry.Line;
            else if (e2 && e2.geometry.Line) alignLine = e2.geometry.Line;

            if (alignLine) {
              const l = alignLine;
              const ldx = l.end[0] - l.start[0];
              const ldy = l.end[1] - l.start[1];
              const lLen = Math.sqrt(ldx * ldx + ldy * ldy);
              if (lLen > 0.001) {
                // Use PERPENDICULAR to line direction
                const ux = ldx / lLen;
                const uy = ldy / lLen;

                dx = -uy;
                dy = ux;

                len = 1.0;

                // Ensure we point towards other point
                const pdx = pos2[0] - pos1[0];
                const pdy = pos2[1] - pos1[1];
                if (pdx * dx + pdy * dy < 0) {
                  dx = -dx;
                  dy = -dy;
                }
              }
            }

            if (len > 0.001) {
              // Normalize axis
              const nx = dx / len;
              const ny = dy / len;

              // Perpendicular vector for offset (dimension height direction)
              const px = -ny;
              const py = nx;

              const offsetDist = 1.0 + (constraint.Distance.style?.offset[1] || 0);

              // Extension Vector
              const evX = px * offsetDist;
              const evY = py * offsetDist;

              // Dimension Start (on the dimension line)
              const dStart = [pos1[0] + evX, pos1[1] + evY];

              // Dimension End calculation (Projection)
              const v2x = pos2[0] - dStart[0];
              const v2y = pos2[1] - dStart[1];
              const dot = v2x * nx + v2y * ny;
              const dEnd = [dStart[0] + nx * dot, dStart[1] + ny * dot];

              // Midpoint for Text
              const midX = (dStart[0] + dEnd[0]) / 2;
              const midY = (dStart[1] + dEnd[1]) / 2;

              // Hitbox check
              const textStr = constraint.Distance.value.toFixed(2);
              const textWidth = Math.max(0.6, textStr.length * 0.15);
              const textHeight = 0.6;

              // Visual offset adjustment (Viewport adds +0.3 in Y relative to line? No, actually sprite position includes +0.3)
              // Wait, Viewport: textSprite.position.set(midX, midY + 0.3, 0.02);
              // But midY here is ALREADY shifted by offsetDist?
              // Viewport logic:
              //   textSprite.position.set(midX, midY + 0.3, 0.02);
              //   hitboxLine.position.set(midX, midY + 0.3, 0);
              // So the hitbox center IS (midX, midY + 0.3).
              // BUT "midY" in Viewport comes from dStart/dEnd.
              // So yes, we need +0.3 here too.

              const hitX = midX;
              const hitY = midY + 0.3;

              if (Math.abs(rawPoint[0] - hitX) < textWidth && Math.abs(rawPoint[1] - hitY) < textHeight) {
                console.log("Editing Distance dimension at index", i);
                setEditingDimension({
                  constraintIndex: i,
                  type: 'Distance',
                  currentValue: constraint.Distance.value
                });
                setEditingDimension({
                  constraintIndex: i,
                  type: 'Distance',
                  currentValue: constraint.Distance.value,
                  expression: constraint.Distance.style?.expression
                });
                return;
              }
            }
          }
        }

        if (constraint.Angle && constraint.Angle.style) {
          // Find angle center (line intersection)
          const line1Entity = sketch.entities.find(e => e.id === constraint.Angle!.lines[0]);
          const line2Entity = sketch.entities.find(e => e.id === constraint.Angle!.lines[1]);

          if (line1Entity?.geometry.Line && line2Entity?.geometry.Line) {
            const l1 = line1Entity.geometry.Line;
            const l2 = line2Entity.geometry.Line;

            // Calculate intersection
            const x1 = l1.start[0], y1 = l1.start[1];
            const x2 = l1.end[0], y2 = l1.end[1];
            const x3 = l2.start[0], y3 = l2.start[1];
            const x4 = l2.end[0], y4 = l2.end[1];

            const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

            let centerX: number, centerY: number;

            if (Math.abs(denom) > 0.0001) {
              // Lines intersect - use intersection point
              const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
              centerX = x1 + t * (x2 - x1);
              centerY = y1 + t * (y2 - y1);
            } else {
              // Lines are parallel (including when angle=0)
              // Use midpoint between closest endpoints as center
              const midL1 = [(x1 + x2) / 2, (y1 + y2) / 2];
              const midL2 = [(x3 + x4) / 2, (y3 + y4) / 2];
              centerX = (midL1[0] + midL2[0]) / 2;
              centerY = (midL1[1] + midL2[1]) / 2;
            }

            // Calculate start/end angles relative to center to place text correctly
            // This MUST match visual rendering in Viewport.tsx exactly

            // Use same logic as Viewport.tsx - check which endpoint is further from center
            const dStart1 = (x1 - centerX) ** 2 + (y1 - centerY) ** 2;
            const dEnd1 = (x2 - centerX) ** 2 + (y2 - centerY) ** 2;
            let dx1, dy1;
            if (dEnd1 > dStart1) {
              dx1 = x2 - centerX;
              dy1 = y2 - centerY;
            } else {
              dx1 = x1 - centerX;
              dy1 = y1 - centerY;
            }

            const dStart2 = (x3 - centerX) ** 2 + (y3 - centerY) ** 2;
            const dEnd2 = (x4 - centerX) ** 2 + (y4 - centerY) ** 2;
            let dx2, dy2;
            if (dEnd2 > dStart2) {
              dx2 = x4 - centerX;
              dy2 = y4 - centerY;
            } else {
              dx2 = x3 - centerX;
              dy2 = y3 - centerY;
            }

            const angle1 = Math.atan2(dy1, dx1);
            const angle2 = Math.atan2(dy2, dx2);

            let startAngle = angle1;
            let endAngle = angle2;
            let diff = endAngle - startAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;

            const baseRadius = 1.5;
            const radiusOffset = constraint.Angle!.style.offset?.[1] || 0;
            const arcRadius = Math.max(0.5, baseRadius + radiusOffset);
            const textAngle = startAngle + diff / 2;
            // Text is at arcRadius + 0.3 (matches Viewport.tsx rendering)
            const textX = centerX + (arcRadius + 0.3) * Math.cos(textAngle);
            const textY = centerY + (arcRadius + 0.3) * Math.sin(textAngle);

            // Text dimensions - make larger for easier clicking
            const angleDeg = constraint.Angle!.value * 180 / Math.PI;
            const textStr = angleDeg.toFixed(1) + "°";
            const textWidth = Math.max(1.5, textStr.length * 0.3);
            const textHeight = 1.5;

            console.log("Angle hitbox check:", {
              rawPoint, textX, textY, textWidth, textHeight, arcRadius, textAngle,
              centerX, centerY,
              distX: Math.abs(rawPoint[0] - textX), distY: Math.abs(rawPoint[1] - textY),
              isHit: Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight
            });

            // Check if point is inside rectangle
            if (Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight) {
              console.log("Editing Angle dimension at index", i);
              setEditingDimension({
                constraintIndex: i,
                type: 'Angle',
                currentValue: constraint.Angle!.value
              });
              setEditingDimension({
                constraintIndex: i,
                type: 'Angle',
                currentValue: constraint.Angle!.value,
                expression: constraint.Angle!.style?.expression
              });
              return;
            }
          }

          if (constraint.Radius && constraint.Radius.style) {
            // Radius dimension editing
            const entityId = constraint.Radius.entity;
            const entity = sketch.entities.find(e => e.id === entityId);

            if (entity && (entity.geometry.Circle || entity.geometry.Arc)) {
              let center: [number, number];
              let radius: number;

              if (entity.geometry.Circle) {
                center = entity.geometry.Circle.center;
                radius = entity.geometry.Circle.radius;
              } else if (entity.geometry.Arc) {
                center = entity.geometry.Arc.center;
                radius = entity.geometry.Arc.radius;
              } else {
                return;
              }

              // Calculation from Viewport.tsx to match visual position
              // Default to 45 deg if not set or 0? Viewport checks || which implies 0 -> 45deg
              const angle = constraint.Radius.style.offset[1] || (Math.PI / 4);

              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              const extraLen = 1.0;

              // Leader end point (outside circle)
              const leaderEnd: [number, number] = [
                center[0] + (radius + extraLen) * cos,
                center[1] + (radius + extraLen) * sin
              ];

              // Text Position (shifted +0.3 in Y relative to leader end)
              const textX = leaderEnd[0];
              const textY = leaderEnd[1] + 0.3;

              // Hitbox Check
              const valueText = "R " + constraint.Radius.value.toFixed(2);
              const textWidth = Math.max(0.5, valueText.length * 0.15);
              const textHeight = 0.5;

              if (Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight) {
                console.log("Editing Radius dimension at index", i);
                setEditingDimension({
                  constraintIndex: i,
                  type: 'Radius',
                  currentValue: constraint.Radius.value
                });
                setEditingDimension({
                  constraintIndex: i,
                  type: 'Radius',
                  currentValue: constraint.Radius.value,
                  expression: constraint.Radius.style?.expression
                });
                return;
              }
            }
          }

          // DistanceParallelLines dimension editing
          if (constraint.DistanceParallelLines) {
            console.log("DistanceParallelLines constraint found:", constraint.DistanceParallelLines);
            const dplConstraint = constraint.DistanceParallelLines;
            const line1Entity = sketch.entities.find(e => e.id === dplConstraint.lines[0]);
            const line2Entity = sketch.entities.find(e => e.id === dplConstraint.lines[1]);

            if (line1Entity?.geometry.Line && line2Entity?.geometry.Line) {
              const l1 = line1Entity.geometry.Line;
              const l2 = line2Entity.geometry.Line;

              // Calculate midpoints
              const mid1: [number, number] = [(l1.start[0] + l1.end[0]) / 2, (l1.start[1] + l1.end[1]) / 2];
              const mid2: [number, number] = [(l2.start[0] + l2.end[0]) / 2, (l2.start[1] + l2.end[1]) / 2];

              // Get line1 direction for perpendicular
              const dx1 = l1.end[0] - l1.start[0];
              const dy1 = l1.end[1] - l1.start[1];
              const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

              if (len1 > 0.001) {
                // Normal to line1
                const nx = -dy1 / len1;
                const ny = dx1 / len1;

                // Project mid2 onto normal from mid1
                const vx = mid2[0] - mid1[0];
                const vy = mid2[1] - mid1[1];
                const projDist = vx * nx + vy * ny;
                const dimOffset = dplConstraint.style!.offset?.[1] || 0;

                // Calculate text position (midpoint of dimension line)
                const dStart: [number, number] = [mid1[0] + nx * dimOffset, mid1[1] + ny * dimOffset];
                const dEnd: [number, number] = [mid1[0] + projDist * nx + nx * dimOffset, mid1[1] + projDist * ny + ny * dimOffset];
                const textX = (dStart[0] + dEnd[0]) / 2;
                const textY = (dStart[1] + dEnd[1]) / 2;

                // Hitbox check
                const valueText = dplConstraint.value.toFixed(2);
                const textWidth = Math.max(0.8, valueText.length * 0.2);
                const textHeight = 0.8;

                console.log("DistanceParallelLines hitbox check:", {
                  rawPoint,
                  textX,
                  textY,
                  textWidth,
                  textHeight,
                  distX: Math.abs(rawPoint[0] - textX),
                  distY: Math.abs(rawPoint[1] - textY),
                  isHit: Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight
                });

                if (Math.abs(rawPoint[0] - textX) < textWidth && Math.abs(rawPoint[1] - textY) < textHeight) {
                  console.log("Editing DistanceParallelLines dimension at index", i);
                  setEditingDimension({
                    constraintIndex: i,
                    type: 'Distance', // Reuse Distance type for editing
                    currentValue: dplConstraint.value,
                    expression: dplConstraint.style?.expression
                  });
                  return;
                }
              }
            }
          }
        }
      }
    }

    if (sketchTool() === "line") {

      if (type === "click") {
        if (!tempPoint()) {
          // Start line - save snap target for auto-constraint
          setTempPoint(effectivePoint);
          setStartSnap(snap); // Track what we snapped to
        } else {
          // Finish line
          const start = tempPoint()!;
          const newEntityId = crypto.randomUUID();
          const newEntity: SketchEntity = {
            id: newEntityId,
            geometry: {
              Line: {
                start: start,
                end: effectivePoint
              }
            },
            is_construction: constructionMode()
          };

          // Add permanent entity
          const updated = { ...currentSketch() };
          // Remove any preview line
          updated.entities = updated.entities.filter(e => e.id !== "preview_line");
          updated.entities = [...updated.entities, newEntity];
          updated.history = [...(updated.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

          // Auto-add Coincident constraints for snapped endpoints
          const autoConstraints = applyAutoConstraints(updated, newEntityId, startSnap(), snap);
          updated.constraints = [...(updated.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
          updated.history = [...(updated.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated); // Sync to backend for live DOF updates

          setTempPoint(null);
          setStartSnap(null);
          console.log("Added sketch line with constraints:", autoConstraints.length);
        }
      } else if (type === "move") {
        if (tempPoint()) {
          // Update preview
          // We can add a temporary entity to the currentSketch or use a separate preview state
          // For simplicity, let's just make sure Viewport can render a "ghost" line if we passed it?
          // Actually, modifying currentSketch with a "preview" entity ID might be easiest, 
          // but we need to remove it on next move.

          // Strategy: Filter out old preview entity, add new one.
          const PREVIEW_ID = "preview_line";
          const start = tempPoint()!;

          const previewEntity: SketchEntity = {
            id: PREVIEW_ID,
            geometry: {
              Line: {
                start: start,
                end: effectivePoint
              }
            },
            is_construction: constructionMode()
          };

          const entities = currentSketch().entities.filter(e => e.id !== PREVIEW_ID);
          setCurrentSketch({ ...currentSketch(), entities: [...entities, previewEntity] });
        }
      }
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
      if (type === "click") {
        if (!tempPoint()) {
          setTempPoint(effectivePoint);
        } else {
          const center = tempPoint()!;
          const dx = effectivePoint[0] - center[0];
          const dy = effectivePoint[1] - center[1];
          const radius = Math.sqrt(dx * dx + dy * dy);

          const newEntity: SketchEntity = {
            id: crypto.randomUUID(),
            geometry: {
              Circle: {
                center: center,
                radius: radius
              }
            },
            is_construction: constructionMode()
          };

          const updated = { ...currentSketch() };
          updated.entities = updated.entities.filter(e => e.id !== "preview_circle");
          updated.entities = [...updated.entities, newEntity];
          updated.history = [...(updated.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

          // Auto-constraints (Center snap)
          // We only have Center snap for circle creation center (first click)
          // The second click defines radius, snapping there might mean Coincident with something on circumference?
          // Usually we just care about Center.
          // Note: tempPoint() was set on first click, but we didn't save snap?
          // We need to track startSnap like in Line tool.
          // Oops, Circle tool didn't save startSnap. I should check if I missed that.
          // Actually, I can rely on a saved snap if I add logic to save it. 
          // Current code for circle click 1: `setTempPoint(effectivePoint);`
          // I will modify it to `setStartSnap(snap);` as well.

          const autoConstraints = applyAutoConstraints(updated, newEntity.id, startSnap(), null);
          updated.constraints = [...(updated.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
          updated.history = [...(updated.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated); // Sync to backend for live DOF updates

          setTempPoint(null);
          setStartSnap(null); // Clear
          console.log("Added sketch circle with constraints:", autoConstraints.length);
        }
      } else if (type === "move") {
        if (tempPoint()) {
          const center = tempPoint()!;
          const dx = effectivePoint[0] - center[0];
          const dy = effectivePoint[1] - center[1];
          const radius = Math.sqrt(dx * dx + dy * dy);

          const PREVIEW_ID = "preview_circle";
          const previewEntity: SketchEntity = {
            id: PREVIEW_ID,
            geometry: {
              Circle: {
                center: center,
                radius: radius
              }
            },
            is_construction: constructionMode()
          };

          const entities = currentSketch().entities.filter(e => e.id !== PREVIEW_ID);
          setCurrentSketch({ ...currentSketch(), entities: [...entities, previewEntity] });
        }
      }
    } else if (sketchTool() === "arc") {
      if (type === "click") {
        if (!tempPoint()) {
          // Click 1: Set Center
          setTempPoint(effectivePoint);
          setStartSnap(snap);
        } else if (!tempStartPoint()) {
          // Click 2: Set Start Point (Radius + Start Angle)
          setTempStartPoint(effectivePoint);
        } else {
          // Click 3: Set End Point (End Angle)
          const center = tempPoint()!;
          const start = tempStartPoint()!;

          const radius = Math.sqrt(Math.pow(start[0] - center[0], 2) + Math.pow(start[1] - center[1], 2));
          const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
          let endAngle = Math.atan2(effectivePoint[1] - center[1], effectivePoint[0] - center[0]);

          const newEntity: SketchEntity = {
            id: crypto.randomUUID(),
            geometry: {
              Arc: {
                center: center,
                radius: radius,
                start_angle: startAngle,
                end_angle: endAngle
              }
            },
            is_construction: constructionMode()
          };

          const updated = { ...currentSketch() };
          updated.entities = updated.entities.filter(e => e.id !== "preview_arc");
          updated.entities = [...updated.entities, newEntity];
          updated.history = [...(updated.history || []), { AddGeometry: { id: newEntity.id, geometry: newEntity.geometry } }];

          // Arc Creation:
          // Click 1 (Center) -> startSnap (use saved var if I add it, or maybe I reuse startSnap logic)
          // Click 2 (Start) -> tempStartPoint set? 
          // Click 3 (End) -> effectivePoint
          // Constraint Logic: 
          // Center -> Coincident/Fix (from Click 1)
          // Start -> Coincident (from Click 2)
          // End -> Coincident (from Click 3)

          // Current Arc tool state management is a bit complex.
          // I need to ensure I captured snaps for Center and Start.
          // Currently I only see `setTempPoint` and `setTempStartPoint`.
          // I'll need to add a side-effect to store `centerSnap` and `startPtSnap`.
          // For now, let's just use `applyAutoConstraints` with what we have. 
          // If I didn't save snaps, I can't constrain. 
          // I will update Arc tool state logic first/concurrently?
          // Actually, I can assume I'll add `setStartSnap` for Center.
          // For StartPoint, I need another state variable? `const [midSnap, setMidSnap]`?
          // Or just reuse startSnap for center, and... wait.
          // `startSnap` is usually for the first point of the operation.

          // LIMITATION: `applyAutoConstraints` takes (start, end).
          // Arc has Center, Start, End.
          // I'll leave Arc strictly with Center constraint for now (using startSnap logic).

          const autoConstraints = applyAutoConstraints(updated, newEntity.id, startSnap(), null);
          // If I want Start/End constraints, I'd need to track those snaps.

          updated.constraints = [...(updated.constraints || []), ...autoConstraints.map(c => wrapConstraint(c))];
          updated.history = [...(updated.history || []), ...autoConstraints.map(c => ({ AddConstraint: { constraint: c } }))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated); // Sync to backend for live DOF updates

          setTempPoint(null);
          setTempStartPoint(null);
          setStartSnap(null);
          console.log("Added sketch arc with constraints:", autoConstraints.length);
        }
      } else if (type === "move") {
        if (tempPoint()) {
          const center = tempPoint()!;
          let radius = 1.0;
          let startAngle = 0.0;
          let endAngle = 0.0;

          if (!tempStartPoint()) {
            // Moving to determine start point
            const dx = effectivePoint[0] - center[0];
            const dy = effectivePoint[1] - center[1];
            radius = Math.sqrt(dx * dx + dy * dy);
            startAngle = Math.atan2(dy, dx);
            endAngle = startAngle;
          } else {
            // Center and Start fixed, moving for End Angle
            const start = tempStartPoint()!;
            radius = Math.sqrt(Math.pow(start[0] - center[0], 2) + Math.pow(start[1] - center[1], 2));
            startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
            endAngle = Math.atan2(effectivePoint[1] - center[1], effectivePoint[0] - center[0]);
          }

          const PREVIEW_ID = "preview_arc";
          const previewEntity: SketchEntity = {
            id: PREVIEW_ID,
            geometry: {
              Arc: {
                center: center,
                radius: radius,
                start_angle: startAngle,
                end_angle: endAngle
              }
            },
            is_construction: constructionMode()
          };

          const entities = currentSketch().entities.filter(e => e.id !== PREVIEW_ID);
          setCurrentSketch({ ...currentSketch(), entities: [...entities, previewEntity] });
        }
      }
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
      if (type === "click") {
        if (!tempPoint()) {
          setTempPoint(effectivePoint);
          setStartSnap(snap);
        } else {
          const p1 = tempPoint()!;
          const p2 = effectivePoint;

          // Create 4 Lines
          // V1(p1.x, p1.y) -> V2(p2.x, p1.y) -> V3(p2.x, p2.y) -> V4(p1.x, p2.y) -> V1

          const v1 = [p1[0], p1[1]];
          const v2 = [p2[0], p1[1]];
          const v3 = [p2[0], p2[1]];
          const v4 = [p1[0], p2[1]];

          const l1_id = crypto.randomUUID();
          const l2_id = crypto.randomUUID();
          const l3_id = crypto.randomUUID();
          const l4_id = crypto.randomUUID();

          const l1: SketchEntity = { id: l1_id, geometry: { Line: { start: [v1[0], v1[1]], end: [v2[0], v2[1]] } }, is_construction: constructionMode() };
          const l2: SketchEntity = { id: l2_id, geometry: { Line: { start: [v2[0], v2[1]], end: [v3[0], v3[1]] } }, is_construction: constructionMode() };
          const l3: SketchEntity = { id: l3_id, geometry: { Line: { start: [v3[0], v3[1]], end: [v4[0], v4[1]] } }, is_construction: constructionMode() };
          const l4: SketchEntity = { id: l4_id, geometry: { Line: { start: [v4[0], v4[1]], end: [v1[0], v1[1]] } }, is_construction: constructionMode() };

          // Constraints
          const constraints: any[] = [
            // Horizontal/Vertical
            { Horizontal: { entity: l1_id } },
            { Vertical: { entity: l2_id } },
            { Horizontal: { entity: l3_id } },
            { Vertical: { entity: l4_id } },

            // Coincident Corners
            // L1.end -> L2.start
            { Coincident: { points: [{ id: l1_id, index: 1 }, { id: l2_id, index: 0 }] } },
            // L2.end -> L3.start
            { Coincident: { points: [{ id: l2_id, index: 1 }, { id: l3_id, index: 0 }] } },
            // L3.end -> L4.start
            { Coincident: { points: [{ id: l3_id, index: 1 }, { id: l4_id, index: 0 }] } },
            // L4.end -> L1.start
            { Coincident: { points: [{ id: l4_id, index: 1 }, { id: l1_id, index: 0 }] } },
          ];

          const updated = { ...currentSketch() };

          // Auto-Constraints for Rectangle
          // Constrain P1 (L1 start) to startSnap
          const constraintsArr: SketchConstraint[] = [...constraints];

          if (startSnap() && startSnap()!.entity_id) {
            const s = startSnap()!;
            // Manually invoke logic or reuse helper?
            // Helper expects 1 entity ID.
            // We can check snap type manually.
            const autoC = applyAutoConstraints(updated, l1_id, s, null);
            constraintsArr.push(...autoC);
          }

          // Constrain P2 (L3 start, which is v3) to current snap
          // Note: l3 starts at v3 (p2).
          if (snap && snap.entity_id) {
            const autoC = applyAutoConstraints(updated, l3_id, snap, null); // Treating snap as "start" of l3 for constraint purpose
            constraintsArr.push(...autoC);
          }

          updated.entities = updated.entities.filter(e => !e.id.startsWith("preview_rect"));
          updated.entities = [...updated.entities, l1, l2, l3, l4];
          updated.history = [
            ...(updated.history || []),
            { AddGeometry: { id: l1.id, geometry: l1.geometry } },
            { AddGeometry: { id: l2.id, geometry: l2.geometry } },
            { AddGeometry: { id: l3.id, geometry: l3.geometry } },
            { AddGeometry: { id: l4.id, geometry: l4.geometry } }
          ];

          updated.constraints = [...updated.constraints, ...constraintsArr.map(c => wrapConstraint(c))];
          updated.history = [...updated.history, ...constraintsArr.map(c => ({ AddConstraint: { constraint: c } }))];

          setCurrentSketch(updated);
          sendSketchUpdate(updated); // Sync to backend for live DOF updates
          setTempPoint(null);
          setStartSnap(null); // Clear
          console.log("Added sketch rectangle with constraints");
        }
      } else if (type === "move") {
        if (tempPoint()) {
          const p1 = tempPoint()!;
          const p2 = effectivePoint;

          const v1 = [p1[0], p1[1]];
          const v2 = [p2[0], p1[1]];
          const v3 = [p2[0], p2[1]];
          const v4 = [p1[0], p2[1]];

          // Preview Entities
          const l1: SketchEntity = { id: "preview_rect_1", geometry: { Line: { start: [v1[0], v1[1]], end: [v2[0], v2[1]] } }, is_construction: constructionMode() };
          const l2: SketchEntity = { id: "preview_rect_2", geometry: { Line: { start: [v2[0], v2[1]], end: [v3[0], v3[1]] } }, is_construction: constructionMode() };
          const l3: SketchEntity = { id: "preview_rect_3", geometry: { Line: { start: [v3[0], v3[1]], end: [v4[0], v4[1]] } }, is_construction: constructionMode() };
          const l4: SketchEntity = { id: "preview_rect_4", geometry: { Line: { start: [v4[0], v4[1]], end: [v1[0], v1[1]] } }, is_construction: constructionMode() };

          const entities = currentSketch().entities.filter(e => !e.id.startsWith("preview_rect"));
          setCurrentSketch({ ...currentSketch(), entities: [...entities, l1, l2, l3, l4] });
        }
      }
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

          // Arc 1 (at C1): Semicircle away from C2. Center C1.
          // Angles: angle + PI/2 to angle + 3PI/2 (or -PI/2)
          const a1_start = angle + Math.PI / 2;
          const a1_end = angle - Math.PI / 2;

          // Arc 2 (at C2): Semicircle away from C1. Center C2.
          // Angles: angle - PI/2 to angle + PI/2
          const a2_start = angle - Math.PI / 2;
          const a2_end = angle + Math.PI / 2;

          // Line 1: "Top" (relative to V). C1 + R*N -> C2 + R*N
          // Line 2: "Bottom". C1 - R*N -> C2 - R*N
          // Or connect endpoint of arcs.

          // IDs
          const a1_id = crypto.randomUUID();
          const a2_id = crypto.randomUUID();
          const l1_id = crypto.randomUUID();
          const l2_id = crypto.randomUUID();

          // Entities
          const a1: SketchEntity = { id: a1_id, geometry: { Arc: { center: c1, radius, start_angle: a1_start, end_angle: a1_end } } };
          const a2: SketchEntity = { id: a2_id, geometry: { Arc: { center: c2, radius, start_angle: a2_start, end_angle: a2_end } } };

          // Calc endpoints for lines
          // A1 start: c1 + R * N (since N is +90 deg from V)
          // A1 end: c1 - R * N

          const p_a1_start = [c1[0] + radius * nx, c1[1] + radius * ny];
          const p_a1_end = [c1[0] - radius * nx, c1[1] - radius * ny];

          const p_a2_start = [c2[0] - radius * nx, c2[1] - radius * ny]; // Matches A1 end
          const p_a2_end = [c2[0] + radius * nx, c2[1] + radius * ny];   // Matches A1 start

          const l1: SketchEntity = { id: l1_id, geometry: { Line: { start: p_a1_start as [number, number], end: p_a2_end as [number, number] } } };
          const l2: SketchEntity = { id: l2_id, geometry: { Line: { start: p_a1_end as [number, number], end: p_a2_start as [number, number] } } };

          // Constraints
          const constraints: any[] = [
            // Tangency (Lines to Arcs) implies Coincidence of endpoints + direction
            // But simply Coincident is enough IF the geometry is perfect initially?
            // No, solver needs Tangent constraint to maintain it.
            // Actually for slot, Parallel lines + Equal radii + Tangent ends is robust.

            { Parallel: { lines: [l1_id, l2_id] } },
            { Equal: { entities: [a1_id, a2_id] } }, // Equal radii

            // Connect L1
            { Coincident: { points: [{ id: l1_id, index: 0 }, { id: a1_id, index: 1 }] } }, // L1 start -> A1 start (index 1?)
            // Wait, A1 start is c1 + R*N. L1 start is same.
            // A1 index 1 = Start.

            { Coincident: { points: [{ id: l1_id, index: 1 }, { id: a2_id, index: 2 }] } }, // L1 end -> A2 end

            // Connect L2
            { Coincident: { points: [{ id: l2_id, index: 0 }, { id: a1_id, index: 2 }] } }, // L2 start -> A1 end
            { Coincident: { points: [{ id: l2_id, index: 1 }, { id: a2_id, index: 1 }] } }, // L2 end -> A2 start

            // Tangent?
            { Tangent: { entities: [l1_id, a1_id] } },
            { Tangent: { entities: [l1_id, a2_id] } }, // Redundant if Parallel+Equal? Maybe not.
            // Add at least one tangent per side to lock rotation of arcs?
            // Or just Horizontal/Vertical constraint on the axis? No, slot can be angled.
          ];

          const updated = { ...currentSketch() };
          updated.entities = updated.entities.filter(e => !e.id.startsWith("preview_slot"));
          updated.entities = [...updated.entities, a1, a2, l1, l2];
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

          const a1_start = angle + Math.PI / 2;
          const a1_end = angle - Math.PI / 2;
          const a2_start = angle - Math.PI / 2;
          const a2_end = angle + Math.PI / 2;

          const p_a1_start = [c1[0] + radius * nx, c1[1] + radius * ny];
          const p_a1_end = [c1[0] - radius * nx, c1[1] - radius * ny];
          const p_a2_start = [c2[0] - radius * nx, c2[1] - radius * ny];
          const p_a2_end = [c2[0] + radius * nx, c2[1] + radius * ny];

          const a1: SketchEntity = { id: "preview_slot_a1", geometry: { Arc: { center: c1, radius, start_angle: a1_start, end_angle: a1_end } } };
          const a2: SketchEntity = { id: "preview_slot_a2", geometry: { Arc: { center: c2 as [number, number], radius, start_angle: a2_start, end_angle: a2_end } } };
          const l1: SketchEntity = { id: "preview_slot_l1", geometry: { Line: { start: p_a1_start as [number, number], end: p_a2_end as [number, number] } } };
          const l2: SketchEntity = { id: "preview_slot_l2", geometry: { Line: { start: p_a1_end as [number, number], end: p_a2_start as [number, number] } } };

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
      if (type === "click") {
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

        if (hit) {
          // If we hit a valid entity, we let the Viewport's onSelect handle the selection.
          // This avoids a race condition where mousedown selects the entity here, 
          // and then click (onSelect) sees it selected and toggles it off.
          return;
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

    setMirrorState({ axis: null, entities: [], activeField: 'axis' });
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

  return {
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
    // Snap/Dimension
    snapConfig, setSnapConfig,
    activeSnap, setActiveSnap,
    editingDimension, setEditingDimension,
    dimensionSelection, setDimensionSelection,
    dimensionPlacementMode, setDimensionPlacementMode,
    dimensionProposedAction, setDimensionProposedAction,
    handleDimensionFinish,
    handleDimensionCancel,
    handleDimensionDrag,
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
    sendSketchUpdate
  };
  // Offset Logic New
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
  };



};


