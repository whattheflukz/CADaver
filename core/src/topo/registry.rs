use std::collections::{HashMap, HashSet};
use super::naming::TopoId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum AnalyticGeometry {
    Plane { origin: [f64; 3], normal: [f64; 3] },
    Cylinder { axis_start: [f64; 3], axis_dir: [f64; 3], radius: f64 },
    Sphere { center: [f64; 3], radius: f64 },
    Line { start: [f64; 3], end: [f64; 3] },
    Circle { center: [f64; 3], normal: [f64; 3], radius: f64 },
    Mesh, // Fallback for freeform
}

/// Placeholder for an actual heavy kernel object (e.g. a OpenCascade/Parasolid Pointer).
/// For now, it just holds metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KernelEntity {
    pub id: TopoId,
    pub geometry: AnalyticGeometry,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TopoRegistry {
    /// The set of topology that currently exists in the kernel.
    active_topology: HashMap<TopoId, KernelEntity>,
    
    /// IDs that were expected (referenced by features/constraints) but are missing.
    zombies: HashSet<TopoId>,
}

impl TopoRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Clears the registry for a new regeneration cycle.
    /// In a real app, you might keep some cache.
    pub fn clear(&mut self) {
        self.active_topology.clear();
        self.zombies.clear();
    }

    /// Registers a newly generated entity from the kernel.
    pub fn register(&mut self, entity: KernelEntity) {
        self.active_topology.insert(entity.id, entity);
    }

    /// Resolves a stable ID to a kernel entity.
    pub fn resolve(&self, id: &TopoId) -> Option<&KernelEntity> {
        self.active_topology.get(id)
    }

    /// Validates a list of required references.
    /// If any are missing, they are marked as zombies.
    pub fn validate_references(&mut self, required_ids: &[TopoId]) -> Vec<TopoId> {
        let mut missing = Vec::new();
        for id in required_ids {
            if !self.active_topology.contains_key(id) {
                self.zombies.insert(*id);
                missing.push(*id);
            }
        }
        missing
    }

    pub fn is_zombie(&self, id: &TopoId) -> bool {
        self.zombies.contains(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::topo::{EntityId, naming::{TopoRank, TopoId}};

    #[test]
    fn test_registry_resolve() {
        let mut registry = TopoRegistry::new();
        let feat_id = EntityId::new();
        let topo_id = TopoId::new(feat_id, 1, TopoRank::Face);
        
        let entity = KernelEntity { 
            id: topo_id, 
            geometry: AnalyticGeometry::Plane { origin: [0.0; 3], normal: [0.0, 1.0, 0.0] } 
        };
        registry.register(entity.clone());

        assert_eq!(registry.resolve(&topo_id), Some(&entity));
    }

    #[test]
    fn test_zombie_detection() {
        let mut registry = TopoRegistry::new();
        let feat_id = EntityId::new();
        let existing_id = TopoId::new(feat_id, 1, TopoRank::Face);
        let missing_id = TopoId::new(feat_id, 2, TopoRank::Face);

        registry.register(KernelEntity { 
            id: existing_id, 
            geometry: AnalyticGeometry::Plane { origin: [0.0; 3], normal: [0.0, 1.0, 0.0] } 
        });

        let missing = registry.validate_references(&[existing_id, missing_id]);
        
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0], missing_id);
        assert!(registry.is_zombie(&missing_id));
        assert!(!registry.is_zombie(&existing_id));
    }
}
