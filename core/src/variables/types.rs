//! Core types for the variable system.

use crate::topo::EntityId;
use crate::units::LengthUnit;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Angle unit types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum AngleUnit {
    #[default]
    Degrees,
    Radians,
}

impl AngleUnit {
    /// Convert value to radians (base unit for angles)
    pub fn to_radians(&self, value: f64) -> f64 {
        match self {
            Self::Degrees => value * std::f64::consts::PI / 180.0,
            Self::Radians => value,
        }
    }

    /// Convert from radians to this unit
    pub fn from_radians(&self, radians: f64) -> f64 {
        match self {
            Self::Degrees => radians * 180.0 / std::f64::consts::PI,
            Self::Radians => radians,
        }
    }
}

impl std::fmt::Display for AngleUnit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Degrees => write!(f, "deg"),
            Self::Radians => write!(f, "rad"),
        }
    }
}

/// Unit type for variables
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Default)]
pub enum Unit {
    #[default]
    Dimensionless,
    Length(LengthUnit),
    Angle(AngleUnit),
}

impl Unit {
    /// Convert a value to base units (mm for length, radians for angle)
    pub fn to_base(&self, value: f64) -> f64 {
        match self {
            Self::Dimensionless => value,
            Self::Length(lu) => lu.to_mm(value),
            Self::Angle(au) => au.to_radians(value),
        }
    }

    /// Convert from base units to this unit
    pub fn from_base(&self, base_value: f64) -> f64 {
        match self {
            Self::Dimensionless => base_value,
            Self::Length(lu) => lu.from_mm(base_value),
            Self::Angle(au) => au.from_radians(base_value),
        }
    }

    /// Check if two units are compatible (same dimension)
    pub fn is_compatible(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (Self::Dimensionless, Self::Dimensionless)
                | (Self::Length(_), Self::Length(_))
                | (Self::Angle(_), Self::Angle(_))
        )
    }
}

impl std::fmt::Display for Unit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Dimensionless => write!(f, ""),
            Self::Length(lu) => write!(f, "{}", lu),
            Self::Angle(au) => write!(f, "{}", au),
        }
    }
}

/// A global parametric variable
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variable {
    /// Unique identifier
    pub id: EntityId,
    /// Variable name (case-sensitive, must be unique)
    pub name: String,
    /// Optional description
    pub description: String,
    /// Raw expression text (e.g., "10", "@other * 2", "sqrt(16)")
    pub expression: String,
    /// Unit for this variable
    pub unit: Unit,
    /// Cached evaluated value in variable's own unit (not base unit)
    /// None if not yet evaluated or evaluation failed
    pub cached_value: Option<f64>,
    /// Error message if evaluation failed
    pub error: Option<String>,
}

impl Variable {
    /// Create a new variable with a simple numeric value
    pub fn new(name: &str, value: f64, unit: Unit) -> Self {
        Self {
            id: EntityId::new(),
            name: name.to_string(),
            description: String::new(),
            expression: value.to_string(),
            unit,
            cached_value: Some(value),
            error: None,
        }
    }

    /// Create a new variable with an expression
    pub fn with_expression(name: &str, expression: &str, unit: Unit) -> Self {
        Self {
            id: EntityId::new(),
            name: name.to_string(),
            description: String::new(),
            expression: expression.to_string(),
            unit,
            cached_value: None,
            error: None,
        }
    }
}

/// Container for all global variables in a model
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VariableStore {
    /// Variables indexed by ID
    pub variables: HashMap<EntityId, Variable>,
    /// Fast lookup by name
    #[serde(skip)]
    pub by_name: HashMap<String, EntityId>,
    /// User-defined ordering for UI display
    pub order: Vec<EntityId>,
}

impl VariableStore {
    /// Create an empty variable store
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a variable to the store
    pub fn add(&mut self, variable: Variable) -> Result<EntityId, String> {
        // Check for name collision
        if self.by_name.contains_key(&variable.name) {
            return Err(format!("Variable '{}' already exists", variable.name));
        }

        let id = variable.id;
        self.by_name.insert(variable.name.clone(), id);
        self.order.push(id);
        self.variables.insert(id, variable);
        Ok(id)
    }

    /// Get a variable by ID
    pub fn get(&self, id: EntityId) -> Option<&Variable> {
        self.variables.get(&id)
    }

    /// Get a variable by ID (mutable)
    pub fn get_mut(&mut self, id: EntityId) -> Option<&mut Variable> {
        self.variables.get_mut(&id)
    }

    /// Get a variable by name
    pub fn get_by_name(&self, name: &str) -> Option<&Variable> {
        self.by_name.get(name).and_then(|id| self.variables.get(id))
    }

    /// Update a variable's expression
    pub fn update_expression(&mut self, id: EntityId, expression: &str) -> Result<(), String> {
        if let Some(var) = self.variables.get_mut(&id) {
            var.expression = expression.to_string();
            var.cached_value = None; // Invalidate cache
            var.error = None;
            Ok(())
        } else {
            Err("Variable not found".to_string())
        }
    }

    /// Update a variable's name (with collision check)
    pub fn update_name(&mut self, id: EntityId, new_name: &str) -> Result<(), String> {
        // Check if new name is already taken by a different variable
        if let Some(&existing_id) = self.by_name.get(new_name) {
            if existing_id != id {
                return Err(format!("Variable '{}' already exists", new_name));
            }
        }

        if let Some(var) = self.variables.get_mut(&id) {
            let old_name = var.name.clone();
            self.by_name.remove(&old_name);
            var.name = new_name.to_string();
            self.by_name.insert(new_name.to_string(), id);
            Ok(())
        } else {
            Err("Variable not found".to_string())
        }
    }

    /// Remove a variable by ID
    pub fn remove(&mut self, id: EntityId) -> Option<Variable> {
        if let Some(var) = self.variables.remove(&id) {
            self.by_name.remove(&var.name);
            self.order.retain(|&oid| oid != id);
            Some(var)
        } else {
            None
        }
    }

    /// Get all variables in user-defined order
    pub fn ordered_variables(&self) -> Vec<&Variable> {
        self.order
            .iter()
            .filter_map(|id| self.variables.get(id))
            .collect()
    }

    /// Rebuild the by_name index (call after deserialization)
    pub fn rebuild_index(&mut self) {
        self.by_name.clear();
        for (id, var) in &self.variables {
            self.by_name.insert(var.name.clone(), *id);
        }
    }

    /// Move a variable to a new position in the order
    pub fn reorder(&mut self, id: EntityId, new_index: usize) -> Result<(), String> {
        if !self.variables.contains_key(&id) {
            return Err("Variable not found".to_string());
        }

        self.order.retain(|&oid| oid != id);
        let insert_at = new_index.min(self.order.len());
        self.order.insert(insert_at, id);
        Ok(())
    }

    /// Update a variable's unit
    pub fn update_unit(&mut self, id: EntityId, unit: Unit) -> Result<(), String> {
        if let Some(var) = self.variables.get_mut(&id) {
            var.unit = unit;
            var.cached_value = None; // Invalidate cache as unit changes meaning
            var.error = None;
            Ok(())
        } else {
            Err("Variable not found".to_string())
        }
    }

    /// Update a variable's description
    pub fn update_description(&mut self, id: EntityId, description: &str) -> Result<(), String> {
        if let Some(var) = self.variables.get_mut(&id) {
            var.description = description.to_string();
            Ok(())
        } else {
            Err("Variable not found".to_string())
        }
    }
}

