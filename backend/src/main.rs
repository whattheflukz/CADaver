use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_extra::TypedHeader;
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::{Arc, RwLock};
use cad_core::features::dag::FeatureGraph;
use serde::Deserialize;
use serde_json::json;

/// Format a kernel error as a JSON message for the frontend
fn format_error(code: &str, message: &str, severity: &str) -> String {
    format!("ERROR_UPDATE:{}", json!({
        "code": code,
        "message": message,
        "severity": severity
    }))
}

// Application State
struct AppState {
    graph: Arc<RwLock<FeatureGraph>>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let shared_state = Arc::new(AppState {
        graph: Arc::new(RwLock::new(FeatureGraph::new())),
    });

    // build our application with a route
    let app = Router::new()
        .route("/", get(root))
        .route("/ws", get(ws_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(shared_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    info!("listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> &'static str {
    "Hello from CAD Backend!"
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    info!("Client connected");
    
    // Send initial graph state (placeholder)
    {
        let json = {
            let graph = state.graph.read().unwrap();
            serde_json::to_string(&*graph).unwrap_or("{}".to_string())
        };
        
        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
            return;
        }
    }

    // Create a local runtime and generator for this session
    // In a real app, these might be shared or persistent depending on the architecture
    let runtime = cad_core::microcad_kernel::Runtime::new();
    let generator = cad_core::topo::IdGenerator::new("Session1"); 
    let mut selection_state = cad_core::topo::SelectionState::new();

    while let Some(msg) = socket.recv().await {
        let msg = if let Ok(msg) = msg {
            msg
        } else {
            return;
        };

        if let Message::Text(text) = msg {
            info!("Received message: {}", text);
            
            // Simple command parser for now
            if text == "REGEN" {
                let program = {
                    let mut graph = state.graph.write().unwrap();
                    graph.regenerate()
                };
                info!("Generated program with {} statements", program.statements.len());

                match runtime.evaluate(&program, &generator) {
                    Ok(result) => {
                         // Populate Session Registry (Simple In-Memory)
                         let mut registry = cad_core::topo::TopoRegistry::new();
                         info!("Regeneration produced {} topological entities", result.topology_manifest.len());
                         for (id, entity) in &result.topology_manifest {
                             tracing::debug!("Topo Generated: {:?} -> {:?}", id, entity.geometry);
                             registry.register(entity.clone());
                         }

                         // Validate References
                         let required_refs = {
                             let graph = state.graph.read().unwrap();
                             graph.collect_all_references()
                         };
                         
                         let zombies = registry.validate_references(&required_refs);
                         if !zombies.is_empty() {
                             warn!("Found {} broken references (zombies)", zombies.len());
                             let zombie_json = serde_json::to_string(&zombies).unwrap_or("[]".into());
                             if socket.send(Message::Text(format!("ZOMBIE_UPDATE:{}", zombie_json))).await.is_err() {
                                 return;
                             }
                         }

                         // Validate Selection State (remove stale selections)
                         let report = selection_state.validate(&registry);
                         if !report.lost.is_empty() {
                             info!("Removed {} stale items from selection", report.lost.len());
                             // Broadcast Selection Update
                             let update = serde_json::to_string(&selection_state.selected).unwrap_or("[]".into());
                             if socket.send(Message::Text(format!("SELECTION_UPDATE:{}", update))).await.is_err() {
                                  return;
                             }
                         }

                         // Send Render Update
                         let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                         if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                             return;
                         }
                         info!("Sent RENDER_UPDATE with {} vertices", result.tessellation.vertices.len() / 3);
                    }
                    Err(e) => {
                        warn!("Regeneration failed: {}", e);
                        let error_msg = format_error("REGEN_FAILED", &format!("Regeneration failed: {}", e), "error");
                        let _ = socket.send(Message::Text(error_msg)).await;
                    }
                }
            } else if text.starts_with("SELECT:") {
                // Expected format: SELECT:{"id": "...", "modifier": "replace"|"add"|"remove"}
                // Or legacy: SELECT:{"..."} (just ID) handling for backward compat if needed, but let's assume valid JSON wrapper now or handle simple ID.
                
                let json_str = text.trim_start_matches("SELECT:");
                if json_str == "CLEAR" {
                     selection_state.clear();
                     info!("Selection cleared");
                } else {
                    #[derive(Deserialize)]
                    struct SelectCmd {
                        id: cad_core::topo::naming::TopoId,
                        modifier: Option<String>, // "add", "remove", "replace" (default)
                    }

                    if let Ok(cmd) = serde_json::from_str::<SelectCmd>(json_str) {
                         let modifier = cmd.modifier.as_deref().unwrap_or("replace");
                         match modifier {
                             "add" => selection_state.select(cmd.id, true),
                             "remove" => selection_state.deselect(&cmd.id),
                             _ => selection_state.select(cmd.id, false),
                         }
                         info!("Selected {:?} (mod: {})", cmd.id, modifier);
                    } else if let Ok(id) = serde_json::from_str::<cad_core::topo::naming::TopoId>(json_str) {
                        // Fallback to simple ID string = replace
                        selection_state.select(id, false); 
                        info!("Selected TopoId: {:?}", id);
                    } else {
                        warn!("Failed to parse Selection command: {}", json_str);
                    }
                }
                
                // Broadcast Selection Update
                let update = serde_json::to_string(&selection_state.selected).unwrap_or("[]".into());
                if socket.send(Message::Text(format!("SELECTION_UPDATE:{}", update))).await.is_err() {
                     return;
                }

            } else if text.starts_with("SET_FILTER:") {
                let filter_str = text.trim_start_matches("SET_FILTER:");
                // match string to enum
                let filter = match filter_str {
                    "Face" => cad_core::topo::SelectionFilter::Face,
                    "Edge" => cad_core::topo::SelectionFilter::Edge,
                    "Vertex" => cad_core::topo::SelectionFilter::Vertex,
                    "Body" => cad_core::topo::SelectionFilter::Body,
                    _ => cad_core::topo::SelectionFilter::Any,
                };
                selection_state.set_filter(filter);
                info!("Selection Filter set to {:?}", filter);

            } else if text == "CLEAR_SELECTION" {
                selection_state.clear();
                info!("Cleared all selections");
                
                // Broadcast empty selection
                if socket.send(Message::Text("SELECTION_UPDATE:[]".to_string())).await.is_err() {
                    return;
                }

            } else if text.starts_with("SELECTION_GROUP_CREATE:") {
                // Format: SELECTION_GROUP_CREATE:GroupName
                let name = text.trim_start_matches("SELECTION_GROUP_CREATE:");
                if name.is_empty() {
                    warn!("Empty group name provided");
                } else {
                    selection_state.create_group(name);
                    info!("Created selection group '{}' with {} items", name, selection_state.selected.len());
                    
                    // Send updated groups list
                    let groups = selection_state.list_groups();
                    let groups_json = serde_json::to_string(&groups).unwrap_or("[]".into());
                    if socket.send(Message::Text(format!("SELECTION_GROUPS_UPDATE:{}", groups_json))).await.is_err() {
                        return;
                    }
                }

            } else if text.starts_with("SELECTION_GROUP_RESTORE:") {
                // Format: SELECTION_GROUP_RESTORE:GroupName
                let name = text.trim_start_matches("SELECTION_GROUP_RESTORE:");
                if selection_state.restore_group(name) {
                    info!("Restored selection group '{}' with {} items", name, selection_state.selected.len());
                    
                    // Broadcast Selection Update
                    let update = serde_json::to_string(&selection_state.selected).unwrap_or("[]".into());
                    if socket.send(Message::Text(format!("SELECTION_UPDATE:{}", update))).await.is_err() {
                        return;
                    }
                } else {
                    warn!("Selection group '{}' not found", name);
                }

            } else if text.starts_with("SELECTION_GROUP_DELETE:") {
                // Format: SELECTION_GROUP_DELETE:GroupName
                let name = text.trim_start_matches("SELECTION_GROUP_DELETE:");
                if selection_state.delete_group(name) {
                    info!("Deleted selection group '{}'", name);
                    
                    // Send updated groups list
                    let groups = selection_state.list_groups();
                    let groups_json = serde_json::to_string(&groups).unwrap_or("[]".into());
                    if socket.send(Message::Text(format!("SELECTION_GROUPS_UPDATE:{}", groups_json))).await.is_err() {
                        return;
                    }
                } else {
                    warn!("Selection group '{}' not found for deletion", name);
                }

            } else if text == "SELECTION_GROUPS_LIST" {
                // Returns list of all selection groups with item counts
                let groups = selection_state.list_groups();
                let groups_json = serde_json::to_string(&groups).unwrap_or("[]".into());
                info!("Listing {} selection groups", groups.len());
                if socket.send(Message::Text(format!("SELECTION_GROUPS_UPDATE:{}", groups_json))).await.is_err() {
                    return;
                }

            } else if text.starts_with("TOGGLE_SUPPRESSION:") {
                let id_str = text.trim_start_matches("TOGGLE_SUPPRESSION:");
                if let Ok(id) = uuid::Uuid::parse_str(id_str) {
                     let entity_id = cad_core::topo::EntityId::from_uuid(id);
                     
                     // Scope for mutation and data extraction to minimize lock duration
                     let (json_update, program) = {
                         let mut graph = state.graph.write().unwrap();
                         match graph.toggle_suppression(entity_id) {
                             Ok(new_state) => {
                                 info!("Toggled suppression for {}: {}", id, new_state);
                                 let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                 let program = graph.regenerate();
                                 (Some(json), Some(program))
                             }
                             Err(e) => {
                                 warn!("Failed to toggle suppression: {}", e);
                                 (None, None)
                             }
                         }
                     }; // Lock dropped here!

                     if let Some(json) = json_update {
                         if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                             return;
                         }
                     }

                     if let Some(program) = program {
                         match runtime.evaluate(&program, &generator) {
                            Ok(result) => {
                                 info!("Auto-Regen produced {} topological entities", result.topology_manifest.len());
                                 let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                 if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                     return;
                                 }
                            }
                            Err(e) => warn!("Auto-regen failed: {}", e),
                         }
                     }

                } else {
                     warn!("Invalid UUID for Toggle Suppression: {}", id_str);
                }

            } else if text.starts_with("DELETE_FEATURE:") {
                 let id_str = text.trim_start_matches("DELETE_FEATURE:");
                 if let Ok(id) = uuid::Uuid::parse_str(id_str) {
                      let entity_id = cad_core::topo::EntityId::from_uuid(id);
                      
                      let (json_update, program) = {
                          let mut graph = state.graph.write().unwrap();
                          if graph.remove_node(entity_id).is_some() {
                              info!("Deleted feature {}", id);
                              // IMPORTANT: regenerate() BEFORE serializing to ensure sort_order is populated
                              let program = graph.regenerate();
                              let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                              (Some(json), Some(program))
                          } else {
                              warn!("Feature {} not found for deletion", id);
                              (None, None)
                          }
                      };

                      if let Some(json) = json_update {
                          if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                              return;
                          }
                      }

                      if let Some(program) = program {
                          match runtime.evaluate(&program, &generator) {
                             Ok(result) => {
                                  info!("Auto-Regen after delete produced {} topological entities", result.topology_manifest.len());
                                  let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                  if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                      return;
                                  }
                             }
                             Err(e) => warn!("Auto-regen failed: {}", e),
                          }
                      }
                 } else {
                      warn!("Invalid UUID for DELETE_FEATURE: {}", id_str);
                 }
            } else if text.starts_with("UPDATE_FEATURE:") {
                 // Format: UPDATE_FEATURE:{"id": "UUID", "params": { ... }}
                 let json_str = text.trim_start_matches("UPDATE_FEATURE:");
                 #[derive(Deserialize)]
                 struct UpdateCmd {
                     id: uuid::Uuid,
                     params: std::collections::HashMap<String, cad_core::features::types::ParameterValue>,
                 }
                 
                 if let Ok(cmd) = serde_json::from_str::<UpdateCmd>(json_str) {
                      let entity_id = cad_core::topo::EntityId::from_uuid(cmd.id);
                      
                      let (json_update, program, solve_result_json, error_msg) = {
                          let mut graph = state.graph.write().unwrap();
                          match graph.update_feature_params(entity_id, cmd.params) {
                              Ok(_) => {
                                   info!("Updated feature {}", cmd.id);
                                   
                                   // Run sketch solver if this is a sketch feature
                                   let mut solve_result_json: Option<String> = None;
                                   if let Some(node) = graph.nodes.get_mut(&entity_id) {
                                       info!("Feature type: {:?}, params keys: {:?}", node.feature_type, node.parameters.keys().collect::<Vec<_>>());
                                       if node.feature_type == cad_core::features::types::FeatureType::Sketch {
                                           info!("Is Sketch feature, checking for sketch_data");
                                           if let Some(cad_core::features::types::ParameterValue::Sketch(ref mut sketch)) = node.parameters.get_mut("sketch_data") {
                                               use cad_core::sketch::solver::SketchSolver;
                                               info!("Running solver on {} entities, {} constraints", sketch.entities.len(), sketch.constraints.len());
                                               let result = SketchSolver::solve_with_result(sketch);
                                               info!("Sketch solver: converged={} iterations={} dof={}", result.converged, result.iterations, result.dof);
                                               // Serialize solve result for frontend
                                               solve_result_json = Some(serde_json::to_string(&result).unwrap_or("{}".into()));
                                           } else {
                                               info!("sketch_data NOT found or wrong type");
                                           }
                                       }
                                   }
                                   
                                   let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                   let program = graph.regenerate();
                                   (Some(json), Some(program), solve_result_json, None)
                              }
                              Err(e) => {
                                  let err_str = format!("Failed to update feature: {}", e);
                                  warn!("{}", err_str);
                                  (None, None, None, Some(err_str))
                              }
                          }
                      };

                      if let Some(json) = json_update {
                          if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                              return;
                          }
                      }

                      // Send error to frontend if feature update failed
                      if let Some(err) = error_msg {
                          let error_ws_msg = format_error("FEATURE_ERROR", &err, "error");
                          let _ = socket.send(Message::Text(error_ws_msg)).await;
                      }

                      // Send sketch solve status for DOF display
                      if let Some(ref solve_json) = solve_result_json {
                          info!("Sending SKETCH_STATUS with {} bytes", solve_json.len());
                          if socket.send(Message::Text(format!("SKETCH_STATUS:{}", solve_json))).await.is_err() {
                              return;
                          }
                      }

                      if let Some(program) = program {
                          match runtime.evaluate(&program, &generator) {
                             Ok(result) => {
                                  info!("Auto-Regen after update produced {} topological entities", result.topology_manifest.len());
                                  
                                  // Update Registry
                                  let mut registry = cad_core::topo::TopoRegistry::new();
                                   for (_, entity) in &result.topology_manifest {
                                      registry.register(entity.clone());
                                  }

                                  // Validate References
                                  let required_refs = {
                                      let graph = state.graph.read().unwrap();
                                      graph.collect_all_references()
                                  };
                                  let zombies = registry.validate_references(&required_refs);
                                   if !zombies.is_empty() {
                                      let zombie_json = serde_json::to_string(&zombies).unwrap_or("[]".into());
                                      let _ = socket.send(Message::Text(format!("ZOMBIE_UPDATE:{}", zombie_json))).await;
                                  } else {
                                      // Clear zombies if fixed
                                      let _ = socket.send(Message::Text(format!("ZOMBIE_UPDATE:[]"))).await;
                                  }


                                  let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                  if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                      return;
                                  }
                             }
                             Err(e) => warn!("Auto-regen failed: {}", e),
                          }
                      }
                 } else {
                     warn!("Failed to parse UPDATE_FEATURE command");
                 }

            } else if text.starts_with("CREATE_FEATURE:") {
                 // Format: CREATE_FEATURE:{"type": "Sketch", "name": "Sketch 1"}
                 let json_str = text.trim_start_matches("CREATE_FEATURE:");
                 #[derive(Deserialize)]
                 struct CreateCmd {
                     #[serde(rename = "type")]
                     feature_type: String, // "Sketch", etc.
                     name: String,
                     dependencies: Option<Vec<uuid::Uuid>>,
                 }
                 
                 if let Ok(cmd) = serde_json::from_str::<CreateCmd>(json_str) {
                      let f_type = match cmd.feature_type.as_str() {
                          "Sketch" => cad_core::features::types::FeatureType::Sketch,
                          "Extrude" => cad_core::features::types::FeatureType::Extrude,
                          "Revolve" => cad_core::features::types::FeatureType::Revolve,
                          _ => cad_core::features::types::FeatureType::Point // Default fallback
                      };
                      
                      let mut feature = cad_core::features::types::Feature::new(&cmd.name, f_type);
                      if let Some(deps) = cmd.dependencies {
                          feature.dependencies = deps.into_iter().map(cad_core::topo::EntityId::from_uuid).collect();
                      }
                      let id = feature.id;

                      let (json_update, program) = {
                          let mut graph = state.graph.write().unwrap();
                          graph.add_node(feature);
                          
                          info!("Created new feature {} ({})", cmd.name, id);
                          // Regenerate first to update sort order
                          let program = graph.regenerate();
                          let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                          (Some(json), Some(program))
                      };

                      if let Some(json) = json_update {
                          if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                              return;
                          }
                      }
                      
                      // Trigger regen to update visuals (even if empty)
                       if let Some(program) = program {
                          match runtime.evaluate(&program, &generator) {
                             Ok(result) => {
                                  let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                  if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                      return;
                                  }
                             }
                             Err(e) => warn!("Auto-regen failed: {}", e),
                          }
                      }
                 }
            } else if text.starts_with("GET_REGIONS:") {
                // Format: GET_REGIONS:sketchFeatureId
                // Returns computed regions using the planar graph algorithm
                let id_str = text.trim_start_matches("GET_REGIONS:");
                if let Ok(id) = uuid::Uuid::parse_str(id_str) {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    
                    let regions_json = {
                        let graph = state.graph.read().unwrap();
                        if let Some(node) = graph.nodes.get(&entity_id) {
                            if let Some(cad_core::features::types::ParameterValue::Sketch(ref sketch)) = node.parameters.get("sketch_data") {
                                // Compute regions using the planar graph algorithm
                                let regions = cad_core::sketch::regions::find_regions(&sketch.entities);
                                info!("Computed {} regions for sketch {}", regions.len(), id);
                                
                                // Convert to JSON-serializable format
                                let serializable_regions: Vec<serde_json::Value> = regions.iter().map(|r| {
                                    serde_json::json!({
                                        "id": r.id.to_string(),
                                        "boundary_entity_ids": r.boundary_entity_ids.iter().map(|e| e.to_string()).collect::<Vec<_>>(),
                                        "boundary_points": r.boundary_points,
                                        "voids": r.voids,
                                        "centroid": r.centroid,
                                        "area": r.area
                                    })
                                }).collect();
                                
                                Some(serde_json::to_string(&serializable_regions).unwrap_or("[]".into()))
                            } else {
                                warn!("Sketch data not found for feature {}", id);
                                None
                            }
                        } else {
                            warn!("Feature {} not found", id);
                            None
                        }
                    };
                    
                    if let Some(json) = regions_json {
                        if socket.send(Message::Text(format!("REGIONS_UPDATE:{}", json))).await.is_err() {
                            return;
                        }
                    }
                } else {
                    warn!("Invalid UUID for GET_REGIONS: {}", id_str);
                }
            } else if text.starts_with("VARIABLE_ADD:") {
                // Format: VARIABLE_ADD:{"name":"x","expression":"10","unit":{"type":"Length","value":"Millimeter"},"description":"..."}
                let json_str = text.trim_start_matches("VARIABLE_ADD:");
                
                #[derive(Deserialize)]
                struct VariableAddCmd {
                    name: String,
                    expression: String,
                    #[serde(default)]
                    unit: Option<cad_core::variables::Unit>,
                    description: Option<String>,
                }
                
                if let Ok(cmd) = serde_json::from_str::<VariableAddCmd>(json_str) {
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        
                        let unit = cmd.unit.unwrap_or(cad_core::variables::Unit::Dimensionless);
                        let mut var = cad_core::variables::Variable::with_expression(&cmd.name, &cmd.expression, unit);
                        if let Some(desc) = cmd.description {
                            var.description = desc;
                        }
                        
                        match graph.variables.add(var) {
                            Ok(id) => {
                                info!("Added variable '{}' with id {}", cmd.name, id);
                                
                                // Evaluate all variables
                                cad_core::variables::evaluator::evaluate_all(&mut graph.variables);
                                
                                let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                let program = graph.regenerate();
                                (Some(json), Some(program))
                            }
                            Err(e) => {
                                warn!("Failed to add variable: {}", e);
                                (None, None)
                            }
                        }
                    };
                    
                    if let Some(json) = json_update {
                        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                            return;
                        }
                    }
                    
                    if let Some(program) = program {
                        match runtime.evaluate(&program, &generator) {
                            Ok(result) => {
                                let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                    return;
                                }
                            }
                            Err(e) => warn!("Auto-regen failed: {}", e),
                        }
                    }
                } else {
                    warn!("Failed to parse VARIABLE_ADD command: {}", json_str);
                }
                
            } else if text.starts_with("VARIABLE_UPDATE:") {
                // Format: VARIABLE_UPDATE:{"id":"uuid","name":"...","expression":"...","unit":...,"description":"..."}
                let json_str = text.trim_start_matches("VARIABLE_UPDATE:");
                
                #[derive(Deserialize)]
                struct VariableUpdateCmd {
                    id: uuid::Uuid,
                    name: Option<String>,
                    expression: Option<String>,
                    unit: Option<cad_core::variables::Unit>,
                    description: Option<String>,
                }
                
                if let Ok(cmd) = serde_json::from_str::<VariableUpdateCmd>(json_str) {
                    let entity_id = cad_core::topo::EntityId::from_uuid(cmd.id);
                    
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        let mut success = true;
                        
                        // Update name if provided
                        if let Some(ref name) = cmd.name {
                            if let Err(e) = graph.variables.update_name(entity_id, name) {
                                warn!("Failed to update variable name: {}", e);
                                success = false;
                            }
                        }
                        
                        // Update expression if provided
                        if success {
                            if let Some(ref expr) = cmd.expression {
                                if let Err(e) = graph.variables.update_expression(entity_id, expr) {
                                    warn!("Failed to update variable expression: {}", e);
                                    success = false;
                                }
                            }
                        }
                        
                        // Update unit if provided
                        if success {
                            if let Some(ref unit) = cmd.unit {
                                if let Err(e) = graph.variables.update_unit(entity_id, unit.clone()) {
                                    warn!("Failed to update variable unit: {}", e);
                                    success = false;
                                }
                            }
                        }
                        
                        // Update description if provided
                        if success {
                            if let Some(ref desc) = cmd.description {
                                if let Err(e) = graph.variables.update_description(entity_id, desc) {
                                    warn!("Failed to update variable description: {}", e);
                                    success = false;
                                }
                            }
                        }
                        
                        if success {
                            info!("Updated variable {}", cmd.id);
                            
                            // Re-evaluate all variables
                            cad_core::variables::evaluator::evaluate_all(&mut graph.variables);
                            
                            let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                            let program = graph.regenerate();
                            (Some(json), Some(program))
                        } else {
                            (None, None)
                        }
                    };
                    
                    if let Some(json) = json_update {
                        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                            return;
                        }
                    }
                    
                    if let Some(program) = program {
                        match runtime.evaluate(&program, &generator) {
                            Ok(result) => {
                                let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                    return;
                                }
                            }
                            Err(e) => warn!("Auto-regen failed: {}", e),
                        }
                    }
                } else {
                    warn!("Failed to parse VARIABLE_UPDATE command: {}", json_str);
                }
                
            } else if text.starts_with("VARIABLE_DELETE:") {
                // Format: VARIABLE_DELETE:uuid
                let id_str = text.trim_start_matches("VARIABLE_DELETE:");
                
                if let Ok(id) = uuid::Uuid::parse_str(id_str) {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        
                        if graph.variables.remove(entity_id).is_some() {
                            info!("Deleted variable {}", id);
                            
                            // Re-evaluate remaining variables
                            cad_core::variables::evaluator::evaluate_all(&mut graph.variables);
                            
                            let program = graph.regenerate();
                            let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                            (Some(json), Some(program))
                        } else {
                            warn!("Variable {} not found for deletion", id);
                            (None, None)
                        }
                    };
                    
                    if let Some(json) = json_update {
                        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                            return;
                        }
                    }
                    
                    if let Some(program) = program {
                        match runtime.evaluate(&program, &generator) {
                            Ok(result) => {
                                let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
                                if socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await.is_err() {
                                    return;
                                }
                            }
                            Err(e) => warn!("Auto-regen failed: {}", e),
                        }
                    }
                } else {
                    warn!("Invalid UUID for VARIABLE_DELETE: {}", id_str);
                }
                
            } else if text.starts_with("VARIABLE_REORDER:") {
                // Format: VARIABLE_REORDER:{"id":"uuid","new_index":0}
                let json_str = text.trim_start_matches("VARIABLE_REORDER:");
                
                #[derive(Deserialize)]
                struct VariableReorderCmd {
                    id: uuid::Uuid,
                    new_index: usize,
                }
                
                if let Ok(cmd) = serde_json::from_str::<VariableReorderCmd>(json_str) {
                    let entity_id = cad_core::topo::EntityId::from_uuid(cmd.id);
                    
                    let json_update = {
                        let mut graph = state.graph.write().unwrap();
                        
                        match graph.variables.reorder(entity_id, cmd.new_index) {
                            Ok(_) => {
                                info!("Reordered variable {} to index {}", cmd.id, cmd.new_index);
                                Some(serde_json::to_string(&*graph).unwrap_or("{}".to_string()))
                            }
                            Err(e) => {
                                warn!("Failed to reorder variable: {}", e);
                                None
                            }
                        }
                    };
                    
                    if let Some(json) = json_update {
                        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                            return;
                        }
                    }
                } else {
                    warn!("Failed to parse VARIABLE_REORDER command: {}", json_str);
                }
                
            } else {
                 if socket.send(Message::Text(format!("Echo: {}", text))).await.is_err() {
                     return;
                 }
            }
        }
    }
}

