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
  // For region click detection in extrude mode
  const [regionClickPoint, setRegionClickPoint] = createSignal<[number, number] | null>(null);
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
  } = useMicrocadConnection({
    autostartNextSketch: () => false, // Legacy: Disabled, handled by useSketching
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


  // Send sketch update to backend to run solver and update geometry live
  const handleExtrude = () => {
    // If a sketch is selected, use it as dependency
    let depId: string | null = null;
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
      // Look for any selected entity that belongs to a sketch
      for (const sel of currentSelection) {
        // Case A: TopoId (from backend/Solids) -> { feature_id: "...", ... }
        const fId = sel.feature_id || (typeof sel === 'object' && sel.feature_id ? sel.feature_id : null);

        if (fId) {
          // Handle potential object wrapper { EntityId: "uuid" } or just string
          const idStr = typeof fId === 'string' ? fId : (fId.EntityId || String(fId));
          const feat = nodes[idStr];
          if (feat) {
            if (feat.feature_type === 'Sketch') {
              depId = idStr;
              break;
            } else if (feat.feature_type === 'Extrude') {
              // If we selected a solid face/vertex, use its base sketch
              if (feat.dependencies && feat.dependencies.length > 0) {
                depId = feat.dependencies[0];
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
                depId = node.id;
                break;
              }
            }
          }
          if (depId) break;
        }
      }
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

    const cmd = {
      type: "Extrude",
      name,
      dependencies: depId ? [depId] : []
    };

    setPendingExtrude(true);
    send({ command: 'CreateFeature', payload: cmd });
  };



  // Auto-select newly created extrude feature
  createEffect(() => {
    if (pendingExtrude()) {
      const nodes = graph().nodes;
      // Find the newest Extrude feature
      // Since we don't have timestamps, we rely on the fact it was just added.
      // Or we can find the one with the highest index/name suffix?
      // Simplest: Find Extrude that is NOT selected (if we assume selection was cleared or on sketch)
      // Better: Check count or look for the one we just named?
      // Let's just grab the last Extrude in the list (assuming map keys are somewhat ordered or we search)

      const extrudes = Object.values(nodes).filter(n => n.feature_type === 'Extrude');
      if (extrudes.length > 0) {
        // Sort by creation? keys in rust map are UUIDs, random.
        // We rely on the name we generated? `Extrude N`
        // Let's try to match the name.
        const existingExtrudesCount = extrudes.length;
        // Wait, the count includes the new one.
        // The name we generated was `Extrude ${existingExtrudes + 1}` BEFORE creation.
        // So if we had 0, we made "Extrude 1". Now we have 1.
        // If we had 1 ("Extrude 1"), we made "Extrude 2".

        const targetName = `Extrude ${existingExtrudesCount}`; // Approximately
        const match = extrudes.find(n => n.name === targetName) || extrudes[extrudes.length - 1];

        if (match) {
          setSelectedFeature(match.id);
          setPendingExtrude(false);
        }
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
        if (!sketchMode()) handleExtrude();
        break;
      case 'action:new_sketch':
        if (!sketchMode() && !sketchSetupMode()) {
          const name = "Sketch " + (Object.keys(graph().nodes).length + 1);
          const payload = { type: "Sketch", name: name };
          setAutostartNextSketch(true);
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
                setAutostartNextSketch(true); // Flag to auto-enter edit mode
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
            onOpenVariables={() => setShowVariablesPanel(true)}
            rollbackPoint={graph().rollback_point ?? null}
            onSetRollback={setRollback}
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
            <ModelingToolbar onExtrude={handleExtrude} />
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
                (selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === 'Extrude' &&
                  graph().nodes[selectedFeature()!]?.dependencies?.[0] ?
                  graph().nodes[graph().nodes[selectedFeature()!].dependencies[0]]?.parameters?.sketch_data?.Sketch :
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
              selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === 'Extrude'
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
        {selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === 'Extrude' && (
          <ExtrudeModal
            featureId={selectedFeature()!}
            initialParams={graph().nodes[selectedFeature()!].parameters}
            onUpdate={(id, params) => {
              send({ command: 'UpdateFeature', payload: { id, params } });
            }}
            onClose={() => setSelectedFeature(null)}
            selection={selection()}
            setSelection={setSelection}
            graph={graph()}
            regionClickPoint={regionClickPoint()}
            onConsumeRegionClick={() => setRegionClickPoint(null)}
            backendRegions={backendRegions()}
            onRequestRegions={(sketchId) => send({ command: 'GetRegions', payload: { id: sketchId } })}
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
