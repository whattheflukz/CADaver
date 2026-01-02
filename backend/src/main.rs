use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing::{info, warn};
use futures::{stream::StreamExt, SinkExt};
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
    registry: Arc<RwLock<cad_core::topo::TopoRegistry>>,
}

// --- API Protocol Definitions ---

#[derive(Deserialize, Debug)]
#[serde(tag = "command", content = "payload")] 
enum WebSocketCommand {
    Regen,
    Select(SelectCmd),
    SetFilter { filter: String },
    ClearSelection,
    CreateFeature(CreateCmd),
    UpdateFeature(UpdateCmd),
    DeleteFeature { id: uuid::Uuid },
    VariableAdd(VariableAddCmd),
    VariableUpdate(VariableUpdateCmd),
    VariableDelete { id: uuid::Uuid },
    VariableReorder { id: uuid::Uuid, new_index: usize },
    GetRegions { id: uuid::Uuid },
    SelectionGroupCreate { name: String },
    SelectionGroupRestore { name: String },
    SelectionGroupDelete { name: String },
    SelectionGroupsList,
    ToggleSuppression { id: uuid::Uuid },
    SetRollback { id: Option<uuid::Uuid> },
    ReorderFeature { id: uuid::Uuid, new_index: usize },
    InsertFeature { feature_type: String, name: String, after_id: Option<uuid::Uuid>, dependencies: Option<Vec<uuid::Uuid>> },
    ProjectEntity { sketch_id: uuid::Uuid, topo_id: cad_core::topo::naming::TopoId },
}

#[derive(Deserialize, Debug)]
struct SelectCmd {
    id: cad_core::topo::naming::TopoId,
    modifier: Option<String>, // "add", "remove", "replace" (default)
}

#[derive(Deserialize, Debug)]
struct CreateCmd {
    #[serde(rename = "type")]
    feature_type: String, 
    name: String,
    dependencies: Option<Vec<uuid::Uuid>>,
}

#[derive(Deserialize, Debug)]
struct UpdateCmd {
    id: uuid::Uuid,
    params: std::collections::HashMap<String, cad_core::features::types::ParameterValue>,
}

#[derive(Deserialize, Debug)]
struct VariableAddCmd {
    name: String,
    expression: String,
    #[serde(default)]
    unit: Option<cad_core::variables::Unit>,
    description: Option<String>,
}

#[derive(Deserialize, Debug)]
struct VariableUpdateCmd {
    id: uuid::Uuid,
    name: Option<String>,
    expression: Option<String>,
    unit: Option<cad_core::variables::Unit>,
    description: Option<String>,
}

// --------------------------------

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let shared_state = Arc::new(AppState {
        graph: Arc::new(RwLock::new(FeatureGraph::new())),
        registry: Arc::new(RwLock::new(cad_core::topo::TopoRegistry::new())),
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
    
    // Send initial graph state
    let program = {
        let json = {
            let graph = state.graph.read().unwrap();
            serde_json::to_string(&*graph).unwrap_or("{}".to_string())
        };
        
        if socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await.is_err() {
            return;
        }
        
        // Generate initial program for tessellation
        let mut graph = state.graph.write().unwrap();
        graph.regenerate()
    };

    let runtime = cad_core::evaluator::Runtime::new();
    let generator = cad_core::topo::IdGenerator::new("Session1"); 
    let mut selection_state = cad_core::topo::SelectionState::new();
    
    // Send initial tessellation so viewport shows content on page load
    process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;

    while let Some(msg) = socket.recv().await {
        let msg = if let Ok(msg) = msg {
            msg
        } else {
            return;
        };

        if let Message::Text(text) = msg {
            // New Logic: Parse JSON Command
            let command: WebSocketCommand = match serde_json::from_str(&text) {
                Ok(cmd) => cmd,
                Err(e) => {
                    warn!("Failed to parse command '{}': {}", text, e);
                    continue;
                }
            };
            
            info!("Received command: {:?}", command);

            match command {
                WebSocketCommand::Regen => {
                    let program = {
                        let mut graph = state.graph.write().unwrap();
                        graph.regenerate()
                    };
                    process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                }
                
                WebSocketCommand::Select(cmd) => {
                     let modifier = cmd.modifier.as_deref().unwrap_or("replace");
                     match modifier {
                         "add" => selection_state.select(cmd.id, true),
                         "remove" => selection_state.deselect(&cmd.id),
                         _ => selection_state.select(cmd.id, false),
                     }
                     broadcast_selection(&mut socket, &selection_state).await;
                }

                WebSocketCommand::SetFilter { filter } => {
                    let f = match filter.as_str() {
                        "Face" => cad_core::topo::SelectionFilter::Face,
                        "Edge" => cad_core::topo::SelectionFilter::Edge,
                        "Vertex" => cad_core::topo::SelectionFilter::Vertex,
                        "Body" => cad_core::topo::SelectionFilter::Body,
                        _ => cad_core::topo::SelectionFilter::Any,
                    };
                    selection_state.set_filter(f);
                }

                WebSocketCommand::ClearSelection => {
                    selection_state.clear();
                     // Broadcast empty selection
                    if socket.send(Message::Text("SELECTION_UPDATE:[]".to_string())).await.is_err() {
                        return;
                    }
                }

                WebSocketCommand::CreateFeature(cmd) => {
                       let f_type = match cmd.feature_type.as_str() {
                          "Sketch" => cad_core::features::types::FeatureType::Sketch,
                          "Extrude" => cad_core::features::types::FeatureType::Extrude,
                          "Revolve" => cad_core::features::types::FeatureType::Revolve,
                          "Fillet" => cad_core::features::types::FeatureType::Fillet,
                          "Chamfer" => cad_core::features::types::FeatureType::Chamfer,
                          "Plane" => cad_core::features::types::FeatureType::Plane,
                          "Axis" => cad_core::features::types::FeatureType::Axis,
                          "Point" => cad_core::features::types::FeatureType::Point,
                          _ => {
                              warn!("Unknown feature type: {}", cmd.feature_type);
                              cad_core::features::types::FeatureType::Point
                          }
                      };
                      
                      let mut feature = cad_core::features::types::Feature::new(&cmd.name, f_type);
                      if let Some(deps) = cmd.dependencies {
                          feature.dependencies = deps.into_iter().map(cad_core::topo::EntityId::from_uuid).collect();
                      }
                      
                      let (json_update, program) = {
                          let mut graph = state.graph.write().unwrap();
                          graph.add_node(feature);
                          let program = graph.regenerate();
                          let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                          (Some(json), Some(program))
                      };

                      if let Some(json) = json_update {
                          let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await;
                      }
                      
                      if let Some(program) = program {
                          process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                      }
                }

                WebSocketCommand::UpdateFeature(cmd) => {
                      let entity_id = cad_core::topo::EntityId::from_uuid(cmd.id);
                      
                      let (json_update, program, solve_result_json, error_msg) = {
                          let mut graph = state.graph.write().unwrap();
                          match graph.update_feature_params(entity_id, cmd.params) {
                              Ok(_) => {
                                   let mut solve_result_json: Option<String> = None;
                                   if let Some(node) = graph.nodes.get_mut(&entity_id) {
                                       if node.feature_type == cad_core::features::types::FeatureType::Sketch {
                                           if let Some(cad_core::features::types::ParameterValue::Sketch(ref mut sketch)) = node.parameters.get_mut("sketch_data") {
                                               use cad_core::sketch::solver::SketchSolver;
                                               let result = SketchSolver::solve_with_result(sketch);
                                               solve_result_json = Some(serde_json::to_string(&result).unwrap_or("{}".into()));
                                           }
                                       }
                                   }
                                   
                                   let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                   let program = graph.regenerate();
                                   (Some(json), Some(program), solve_result_json, None)
                              }
                              Err(e) => (None, None, None, Some(format!("Failed to update feature: {}", e)))
                          }
                      };

                      if let Some(json) = json_update {
                          let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await;
                      }

                      if let Some(err) = error_msg {
                          let _ = socket.send(Message::Text(format_error("FEATURE_ERROR", &err, "error"))).await;
                      }

                      if let Some(ref solve_json) = solve_result_json {
                          let _ = socket.send(Message::Text(format!("SKETCH_STATUS:{}", solve_json))).await;
                      }

                      if let Some(program) = program {
                          process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                      }
                }

                WebSocketCommand::DeleteFeature { id } => {
                       let entity_id = cad_core::topo::EntityId::from_uuid(id);
                       let (json_update, program) = {
                           let mut graph = state.graph.write().unwrap();
                           if graph.remove_node(entity_id).is_some() {
                               let program = graph.regenerate();
                               let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                               (Some(json), Some(program))
                           } else {
                               (None, None)
                           }
                       };

                       if let Some(json) = json_update {
                           let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await;
                       }
                       if let Some(program) = program {
                            process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                       }
                }

                WebSocketCommand::VariableAdd(cmd) => {
                     let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        let unit = cmd.unit.unwrap_or(cad_core::variables::Unit::Dimensionless);
                        let mut var = cad_core::variables::Variable::with_expression(&cmd.name, &cmd.expression, unit);
                        if let Some(desc) = cmd.description {
                            var.description = desc;
                        }
                        
                        match graph.variables.add(var) {
                            Ok(_) => {
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
                    if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                    if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }

                WebSocketCommand::VariableUpdate(cmd) => {
                     let entity_id = cad_core::topo::EntityId::from_uuid(cmd.id);
                     let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        let mut success = true;
                        
                        if let Some(ref name) = cmd.name {
                            if graph.variables.update_name(entity_id, name).is_err() { success = false; }
                        }
                        if success {
                            if let Some(ref expr) = cmd.expression {
                                if graph.variables.update_expression(entity_id, expr).is_err() { success = false; }
                            }
                        }
                        if success {
                            if let Some(ref unit) = cmd.unit {
                                if graph.variables.update_unit(entity_id, unit.clone()).is_err() { success = false; }
                            }
                        }
                        if success {
                            if let Some(ref desc) = cmd.description {
                                if graph.variables.update_description(entity_id, desc).is_err() { success = false; }
                            }
                        }
                        
                        if success {
                            cad_core::variables::evaluator::evaluate_all(&mut graph.variables);
                            let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                            let program = graph.regenerate();
                            (Some(json), Some(program))
                        } else {
                            (None, None)
                        }
                    };
                    
                    if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                    if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }

                WebSocketCommand::VariableDelete { id } => {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                         if graph.variables.remove(entity_id).is_some() {
                             cad_core::variables::evaluator::evaluate_all(&mut graph.variables);
                             let program = graph.regenerate();
                             let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                             (Some(json), Some(program))
                         } else {
                             (None, None)
                         }
                    };
                    if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                    if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }

                WebSocketCommand::VariableReorder { id, new_index } => {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    let json_update = {
                        let mut graph = state.graph.write().unwrap();
                        match graph.variables.reorder(entity_id, new_index) {
                            Ok(_) => Some(serde_json::to_string(&*graph).unwrap_or("{}".to_string())),
                            Err(_) => None
                        }
                    };
                    if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                }

                WebSocketCommand::GetRegions { id } => {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    let regions_json = {
                        let graph = state.graph.read().unwrap();
                        if let Some(node) = graph.nodes.get(&entity_id) {
                            if let Some(cad_core::features::types::ParameterValue::Sketch(ref sketch)) = node.parameters.get("sketch_data") {
                                let regions = cad_core::sketch::regions::find_regions(&sketch.entities);
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
                            } else { None }
                        } else { None }
                    };
                    if let Some(json) = regions_json {
                        let _ = socket.send(Message::Text(format!("REGIONS_UPDATE:{}", json))).await;
                    }
                }

                WebSocketCommand::SelectionGroupCreate { name } => {
                     selection_state.create_group(&name);
                     broadcast_groups(&mut socket, &selection_state).await;
                }
                
                WebSocketCommand::SelectionGroupRestore { name } => {
                    if selection_state.restore_group(&name) {
                        broadcast_selection(&mut socket, &selection_state).await;
                    }
                }
                
                WebSocketCommand::SelectionGroupDelete { name } => {
                    if selection_state.delete_group(&name) {
                        broadcast_groups(&mut socket, &selection_state).await;
                    }
                }
                
                WebSocketCommand::SelectionGroupsList => {
                    broadcast_groups(&mut socket, &selection_state).await;
                }

                WebSocketCommand::ToggleSuppression { id } => {
                     let entity_id = cad_core::topo::EntityId::from_uuid(id);
                     let (json_update, program) = {
                         let mut graph = state.graph.write().unwrap();
                         match graph.toggle_suppression(entity_id) {
                             Ok(_) => {
                                 let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                 let program = graph.regenerate();
                                 (Some(json), Some(program))
                             }
                             Err(_) => (None, None)
                         }
                     };
                     if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                     if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }

                WebSocketCommand::SetRollback { id } => {
                    let entity_id = id.map(cad_core::topo::EntityId::from_uuid);
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        if graph.set_rollback(entity_id) {
                            let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                            let program = graph.regenerate();
                            (Some(json), Some(program))
                        } else {
                            (None, None)
                        }
                    };
                    if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                    if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }

                WebSocketCommand::ReorderFeature { id, new_index } => {
                    let entity_id = cad_core::topo::EntityId::from_uuid(id);
                    let result = {
                        let mut graph = state.graph.write().unwrap();
                        graph.reorder_feature(entity_id, new_index)
                    };
                    match result {
                        Ok(()) => {
                            // Reorder succeeded, send updated graph and regenerate
                            let (json_update, program) = {
                                let mut graph = state.graph.write().unwrap();
                                let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                let program = graph.regenerate();
                                (json, program)
                            };
                            let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json_update))).await;
                            process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                        }
                        Err(err_msg) => {
                            // Send error to client
                            let error = serde_json::json!({
                                "code": "REORDER_FAILED",
                                "message": err_msg,
                                "severity": "warning"
                            });
                            let _ = socket.send(Message::Text(format!("ERROR_UPDATE:{}", error))).await;
                        }
                    }
                }

                WebSocketCommand::InsertFeature { feature_type, name, after_id, dependencies } => {
                    let ft = match feature_type.as_str() {
                        "Sketch" => cad_core::features::types::FeatureType::Sketch,
                        "Extrude" => cad_core::features::types::FeatureType::Extrude,
                        "Revolve" => cad_core::features::types::FeatureType::Revolve,
                        "Cut" => cad_core::features::types::FeatureType::Cut,
                        _ => {
                            let error = serde_json::json!({
                                "code": "INSERT_FAILED",
                                "message": format!("Unknown feature type: {}", feature_type),
                                "severity": "error"
                            });
                            let _ = socket.send(Message::Text(format!("ERROR_UPDATE:{}", error))).await;
                            continue;
                        }
                    };
                    
                    let mut feature = cad_core::features::types::Feature::new(&name, ft);
                    if let Some(deps) = dependencies {
                        feature.dependencies = deps.iter().map(|u| cad_core::topo::EntityId::from_uuid(*u)).collect();
                    }
                    
                    let after_entity_id = after_id.map(cad_core::topo::EntityId::from_uuid);
                    
                    let (json_update, program) = {
                        let mut graph = state.graph.write().unwrap();
                        let success = graph.insert_node_at(feature, after_entity_id);
                        if !success && after_id.is_some() {
                            // Log warning but continue
                            tracing::warn!("Insert after ID not found, inserted at end");
                        }
                        let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                        let program = graph.regenerate();
                        (json, program)
                    };
                    let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json_update))).await;
                    process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await;
                }

                WebSocketCommand::ProjectEntity { sketch_id, topo_id } => {
                     let entity_id = cad_core::topo::EntityId::from_uuid(sketch_id);
                     let (json_update, program, error_msg) = {    
                         let registry = state.registry.read().unwrap();
                         if let Some(kernel_entity) = registry.resolve(&topo_id) {
                            let mut graph = state.graph.write().unwrap();
                            if let Some(node) = graph.nodes.get_mut(&entity_id) {
                                if let Some(cad_core::features::types::ParameterValue::Sketch(ref mut sketch)) = node.parameters.get_mut("sketch_data") {
                                    // Found sketch and entity! Now project.
                                    // 1. Get geometry from kernel_entity
                                    let geom = &kernel_entity.geometry;
                                    
                                    // 2. Project onto sketch plane using local axes
                                    let origin = sketch.plane.origin;
                                    let x_axis = sketch.plane.x_axis;
                                    let y_axis = sketch.plane.y_axis;
                                    
                                    let project_to_2d = |p: [f64; 3]| -> [f64; 2] {
                                        let v = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
                                        let x = v[0]*x_axis[0] + v[1]*x_axis[1] + v[2]*x_axis[2];
                                        let y = v[0]*y_axis[0] + v[1]*y_axis[1] + v[2]*y_axis[2];
                                        [x, y]
                                    };
                                    
                                    let projected_opt = match geom {
                                        cad_core::topo::registry::AnalyticGeometry::Line { start, end } => {
                                             Some(cad_core::sketch::types::SketchGeometry::Line { 
                                                 start: project_to_2d(*start), 
                                                 end: project_to_2d(*end) 
                                             })
                                        },
                                        _ => None
                                    };

                                    if let Some(geo) = projected_opt {
                                        let new_id = sketch.add_entity(geo);
                                        // Mark as construction? Or explicit projected flag?
                                        // For now, let's make it construction by default so it doesn't mess up profiles
                                        if let Some(entity) = sketch.entities.iter_mut().find(|e| e.id == new_id) {
                                            entity.is_construction = true;
                                        }
                                        
                                        // Add to external references
                                        sketch.external_references.insert(new_id, topo_id);
                                        
                                        // Add Fix constraint to anchor it? 
                                        // Or rely on solver respecting external_references?
                                        // Adding Fix is safer for existing solver.
                                        // But we need the position. 
                                        // Ideally, we add a "Projected" constraint which holds the TopoId.
                                        
                                        let json = serde_json::to_string(&*graph).unwrap_or("{}".to_string());
                                        let program = graph.regenerate();
                                        (Some(json), Some(program), None)
                                    } else {
                                        (None, None, Some("Geometry type not supported for projection".to_string()))
                                    }
                                } else {
                                    (None, None, Some("Feature is not a sketch".to_string()))
                                }
                            } else {
                                (None, None, Some("Sketch feature not found".to_string()))
                            }
                         } else {
                             (None, None, Some("Referenced entity not found in registry".to_string()))
                         }
                     };

                     if let Some(err) = error_msg {
                         let _ = socket.send(Message::Text(format_error("PROJECTION_FAILED", &err, "error"))).await;
                     }
                     if let Some(json) = json_update { let _ = socket.send(Message::Text(format!("GRAPH_UPDATE:{}", json))).await; }
                     if let Some(program) = program { process_regen(&mut socket, &runtime, &generator, &program, &state, &mut selection_state).await; }
                }
            }
        }
    }
}

// Helpers

async fn broadcast_selection(socket: &mut WebSocket, selection_state: &cad_core::topo::SelectionState) {
    let update = serde_json::to_string(&selection_state.selected).unwrap_or("[]".into());
    let _ = socket.send(Message::Text(format!("SELECTION_UPDATE:{}", update))).await;
}

async fn broadcast_groups(socket: &mut WebSocket, selection_state: &cad_core::topo::SelectionState) {
    let groups = selection_state.list_groups();
    let groups_json = serde_json::to_string(&groups).unwrap_or("[]".into());
    let _ = socket.send(Message::Text(format!("SELECTION_GROUPS_UPDATE:{}", groups_json))).await;
}

async fn process_regen(
    socket: &mut WebSocket, 
    runtime: &cad_core::evaluator::Runtime, 
    generator: &cad_core::topo::IdGenerator, 
    program: &cad_core::evaluator::ast::Program, 
    state: &Arc<AppState>,
    selection_state: &mut cad_core::topo::SelectionState
) {
    match runtime.evaluate(program, generator) {
        Ok(result) => {
             // Validate References
             let mut registry = cad_core::topo::TopoRegistry::new();
             for (_, entity) in &result.topology_manifest {
                 registry.register(entity.clone());
             }

             let required_refs = {
                 let graph = state.graph.read().unwrap();
                 graph.collect_all_references()
             };
             
             let zombies = registry.validate_references(&required_refs);
             if !zombies.is_empty() {
                 let zombie_json = serde_json::to_string(&zombies).unwrap_or("[]".into());
                 let _ = socket.send(Message::Text(format!("ZOMBIE_UPDATE:{}", zombie_json))).await;
             } else {
                 let _ = socket.send(Message::Text(format!("ZOMBIE_UPDATE:[]"))).await;
             }

             // Update Global Registry
             {
                 let mut global_registry = state.registry.write().unwrap();
                 *global_registry = registry.clone();
             }

             // Validate Selection State
             let report = selection_state.validate(&registry);
             if !report.lost.is_empty() {
                 broadcast_selection(socket, selection_state).await;
             }

             // Send Render Update
             let json = serde_json::to_string(&result.tessellation).unwrap_or("{}".into());
             let _ = socket.send(Message::Text(format!("RENDER_UPDATE:{}", json))).await;
        }
        Err(e) => {
            let error_msg = format_error("REGEN_FAILED", &format!("Regeneration failed: {}", e), "error");
            let _ = socket.send(Message::Text(error_msg)).await;
        }
    }
}
