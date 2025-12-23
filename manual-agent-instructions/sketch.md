# Parametric Sketching System  
## Complete Behavioral & Visual Specification

> This document defines the **full sketching subsystem** for a browser-based, parametric CAD platform.  
> Behavior, visuals, interactions, and constraint logic are modeled primarily after **Onshape**, with clarifications and explicit rules suitable for implementation.

---

## 1. Sketch Mode Lifecycle

### 1.1 Entering Sketch Mode
Sketch Mode is entered when:
- A plane is selected (default planes or planar face)
- User activates “New Sketch”

System actions:
- Camera:
  - Orthographic projection
  - Normal aligned to sketch plane
  - Rotation locked (pan/zoom allowed)
- Visual:
  - Non-sketch geometry faded to ~30% opacity
  - Active plane highlighted
  - Grid rendered on plane
- UI:
  - Sketch toolbar replaces main toolbar
  - Constraint & dimension palettes become active

---

### 1.2 Exiting Sketch Mode
On exit:
- All sketch geometry validated by solver
- Failed constraints highlighted
- Sketch saved as parametric feature
- Camera restored to prior projection

---

## 2. Coordinate System & Grid

### 2.1 Grid Behavior
- Grid exists **only in sketch plane**
- Grid spacing:
  - Adaptive with zoom
  - Snaps optionally quantized to grid intersections
- Grid lines:
  - Major lines darker
  - Minor lines lighter
- Grid never creates constraints unless explicitly snapped

---

### 2.2 Origin & Axes
- Origin:
  - Rendered as solid point
  - Always selectable
- Axes:
  - X axis: red
  - Y axis: green
- Axes act as infinite construction lines

---

## 3. Entity Selection System

### 3.1 Selection Priority
When cursor overlaps multiple entities:

1. Sketch points
2. Constraint icons
3. Dimension annotations
4. Sketch curves (lines/arcs)
5. Construction geometry
6. Projected edges

Scroll wheel cycles candidates.

---

### 3.2 Hover State
On hover:
- Entity renders with **pre-highlight**
- Constraint icons glow subtly
- Cursor changes to context-aware pointer

No state mutation occurs on hover.

---

### 3.3 Selected State
When selected:
- Entity rendered in **active selection color**
- Selection persists across tool changes
- Selected geometry is the **primary operand** for new tools

---

## 4. Snapping & Inference Engine

### 4.1 Snap Detection Pipeline
Per cursor move:
1. Collect candidate entities within snap radius
2. Evaluate snap types per entity
3. Rank snaps by priority
4. Display highest-priority snap glyph
5. Apply inference preview

---

### 4.2 Snap Types & Visual Glyphs

| Snap Type | Glyph | Description |
|--------|------|------------|
| Endpoint | ■ | Line/arc endpoint |
| Midpoint | ▲ | Line midpoint |
| Coincident | ● | Point on entity |
| Intersection | ✕ | Crossing entities |
| Horizontal | H | Horizontal inference |
| Vertical | V | Vertical inference |
| Parallel | ∥ | Parallel alignment |
| Perpendicular | ⟂ | Right angle |
| Tangent | ⌒ | Tangent arc/line |
| Center | ⊕ | Arc/circle center |
| Quadrant | ◔ | Cardinal point |

---

### 4.3 Snap Preview Behavior
- Snap glyph follows cursor
- Target geometry highlights
- Preview line/arc rendered dashed
- Snap may be:
  - **Soft** (visual only)
  - **Hard** (creates constraint on commit)

Modifier keys:
- `Alt`: suppress constraint creation
- `Shift`: bias orthogonal inference

---

## 5. Geometry Creation Tools

### 5.1 Line Tool

#### Activation
- Cursor switches to crosshair
- Status bar shows “Select start point”

#### Creation Flow
1. Click start point
2. Drag:
   - Rubber-band preview
   - Angle readout appears near cursor
3. Inference detection:
   - Horizontal / Vertical
   - Coincident snaps
4. Click end point

#### On Commit
Auto-constraints applied:
- Coincident endpoints
- Horizontal/Vertical if inferred

Tool remains active.

---

### 5.2 Rectangle Tool

#### Corner Rectangle
- First click: anchor corner
- Drag: diagonal preview
- Constraints:
  - 4 coincident corners
  - Horizontal & vertical edges

#### Center Rectangle (Modifier)
- First click: center
- Drag: half-extents
- Symmetry constraints auto-added

---

### 5.3 Circle Tool

#### Center-Radius
1. Click center
2. Drag radius
3. Inline radius dimension appears

#### 3-Point
- Three snapped points define circle

Auto constraints:
- Coincident points
- Equal radius (implicit)

---

### 5.4 Arc Tool

#### 3-Point Arc
- Start → End → Bulge
- Endpoints coincident by default
- Tangent inference applied if detected

---

## 6. Construction Geometry

### 6.1 Construction Toggle
- Any entity can be toggled
- Rendered dashed
- Ignored by feature generation

---

## 7. Constraint System

### 7.1 Implicit Constraints
Applied automatically:
- Coincident
- Horizontal
- Vertical
- Parallel
- Perpendicular
- Tangent

Auto-constraint setting is user-configurable.

---

### 7.2 Explicit Constraints

| Constraint | Selection Requirements |
|---------|------------------------|
| Coincident | Point + entity |
| Parallel | Two lines |
| Perpendicular | Two lines |
| Tangent | Arc + line |
| Equal | Two compatible entities |
| Symmetric | Two entities + axis |
| Fix | Any entity |

---

### 7.3 Constraint Visualization
- Icons rendered near constrained geometry
- Hover highlights affected entities
- Click selects constraint
- Delete removes constraint

---

## 8. Dimensioning System

### 8.1 Dimension Tool Activation
- Cursor changes to dimension icon
- Pre-selected geometry auto-targeted

---

### 8.2 Dimension Types

#### Linear
- Line length
- Point-to-point distance
- Point-to-line offset

#### Angular
- Two lines
- Arc angle

#### Radial
- Circle radius
- Circle diameter (default)

---

### 8.3 Dimension Placement
- Dimension preview follows cursor
- Orientation flips intelligently
- Placement click commits

---

### 8.4 Editing Dimensions
- Click dimension → inline editor
- Accepts:
  - Numbers
  - Expressions
  - Variables

Driving vs driven:
- Driven dimensions rendered in parentheses

---

## 9. Solver Feedback

### 9.1 Definition States

| State | Color |
|----|------|
| Under-defined | Blue |
| Fully defined | Black |
| Over-defined | Red |

---

### 9.2 Conflict Resolution
- Conflicting constraints highlighted
- Warning badge shown
- User can suppress or delete constraints

---

## 10. Keyboard & Interaction Model

| Key | Action |
|---|------|
| L | Line |
| C | Circle |
| D | Dimension |
| Esc | Exit tool |
| Space | Repeat last tool |
| Ctrl/Cmd | Toggle selection |
| Shift | Multi-select |
| Alt | Suppress constraints |

---

## 11. Visual Fidelity Requirements

- Hover latency < 50ms
- Constraint icons fade in/out
- Dimension text scales with zoom
- No visual popping
- Cursor always context-aware

---

## 12. Internal Data Model (Sketch)

Each entity stores:
- Geometry definition
- Constraint references
- Degrees of freedom
- Dependency graph links

Constraints are solver-level primitives, not attributes.

---

## 13. Non-Goals (Explicit)

- No freeform splines in initial version
- No 3D sketching
- No surface constraints

---

## 14. Guiding Principle

> **Every action should feel predictive, not reactive.**

The user should always see:
- What will happen
- What will be constrained
- What will move

Before committing an action.
