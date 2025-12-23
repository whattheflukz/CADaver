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
                              let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                              let program = graph.regenerate();
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
                      
                      let (json_update, program, solve_result_json) = {
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
                                   (Some(json), Some(program), solve_result_json)
                              }
                              Err(e) => {
                                  warn!("Failed to update feature: {}", e);
                                  (None, None, None)
                              }
                          }
                      };

                      if let Some(json) = json_update {
                          if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
                              return;
                          }
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
                 }
                 
                 if let Ok(cmd) = serde_json::from_str::<CreateCmd>(json_str) {
                      let f_type = match cmd.feature_type.as_str() {
                          "Sketch" => cad_core::features::types::FeatureType::Sketch,
                          "Extrude" => cad_core::features::types::FeatureType::Extrude,
                          _ => cad_core::features::types::FeatureType::Point // Default fallback
                      };
                      
                      let feature = cad_core::features::types::Feature::new(&cmd.name, f_type);
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
            } else {
                 if socket.send(Message::Text(format!("Echo: {}", text))).await.is_err() {
                     return;
                 }
            }
        }
    }
}
