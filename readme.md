# Agentic CAD Suite Experiment, ARE WE COOKED?

## Overview

This project is an experiment in using agentic AI editors to design and build a parametric CAD application with the complexity and interactivity of modern CAD software.

The intent is not necessarily to create a production-ready CAD application, but to test agentic systems on a difficult problem to evaluate their abilities.

## Method

The project follows a strict **end-user–only evaluation model**:

- The human operator does not read, write, or modify source code
- All evaluation is based on observable behavior and user experience
- The agent receives detailed product and behavior specifications, not implementation instructions

## How it Works

The application is a **self-hosted, browser-based parametric CAD system** built with a modern stack:
- **Backend (Rust):** Handles the feature graph, constraint solver, and coordinates with the geometry kernel.
- **Frontend (SolidJS + TypeScript):** A high-performance UI using Three.js for 3D rendering and a custom sketching engine.
- **Parametric Engine:** Uses a "feature-based" approach where models are defined by a history of operations (sketches, extrusions, etc.) rather than static meshes.
- **Constraint Solver:** An incremental solver ensures that sketches remain mathematically consistent as you apply dimensions and constraints.

## Future Plans

The project is structured into several phases to achieve professional-grade parity:
- **Phase 0-1 (Current):** Foundations, CAD correctness, and core parametric sketching.
- **Phase 2:** Core solid modeling (Fillets, Chamfers, Patterns, Shells).
- **Phase 3-4:** Advanced surface modeling and assembly management (Mates/Joints).
- **Phase 5-6:** Manufacturing prep (STEP/IGES export) and 2D drawing generation.
- **Phase 7+:** Version control (Git-like branching for models) and multi-user collaboration.

### Status & Implemented Features

#### Phase 0: Foundations & CAD Correctness
- [x] **Core Infrastructure**
    - [x] Rust workspace & module boundaries
    - [x] SolidJS frontend scaffold
    - [x] Backend API framework
    - [x] WebSocket-based model sync
    - [x] Deterministic UUID & entity ID system
    - [ ] Math & geometry utility layer
    - [x] Unit system (mm, inch, deg, etc.)
- [x] **UI Infrastructure**
    - [x] Mode-aware toolbar system
    - [x] Persistent layout (toolbar always visible)
    - [x] Hover tooltips with descriptions
    - [x] Keyboard shortcut system (with customization)
    - [x] Command palette infrastructure
- [x] **Reusable UI Components**
    - [x] `BaseModal` (Draggable, theme-consistent)
    - [x] `CommandPalette` (Fuzzy search, mode-aware)
    - [ ] `SelectionField` (Pick-to-select input)
    - [x] `NumericInput` (Unit & variable support)
    - [x] `ToolButton` (Rich tooltips & shortcuts)
- [ ] **Geometry Kernel (MicroCAD Integration)**
    - [ ] Embed MicroCAD Runtime
    - [x] Program generation layer
    - [x] MicroCAD AST/source mapping
    - [ ] Deterministic evaluation guarantees
    - [ ] Kernel error propagation to UI
- [ ] **Topological Naming & References**
    - [x] Persistent face/edge/vertex IDs
    - [x] Reference tracking across regenerations
    - [ ] Stable selection resolution
    - [ ] Failure recovery strategies
    - [x] Explicit “reference broken” reporting
- [x] **Selection System**
    - [x] Selection filters (face/edge/vertex/body)
    - [x] Persistent selections
    - [x] Preselection & hover logic
    - [x] Named selections / selection sets
- [ ] **Rendering Pipeline**
    - [x] WebGL/WebGPU renderer
    - [ ] Tessellation from MicroCAD
    - [ ] Normals & edge rendering
    - [ ] Face/edge/vertex picking
    - [x] Camera controls (orbit/pan/zoom)
    - [ ] LOD groundwork

#### Phase 1: Parametric Core & Sketching
- [ ] **Feature Tree System**
    - [x] Feature DAG
    - [x] Deterministic regeneration order
    - [ ] Rollback & roll-forward preview
    - [x] Feature suppression
    - [ ] Feature reordering
    - [ ] Insert/replace features mid-tree
    - [ ] Dependency visualization
- [x] **Sketch Mode & Plane Selection**
    - [x] Explicit sketch creation workflow
    - [x] Plane selection (Planes, Planar faces, Construction planes)
    - [x] Visual active plane confirmation
    - [x] Automatic camera alignment
- [x] **2D Sketching Engine**
    - [x] **Snapping:** Endpoint, Midpoint, Center, Intersection, Origin, Grid
    - [ ] Constraint inference previews
    - [x] **Geometry:** Lines, Arcs, Circles, Splines, Points, Rectangles, Slots, Polygons, Ellipses
    - [x] **Editing:** Trim/Extend, Offset, Mirror, Patterns, Construction geometry, Fix/Unfix
    - [x] **Dimensions:** Linear, Angular, Radial, Driven/Driving, Inline editing
    - [x] **Constraints:** Coincident, Parallel, Perpendicular, Tangent, Horiz/Vert, Equal, Fix, Distance, Angle
    - [x] **Solver:** Incremental solving, Conflict detection, Constrained state indicators

#### Phase 2-3: Solid & Surface Modeling
- [ ] **Solid Features** (Fillet, Chamfer, Shell, Draft, Offset faces, Patterns, Mirror)
- [ ] **Reference Geometry** (Construction planes, Axes, Points, Midplanes)
- [ ] **Parametrics & Configurations** (Global parameters, Expressions, Equations, Tables)
- [ ] **Body & Part Management** (Folders, Boolean scope, Part derivation)
- [ ] **Surface Modeling** (Extrude/Revolve/Sweep/Loft, Trim, Knit, Offset)

#### Phase 4-6: Assemblies & Manufacturing
- [ ] **Assemblies** (Multi-part docs, Sub-assemblies, Mates, Joints, Exploded views)
- [ ] **Manufacturing Prep** (Section views, Measure tool, Mass properties, Draft analysis)
- [ ] **Import/Export** (STEP, IGES, STL, OBJ, DXF)
- [ ] **2D Drawings** (Standard views, Section views, Associative dimensions, GD&T, PDF export)

#### Phase 7+: Platform & Advanced Features
- [ ] **Collaboration & Versioning** (Branching, Merging, Live cursors, Multi-user sessions)
- [ ] **Extensibility** (Plugin architecture, Custom features/commands, Scripting hooks)
- [ ] **Performance & Scale** (Incremental rebuilds, Geometry caching, Occlusion culling, Background regeneration)
- [ ] **CAM Integration**

For a detailed roadmap, see [plan.md](./plan.md).

## How to Run

### Prerequisites
- [Rust](https://www.rust-lang.org/) (latest stable)
- [Node.js](https://nodejs.org/) (v18+)

### Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run Development Environment:**
    This command starts both the Rust backend and the Vite frontend simultaneously in a single terminal.
    ```bash
    npm run dev
    ```

3.  **Build for Production:**
    ```bash
    npm run build
    ```
