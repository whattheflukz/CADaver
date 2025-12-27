# Frontend Refactor Plan: Breaking the Monoliths

**Target**: `useSketching.ts` (4179 lines) and `Viewport.tsx` (1523 lines).
**Goal**: Reduce these files to <500 lines each by extracting specialized subsystems.

---

## 🏗️ Phase 1: Deconstruct `useSketching.ts`

The `useSketching` hook currently manages too many domains. We will split it into composed hooks.

### 1.1 Extract `useSketchSelection` (Priority: High)
**Owner**: `@SelectionSystem`
- **Move State**: `selection` (string[]), `hovered` (string | null).
- **Move Logic**:
  - `handleSelect` (lines 635-637)
  - `analyzeDimensionSelection` (lines 970-1251) -> *Note: part of this may belong to Dimension system, but selection filtering belongs here.*
  - Selection modifier logic (Shift/Ctrl clicks).
- **Create File**: `frontend/src/hooks/useSketchSelection.ts`
- **Outcome**: ~300 lines removed from `useSketching`.

### 1.2 Extract `useDimensionSystem` (Priority: Critical)
**Owner**: `@DimensionSystem`
- **Move State**: `activeMeasurements`, `editingDimension`, `dimensionProposedAction`.
- **Move Logic**:
  - `handleDimensionFinish` (lines 251-393)
  - `handleDimensionDrag` (lines 813-839)
  - `calculateMeasurement` (lines 100-249)
  - `getDimensionModeFromMousePosition` (lines 923-968)
  - `calculatePointPointDistance` / `calculatePointLineDistance` (lines 1261-1280)
- **Create File**: `frontend/src/hooks/useDimensionSystem.ts`
- **Outcome**: ~800 lines removed from `useSketching`.

### 1.3 Extract `useSketchInput` (Priority: Medium)
**Owner**: `@InputSystem`
- **Move State**: `cursorPosition`, `snapConfig`.
- **Move Logic**:
  - `handleEsc` (lines 585-631)
  - `handleStartSketch` / `handleCancelSketch` (lifecycle management).
- **Create File**: `frontend/src/hooks/useSketchInput.ts`

---

## 🏗️ Phase 2: Purify `Viewport.tsx`

The `Viewport` should be a view layer, not a math library.

### 2.1 Extract `RaycastService` (Priority: High)
**Goal**: Remove all raw Three.js vector math from UI components.
- **Move Logic**:
  - `getIntersects` (lines 322-324)
  - `getSketchPlaneIntersection` (lines 317-320)
  - `getIntersectsWithPlanes` (lines 415-418)
  - `getLocalPos` (lines 666-681)
  - `topoIdMatches` (lines 1320-1327)
- **Create File**: `frontend/src/services/RaycastService.ts`
- **Interface**:
  ```typescript
  class RaycastService {
    getIntersection(x, y, plane): Point3D;
    pickEntity(x, y, entities): EntityId;
  }
  ```

### 2.2 Extract `SceneManager` (Priority: Medium)
**Goal**: Encapsulate Three.js scene setup and render loop.
- **Move Logic**:
  - `init()` (lines 75-146) including `animate` loop.
  - Light setup, camera setup, controls setup.
- **Create File**: `frontend/src/rendering/SceneManager.ts`

### 2.3 Simplify Event Handlers
**Goal**: Viewport event handlers should be one-liners delegating to the Input System.
- **Refactor**:
  - `onCanvasClick` (130 lines) -> `sketchInput.handleClick(e)`
  - `onPointerMove` (300 lines) -> `sketchInput.handleMove(e)`

---

## 🏗️ Phase 3: Strengthen Tool Registry

Currently, `DimensionTool` exists but `useSketching` still does most of the heavy lifting for dimensions.

### 3.1 Empower `DimensionTool`
- **Task**: Move `handleDimensionFinish` logic *into* `DimensionTool.onMouseUp` (or similar).
- **Refactor**: The `SketchTool` interface might need to be expanded to support "commit" actions vs "interactive" actions more clearly.

### 3.2 Standardize `SelectTool`
- **Task**: Ensure `SelectTool` owns the selection logic, rather than `useSketching` manually checking `activeTool === 'select'`.

---

## 📅 Execution Order

1.  **Create `RaycastService`**: Low risk, high impact on `Viewport.tsx` readability.
2.  **Create `useDimensionSystem`**: High risk, but necessary to shrink `useSketching`.
3.  **Refactor `Viewport` events**: Once RaycastService is done, Viewport handlers can be simplified.
4.  **Create `useSketchSelection`**: Decouple selection state.

---

## 🚫 What NOT To Do

- **Do NOT rewrite the logic**, just move it.
- **Do NOT change the behavior** of snapping or solving yet.
- **Do NOT introduce Redux/Zustand** unless absolutely necessary (Solid signals are fine, just improperly organized).

---

## ✅ Success Criteria

- `useSketching.ts` is < 1000 lines.
- `Viewport.tsx` is < 600 lines.
- No raw vector math in React/Solid components.
