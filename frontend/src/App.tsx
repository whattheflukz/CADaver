// @ts-nocheck
import { createSignal, untrack, type Component, createEffect } from 'solid-js';
import './App.css';

import Viewport from './components/Viewport';
import FeatureTree from './components/FeatureTree';
import SelectionToolbar from './components/SelectionToolbar';
import SketchToolbar from './components/SketchToolbar';
import DimensionHUD from './components/DimensionHUD';
import { ConfirmationModal } from './components/ConfirmationModal';
import { type Sketch, type VariableUnit, type VariableStore } from './types';
import SketchStatusBar from './components/SketchStatusBar';
import { MirrorModal } from './components/MirrorModal';
import { OffsetModal } from './components/OffsetModal';
import { LinearPatternModal } from './components/LinearPatternModal';
import { CircularPatternModal } from './components/CircularPatternModal';
import ExtrudeModal from './components/ExtrudeModal';
import FilletModal from './components/FilletModal';
import ChamferModal from './components/ChamferModal';
import PlaneModal from './components/PlaneModal';
import PointModal from './components/PointModal';
import ModelingToolbar from './components/ModelingToolbar';
import CommandPalette from './components/CommandPalette';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import VariablesPanel from './components/VariablesPanel';
import NamedSelectionsPanel from './components/NamedSelectionsPanel';
import ErrorToast from './components/ErrorToast';
import SelectionPanel from './components/SelectionPanel';
import SketchSelectionPanel from './components/SketchSelectionPanel';
import ExpressionInput from './components/ExpressionInput';
import { parseValueOrExpression } from './expressionEvaluator';
import { DimensionEditModal } from './components/DimensionEditModal';
import { type AppMode, commandIdToSketchTool } from './commandRegistry';

import { useMicrocadConnection } from './hooks/useMicrocadConnection';
import { useSketching } from './hooks/useSketching';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { onMount, onCleanup, Show } from 'solid-js';

const App: Component = () => {
  // Feature Graph State managed by hook
  // autostartNextSketch moved to useSketching

  const [deleteConfirmation, setDeleteConfirmation] = createSignal<{ id: string, name: string } | null>(null);
  const [treeExpanded, setTreeExpanded] = createSignal<Record<string, boolean>>({});
  const [pendingExtrude, setPendingExtrude] = createSignal(false);
  const [pendingExtrudeName, setPendingExtrudeName] = createSignal<string | null>(null);
  const [editingExtrudeId, setEditingExtrudeId] = createSignal<string | null>(null);
  // For region click detection in extrude mode
  const [regionClickPoint, setRegionClickPoint] = createSignal<[number, number] | null>(null);

  // Fillet Modal state
  const [editingFilletId, setEditingFilletId] = createSignal<string | null>(null);
  const [pendingFillet, setPendingFillet] = createSignal(false);
  const [pendingFilletName, setPendingFilletName] = createSignal<string | null>(null);

  // Chamfer Modal state
  const [editingChamferId, setEditingChamferId] = createSignal<string | null>(null);
  const [pendingChamfer, setPendingChamfer] = createSignal(false);
  const [pendingChamferName, setPendingChamferName] = createSignal<string | null>(null);

  // Plane Modal state
  const [showPlaneModal, setShowPlaneModal] = createSignal(false);

  // Point Modal state
  const [showPointModal, setShowPointModal] = createSignal(false);

  // Standard plane visibility state
  const [standardPlaneVisibility, setStandardPlaneVisibility] = createSignal<{ XY: boolean; XZ: boolean; YZ: boolean }>({
    XY: true,
    XZ: true,
    YZ: true
  });

  const toggleStandardPlane = (plane: 'XY' | 'XZ' | 'YZ') => {
    setStandardPlaneVisibility(prev => ({
      ...prev,
      [plane]: !prev[plane]
    }));
  };

  // Command Palette state
  const [showCommandPalette, setShowCommandPalette] = createSignal(false);
  // Variables Panel state
  const [showVariablesPanel, setShowVariablesPanel] = createSignal(false);
  // Keyboard Shortcuts Modal state
  const [showKeyboardShortcutsModal, setShowKeyboardShortcutsModal] = createSignal(false);
  // Named Selections Panel state
  const [showNamedSelectionsPanel, setShowNamedSelectionsPanel] = createSignal(false);

  const toggleTreeExpand = (id: string) => {
    const current = treeExpanded();
    setTreeExpanded({ ...current, [id]: !current[id] });
  };


  // Bridge for circular dependency removed - handled by useSketching effect


  const {
    status,
    graph,
    lastTessellation,
    selection,
    zombies,
    solveResult,
    selectedFeature,
    setSelectedFeature,
    send,
    setSelection,
    // @ts-ignore
    setGraph,
    backendRegions,
    selectionGroups,
    kernelErrors,
    dismissError,
    setRollback,
    reorderFeature,
  } = useMicrocadConnection({
    autostartNextSketch: () => null, // Legacy: Disabled, handled by useSketching
    setAutostartNextSketch: () => { },
    onAutoStartSketch: () => { },
    onSketchSolved: (id: string, sketch: Sketch) => { }
  });

  const sketchHook = useSketching({
    send,
    graph,
    selection,
    setSelection,
    solveResult
  });

  // Assign ref
  // handleStartSketchRef assignment removed


  const {
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
    offsetState, setOffsetState,
    mirrorState, setMirrorState,
    linearPatternState, setLinearPatternState,
    circularPatternState, setCircularPatternState,
    patternPreview,
    handleSketchInput,
    handleSketchFinish,
    handleCancelSketch,
    handlePlaneSelected,
    handleStartSketch,
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
    handleDimensionEdit,
    confirmOffset, cancelOffset, setOffsetDist, setOffsetFlip,
    confirmMirror, confirmLinearPattern, confirmCircularPattern,
    handleSelect: handleSketchSelect,
    autostartNextSketch, setAutostartNextSketch,
    cameraAlignPlane,
    sendSketchUpdate,
    // Measurement tool exports
    activeMeasurements,
    measurementSelection,
    measurementPending,
    // Constraint inference exports
    inferredConstraints,
    setInferenceSuppress,
    handleToggleConstruction
  } = sketchHook;

  // Bridge handleSelect - hook handles both sketch and feature selection via its logic
  const handleSelect = handleSketchSelect;





  const handleToggleFeature = (id: string) => {
    send({ command: 'ToggleSuppression', payload: { id } });
  };


  // Helper to find relevant sketch ID from selection
  const findSketchIdFromSelection = (currentSelection: any[]): string | null => {
    const nodes = graph().nodes;
    let foundId: string | null = null;

    for (const sel of currentSelection) {
      // Case A: TopoId (from backend/Solids) -> { feature_id: "...", ... }
      const fId = sel.feature_id || (typeof sel === 'object' && sel.feature_id ? sel.feature_id : null);

      if (fId) {
        // Handle potential object wrapper { EntityId: "uuid" } or just string
        const idStr = typeof fId === 'string' ? fId : (fId.EntityId || String(fId));
        const feat = nodes[idStr];
        if (feat) {
          if (feat.feature_type === 'Sketch') {
            foundId = idStr;
            break;
          } else if (feat.feature_type === 'Extrude') {
            // If we selected a solid face/vertex, use its base sketch
            if (feat.dependencies && feat.dependencies.length > 0) {
              foundId = feat.dependencies[0];
              break;
            }
          }
        }
      }

      // Case B: Sketch Entity Selection -> { id: "entity_uuid", type: "entity"|"point" }
      // We need to find which Sketch Feature contains this entity ID
      if (sel.id && (sel.type === 'entity' || sel.type === 'point')) {
        const entId = sel.id;
        // Search all sketch features
        for (const node of Object.values(nodes)) {
          if (node.feature_type === 'Sketch' && node.parameters?.sketch_data?.Sketch?.entities) {
            const entities = node.parameters.sketch_data.Sketch.entities as SketchEntity[];
            if (entities.some(e => e.id === entId)) {
              foundId = node.id;
              break;
            }
          }
        }
        if (foundId) break;
      }
    }
    return foundId;
  };

  // Send sketch update to backend to run solver and update geometry live
  const handleExtrude = (targetSketchId?: string) => {
    // If a sketch is selected, use it as dependency
    let depId: string | null = targetSketchId || null;
    const selectedId = selectedFeature();
    const currentSelection = selection();

    const nodes = graph().nodes;

    // 1. Try Tree Selection
    if (selectedId) {
      const feat = nodes[selectedId];
      if (feat && feat.feature_type === 'Sketch') {
        depId = selectedId;
      }
    }

    // 2. Try Viewport Selection (if no tree selection found)
    if (!depId && currentSelection.length > 0) {
      depId = findSketchIdFromSelection(currentSelection);
    }

    // 3. Last Resort: If we still have no dependency, but only ONE sketch exists, default to it?
    // This is helpful for new users with 1 sketch.
    if (!depId) {
      const sketches = Object.values(nodes).filter(n => n.feature_type === 'Sketch');
      if (sketches.length === 1) {
        console.log("handleExtrude: Auto-selecting single available sketch:", sketches[0].name);
        depId = sketches[0].id;
      }
    }

    if (!depId) {
      // TODO: Show toast "Please select a sketch or sketch region first"
      console.warn("handleExtrude: No sketch selected to extrude");
    }

    const existingExtrudes = Object.values(nodes).filter(n => n.feature_type === 'Extrude').length;
    const name = `Extrude ${existingExtrudes + 1}`;
    console.log("handleExtrude: Creating new feature with name:", name);

    const cmd = {
      type: "Extrude",
      name,
      dependencies: depId ? [depId] : []
    };

    setPendingExtrudeName(name);
    setPendingExtrude(true);
    send({ command: 'CreateFeature', payload: cmd });
  };

  const handleFillet = () => {
    const existing = Object.values(graph().nodes).filter(n => n.feature_type === 'Fillet').length;
    const name = `Fillet ${existing + 1}`;
    console.log("handleFillet: Creating new feature with name:", name);

    // Dependencies will be filled by user selection in the modal/viewport?
    // Actually, Fillet creates a modifier. The "edge list" is a parameter.
    // The dependency should probably be the solid we are modifying, if we can infer it.
    // Logic: If edges are selected, find their owner feature?
    // For now, empty dependencies and empty params.

    const cmd = {
      type: "Fillet",
      name,
      dependencies: []
    };

    setPendingFilletName(name);
    setPendingFillet(true);
    send({ command: 'CreateFeature', payload: cmd });
  };

  const handleChamfer = () => {
    const existing = Object.values(graph().nodes).filter(n => n.feature_type === 'Chamfer').length;
    const name = `Chamfer ${existing + 1}`;
    console.log("handleChamfer: Creating new feature with name:", name);

    const cmd = {
      type: "Chamfer",
      name,
      dependencies: []
    };

    setPendingChamferName(name);
    setPendingChamfer(true);
    send({ command: 'CreateFeature', payload: cmd });
  };

  const handlePlane = () => {
    setShowPlaneModal(true);
  };

  const handlePlaneCreate = (params: Record<string, any>) => {
    const existing = Object.values(graph().nodes).filter(n => n.feature_type === 'Plane').length;
    const name = params.name?.String || `Plane ${existing + 1}`;

    const cmd = {
      type: "Plane",
      name,
      dependencies: []
    };

    send({ command: 'CreateFeature', payload: cmd });

    // Give backend time to create the feature, then update with params
    setTimeout(() => {
      const nodes = graph().nodes;
      const planeFeature = Object.values(nodes).find(n => n.name === name);
      if (planeFeature) {
        send({ command: 'UpdateFeature', payload: { id: planeFeature.id, params } });
      }
    }, 100);

    setShowPlaneModal(false);
  };

  const handlePoint = () => {
    setShowPointModal(true);
  };

  const handlePointCreate = (params: Record<string, any>) => {
    const existing = Object.values(graph().nodes).filter(n => n.feature_type === 'Point').length;
    const name = params.name?.String || `Point ${existing + 1}`;

    const cmd = {
      type: "Point",
      name,
      dependencies: []
    };

    send({ command: 'CreateFeature', payload: cmd });

    // Wait for feature to be created, then update with params
    setTimeout(() => {
      const nodes = graph().nodes;
      const pointFeature = Object.values(nodes).find(n => n.name === name);
      if (pointFeature) {
        send({ command: 'UpdateFeature', payload: { id: pointFeature.id, params } });
      }
    }, 100);

    setShowPointModal(false);
  };
  // Auto-select newly created extrude feature
  createEffect(() => {
    if (pendingExtrude() && pendingExtrudeName()) {
      const nodes = graph().nodes;
      const targetName = pendingExtrudeName()!;

      const extrudes = Object.values(nodes).filter(n => n.feature_type === 'Extrude');
      const match = extrudes.find(n => n.name === targetName);

      if (match) {
        console.log("Found pending extrude:", match.name);
        setSelectedFeature(match.id);
        setEditingExtrudeId(match.id);
        setPendingExtrude(false);
        setPendingExtrudeName(null);
      }
    }
  });

  // Auto-link sketch to open Extrude modal (Post-selection workflow)
  createEffect(() => {
    const extrudeId = editingExtrudeId();
    if (extrudeId) {
      const extrudeNode = graph().nodes[extrudeId];
      // If extrude exists and has NO dependencies
      if (extrudeNode && (!extrudeNode.dependencies || extrudeNode.dependencies.length === 0)) {
        const currentSel = selection();
        if (currentSel.length > 0) {
          const sketchId = findSketchIdFromSelection(currentSel);
          if (sketchId) {
            console.log("Auto-linking sketch to extrude:", sketchId);
            // Update the extrude feature
            send({ command: 'UpdateFeature', payload: { id: extrudeId, params: { dependencies: [sketchId] } } });
            // Trigger region request
            setTimeout(() => {
              send({ command: 'GetRegions', payload: { id: sketchId } });
            }, 50);
          }
        }
      }
    }
  });

  // Auto-select newly created Fillet feature
  createEffect(() => {
    if (pendingFillet() && pendingFilletName()) {
      const nodes = graph().nodes;
      const targetName = pendingFilletName()!;

      const fillets = Object.values(nodes).filter(n => n.feature_type === 'Fillet');
      const match = fillets.find(n => n.name === targetName);

      if (match) {
        console.log("Found newly created fillet:", match.id);
        setPendingFillet(false);
        setPendingFilletName(null);
        setSelectedFeature(match.id);
        setEditingFilletId(match.id);
      }
    }
  });

  // Auto-select newly created chamfer feature
  createEffect(() => {
    if (pendingChamfer() && pendingChamferName()) {
      const nodes = graph().nodes;
      const targetName = pendingChamferName()!;

      const chamfers = Object.values(nodes).filter(n => n.feature_type === 'Chamfer');
      const match = chamfers.find(n => n.name === targetName);

      if (match) {
        console.log("Found newly created chamfer:", match.id);
        setPendingChamfer(false);
        setPendingChamferName(null);
        setSelectedFeature(match.id);
        setEditingChamferId(match.id);
      }
    }
  });


  createEffect(() => {
    console.log("App.tsx: sketchSetupMode signal =", sketchSetupMode());
  });

  // Determine current app mode for command filtering
  const currentAppMode = (): AppMode => {
    if (sketchMode()) return 'sketch';
    return 'modeling';
  };

  // Handle command execution from Command Palette and Keyboard Shortcuts
  const handleCommandSelect = (commandId: string) => {
    setShowCommandPalette(false);

    // Tool commands (sketch tools)
    const toolFromCmd = commandIdToSketchTool(commandId);
    if (toolFromCmd && sketchMode()) {
      setConstraintSelection([]);
      setSketchTool(toolFromCmd);
      return;
    }

    // Action commands
    switch (commandId) {
      case 'action:finish_sketch':
        if (sketchMode()) handleSketchFinish();
        break;
      case 'action:cancel_sketch':
        if (sketchMode()) handleCancelSketch();
        break;
      case 'action:toggle_construction':
        if (sketchMode()) handleToggleConstruction();
        break;
      case 'action:select':
        if (sketchMode()) setSketchTool('select');
        break;
      case 'action:extrude':
        // If in sketch mode, we can extrude the current sketch immediately
        if (sketchMode()) {
          handleSketchFinish();
          // We need to wait for state update? 
          // Better: handleExtrude logic should handle "activeSketchId" if we pass it or set it.
          // Actually, handleSketchFinish clears activeSketchId.
          // So we should capture it first.
          const sketchId = activeSketchId();
          if (sketchId) {
            // Use setTimeout to allow finish_sketch to process
            setTimeout(() => handleExtrude(sketchId), 50);
          }
        } else {
          handleExtrude();
        }
        break;
      case 'action:new_sketch':
        if (!sketchMode() && !sketchSetupMode()) {
          const name = "Sketch " + (Object.keys(graph().nodes).length + 1);
          const payload = { type: "Sketch", name: name };
          setAutostartNextSketch(name);
          send({ command: 'CreateFeature', payload });
        }
        break;
      case 'action:command_palette':
        setShowCommandPalette(true);
        break;
      case 'action:keyboard_shortcuts':
        setShowKeyboardShortcutsModal(true);
        break;
      case 'action:save_selection_group':
        // Show panel for entering group name
        setShowNamedSelectionsPanel(true);
        break;
      case 'action:manage_selection_groups':
        setShowNamedSelectionsPanel(true);
        break;
      case 'action:deselect_sketch':
        // Progressive deselection in sketch mode:
        // 1. If tool is not 'select', switch to select
        // 2. If dimension/constraint selection exists, clear it
        // 3. If sketch entities are selected, clear them
        if (sketchMode()) {
          if (sketchTool() !== 'select') {
            setSketchTool('select');
            setConstraintSelection([]);
            setDimensionSelection([]);
          } else if (dimensionSelection().length > 0 || constraintSelection().length > 0) {
            setDimensionSelection([]);
            setConstraintSelection([]);
          } else if (sketchSelection().length > 0) {
            setSketchSelection([]);
          }
        }
        break;
      case 'action:deselect_all':
        // Clear all selections when Escape is pressed in modeling mode
        send({ command: 'ClearSelection' });
        break;
    }
  };

  // === KEYBOARD SHORTCUTS ===
  // Centralized keyboard shortcut system (must be after currentAppMode and handleCommandSelect)
  const keyboardShortcuts = useKeyboardShortcuts({
    currentMode: currentAppMode,
    onCommand: handleCommandSelect,
    enabled: () => !showCommandPalette() && !showKeyboardShortcutsModal() // Disable when modals are open
  });

  return (
    <div class="app">
      <header class="header">
        <h1>CADaver</h1>
        <div class={`status ${status().toLowerCase()}`}>
          {status()}
        </div>
      </header>
      {zombies().length > 0 && (
        <div style={{ background: "#ff4444", color: "white", padding: "10px", "text-align": "center", "font-weight": "bold" }}>
          WARNING: {zombies().length} topological reference(s) are broken! (Geometry missing)
        </div>
      )}
      <main>
        <div class="sidebar">


          {/* New Sketch Button */}
          {!sketchMode() && !sketchSetupMode() && (
            <button
              onClick={() => {
                const name = "Sketch " + (Object.keys(graph().nodes).length + 1);
                const payload = { type: "Sketch", name: name };
                setAutostartNextSketch(name); // Flag to auto-enter edit mode
                send({ command: 'CreateFeature', payload });
              }}
              style={{ width: "100%", padding: "5px", margin: "5px 0", background: "#28a745", color: "white", border: "none", cursor: "pointer" }}
            >
              + New Sketch
            </button>
          )}

          <FeatureTree
            graph={graph()}
            selectedId={selectedFeature()}
            onSelect={setSelectedFeature}
            onToggle={handleToggleFeature}
            expanded={treeExpanded()}
            onToggleExpand={toggleTreeExpand}
            onDelete={(id) => {
              const feature = graph().nodes[id];
              if (feature) {
                setDeleteConfirmation({ id, name: feature.name });
              }
            }}
            onUpdateFeature={(id, params) => {
              send({ command: 'UpdateFeature', payload: { id, params } });
            }}
            onEditSketch={(id) => {
              if (!sketchMode() && !sketchSetupMode()) {
                handleStartSketch(id);
              }
            }}
            onEditExtrude={(id) => setEditingExtrudeId(id)}
            onOpenVariables={() => setShowVariablesPanel(true)}
            rollbackPoint={graph().rollback_point ?? null}
            onSetRollback={setRollback}
            onReorderFeature={reorderFeature}
            onInsertAfter={(afterId, featureType) => {
              const name = `${featureType} ${Object.keys(graph().nodes).length + 1}`;
              console.log("Sending InsertFeature command:", { feature_type: featureType, name, after_id: afterId });
              send({
                command: 'InsertFeature',
                payload: {
                  feature_type: featureType,
                  name,
                  after_id: afterId
                }
              });
            }}
            standardPlaneVisibility={standardPlaneVisibility()}
            onToggleStandardPlane={toggleStandardPlane}
            onExtrudeSketch={handleExtrude}
          />
        </div>
        <div class="viewport-container" style={{ position: "relative" }}>
          {!sketchMode() && (
            <SelectionToolbar
              onSetFilter={(f) => {
                send({ command: 'SetFilter', payload: { filter: f } });
              }}
            />
          )}

          {sketchMode() && (
            <SketchToolbar
              activeTool={sketchTool()}
              onToolSelect={(tool) => {
                setConstraintSelection([]); // Reset any in-progress constraint selection
                setSketchTool(tool);
              }}
              onFinishSketch={handleSketchFinish}
              onCancelSketch={handleCancelSketch}
              onDeleteSketch={() => {
                if (activeSketchId()) {
                  setDeleteConfirmation({ id: activeSketchId()!, name: "Current Sketch" });
                }
              }}
              constructionMode={constructionMode()}
              onToggleConstruction={handleToggleConstruction}
            />
          )}

          {/* Modeling Toolbar (same position as Sketch Toolbar, mode-aware) */}
          {!sketchMode() && (
            <ModelingToolbar
              onExtrude={() => handleExtrude()}
              onRevolve={() => { /* Revolve Logic Pending */ }}
              onFillet={() => handleFillet()}
              onChamfer={() => handleChamfer()}
              onPlane={handlePlane}
              onPoint={handlePoint}
            />
          )}

          {/* DOF (Degrees of Freedom) Status Indicator - Server Authoritative */}
          {sketchMode() && currentSketch().entities.filter(e => !e.id.startsWith("preview_")).length > 0 && (
            <div style={{
              position: "absolute",
              bottom: "10px",
              left: "50%",
              transform: "translateX(-50%)",
              "z-index": 999
            }}>
              <SketchStatusBar solveResult={solveResult()} />
            </div>
          )}

          {/* Constraint Status Indicator */}
          {sketchMode() && sketchTool().startsWith("constraint_") && (
            <div style={{
              position: "absolute",
              top: "100px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#333",
              color: "#ffc107",
              padding: "5px 15px",
              "border-radius": "4px",
              "font-size": "13px",
              "z-index": 999,
              border: "1px solid #ffc107"
            }}>
              {sketchTool() === "constraint_horizontal" && "Click on a line to make it horizontal"}
              {sketchTool() === "constraint_vertical" && "Click on a line to make it vertical"}
              {sketchTool() === "constraint_coincident" && (
                constraintSelection().length === 0
                  ? "Click on first point (endpoint or center)"
                  : "Click on second point"
              )}
              {sketchTool() === "constraint_parallel" && (
                constraintSelection().length === 0
                  ? "Click on first line"
                  : "Click on second line"
              )}
              {sketchTool() === "constraint_perpendicular" && (
                constraintSelection().length === 0
                  ? "Click on first line"
                  : "Click on second line"
              )}
              {sketchTool() === "constraint_equal" && (
                constraintSelection().length === 0
                  ? "Click on first entity"
                  : "Click on second entity"
              )}
            </div>
          )}

          <Viewport
            tessellation={lastTessellation()}
            onSelect={handleSelect}
            selection={sketchMode()
              ? (sketchTool() === "dimension" || constraintSelection().length > 0
                ? [...dimensionSelection(), ...constraintSelection()]
                : sketchTool() === "measure"
                  ? measurementSelection()
                  : sketchSelection())
              : selection()
            }
            clientSketch={
              sketchMode() ? currentSketch() :
                // When extrude modal is open, pass the sketch data from extrude's dependency
                (editingExtrudeId() &&
                  graph().nodes[editingExtrudeId()!]?.dependencies?.[0] ?
                  graph().nodes[graph().nodes[editingExtrudeId()!].dependencies[0]]?.parameters?.sketch_data?.Sketch :
                  null)
            }
            onCanvasClick={sketchMode() ? (type, payload, event) => {
              // alert(`App Click Handler: ${type}`); // Probe 2
              handleSketchInput(type, payload, event);
            } : undefined}
            activeSnap={activeSnap()}
            onDimensionDrag={sketchMode() ? handleDimensionDrag : undefined}
            onDimensionEdit={sketchMode() ? handleDimensionEdit : undefined}
            sketchSetupMode={sketchSetupMode()}
            standardPlaneVisibility={standardPlaneVisibility()}
            customPlanes={
              // Extract custom planes from feature graph
              Object.values(graph().nodes)
                .filter(f => f.feature_type === 'Plane' && !f.suppressed)
                .map(f => {
                  try {
                    const planeDataStr = f.parameters?.plane_data?.String;
                    if (!planeDataStr) return null;
                    const planeData = JSON.parse(planeDataStr);
                    return {
                      id: f.id,
                      name: f.name,
                      plane: {
                        origin: planeData.origin || [0, 0, 0],
                        normal: planeData.normal || [0, 0, 1],
                        x_axis: planeData.x_axis || [1, 0, 0],
                        y_axis: planeData.y_axis || [0, 1, 0],
                      }
                    };
                  } catch { return null; }
                })
                .filter(Boolean) as any
            }
            onSelectPlane={handlePlaneSelected}
            previewDimension={sketchMode() && sketchTool() === "dimension" && dimensionPlacementMode() && dimensionProposedAction()?.isValid ? {
              type: dimensionProposedAction()!.type,
              value: dimensionProposedAction()!.value!,
              selections: dimensionSelection()
            } : undefined}
            solveResult={sketchMode() ? solveResult() : null}
            alignToPlane={cameraAlignPlane()}
            previewGeometry={offsetState().isPanelOpen ? offsetState().previewGeometry : patternPreview()}
            onRegionClick={
              // Only enable region clicks when extrude modal is open
              editingExtrudeId()
                ? setRegionClickPoint
                : undefined
            }
            onDimensionMouseMove={

              // Track mouse position for dynamic dimension mode (horizontal/vertical/aligned)
              // Enable as soon as dimension tool is active, not just in placement mode
              sketchMode() && sketchTool() === "dimension"
                ? setDimensionMousePosition
                : undefined
            }
            activeMeasurements={sketchMode() ? activeMeasurements() : undefined}
            inferredConstraints={sketchMode() ? inferredConstraints() : undefined}
          />



          {sketchMode() && sketchTool() === "dimension" && (
            <DimensionHUD
              selections={dimensionSelection()}
              entities={currentSketch().entities}
              proposedAction={dimensionProposedAction()}
              onFinish={handleDimensionFinish}
              onCancel={handleDimensionCancel}
            />
          )}
        </div>


        {/* Dimension Editing Modal */}
        <DimensionEditModal
          isOpen={!!editingDimension()}
          title={`Edit ${editingDimension()?.type === 'Distance' ? 'Distance' : (editingDimension()?.type === 'Angle' ? 'Angle' : 'Radius')}`}
          initialValue={
            editingDimension()
              ? (editingDimension()!.expression
                ? editingDimension()!.expression!
                : (editingDimension()!.type === 'Angle'
                  ? (editingDimension()!.currentValue * 180 / Math.PI).toFixed(2)
                  : editingDimension()!.currentValue.toFixed(2)))
              : ""
          }
          variables={graph().variables || { variables: {}, order: [] }}
          onCancel={() => {
            const editing = editingDimension();
            if (editing?.isNew) {
              // User cancelled a newly creation dimension -> Delete it
              const sketch = currentSketch();
              const updated = { ...sketch };
              // Remove the constraint at the index
              updated.constraints = sketch.constraints.filter((_, i) => i !== editing.constraintIndex);
              // Also remove from history if possible? 
              // Usually history is append-only for undo, but this is "cancelling the action".
              // Let's just update layout.
              setCurrentSketch(updated);
              sendSketchUpdate(updated);
            }
            setEditingDimension(null);
          }}
          onApply={(val, expr) => {
            const editing = editingDimension()!;
            const sketch = currentSketch();
            const entry = sketch.constraints[editing.constraintIndex];
            if (!entry) {
              setEditingDimension(null);
              return;
            }

            // Clone the constraint entry to avoid mutating existing state in-place
            const newEntry = JSON.parse(JSON.stringify(entry));
            const constraint = (newEntry as any).constraint ?? newEntry;

            if (import.meta.env.DEV) {
              console.log('[DimensionEdit] apply', {
                index: editing.constraintIndex,
                editingType: editing.type,
                inputValue: val,
                expr,
                constraintKeys: constraint ? Object.keys(constraint) : null,
                before: JSON.parse(JSON.stringify(constraint))
              });
            }

            let finalValue = val;
            if (editing.type === 'Angle') {
              finalValue = val * Math.PI / 180;
            }

            if (editing.type === 'Distance' && constraint.Distance) {
              constraint.Distance.value = finalValue;
              if (constraint.Distance.style) {
                constraint.Distance.style.expression = expr;
              }
            } else if (editing.type === 'Distance' && constraint.HorizontalDistance) {
              constraint.HorizontalDistance.value = finalValue;
              if (constraint.HorizontalDistance.style) {
                constraint.HorizontalDistance.style.expression = expr;
              }
            } else if (editing.type === 'Distance' && constraint.VerticalDistance) {
              constraint.VerticalDistance.value = finalValue;
              if (constraint.VerticalDistance.style) {
                constraint.VerticalDistance.style.expression = expr;
              }
            } else if (editing.type === 'Distance' && constraint.DistancePointLine) {
              constraint.DistancePointLine.value = finalValue;
              if (constraint.DistancePointLine.style) {
                constraint.DistancePointLine.style.expression = expr;
              }
            } else if (editing.type === 'Distance' && constraint.DistanceParallelLines) {
              constraint.DistanceParallelLines.value = finalValue;
              if (constraint.DistanceParallelLines.style) {
                constraint.DistanceParallelLines.style.expression = expr;
              }
            } else if (editing.type === 'Angle' && constraint.Angle) {
              constraint.Angle.value = finalValue;
              if (constraint.Angle.style) {
                constraint.Angle.style.expression = expr;
              }
            } else if (editing.type === 'Radius' && constraint.Radius) {
              constraint.Radius.value = finalValue;
              if (constraint.Radius.style) {
                constraint.Radius.style.expression = expr;
              }
            } else {
              if (import.meta.env.DEV) {
                console.warn('[DimensionEdit] apply: no matching constraint type found', {
                  index: editing.constraintIndex,
                  editingType: editing.type,
                  constraintKeys: constraint ? Object.keys(constraint) : null,
                  constraint
                });
              }
            }

            if (import.meta.env.DEV) {
              console.log('[DimensionEdit] after', {
                index: editing.constraintIndex,
                after: JSON.parse(JSON.stringify(constraint))
              });
            }

            const updatedConstraints = sketch.constraints.map((c, i) =>
              i === editing.constraintIndex ? newEntry : c
            );
            const updatedSketch = { ...sketch, constraints: updatedConstraints };

            if (import.meta.env.DEV) {
              console.log('[DimensionEdit] sending updated constraint entry', {
                index: editing.constraintIndex,
                sentEntry: updatedSketch.constraints[editing.constraintIndex]
              });
            }

            setCurrentSketch(updatedSketch);
            sendSketchUpdate(updatedSketch);
            setEditingDimension(null);
          }}
        />

        {sketchTool() === "mirror" && (
          <MirrorModal
            selectedAxis={mirrorState().axis}
            selectedEntityCount={mirrorState().entities.length}
            onCancel={() => {
              setMirrorState({ axis: null, entities: [], activeField: 'axis' });
              setSketchTool("select");
            }}
            onConfirm={confirmMirror}
            activeField={mirrorState().activeField}
            onFieldFocus={(field) => setMirrorState({ ...mirrorState(), activeField: field })}
          />
        )}

        <OffsetModal
          isOpen={offsetState().isPanelOpen}
          distance={offsetState().distance}
          setDistance={setOffsetDist}
          onFlip={setOffsetFlip}
          onConfirm={confirmOffset}
          onCancel={cancelOffset}
          entityCount={offsetState().selection.length}
        />

        {/* Linear Pattern Modal */}
        {sketchTool() === "linear_pattern" && (
          <LinearPatternModal
            selectedDirection={linearPatternState().direction}
            selectedEntityCount={linearPatternState().entities.length}
            count={linearPatternState().count}
            spacing={linearPatternState().spacing}
            activeField={linearPatternState().activeField}
            onFieldFocus={(field) => setLinearPatternState({ ...linearPatternState(), activeField: field })}
            onCountChange={(count) => setLinearPatternState({ ...linearPatternState(), count })}
            onSpacingChange={(spacing) => setLinearPatternState({ ...linearPatternState(), spacing })}
            onFlip={() => setLinearPatternState({ ...linearPatternState(), flipDirection: !linearPatternState().flipDirection })}
            onCancel={() => {
              setLinearPatternState({ direction: null, entities: [], count: 3, spacing: 2.0, activeField: 'direction', flipDirection: false, previewGeometry: [] });
              setSketchTool("select");
            }}
            onConfirm={confirmLinearPattern}
          />
        )}



        {/* Extrude Modal */}
        {editingExtrudeId() && (
          <ExtrudeModal
            featureId={editingExtrudeId()!}
            initialParams={graph().nodes[editingExtrudeId()!].parameters}
            onUpdate={(id, params) => {
              send({ command: 'UpdateFeature', payload: { id, params } });
            }}
            onClose={() => setEditingExtrudeId(null)}
            selection={selection()}
            setSelection={setSelection}
            graph={graph()}
            regionClickPoint={regionClickPoint()}
            onConsumeRegionClick={() => setRegionClickPoint(null)}
            backendRegions={backendRegions()}
            onRequestRegions={(sketchId) => send({ command: 'GetRegions', payload: { id: sketchId } })}
          />
        )}

        {/* Fillet Modal */}
        {editingFilletId() && (
          <FilletModal
            featureId={editingFilletId()!}
            initialParams={graph().nodes[editingFilletId()!].parameters}
            onUpdate={(id, params) => {
              send({ command: 'UpdateFeature', payload: { id, params } });
            }}
            onClose={() => setEditingFilletId(null)}
            selection={selection()}
            setSelection={setSelection}
            graph={graph()}
          />
        )}

        {/* Circular Pattern Modal */}
        {sketchTool() === "circular_pattern" && (
          <CircularPatternModal
            centerType={circularPatternState().centerType}
            selectedCenterId={circularPatternState().centerId}
            selectedEntityCount={circularPatternState().entities.length}
            count={circularPatternState().count}
            totalAngle={circularPatternState().totalAngle}
            activeField={circularPatternState().activeField}
            onFieldFocus={(field) => setCircularPatternState({ ...circularPatternState(), activeField: field })}
            onCenterTypeChange={(type) => setCircularPatternState({ ...circularPatternState(), centerType: type, centerId: type === 'origin' ? null : circularPatternState().centerId })}
            onCountChange={(count) => setCircularPatternState({ ...circularPatternState(), count })}
            onAngleChange={(angle) => setCircularPatternState({ ...circularPatternState(), totalAngle: angle })}
            onFlip={() => setCircularPatternState({ ...circularPatternState(), flipDirection: !circularPatternState().flipDirection })}
            onCancel={() => {
              setCircularPatternState({ centerType: null, centerId: null, entities: [], count: 6, totalAngle: 360, activeField: 'center', flipDirection: false, previewGeometry: [] });
              setSketchTool("select");
            }}
            onConfirm={confirmCircularPattern}
          />
        )}

        <ConfirmationModal
          isOpen={!!deleteConfirmation()}
          title="Delete Feature"
          message={`Are you sure you want to delete "${deleteConfirmation()?.name}"? This action cannot be undone.`}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={() => {
            const item = deleteConfirmation();
            if (item) {
              send({ command: 'DeleteFeature', payload: { id: item.id } });
              // If deleting active sketch, exit sketch mode
              if (activeSketchId() === item.id) {
                setSketchMode(false);
                setActiveSketchId(null);
                setConstraintSelection([]);
                setOriginalSketch(null);
              }
              setDeleteConfirmation(null);
              // Deselect if deleted
              if (selectedFeature() === item.id) {
                setSelectedFeature(null);
              }
            }
          }}
        />

        {/* Variables Panel */}
        <Show when={showVariablesPanel()}>
          <VariablesPanel
            variables={graph().variables || { variables: {}, order: [] }}
            onAddVariable={(name, expression, unit, description) => {
              const cmd = { name, expression, unit, description };
              send({ command: 'VariableAdd', payload: cmd });
            }}
            onUpdateVariable={(id, updates) => {
              const cmd = { id, ...updates };
              send({ command: 'VariableUpdate', payload: cmd });
            }}
            onDeleteVariable={(id) => {
              send({ command: 'VariableDelete', payload: { id } });
            }}
            onReorderVariable={(id, newIndex) => {
              const cmd = { id, new_index: newIndex };
              send({ command: 'VariableReorder', payload: cmd });
            }}
            onClose={() => setShowVariablesPanel(false)}
          />
        </Show>

        {/* Chamfer Modal */}
        <Show when={editingChamferId()}>
          <ChamferModal
            featureId={editingChamferId()!}
            initialParams={graph().nodes[editingChamferId()!]?.parameters || {}}
            onUpdate={(id, params) => send({ command: 'UpdateFeature', payload: { id, params } })}
            onClose={() => setEditingChamferId(null)}
            selection={selection()}
            setSelection={setSelection}
            graph={graph()}
          />
        </Show>

        {/* Plane Modal */}
        <Show when={showPlaneModal()}>
          <PlaneModal
            onConfirm={handlePlaneCreate}
            onCancel={() => setShowPlaneModal(false)}
            variables={graph().variables || { variables: {}, order: [] }}
          />
        </Show>

        {/* Point Modal */}
        <Show when={showPointModal()}>
          <PointModal
            onConfirm={handlePointCreate}
            onCancel={() => setShowPointModal(false)}
            variables={graph().variables || { variables: {}, order: [] }}
          />
        </Show>

        {/* Command Palette */}
        <CommandPalette
          isOpen={showCommandPalette()}
          currentMode={currentAppMode()}
          onCommandSelect={handleCommandSelect}
          onClose={() => setShowCommandPalette(false)}
        />


        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal
          isOpen={showKeyboardShortcutsModal()}
          onClose={() => setShowKeyboardShortcutsModal(false)}
          getShortcut={keyboardShortcuts.getShortcut}
          setShortcut={keyboardShortcuts.setShortcut}
          resetShortcut={keyboardShortcuts.resetShortcut}
          resetAllShortcuts={keyboardShortcuts.resetAllShortcuts}
          hasConflict={keyboardShortcuts.hasConflict}
        />

        {/* Named Selections Panel */}
        <NamedSelectionsPanel
          isOpen={showNamedSelectionsPanel()}
          groups={selectionGroups()}
          currentSelectionCount={selection().length}
          onCreateGroup={(name) => {
            send({ command: 'SelectionGroupCreate', payload: { name } });
          }}
          onRestoreGroup={(name) => {
            send({ command: 'SelectionGroupRestore', payload: { name } });
          }}
          onDeleteGroup={(name) => {
            send({ command: 'SelectionGroupDelete', payload: { name } });
          }}
          onClose={() => setShowNamedSelectionsPanel(false)}
        />

        <SelectionPanel
          selection={selection()}
          onDeselect={(topoId) => {
            send({ command: 'Select', payload: { id: topoId, modifier: "remove" } });
          }}
          onClearAll={() => {
            send({ command: 'ClearSelection' });
          }}
        />

        {/* Sketch Selection Panel */}
        <SketchSelectionPanel
          selection={
            sketchTool() === "dimension" ? dimensionSelection() :
              sketchTool() === "measure" ? measurementSelection() :
                sketchSelection()
          }
          entities={sketchMode() ? currentSketch().entities : []}
          onDeselect={(candidate) => {
            // Remove specific candidate based on active tool
            if (sketchTool() === "dimension") {
              const current = dimensionSelection();
              const next = current.filter(c =>
                !(c.id === candidate.id &&
                  c.type === candidate.type &&
                  (c.type === 'point' ? c.index === candidate.index : true)
                )
              );
              setDimensionSelection(next);
            } else if (sketchTool() === "measure") {
              const current = measurementSelection();
              const next = current.filter(c =>
                !(c.id === candidate.id &&
                  c.type === candidate.type &&
                  (c.type === 'point' ? c.index === candidate.index : true)
                )
              );
              // Need setMeasurementSelection
              sketchHook.setMeasurementSelection(next);
            } else {
              const current = sketchSelection();
              const next = current.filter(c =>
                !(c.id === candidate.id &&
                  c.type === candidate.type &&
                  (c.type === 'point' ? c.index === candidate.index : true)
                )
              );
              setSketchSelection(next);
            }
          }}
          onClearAll={() => {
            if (sketchTool() === "dimension") {
              setDimensionSelection([]);
            } else if (sketchTool() === "measure") {
              sketchHook.setMeasurementSelection([]);
            } else {
              setSketchSelection([]);
            }
          }}
        />

        {/* Kernel Error Toasts */}
        <ErrorToast
          errors={kernelErrors}
          onDismiss={dismissError}
          autoDismissMs={5000}
        />
      </main >
      <div class="absolute bottom-4 right-4 text-xs text-white/30 pointer-events-none">
        v0.1.0-alpha (Debug: Fixes Active)
      </div>
    </div >
  );




};

export default App;
