use uuid::Uuid;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::collections::HashMap;

pub mod naming;
pub use naming::*;

pub mod generator;
pub use generator::IdGenerator;
pub mod registry;
pub use registry::TopoRegistry;
pub mod selection;
pub use selection::{SelectionState, SelectionFilter, SelectionGroup};

#[cfg(test)]
mod tests_stability;
#[cfg(test)]
mod tests_selection;
#[cfg(test)]
mod tests_resolution;




/// A universally unique identifier for any topological entity (Vertex, Edge, Face, Body).
/// We wrap Uuid to ensure strong typing and allow for potential future extension 
/// (e.g. adding generation/version counters).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct EntityId(pub Uuid);

impl EntityId {
    /// Generate a new random EntityId.
    /// In a deterministic system, this should be seeded or derived from the operation hash.
    /// For Phase 0, we trust the caller to manage determinism or use this for root objects.
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    /// Create an ID from a specific UUID (useful for restoration).
    pub fn from_uuid(uuid: Uuid) -> Self {
        Self(uuid)
    }

    /// Create a deterministic ID based on a string seed (e.g. "Extrude1_FaceTop").
    /// This is crucial for the "Topological Naming Problem".
    pub fn new_deterministic(seed: &str) -> Self {
        let uuid = Uuid::new_v5(&Uuid::NAMESPACE_OID, seed.as_bytes());
        Self(uuid)
    }
}

impl fmt::Display for EntityId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TopologyType {
    Vertex,
    Edge,
    Face,
    Body,
}

/// Represents a pointer to a specific piece of geometry in the context of the history.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TopoRef {
    pub id: EntityId,
    pub nature: TopologyType,
    // Future: path to the entity in assembly, generation ID, etc.
}

/// A registry to resolve IDs to actual kernel geometry objects.
/// Since we don't have the full kernel yet, this is a placeholder interface.
pub struct TopoMap<T> {
    map: HashMap<EntityId, T>,
}

impl<T> TopoMap<T> {
    pub fn new() -> Self {
        Self { map: HashMap::new() }
    }

    pub fn insert(&mut self, id: EntityId, item: T) {
        self.map.insert(id, item);
    }

    pub fn get(&self, id: &EntityId) -> Option<&T> {
        self.map.get(id)
    }
}
