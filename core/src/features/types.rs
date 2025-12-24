use serde::{Deserialize, Serialize};
use crate::topo::EntityId;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ParameterValue {
    Float(f64),
    String(String),
    Bool(bool),
    Sketch(crate::sketch::types::Sketch),
    Reference(crate::topo::naming::TopoId),
    List(Vec<String>),
    /// Profile regions for region-based extrusion.
    /// Each item is a list of loops (first is outer, rest are holes).
    /// Each loop is a list of 2D points [[x,y], ...].
    ProfileRegions(Vec<Vec<Vec<[f64; 2]>>>),
    // Expression(String), // TODO: Add expression parsing
}

/// Operation type for extrude features
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub enum ExtrudeOperation {
    #[default]
    Add,       // Boss/Pad - adds material
    Cut,       // Pocket - removes material
    Intersect, // Keep only the intersection
}

/// Direction for extrude features
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ExtrudeDirection {
    Normal,             // Normal to sketch plane (default)
    Symmetric,          // Both directions equally
    Custom([f64; 3]),   // Custom direction vector
}

/// Axis definition for revolve features
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub enum RevolveAxis {
    #[default]
    X,                  // Revolve around X axis at origin
    Y,                  // Revolve around Y axis at origin  
    Custom {            // Custom axis
        origin: [f64; 3],
        direction: [f64; 3],
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub value: ParameterValue,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum FeatureType {
    Sketch,
    Extrude,
    Revolve,
    Cut,
    // Datums
    Plane,
    Axis,
    Point,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feature {
    pub id: EntityId,
    pub name: String,
    pub feature_type: FeatureType,
    pub parameters: HashMap<String, ParameterValue>,
    pub dependencies: Vec<EntityId>, // IDs of features this feature depends on
    pub suppressed: bool,
}

impl Feature {
    pub fn new(name: &str, ftype: FeatureType) -> Self {
        Self {
            id: EntityId::new(),
            name: name.to_string(),
            feature_type: ftype,
            parameters: HashMap::new(),
            dependencies: Vec::new(),
            suppressed: false,
        }
    }

    pub fn with_param(mut self, name: &str, value: ParameterValue) -> Self {
        self.parameters.insert(name.to_string(), value);
        self
    }

    pub fn collect_references(&self) -> Vec<crate::topo::naming::TopoId> {
        let mut refs = Vec::new();
        for val in self.parameters.values() {
            if let ParameterValue::Reference(id) = val {
                refs.push(*id);
            }
        }
        refs
    }
}
