use super::types::Feature;
use crate::topo::EntityId;
use crate::variables::VariableStore;
use std::collections::{HashMap, HashSet};
use crate::microcad_kernel::ast::Program;
use serde::{Deserialize, Serialize};

/// Context passed down during the regeneration of the feature graph.
/// Contains the accumulated kernel state, symbol table, etc.
pub struct Context {
    // Placeholder for kernel instance or state map
    pub kernel_state: HashMap<EntityId, Option<String>>, 
}

impl Context {
    pub fn new() -> Self {
        Self {
            kernel_state: HashMap::new(),
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FeatureGraph {
    pub nodes: HashMap<EntityId, Feature>,
    // We can cache the topological sort order
    pub sort_order: Vec<EntityId>,
    /// Global parametric variables
    #[serde(default)]
    pub variables: VariableStore,
    /// Optional rollback point - if set, regeneration stops at this feature (inclusive)
    /// This is for temporary preview mode, not permanent suppression
    #[serde(default)]
    pub rollback_point: Option<EntityId>,
}


impl FeatureGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_node(&mut self, feature: Feature) {
        // Invalidate sort order
        self.sort_order.clear();
        self.nodes.insert(feature.id, feature);
    }

    pub fn remove_node(&mut self, id: EntityId) -> Option<Feature> {
        self.sort_order.clear();
        // Also need to check if anything depends on this?
        // For Phase 0/1 we will just allow deletion and let regeneration fail if broken.
        self.nodes.remove(&id)
    }

    /// Performs a topological sort of the features.
    /// Returns Ok(sorted_ids) or Err(cycle_ids) if a cycle is detected.
    pub fn sort(&mut self) -> Result<Vec<EntityId>, Vec<EntityId>> {
        let mut sorted = Vec::new();
        let mut visited = HashSet::new();
        let mut temp_visited = HashSet::new();

        // Check for cycles and build order
        for id in self.nodes.keys() {
            if !visited.contains(id) {
                if let Err(cycle) = self.visit(*id, &mut visited, &mut temp_visited, &mut sorted) {
                    return Err(cycle);
                }
            }
        }
        
        self.sort_order = sorted.clone();
        Ok(sorted)
    }

    fn visit(
        &self,
        node_id: EntityId,
        visited: &mut HashSet<EntityId>,
        temp_visited: &mut HashSet<EntityId>,
        sorted: &mut Vec<EntityId>,
    ) -> Result<(), Vec<EntityId>> {
        if temp_visited.contains(&node_id) {
            return Err(vec![node_id]); // Cycle detected
        }
        if visited.contains(&node_id) {
            return Ok(());
        }

        temp_visited.insert(node_id);

        if let Some(node) = self.nodes.get(&node_id) {
            for dep_id in &node.dependencies {
                self.visit(*dep_id, visited, temp_visited, sorted)?;
            }
        }

        temp_visited.remove(&node_id);
        visited.insert(node_id);
        sorted.push(node_id);
        Ok(())
    }

    /// Toggles the suppression state of a feature.
    /// Returns the new suppression state, or error if not found.
    pub fn toggle_suppression(&mut self, id: EntityId) -> Result<bool, String> {
        if let Some(feature) = self.nodes.get_mut(&id) {
            feature.suppressed = !feature.suppressed;
            // Invalidate sort order just in case, though suppression doesn't strictly change topology
            // But it might affect downstream if we had conditional logic.
            return Ok(feature.suppressed);
        }
        Err("Feature not found".to_string())
    }

    pub fn update_feature_params(&mut self, id: EntityId, params: HashMap<String, super::types::ParameterValue>) -> Result<(), String> {
        if let Some(feature) = self.nodes.get_mut(&id) {
            // Merge params
            for (k, v) in params {
                feature.parameters.insert(k, v);
            }
            return Ok(());
        }
        Err("Feature not found".to_string())
    }

    /// Walk the graph and generate the MicroCAD program logic for each feature.
    /// This is the core "Regeneration" loop.
    pub fn regenerate(&mut self) -> Program {
        // Ensure sorted
        if self.sort_order.is_empty() {
             let _ = self.sort(); // Ignore cycles for now, purely best effort
        }

        let mut _program = Program::default();
        let mut _ctx = Context::new();
        
        use crate::microcad_kernel::ast::{Statement, Expression, Call, Value};
        use super::types::FeatureType;

        for id in &self.sort_order {
            if let Some(feature) = self.nodes.get(id) {
                if feature.suppressed {
                    continue;
                }
                
                // Inject Context Switch for Stability
                // This ensures each feature uses a dedicated ID namespace seeded by its own UUID
                let context_stmt = Statement::Expression(Expression::Call(Call {
                    function: "set_context".to_string(),
                    args: vec![Expression::Value(Value::String(feature.id.to_string()))]
                }));
                _program.statements.push(context_stmt);
                
                let call = match feature.feature_type {
                    FeatureType::Sketch => {
                         // Extract sketch data if available
                         let mut args = vec![];
                         if let Some(crate::features::types::ParameterValue::Sketch(s)) = feature.parameters.get("sketch_data") {
                             // Clone and resolve expressions before serializing
                             let mut resolved_sketch = s.clone();
                             let _resolved_count = resolved_sketch.resolve_expressions(&self.variables);
                             if let Ok(json) = serde_json::to_string(&resolved_sketch) {
                                 args.push(Expression::Value(Value::String(json)));
                             }
                         }

                         Some(Call {
                             function: "sketch".to_string(),
                             args, 
                         })
                    },
                    FeatureType::Extrude => {
                        // Build args: profile_sketch_json, distance, operation
                        let mut args = Vec::new();
                        
                        // Get profile sketch from the first dependency
                        if let Some(dep_id) = feature.dependencies.first() {
                            if let Some(dep_feature) = self.nodes.get(dep_id) {
                                if let Some(crate::features::types::ParameterValue::Sketch(s)) = dep_feature.parameters.get("sketch_data") {
                                    if let Ok(json) = serde_json::to_string(s) {
                                        args.push(Expression::Value(Value::String(json)));
                                    }
                                }
                            }
                        }
                        
                        // Get distance parameter (default 10.0)
                        let mut distance = match feature.parameters.get("distance") {
                            Some(crate::features::types::ParameterValue::Float(d)) => *d,
                            _ => 10.0, // Default distance
                        };
                        
                        // Check for flip_direction parameter
                        if let Some(crate::features::types::ParameterValue::Bool(flip)) = feature.parameters.get("flip_direction") {
                            if *flip {
                                distance = -distance;
                            }
                        }
                        args.push(Expression::Value(Value::Number(distance)));
                        
                        // Get operation (default Add = 0)
                        let operation = match feature.parameters.get("operation") {
                            Some(crate::features::types::ParameterValue::String(s)) => s.clone(),
                            _ => "Add".to_string(),
                        };
                        args.push(Expression::Value(Value::String(operation)));

                        // Get start_offset parameter (default 0.0)
                        let start_offset = match feature.parameters.get("start_offset") {
                            Some(crate::features::types::ParameterValue::Float(d)) => *d,
                            _ => 0.0,
                        };
                        args.push(Expression::Value(Value::Number(start_offset)));

                        // Get profiles parameter (optional List or String)
                        if let Some(val) = feature.parameters.get("profiles") {
                            match val {
                                crate::features::types::ParameterValue::List(list) => {
                                    let arr = list.iter().map(|s| Value::String(s.clone())).collect();
                                    args.push(Expression::Value(Value::Array(arr)));
                                },
                                crate::features::types::ParameterValue::String(s) => {
                                    args.push(Expression::Value(Value::String(s.clone())));
                                }
                                _ => {}
                            }
                        }
                        
                        // Get profile_regions parameter (boundary points for region-based extrusion)
                        // This is critical for intersection regions where entity IDs are shared
                        if let Some(crate::features::types::ParameterValue::ProfileRegions(regions)) = feature.parameters.get("profile_regions") {
                            // Serialize the regions as JSON string for the syscall
                            if let Ok(json) = serde_json::to_string(regions) {
                                args.push(Expression::Value(Value::String(json)));
                            }
                        }
                        Some(Call {
                            function: "extrude".to_string(),
                            args, 
                        })
                    },
                    FeatureType::Revolve => {
                        // Build args: profile_sketch_json, angle (degrees), axis
                        let mut args = Vec::new();
                        
                        // Get profile sketch from the first dependency
                        if let Some(dep_id) = feature.dependencies.first() {
                            if let Some(dep_feature) = self.nodes.get(dep_id) {
                                if let Some(crate::features::types::ParameterValue::Sketch(s)) = dep_feature.parameters.get("sketch_data") {
                                    if let Ok(json) = serde_json::to_string(s) {
                                        args.push(Expression::Value(Value::String(json)));
                                    }
                                }
                            }
                        }
                        
                        // Get angle parameter (default 360.0 = full revolution)
                        let angle = match feature.parameters.get("angle") {
                            Some(crate::features::types::ParameterValue::Float(a)) => *a,
                            _ => 360.0, // Default full revolution
                        };
                        args.push(Expression::Value(Value::Number(angle)));
                        
                        // Get axis (default "X")
                        let axis = match feature.parameters.get("axis") {
                            Some(crate::features::types::ParameterValue::String(s)) => s.clone(),
                            _ => "X".to_string(),
                        };
                        args.push(Expression::Value(Value::String(axis)));
                         
                        Some(Call {
                            function: "revolve".to_string(),
                            args, 
                        })
                    },
                    _ => None
                };

                if let Some(c) = call {
                     // Assign result to a variable "feat_<UUID>" so future steps can reference it
                     let stmt = Statement::Assignment {
                        name: format!("feat_{}", feature.id),
                        expr: Expression::Call(c)
                     };
                     _program.statements.push(stmt);
                }
                
                // Check rollback point AFTER generating this feature
                // Rollback is inclusive - we generate up to and including the rollback feature
                if let Some(rb_id) = self.rollback_point {
                    if *id == rb_id {
                        break;
                    }
                }
            }
        }
        
        _program
    }

    /// Set rollback point to a specific feature (inclusive).
    /// Pass None to disable rollback and show full model.
    /// Returns true if the feature exists, false otherwise.
    pub fn set_rollback(&mut self, id: Option<EntityId>) -> bool {
        if let Some(target_id) = id {
            if !self.nodes.contains_key(&target_id) {
                return false;
            }
        }
        self.rollback_point = id;
        true
    }

    /// Get the index of a feature in the sorted order (for UI display).
    /// Returns None if feature not found or sort order not computed.
    pub fn get_feature_index(&self, id: EntityId) -> Option<usize> {
        self.sort_order.iter().position(|&fid| fid == id)
    }

    /// Get the list of features that are currently "rolled back" (excluded from regeneration).
    /// These are features that come after the rollback point in the sort order.
    pub fn get_rolled_back_features(&self) -> Vec<EntityId> {
        if let Some(rb_id) = self.rollback_point {
            if let Some(rb_idx) = self.get_feature_index(rb_id) {
                return self.sort_order.iter().skip(rb_idx + 1).cloned().collect();
            }
        }
        vec![]
    }

    /// Collects all topological IDs referenced by any feature in the graph.
    /// This is used to validate that referenced geometry still exists after regeneration.
    pub fn collect_all_references(&self) -> Vec<crate::topo::naming::TopoId> {
        let mut all_refs = Vec::new();
        for feature in self.nodes.values() {
            if !feature.suppressed {
                all_refs.extend(feature.collect_references());
            }
        }
        all_refs
    }

    /// Get all features that depend on the given feature (its dependents/children).
    pub fn get_dependents(&self, id: EntityId) -> Vec<EntityId> {
        self.nodes.values()
            .filter(|f| f.dependencies.contains(&id))
            .map(|f| f.id)
            .collect()
    }

    /// Attempts to move a feature to a new position in sort_order.
    /// Returns Err if the move would violate dependency constraints:
    /// - A feature cannot be placed before any of its dependencies (parents)
    /// - A feature cannot be placed after any of its dependents (children)
    pub fn reorder_feature(&mut self, id: EntityId, new_index: usize) -> Result<(), String> {
        // Ensure sort order is computed
        if self.sort_order.is_empty() {
            let _ = self.sort();
        }

        // Find current position
        let current_index = self.sort_order.iter().position(|&fid| fid == id)
            .ok_or_else(|| "Feature not found in sort order".to_string())?;

        if current_index == new_index {
            return Ok(()); // No-op
        }

        let new_index = new_index.min(self.sort_order.len() - 1);

        // Get the feature's dependencies (parents)
        let feature = self.nodes.get(&id)
            .ok_or_else(|| "Feature not found".to_string())?;
        let dependencies = feature.dependencies.clone();

        // Get the feature's dependents (children) 
        let dependents = self.get_dependents(id);

        // Validate: cannot move before any dependency
        for dep_id in &dependencies {
            if let Some(dep_idx) = self.sort_order.iter().position(|&fid| fid == *dep_id) {
                if new_index <= dep_idx {
                    let dep_name = self.nodes.get(dep_id)
                        .map(|f| f.name.clone())
                        .unwrap_or_else(|| "Unknown".to_string());
                    return Err(format!(
                        "Cannot move before dependency: {}",
                        dep_name
                    ));
                }
            }
        }

        // Validate: cannot move after any dependent
        for dep_id in &dependents {
            if let Some(dep_idx) = self.sort_order.iter().position(|&fid| fid == *dep_id) {
                if new_index >= dep_idx {
                    let dep_name = self.nodes.get(dep_id)
                        .map(|f| f.name.clone())
                        .unwrap_or_else(|| "Unknown".to_string());
                    return Err(format!(
                        "Cannot move after dependent: {}",
                        dep_name
                    ));
                }
            }
        }

        // Execute the move
        let feature_id = self.sort_order.remove(current_index);
        let insert_index = if new_index > current_index {
            new_index.saturating_sub(1).min(self.sort_order.len())
        } else {
            new_index.min(self.sort_order.len())
        };
        self.sort_order.insert(insert_index, feature_id);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::types::{FeatureType, ParameterValue};

    fn create_feature(name: &str, deps: Vec<EntityId>) -> Feature {
        let mut f = Feature::new(name, FeatureType::Sketch);
        f.dependencies = deps;
        f
    }

    #[test]
    fn test_topological_sort_linear() {
        let mut graph = FeatureGraph::new();
        let f1 = create_feature("F1", vec![]);
        let f2 = create_feature("F2", vec![f1.id]);
        let f3 = create_feature("F3", vec![f2.id]);

        graph.add_node(f1.clone());
        graph.add_node(f2.clone());
        graph.add_node(f3.clone());

        let sorted = graph.sort().expect("Should sort successfully");
        assert_eq!(sorted, vec![f1.id, f2.id, f3.id]);
    }

    #[test]
    fn test_topological_sort_branching() {
        let mut graph = FeatureGraph::new();
        let root = create_feature("Root", vec![]);
        let branch_a = create_feature("A", vec![root.id]);
        let branch_b = create_feature("B", vec![root.id]);
        let merge = create_feature("Merge", vec![branch_a.id, branch_b.id]);

        graph.add_node(root.clone());
        graph.add_node(branch_a.clone());
        graph.add_node(branch_b.clone());
        graph.add_node(merge.clone());

        let sorted = graph.sort().expect("Should sort successfully");
        
        // Root must be first
        assert_eq!(sorted[0], root.id);
        // Merge must be last
        assert_eq!(sorted[3], merge.id);
        // Middle two can be any order, but must be present
        assert!(sorted.contains(&branch_a.id));
        assert!(sorted.contains(&branch_b.id));
    }

    #[test]
    fn test_cycle_detection() {
        let mut graph = FeatureGraph::new();
        
        let id1 = EntityId::new();
        let id2 = EntityId::new();
        
        let mut feat1 = Feature::new("F1", FeatureType::Sketch);
        feat1.id = id1;
        feat1.dependencies = vec![id2];
        
        let mut feat2 = Feature::new("F2", FeatureType::Sketch);
        feat2.id = id2;
        feat2.dependencies = vec![id1];

        graph.add_node(feat1);
        graph.add_node(feat2);

        let result = graph.sort();
        assert!(result.is_err(), "Should detect cycle");
    }

    #[test]
    fn test_feature_suppression() {
        let mut graph = FeatureGraph::new();
        let f1 = create_feature("F1", vec![]);
        let f2 = create_feature("F2", vec![f1.id]);
        
        // Manual insertion to ensure IDs match
        graph.add_node(f1.clone());
        graph.add_node(f2.clone());

        // Default state
        assert!(!graph.nodes.get(&f1.id).unwrap().suppressed);

        // Toggle
        let new_state = graph.toggle_suppression(f1.id).expect("Should find feature");
        assert!(new_state);
        assert!(graph.nodes.get(&f1.id).unwrap().suppressed);

        // Toggle back
        let new_state_2 = graph.toggle_suppression(f1.id).expect("Should find feature");
        assert!(!new_state_2);
        assert!(!graph.nodes.get(&f1.id).unwrap().suppressed);
    }

    #[test]
    fn test_regeneration() {
        let mut graph = FeatureGraph::new();
        let f1 = Feature::new("Sketch1", FeatureType::Sketch);
        let mut f2 = Feature::new("Extrude1", FeatureType::Extrude);
        f2.dependencies = vec![f1.id];

        graph.add_node(f1.clone());
        graph.add_node(f2.clone());

        let program = graph.regenerate();

        assert_eq!(program.statements.len(), 4);

        // Verify Context Switch 1
        let stmt_ctx1 = &program.statements[0];
        // verify it is set_context(f1.id)
        if let crate::microcad_kernel::ast::Statement::Expression(
            crate::microcad_kernel::ast::Expression::Call(c)
        ) = stmt_ctx1 {
            assert_eq!(c.function, "set_context");
            if let crate::microcad_kernel::ast::Expression::Value(
                crate::microcad_kernel::ast::Value::String(s)
            ) = &c.args[0] {
                assert_eq!(s, &f1.id.to_string());
            } else { panic!("Expected string arg"); }
        } else { panic!("Expected set_context expression"); }


        // Verify Sketch1 assignment
        let stmt1 = &program.statements[1];
        match stmt1 {
             crate::microcad_kernel::ast::Statement::Assignment { name, expr } => {
                 assert_eq!(name, &format!("feat_{}", f1.id));
                 if let crate::microcad_kernel::ast::Expression::Call(c) = expr {
                     assert_eq!(c.function, "sketch");
                 } else { panic!("Expected call"); }
             },
             _ => panic!("Expected assignment"),
        }

        // Verify Context Switch 2
        let stmt_ctx2 = &program.statements[2];
         if let crate::microcad_kernel::ast::Statement::Expression(
            crate::microcad_kernel::ast::Expression::Call(c)
        ) = stmt_ctx2 {
            assert_eq!(c.function, "set_context");
             if let crate::microcad_kernel::ast::Expression::Value(
                crate::microcad_kernel::ast::Value::String(s)
            ) = &c.args[0] {
                assert_eq!(s, &f2.id.to_string());
            } else { panic!("Expected string arg"); }
        } else { panic!("Expected set_context expression"); }

        // Verify Extrude1 assignment
        let stmt2 = &program.statements[3];
        match stmt2 {
             crate::microcad_kernel::ast::Statement::Assignment { name, expr } => {
                 assert_eq!(name, &format!("feat_{}", f2.id));
                 if let crate::microcad_kernel::ast::Expression::Call(c) = expr {
                     assert_eq!(c.function, "extrude");
                     // Format: 3 args (distance, operation, start_offset) when no sketch_data
                     assert_eq!(c.args.len(), 3, "Extrude should have 3 args: distance, operation, start_offset");
                     // First arg should be distance (number)
                     match &c.args[0] {
                         crate::microcad_kernel::ast::Expression::Value(
                             crate::microcad_kernel::ast::Value::Number(d)
                         ) => {
                             assert!((*d - 10.0).abs() < 1e-6, "Default distance should be 10.0");
                         },
                         _ => panic!("Expected number arg for distance"),
                     }
                     // Second arg should be operation (string)
                     match &c.args[1] {
                         crate::microcad_kernel::ast::Expression::Value(
                             crate::microcad_kernel::ast::Value::String(op)
                         ) => {
                             assert_eq!(op, "Add", "Default operation should be Add");
                         },
                         _ => panic!("Expected string arg for operation"),
                     }
                     // Third arg should be start_offset (number)
                     match &c.args[2] {
                         crate::microcad_kernel::ast::Expression::Value(
                             crate::microcad_kernel::ast::Value::Number(o)
                         ) => {
                             assert!((*o - 0.0).abs() < 1e-6, "Default start_offset should be 0.0");
                         },
                         _ => panic!("Expected number arg for start_offset"),
                     }
                 } else { panic!("Expected call"); }
             },
             _ => panic!("Expected assignment"),
        }
    }

    #[test]
    fn test_selection_stability() {
        let mut graph = FeatureGraph::new();
        let f1 = Feature::new("StableFeat", FeatureType::Extrude);
        graph.add_node(f1.clone());

        // First Regeneration
        let prog1 = graph.regenerate();
        
        // Extract the context seed UUID
        let seed1 = if let crate::microcad_kernel::ast::Statement::Expression(
            crate::microcad_kernel::ast::Expression::Call(c)
        ) = &prog1.statements[0] {
            if let crate::microcad_kernel::ast::Expression::Value(
                crate::microcad_kernel::ast::Value::String(s)
            ) = &c.args[0] {
                s.clone()
            } else { panic!("Expected string seed"); }
        } else { panic!("Expected set_context"); };

        assert_eq!(seed1, f1.id.to_string());

        // Simulate a "change" (e.g. adding another unrelated feature)
        let f2 = Feature::new("UnrelatedFeat", FeatureType::Sketch);
        graph.add_node(f2.clone());

        // Second Regeneration
        let prog2 = graph.regenerate();

        // The first feature's context seed MUST remain identical
        // Note: Sort order might put f2 before or after f1 depending on dependencies. 
        // Since no deps, order is technically stable via insertion hashmap iteration? 
        // No, HashMap iteration is not stable. We might need to find the statement for f1.
        
        let mut found_f1 = false;
        for stmt in &prog2.statements {
             if let crate::microcad_kernel::ast::Statement::Expression(
                crate::microcad_kernel::ast::Expression::Call(c)
            ) = stmt {
                if c.function == "set_context" {
                     if let crate::microcad_kernel::ast::Expression::Value(
                        crate::microcad_kernel::ast::Value::String(s)
                    ) = &c.args[0] {
                        if s == &f1.id.to_string() {
                            found_f1 = true;
                        }
                    }
                }
            }
        }
        assert!(found_f1, "Feature 1 seed should still be present");
    }

    #[test]
    fn test_reference_collection() {
        use crate::topo::naming::{TopoRank, TopoId};
        let mut graph = FeatureGraph::new();
        
        let id_dep = EntityId::new();
        let ref_id = TopoId::new(id_dep, 100, TopoRank::Face);

        let mut f1 = Feature::new("RefFeat", FeatureType::Point);
        f1.parameters.insert("target".to_string(), ParameterValue::Reference(ref_id));
        
        graph.add_node(f1);
        
        let refs = graph.collect_all_references();
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0], ref_id);
    }

    #[test]
    fn test_rollback_preview() {
        use crate::microcad_kernel::ast::Statement;
        
        let mut graph = FeatureGraph::new();
        let f1 = create_feature("F1", vec![]);
        let mut f2 = Feature::new("F2", FeatureType::Extrude);
        f2.dependencies = vec![f1.id];
        let mut f3 = Feature::new("F3", FeatureType::Extrude);
        f3.dependencies = vec![f2.id];
        
        graph.add_node(f1.clone());
        graph.add_node(f2.clone());
        graph.add_node(f3.clone());
        
        // Full regeneration - should have all 3 features
        let prog_full = graph.regenerate();
        let has_f3_full = prog_full.statements.iter().any(|s| {
            matches!(s, Statement::Assignment { name, .. } if name == &format!("feat_{}", f3.id))
        });
        assert!(has_f3_full, "F3 should be in full program");
        
        // Set rollback to F2 (should include F1 and F2, but not F3)
        assert!(graph.set_rollback(Some(f2.id)), "set_rollback should return true for valid ID");
        let prog_rolled = graph.regenerate();
        
        // Should have F1 and F2
        let has_f1 = prog_rolled.statements.iter().any(|s| {
            matches!(s, Statement::Assignment { name, .. } if name == &format!("feat_{}", f1.id))
        });
        let has_f2 = prog_rolled.statements.iter().any(|s| {
            matches!(s, Statement::Assignment { name, .. } if name == &format!("feat_{}", f2.id))
        });
        let has_f3_rolled = prog_rolled.statements.iter().any(|s| {
            matches!(s, Statement::Assignment { name, .. } if name == &format!("feat_{}", f3.id))
        });
        
        assert!(has_f1, "F1 should be in rolled-back program");
        assert!(has_f2, "F2 should be in rolled-back program (rollback is inclusive)");
        assert!(!has_f3_rolled, "F3 should NOT be in rolled-back program");
        
        // Check get_rolled_back_features
        let rolled_back = graph.get_rolled_back_features();
        assert_eq!(rolled_back.len(), 1);
        assert_eq!(rolled_back[0], f3.id);
        
        // Clear rollback - should restore full model
        assert!(graph.set_rollback(None), "set_rollback(None) should succeed");
        let prog_restored = graph.regenerate();
        let has_f3_restored = prog_restored.statements.iter().any(|s| {
            matches!(s, Statement::Assignment { name, .. } if name == &format!("feat_{}", f3.id))
        });
        assert!(has_f3_restored, "F3 should be restored after clearing rollback");
        
        // Test invalid rollback ID
        let invalid_id = EntityId::new();
        assert!(!graph.set_rollback(Some(invalid_id)), "set_rollback should return false for invalid ID");
    }

    #[test]
    fn test_reorder_feature() {
        let mut graph = FeatureGraph::new();
        
        // Create 3 features: F1 -> F2 -> F3 (chain of dependencies)
        let f1 = create_feature("F1", vec![]);
        let mut f2 = Feature::new("F2", FeatureType::Extrude);
        f2.dependencies = vec![f1.id];
        let mut f3 = Feature::new("F3", FeatureType::Extrude);
        f3.dependencies = vec![f2.id];
        
        graph.add_node(f1.clone());
        graph.add_node(f2.clone());
        graph.add_node(f3.clone());
        
        // Ensure sorted
        let _ = graph.sort();
        assert_eq!(graph.sort_order, vec![f1.id, f2.id, f3.id]);
        
        // Test 1: Cannot move F2 before its dependency F1
        let result = graph.reorder_feature(f2.id, 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot move before dependency"));
        
        // Test 2: Cannot move F2 after its dependent F3
        let result = graph.reorder_feature(f2.id, 2);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot move after dependent"));
        
        // Test 3: Add independent feature F4 (no deps), can reorder freely
        let f4 = create_feature("F4", vec![]);
        graph.add_node(f4.clone());
        let _ = graph.sort(); // Re-sort to include F4
        
        // F4 should be able to move before F1 (it has no dependencies)
        let f4_idx = graph.get_feature_index(f4.id).unwrap();
        // Move F4 to position 0
        let result = graph.reorder_feature(f4.id, 0);
        assert!(result.is_ok(), "Independent feature should be able to move to start");
        assert_eq!(graph.sort_order[0], f4.id);
    }
}
