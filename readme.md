# Agentic CAD Suite Experiment, ARE WE COOKED?

## Overview

This project is an experiment in using agentic AI editors to design and build a parametric CAD application with the complexity and interactivity of modern CAD software.

The intent is not necessarily to create a production-ready CAD application, but to test agentic systems on a difficult problem to evaluate their abilities.

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

## Method

The project follows a strict **end-user–only evaluation model**:

- The human operator does not read, write, or modify source code
- All evaluation is based on observable behavior and user experience
- The agent receives detailed product and behavior specifications, not implementation instructions

