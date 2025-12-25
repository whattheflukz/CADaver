use super::ast::{Program, Statement, Expression, Call, Value};
use crate::topo::{EntityId, IdGenerator};
use crate::geometry::Tessellation;
use serde::{Deserialize, Serialize};
use thiserror::Error;

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

/// The MicroCAD Runtime environment.
/// In a real scenario, this would wrap the WASM or native binding.
/// For now, it mocks the execution of the AST.
pub struct Runtime {
    // Placeholder for memory/state
}

impl Runtime {
    pub fn new() -> Self {
        Self {}
    }

    /// Evaluates a MicroCAD program and returns the result.
    pub fn evaluate(&self, program: &Program, initial_generator: &IdGenerator) -> Result<EvaluationResult, KernelError> {
        let mut modified = Vec::new();
        let mut logs = Vec::new();
        let mut tessellation = Tessellation::new();
        let mut topology_manifest = std::collections::HashMap::new();
        
        // We use a local generator that can be swapped out when context changes
        let mut current_generator = initial_generator.clone();

        for stmt in &program.statements {
            match stmt {
                Statement::Assignment { name, expr } => {
                    logs.push(format!("Assigning to {}", name));
                    if let Expression::Call(call) = expr {
                        self.mock_syscall(call, &current_generator, &mut modified, &mut logs, &mut tessellation, &mut topology_manifest)?;
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
                            self.mock_syscall(call, &current_generator, &mut modified, &mut logs, &mut tessellation, &mut topology_manifest)?;
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
    ) -> Result<(), KernelError> {
        // Common imports for syscalls
        use crate::geometry::{Point3, Vector3};
        use crate::topo::naming::{NamingContext, TopoRank};
        use crate::topo::registry::{KernelEntity, AnalyticGeometry};

        match call.function.as_str() {
            "cube" => {
                // Deterministic ID generation using the provided generator
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created cube with ID {}", id));
                
                let ctx = NamingContext::new(id);
                // "FaceTop" is just an example seed.
                // In a real kernel, we'd iterate faces.
                let face_id = ctx.derive("FaceTop", TopoRank::Face);

                // Register the analytic geometry
                let face_entity = KernelEntity {
                   id: face_id,
                   geometry: AnalyticGeometry::Plane {
                       origin: [0.0, 5.0, 0.0],
                       normal: [0.0, 1.0, 0.0],
                   }
                };
                topology_manifest.insert(face_id, face_entity);

                tessellation.add_triangle(
                    Point3::new(0.0, 0.0, 0.0),
                    Point3::new(10.0, 0.0, 0.0),
                    Point3::new(0.0, 10.0, 0.0),
                    face_id
                );

                // Add vertices (Corners)
                let v1_id = ctx.derive("V1", TopoRank::Vertex);
                tessellation.add_point(Point3::new(0.0, 0.0, 0.0), v1_id);
                
                let v2_id = ctx.derive("V2", TopoRank::Vertex);
                tessellation.add_point(Point3::new(10.0, 0.0, 0.0), v2_id);

                let v3_id = ctx.derive("V3", TopoRank::Vertex);
                tessellation.add_point(Point3::new(0.0, 10.0, 0.0), v3_id);

                Ok(())
            }
            "sketch" => {
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created sketch with ID {}", id));
                
                // Parse sketch JSON if provided
                if let Some(first_arg) = call.args.first() {
                    if let Expression::Value(Value::String(json)) = first_arg {
                        if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(json) {
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
                                        tessellation.add_point(to_world(pos[0], pos[1]), topo_id);
                                        
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

                Ok(())
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
                            
                            // Use chain finder to get closed loops
                            let loops = crate::sketch::chains::find_closed_loops(&filtered_entities);
                            logs.push(format!("Found {} closed loops for extrusion", loops.len()));
                            
                            // Convert chain loops to 2D point arrays AND collect segment metadata
                            // loop_segments tracks source entity for each segment (for face grouping)
                            
                            let points_result: Vec<Vec<Vec<[f64; 2]>>> = loops.into_iter().map(|chain| {
                                let mut points: Vec<[f64; 2]> = Vec::new();
                                let mut segments: Vec<ProfileSegment> = Vec::new();
                                
                                for entity in chain {
                                    let entity_id = entity.id.to_string();
                                    
                                    match &entity.geometry {
                                        crate::sketch::types::SketchGeometry::Line { start, end } => {
                                            // Single segment from line
                                            segments.push(ProfileSegment {
                                                p1: *start,
                                                p2: *end,
                                                source: ProfileSegmentSource::Line { entity_id: entity_id.clone() },
                                            });
                                            
                                            if points.is_empty() || 
                                               (points.last().unwrap()[0] - start[0]).abs() > 1e-6 ||
                                               (points.last().unwrap()[1] - start[1]).abs() > 1e-6 {
                                                points.push(*start);
                                            }
                                            points.push(*end);
                                        },
                                        crate::sketch::types::SketchGeometry::Circle { center, radius } => {
                                            // Circle creates ~32 segments, all with same source
                                            let num_segments = 32;
                                            for j in 0..num_segments {
                                                let angle1 = (j as f64 / num_segments as f64) * 2.0 * std::f64::consts::PI;
                                                let angle2 = ((j + 1) as f64 / num_segments as f64) * 2.0 * std::f64::consts::PI;
                                                let p1 = [center[0] + radius * angle1.cos(), center[1] + radius * angle1.sin()];
                                                let p2 = [center[0] + radius * angle2.cos(), center[1] + radius * angle2.sin()];
                                                
                                                segments.push(ProfileSegment {
                                                    p1,
                                                    p2,
                                                    source: ProfileSegmentSource::Circle { 
                                                        entity_id: entity_id.clone(), 
                                                        center: *center, 
                                                        radius: *radius 
                                                    },
                                                });
                                                points.push(p1);
                                            }
                                        },
                                        crate::sketch::types::SketchGeometry::Ellipse { center, semi_major, semi_minor, rotation } => {
                                            let num_segments = 32;
                                            let cos_r = rotation.cos();
                                            let sin_r = rotation.sin();
                                            for j in 0..num_segments {
                                                let t1 = (j as f64 / num_segments as f64) * 2.0 * std::f64::consts::PI;
                                                let t2 = ((j + 1) as f64 / num_segments as f64) * 2.0 * std::f64::consts::PI;
                                                let x1 = semi_major * t1.cos();
                                                let y1 = semi_minor * t1.sin();
                                                let x2 = semi_major * t2.cos();
                                                let y2 = semi_minor * t2.sin();
                                                let p1 = [center[0] + x1 * cos_r - y1 * sin_r, center[1] + x1 * sin_r + y1 * cos_r];
                                                let p2 = [center[0] + x2 * cos_r - y2 * sin_r, center[1] + x2 * sin_r + y2 * cos_r];
                                                
                                                segments.push(ProfileSegment {
                                                    p1,
                                                    p2,
                                                    source: ProfileSegmentSource::Ellipse { entity_id: entity_id.clone(), center: *center },
                                                });
                                                points.push(p1);
                                            }
                                        },
                                        crate::sketch::types::SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                                            let num_segments = 16;
                                            let angle_span = end_angle - start_angle;
                                            for j in 0..num_segments {
                                                let t1 = j as f64 / num_segments as f64;
                                                let t2 = (j + 1) as f64 / num_segments as f64;
                                                let a1 = start_angle + t1 * angle_span;
                                                let a2 = start_angle + t2 * angle_span;
                                                let p1 = [center[0] + radius * a1.cos(), center[1] + radius * a1.sin()];
                                                let p2 = [center[0] + radius * a2.cos(), center[1] + radius * a2.sin()];
                                                
                                                segments.push(ProfileSegment {
                                                    p1,
                                                    p2,
                                                    source: ProfileSegmentSource::Arc { 
                                                        entity_id: entity_id.clone(), 
                                                        center: *center, 
                                                        radius: *radius 
                                                    },
                                                });
                                                points.push(p1);
                                            }
                                            // Push final point of arc
                                            let final_pt = [center[0] + radius * end_angle.cos(), center[1] + radius * end_angle.sin()];
                                            points.push(final_pt);
                                        },
                                        _ => {}
                                    }
                                }
                                // Store segments for this loop in the outer-scoped variable
                                loop_segments.push(vec![segments]);
                                
                                vec![points] // Wrap single loop as a profile with no holes
                            }).collect();
                            
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

                        let to_3d = |u: f64, v: f64| -> [f64; 3] {
                            [
                                origin[0] + u * x_axis[0] + v * y_axis[0],
                                origin[1] + u * x_axis[1] + v * y_axis[1],
                                origin[2] + u * x_axis[2] + v * y_axis[2],
                            ]
                        };

                        for (profile_idx, profile_loops_2d) in loops_2d.iter().enumerate() {
                            if profile_loops_2d.is_empty() { continue; }
                            
                            let outer_loop = &profile_loops_2d[0];
                            let holes = &profile_loops_2d[1..];
                            
                            // Triangulate with holes
                            let (merged_2d_points, triangles) = crate::geometry::tessellation::triangulate_polygon_with_holes(outer_loop, holes);
                            
                            // Convert merged 2D points to 3D
                            let merged_3d_points: Vec<[f64; 3]> = merged_2d_points.iter().map(|pt| to_3d(pt[0], pt[1])).collect();

                             // Generate 3D prism from profile
                            if !merged_3d_points.is_empty() {
                                // Calculate Z-offsets vectors
                                let vec_bottom = [normal[0] * start_offset, normal[1] * start_offset, normal[2] * start_offset];
                                let vec_top = [normal[0] * (start_offset + distance), normal[1] * (start_offset + distance), normal[2] * (start_offset + distance)];
                                
                                // Bottom face plane (origin shifted)
                                let bottom_origin = [origin[0] + vec_bottom[0], origin[1] + vec_bottom[1], origin[2] + vec_bottom[2]];
                                let top_origin = [origin[0] + vec_top[0], origin[1] + vec_top[1], origin[2] + vec_top[2]];
                                
                                // Create bottom face TopoId
                                let bottom_face_id = ctx.derive(&format!("BottomFace_{}", profile_idx), TopoRank::Face);
                                let bottom_entity = KernelEntity {
                                    id: bottom_face_id,
                                    geometry: AnalyticGeometry::Plane {
                                        origin: bottom_origin,
                                        normal: [-normal[0], -normal[1], -normal[2]], 
                                    }
                                };
                                topology_manifest.insert(bottom_face_id, bottom_entity);
                                
                                // Create top face TopoId
                                let top_face_id = ctx.derive(&format!("TopFace_{}", profile_idx), TopoRank::Face);
                                let top_entity = KernelEntity {
                                    id: top_face_id,
                                    geometry: AnalyticGeometry::Plane {
                                        origin: top_origin,
                                        normal: normal,
                                    }
                                };
                                topology_manifest.insert(top_face_id, top_entity);
                                
                                // Add triangles for top/bottom faces
                                for (i, j, k) in triangles {
                                    let p0 = merged_3d_points[i];
                                    let p1 = merged_3d_points[j];
                                    let p2 = merged_3d_points[k];
                                    
                                    // Bottom face (reverse winding for outward normal)
                                    tessellation.add_triangle(
                                        Point3::new(p0[0] + vec_bottom[0], p0[1] + vec_bottom[1], p0[2] + vec_bottom[2]),
                                        Point3::new(p2[0] + vec_bottom[0], p2[1] + vec_bottom[1], p2[2] + vec_bottom[2]),
                                        Point3::new(p1[0] + vec_bottom[0], p1[1] + vec_bottom[1], p1[2] + vec_bottom[2]),
                                        bottom_face_id
                                    );
                                    
                                    // Top face
                                    tessellation.add_triangle(
                                        Point3::new(p0[0] + vec_top[0], p0[1] + vec_top[1], p0[2] + vec_top[2]),
                                        Point3::new(p1[0] + vec_top[0], p1[1] + vec_top[1], p1[2] + vec_top[2]),
                                        Point3::new(p2[0] + vec_top[0], p2[1] + vec_top[1], p2[2] + vec_top[2]),
                                        top_face_id
                                    );
                                }
                                
                                // Maintain side faces (loop over ALL loops: outer + holes)
                                // Use a cache to assign single face ID per source entity
                                let mut face_id_cache: std::collections::HashMap<String, crate::topo::naming::TopoId> = std::collections::HashMap::new();
                                
                                for (sub_idx, loop_pts_2d) in profile_loops_2d.iter().enumerate() {
                                    let profile_points: Vec<[f64; 3]> = loop_pts_2d.iter().map(|pt| to_3d(pt[0], pt[1])).collect();
                                    
                                    // Get segments for this loop if available
                                    let segments_opt = loop_segments.get(profile_idx)
                                        .and_then(|p| p.get(sub_idx));
                                    
                                    for i in 0..profile_points.len() {
                                        let j = (i + 1) % profile_points.len();
                                        let p1 = profile_points[i];
                                        let p2 = profile_points[j];
                                        
                                        let dist_sq = (p1[0]-p2[0]).powi(2) + (p1[1]-p2[1]).powi(2) + (p1[2]-p2[2]).powi(2);
                                        if dist_sq < 1e-9 { continue; }

                                        // Determine face ID based on source entity (curved surfaces share same ID)
                                        let (side_face_id, is_new_face) = if let Some(segments) = segments_opt {
                                            if let Some(seg) = segments.get(i) {
                                                // Get entity_id from source
                                                let entity_id = match &seg.source {
                                                    ProfileSegmentSource::Line { entity_id } => entity_id.clone(),
                                                    ProfileSegmentSource::Circle { entity_id, .. } => entity_id.clone(),
                                                    ProfileSegmentSource::Arc { entity_id, .. } => entity_id.clone(),
                                                    ProfileSegmentSource::Ellipse { entity_id, .. } => entity_id.clone(),
                                                    ProfileSegmentSource::Unknown => format!("unknown_{}_{}_{}", profile_idx, sub_idx, i),
                                                };
                                                
                                                // Cache lookup: same entity_id = same face_id
                                                let cache_key = format!("{}_{}", profile_idx, entity_id);
                                                if let Some(&cached_id) = face_id_cache.get(&cache_key) {
                                                    (cached_id, false) // Reuse existing face ID
                                                } else {
                                                    // Create new face ID for this source entity
                                                    let face_name = match &seg.source {
                                                        ProfileSegmentSource::Circle { .. } => format!("CylinderFace_{}_{}", profile_idx, entity_id),
                                                        ProfileSegmentSource::Arc { .. } => format!("ArcFace_{}_{}", profile_idx, entity_id),
                                                        ProfileSegmentSource::Ellipse { .. } => format!("EllipseFace_{}_{}", profile_idx, entity_id),
                                                        _ => format!("PlaneFace_{}_{}", profile_idx, entity_id),
                                                    };
                                                    let new_id = ctx.derive(&face_name, TopoRank::Face);
                                                    face_id_cache.insert(cache_key, new_id);
                                                    (new_id, true) // New face ID
                                                }
                                            } else {
                                                // Fallback: no segment info, create per-segment face
                                                (ctx.derive(&format!("SideFace_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Face), true)
                                            }
                                        } else {
                                            // No segment metadata (from profile_regions path), create per-segment face  
                                            (ctx.derive(&format!("SideFace_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Face), true)
                                        };
                                        
                                        let v1_bottom = Point3::new(p1[0] + vec_bottom[0], p1[1] + vec_bottom[1], p1[2] + vec_bottom[2]);
                                        let v2_bottom = Point3::new(p2[0] + vec_bottom[0], p2[1] + vec_bottom[1], p2[2] + vec_bottom[2]);
                                        let v1_top = Point3::new(p1[0] + vec_top[0], p1[1] + vec_top[1], p1[2] + vec_top[2]);
                                        let v2_top = Point3::new(p2[0] + vec_top[0], p2[1] + vec_top[1], p2[2] + vec_top[2]);
                                        
                                        // Explicitly calculate smooth normals for rendering (every segment)
                                        let mut smooth_normal_1: Option<Vector3> = None;
                                        let mut smooth_normal_2: Option<Vector3> = None;
                                        
                                        if let Some(segments) = segments_opt {
                                            if let Some(seg) = segments.get(i) {
                                                match &seg.source {
                                                    ProfileSegmentSource::Circle { center, .. } |
                                                    ProfileSegmentSource::Arc { center, .. } => {
                                                        // Compute smooth vertex normals for rendering
                                                        // Normal is radial from center in the sketch plane
                                                        let n1_2d = [seg.p1[0] - center[0], seg.p1[1] - center[1]];
                                                        let len1 = (n1_2d[0]*n1_2d[0] + n1_2d[1]*n1_2d[1]).sqrt();
                                                        let n1_local = if len1 > 1e-6 { [n1_2d[0]/len1, n1_2d[1]/len1] } else { [1.0, 0.0] };
                                                        
                                                        let n2_2d = [seg.p2[0] - center[0], seg.p2[1] - center[1]];
                                                        let len2 = (n2_2d[0]*n2_2d[0] + n2_2d[1]*n2_2d[1]).sqrt();
                                                        let n2_local = if len2 > 1e-6 { [n2_2d[0]/len2, n2_2d[1]/len2] } else { [1.0, 0.0] };
                                                        
                                                        // Transform local 2D normal to global 3D normal
                                                        // Normal is purely in the sketch plane (perpendicular to extrusion axis)
                                                        let n1_3d = Vector3::new(
                                                            x_axis[0]*n1_local[0] + y_axis[0]*n1_local[1],
                                                            x_axis[1]*n1_local[0] + y_axis[1]*n1_local[1],
                                                            x_axis[2]*n1_local[0] + y_axis[2]*n1_local[1]
                                                        ).normalize();
                                                        
                                                        let n2_3d = Vector3::new(
                                                            x_axis[0]*n2_local[0] + y_axis[0]*n2_local[1],
                                                            x_axis[1]*n2_local[0] + y_axis[1]*n2_local[1],
                                                            x_axis[2]*n2_local[0] + y_axis[2]*n2_local[1]
                                                        ).normalize();
                                                        
                                                        smooth_normal_1 = Some(n1_3d);
                                                        smooth_normal_2 = Some(n2_3d);
                                                    },
                                                    _ => {}
                                                }
                                            }
                                        }

                                        // Register side entity only once per face (when is_new_face)
                                        if is_new_face {
                                            // Side normal approximation (flat) - used for fallback geometry
                                            let dx = p2[0] - p1[0];
                                            let dy = p2[1] - p1[1];
                                            let dz = p2[2] - p1[2];
                                            let tx = dx; let ty = dy; let tz = dz;
                                            let nx = ty * normal[2] - tz * normal[1];
                                            let ny = tz * normal[0] - tx * normal[2];
                                            let nz = tx * normal[1] - ty * normal[0];
                                            let len = (nx*nx + ny*ny + nz*nz).sqrt();
                                            let side_normal = if len > 1e-6 { [nx/len, ny/len, nz/len] } else { [0.0, 0.0, 1.0] };

                                            // Generate analytical geometry based on source type
                                            let geometry = if let Some(segments) = segments_opt {
                                                if let Some(seg) = segments.get(i) {
                                                    match &seg.source {
                                                        ProfileSegmentSource::Circle { center, radius, .. } |
                                                        ProfileSegmentSource::Arc { center, radius, .. } => {
                                                            // Cylinder analytical geometry
                                                            let center_3d = to_3d(center[0], center[1]);
                                                            AnalyticGeometry::Cylinder {
                                                                axis_start: center_3d,
                                                                axis_dir: normal,
                                                                radius: *radius,
                                                            }
                                                        },
                                                        _ => {
                                                            // Default to plane
                                                            AnalyticGeometry::Plane {
                                                                origin: [(v1_bottom.x+v1_top.x)/2.0, (v1_bottom.y+v1_top.y)/2.0, (v1_bottom.z+v1_top.z)/2.0],
                                                                normal: side_normal,
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    AnalyticGeometry::Plane {
                                                        origin: [(v1_bottom.x+v1_top.x)/2.0, (v1_bottom.y+v1_top.y)/2.0, (v1_bottom.z+v1_top.z)/2.0],
                                                        normal: side_normal,
                                                    }
                                                }
                                            } else {
                                                AnalyticGeometry::Plane {
                                                    origin: [(v1_bottom.x+v1_top.x)/2.0, (v1_bottom.y+v1_top.y)/2.0, (v1_bottom.z+v1_top.z)/2.0],
                                                    normal: side_normal,
                                                }
                                            };

                                            let side_entity = KernelEntity {
                                                id: side_face_id,
                                                geometry,
                                            };
                                            topology_manifest.insert(side_face_id, side_entity);
                                        }
                                        
                                        // For holes (sub_idx > 0), reverse winding so faces point inward
                                        // Use smooth normals if available
                                        if let (Some(n1), Some(n2)) = (smooth_normal_1, smooth_normal_2) {
                                            // Ensure normals point into valid material (out of the hole / away from solid for outer?)
                                            // Calculated radial normals point OUT from center.
                                            let n1_final = if sub_idx > 0 { -n1 } else { n1 };
                                            let n2_final = if sub_idx > 0 { -n2 } else { n2 };

                                            if sub_idx == 0 {
                                                // Outer loop: faces point outward
                                                tessellation.add_triangle_with_normals(v1_bottom, v2_bottom, v1_top, n1_final, n2_final, n1_final, side_face_id);
                                                tessellation.add_triangle_with_normals(v2_bottom, v2_top, v1_top, n2_final, n2_final, n1_final, side_face_id);
                                            } else {
                                                // Hole loop: faces point inward (reversed winding)
                                                tessellation.add_triangle_with_normals(v1_bottom, v1_top, v2_bottom, n1_final, n1_final, n2_final, side_face_id);
                                                tessellation.add_triangle_with_normals(v2_bottom, v1_top, v2_top, n2_final, n1_final, n2_final, side_face_id);
                                            }
                                        } else {
                                            // Fallback to flat shading
                                            if sub_idx == 0 {
                                                // Outer loop: faces point outward
                                                tessellation.add_triangle(v1_bottom, v2_bottom, v1_top, side_face_id);
                                                tessellation.add_triangle(v2_bottom, v2_top, v1_top, side_face_id);
                                            } else {
                                                // Hole loop: faces point inward (reversed winding)
                                                tessellation.add_triangle(v1_bottom, v1_top, v2_bottom, side_face_id);
                                                tessellation.add_triangle(v2_bottom, v1_top, v2_top, side_face_id);
                                            }
                                        }
                                        
                                        // === ADD EDGES FOR SELECTION ===
                                        // === ADD EDGES FOR SELECTION ===
                                        // Bottom edge
                                        let bottom_edge_id = if let Some(segments) = segments_opt {
                                             if let Some(seg) = segments.get(i) {
                                                 match &seg.source {
                                                     ProfileSegmentSource::Circle { entity_id, .. } => 
                                                         ctx.derive(&format!("BottomEdge_{}_{}_{}", profile_idx, sub_idx, entity_id), TopoRank::Edge),
                                                      ProfileSegmentSource::Arc { entity_id, .. } => 
                                                         ctx.derive(&format!("BottomEdge_{}_{}_{}", profile_idx, sub_idx, entity_id), TopoRank::Edge),
                                                     _ => ctx.derive(&format!("BottomEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                                 }
                                             } else {
                                                 ctx.derive(&format!("BottomEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                             }
                                        } else {
                                            ctx.derive(&format!("BottomEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                        };
                                        tessellation.add_line(v1_bottom, v2_bottom, bottom_edge_id);
                                        
                                        // Top edge
                                        let top_edge_id = if let Some(segments) = segments_opt {
                                             if let Some(seg) = segments.get(i) {
                                                 match &seg.source {
                                                     ProfileSegmentSource::Circle { entity_id, .. } => 
                                                         ctx.derive(&format!("TopEdge_{}_{}_{}", profile_idx, sub_idx, entity_id), TopoRank::Edge),
                                                      ProfileSegmentSource::Arc { entity_id, .. } => 
                                                         ctx.derive(&format!("TopEdge_{}_{}_{}", profile_idx, sub_idx, entity_id), TopoRank::Edge),
                                                     _ => ctx.derive(&format!("TopEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                                 }
                                             } else {
                                                 ctx.derive(&format!("TopEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                             }
                                        } else {
                                            ctx.derive(&format!("TopEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge)
                                        };
                                        tessellation.add_line(v1_top, v2_top, top_edge_id);
                                        
                                        // Conditional Vertical Edge & Vertex Generation
                                        let mut generate_vertical = true;
                                        if let Some(segments) = segments_opt {
                                            if let Some(curr_seg) = segments.get(i) {
                                                let prev_idx = (i + profile_points.len() - 1) % profile_points.len();
                                                if let Some(prev_seg) = segments.get(prev_idx) {
                                                    // Check if sources are the same entity
                                                    match (&curr_seg.source, &prev_seg.source) {
                                                        (ProfileSegmentSource::Circle { entity_id: id1, .. }, 
                                                         ProfileSegmentSource::Circle { entity_id: id2, .. }) if id1 == id2 => {
                                                            generate_vertical = false;
                                                        },
                                                        (ProfileSegmentSource::Arc { entity_id: id1, .. }, 
                                                         ProfileSegmentSource::Arc { entity_id: id2, .. }) if id1 == id2 => {
                                                            // For arcs, internal junctions are smooth, but start/end are not
                                                            // BUT: i and prev_idx might be wrap-around for a non-closed arc?
                                                            // For now, treat same-ID arc segments as smooth
                                                            generate_vertical = false;
                                                            
                                                            // Special case: if this is a closed loop made of one arc (e.g. 360 arc?), 
                                                            // check if vertices coincide. But loop_pts_2d is already processed.
                                                        },
                                                        _ => {}
                                                    }
                                                }
                                            }
                                        }

                                        if generate_vertical {
                                            // Vertical edge
                                            let vert_edge_id = ctx.derive(&format!("VertEdge_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Edge);
                                            tessellation.add_line(v1_bottom, v1_top, vert_edge_id);
                                            
                                            // === ADD VERTICES FOR SELECTION ===
                                            // Bottom corner vertex
                                            let bottom_vertex_id = ctx.derive(&format!("BottomVertex_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Vertex);
                                            tessellation.add_point(v1_bottom, bottom_vertex_id);
                                            
                                            // Top corner vertex
                                            let top_vertex_id = ctx.derive(&format!("TopVertex_{}_{}_{}", profile_idx, sub_idx, i), TopoRank::Vertex);
                                            tessellation.add_point(v1_top, top_vertex_id);
                                        }
                                    }
                                }
                            }
                        }

                        if loops_2d.is_empty() {
                            logs.push("Warning: No closed loops found for extrusion".to_string());
                        }

                    } else {
                        logs.push("Warning: Failed to parse sketch for extrusion".to_string());
                    }
                } else {
                    // No sketch provided - create a default box for testing
                    let face_id = ctx.derive("ExtrudeFace", TopoRank::Face);
                    let face_entity = KernelEntity {
                       id: face_id,
                       geometry: AnalyticGeometry::Plane {
                           origin: [0.0, 0.0, distance],
                           normal: [0.0, 0.0, 1.0],
                       }
                    };
                    topology_manifest.insert(face_id, face_entity);

                    tessellation.add_triangle(
                        Point3::new(0.0, 0.0, 0.0),
                        Point3::new(20.0, 0.0, 0.0),
                        Point3::new(0.0, 20.0, 0.0),
                        face_id
                    );
                    logs.push("Created default extrusion (no sketch provided)".to_string());
                }
                
                Ok(())
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
                
                let angle_radians = angle_degrees.to_radians();
                logs.push(format!("Revolving with angle={}°, axis={}", angle_degrees, axis));
                
                // Parse sketch and generate 3D geometry
                if let Some(json) = sketch_json {
                    if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(&json) {
                        crate::sketch::solver::SketchSolver::solve(&mut sketch);
                        
                        // Collect profile points from line segments
                        let mut profile_points: Vec<[f64; 2]> = Vec::new();
                        
                        for entity in &sketch.entities {
                            if entity.is_construction { continue; }
                            
                            match &entity.geometry {
                                crate::sketch::types::SketchGeometry::Line { start, end } => {
                                    if profile_points.is_empty() || 
                                       (profile_points.last().unwrap()[0] - start[0]).abs() > 1e-6 ||
                                       (profile_points.last().unwrap()[1] - start[1]).abs() > 1e-6 {
                                        profile_points.push(*start);
                                    }
                                    profile_points.push(*end);
                                },
                                _ => {}
                            }
                        }
                        
                        if profile_points.len() >= 2 {
                            // Number of angular segments 
                            let segments = ((angle_degrees / 360.0 * 32.0).max(4.0)) as usize;
                            let full_revolution = (angle_degrees - 360.0).abs() < 1e-6;
                            
                            // For each profile edge, create a surface of revolution
                            for p_idx in 0..profile_points.len() {
                                let next_idx = (p_idx + 1) % profile_points.len();
                                if p_idx == profile_points.len() - 1 && !full_revolution {
                                    continue; // Don't connect last to first for partial revolution
                                }
                                
                                let p1_2d = profile_points[p_idx];
                                let p2_2d = profile_points[next_idx];
                                
                                let face_id = ctx.derive(&format!("RevolveFace{}", p_idx), TopoRank::Face);
                                
                                // Create quads between angular steps
                                for seg in 0..segments {
                                    let theta1 = (seg as f64 / segments as f64) * angle_radians;
                                    let theta2 = ((seg + 1) as f64 / segments as f64) * angle_radians;
                                    
                                    // Rotate profile points around axis
                                    let (rot_p1_a, rot_p2_a) = match axis {
                                        "X" => (
                                            [p1_2d[0], p1_2d[1] * theta1.cos(), p1_2d[1] * theta1.sin()],
                                            [p2_2d[0], p2_2d[1] * theta1.cos(), p2_2d[1] * theta1.sin()]
                                        ),
                                        "Y" => (
                                            [p1_2d[0] * theta1.cos(), p1_2d[1], p1_2d[0] * theta1.sin()],
                                            [p2_2d[0] * theta2.cos(), p2_2d[1], p2_2d[0] * theta2.sin()]
                                        ),
                                        _ => (
                                            [p1_2d[0], p1_2d[1] * theta1.cos(), p1_2d[1] * theta1.sin()],
                                            [p2_2d[0], p2_2d[1] * theta1.cos(), p2_2d[1] * theta1.sin()]
                                        ),
                                    };
                                    
                                    let (rot_p1_b, rot_p2_b) = match axis {
                                        "X" => (
                                            [p1_2d[0], p1_2d[1] * theta2.cos(), p1_2d[1] * theta2.sin()],
                                            [p2_2d[0], p2_2d[1] * theta2.cos(), p2_2d[1] * theta2.sin()]
                                        ),
                                        "Y" => (
                                            [p1_2d[0] * theta2.cos(), p1_2d[1], p1_2d[0] * theta2.sin()],
                                            [p2_2d[0] * theta2.cos(), p2_2d[1], p2_2d[0] * theta2.sin()]
                                        ),
                                        _ => (
                                            [p1_2d[0], p1_2d[1] * theta2.cos(), p1_2d[1] * theta2.sin()],
                                            [p2_2d[0], p2_2d[1] * theta2.cos(), p2_2d[1] * theta2.sin()]
                                        ),
                                    };
                                    
                                    // Two triangles for the quad
                                    tessellation.add_triangle(
                                        Point3::new(rot_p1_a[0], rot_p1_a[1], rot_p1_a[2]),
                                        Point3::new(rot_p2_a[0], rot_p2_a[1], rot_p2_a[2]),
                                        Point3::new(rot_p2_b[0], rot_p2_b[1], rot_p2_b[2]),
                                        face_id
                                    );
                                    tessellation.add_triangle(
                                        Point3::new(rot_p1_a[0], rot_p1_a[1], rot_p1_a[2]),
                                        Point3::new(rot_p2_b[0], rot_p2_b[1], rot_p2_b[2]),
                                        Point3::new(rot_p1_b[0], rot_p1_b[1], rot_p1_b[2]),
                                        face_id
                                    );
                                }
                                
                                // Register face geometry (simplified - just one representative cylinder)
                                let face_entity = KernelEntity {
                                    id: face_id,
                                    geometry: AnalyticGeometry::Cylinder {
                                        axis_start: [0.0, 0.0, 0.0],
                                        axis_dir: match axis {
                                            "X" => [1.0, 0.0, 0.0],
                                            "Y" => [0.0, 1.0, 0.0],
                                            _ => [1.0, 0.0, 0.0],
                                        },
                                        radius: (p1_2d[1].abs() + p2_2d[1].abs()) / 2.0,
                                    }
                                };
                                topology_manifest.insert(face_id, face_entity);
                            }
                            
                            logs.push(format!("Generated revolution with {} profile points, {} segments", 
                                profile_points.len(), segments));
                        } else {
                            logs.push("Warning: Not enough profile points for revolution".to_string());
                        }
                    } else {
                        logs.push("Warning: Failed to parse sketch for revolution".to_string());
                    }
                } else {
                    logs.push("Warning: No sketch provided for revolution".to_string());
                }
                
                Ok(())
            }
            "sphere" => {
                let id = generator.next_id();
                modified.push(id);
                logs.push(format!("Created sphere with ID {}", id));
                Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::microcad_kernel::ast::*;

    #[test]
    fn test_evaluate_cube() {
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
                Statement::Assignment {
                    name: "prism".into(),
                    expr: Expression::Call(Call {
                        function: "extrude".into(),
                        args: vec![
                            Expression::Value(Value::String(json)),
                            Expression::Value(Value::Number(15.0)), // distance
                            Expression::Value(Value::String("Add".into())), // operation
                        ],
                    })
                }
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Extrude eval failed");
        
        // Should have triangles for top, bottom, and side faces
        // Triangle profile: 1 tri top + 1 tri bottom + 3 sides * 2 tris = 8 triangles
        // Each triangle = 3 indices
        assert!(res.tessellation.indices.len() >= 6, "Should have triangle indices for 3D geometry");
        
        // Should have face TopoIds in manifest (top, bottom, 3 sides)
        assert!(res.topology_manifest.len() >= 2, "Should have face TopoIds in manifest");
        
        // Check logs for success message
        assert!(res.logs.iter().any(|l| l.contains("Processing") && l.contains("loops for extrusion")), 
                "Logs should indicate successful extrusion processing: {:?}", res.logs);
    }

    #[test]
    fn test_revolve_with_sketch() {
        use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry};
        
        let runtime = Runtime::new();
        let generator = IdGenerator::new("TestRevolve");
        
        // Create a line profile (will create a cone when revolved)
        // Line from (5, 0) to (10, 5) - offset from axis
        let mut sketch = Sketch::new(SketchPlane::default());
        sketch.add_entity(SketchGeometry::Line { start: [5.0, 0.0], end: [10.0, 5.0] });
        let json = serde_json::to_string(&sketch).unwrap();

        let prog = Program {
            statements: vec![
                Statement::Assignment {
                    name: "cone".into(),
                    expr: Expression::Call(Call {
                        function: "revolve".into(),
                        args: vec![
                            Expression::Value(Value::String(json)),
                            Expression::Value(Value::Number(360.0)), // full revolution
                            Expression::Value(Value::String("X".into())), // around X axis
                        ],
                    })
                }
            ]
        };
        
        let res = runtime.evaluate(&prog, &generator).expect("Revolve eval failed");
        
        // Should have triangle indices for the surface of revolution
        assert!(res.tessellation.indices.len() >= 6, "Should have triangle indices for 3D geometry");
        
        // Should have face TopoIds in manifest
        assert!(res.topology_manifest.len() >= 1, "Should have face TopoIds in manifest");
        
        // Check logs for success message
        assert!(res.logs.iter().any(|l| l.contains("Generated revolution")), 
                "Logs should indicate successful revolution: {:?}", res.logs);
    }
}
