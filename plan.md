# Self-Hosted Parametric CAD Platform  
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
- **CAD Kernel:** MicroCAD (https://microcad.xyz)  
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
│ MicroCAD Kernel            │
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
- [ ] Math & geometry utility layer
- [x] Unit system (mm, inch, deg, etc.)

### **UI Infrastructure (Added)**
- [ ] Mode-aware toolbar system
- [ ] Persistent layout (toolbar always visible)
- [x] Hover tooltips with descriptions *(Added - ToolButton component)*
- [ ] Keyboard shortcut system
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
- [ ] `SelectionField` — Reusable "click to select entity" input field
- [ ] `NumericInput` — Styled number input with unit support
- [x] `ToolButton` — Toolbar button with rich tooltip, shortcut, and description display *(Added)*


### MicroCAD Integration
- [ ] Embed MicroCAD Runtime
- [x] Program generation layer
- [x] MicroCAD AST/source mapping
- [ ] Deterministic evaluation guarantees
- [ ] Kernel error propagation to UI

### **Topological Naming & References (Critical)**
- [x] Persistent face/edge/vertex IDs
- [x] Reference tracking across regenerations
- [ ] Stable selection resolution
- [ ] Failure recovery strategies
- [x] Explicit “reference broken” reporting

### Selection System (Foundational)
- [x] Selection filters (face/edge/vertex/body)
- [x] Persistent selections
- [x] Preselection & hover logic
- [ ] Named selections / selection sets

### Rendering Pipeline
- [x] WebGL/WebGPU renderer
- [ ] Tessellation from MicroCAD
- [ ] Normals & edge rendering
- [ ] Face/edge/vertex picking
- [x] Camera controls (orbit/pan/zoom)
- [ ] LOD groundwork

---

## Phase 1 — Parametric Core & Sketching (Single Part)

**Goal:** Usable parametric part modeling without rage-quitting.

### Feature Tree System
- [x] Feature DAG
- [x] Deterministic regeneration order
- [ ] Rollback & roll-forward preview
- [x] Feature suppression
- [ ] Feature reordering (with constraints)
- [ ] Insert/replace features mid-tree
- [ ] Dependency visualization

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
- [ ] Constraint inference previews before click

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
- [ ] Dimension to construction geometry
- [ ] Measurement tool (temporary, non-driving)

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
- [ ] Construction planes
- [ ] Axes
- [ ] Reference points
- [ ] Midplanes

### Parametrics & Configurations
- [ ] Global parameters
- [ ] Expressions
- [ ] Unit-aware equations
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

- MicroCAD is the **single source of truth** for geometry
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
