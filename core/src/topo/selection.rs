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
    /// IDs that resolved exactly (still valid)
    pub kept: Vec<TopoId>,
    /// IDs that were remapped to a fallback match: (original, new, reason)
    pub remapped: Vec<(TopoId, TopoId, String)>,
    /// IDs that are broken with suggestions: (lost_id, suggestions)
    pub lost: Vec<(TopoId, Vec<(TopoId, f64, String)>)>,
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

    /// Creates a named selection group from the current selection.
    /// If a group with this name exists, it will be overwritten.
    pub fn create_group(&mut self, name: &str) {
        let group = SelectionGroup {
            name: name.to_string(),
            items: self.selected.clone(),
        };
        self.groups.insert(name.to_string(), group);
    }

    /// Restores the selection from a named group.
    /// Returns true if the group existed and selection was restored.
    pub fn restore_group(&mut self, name: &str) -> bool {
        if let Some(group) = self.groups.get(name) {
            self.selected = group.items.clone();
            true
        } else {
            false
        }
    }

    /// Deletes a named selection group.
    /// Returns true if the group existed and was deleted.
    pub fn delete_group(&mut self, name: &str) -> bool {
        self.groups.remove(name).is_some()
    }

    /// Lists all selection groups with their item counts.
    /// Returns Vec of (name, item_count) tuples, sorted by name.
    pub fn list_groups(&self) -> Vec<(String, usize)> {
        let mut result: Vec<_> = self.groups
            .iter()
            .map(|(name, group)| (name.clone(), group.items.len()))
            .collect();
        result.sort_by(|a, b| a.0.cmp(&b.0));
        result
    }

    /// Validates current selection against the registry.
    /// Removes any IDs that are now zombies (no longer exist).
    /// Returns a detailed report of what was kept and what was lost.
    /// NOTE: This is the simple version without fallback matching.
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
                lost.push((id, vec![])); // No suggestions in simple mode
            }
        }
        
        ResolutionReport { kept, remapped: vec![], lost }
    }

    /// Validates current selection with fallback matching.
    /// If an exact match fails, attempts to remap to similar entities.
    /// Returns detailed report including remaps and suggestions.
    pub fn validate_with_recovery(
        &mut self, 
        registry: &TopoRegistry,
        geometry_cache: &std::collections::HashMap<TopoId, super::registry::AnalyticGeometry>,
    ) -> ResolutionReport {
        use super::registry::ResolveResult;
        
        let mut kept = Vec::new();
        let mut remapped = Vec::new();
        let mut lost = Vec::new();

        let current_selection: Vec<TopoId> = self.selected.iter().cloned().collect();
        
        for id in current_selection {
            let orig_geometry = geometry_cache.get(&id);
            
            match registry.resolve_with_fallback(&id, orig_geometry) {
                ResolveResult::Exact(_entity) => {
                    kept.push(id);
                },
                ResolveResult::Fallback { entity, confidence: _, reason } => {
                    // Remap the selection to the fallback entity
                    self.selected.remove(&id);
                    self.selected.insert(entity.id);
                    remapped.push((id, entity.id, reason));
                },
                ResolveResult::Broken { suggestions } => {
                    self.selected.remove(&id);
                    lost.push((id, suggestions));
                }
            }
        }
        
        ResolutionReport { kept, remapped, lost }
    }
}
