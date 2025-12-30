use crate::geometry::{Point3, Vector3};
use crate::topo::EntityId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SketchPlane {
    pub origin: Point3,
    pub normal: Vector3,
    pub x_axis: Vector3,
    pub y_axis: Vector3,
}

impl Default for SketchPlane {
    fn default() -> Self {
        Self {
            origin: Point3::origin(),
            normal: Vector3::z_axis().into_inner(),
            x_axis: Vector3::x_axis().into_inner(),
            y_axis: Vector3::y_axis().into_inner(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SketchGeometry {
    Line { start: [f64; 2], end: [f64; 2] },
    Circle { center: [f64; 2], radius: f64 },
    Arc { center: [f64; 2], radius: f64, start_angle: f64, end_angle: f64 },
    Point { pos: [f64; 2] },
    /// Ellipse defined by center, semi-major axis, semi-minor axis, and rotation
    /// DOF: 5 (center_x, center_y, semi_major, semi_minor, rotation)
    Ellipse { center: [f64; 2], semi_major: f64, semi_minor: f64, rotation: f64 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SketchEntity {
    pub id: EntityId,
    pub geometry: SketchGeometry,
    #[serde(default)]
    pub is_construction: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ConstraintPoint {
    pub id: EntityId,
    pub index: u8, // 0=Start/Center/Pos, 1=End
}

/// Style configuration for visible dimension annotations
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DimensionStyle {
    /// If true, dimension is reference-only (driven). If false, it drives the geometry (driving).
    pub driven: bool,
    /// Offset position for the dimension annotation text from the midpoint
    pub offset: [f64; 2],
    /// Optional expression string (e.g., "@thickness" or "@base * 2")
    /// When present, the constraint value is re-evaluated from this expression during regeneration
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
}

impl Default for DimensionStyle {
    fn default() -> Self {
        Self {
            driven: false,
            offset: [0.0, 0.5], // Default offset above the dimension line
            expression: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SketchConstraint {
    Coincident { points: [ConstraintPoint; 2] }, 
    Horizontal { entity: EntityId }, // Assuming line
    Vertical { entity: EntityId },   // Assuming line
    /// Distance constraint between two points
    Distance { 
        points: [ConstraintPoint; 2], 
        value: f64,
        /// If Some, renders as a visible dimension annotation
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    /// Horizontal Distance (X-axis) between two points
    HorizontalDistance { 
        points: [ConstraintPoint; 2], 
        value: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    /// Vertical Distance (Y-axis) between two points
    VerticalDistance { 
        points: [ConstraintPoint; 2], 
        value: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    /// Angle constraint between two lines
    Angle {
        lines: [EntityId; 2],
        value: f64, // radians
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    /// Radius constraint for a Circle or Arc
    Radius {
        entity: EntityId,
        value: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    Parallel { lines: [EntityId; 2] },
    Perpendicular { lines: [EntityId; 2] },
    Tangent { entities: [EntityId; 2] }, // Generic entity reference
    Equal { entities: [EntityId; 2] },
    /// Symmetric constraint: p2 is the reflection of p1 across the axis line
    Symmetric { p1: ConstraintPoint, p2: ConstraintPoint, axis: EntityId },
    Fix { point: ConstraintPoint, position: [f64; 2] },
    /// Distance between a point and an infinite line (perpendicular distance)
    DistancePointLine {
        point: ConstraintPoint,
        line: EntityId,
        value: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
    /// Distance between two parallel lines (perpendicular distance)
    DistanceParallelLines {
        lines: [EntityId; 2],
        value: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        style: Option<DimensionStyle>,
    },
}

/// Wrapper for constraints with suppression state and future metadata
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SketchConstraintEntry {
    pub constraint: SketchConstraint,
    #[serde(default)]
    pub suppressed: bool,
}

impl SketchConstraintEntry {
    pub fn new(constraint: SketchConstraint) -> Self {
        Self { constraint, suppressed: false }
    }

    pub fn suppressed(constraint: SketchConstraint) -> Self {
        Self { constraint, suppressed: true }
    }
}

impl From<SketchConstraint> for SketchConstraintEntry {
    fn from(constraint: SketchConstraint) -> Self {
        Self::new(constraint)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SketchOperation {
    AddGeometry { id: EntityId, geometry: SketchGeometry },
    AddConstraint { constraint: SketchConstraint },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Sketch {
    pub plane: SketchPlane,
    // Using a Vec for ordered iteration stability, but could be HashMap. 
    // For Phase 1, linear scan is fine, stability of order is nice for UI.
    pub entities: Vec<SketchEntity>,
    pub constraints: Vec<SketchConstraintEntry>,
    #[serde(default)]
    pub history: Vec<SketchOperation>,
    /// Maps local EntityId (in the sketch) to the stable TopoId (from the 3D kernel) it references.
    #[serde(default)]
    pub external_references: std::collections::HashMap<EntityId, crate::topo::naming::TopoId>,
}

impl Sketch {
    pub fn new(plane: SketchPlane) -> Self {
        Self {
            plane,
            entities: Vec::new(),
            constraints: Vec::new(),
            history: Vec::new(),
            external_references: std::collections::HashMap::new(),
        }
    }

    pub fn add_entity(&mut self, geometry: SketchGeometry) -> EntityId {
        let id = EntityId::new();
        self.entities.push(SketchEntity { id, geometry: geometry.clone(), is_construction: false });
        self.history.push(SketchOperation::AddGeometry { id, geometry });
        id
    }

    pub fn add_constraint(&mut self, constraint: SketchConstraint) {
        self.constraints.push(SketchConstraintEntry::new(constraint.clone()));
        self.history.push(SketchOperation::AddConstraint { constraint });
    }

    /// Add constraint with explicit suppression state
    pub fn add_constraint_with_suppression(&mut self, constraint: SketchConstraint, suppressed: bool) {
        self.constraints.push(SketchConstraintEntry { constraint: constraint.clone(), suppressed });
        self.history.push(SketchOperation::AddConstraint { constraint });
    }

    /// Toggle suppression state for a constraint by index
    pub fn toggle_constraint_suppression(&mut self, index: usize) -> bool {
        if let Some(entry) = self.constraints.get_mut(index) {
            entry.suppressed = !entry.suppressed;
            entry.suppressed
        } else {
            false
        }
    }

    /// Set suppression state for a constraint by index
    pub fn set_constraint_suppression(&mut self, index: usize, suppressed: bool) {
        if let Some(entry) = self.constraints.get_mut(index) {
            entry.suppressed = suppressed;
        }
    }

    /// Get active (non-suppressed) constraints
    pub fn active_constraints(&self) -> impl Iterator<Item = &SketchConstraint> {
        self.constraints.iter()
            .filter(|e| !e.suppressed)
            .map(|e| &e.constraint)
    }

    /// Populates history from entities and constraints if history is empty.
    /// This is for migrating legacy sketches.
    pub fn ensure_history(&mut self) {
        if !self.history.is_empty() {
            return;
        }

        if self.entities.is_empty() && self.constraints.is_empty() {
            return;
        }

        // Reconstruct history from current state
        // Note: This assumes the current order is the creation order, which is the best guess we have.
        for entity in &self.entities {
            self.history.push(SketchOperation::AddGeometry { 
                id: entity.id, 
                geometry: entity.geometry.clone() 
            });
        }

        for entry in &self.constraints {
            self.history.push(SketchOperation::AddConstraint { 
                constraint: entry.constraint.clone() 
            });
        }
    }

    /// Resolve all constraint expressions using the given variable store.
    /// Updates constraint numeric values based on their stored expressions.
    /// Returns the number of expressions that were successfully resolved.
    pub fn resolve_expressions(&mut self, variables: &crate::variables::VariableStore) -> usize {
        use crate::variables::evaluator::evaluate;
        
        let mut resolved_count = 0;
        
        for entry in &mut self.constraints {
            if entry.suppressed {
                continue;
            }
            
            // Helper to resolve an expression if present
            fn resolve_expr_value(
                style: &Option<DimensionStyle>,
                current_value: &mut f64,
                variables: &crate::variables::VariableStore,
            ) -> bool {
                if let Some(ref s) = style {
                    if let Some(ref expr) = s.expression {
                        if let Ok(value) = evaluate(expr, variables) {
                            *current_value = value;
                            return true;
                        }
                    }
                }
                false
            }
            
            match &mut entry.constraint {
                SketchConstraint::Distance { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                SketchConstraint::HorizontalDistance { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                SketchConstraint::VerticalDistance { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                SketchConstraint::Angle { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                SketchConstraint::Radius { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                SketchConstraint::DistancePointLine { value, style, .. } => {
                    if resolve_expr_value(style, value, variables) {
                        resolved_count += 1;
                    }
                }
                _ => {}
            }
        }
        
        resolved_count
    }
}
