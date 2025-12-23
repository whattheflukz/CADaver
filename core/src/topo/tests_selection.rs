
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
