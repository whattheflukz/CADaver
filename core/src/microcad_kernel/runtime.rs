use super::ast::{Program, Statement, Expression, Call, Value};
use crate::topo::{EntityId, IdGenerator};
use crate::geometry::Tessellation;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use microcad_core::geo2d::{Rect, Point, Size2};
use microcad_core::geo3d::Extrude;

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

                // Create geometry using MicroCAD
                let p1 = Point::new(0.0, 0.0);
                let p2 = Point::new(10.0, 10.0);
                let rect = Rect::new(p1, p2);
                let poly = rect.to_polygon();
                let mesh_result = poly.extrude(microcad_core::geo3d::Extrusion::Linear { 
                    height: microcad_core::Length(10.0), 
                    scale_x: 1.0, 
                    scale_y: 1.0, 
                    twist: cgmath::Rad(0.0).into() 
                });
                
                let inner = &mesh_result.inner;
                let positions = &inner.positions;
                let indices = &inner.triangle_indices;

                // Create a single Face ID for the extruded solid (implied topology for now)
                let face_id = ctx.derive("Face-0", TopoRank::Face); // Only 1 face in raw mesh?
                // Note: MicroCAD mesh is a "soup" of triangles currently. 
                // We treat the whole result as one "Face" for selection purposes until we have B-Rep.
                
                // Register Face Geometry (Placeholder Plane for now, as we don't have surface info)
                // In reality, it should be a Mesh surface?
                let face_entity = KernelEntity {
                   id: face_id,
                   geometry: AnalyticGeometry::Mesh, // We added Mesh variant earlier?
                };
                topology_manifest.insert(face_id, face_entity);

                // Generate TopoIds for vertices to maintain stability
                let mut vertex_ids = Vec::with_capacity(positions.len());
                for (i, p) in positions.iter().enumerate() {
                    let v_id = ctx.derive(&format!("V-{}", i), TopoRank::Vertex);
                    vertex_ids.push(v_id);
                    
                    // Add selectable point
                    tessellation.add_point(
                        Point3::new(p.x.into(), p.y.into(), p.z.into()),
                        v_id
                    );
                }

                // Add triangles
                for tri in indices {
                    let i0 = tri.0 as usize;
                    let i1 = tri.1 as usize;
                    let i2 = tri.2 as usize;
                    
                    let p0 = positions[i0];
                    let p1 = positions[i1];
                    let p2 = positions[i2];

                    tessellation.add_triangle(
                        Point3::new(p0.x.into(), p0.y.into(), p0.z.into()),
                        Point3::new(p1.x.into(), p1.y.into(), p1.z.into()),
                        Point3::new(p2.x.into(), p2.y.into(), p2.z.into()),
                        face_id
                    );
                }

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

                        // Convert 2D loops to MicroCAD Polygons and Extrude
                        use microcad_core::geo2d::{Polygon, LineString, Point};
                        use microcad_core::geo3d::{Extrude, Extrusion};
                        use microcad_core::Length;
                        
                        for (i, region_loops) in loops_2d.iter().enumerate() {
                            if region_loops.is_empty() { continue; }
                            
                            // 1. Create Exterior LineString
                            let exterior_points: Vec<Point> = region_loops[0].iter()
                                .map(|p| Point::new(p[0] as f64, p[1] as f64))
                                .collect();
                            let exterior = LineString::from(exterior_points);
                            
                            // 2. Create Interior LineStrings (Holes)
                            let mut interiors = Vec::new();
                            for hole_loop in region_loops.iter().skip(1) {
                                let hole_points: Vec<Point> = hole_loop.iter()
                                    .map(|p| Point::new(p[0] as f64, p[1] as f64))
                                    .collect();
                                interiors.push(LineString::from(hole_points));
                            }
                            
                            // 3. Create Polygon
                            let poly = Polygon::new(exterior, interiors);
                            
                            // 4. Extrude
                            // Note: MicroCAD extrudes along Z. We might need to rotate if sketch is not on XY.
                            // But for now, assuming sketches are XY plane based or transformed later?
                            // The current system transforms visualization usually. 
                            // However, the manual implementation had `x_axis`, `y_axis`, `normal` from sketch plane.
                            // The MicroCAD kernel `extrude` currently just goes up Z.
                            // If `plane` is not XY, we'd need to transform points or rotate result.
                            
                            let mesh_result = poly.extrude(Extrusion::Linear {
                                height: Length(distance),
                                scale_x: 1.0,
                                scale_y: 1.0,
                                twist: cgmath::Rad(0.0).into()
                            });
                            
                            // 5. Add to Tessellation
                            // We need to transform the mesh from local extrusion space (Z-up) to sketch plane space.
                            let mut transformed_mesh = mesh_result.inner;
                            
                            // Apply transform: [u, v, w] -> origin + u*x_axis + v*y_axis + w*plane_normal
                            for p in &mut transformed_mesh.positions {
                                let u = p.x;
                                let v = p.y;
                                let w = p.z;
                                
                                let px = origin[0] as f32 + u * x_axis[0] as f32 + v * y_axis[0] as f32 + w * normal[0] as f32;
                                let py = origin[1] as f32 + u * x_axis[1] as f32 + v * y_axis[1] as f32 + w * normal[1] as f32;
                                let pz = origin[2] as f32 + u * x_axis[2] as f32 + v * y_axis[2] as f32 + w * normal[2] as f32;
                                
                                p.x = px;
                                p.y = py;
                                p.z = pz;
                            }
                            
                            add_microcad_mesh_to_tessellation(
                                &ctx, 
                                tessellation, 
                                topology_manifest, 
                                &transformed_mesh, 
                                &format!("Extrude_{}", i)
                            );
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



fn add_microcad_mesh_to_tessellation(
    ctx: &crate::topo::naming::NamingContext,
    tessellation: &mut crate::geometry::tessellation::Tessellation,
    topology_manifest: &mut std::collections::HashMap<crate::topo::naming::TopoId, crate::topo::registry::KernelEntity>,
    mesh: &microcad_core::geo3d::TriangleMesh,
    base_name: &str,
) {
    use crate::topo::naming::TopoRank;
    use crate::topo::registry::{KernelEntity, AnalyticGeometry};
    use crate::geometry::Point3;
    use microcad_core::geo2d::Point;

    let positions = &mesh.positions;
    
    let positions = &mesh.positions;
    
    // Track vertex degree (incidence of Feature Edges) to filter shown vertices
    // 0 = interior face vertex, 2 = edge interior vertex, != 2 && > 0 = Feature Vertex (Corner)
    let mut vertex_feature_degree = vec![0usize; positions.len()];

    // 1. Compute Normals for all triangles
    let mut triangle_normals = Vec::with_capacity(mesh.triangle_indices.len());
    for tri in &mesh.triangle_indices {
        let i0 = tri.0 as usize;
        let i1 = tri.1 as usize;
        let i2 = tri.2 as usize;
        let p0 = positions[i0];
        let p1 = positions[i1];
        let p2 = positions[i2];
        
        let u_x = p1.x as f64 - p0.x as f64;
        let u_y = p1.y as f64 - p0.y as f64;
        let u_z = p1.z as f64 - p0.z as f64;
        let v_x = p2.x as f64 - p0.x as f64;
        let v_y = p2.y as f64 - p0.y as f64;
        let v_z = p2.z as f64 - p0.z as f64;
        
        let nx = u_y * v_z - u_z * v_y;
        let ny = u_z * v_x - u_x * v_z;
        let nz = u_x * v_y - u_y * v_x;
        
        let len = (nx * nx + ny * ny + nz * nz).sqrt();
        let normal = if len < 1e-6 { [0.0, 0.0, 1.0] } else { [nx / len, ny / len, nz / len] };
        triangle_normals.push(normal);
    }
    
    // 2. Build Adjacency Graph (Edge -> Triangles)
    let mut edge_map: std::collections::HashMap<(usize, usize), Vec<usize>> = std::collections::HashMap::new();
    
    for (tri_idx, tri) in mesh.triangle_indices.iter().enumerate() {
        let indices = [tri.0 as usize, tri.1 as usize, tri.2 as usize];
        for k in 0..3 {
            let v1 = indices[k];
            let v2 = indices[(k + 1) % 3];
            let key = if v1 < v2 { (v1, v2) } else { (v2, v1) };
            edge_map.entry(key).or_default().push(tri_idx);
        }
    }
    
    // 3. Union-Find / Disjoint Set to group smooth faces
    let num_tris = mesh.triangle_indices.len();
    let mut parent: Vec<usize> = (0..num_tris).collect();
    
    // Simple iterative find with path compression
    let mut find = |mut i: usize, parent: &mut Vec<usize>| -> usize {
        while i != parent[i] {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        i
    };
    
    let mut union = |i: usize, j: usize, parent: &mut Vec<usize>| {
        let root_i = find(i, parent);
        let root_j = find(j, parent);
        if root_i != root_j {
            // Deterministic merge: always merge larger into smaller to keep stable representative
            if root_i < root_j {
                parent[root_j] = root_i;
            } else {
                parent[root_i] = root_j;
            }
        }
    };
    
    // Threshold: 40 degrees (cos(40) ~ 0.766)
    let smoothness_threshold = 0.766; 
    
    // Iterate edges deterministically? edge_map iteration is random but union is commutative commutative enough?
    // To be perfectly safe, let's sort keys, but hashmap iteration might be fine if rule is strict (min index).
    // Actually, iterating in random order could affect the structure of the tree but path compression and "min index root" rule
    // guarantees the final root is the minimum index in the set.
    for (_, neighbors) in &edge_map {
        if neighbors.len() == 2 {
            let t1 = neighbors[0];
            let t2 = neighbors[1];
            
            let n1 = triangle_normals[t1];
            let n2 = triangle_normals[t2];
            
            let dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
            
            if dot > smoothness_threshold {
                union(t1, t2, &mut parent);
            }
        }
    }
    
    // 3b. Compute Smooth Normals (Per Vertex, Per FaceGroup)
    // Map (VertexIndex, FaceRoot) -> Accumulator Normal
    let mut vertex_smooth_normals: std::collections::HashMap<(usize, usize), [f64; 3]> = std::collections::HashMap::new();
    
    for (tri_idx, tri) in mesh.triangle_indices.iter().enumerate() {
        let root = find(tri_idx, &mut parent);
        let normal = triangle_normals[tri_idx];
        let indices = [tri.0 as usize, tri.1 as usize, tri.2 as usize];
        
        for &v_idx in &indices {
            let entry = vertex_smooth_normals.entry((v_idx, root)).or_insert([0.0, 0.0, 0.0]);
            entry[0] += normal[0];
            entry[1] += normal[1];
            entry[2] += normal[2];
        }
    }
    
    // Normalize accumulators
    for (_, n) in vertex_smooth_normals.iter_mut() {
        let len = (n[0]*n[0] + n[1]*n[1] + n[2]*n[2]).sqrt();
        if len > 1e-6 {
            n[0] /= len; n[1] /= len; n[2] /= len;
        }
    }

    // 4. Generate TopoIds for Groups
    let mut group_id_map: std::collections::HashMap<usize, crate::topo::naming::TopoId> = std::collections::HashMap::new();
    
    for (tri_idx, tri) in mesh.triangle_indices.iter().enumerate() {
        let root = find(tri_idx, &mut parent);
        
        let face_id = *group_id_map.entry(root).or_insert_with(|| {
             let n = triangle_normals[root];
             let q_normal = [
                 (n[0] * 100.0) as i64,
                 (n[1] * 100.0) as i64,
                 (n[2] * 100.0) as i64
             ];
             let seed = format!("{}_Face_Smooth_{}_{}_{}_{}", base_name, root, q_normal[0], q_normal[1], q_normal[2]);
             let id = ctx.derive(&seed, TopoRank::Face);
             
             let entity = KernelEntity {
                id,
                geometry: AnalyticGeometry::Plane {
                    origin: [positions[tri.0 as usize].x as f64, positions[tri.0 as usize].y as f64, positions[tri.0 as usize].z as f64],
                    normal: n,
                }, 
             };
             topology_manifest.insert(id, entity);
             id
        });

        let i0 = tri.0 as usize;
        let i1 = tri.1 as usize;
        let i2 = tri.2 as usize;
        let p0 = positions[i0];
        let p1 = positions[i1];
        let p2 = positions[i2];
        
        // Fetch smooth normals
        let default_n = [0.0, 1.0, 0.0];
        let n0 = vertex_smooth_normals.get(&(i0, root)).unwrap_or(&default_n);
        let n1 = vertex_smooth_normals.get(&(i1, root)).unwrap_or(&default_n);
        let n2 = vertex_smooth_normals.get(&(i2, root)).unwrap_or(&default_n);

        use crate::geometry::Vector3;
        tessellation.add_triangle_with_normals(
            Point3::new(p0.x.into(), p0.y.into(), p0.z.into()),
            Point3::new(p1.x.into(), p1.y.into(), p1.z.into()),
            Point3::new(p2.x.into(), p2.y.into(), p2.z.into()),
            Vector3::new(n0[0] as f64, n0[1] as f64, n0[2] as f64),
            Vector3::new(n1[0] as f64, n1[1] as f64, n1[2] as f64),
            Vector3::new(n2[0] as f64, n2[1] as f64, n2[2] as f64),
            face_id
        );
    }
    
    // 5. Extract Feature Edges
    // Edges are "Features" if they separate two different Face Groups or are boundaries
    // We group segments by the Pair of connected Faces to create Unified Edges.
    let mut edge_groups: std::collections::HashMap<(usize, usize), crate::topo::naming::TopoId> = std::collections::HashMap::new();

    for ((v1, v2), neighbors) in &edge_map {
        let (root1, root2) = if neighbors.len() != 2 {
            // Boundary edge. Use a special "Outer" marker? 
            // We use the single face root key and a marker max-usize
            (find(neighbors[0], &mut parent), usize::MAX)
        } else {
            let r1 = find(neighbors[0], &mut parent);
            let r2 = find(neighbors[1], &mut parent);
            if r1 < r2 { (r1, r2) } else { (r2, r1) }
        };
        
        let is_feature = root1 != root2;
        
        if is_feature {
            // Track Feature Degree for vertices
            if *v1 < vertex_feature_degree.len() { vertex_feature_degree[*v1] += 1; }
            if *v2 < vertex_feature_degree.len() { vertex_feature_degree[*v2] += 1; }

            // Fetch or create Edge ID for this Face Pair
            // Stable ID based on the Face Roots (which are minimal indices)
            let edge_id = *edge_groups.entry((root1, root2)).or_insert_with(|| {
                let seed = format!("{}_Edge_Group_{}_{}", base_name, root1, root2);
                let id = ctx.derive(&seed, TopoRank::Edge);
                
                // For now, we register a generic Line for the FIRST segment we find.
                // Ideally this would be a Composite Curve or Polyline.
                // The geometry is just metadata for selection raycasting.
                // We pick the current segment as representative.
                let p1 = positions[*v1];
                let p2 = positions[*v2];
                 
                let entity = KernelEntity {
                    id,
                    geometry: AnalyticGeometry::Line {
                        start: [p1.x as f64, p1.y as f64, p1.z as f64],
                        end: [p2.x as f64, p2.y as f64, p2.z as f64],
                    },
                };
                topology_manifest.insert(id, entity);
                id
            });
            
            let p1 = positions[*v1];
            let p2 = positions[*v2];
            
            tessellation.add_line(
                Point3::new(p1.x.into(), p1.y.into(), p1.z.into()),
                Point3::new(p2.x.into(), p2.y.into(), p2.z.into()),
                edge_id
            );
        }
    }
    
    // 6. Extract Feature Vertices (Corners)
    // Only show vertices that are topologically significant (corners junctions or endpoints)
    // Degree 2 nodes are just passing through an edge.
    for (i, degree) in vertex_feature_degree.iter().enumerate() {
        if *degree > 0 && *degree != 2 {
            // This is a feature vertex!
            let p = positions[i];
            let v_id = ctx.derive(&format!("{}_V_{}", base_name, i), TopoRank::Vertex);
            
            tessellation.add_point(
                Point3::new(p.x.into(), p.y.into(), p.z.into()),
                v_id
            );
        }
    }
}


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
        
        // Should have face TopoIds in manifest
        // Current MicroCAD integration returns a single mesh face for the extrusion
        assert!(res.topology_manifest.len() >= 1, "Should have face TopoIds in manifest");
        
        // Check logs for success message
        assert!(res.logs.iter().any(|l| l.contains("Processing") && l.contains("profiles for extrusion")), 
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
