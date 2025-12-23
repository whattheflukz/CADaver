use super::types::Feature;
use crate::topo::EntityId;
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
                             if let Ok(json) = serde_json::to_string(s) {
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
                        let distance = match feature.parameters.get("distance") {
                            Some(crate::features::types::ParameterValue::Float(d)) => *d,
                            _ => 10.0, // Default distance
                        };
                        args.push(Expression::Value(Value::Number(distance)));
                        
                        // Get operation (default Add = 0)
                        let operation = match feature.parameters.get("operation") {
                            Some(crate::features::types::ParameterValue::String(s)) => s.clone(),
                            _ => "Add".to_string(),
                        };
                        args.push(Expression::Value(Value::String(operation)));
                         
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
            }
        }
        
        _program
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
                     // New format: 2 args (distance, operation) when no sketch_data
                     assert_eq!(c.args.len(), 2, "Extrude should have 2 args: distance, operation");
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
}
