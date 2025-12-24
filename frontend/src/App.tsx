// @ts-nocheck
import { createSignal, untrack, type Component, createEffect } from 'solid-js';
import './App.css';

import Viewport from './components/Viewport';
import FeatureTree from './components/FeatureTree';
import SelectionToolbar from './components/SelectionToolbar';
import SketchToolbar from './components/SketchToolbar';
import DimensionHUD from './components/DimensionHUD';
import { ConfirmationModal } from './components/ConfirmationModal';
import { type Sketch } from './types';
import SketchStatusBar from './components/SketchStatusBar';
import { MirrorModal } from './components/MirrorModal';
import { OffsetModal } from './components/OffsetModal';
import { LinearPatternModal } from './components/LinearPatternModal';
import { CircularPatternModal } from './components/CircularPatternModal';
import ExtrudeModal from './components/ExtrudeModal';
import ModelingToolbar from './components/ModelingToolbar';
import CommandPalette from './components/CommandPalette';
import { type AppMode, commandIdToSketchTool } from './commandRegistry';

import { useMicrocadConnection } from './hooks/useMicrocadConnection';
import { useSketching } from './hooks/useSketching';
import { onMount, onCleanup } from 'solid-js';

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
    handleDimensionFinish,
    handleDimensionCancel,
    handleDimensionDrag,
    confirmOffset, cancelOffset, setOffsetDist, setOffsetFlip,
    confirmMirror, confirmLinearPattern, confirmCircularPattern,
    handleSelect: handleSketchSelect,
    autostartNextSketch, setAutostartNextSketch,
    cameraAlignPlane,
    sendSketchUpdate
  } = sketchHook;

  // Bridge handleSelect - hook handles both sketch and feature selection via its logic
  const handleSelect = handleSketchSelect;





  const handleToggleFeature = (id: string) => {
    send(`TOGGLE_SUPPRESSION:${id}`);
  };


  // Send sketch update to backend to run solver and update geometry live
  const handleExtrude = () => {
    // If a sketch is selected, use it as dependency
    let depId: string | null = null;
    const selectedId = selectedFeature();

    const nodes = graph().nodes;

    // Check if we have a valid selection that is a Sketch
    if (selectedId) {
      const feat = nodes[selectedId];
      if (feat && feat.feature_type === 'Sketch') {
        depId = selectedId;
      }
    }

    const existingExtrudes = Object.values(nodes).filter(n => n.feature_type === 'Extrude').length;
    const name = `Extrude ${existingExtrudes + 1}`;

    const cmd = {
      type: "Extrude",
      name,
      dependencies: depId ? [depId] : []
    };

    setPendingExtrude(true);
    send(`CREATE_FEATURE:${JSON.stringify(cmd)}`);
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

  // === COMMAND PALETTE ===
  // Global keyboard shortcut for Command Palette (Cmd/Ctrl+K)
  onMount(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      // Debug: log Cmd+K attempts
      if (isCtrlOrCmd && e.key.toLowerCase() === 'k') {
        console.log("App.tsx: Cmd+K detected! Opening command palette...");
        e.preventDefault();
        e.stopPropagation();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true); // Use capture phase
    onCleanup(() => window.removeEventListener('keydown', handleGlobalKeyDown, true));
  });

  // Determine current app mode for command filtering
  const currentAppMode = (): AppMode => {
    if (sketchMode()) return 'sketch';
    return 'modeling';
  };

  // Handle command execution from Command Palette
  const handleCommandSelect = (commandId: string) => {
    setShowCommandPalette(false);

    // Tool commands (sketch tools)
    const sketchTool = commandIdToSketchTool(commandId);
    if (sketchTool && sketchMode()) {
      setConstraintSelection([]);
      setSketchTool(sketchTool);
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
        if (sketchMode()) setConstructionMode(!constructionMode());
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
          send(`CREATE_FEATURE:${JSON.stringify(payload)}`);
        }
        break;
    }
  };

  return (
    <div class="app">
      <header class="header">
        <h1>MicroCAD Parametric System</h1>
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
          {/* Add a button to "Edit Sketch" if a sketch is selected */}
          {selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === "Sketch" && (
            <button
              onClick={() => handleStartSketch(selectedFeature()!)}
              disabled={sketchMode() || sketchSetupMode()}
              style={{ width: "100%", padding: "5px", margin: "5px 0", background: "#007bff", color: "white", border: "none", cursor: "pointer" }}
            >
              Edit Sketch
            </button>
          )}

          {/* New Sketch Button */}
          {!sketchMode() && !sketchSetupMode() && (
            <button
              onClick={() => {
                const name = "Sketch " + (Object.keys(graph().nodes).length + 1);
                const payload = { type: "Sketch", name: name };
                setAutostartNextSketch(true); // Flag to auto-enter edit mode
                send(`CREATE_FEATURE:${JSON.stringify(payload)}`);
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
          />
        </div>
        <div class="viewport-container" style={{ position: "relative" }}>
          {!sketchMode() && (
            <SelectionToolbar
              onSetFilter={(f) => {
                send(`SET_FILTER:${f}`);
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
              onToggleConstruction={() => setConstructionMode(!constructionMode())}
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
            selection={sketchMode() ? sketchSelection() : selection()}
            clientSketch={
              sketchMode() ? currentSketch() :
                // When extrude modal is open, pass the sketch data from extrude's dependency
                (selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === 'Extrude' &&
                  graph().nodes[selectedFeature()!]?.dependencies?.[0] ?
                  graph().nodes[graph().nodes[selectedFeature()!].dependencies[0]]?.parameters?.sketch_data?.Sketch :
                  null)
            }
            onCanvasClick={sketchMode() ? handleSketchInput : undefined}
            activeSnap={activeSnap()}
            onDimensionDrag={sketchMode() ? handleDimensionDrag : undefined}
            sketchSetupMode={sketchSetupMode()}
            onSelectPlane={sketchSetupMode() ? handlePlaneSelected : undefined}
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
        {editingDimension() && (
          <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "z-index": 2000
          }}>
            <div style={{
              background: "#333",
              padding: "20px",
              "border-radius": "8px",
              "min-width": "250px",
              color: "white"
            }}>
              <h3 style={{ margin: "0 0 15px 0" }}>
                Edit {editingDimension()!.type === 'Distance' ? 'Distance' : (editingDimension()!.type === 'Angle' ? 'Angle' : 'Radius')}
              </h3>
              <input
                type="number"
                value={editingDimension()!.type === 'Angle'
                  ? (editingDimension()!.currentValue * 180 / Math.PI).toFixed(2)
                  : editingDimension()!.currentValue.toFixed(2)}
                style={{
                  width: "100%",
                  padding: "8px",
                  "font-size": "16px",
                  "border-radius": "4px",
                  border: "1px solid #666",
                  background: "#222",
                  color: "white",
                  "margin-bottom": "15px"
                }}
                autofocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget;
                    const newValue = parseFloat(input.value);
                    if (!isNaN(newValue)) {
                      const editing = editingDimension()!;
                      const sketch = currentSketch();
                      const entry = sketch.constraints[editing.constraintIndex];
                      const constraint = entry.constraint;

                      if (editing.type === 'Distance' && constraint.Distance) {
                        constraint.Distance.value = newValue;
                      } else if (editing.type === 'Angle' && constraint.Angle) {
                        constraint.Angle.value = newValue * Math.PI / 180; // Convert degrees to radians
                      } else if (editing.type === 'Radius' && constraint.Radius) {
                        constraint.Radius.value = newValue;
                      }

                      const updatedSketch = { ...sketch };
                      setCurrentSketch(updatedSketch);
                      sendSketchUpdate(updatedSketch); // Trigger live solver
                      console.log("Updated dimension to:", newValue);
                    }
                    setEditingDimension(null);
                  } else if (e.key === 'Escape') {
                    setEditingDimension(null);
                  }
                }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
                    const newValue = parseFloat(input?.value || '0');
                    if (!isNaN(newValue)) {
                      const editing = editingDimension()!;
                      const sketch = currentSketch();
                      const entry = sketch.constraints[editing.constraintIndex];
                      const constraint = entry.constraint;

                      if (editing.type === 'Distance' && constraint.Distance) {
                        constraint.Distance.value = newValue;
                      } else if (editing.type === 'Angle' && constraint.Angle) {
                        constraint.Angle.value = newValue * Math.PI / 180;
                      } else if (editing.type === 'Radius' && constraint.Radius) {
                        constraint.Radius.value = newValue;
                      }

                      const updatedSketch = { ...sketch };
                      setCurrentSketch(updatedSketch);
                      sendSketchUpdate(updatedSketch); // Trigger live solver
                    }
                    setEditingDimension(null);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: "#28a745",
                    color: "white",
                    border: "none",
                    "border-radius": "4px",
                    cursor: "pointer"
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => setEditingDimension(null)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: "#666",
                    color: "white",
                    border: "none",
                    "border-radius": "4px",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Modeling Toolbar (only when not in sketch mode) */}
        {!sketchMode() && (
          <ModelingToolbar onExtrude={handleExtrude} />
        )}

        {/* Extrude Modal */}
        {selectedFeature() && graph().nodes[selectedFeature()!]?.feature_type === 'Extrude' && (
          <ExtrudeModal
            featureId={selectedFeature()!}
            initialParams={graph().nodes[selectedFeature()!].parameters}
            onUpdate={(id, params) => {
              send(`UPDATE_FEATURE:${JSON.stringify({ id, params: params })}`);
            }}
            onClose={() => setSelectedFeature(null)}
            selection={selection()}
            setSelection={setSelection}
            graph={graph()}
            regionClickPoint={regionClickPoint()}
            onConsumeRegionClick={() => setRegionClickPoint(null)}
            backendRegions={backendRegions()}
            onRequestRegions={(sketchId) => send(`GET_REGIONS:${sketchId}`)}
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
              send(`DELETE_FEATURE:${item.id}`);
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

        {/* Command Palette */}
        <CommandPalette
          isOpen={showCommandPalette()}
          currentMode={currentAppMode()}
          onCommandSelect={handleCommandSelect}
          onClose={() => setShowCommandPalette(false)}
        />
      </main >
    </div >
  );




};

export default App;
