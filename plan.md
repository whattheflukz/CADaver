# Self-Hosted Parametric CAD Platform  

## 🚫 Anti-Patterns to Avoid (and What to Do Instead)

This section exists to prevent common failure modes seen when agents over-optimize for speed or creativity at the expense of maintainability, clarity, and architectural integrity.

Inventing new features **can be acceptable**, but **only when done with discipline, justification, and clean implementation**.

---

### ❌ Anti-Pattern: Feature Creep Without Structure  
**Problem:**  
Adding new features opportunistically without integrating them cleanly into the existing architecture.

**Avoid:**
- Dropping logic into whatever file is currently open  
- Creating “temporary” helpers that quietly become permanent  
- Adding features without clear ownership or boundaries  

**Instead:**
- Introduce new features only when they align with existing architecture or clearly extend it  
- Place functionality in the correct domain/module, even if it takes more effort  
- If a new abstraction is required, define it cleanly and document its purpose  

---

### ❌ Anti-Pattern: Monolithic Files  
**Problem:**  
Large files accumulating unrelated logic, state, and side effects.

**Avoid:**
- Files that grow indefinitely  
- “Utility” files that become dumping grounds  
- Components or modules with multiple unrelated responsibilities  

**Instead:**
- Enforce single-responsibility at the file level  
- Prefer many small, composable modules over few large ones  
- Refactor proactively when a file begins to feel cognitively heavy  

---

### ❌ Anti-Pattern: “We’ll Clean It Up Later” Code  
**Problem:**  
Temporary hacks become permanent technical debt.

**Avoid:**
- TODOs without context or ownership  
- Placeholder logic without explicit tracking  
- Comments implying future quality (“this should be improved later”)  

**Instead:**
- Either implement it properly or clearly mark it as **intentional technical debt**  
- Leave contextual comments explaining *why* something exists, not just *what* it does  
- Structure code so replacing or upgrading it later is straightforward  

---

### ❌ Anti-Pattern: Implicit Behavior  
**Problem:**  
Logic that only works because of hidden assumptions or execution order.

**Avoid:**
- Implicit global state  
- Order-dependent side effects  
- Magic values or silent fallbacks  

**Instead:**
- Make dependencies explicit  
- Prefer explicit data flow over implicit coupling  
- Fail loudly and clearly when assumptions are violated  

---

### ❌ Anti-Pattern: Over-Engineering Without Purpose  
**Problem:**  
Abstracting prematurely or adding complexity without real benefit.

**Avoid:**
- Generic abstractions with no current use  
- Deep inheritance or indirection without necessity  
- Architecture astronautics  

**Instead:**
- Build for current needs **while leaving clear extension points**  
- Let real usage patterns drive abstraction  
- Keep APIs simple and obvious  

---

### ✅ What *Good* Looks Like

- Code reads like a clear explanation of intent  
- Structure reflects domain concepts, not implementation accidents  
- New contributors can reason about flow without deep context  
- Behavior is predictable, testable, and debuggable  
- Refactors feel safe, not terrifying  

---

### Final Guiding Principle

> **Write code as if someone highly opinionated, detail-oriented, and slightly grumpy will review it tomorrow — because they will.**

That reviewer is future-you.

---

## Comprehensive Implementation Plan & Feature Roadmap

**Goal:**  
Build a **self-hosted, browser-based parametric CAD system** that is *legitimately usable for real engineering work* and competitive with:

- Fusion 360  
- SolidWorks  
- FreeCAD  
- Onshape  

### Technology Stack
- **Backend:** Rust  
- **Frontend:** TypeScript + SolidJS  
- **CAD Kernel:** Truck (https://github.com/ricosjp/truck) — Rust-native B-rep kernel  
- **Rendering:** WebGL / WebGPU  
- **Persistence:** Parametric, feature-based (no mesh-first modeling)

This document is the **authoritative plan** (`plan.md`) and defines:
- Required functionality
- Implementation order
- Non-negotiable CAD correctness requirements

---

## Guiding Principles

1. **Parametric first, mesh last**
2. **Deterministic, reproducible regeneration**
3. **Feature-based, history-driven modeling**
4. **Stable references across edits**
5. **Kernel-authoritative geometry**
6. **Self-hostable and offline-capable**
7. **Scales from hobbyist to professional**
8. **Editing existing designs is more important than creating new ones**
9. **UI must reflect CAD state explicitly (mode-driven, not modal confusion)** *(Added)*
10. **Basic sketching must feel effortless, not fragile** *(Added)*

---

## **Architectural Discipline & Anti-Entropy Rules (Critical)**

This project has a high risk of **structural entropy** due to its complexity, long lifespan, and iterative development style.  
To prevent the codebase from collapsing into a small number of unmaintainable files, the following rules are **non-negotiable**.

These rules exist to **prevent feature accretion, god-objects, and implicit coupling**.

---

## **Core Principle: Separation of Concerns Is Mandatory**

Every system must have:
- A **single, clearly defined responsibility**
- A **well-defined boundary**
- **Minimal awareness** of other systems

If a file or module starts to answer more than one of the following questions, it is doing too much:

- *What is the data?*
- *How is it displayed?*
- *How does the user interact with it?*
- *How is it transformed or solved?*
- *How does it integrate with other systems?*

These concerns **must not live together**.

---

## **Hard Rules (Non-Negotiable)**

### 1. No Feature Piling
If a file grows because a new feature was added:
- Stop.
- Identify whether the feature belongs to an existing system or a new one.
- Create a new module if responsibility changes.

**Features do not get added “just because it’s convenient.”**

---

### 2. No God Files
Any file that:
- Handles UI + logic + state  
- Coordinates multiple unrelated systems  
- Grows without a clear boundary  

…must be split.

**Large files are a smell, not a badge of progress.**

---

### 3. Systems Must Be Named and Bounded
Every major system must:
- Have a clear name
- Live in a clearly scoped directory
- Expose a narrow, intentional API

Examples:

/sketch
/constraints
/geometry
/interaction
/state


Not:

/sketch.ts


---

### 4. UI Must Never Contain Business Logic
UI components may:
- Display state
- Forward user intent
- Render visual feedback

UI components may NOT:
- Solve geometry
- Mutate model state directly
- Make architectural decisions

UI talks to **controllers / coordinators**, not core logic.

---

### 5. Geometry, State, and Interaction Must Be Separate
These three layers must never blur:

- **Geometry** → math, constraints, topology
- **State** → selection, mode, history, feature data
- **Interaction** → mouse, keyboard, gestures, hover logic

If a function needs all three, it must be split.

---

### 6. No Implicit Cross-System Knowledge
A system should not need to “know” internal details of another system.

Bad:
- Sketch system assuming how selection is stored
- UI code assuming geometry data layout
- Features directly mutating global state

Good:
- Explicit interfaces
- Events or commands
- Clearly owned data flow

---

### 7. Favor Explicit Data Flow Over Convenience
If data moves between systems:
- Make the transfer explicit
- Avoid implicit globals or shared mutable objects
- Prefer structured inputs/outputs over shared state

---

### 8. Refactoring Is Part of Feature Work
When adding a feature:
- If structure degrades → refactor first
- If a file grows unwieldy → split it immediately
- If responsibilities blur → stop and realign

**Shipping broken architecture is worse than shipping nothing.**

---

## **Required Behavior When Adding New Features**

Before implementing any feature, the agent must:

1. Identify which system owns the feature  
2. Verify that the system already exists or create a new one  
3. Confirm no unrelated systems are being modified  
4. Ensure new logic does not live in:
   - UI components
   - Rendering code
   - Generic utility files unless truly reusable  

If any of these fail → restructure first.

---

## **Architecture Self-Check (Must Pass)**

Before committing work, ask:

- Can this file be explained in one sentence?
- Does this file have exactly one reason to change?
- Could this logic be reused elsewhere?
- Would a new contributor understand where to add similar logic?
- Is this system isolated enough to be testable on its own?

If the answer is “no” to any of the above — refactor.

---

## **Enforcement Rule**

If a feature causes:
- A file to grow uncontrollably
- Cross-system coupling
- Hidden dependencies
- Hard-to-trace side effects  

**Stop implementation and restructure immediately.**

Progress is defined by **clarity**, not speed.

---

## **Goal**

By enforcing these rules, the codebase should:
- Scale without architectural decay  
- Support rapid iteration without fear  
- Allow new systems to be added cleanly  
- Remain understandable months later  

This is not optional hygiene — it is core infrastructure.

---

## High-Level Architecture
┌────────────────────────────┐
│ Frontend (Web)             │
│ SolidJS + TypeScript       │
│ Sketch Editor              │
│ Feature Timeline           │
│ Assembly Browser           │
│ Drawing Workspace          │
│ 3D Viewport                │
└────────────┬───────────────┘
             │ API (JSON / WS)
┌────────────▼───────────────┐
│ Backend (Rust)             │
│ Feature Graph Engine       │
│ Constraint Solver          │
│ Regeneration Engine        │
│ Assembly Solver            │
│ Versioning & Configs       │
│ Topological Naming         │
└────────────┬───────────────┘
             │
┌────────────▼───────────────┐
│ Truck Kernel               │
│ Geometry Evaluation        │
│ Solid & Surface Ops        │
│ Boolean Ops                │
│ Precision & Robustness     │
└────────────────────────────┘

---

## **Global UX & Interaction Model (Added — Non-Negotiable)**

### Application Modes
The application operates in **explicit modes**, each with a distinct toolset:

- Sketch Mode
- Part Modeling Mode
- Assembly Mode
- Drawing Mode

Mode changes must:
- Be visually obvious
- Change available tools
- Change snapping & selection behavior
- Never hide core UI affordances

---

## **Toolbar System (Added — Critical UX Infrastructure)**

### Toolbar Requirements
- Toolbar is **static and always visible**
- Toolbar must **never be a popup-only UI**
- Toolbar contents **change dynamically based on active mode**
- Tools must be grouped logically (Sketch, Constraints, Solids, References, etc.)
- Toolbar state must be deterministic and mode-driven

### Mode-Specific Toolbars
- **Sketch Mode Toolbar**
  - Sketch geometry tools
  - Constraint tools
  - Dimensioning tools
  - Construction geometry toggles
- **3D Modeling Toolbar**
  - Extrude / Revolve / Sweep / Loft
  - Boolean operations
  - Fillet / Chamfer
- **Assembly Toolbar**
  - Insert component
  - Mate tools
- **Drawing Toolbar**
  - View creation
  - Dimensioning
  - Annotation tools

### Tool Discoverability
- Every tool must have:
  - Hover tooltip
  - Short textual description
  - Keyboard shortcut (if applicable)
- Constraint tools must explain **what constraint they apply**

---

## **Command Palette (Added — Mandatory)**

- Accessible via `Cmd/Ctrl + Shift + P`
- Fuzzy search across:
  - Tools
  - Commands
  - Actions
- Displays:
  - Tool name
  - Description
  - Mode compatibility
- Works regardless of toolbar visibility

---

## Phase 0 — Foundations & CAD Correctness (Non-Negotiable)

### Core Infrastructure
- [x] Rust workspace & module boundaries
- [x] SolidJS frontend scaffold
- [x] Backend API framework (Axum / Actix)
- [x] WebSocket-based model sync
- [x] Deterministic UUID & entity ID system
- [x] Math & geometry utility layer
- [x] Unit system (mm, inch, deg, etc.)

### **UI Infrastructure (Added)**
- [x] Mode-aware toolbar system *(Added - SketchToolbar/ModelingToolbar)*
- [x] Persistent layout (toolbar always visible) *(Added)*
- [x] Hover tooltips with descriptions *(Added - ToolButton component)*
- [x] Keyboard shortcut system *(Added - useKeyboardShortcuts hook with customization)*
- [x] Command palette infrastructure

### **Reusable UI Components (Added — Best Practice)**

Focus on building reusable, composable components to reduce duplication and ensure consistent UX.

**Modal Requirements (Non-Negotiable):**
- All popup/modal windows MUST be draggable
- Use `BaseModal` pattern for consistent drag behavior
- Modals must clamp to viewport boundaries

**Existing Base Components:**
- [x] `BaseModal` — Draggable modal with standard Cancel/Finish buttons, title, and children slot
  - Used by: `OffsetModal`, `MirrorModal`
  - Features: drag-to-move, consistent dark theme, disabled state support
- [x] `CommandPalette` — Draggable command search with fuzzy filtering (Added)
  - Features: drag header, keyboard nav, mode-aware filtering

**Future Candidates:**
- [x] `SelectionField` — Reusable "click to select entity" input field *(Added)*
- [x] `NumericInput` — Styled number input with unit support and variable expressions *(Added)*
- [x] `ToolButton` — Toolbar button with rich tooltip, shortcut, and description display *(Added)*


### Truck Kernel Integration
- [x] Embed Truck kernel (`TruckKernel` in `core/src/kernel/truck.rs`)
- [x] Extrusion (linear, tapered profiles)
- [x] Revolution (axis-based rotation)
- [x] Boolean operations (union, intersect, subtract)
- [x] Tessellation with face/edge detection
- [x] STEP export
- [ ] STEP import (Truck v0.3 limitation)
- [x] Kernel error propagation to UI

### **Topological Naming & References (Critical)**
- [x] Persistent face/edge/vertex IDs
- [x] Reference tracking across regenerations
- [x] Stable selection resolution
- [ ] Failure recovery strategies
- [x] Explicit “reference broken” reporting

### Selection System (Foundational)
- [x] Selection filters (face/edge/vertex/body)
- [x] Persistent selections
- [x] Preselection & hover logic
- [x] Named selections / selection sets *(Added)*

### Rendering Pipeline
- [x] WebGL/WebGPU renderer
- [x] Tessellation from Truck (via `TruckKernel::tessellate`)
- [ ] Normals & edge rendering
- [x] Face/edge/vertex picking
- [x] Camera controls (orbit/pan/zoom)
- [ ] LOD groundwork

---

## Phase 1 — Parametric Core & Sketching (Single Part)

**Goal:** Usable parametric part modeling without rage-quitting.

### Feature Tree System
- [x] Feature DAG
- [x] Deterministic regeneration order
- [x] Rollback & roll-forward preview
- [x] Feature suppression
- [x] Feature reordering (with constraints)
- [x] Insert/replace features mid-tree
- [x] Dependency visualization

---

## **Sketch Mode Entry & Plane Selection (Added — Critical)**

- [x] Explicit sketch creation workflow
- [x] Plane selection when creating a sketch:
  - Default planes (XY / YZ / XZ)
  - Planar faces
  - Construction planes
- [x] Visual confirmation of active sketch plane
- [x] Automatic camera alignment to sketch plane

---

## Sketching (2D) — **Professional Baseline**

### **Sketch Snapping & Inference (Added)**
- [x] Endpoint snapping
- [x] Midpoint snapping
- [x] Center snapping
- [x] Intersection snapping
- [x] Origin snapping
- [x] Grid snapping (toggleable)
- [x] Constraint inference previews before click

### Sketch Geometry
- [x] Lines, arcs, circles, splines
- [x] Single point tool *(Added)*
- [x] Rectangles (corner, center)
- [x] Slots
- [x] Polygons
- [x] Ellipses

### Sketch Editing Tools
- [x] Trim / extend (basic line-line trim)
- [x] Offset sketch geometry *(Added)*
- [x] Mirror sketch geometry *(Added)*
- [x] Sketch patterns
- [x] Construction geometry
- [ ] Derived / reused sketches
- [x] Fix / unfix sketch entities *(Added)*

### **Dimensions & Measurement (Added — Mandatory)**
- [x] Linear dimensions
- [x] Angular dimensions
- [x] Radial / diameter dimensions
- [x] Driven vs driving dimensions
- [x] Inline dimension editing
- [x] Dimension to origin
- [x] Dimension to construction geometry *(Already supported)*
- [x] Measurement tool (temporary, non-driving)

### Constraints
- [x] Coincident
- [x] Parallel
- [x] Perpendicular
- [x] Tangent (backend only)
- [x] Horizontal / Vertical
- [x] Equal
- [x] Fix constraint *(Added)*
- [x] Distance constraint *(Added)*
- [x] Angle constraint *(Added)*
- [x] Constraint suppression *(Added)*

### Constraint Solver Requirements
- [x] Incremental solving
- [x] Redundant constraint detection
- [x] Conflict explanation
- [x] Partial / relaxed solve
- [x] Fully / under / over constrained detection
- [x] Visual constrained/unconstrained indicators *(Added)*

### Sketch Integration
- [x] Sketch plane selection
- [ ] Edge/face projection
- [ ] Stable references to 3D geometry

---

## **Phase 1.5 — Sketch Usability Gate (Added)**

The project must not proceed to advanced solid modeling unless:

- Sketches can be fully constrained
- Dimensions are editable and stable
- Origin-based dimensioning works
- Plane selection is explicit
- Snapping behavior is predictable
- Symmetric profiles are easy to construct

---

## Phase 2 — Core Solid Modeling Parity

**Target:** SolidWorks / Onshape part design workflows.

### Solid Features
- [ ] Fillet (constant)
- [ ] Chamfer
- [ ] Shell
- [ ] Draft
- [ ] Offset faces
- [ ] Linear patterns
- [ ] Circular patterns
- [ ] Mirror features
- [ ] Mirror bodies

### Reference Geometry
- [x] Construction planes *(PlaneModal, offset mode)*
- [ ] Axes
- [x] Reference points *(PointModal)*
- [ ] Midplanes

### Parametrics & Configurations
- [x] Global parameters *(VariablesPanel, VariableStore)*
- [x] Expressions *(Expression evaluator with variable references)*
- [x] Unit-aware equations *(Unit system with Length/Angle types)*
- [ ] Parameter tables
- [ ] Feature-linked parameters
- [ ] Part configurations
- [ ] Configuration-specific suppression

### Body & Part Management
- [ ] Body folders
- [ ] Boolean-scoped bodies
- [ ] Promote body → part
- [ ] Derive part from part

---

## Phase 3 — Surface & Advanced Modeling

### Surface Modeling
- [ ] Surface extrude
- [ ] Surface revolve
- [ ] Sweep
- [ ] Loft (multi-section)
- [ ] Guide curves
- [ ] Surface trim
- [ ] Surface knit
- [ ] Surface offset
- [ ] Solid from surfaces

### Advanced Solid Tools
- [ ] Variable fillet
- [ ] Face blends
- [ ] Replace face
- [ ] Delete face (heal)
- [ ] Boolean between bodies

---

## Phase 4 — Assemblies

### Assembly Architecture
- [ ] Multi-part documents
- [ ] Insert parts
- [ ] Sub-assemblies
- [ ] Lightweight representations
- [ ] Flexible vs rigid subassemblies
- [ ] In-context part editing
- [ ] Replace component

### Mates & Joints
- [ ] Rigid mate
- [ ] Revolute
- [ ] Slider
- [ ] Cylindrical
- [ ] Planar
- [ ] Distance / angle mates
- [ ] Mate limits

### Assembly Configurations
- [ ] Assembly-level configurations
- [ ] Suppressed components per config
- [ ] Config-driven parameters

### Assembly Tools
- [ ] Exploded views
- [ ] Interference detection
- [ ] Motion preview
- [ ] Component suppression

---

## Phase 5 — Manufacturing Prep & Validation

### Analysis Tools
- [ ] Section views
- [ ] Measure tools
- [ ] Mass properties
- [ ] Center of gravity
- [ ] Bounding boxes
- [ ] Draft analysis
- [ ] Thickness analysis

### Import / Export
- [ ] STEP (AP203 / AP214)
- [ ] IGES
- [ ] STL (binary / ASCII)
- [ ] OBJ
- [ ] DXF (sketch & drawing)
- [ ] Mesh refinement controls

---

## Phase 6 — Drawings & Documentation (Mandatory)

### 2D Drawings
- [ ] Drawing workspace
- [ ] Standard views (front/top/side/iso)
- [ ] Section views
- [ ] Detail views
- [ ] Associative dimensions
- [ ] GD&T annotations
- [ ] Notes & callouts
- [ ] Title blocks
- [ ] Drawing templates

### Export
- [ ] DXF
- [ ] DWG
- [ ] PDF

---

## Phase 7 — Collaboration, Versioning & Platform

### Version Control
- [ ] Model version graph
- [ ] Branching
- [ ] Merging
- [ ] Feature-level diffs
- [ ] Conflict detection

### Collaboration
- [ ] Multi-user sessions
- [ ] Live cursors
- [ ] Feature locking
- [ ] Comments & annotations
- [ ] Presence indicators

### Extensibility
- [ ] Plugin architecture
- [ ] Custom features
- [ ] Custom commands
- [ ] Scripting hooks

---

## Phase 8 — UX, Performance & Scale

### Professional UX
- [ ] Command palette
- [ ] Keyboard shortcuts
- [ ] Feature search
- [ ] Context menus
- [ ] Robust undo/redo
- [ ] Error highlighting & diagnostics
- [ ] Mode indicator
- [ ] Status bar (constraints, units, sketch state)

### Performance
- [ ] Partial regeneration
- [ ] Incremental rebuilds
- [ ] Geometry caching
- [ ] Parallel regeneration
- [ ] Large-assembly instancing
- [ ] Occlusion culling
- [ ] LOD rendering
- [ ] Background regeneration

---

## Phase 9 — CAM

### CAM
- [ ] todo

### Performance
- [ ] todo

---

## Definition of “Competitive”

The system is considered **competitive** when it supports:

- Stable parametric modeling
- Robust sketch constraints
- Reliable history editing
- Assemblies with configurations
- 2D drawings
- STEP/DXF interoperability
- Browser-based professional workflow
- Self-hosted deployment
- Mode-aware toolbars
- Dimensioned, origin-referenced sketches
- Command palette workflows

---

## Final Notes

- Truck is the **single source of truth** for B-rep geometry
- Topological stability is non-negotiable
- Every feature must be:
  - Parametric
  - Editable
  - Regenerable
- Mesh-only hacks are forbidden outside visualization/export
- Popup-only toolbars are explicitly forbidden
- Sketching without snapping or dimensions is unacceptable

**This roadmap is intentionally aggressive.**  
Cutting scope reduces competitiveness.  
Cutting correctness makes the system unusable.
