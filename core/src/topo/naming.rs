use serde::{Deserialize, Serialize};
use super::EntityId;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum TopoRank {
    Vertex = 0,
    Edge = 1,
    Wire = 2,
    Face = 3,
    Shell = 4,
    Solid = 5,
    CompSolid = 6,
    Compound = 7,
}

/// A stable identifier for a topological entity (e.g. "Face 5 of Extrude 1").
/// It enables re-attachment of references (dimensions, constraints) even if geometries change slightly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TopoId {
    /// The ID of the feature that generated this topology (e.g. Extrude1).
    pub feature_id: EntityId,
    /// A deterministic local identifier derived from the operation.
    /// In a robust system, this is a hash of the topological neighborhood or construction history.
    pub local_id: u64,
    /// The type/rank of the entity.
    pub rank: TopoRank,
}

impl TopoId {
    pub fn new(feature_id: EntityId, local_id: u64, rank: TopoRank) -> Self {
        Self {
            feature_id,
            local_id,
            rank,
        }
    }
}

/// Helper to generate deterministic local IDs within a feature's context.
pub struct NamingContext {
    feature_id: EntityId,
}

impl NamingContext {
    pub fn new(feature_id: EntityId) -> Self {
        Self { feature_id }
    }

    /// Derives a stable TopoId from a string seed (e.g. "FaceSide").
    /// Uses UUID v5 (SHA-1) logic truncated to u64 for stability.
    pub fn derive(&self, seed: &str, rank: TopoRank) -> TopoId {
        let namespace = Uuid::NAMESPACE_OID;
        let uuid = Uuid::new_v5(&namespace, seed.as_bytes());
        let bytes = uuid.as_bytes();
        // Take first 8 bytes as u64. Stable across platforms.
        let mut arr = [0u8; 8];
        arr.copy_from_slice(&bytes[..8]);
        let local_id = u64::from_be_bytes(arr);
        
        TopoId::new(self.feature_id, local_id, rank)
    }
}
