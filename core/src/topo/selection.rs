use super::naming::TopoId;
use super::registry::TopoRegistry;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SelectionFilter {
    Face,
    Edge,
    Vertex,
    Body,
    Any,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionGroup {
    pub name: String,
    pub items: HashSet<TopoId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionState {
    pub selected: HashSet<TopoId>,
    pub active_filter: SelectionFilter,
    pub groups: std::collections::HashMap<String, SelectionGroup>,
}

impl Default for SelectionState {
    fn default() -> Self {
        Self {
            selected: HashSet::new(),
            active_filter: SelectionFilter::Any,
            groups: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionReport {
    pub kept: Vec<TopoId>,
    pub lost: Vec<TopoId>,
}

impl SelectionState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_filter(&mut self, filter: SelectionFilter) {
        self.active_filter = filter;
        // Option: Clear selection on filter change? Or just validte? 
        // For now, let's keep it flexible.
    }

    pub fn select(&mut self, id: TopoId, multi_select: bool) {
        if !self.matches_filter(id) {
             return;
        }

        if !multi_select {
            self.selected.clear();
        }
        self.selected.insert(id);
    }

    fn matches_filter(&self, id: TopoId) -> bool {
        use super::naming::TopoRank;
        match self.active_filter {
            SelectionFilter::Any => true,
            SelectionFilter::Face => id.rank == TopoRank::Face,
            SelectionFilter::Edge => id.rank == TopoRank::Edge,
            SelectionFilter::Vertex => id.rank == TopoRank::Vertex,
            SelectionFilter::Body => matches!(id.rank, TopoRank::Solid | TopoRank::Shell | TopoRank::CompSolid | TopoRank::Compound),
        }
    }

    pub fn deselect(&mut self, id: &TopoId) {
        self.selected.remove(id);
    }

    pub fn clear(&mut self) {
        self.selected.clear();
    }

    pub fn create_group(&mut self, name: &str) {
        let group = SelectionGroup {
            name: name.to_string(),
            items: self.selected.clone(),
        };
        self.groups.insert(name.to_string(), group);
    }

    /// Validates current selection against the registry.
    /// Removes any IDs that are now zombies (no longer exist).
    /// Returns a detailed report of what was kept and what was lost.
    pub fn validate(&mut self, registry: &TopoRegistry) -> ResolutionReport {
        let mut kept = Vec::new();
        let mut lost = Vec::new();

        // Clone to iterate safely while modifying
        let current_selection: Vec<TopoId> = self.selected.iter().cloned().collect();
        
        for id in current_selection {
            if registry.resolve(&id).is_some() {
                kept.push(id);
            } else {
                self.selected.remove(&id);
                lost.push(id);
            }
        }
        
        ResolutionReport { kept, lost }
    }
}
