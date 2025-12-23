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
                
                // Parse arguments: sketch_json, distance, operation
                let mut sketch_json: Option<String> = None;
                let mut distance: f64 = 10.0;
                let mut _operation = "Add";
                
                for (i, arg) in call.args.iter().enumerate() {
                    match (i, arg) {
                        (0, Expression::Value(Value::String(s))) => sketch_json = Some(s.clone()),
                        (1, Expression::Value(Value::Number(d))) => distance = *d,
                        (2, Expression::Value(Value::String(op))) => _operation = op.as_str(),
                        _ => {}
                    }
                }
                
                logs.push(format!("Extruding with distance={}, operation={}", distance, _operation));
                
                // Parse sketch and generate 3D geometry
                if let Some(json) = sketch_json {
                    if let Ok(mut sketch) = serde_json::from_str::<crate::sketch::types::Sketch>(&json) {
                        // Solve constraints first
                        crate::sketch::solver::SketchSolver::solve(&mut sketch);
                        
                        // Collect line segments to form profile
                        let mut profile_points: Vec<[f64; 2]> = Vec::new();
                        
                        for entity in &sketch.entities {
                            // Skip construction geometry
                            if entity.is_construction {
                                continue;
                            }
                            
                            match &entity.geometry {
                                crate::sketch::types::SketchGeometry::Line { start, end } => {
                                    // Add start point if not already present
                                    if profile_points.is_empty() || 
                                       (profile_points.last().unwrap()[0] - start[0]).abs() > 1e-6 ||
                                       (profile_points.last().unwrap()[1] - start[1]).abs() > 1e-6 {
                                        profile_points.push(*start);
                                    }
                                    profile_points.push(*end);
                                },
                                _ => {} // TODO: Handle arcs, circles as profiles
                            }
                        }
                        
                        // Generate 3D prism from profile
                        if profile_points.len() >= 2 {
                            let z_bottom = 0.0;
                            let z_top = distance;
                            
                            // Create bottom face TopoId
                            let bottom_face_id = ctx.derive("BottomFace", TopoRank::Face);
                            let bottom_entity = KernelEntity {
                                id: bottom_face_id,
                                geometry: AnalyticGeometry::Plane {
                                    origin: [0.0, 0.0, z_bottom],
                                    normal: [0.0, 0.0, -1.0],
                                }
                            };
                            topology_manifest.insert(bottom_face_id, bottom_entity);
                            
                            // Create top face TopoId
                            let top_face_id = ctx.derive("TopFace", TopoRank::Face);
                            let top_entity = KernelEntity {
                                id: top_face_id,
                                geometry: AnalyticGeometry::Plane {
                                    origin: [0.0, 0.0, z_top],
                                    normal: [0.0, 0.0, 1.0],
                                }
                            };
                            topology_manifest.insert(top_face_id, top_entity);
                            
                            // Triangulate bottom and top faces (simple fan triangulation for convex profiles)
                            // For a proper implementation, we'd use ear clipping or similar
                            if profile_points.len() >= 3 {
                                let p0 = profile_points[0];
                                for i in 1..(profile_points.len() - 1) {
                                    let p1 = profile_points[i];
                                    let p2 = profile_points[i + 1];
                                    
                                    // Bottom face (reversed winding for outward normal)
                                    tessellation.add_triangle(
                                        Point3::new(p0[0], p0[1], z_bottom),
                                        Point3::new(p2[0], p2[1], z_bottom),
                                        Point3::new(p1[0], p1[1], z_bottom),
                                        bottom_face_id
                                    );
                                    
                                    // Top face
                                    tessellation.add_triangle(
                                        Point3::new(p0[0], p0[1], z_top),
                                        Point3::new(p1[0], p1[1], z_top),
                                        Point3::new(p2[0], p2[1], z_top),
                                        top_face_id
                                    );
                                }
                            }
                            
                            // Create side faces (quads as two triangles each)
                            for i in 0..profile_points.len() {
                                let j = (i + 1) % profile_points.len();
                                let p1 = profile_points[i];
                                let p2 = profile_points[j];
                                
                                // Skip if last point equals first (closed profile)
                                if i == profile_points.len() - 1 && 
                                   (p1[0] - profile_points[0][0]).abs() < 1e-6 &&
                                   (p1[1] - profile_points[0][1]).abs() < 1e-6 {
                                    continue;
                                }
                                
                                let side_face_id = ctx.derive(&format!("SideFace{}", i), TopoRank::Face);
                                
                                // Calculate normal for this side face
                                let dx = p2[0] - p1[0];
                                let dy = p2[1] - p1[1];
                                let len = (dx*dx + dy*dy).sqrt();
                                let nx = dy / len;  // Perpendicular to edge, pointing outward
                                let ny = -dx / len;
                                
                                let side_entity = KernelEntity {
                                    id: side_face_id,
                                    geometry: AnalyticGeometry::Plane {
                                        origin: [(p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0, z_bottom + distance / 2.0],
                                        normal: [nx, ny, 0.0],
                                    }
                                };
                                topology_manifest.insert(side_face_id, side_entity);
                                
                                // Two triangles for the quad
                                // Bottom-left, top-left, top-right
                                tessellation.add_triangle(
                                    Point3::new(p1[0], p1[1], z_bottom),
                                    Point3::new(p1[0], p1[1], z_top),
                                    Point3::new(p2[0], p2[1], z_top),
                                    side_face_id
                                );
                                // Bottom-left, top-right, bottom-right
                                tessellation.add_triangle(
                                    Point3::new(p1[0], p1[1], z_bottom),
                                    Point3::new(p2[0], p2[1], z_top),
                                    Point3::new(p2[0], p2[1], z_bottom),
                                    side_face_id
                                );
                                
                                // Add edge TopoIds
                                let edge_id = ctx.derive(&format!("SideEdge{}", i), TopoRank::Edge);
                                tessellation.add_line(
                                    Point3::new(p1[0], p1[1], z_bottom),
                                    Point3::new(p1[0], p1[1], z_top),
                                    edge_id
                                );
                            }
                            
                            logs.push(format!("Generated extrusion with {} profile points, {} faces", 
                                profile_points.len(), 
                                2 + profile_points.len())); // top + bottom + sides
                        } else {
                            logs.push("Warning: Not enough profile points for extrusion".to_string());
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
        assert!(res.logs.iter().any(|l| l.contains("Generated extrusion")), 
                "Logs should indicate successful extrusion");
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
