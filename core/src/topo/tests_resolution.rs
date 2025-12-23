
use crate::topo::selection::{SelectionState, SelectionFilter};
use crate::topo::naming::{TopoId, TopoRank};
use crate::topo::{EntityId, registry::TopoRegistry, registry::KernelEntity, registry::AnalyticGeometry};

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
    assert_eq!(report.lost[0], dead_id);

    // Internal state should be updated
    assert!(selection.selected.contains(&alive_id));
    assert!(!selection.selected.contains(&dead_id));
}
