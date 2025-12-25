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

impl AnalyticGeometry {
    /// Compute a similarity score between two geometries (0.0 = completely different, 1.0 = identical)
    pub fn similarity(&self, other: &AnalyticGeometry) -> f64 {
        match (self, other) {
            (AnalyticGeometry::Plane { origin: o1, normal: n1 }, 
             AnalyticGeometry::Plane { origin: o2, normal: n2 }) => {
                // Check if normals are parallel (dot product close to ±1)
                let dot = n1[0]*n2[0] + n1[1]*n2[1] + n1[2]*n2[2];
                let normal_similarity = dot.abs();
                
                // Check origin distance projected onto normal
                let d = [o2[0]-o1[0], o2[1]-o1[1], o2[2]-o1[2]];
                let plane_dist = (d[0]*n1[0] + d[1]*n1[1] + d[2]*n1[2]).abs();
                let dist_similarity = 1.0 / (1.0 + plane_dist);
                
                normal_similarity * 0.7 + dist_similarity * 0.3
            },
            (AnalyticGeometry::Cylinder { radius: r1, axis_dir: d1, .. }, 
             AnalyticGeometry::Cylinder { radius: r2, axis_dir: d2, .. }) => {
                let radius_sim = 1.0 / (1.0 + (r1 - r2).abs());
                let dot = (d1[0]*d2[0] + d1[1]*d2[1] + d1[2]*d2[2]).abs();
                radius_sim * 0.5 + dot * 0.5
            },
            (AnalyticGeometry::Sphere { center: c1, radius: r1 }, 
             AnalyticGeometry::Sphere { center: c2, radius: r2 }) => {
                let dist = ((c1[0]-c2[0]).powi(2) + (c1[1]-c2[1]).powi(2) + (c1[2]-c2[2]).powi(2)).sqrt();
                let center_sim = 1.0 / (1.0 + dist);
                let radius_sim = 1.0 / (1.0 + (r1 - r2).abs());
                center_sim * 0.5 + radius_sim * 0.5
            },
            _ => 0.0, // Different geometry types = no similarity
        }
    }
}

/// Placeholder for an actual heavy kernel object (e.g. a OpenCascade/Parasolid Pointer).
/// For now, it just holds metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KernelEntity {
    pub id: TopoId,
    pub geometry: AnalyticGeometry,
}

/// Result of resolving a TopoId to an entity after regeneration
#[derive(Debug, Clone)]
pub enum ResolveResult<'a> {
    /// Exact match found - the original ID still exists
    Exact(&'a KernelEntity),
    /// Original ID not found, but a similar entity was found
    Fallback { 
        entity: &'a KernelEntity, 
        confidence: f64, 
        reason: String 
    },
    /// Reference is broken - no match found, but suggestions are available
    Broken { 
        suggestions: Vec<(TopoId, f64, String)> // (id, confidence, reason)
    },
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

    /// Resolves a TopoId with fallback matching when exact match fails.
    /// 
    /// Matching priority:
    /// 1. Exact match (same TopoId)
    /// 2. Same feature_id + same rank + adjacent local_id (±1-5) with geometry similarity
    /// 3. Same feature_id + same rank + high geometry similarity (> 0.8)
    /// 4. Broken with suggestions from any matching rank with geometry similarity
    pub fn resolve_with_fallback(&self, id: &TopoId, original_geometry: Option<&AnalyticGeometry>) -> ResolveResult {
        // 1. Try exact match first
        if let Some(entity) = self.active_topology.get(id) {
            return ResolveResult::Exact(entity);
        }

        // 2. Try fallback: same feature, adjacent local_id
        let mut candidates: Vec<(&KernelEntity, f64, String)> = Vec::new();
        
        for entity in self.active_topology.values() {
            // Must be same rank
            if entity.id.rank != id.rank {
                continue;
            }

            let mut score = 0.0;
            let mut reason = String::new();

            // Same feature bonus (strong signal)
            if entity.id.feature_id == id.feature_id {
                score += 0.4;
                reason.push_str("same_feature ");

                // Adjacent local_id bonus (likely a split face)
                let diff = (entity.id.local_id as i64 - id.local_id as i64).abs();
                if diff <= 5 {
                    score += 0.2 * (1.0 - diff as f64 / 5.0);
                    reason.push_str(&format!("adjacent_id(diff={}) ", diff));
                }
            }

            // Geometry similarity bonus
            if let Some(orig_geom) = original_geometry {
                let geom_sim = orig_geom.similarity(&entity.geometry);
                if geom_sim > 0.3 {
                    score += geom_sim * 0.4;
                    reason.push_str(&format!("geom_sim({:.2}) ", geom_sim));
                }
            }

            if score > 0.3 {
                candidates.push((entity, score, reason.trim().to_string()));
            }
        }

        // Sort by score descending
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // 3. If best candidate has high confidence (> 0.6), return as fallback
        if let Some((entity, score, reason)) = candidates.first() {
            if *score > 0.6 {
                return ResolveResult::Fallback {
                    entity,
                    confidence: *score,
                    reason: reason.clone(),
                };
            }
        }

        // 4. Return as broken with suggestions
        let suggestions: Vec<(TopoId, f64, String)> = candidates
            .into_iter()
            .take(3) // Top 3 suggestions
            .map(|(e, s, r)| (e.id, s, r))
            .collect();

        ResolveResult::Broken { suggestions }
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
