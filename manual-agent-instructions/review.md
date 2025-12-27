# Code Review: Architecture, Simplification, and Maintainability

**Date:** 2025-12-26
**Scope:** Full Stack (Frontend: SolidJS/TS, Backend: Rust)

---

## 1. High-Level Architecture Review

The system follows a classic **Frontend-Backend split**:
- **Frontend (SolidJS)**: Handles user interaction, rendering (Three.js), and state management.
- **Backend (Rust)**: Handles geometry processing, constraint solving, and topological operations.

### **Strengths**
- **Technology Choice**: SolidJS is an excellent choice for a CAD application due to its fine-grained reactivity, avoiding the "render cycle" overhead of React. Rust is ideal for the compute-heavy kernel.
- **Separation of Concerns (Macro)**: The boundary between UI and Geometry Kernel is distinct.

### **Weaknesses**
- **Frontend "God Objects"**: The frontend suffers from extreme centralization of logic.
    - `useSketching.ts` is ~4,200 lines.
    - `Viewport.tsx` is ~1,500 lines.
    - These two files effectively run the entire application, creating a fragile and tightly coupled system.
- **Logic Leaking**: Detailed geometric math (raycasting, intersections) is leaking into UI components (`Viewport.tsx`) instead of being encapsulated in utility modules or the kernel.

---

## 2. Code Quality & Maintainability

### **Critical Hotspots**

#### **frontend/src/hooks/useSketching.ts (4,179 lines)**
- **Verdict**: **CRITICAL**. This file is unmaintainable.
- **Issues**:
    - **Responsibility Overload**: It handles selection, tool switching, dimension confirmation, drag overrides, inference logic, websocket communication, and state updates.
    - **Hidden Coupling**: It manually manipulates state that should be owned by individual tools.
    - **Duplication**: Logic for geometry manipulation appears here *and* in the `tools/` directory.

#### **frontend/src/components/Viewport.tsx (1,523 lines)**
- **Verdict**: **HIGH RISK**.
- **Issues**:
    - **Mixed Concerns**: It handles Three.js scene setup, raw DOM event listeners, raycasting math, and high-level sketching orchestration.
    - **Inline Math**: Methods like `getSketchPlaneIntersection` and `getLocalPos` contain raw vector math that belongs in a `GeometryService` or `MathUtils` module.

#### **core/src/sketch/solver.rs (~2,800 lines)**
- **Verdict**: **MODERATE RISK**.
- **Issues**:
    - The `SketchSolver` struct is becoming a dumping ground for all solving logic (detecting redundancy, calculating DOF, relaxing constraints).
    - While functional, it is approaching a size where navigation becomes difficult.

### **Naming & Consistency**
- **Frontend**: Naming is generally clear (`LineTool`, `useSketching`), but the size of files makes names lose context.
- **Backend**: Rust naming conventions are followed well.

---

## 3. Modularity & Separation of Concerns

### **The "Tool" Pattern Paradox**
There is a `frontend/src/tools/` directory with classes like `LineTool`, `CircleTool`, etc. This is a **pure architecture** decision.
**However**, `useSketching.ts` still contains massive amounts of specific logic (e.g., `handleDimensionFinish`, `calculateMeasurement`) that overlaps with or bypasses these tools.
- **Violated Boundary**: Dimension logic is split between `DimensionTool.ts` and `useSketching.ts`. This makes it unclear who owns the "state" of a dimension being created.

### **Leakage in Viewport**
`Viewport.tsx` accesses internal properties of objects and performs checks like `isLine(c)` or manual raycasting.
- **Violated Boundary**: The Viewport should receive a scene and emit high-level events (`onObjectSelected`), not compute ray-plane intersections inline.

---

## 4. Suggested Refactors (Concrete)

### **Phase 1: Deconstruct `useSketching`**
The `useSketching` hook must be exploded into smaller, composable hooks.

1.  **Extract `useSketchSelection`**
    - **Goal**: Manage `selectedIds` and `hoverIds`.
    - **Move**: `handleSelect`, `analyzeDimensionSelection` (the selection parts).

2.  **Extract `useDimensionSystem`**
    - **Goal**: Manage the creation and editing of dimensions.
    - **Move**: `handleDimensionFinish`, `handleDimensionDrag`, `calculateMeasurement`, `activeMeasurements`.
    - **Why**: Dimension logic accounts for ~1,000 lines of `useSketching`.

3.  **Extract `useSketchInput`**
    - **Goal**: Normalize mouse/keyboard events before passing them to tools.
    - **Move**: `handleEsc`, input parsing logic.

### **Phase 2: Purify `Viewport.tsx`**
1.  **Extract `useRaycaster`** (Seems partially started)
    - Move *all* `getIntersects`, `getSketchPlaneIntersection` logic to a hook or utility class. The Viewport should just ask `raycaster.hitTest(x, y)`.
2.  **Extract `useThreeScene`**
    - Move the `init()` rendering loop and scene setup out of the component.

### **Phase 3: Reinforce Tool/Strategy Pattern**
1.  **Move Logic to Tools**
    - `handleDimensionFinish` is essentially the `onMouseUp` or `onConfirm` logic of a `DimensionTool`. Move it there.
    - `useSketching` should ideally look like this:
      ```typescript
      const handleInput = (e) => activeTool.handle(e);
      ```
      Currently, it's a massive switch statement or set of conditionals.

---

## 5. Complexity & Readability Warnings

- **Implicit State in `useSketching`**: Variables like `tempPoint`, `startSnap`, `activeMeasurements` are updated across 4,000 lines. It is impossible to know valid states (e.g., "Can `tempPoint` be set while `activeSnap` is null?").
    - **Fix**: Use a State Machine (e.g., XState or a simple discriminated union reducer) for the sketcher state: `Idle | Drawing | Dimensioning | Dragging`.
- **Deep Nesting in `analyzeDimensionSelection`**: This function (lines 970-1250) is a logic maze. It tries to guess the user's intent based on selection.
    - **Fix**: Flatten this logic. Break it into "Strategies": `PointPointStrategy`, `LineStrategy`, etc.

---

## 6. Long-Term Maintainability Risks

1.  **Feature Creep in `useSketching`**: Every new tool (Spline, Ellipse, Filet) will add 500 lines to `useSketching` if the pattern isn't constrained. This file will hit 10k lines within months.
2.  **Bus Factor**: The complex interaction between `Viewport` rendering and `useSketching` state updates is likely understood by only one person.
3.  **Testing Difficulty**: You cannot unit test `useSketching` easily because it does too much. You have to rely on brittle E2E tests.

---

## 7. Positive Feedback

- **Rust Backend**: The backend code is structured and clearly typed. The solver's separation into methods for "redundancy" and "relaxation" is good, even if the file is large.
- **Tool Registry**: The strict `ToolRegistry` and `BaseTool` approach is the **correct** architectural direction. The execution just needs to double down on this and remove the "glue code" that lives outside it.
- **Snapping System**: The `snapUtils.ts` seems comprehensive and well-isolated.

---

## Summary Action Plan

1.  **Stop writing code in `useSketching.ts`.**
2.  **Refactor**: Create `DimensionManager.ts` (hook or class) and move all dimensioning logic there.
3.  **Refactor**: Create `SelectionManager.ts`.
4.  **Refactor**: Move raycasting math out of `Viewport.tsx`.
5.  **Audit**: Ensure `LineTool` and others own 100% of their logic, leaving `useSketching` as a thin router.
