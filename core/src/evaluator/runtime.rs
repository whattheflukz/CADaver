use super::ast::{Program, Statement, Expression, Call, Value};
use crate::topo::{EntityId, IdGenerator};
use crate::geometry::Tessellation;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use std::collections::HashMap;
use truck_modeling::Solid;

// Use the new MIT-compatible kernel abstraction
use crate::kernel::{self, GeometryKernel, Polygon2D, Point2D, ExtrudeParams, Vector3D};

#[derive(Debug, Error, Clone, Serialize, Deserialize)]
pub enum KernelError {
    #[error("Runtime error: {0}")]
    RuntimeError(String),
    #[error("Evaluation error: {0}")]
    EvaluationError(String),
    #[error("Feature not implemented: {0}")]
    NotImplemented(String),
}

/// Source entity type for a profile segment - used to group curved surfaces
#[derive(Debug, Clone)]
pub enum ProfileSegmentSource {
    /// Planar face from line extrusion
    Line { entity_id: String },
    /// Cylindrical face from full circle extrusion
    Circle { entity_id: String, center: [f64; 2], radius: f64 },
    /// Partial cylindrical face from arc extrusion
    Arc { entity_id: String, center: [f64; 2], radius: f64 },
    /// Elliptical cylinder face
    Ellipse { entity_id: String, center: [f64; 2] },
    /// Unknown source (fallback - treat as separate faces)
    Unknown,
}

/// A segment of a profile loop with metadata about its source
#[derive(Debug, Clone)]
pub struct ProfileSegment {
    pub p1: [f64; 2],
    pub p2: [f64; 2],
    pub source: ProfileSegmentSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationResult {
    /// IDs of entities created or modified
    pub modified_entities: Vec<EntityId>,
    /// Log messages from the kernel
    pub logs: Vec<String>,
    /// Renderable geometry
    pub tessellation: Tessellation,
    /// Detailed manifest of all topology created, mapped by their stable TopoId
    pub topology_manifest: std::collections::HashMap<crate::topo::naming::TopoId, crate::topo::registry::KernelEntity>,
}

/// The Evaluator Runtime environment.
pub struct Runtime {
    // Placeholder for memory/state
}

impl Runtime {
    pub fn new() -> Self {
        Self {}
    }

    /// Evaluates a program and returns the result.
    pub fn evaluate(&self, program: &Program, initial_generator: &IdGenerator) -> Result<EvaluationResult, KernelError> {
        let mut modified = Vec::new();
        let mut logs = Vec::new();
        let mut tessellation = Tessellation::new();
        let mut topology_manifest = std::collections::HashMap::new();
        
        // We use a local generator that can be swapped out when context changes
        let mut current_generator = initial_generator.clone();
        let mut solid_map: HashMap<String, Solid> = HashMap::new();

        for stmt in &program.statements {
            match stmt {
                Statement::Assignment { name, expr } => {
                    logs.push(format!("Assigning to {}", name));
                    if let Expression::Call(call) = expr {
                        // Pass true for is_assignment to suppress immediate tessellation
                        let res = self.mock_syscall(call, &current_generator, &mut modified, &mut logs, &mut tessellation, &mut topology_manifest, &mut solid_map, true)?;
                        if let Some(solid) = res {
                            solid_map.insert(name.clone(), solid);
                        }
                    }
                }
                Statement::Expression(expr) => {
                    if let Expression::Call(call) = expr {
                        if call.function == "set_context" {
                            if let Some(first_arg) = call.args.first() {
                                // Extract string value for seed
                                let seed = match first_arg {
                                    Expression::Value(Value::String(s)) => s.clone(),
                                    Expression::Value(Value::Identifier(s)) => s.clone(), // Fallback
                                    _ => "Unknown".to_string(),
                                };
                                logs.push(format!("Context switched to: {}", seed));
                                current_generator = IdGenerator::new(&seed);
                            }
                        } else {
                            // Pass false for is_assignment to permit tessellation
                            self.mock_syscall(call, &current_generator, &mut modified, &mut logs, &mut tessellation, &mut topology_manifest, &mut solid_map, false)?;
                        }
                    }
                }
            }
        }

        Ok(EvaluationResult {
            modified_entities: modified,
            logs,
            tessellation,
            topology_manifest,
        })
    }

    fn mock_syscall(
        &self, 
        call: &Call, 
        generator: &IdGenerator,
        modified: &mut Vec<EntityId>, 
        logs: &mut Vec<String>,
        tessellation: &mut Tessellation,
        topology_manifest: &mut std::collections::HashMap<crate::topo::naming::TopoId, crate::topo::registry::KernelEntity>,
        solid_map: &mut HashMap<String, Solid>,
        is_assignment: bool,
    ) -> Result<Option<Solid>, KernelError> {
        // Common imports for syscalls
        use crate::geometry::Point3;
        use crate::topo::naming::{NamingContext, TopoRank};
        use crate::topo::registry::{KernelEntity, AnalyticGeometry};

        match call.function.as_str() {
            "cube" => {
                // Deterministic ID generation using the provided generator
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created cube with ID {}", id));
                
                let ctx = NamingContext::new(id);

                // Use the new MIT-compatible Truck kernel
                let kernel = kernel::default_kernel();
                
                // Create a 10x10x10 box
                // Create a 10x10x10 box
                match kernel.create_box(10.0, 10.0, 10.0) {
                    Ok(solid) => {
                        if !is_assignment {
                            // Tessellate if this is a top-level expression call
                            match kernel.tessellate(&solid) {
                                Ok(mesh) => {
                                    kernel.mesh_to_tessellation(
                                        &mesh,
                                        tessellation,
                                        topology_manifest,
                                        &ctx,
                                        "Cube"
                                    );
                                    logs.push("Created cube using Truck kernel".to_string());
                                }
                                Err(e) => {
                                    logs.push(format!("Warning: Failed to tessellate cube: {:?}", e));
                                }
                            }
                        }
                        return Ok(Some(solid));
                    }
                    Err(e) => {
                        logs.push(format!("Warning: Failed to create cube: {:?}", e));
                    }
                }

                Ok(None)
            }
            "sketch" => {
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created sketch with ID {}", id));
                
                // Parse sketch JSON if provided
                if let Some(first_arg) = call.args.first() {
                    if let Expression::Value(Value::String(json)) = first_arg {
                        if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(json) {
                            // Update External References
                            // This ensures that projected geometry matches the current state of referenced topology
                            {
                                let origin = sketch.plane.origin;
                                let x_axis = sketch.plane.x_axis;
                                let y_axis = sketch.plane.y_axis;
                                
                                // Helper to project 3D point to 2D sketch plane
                                let project_to_2d = |p: [f64; 3]| -> [f64; 2] {
                                    let v = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];
                                    let x = v[0]*x_axis[0] + v[1]*x_axis[1] + v[2]*x_axis[2];
                                    let y = v[0]*y_axis[0] + v[1]*y_axis[1] + v[2]*y_axis[2];
                                    [x, y]
                                };

                                // Collect updates first to avoid borrow issues
                                let mut updates: Vec<(crate::topo::EntityId, crate::sketch::types::SketchGeometry)> = Vec::new();
                                
                                for (entity_id, topo_id) in &sketch.external_references {
                                    if let Some(kernel_entity) = topology_manifest.get(topo_id) {
                                        let new_geo = match &kernel_entity.geometry {
                                            AnalyticGeometry::Line { start, end } => {
                                                Some(crate::sketch::types::SketchGeometry::Line {
                                                    start: project_to_2d(*start),
                                                    end: project_to_2d(*end),
                                                })
                                            },
                                            // TODO: Support projecting other types (Circle -> Ellipse/Line, etc)
                                            _ => None
                                        };
                                        
                                        if let Some(geo) = new_geo {
                                            updates.push((*entity_id, geo));
                                        }
                                    }
                                }
                                
                                // Apply updates
                                for (id, geo) in updates {
                                    if let Some(entity) = sketch.entities.iter_mut().find(|e| e.id == id) {
                                        entity.geometry = geo;
                                    }
                                }
                            }

                            // Run solver (in-place)
                            let converged = crate::sketch::solver::SketchSolver::solve(&mut sketch);
                            if !converged {
                                logs.push("Warning: Sketch solver did not converge".to_string());
                            }

                            // Helper to transform 2D sketch points to 3D world space
                            let plane = &sketch.plane;
                            let origin = plane.origin;
                            let x_axis = plane.x_axis;
                            let y_axis = plane.y_axis;
                            let to_world = |x: f64, y: f64| -> Point3 {
                                origin + x_axis * x + y_axis * y
                            };
                            let z_axis = x_axis.cross(&y_axis);
                            let to_world_vec = |x: f64, y: f64, z: f64| -> [f64; 3] {
                                let v = x_axis * x + y_axis * y + z_axis * z;
                                [v[0], v[1], v[2]]
                            };

                            // Generate Visuals (Lines)
                            for entity in &sketch.entities {
                                // For Phase 1: Just lines and circles (as lines/polygons)
                                match &entity.geometry {
                                    crate::sketch::types::SketchGeometry::Line { start, end } => {
                                        // Wrap SketchEntity ID into TopoId for selection
                                        // Treating the entity itself as the 'feature' scope for now, 
                                        // or just using its UUID as the unique identifier.
                                        let topo_id = crate::topo::naming::TopoId::new(
                                            entity.id, 
                                            0, 
                                            crate::topo::naming::TopoRank::Edge
                                        );

                                        // Register Line Analytic Geometry
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Line {
                                                start: { let p = to_world(start[0], start[1]); [p.x, p.y, p.z] },
                                                end: { let p = to_world(end[0], end[1]); [p.x, p.y, p.z] },
                                            }
                                        });

                                        tessellation.add_line(
                                            to_world(start[0], start[1]),
                                            to_world(end[0], end[1]),
                                            topo_id
                                        );

                                        // Add Vertices for endpoints
                                        let curr_gen = IdGenerator::new(&entity.id.to_string()); // Temp sub-generator
                                        let v_start_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        let v_end_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        
                                        tessellation.add_point(to_world(start[0], start[1]), v_start_id);
                                        tessellation.add_point(to_world(end[0], end[1]), v_end_id);
                                    },
                                    crate::sketch::types::SketchGeometry::Circle { center, radius } => {
                                        let topo_id = crate::topo::naming::TopoId::new(
                                            entity.id, 
                                            0, 
                                            crate::topo::naming::TopoRank::Edge
                                        );

                                        // Register Circle Analytic Geometry
                                        let normal = to_world_vec(0.0, 0.0, 1.0);
                                        let center_3d = { let p = to_world(center[0], center[1]); [p.x, p.y, p.z] };
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Circle {
                                                center: center_3d,
                                                normal,
                                                radius: *radius,
                                            }
                                        });

                                        // Discretize circle
                                        let segments = 64;
                                        let mut prev_point = to_world(center[0] + radius, center[1]);
                                        
                                        for i in 1..=segments {
                                            let angle = (i as f64 / segments as f64) * 2.0 * std::f64::consts::PI;
                                            let x = center[0] + radius * angle.cos();
                                            let y = center[1] + radius * angle.sin();
                                            let curr_point = to_world(x, y);

                                            tessellation.add_line(prev_point, curr_point, topo_id);
                                            prev_point = curr_point;
                                        }

                                        // Add Center Vertex
                                        let curr_gen = IdGenerator::new(&entity.id.to_string());
                                        let v_center_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        tessellation.add_point(to_world(center[0], center[1]), v_center_id);
                                    },
                                    crate::sketch::types::SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                                        let topo_id = crate::topo::naming::TopoId::new(
                                            entity.id, 
                                            0, 
                                            crate::topo::naming::TopoRank::Edge
                                        );

                                        let segments = 64;
                                        // Normalize angles? No, just assume valid for now.
                                        // Ensure positive sweep?
                                        let mut sweep = end_angle - start_angle;
                                        if sweep < 0.0 { sweep += 2.0 * std::f64::consts::PI; }
                                        
                                        let start_x = center[0] + radius * start_angle.cos();
                                        let start_y = center[1] + radius * start_angle.sin();
                                        let mut prev_point = to_world(start_x, start_y);

                                        // Register Arc Analytic Geometry
                                        let normal = to_world_vec(0.0, 0.0, 1.0);
                                        let center_3d = { let p = to_world(center[0], center[1]); [p.x, p.y, p.z] };
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Circle {
                                                center: center_3d,
                                                normal,
                                                radius: *radius,
                                            }
                                        });



                                        for i in 1..=segments {
                                            let t = i as f64 / segments as f64;
                                            let angle = start_angle + sweep * t;
                                            
                                            let x = center[0] + radius * angle.cos();
                                            let y = center[1] + radius * angle.sin();
                                            let curr_point = to_world(x, y);

                                            tessellation.add_line(prev_point, curr_point, topo_id);
                                            prev_point = curr_point;
                                        }

                                        // Add Vertices for endpoints and center
                                        let curr_gen = IdGenerator::new(&entity.id.to_string());
                                        let v_center_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        let v_start_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        let v_end_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);

                                        tessellation.add_point(to_world(center[0], center[1]), v_center_id);
                                        tessellation.add_point(to_world(start_x, start_y), v_start_id);
                                        let end_x = center[0] + radius * end_angle.cos();
                                        let end_y = center[1] + radius * end_angle.sin();
                                        tessellation.add_point(to_world(end_x, end_y), v_end_id);
                                    },
                                    crate::sketch::types::SketchGeometry::Point { pos } => {
                                        // Point entity - add the point and cross lines for visibility
                                        let topo_id = crate::topo::naming::TopoId::new(
                                            entity.id,
                                            0,
                                            crate::topo::naming::TopoRank::Vertex
                                        );
                                        
                                        // Add the center point
                                        let point_3d = to_world(pos[0], pos[1]);
                                        tessellation.add_point(point_3d, topo_id);

                                        // Register Point Analytic Geometry
                                        let center_3d = { let p = to_world(pos[0], pos[1]); [p.x, p.y, p.z] };
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Sphere {
                                                center: center_3d,
                                                radius: 0.0,
                                            }
                                        });
                                        
                                        // Add cross lines for visibility (same as frontend)
                                        let size = 0.3;
                                        let cross_id = crate::topo::naming::TopoId::new(
                                            entity.id,
                                            1,
                                            crate::topo::naming::TopoRank::Edge
                                        );
                                        tessellation.add_line(
                                            to_world(pos[0] - size, pos[1]),
                                            to_world(pos[0] + size, pos[1]),
                                            cross_id
                                        );
                                        tessellation.add_line(
                                            to_world(pos[0], pos[1] - size),
                                            to_world(pos[0], pos[1] + size),
                                            cross_id
                                        );
                                    },
                                    crate::sketch::types::SketchGeometry::Ellipse { center, semi_major, semi_minor, rotation } => {
                                        let topo_id = crate::topo::naming::TopoId::new(
                                            entity.id,
                                            0,
                                            crate::topo::naming::TopoRank::Edge
                                        );
                                        
                                        // Register Ellipse Analytic Geometry (Fallback to Mesh)
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Mesh
                                        });

                                        // Register Ellipse Analytic Geometry (approximated as Mesh for now strictly, or add Ellipse variant later)
                                        // For now, let's treat it as Mesh since AnalyticGeometry doesn't have Ellipse yet
                                        topology_manifest.insert(topo_id, crate::topo::registry::KernelEntity {
                                            id: topo_id,
                                            geometry: crate::topo::registry::AnalyticGeometry::Mesh // Fallback
                                        });

                                        // Discretize ellipse with rotation
                                        let segments = 64;
                                        let cos_r = rotation.cos();
                                        let sin_r = rotation.sin();
                                        
                                        let ellipse_point = |t: f64| -> [f64; 2] {
                                            let x_local = semi_major * t.cos();
                                            let y_local = semi_minor * t.sin();
                                            [
                                                center[0] + x_local * cos_r - y_local * sin_r,
                                                center[1] + x_local * sin_r + y_local * cos_r
                                            ]
                                        };
                                        
                                        let first = ellipse_point(0.0);
                                        let mut prev_point = to_world(first[0], first[1]);
                                        
                                        for i in 1..=segments {
                                            let t = (i as f64 / segments as f64) * 2.0 * std::f64::consts::PI;
                                            let pt = ellipse_point(t);
                                            let curr_point = to_world(pt[0], pt[1]);

                                            tessellation.add_line(prev_point, curr_point, topo_id);
                                            prev_point = curr_point;
                                        }

                                        // Add Center Vertex
                                        let curr_gen = IdGenerator::new(&entity.id.to_string());
                                        let v_center_id = crate::topo::naming::TopoId::new(curr_gen.next_id(), 0, crate::topo::naming::TopoRank::Vertex);
                                        tessellation.add_point(to_world(center[0], center[1]), v_center_id);
                                    },
                                }
                            }
                        } else {
                            logs.push("Failed to deserialize sketch data".to_string());
                        }
                    }
                }

                Ok(None)
            }
            "extrude" => {
                let id = generator.next_id();
                modified.push(id);
                
                let ctx = NamingContext::new(id);
                
                // Parse arguments: sketch_json, distance, operation, start_offset, profiles (optional)
                let mut sketch_json: Option<String> = None;
                let mut distance = 10.0;
                let mut _operation = "Add";
                let mut start_offset = 0.0;
                // List of sketches entity UUIDs to extrude (as strings)
                let mut profile_selection: Option<Vec<String>> = None;
                // Region boundary points for region-based extrusion (JSON: [[[x,y], ...], ...])
                // Each item is a Profile (list of loops: outer, inner...)
                let mut profile_regions: Option<Vec<Vec<Vec<[f64; 2]>>>> = None;
                
                for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Value(Value::String(s))) => sketch_json = Some(s.clone()),
                        (1, Expression::Value(Value::Number(d))) => distance = *d,
                        (2, Expression::Value(Value::String(op))) => _operation = op.as_str(),
                        (3, Expression::Value(Value::Number(o))) => start_offset = *o,
                        (4, Expression::Value(Value::Array(arr))) => {
                             let list: Vec<String> = arr.iter().filter_map(|v| {
                                 if let Value::String(s) = v { Some(s.clone()) } else { None }
                             }).collect();
                             // Allow empty list to mean "Select None"
                             profile_selection = Some(list);
                        },
                        (4, Expression::Value(Value::String(s))) => {
                             // Single ID case? Or serialized JSON array?
                             // Let's support if it's a JSON array string
                             if let Ok(list) = serde_json::from_str::<Vec<String>>(s) {
                                 if !list.is_empty() {
                                    profile_selection = Some(list);
                                 }
                             }
                        },
                        // Profile regions: boundary points for region-based extrusion
                        (5, Expression::Value(Value::String(s))) => {
                            // JSON array of profiles
                            if let Ok(regions) = serde_json::from_str::<Vec<Vec<Vec<[f64; 2]>>>>(s) {
                                if !regions.is_empty() {
                                    profile_regions = Some(regions);
                                }
                            }
                        },
                        _ => {}
                    }
                }
                
                logs.push(format!("Extruding distance={}, offset={}, op={}, profiles={:?}, regions={}", 
                    distance, start_offset, _operation, profile_selection, 
                    profile_regions.as_ref().map(|r| r.len()).unwrap_or(0)));
                
                // Parse sketch and generate 3D geometry
                if let Some(json) = sketch_json {
                    if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(&json) {
                        // Solve constraints first
                        crate::sketch::solver::SketchSolver::solve(&mut sketch);
                        
                        let plane = sketch.plane;
                        let origin = plane.origin;
                        let x_axis = plane.x_axis;
                        let y_axis = plane.y_axis;
                        let normal_vec = plane.normal;
                        let normal: [f64; 3] = [normal_vec[0], normal_vec[1], normal_vec[2]];
                        
                        // Determine which loops to extrude
                        // Priority: profile_regions (exact boundary points) > find_closed_loops
                        // Type: Vec<Vec<Vec<[f64; 2]>>> where inner is [Outer, Hole1, Hole2...]
                        
                        // Segment metadata for side face grouping (populated in else branch)
                        // Structure: loop_segments[profile_idx][loop_idx] = Vec<ProfileSegment>
                        let mut loop_segments: Vec<Vec<Vec<ProfileSegment>>> = Vec::new();
                        
                        let loops_2d: Vec<Vec<Vec<[f64; 2]>>> = if let Some(regions) = profile_regions {
                            // Use provided region boundary points directly
                            // No entity info available - segments will be empty, falling back to segment-per-face
                            logs.push(format!("DEBUG: Using profile_regions branch. Regions count: {}", regions.len()));
                            if !loop_segments.is_empty() {
                                logs.push(format!("DEBUG: loop_segments NOT empty somehow? len: {}", loop_segments.len()));
                            } else {
                                logs.push("DEBUG: loop_segments is empty (expected for regions branch)".to_string());
                            }
                            regions
                        } else {
                            logs.push("DEBUG: Using sketch entity extraction branch".to_string());
                            if let Some(sel) = &profile_selection {
                                logs.push(format!("DEBUG: profile_selection has {} items", sel.len()));
                            } else {
                                logs.push("DEBUG: profile_selection is None".to_string());
                            }
                            
                            // Fallback: filter entities and use find_closed_loops
                            let filtered_entities: Vec<crate::sketch::types::SketchEntity> = match profile_selection {
                                Some(selection) if !selection.is_empty() => {
                                    let set: std::collections::HashSet<String> = selection.into_iter().collect();
                                    sketch.entities.iter().filter(|e| set.contains(&e.id.to_string())).cloned().collect()
                                },
                                _ => sketch.entities.clone(), // None or empty list = extrude all
                            };
                            
                            
                            // Use robust region detection instead of simple chain finding
                            let regions = crate::sketch::regions::find_regions(&filtered_entities);
                            logs.push(format!("Found {} regions for extrusion", regions.len()));
                            
                            // Convert regions to the expected 2D point array format: Vec<Vec<Vec<[f64; 2]>>>
                            // Each item is a Profile (Outer Loop + Inner Voids)
                            let points_result: Vec<Vec<Vec<[f64; 2]>>> = regions.into_iter().map(|region| {
                                let mut profile_loops = Vec::new();
                                
                                // Outer boundary
                                profile_loops.push(region.boundary_points);
                                
                                // Inner voids
                                for void in region.voids {
                                    profile_loops.push(void);
                                }
                                
                                profile_loops
                            }).collect();
                            
                            // Clear segments metadata as we will reconstruct it geometrically
                            // (Since regions don't currently track per-edge metadata easily)
                            loop_segments.clear();

                            
                            points_result
                        };
                        
                        logs.push(format!("Processing {} profiles for extrusion", loops_2d.len()));

                        // If loop_segments is empty (because we used profile_regions), try to reconstruct metadata
                        // by geometrically matching segments back to sketch entities.
                        if loop_segments.is_empty() { 
                            {
                                logs.push("Attempting to reconstruct segment metadata from sketch geometry...".to_string());
                                let entities = &sketch.entities;
                                let EPSILON = 1e-4;

                                for profile_loops in &loops_2d {
                                    let mut profile_segs = Vec::new();
                                    for loop_pts in profile_loops {
                                        let mut segments = Vec::new();
                                        let len = loop_pts.len();
                                        if len > 0 {
                                            for i in 0..len {
                                                let p1 = loop_pts[i];
                                                // Handle closed loop wrapping
                                                let p2 = loop_pts[(i + 1) % len];
                                                
                                                let mut source = ProfileSegmentSource::Unknown;
                                                
                                                // Try to match against sketch entities
                                                for entity in entities {
                                                    match &entity.geometry {
                                                        crate::sketch::types::SketchGeometry::Circle { center, radius } => {
                                                            let d1 = ((p1[0]-center[0]).powi(2) + (p1[1]-center[1]).powi(2)).sqrt();
                                                            let d2 = ((p2[0]-center[0]).powi(2) + (p2[1]-center[1]).powi(2)).sqrt();
                                                            if (d1 - radius).abs() < EPSILON && (d2 - radius).abs() < EPSILON {
                                                                source = ProfileSegmentSource::Circle {
                                                                    entity_id: entity.id.to_string(),
                                                                    center: *center,
                                                                    radius: *radius,
                                                                };
                                                                break;
                                                            }
                                                        },
                                                        crate::sketch::types::SketchGeometry::Arc { center, radius, .. } => {
                                                            let d1 = ((p1[0]-center[0]).powi(2) + (p1[1]-center[1]).powi(2)).sqrt();
                                                            let d2 = ((p2[0]-center[0]).powi(2) + (p2[1]-center[1]).powi(2)).sqrt();
                                                            if (d1 - radius).abs() < EPSILON && (d2 - radius).abs() < EPSILON {
                                                                // Ideally check angles too, but distance is sufficient for now
                                                                // to distinguish from other geometry
                                                                source = ProfileSegmentSource::Arc {
                                                                    entity_id: entity.id.to_string(),
                                                                    center: *center,
                                                                    radius: *radius,
                                                                };
                                                                break;
                                                            }
                                                        },
                                                        crate::sketch::types::SketchGeometry::Line { start, end } => {
                                                            // Check if points are on the line segment
                                                            // Distance from point to line check
                                                            // For now, if it's not a curve, we don't strictly need to group it 
                                                            // unless we want single-face selection for collinear segments?
                                                            // Current behavior for lines is fine (Plane).
                                                        },
                                                        _ => {}
                                                    }
                                                }
                                                
                                                segments.push(ProfileSegment { p1, p2, source });
                                            }
                                        }
                                        profile_segs.push(segments);
                                    }
                                    loop_segments.push(profile_segs);
                                }
                                logs.push("Reconstructed segment metadata.".to_string());
                            }
                        }

                        // Use the new MIT-compatible Truck kernel for extrusion
                        let kernel = kernel::default_kernel();
                        let mut combined_solid: Option<Solid> = None;
                        
                        for (i, region_loops) in loops_2d.iter().enumerate() {
                            if region_loops.is_empty() { continue; }
                            
                            // 1. Create Polygon2D with exterior and holes
                            let exterior_points: Vec<Point2D> = region_loops[0].iter()
                                .map(|p| Point2D::new(p[0], p[1]))
                                .collect();
                            
                            let interior_loops: Vec<Vec<Point2D>> = region_loops.iter().skip(1)
                                .map(|hole_loop| hole_loop.iter().map(|p| Point2D::new(p[0], p[1])).collect())
                                .collect();
                            
                            // Debug: Log loop counts
                            logs.push(format!("Region {}: {} exterior pts, {} interior loops", 
                                i, exterior_points.len(), interior_loops.len()));
                            for (j, hole) in interior_loops.iter().enumerate() {
                                logs.push(format!("  Hole {}: {} pts", j, hole.len()));
                            }
                            
                            let polygon = if interior_loops.is_empty() {
                                Polygon2D::new(exterior_points)
                            } else {
                                Polygon2D::with_holes(exterior_points, interior_loops)
                            };
                            
                            // 2. Create extrusion parameters
                            let extrude_params = ExtrudeParams::linear(distance)
                                .with_direction(Vector3D::new(0.0, 0.0, 1.0)); // Truck extrudes in Z
                            
                            // 3. Extrude the polygon
                            match kernel.extrude_polygon(&polygon, &extrude_params) {
                                Ok(solid) => {
                                    // Tessellate each region independently (no boolean union)
                                    match kernel.tessellate(&solid) {
                                        Ok(mut mesh) => {
                                            // 5. Transform from local Z-up space to sketch plane space
                                            for p in &mut mesh.positions {
                                                let u = p.x;
                                                let v = p.y;
                                                let w = p.z;
                                                
                                                p.x = origin[0] + u * x_axis[0] + v * y_axis[0] + w * normal[0];
                                                p.y = origin[1] + u * x_axis[1] + v * y_axis[1] + w * normal[1];
                                                p.z = origin[2] + u * x_axis[2] + v * y_axis[2] + w * normal[2];
                                            }
                                            
                                            // 6. Add to tessellation using kernel's mesh_to_tessellation
                                            kernel.mesh_to_tessellation(
                                                &mesh,
                                                tessellation,
                                                topology_manifest,
                                                &ctx,
                                                &format!("Extrude_{}", i)
                                            );
                                            
                                            // Store the last successful solid for potential variable assignment
                                            combined_solid = Some(solid);
                                        }
                                        Err(e) => {
                                            logs.push(format!("Warning: Tessellation failed for region {}: {:?}", i, e));
                                        }
                                    }
                                }
                                Err(e) => {
                                    logs.push(format!("Warning: Extrusion failed for region {}: {:?}", i, e));
                                }
                            }
                        }

                        if loops_2d.is_empty() {
                            logs.push("Warning: No closed loops found for extrusion".to_string());
                        }

                        return Ok(combined_solid);

                    } else {
                        logs.push("Warning: Failed to parse sketch for extrusion".to_string());
                    }
                } else {
                    // No sketch provided - create a default box for testing
                     let kernel = kernel::default_kernel();
                     if let Ok(solid) = kernel.create_box(20.0, 20.0, distance) {
                         if !is_assignment {
                             if let Ok(mesh) = kernel.tessellate(&solid) {
                                 kernel.mesh_to_tessellation(
                                     &mesh,
                                     tessellation,
                                     topology_manifest,
                                     &ctx,
                                     "DefaultExtrude"
                                 );
                             }
                         }
                         return Ok(Some(solid));
                     }
                    logs.push("Created default extrusion (no sketch provided)".to_string());
                }
                
                Ok(None)
            }
            "revolve" => {
                let id = generator.next_id();
                modified.push(id);
                
                let ctx = NamingContext::new(id);
                
                // Parse arguments: sketch_json, angle (degrees), axis
                let mut sketch_json: Option<String> = None;
                let mut angle_degrees: f64 = 360.0;
                let mut axis = "X";
                
                for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Value(Value::String(s))) => sketch_json = Some(s.clone()),
                        (1, Expression::Value(Value::Number(a))) => angle_degrees = *a,
                        (2, Expression::Value(Value::String(ax))) => axis = ax.as_str(),
                        _ => {}
                    }
                }
                
                // Use new MIT-compatible Truck kernel for revolution
                let kernel = kernel::default_kernel();
                
                if let Some(json) = sketch_json {
                    if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(&json) {
                         crate::sketch::solver::SketchSolver::solve(&mut sketch);
                         
                         // Collect profile points from line segments
                         let mut profile_points: Vec<Point2D> = Vec::new();
                         // (Existing logic extracts points, but we need Point2D now)
                         
                         for entity in &sketch.entities {
                             if entity.is_construction { continue; }
                             match &entity.geometry {
                                 crate::sketch::types::SketchGeometry::Line { start, end } => {
                                      // Simple chaining logic 
                                      if profile_points.is_empty() {
                                          profile_points.push(Point2D::new(start[0], start[1]));
                                          profile_points.push(Point2D::new(end[0], end[1]));
                                      } else {
                                          let last = profile_points.last().unwrap();
                                          if (last.x - start[0]).abs() < 1e-6 && (last.y - start[1]).abs() < 1e-6 {
                                              profile_points.push(Point2D::new(end[0], end[1]));
                                          } else {
                                              // Disconnected? Start new chain?
                                              // Truck requires a single closed wire for now.
                                              // For now, let's just append and hope it's connected or single chain.
                                              profile_points.push(Point2D::new(start[0], start[1]));
                                              profile_points.push(Point2D::new(end[0], end[1]));
                                          }
                                      }
                                 },
                                 _ => {}
                             }
                         }

                         let axis_enum = match axis {
                             "X" => kernel::RevolveAxis::X,
                             "Y" => kernel::RevolveAxis::Y,
                             "Z" => kernel::RevolveAxis::Z,
                             _ => kernel::RevolveAxis::X,
                         };
                         
                         let params = kernel::RevolveParams {
                             angle: angle_degrees.to_radians(),
                             axis: axis_enum,
                         };
                         
                         match kernel.revolve_profile(&profile_points, &params) {
                             Ok(solid) => {
                                 if !is_assignment {
                                     match kernel.tessellate(&solid) {
                                         Ok(mesh) => {
                                             kernel.mesh_to_tessellation(
                                                 &mesh,
                                                 tessellation,
                                                 topology_manifest,
                                                 &ctx,
                                                 "Revolve"
                                             );
                                             logs.push("Created revolution using Truck kernel".to_string());
                                         }
                                         Err(e) => logs.push(format!("Tessellation failed: {:?}", e)),
                                     }
                                 }
                                 return Ok(Some(solid));
                             }
                             Err(e) => logs.push(format!("Revolution failed: {:?}", e)),
                         }
                    } else {
                        logs.push("Failed to parse sketch".to_string());
                    }
                }
                
                Ok(None)
            }
            "union" | "intersect" | "subtract" => {
                let id = generator.next_id();
                modified.push(id);
                
                let mut var_a = String::new();
                let mut var_b = String::new();
                
                println!("[BOOLEAN] Processing {} operation with {} args", call.function, call.args.len());
                
                // Parse args: union(a, b)
                for (i, arg) in call.args.iter().enumerate() {
                    println!("[BOOLEAN] Arg {}: {:?}", i, arg);
                    match (i, arg) {
                        (0, Expression::Variable(s)) => var_a = s.clone(),
                        (0, Expression::Value(Value::String(s))) => var_a = s.clone(),
                        (1, Expression::Variable(s)) => var_b = s.clone(),
                        (1, Expression::Value(Value::String(s))) => var_b = s.clone(),
                        _ => {}
                    }
                }
                
                println!("[BOOLEAN] Looking up var_a='{}', var_b='{}'", var_a, var_b);
                println!("[BOOLEAN] solid_map keys: {:?}", solid_map.keys().collect::<Vec<_>>());
                
                let solid_a = solid_map.get(&var_a);
                let solid_b = solid_map.get(&var_b);
                
                println!("[BOOLEAN] solid_a found: {}, solid_b found: {}", solid_a.is_some(), solid_b.is_some());
                
                if let (Some(a), Some(b)) = (solid_a, solid_b) {
                    let kernel = kernel::default_kernel();
                    println!("[BOOLEAN] Calling kernel.boolean_{}", call.function);
                    let op_res = match call.function.as_str() {
                        "union" => kernel.boolean_union(a, b),
                        "intersect" => kernel.boolean_intersect(a, b),
                        "subtract" => kernel.boolean_subtract(a, b),
                        _ => unreachable!(),
                    };
                    
                    match op_res {
                        Ok(new_solid) => {
                            println!("[BOOLEAN] Operation succeeded, tessellating result");
                            // Always tessellate boolean results (they're the final geometry)
                            let ctx = NamingContext::new(id);
                            match kernel.tessellate(&new_solid) {
                                Ok(mesh) => {
                                     println!("[BOOLEAN] Tessellation succeeded, {} vertices", mesh.positions.len());
                                     kernel.mesh_to_tessellation(
                                         &mesh,
                                         tessellation,
                                         topology_manifest,
                                         &ctx,
                                         &format!("Boolean{}", call.function)
                                     );
                                     logs.push(format!("Performed {} on {} and {}", call.function, var_a, var_b));
                                }
                                Err(e) => {
                                    println!("[BOOLEAN] Tessellation failed: {:?}", e);
                                    logs.push(format!("Tessellation failed: {:?}", e));
                                }
                            }
                            return Ok(Some(new_solid));
                        }
                        Err(e) => {
                            println!("[BOOLEAN] Operation failed: {:?}", e);
                            logs.push(format!("Boolean operation failed: {:?}", e));
                        }
                    }
                } else {
                    println!("[BOOLEAN] ERROR: Could not find variables '{}' or '{}' in solid_map", var_a, var_b);
                    logs.push(format!("Warning: Could not find variables {} or {} for boolean op", var_a, var_b));
                }
                
                Ok(None)
            }
            "export" => {
                // export(solid_var, "format") - currently only step supported
                let mut var_name = String::new();
                 for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Variable(s)) => var_name = s.clone(),
                        (0, Expression::Value(Value::String(s))) => var_name = s.clone(),
                        _ => {}
                    }
                }
                
                if let Some(solid) = solid_map.get(&var_name) {
                    let kernel = kernel::default_kernel();
                    match kernel.export_step(solid) {
                         Ok(step_str) => {
                             logs.push(format!("STEP Export:\n{}", step_str));
                             // In a real app, this would write to file or return to frontend.
                             // Here we just log it for verification.
                         }
                         Err(e) => logs.push(format!("Export failed: {:?}", e)),
                    }
                } else {
                    logs.push(format!("Warning: Could not find variable {} for export", var_name));
                }
                Ok(None)
            }
            "fillet" => {
                let id = generator.next_id();
                modified.push(id);
                
                let mut input_solid_var = String::new();
                let mut radius = 0.0;
                let mut edges: Vec<String> = Vec::new();
                
                for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Variable(s)) => input_solid_var = s.clone(),
                        (0, Expression::Value(Value::String(s))) => input_solid_var = s.clone(), // Fallback
                        (1, Expression::Value(Value::Number(r))) => radius = *r,
                        (2, Expression::Value(Value::Array(arr))) => {
                             edges = arr.iter().filter_map(|v| {
                                 if let Value::String(s) = v { Some(s.clone()) } else { None }
                             }).collect();
                        },
                         _ => {}
                    }
                }
                
                logs.push(format!("INFO: Fillet operation skipped - Truck CAD kernel v0.6 does not support fillet/edge rounding operations. \
                    Parameters saved: Input={}, Radius={:.2}mm, Edges={:?}. Feature will apply when kernel support is added.", 
                    input_solid_var, radius, edges));
                
                Ok(None)
            }
            "chamfer" => {
                let id = generator.next_id();
                modified.push(id);
                
                let mut input_solid_var = String::new();
                let mut distance = 0.0;
                let mut edges: Vec<String> = Vec::new();
                
                for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Variable(s)) => input_solid_var = s.clone(),
                        (0, Expression::Value(Value::String(s))) => input_solid_var = s.clone(), // Fallback
                        (1, Expression::Value(Value::Number(d))) => distance = *d,
                        (2, Expression::Value(Value::Array(arr))) => {
                                edges = arr.iter().filter_map(|v| {
                                    if let Value::String(s) = v { Some(s.clone()) } else { None }
                                }).collect();
                        },
                            _ => {}
                    }
                }
                
                logs.push(format!("INFO: Chamfer operation skipped - Truck CAD kernel v0.6 does not support chamfer operations. \
                    Parameters saved: Input={}, Distance={:.2}mm, Edges={:?}. Feature will apply when kernel support is added.", 
                    input_solid_var, distance, edges));
                
                Ok(None)
            }
            "sphere" => {
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created sphere with ID {}", id));
                Ok(None)
            }
            "error" => {
                Err(KernelError::RuntimeError("Forced error".into()))
            }
            unknown => {
                Err(KernelError::NotImplemented(format!("Function '{}' unknown", unknown)))
            }
        }
    }
}


// NOTE: The add_mesh_to_tessellation function has been removed.
// Mesh-to-tessellation conversion is now handled by TruckKernel::mesh_to_tessellation()
// in the kernel abstraction layer (core/src/kernel/truck.rs).









mod tests {
    use super::*;
    use crate::topo::IdGenerator;
    
    

    #[test]
    fn test_evaluate_cube() {
        use crate::evaluator::ast::*;
        let runtime = Runtime::new();
        let generator = IdGenerator::new("Test");
        let prog = Program {
            statements: vec![
                Statement::Assignment {
                    name: "c".into(),
                    expr: Expression::Call(Call {
                        function: "cube".into(),
                        args: vec![Expression::Value(Value::Number(10.0))],
                    })
                }
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Should succeed");
        assert_eq!(res.modified_entities.len(), 1);
    }

    #[test]
    fn test_evaluate_error() {
        use crate::evaluator::ast::*;
        let runtime = Runtime::new();
        let generator = IdGenerator::new("Test");
        let prog = Program {
            statements: vec![
                Statement::Expression(Expression::Call(Call {
                    function: "error".into(),
                    args: vec![],
                }))
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator);
        assert!(res.is_err());
    }
    
    #[test]
    fn test_unknown_function() {
        use crate::evaluator::ast::*;
        let runtime = Runtime::new();
        let generator = IdGenerator::new("Test");
        let prog = Program {
            statements: vec![
                Statement::Expression(Expression::Call(Call {
                    function: "hypercube".into(),
                    args: vec![],
                }))
            ]
        };
        
        match runtime.evaluate(&prog, &generator) {
            Err(KernelError::NotImplemented(s)) => assert!(s.contains("hypercube")),
            _ => panic!("Expected NotImplemented error"),
        }
    }

    #[test]
    fn test_sketch_json_integration() {
        use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry};
        use crate::evaluator::ast::*;
        
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestSketch");
        
        // Create a sketch with one line
        let mut sketch = Sketch::new(SketchPlane::default());
        sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        let json = serde_json::to_string(&sketch).unwrap();

        let prog = Program {
            statements: vec![
                Statement::Assignment {
                    name: "s".into(),
                    expr: Expression::Call(Call {
                        function: "sketch".into(),
                        args: vec![Expression::Value(Value::String(json))],
                    })
                }
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Eval failed");
        
        // Should have 1 line (2 indices) in tessellation
        assert!(res.tessellation.line_indices.len() >= 2);
        // 1 line = 2 line vertices + 2 point vertices (start/end) = 4 vertices * 3 coords = 12
        assert_eq!(res.tessellation.vertices.len(), 12);
    }

    #[test]
    fn test_extrude_with_sketch() {
        use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry};
        use crate::evaluator::ast::*;
        
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestExtrude");
        
        // Create a triangular sketch profile
        let mut sketch = Sketch::new(SketchPlane::default());
        sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        sketch.add_entity(SketchGeometry::Line { start: [10.0, 0.0], end: [5.0, 10.0] });
        sketch.add_entity(SketchGeometry::Line { start: [5.0, 10.0], end: [0.0, 0.0] });
        let json = serde_json::to_string(&sketch).unwrap();

        let prog = Program {
            statements: vec![
                // Use Expression instead of Assignment to trigger tessellation
                Statement::Expression(Expression::Call(Call {
                    function: "extrude".into(),
                    args: vec![
                        Expression::Value(Value::String(json)),
                        Expression::Value(Value::Number(15.0)), // distance
                        Expression::Value(Value::String("Add".into())), // operation
                    ],
                }))
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Extrude eval failed");
        
        // Should have triangles for top, bottom, and side faces
        assert!(res.tessellation.indices.len() >= 6, "Should have triangle indices for 3D geometry");
    }

    #[test]
    fn test_revolve_with_sketch() {
        use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry};
        use crate::evaluator::ast::*;
        
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestRevolve");
        
        // Create a closed triangle profile (Solid revolution requires a Face)
        let mut sketch = Sketch::new(SketchPlane::default());
        sketch.add_entity(SketchGeometry::Line { start: [5.0, 0.0], end: [10.0, 5.0] });
        sketch.add_entity(SketchGeometry::Line { start: [10.0, 5.0], end: [5.0, 5.0] });
        sketch.add_entity(SketchGeometry::Line { start: [5.0, 5.0], end: [5.0, 0.0] });
        let json = serde_json::to_string(&sketch).unwrap();

        let prog = Program {
            statements: vec![
                Statement::Expression(Expression::Call(Call {
                    function: "revolve".into(),
                    args: vec![
                        Expression::Value(Value::String(json)),
                        Expression::Value(Value::Number(360.0)), // full revolution
                        Expression::Value(Value::String("X".into())), // around X axis
                    ],
                }))
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Revolve eval failed");
        
        // Check logs for success message
        assert!(res.logs.iter().any(|l| l.contains("Generated revolution") || l.contains("Created revolution")), 
                "Logs should indicate successful revolution: {:?}", res.logs);
        // Tessellation check
        assert!(res.tessellation.indices.len() >= 6, "Should have triangle indices for 3D geometry");
    }

    #[test]
    #[ignore] // TODO: Truck boolean operations are panic-prone("This wire is not simple"). Re-enable when Truck is more stable.
    fn test_boolean_operations() {
        use crate::evaluator::ast::*;
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestBoolean");
        
        let prog = Program {
            statements: vec![
                Statement::Assignment {
                    name: "big".into(),
                    expr: Expression::Call(Call { function: "cube".into(), args: vec![Expression::Value(Value::Number(10.0))] }),
                },
                Statement::Assignment {
                    name: "small".into(),
                    expr: Expression::Call(Call { function: "cube".into(), args: vec![Expression::Value(Value::Number(5.0))] }),
                },
                // cut = subtract(big, small) -> Should work cleanly
                Statement::Expression(Expression::Call(Call { 
                    function: "subtract".into(), 
                    args: vec![Expression::Variable("big".into()), Expression::Variable("small".into())] 
                })),
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Boolean eval failed");
        
        // Check logs
        assert!(res.logs.iter().any(|l| l.contains("Performed subtract on big and small")), "Logs check failed: {:?}", res.logs);
    }

    #[test]
    fn test_export_step() {
        use crate::evaluator::ast::*;
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestExport");
        
        let prog = Program {
            statements: vec![
                Statement::Assignment {
                    name: "c".into(),
                    expr: Expression::Call(Call { function: "cube".into(), args: vec![Expression::Value(Value::Number(10.0))] }),
                },
                Statement::Expression(Expression::Call(Call {
                    function: "export".into(),
                    args: vec![Expression::Variable("c".into()), Expression::Value(Value::String("step".into()))],
                }))
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Export eval failed");
        assert!(res.logs.iter().any(|l| l.contains("STEP Export")), "Logs should contain export output");
        assert!(res.logs.iter().any(|l| l.contains("ISO-10303-21")), "Logs should contain STEP header");
    }
}
