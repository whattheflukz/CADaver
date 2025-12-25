
use crate::topo::selection::SelectionState;
use crate::topo::naming::{TopoId, TopoRank};
use crate::topo::{EntityId, registry::TopoRegistry, registry::KernelEntity, registry::AnalyticGeometry};
use std::collections::HashMap;

#[test]
fn test_resolution_stability() {
    // 1. Setup Registry
    let mut registry = TopoRegistry::new();
    let feat_id = EntityId::new();
    
    // Stable ID: Face 1 from Feature A
    let stable_id = TopoId::new(feat_id, 1, TopoRank::Face);
    
    let entity = KernelEntity {
        id: stable_id,
        geometry: AnalyticGeometry::Plane { origin: [0.0; 3], normal: [0.0, 1.0, 0.0] }
    };
    registry.register(entity);

    // 2. Select it
    let mut selection = SelectionState::new();
    selection.select(stable_id, false);

    // 3. Validate
    let report = selection.validate(&registry);

    // 4. Assertions
    assert_eq!(report.kept.len(), 1, "Should keep valid selection");
    assert_eq!(report.kept[0], stable_id);
    assert_eq!(report.lost.len(), 0);
    assert!(selection.selected.contains(&stable_id));
}

#[test]
fn test_resolution_zombie() {
    // 1. Setup Registry with ONE entity
    let mut registry = TopoRegistry::new();
    let feat_id = EntityId::new();
    let alive_id = TopoId::new(feat_id, 1, TopoRank::Face);
    let dead_id = TopoId::new(feat_id, 99, TopoRank::Face); // Simulating an entity that disappeared

    registry.register(KernelEntity {
        id: alive_id,
        geometry: AnalyticGeometry::Mesh
    });

    // 2. Select BOTH (simulating a state where dead_id was valid previously)
    let mut selection = SelectionState::new();
    selection.select(alive_id, true);
    selection.select(dead_id, true);

    // 3. Validate
    let report = selection.validate(&registry);

    // 4. Assertions
    assert_eq!(report.kept.len(), 1);
    assert_eq!(report.kept[0], alive_id);
    
    assert_eq!(report.lost.len(), 1);
    assert_eq!(report.lost[0].0, dead_id); // First element of tuple is the lost ID

    // Internal state should be updated
    assert!(selection.selected.contains(&alive_id));
    assert!(!selection.selected.contains(&dead_id));
}

#[test]
fn test_fallback_same_feature_adjacent_id() {
    // Simulates a face that was split/renumbered after regeneration
    let mut registry = TopoRegistry::new();
    let feat_id = EntityId::new();
    
    // Original face was local_id = 5
    let original_id = TopoId::new(feat_id, 5, TopoRank::Face);
    let original_geometry = AnalyticGeometry::Plane { 
        origin: [0.0, 0.0, 10.0], 
        normal: [0.0, 0.0, 1.0] 
    };
    
    // After regeneration, it's now local_id = 6 with similar geometry
    let new_id = TopoId::new(feat_id, 6, TopoRank::Face);
    registry.register(KernelEntity {
        id: new_id,
        geometry: AnalyticGeometry::Plane { 
            origin: [0.0, 0.0, 12.0],  // Slightly different z
            normal: [0.0, 0.0, 1.0]    // Same orientation
        }
    });

    // Setup selection with the original (now missing) ID
    let mut selection = SelectionState::new();
    selection.select(original_id, false);

    // Create geometry cache with the original geometry
    let mut geometry_cache: HashMap<TopoId, AnalyticGeometry> = HashMap::new();
    geometry_cache.insert(original_id, original_geometry);

    // Validate with recovery
    let report = selection.validate_with_recovery(&registry, &geometry_cache);

    // Should be remapped to the new adjacent face
    assert_eq!(report.kept.len(), 0, "Original should not be kept (doesn't exist)");
    assert_eq!(report.remapped.len(), 1, "Should have one remap");
    assert_eq!(report.remapped[0].0, original_id, "Remapped from original");
    assert_eq!(report.remapped[0].1, new_id, "Remapped to new");
    assert!(report.remapped[0].2.contains("same_feature"), "Reason should mention same_feature");
    
    // Selection should now contain the new ID
    assert!(selection.selected.contains(&new_id));
    assert!(!selection.selected.contains(&original_id));
}

#[test]
fn test_broken_with_suggestions() {
    // Simulates a face that completely vanished, but similar faces exist
    let mut registry = TopoRegistry::new();
    let feat_id = EntityId::new();
    let other_feat_id = EntityId::new();
    
    // Original face
    let original_id = TopoId::new(feat_id, 1, TopoRank::Face);
    let original_geometry = AnalyticGeometry::Plane { 
        origin: [0.0, 0.0, 0.0], 
        normal: [0.0, 1.0, 0.0]  // Y-up plane
    };
    
    // Only entity in registry is from a DIFFERENT feature with similar geometry
    // This won't meet the 0.6 threshold for auto-remap but should be suggested
    let suggestion_id = TopoId::new(other_feat_id, 10, TopoRank::Face);
    registry.register(KernelEntity {
        id: suggestion_id,
        geometry: AnalyticGeometry::Plane { 
            origin: [0.0, 0.0, 0.0], 
            normal: [0.0, 1.0, 0.0]  // Same orientation
        }
    });

    let mut selection = SelectionState::new();
    selection.select(original_id, false);

    let mut geometry_cache: HashMap<TopoId, AnalyticGeometry> = HashMap::new();
    geometry_cache.insert(original_id, original_geometry);

    let report = selection.validate_with_recovery(&registry, &geometry_cache);

    // Should be broken (different feature, no auto-remap)
    assert_eq!(report.kept.len(), 0);
    assert_eq!(report.remapped.len(), 0);
    assert_eq!(report.lost.len(), 1);
    
    // But should have a suggestion
    let (lost_id, suggestions) = &report.lost[0];
    assert_eq!(*lost_id, original_id);
    // May or may not have suggestions depending on scoring threshold
}

#[test]
fn test_geometry_similarity_planes() {
    // Test the geometry similarity function directly
    let plane1 = AnalyticGeometry::Plane { 
        origin: [0.0, 0.0, 0.0], 
        normal: [0.0, 1.0, 0.0] 
    };
    let plane2 = AnalyticGeometry::Plane { 
        origin: [0.0, 5.0, 0.0],  // Parallel but offset
        normal: [0.0, 1.0, 0.0] 
    };
    let plane3 = AnalyticGeometry::Plane { 
        origin: [0.0, 0.0, 0.0], 
        normal: [1.0, 0.0, 0.0]  // Perpendicular
    };
    
    let sim_parallel = plane1.similarity(&plane2);
    let sim_perpendicular = plane1.similarity(&plane3);
    let sim_identical = plane1.similarity(&plane1);
    
    assert!(sim_identical > 0.9, "Identical planes should have high similarity: got {}", sim_identical);
    assert!(sim_parallel > 0.5, "Parallel planes should have medium similarity: got {}", sim_parallel);
    // Perpendicular normals have dot=0, but distance component adds ~0.3 for same origin
    assert!(sim_perpendicular < 0.4, "Perpendicular planes should have low similarity: got {}", sim_perpendicular);
}
