
use crate::topo::selection::{SelectionState, SelectionFilter};
use crate::topo::naming::{TopoId, TopoRank};
use crate::topo::EntityId;

#[test]
fn test_selection_basic() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);

    state.select(id1, false);
    assert!(state.selected.contains(&id1));
    assert_eq!(state.selected.len(), 1);

    // Replace
    state.select(id2, false);
    assert!(state.selected.contains(&id2));
    assert!(!state.selected.contains(&id1));
}

#[test]
fn test_selection_multi() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);

    state.select(id1, false);
    state.select(id2, true); // Add
    
    assert!(state.selected.contains(&id1));
    assert!(state.selected.contains(&id2));
    assert_eq!(state.selected.len(), 2);
}

#[test]
fn test_selection_filter_logic() {
    // Note: The logic to *enforce* filters lives in the caller (e.g. backend command handler or frontend hit testing),
    // OR we put it in `select`.
    // The current implementation in `selection.rs` has a TODO for filter validation.
    // Let's assume we want to verify that the State *stores* the filter correctly first.
    
    let mut state = SelectionState::new();
    state.set_filter(SelectionFilter::Face);
    assert_eq!(state.active_filter, SelectionFilter::Face);
}

#[test]
fn test_selection_group_create() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);

    // Select items and create a group
    state.select(id1, false);
    state.select(id2, true);
    state.create_group("MyGroup");

    // Verify group was created with correct items
    assert!(state.groups.contains_key("MyGroup"));
    let group = state.groups.get("MyGroup").unwrap();
    assert_eq!(group.items.len(), 2);
    assert!(group.items.contains(&id1));
    assert!(group.items.contains(&id2));
}

#[test]
fn test_selection_group_restore() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);

    // Create group with selection
    state.select(id1, false);
    state.select(id2, true);
    state.create_group("SavedSelection");

    // Clear and verify empty
    state.clear();
    assert!(state.selected.is_empty());

    // Restore and verify selection matches
    let restored = state.restore_group("SavedSelection");
    assert!(restored);
    assert_eq!(state.selected.len(), 2);
    assert!(state.selected.contains(&id1));
    assert!(state.selected.contains(&id2));

    // Try to restore non-existent group
    let not_found = state.restore_group("NonExistent");
    assert!(!not_found);
}

#[test]
fn test_selection_group_delete() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);

    // Create group
    state.select(id1, false);
    state.create_group("ToDelete");
    assert!(state.groups.contains_key("ToDelete"));

    // Delete and verify
    let deleted = state.delete_group("ToDelete");
    assert!(deleted);
    assert!(!state.groups.contains_key("ToDelete"));

    // Try to delete non-existent
    let not_found = state.delete_group("NonExistent");
    assert!(!not_found);
}

#[test]
fn test_selection_group_list() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);
    let id3 = TopoId::new(EntityId::new(), 3, TopoRank::Vertex);

    // Create multiple groups with different sizes
    state.select(id1, false);
    state.create_group("Alpha"); // 1 item

    state.select(id2, true);
    state.select(id3, true);
    state.create_group("Beta"); // 3 items

    // List should return sorted by name
    let groups = state.list_groups();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0], ("Alpha".to_string(), 1));
    assert_eq!(groups[1], ("Beta".to_string(), 3));
}

#[test]
fn test_selection_group_overwrite() {
    let mut state = SelectionState::new();
    let id1 = TopoId::new(EntityId::new(), 1, TopoRank::Face);
    let id2 = TopoId::new(EntityId::new(), 2, TopoRank::Edge);

    // Create group with one item
    state.select(id1, false);
    state.create_group("Overwrite");
    assert_eq!(state.groups.get("Overwrite").unwrap().items.len(), 1);

    // Overwrite with different selection
    state.clear();
    state.select(id2, false);
    state.create_group("Overwrite");
    
    // Should have new content
    let group = state.groups.get("Overwrite").unwrap();
    assert_eq!(group.items.len(), 1);
    assert!(group.items.contains(&id2));
    assert!(!group.items.contains(&id1));
}
