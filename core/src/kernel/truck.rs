//! Truck-based implementation of the geometry kernel.
//!
//! This module provides a CAD kernel implementation using the Truck library,
//! which is licensed under Apache-2.0 (MIT-compatible).

use super::types::*;
use super::{GeometryKernel, KernelOpError, KernelResult};
use crate::geometry::{Point3 as GeoPoint3, Tessellation, Vector3 as GeoVector3};
use crate::topo::naming::{NamingContext, TopoId, TopoRank};
use crate::topo::registry::{AnalyticGeometry, KernelEntity};
use std::collections::HashMap;

// Use truck's pre-exported types which come from cgmath64
use truck_modeling::{Point3, Vector3, builder, Vertex, Wire, Solid, Rad, EuclideanSpace, InnerSpace};
use truck_meshalgo::tessellation::MeshableShape;
use truck_polymesh::PolygonMesh;

/// Truck-based CAD kernel implementation.
pub struct TruckKernel {
    /// Tessellation tolerance for mesh generation.
    pub tolerance: f64,
}

impl TruckKernel {
    pub fn new() -> Self {
        Self {
            tolerance: 0.01, // 0.01mm precision
        }
    }
    
    pub fn with_tolerance(tolerance: f64) -> Self {
        Self { tolerance }
    }
}

impl Default for TruckKernel {
    fn default() -> Self {
        Self::new()
    }
}

/// Detect if a set of 2D points forms a circle.
/// Returns (center_x, center_y, radius) if the points are circular within tolerance.
fn detect_circle_2d(points: &[Point2D], tolerance: f64) -> Option<(f64, f64, f64)> {
    if points.len() < 8 {
        // Need at least 8 points for reliable circle detection
        return None;
    }
    
    // Compute centroid
    let n = points.len() as f64;
    let cx: f64 = points.iter().map(|p| p.x).sum::<f64>() / n;
    let cy: f64 = points.iter().map(|p| p.y).sum::<f64>() / n;
    
    // Compute distances from centroid
    let distances: Vec<f64> = points.iter()
        .map(|p| ((p.x - cx).powi(2) + (p.y - cy).powi(2)).sqrt())
        .collect();
    
    // Check if centroid is near origin (circles are typically centered)
    // and all points are equidistant
    let avg_radius = distances.iter().sum::<f64>() / n;
    
    if avg_radius < 0.001 {
        return None; // Degenerate case
    }
    
    // Check all points are within tolerance of the average radius
    let max_deviation = distances.iter()
        .map(|d| (d - avg_radius).abs())
        .fold(0.0, f64::max);
    
    // Relative tolerance: allow 0.5% deviation
    let rel_tolerance = tolerance.max(avg_radius * 0.005);
    
    if max_deviation < rel_tolerance {
        Some((cx, cy, avg_radius))
    } else {
        None
    }
}

/// Detect if a set of 3D vertices lies on a cylinder.
/// Returns (axis_point, axis_direction, radius) if cylindrical within tolerance.
/// Uses a simple approach: check if min/max radius from centroid are close (band check).
fn detect_cylinder_from_vertices(vertices: &[[f64; 3]]) -> Option<([f64; 3], [f64; 3], f64)> {
    if vertices.len() < 10 {
        return None;
    }
    
    // Remove duplicate vertices with a coarser tolerance
    let mut unique: Vec<[f64; 3]> = Vec::with_capacity(vertices.len());
    for v in vertices {
        let is_duplicate = unique.iter().any(|u| {
            (u[0] - v[0]).abs() < 0.001 && (u[1] - v[1]).abs() < 0.001 && (u[2] - v[2]).abs() < 0.001
        });
        if !is_duplicate {
            unique.push(*v);
        }
    }
    
    if unique.len() < 6 {
        return None;
    }
    
    // Compute 3D bounding box centroid
    let n = unique.len() as f64;
    let cx = unique.iter().map(|v| v[0]).sum::<f64>() / n;
    let cy = unique.iter().map(|v| v[1]).sum::<f64>() / n;
    let cz = unique.iter().map(|v| v[2]).sum::<f64>() / n;
    
    // Try each principal axis
    let axes: [[f64; 3]; 3] = [
        [1.0, 0.0, 0.0], // X axis
        [0.0, 1.0, 0.0], // Y axis
        [0.0, 0.0, 1.0], // Z axis
    ];
    
    for axis in &axes {
        let axis_idx = if axis[0] > 0.5 { 0 } else if axis[1] > 0.5 { 1 } else { 2 };
        
        // Get the axial extent
        let axial_coords: Vec<f64> = unique.iter().map(|v| v[axis_idx]).collect();
        let min_axial = axial_coords.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_axial = axial_coords.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let axial_range = max_axial - min_axial;
        
        // Skip if no axial extent (flat face, not a cylinder surface)
        if axial_range < 0.01 {
            continue;
        }
        
        // Project all vertices to 2D and compute distance from 2D centroid
        let (perp_cx, perp_cy) = match axis_idx {
            0 => (cy, cz),
            1 => (cx, cz),
            _ => (cx, cy),
        };
        
        let mut min_radius = f64::INFINITY;
        let mut max_radius = f64::NEG_INFINITY;
        let mut sum_radius = 0.0;
        
        for v in &unique {
            let (px, py) = match axis_idx {
                0 => (v[1], v[2]),
                1 => (v[0], v[2]),
                _ => (v[0], v[1]),
            };
            let dist = ((px - perp_cx).powi(2) + (py - perp_cy).powi(2)).sqrt();
            if dist < min_radius { min_radius = dist; }
            if dist > max_radius { max_radius = dist; }
            sum_radius += dist;
        }
        
        let avg_radius = sum_radius / unique.len() as f64;
        let radius_range = max_radius - min_radius;
        
        // Skip if radius is too small
        if avg_radius < 0.1 {
            continue;
        }
        
        // Tolerance: 8% of average radius for the band width
        let tolerance = avg_radius * 0.08;
        
        println!("[DEBUG CYLINDER] axis={:?}, n={}, avg_r={:.3}, range={:.4}, tol={:.4}, pass={}", 
                 axis, unique.len(), avg_radius, radius_range, tolerance, radius_range < tolerance);
        
        if radius_range < tolerance {
            // Found a cylindrical surface!
            let mid_axial = (min_axial + max_axial) / 2.0;
            let center_point = match axis_idx {
                0 => [mid_axial, perp_cx, perp_cy],
                1 => [perp_cx, mid_axial, perp_cy],
                _ => [perp_cx, perp_cy, mid_axial],
            };
            return Some((center_point, *axis, avg_radius));
        }
    }
    
    None
}


impl GeometryKernel for TruckKernel {
    type Solid = Solid;
    type Mesh = PolygonMesh;
    
    fn create_box(&self, width: f64, height: f64, depth: f64) -> KernelResult<Self::Solid> {
        // Create a box using truck-modeling's builder
        // Box is from (0,0,0) to (width, height, depth)
        let v = builder::vertex(Point3::new(0.0, 0.0, 0.0));
        let edge0 = builder::tsweep(&v, Vector3::new(width, 0.0, 0.0));
        let face0 = builder::tsweep(&edge0, Vector3::new(0.0, height, 0.0));
        let solid = builder::tsweep(&face0, Vector3::new(0.0, 0.0, depth));
        
        Ok(solid)
    }
    
    fn extrude_polygon(&self, polygon: &Polygon2D, params: &ExtrudeParams) -> KernelResult<Self::Solid> {
        if polygon.exterior.len() < 3 {
            return Err(KernelOpError::InvalidGeometry(
                "Polygon must have at least 3 vertices".into()
            ));
        }
        
        // Build the exterior wire - detect if it's a circle
        let exterior_wire = if let Some((cx, cy, radius)) = detect_circle_2d(&polygon.exterior, self.tolerance) {
            println!("[extrude_polygon] Detected exterior CIRCLE: center=({:.2}, {:.2}), radius={:.2}", cx, cy, radius);
            self.build_circle_wire(cx, cy, radius)?
        } else {
            self.build_wire_from_points(&polygon.exterior)?
        };
        
        // Create the face
        let face = if polygon.interiors.is_empty() {
            builder::try_attach_plane(&[exterior_wire])
                .map_err(|e| KernelOpError::OperationFailed(format!("Failed to create face: {:?}", e)))?
        } else {
            // Build wires for all holes - also check for circles
            let mut all_wires = vec![exterior_wire];
            for (i, hole) in polygon.interiors.iter().enumerate() {
                if hole.len() >= 3 {
                    let hole_wire = if let Some((cx, cy, radius)) = detect_circle_2d(hole, self.tolerance) {
                        println!("[extrude_polygon] Detected hole {} CIRCLE: center=({:.2}, {:.2}), radius={:.2}", i, cx, cy, radius);
                        // Holes need clockwise winding (opposite to exterior)
                        self.build_circle_wire_cw(cx, cy, radius, true)?
                    } else {
                        self.build_wire_from_points(hole)?
                    };
                    all_wires.push(hole_wire);
                }
            }
            builder::try_attach_plane(&all_wires)
                .map_err(|e| KernelOpError::OperationFailed(format!("Failed to create face with holes: {:?}", e)))?
        };
        
        // Calculate extrusion vector
        let dir = params.direction.normalize();
        let extrusion_vec = Vector3::new(
            dir.x * params.distance,
            dir.y * params.distance, 
            dir.z * params.distance,
        );
        
        // Sweep to create solid
        let solid = builder::tsweep(&face, extrusion_vec);
        
        Ok(solid)
    }
    
    fn revolve_profile(&self, profile: &[Point2D], params: &RevolveParams) -> KernelResult<Self::Solid> {
        // 1. Build wire from profile points
        let wire = self.build_wire_from_points(profile)?;

        // 2. Create face (requires planar, closed wire)
        let face = builder::try_attach_plane(&[wire])
             .map_err(|e| KernelOpError::OperationFailed(format!("Failed to create face for revolution: {:?}", e)))?;

        // 3. Setup axis
        let (origin, axis) = match params.axis {
             RevolveAxis::X => (Point3::origin(), Vector3::unit_x()),
             RevolveAxis::Y => (Point3::origin(), Vector3::unit_y()),
             RevolveAxis::Z => (Point3::origin(), Vector3::unit_z()),
             RevolveAxis::Custom { origin, direction } => (
                 Point3::new(origin.x, origin.y, origin.z),
                 Vector3::new(direction.x, direction.y, direction.z).normalize(),
             ),
        };

        // 4. Revolve
        // params.angle is in radians.
        let solid = builder::rsweep(&face, origin, axis, Rad(params.angle));
        
        Ok(solid)
    }
    
    fn tessellate(&self, solid: &Self::Solid) -> KernelResult<TriangleMesh> {
        // Use truck-meshalgo to triangulate the solid
        // triangulation returns a Solid<Point3, PolylineCurve, Option<PolygonMesh>>
        // where each face has an Option<PolygonMesh> instead of Surface
        let meshed_solid = solid.triangulation(self.tolerance);
        
        // Collect all meshes from all faces into one unified mesh
        let mut mesh = TriangleMesh::new();
        let mut vertex_offset: u32 = 0;
        let mut face_id: u32 = 0;
        
        // Iterate through all shells in the solid
        for shell in meshed_solid.boundaries() {
            // Iterate through all faces in the shell
            // Each iteration of face_iter() gives a topological face
            for face in shell.face_iter() {
                if let Some(polygon_mesh) = face.surface() {
                    // Get positions from this face's mesh
                    let positions = polygon_mesh.positions();
                    for pos in positions.iter() {
                        mesh.add_vertex(Point3D::new(pos.x, pos.y, pos.z));
                    }
                    
                    // Get triangles - all triangles in this loop belong to the same topological face
                    for tri in polygon_mesh.tri_faces() {
                        mesh.add_triangle_with_face(
                            vertex_offset + tri[0].pos as u32,
                            vertex_offset + tri[1].pos as u32,
                            vertex_offset + tri[2].pos as u32,
                            face_id,
                        );
                    }
                    
                    vertex_offset += positions.len() as u32;
                }
                // Increment face_id for each topological face (whether it had mesh data or not)
                face_id += 1;
            }
        }
        
        Ok(mesh)
    }
    
    fn mesh_to_tessellation(
        &self,
        mesh: &TriangleMesh,
        tessellation: &mut Tessellation,
        topology_manifest: &mut HashMap<TopoId, KernelEntity>,
        ctx: &NamingContext,
        base_name: &str,
    ) {
        // This is adapted from the original add_mesh_to_tessellation
        // but works with our TriangleMesh type instead
        
        let positions = &mesh.positions;
        let triangles = &mesh.triangles;
        
        if positions.is_empty() || triangles.is_empty() {
            return;
        }
        
        // Track vertex degrees for feature vertex detection
        let mut vertex_feature_degree = vec![0usize; positions.len()];
        
        // 1. Compute triangle normals
        let mut triangle_normals: Vec<[f64; 3]> = Vec::with_capacity(triangles.len());
        for (i0, i1, i2) in triangles {
            let p0 = &positions[*i0 as usize];
            let p1 = &positions[*i1 as usize];
            let p2 = &positions[*i2 as usize];
            
            let u = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
            let v = [p2.x - p0.x, p2.y - p0.y, p2.z - p0.z];
            
            let nx = u[1] * v[2] - u[2] * v[1];
            let ny = u[2] * v[0] - u[0] * v[2];
            let nz = u[0] * v[1] - u[1] * v[0];
            
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            let normal = if len < 1e-6 { 
                [0.0, 0.0, 1.0] 
            } else { 
                [nx / len, ny / len, nz / len] 
            };
            triangle_normals.push(normal);
        }
        
        // 2. Build edge adjacency
        let mut edge_map: HashMap<(usize, usize), Vec<usize>> = HashMap::new();
        for (tri_idx, (i0, i1, i2)) in triangles.iter().enumerate() {
            let indices = [*i0 as usize, *i1 as usize, *i2 as usize];
            for k in 0..3 {
                let v1 = indices[k];
                let v2 = indices[(k + 1) % 3];
                let key = if v1 < v2 { (v1, v2) } else { (v2, v1) };
                edge_map.entry(key).or_default().push(tri_idx);
            }
        }
        
        // 3. Determine face grouping
        // If the mesh has topological face IDs from kernel, use those directly
        // Otherwise, fall back to Union-Find based on normal smoothness
        let num_tris = triangles.len();
        let use_face_ids = mesh.has_face_ids();
        
        // Debug: Log face ID usage
        if use_face_ids {
            let unique_face_ids: std::collections::HashSet<_> = mesh.face_ids.iter().cloned().collect();
            println!("[mesh_to_tessellation] Using {} topological face IDs for {} triangles", 
                     unique_face_ids.len(), num_tris);
        } else {
            println!("[mesh_to_tessellation] No face_ids, using normal-based grouping for {} triangles", num_tris);
        }
        
        // For Union-Find fallback
        let mut parent: Vec<usize> = (0..num_tris).collect();
        
        fn find(i: usize, parent: &mut [usize]) -> usize {
            let mut i = i;
            while i != parent[i] {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            i
        }
        
        fn union(i: usize, j: usize, parent: &mut [usize]) {
            let ri = find(i, parent);
            let rj = find(j, parent);
            if ri != rj {
                if ri < rj { parent[rj] = ri; } else { parent[ri] = rj; }
            }
        }
        
        // Step 3a: Normal-based Union-Find (only if no face IDs)
        if !use_face_ids {
            let smoothness_threshold = 0.766; // ~40 degrees
            
            for neighbors in edge_map.values() {
                if neighbors.len() == 2 {
                    let n1 = triangle_normals[neighbors[0]];
                    let n2 = triangle_normals[neighbors[1]];
                    let dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
                    if dot > smoothness_threshold {
                        union(neighbors[0], neighbors[1], &mut parent);
                    }
                }
            }
        }
        
        // Step 3b: Merge cylindrical faces (scope remap outside)
        let mut face_id_remap: HashMap<u32, u32> = HashMap::new();
        
        // When using kernel face IDs, adjacent faces with the same cylindrical axis should be merged
        // This handles Truck's tendency to split circles into multiple edges/faces
        if use_face_ids {
            // Collect vertices per face group
            let mut face_group_vertices: HashMap<u32, Vec<[f64; 3]>> = HashMap::new();
            for (tri_idx, (i0, i1, i2)) in triangles.iter().enumerate() {
                let face_id = mesh.face_ids[tri_idx];
                let entry = face_group_vertices.entry(face_id).or_default();
                entry.push([positions[*i0 as usize].x, positions[*i0 as usize].y, positions[*i0 as usize].z]);
                entry.push([positions[*i1 as usize].x, positions[*i1 as usize].y, positions[*i1 as usize].z]);
                entry.push([positions[*i2 as usize].x, positions[*i2 as usize].y, positions[*i2 as usize].z]);
            }
            
            // Detect cylindrical faces and their axis/radius
            // A face is cylindrical if all vertices lie at constant distance from a line (axis)
            let mut face_cylinder_info: HashMap<u32, Option<([f64; 3], [f64; 3], f64)>> = HashMap::new(); // (axis_point, axis_dir, radius)
            
            for (&face_id, vertices) in &face_group_vertices {
                let result = detect_cylinder_from_vertices(vertices);
                println!("[DEBUG] Face {} ({} verts): cylinder={:?}", face_id, vertices.len(), result.is_some());
                if let Some((center, axis, radius)) = &result {
                    println!("[DEBUG]   center={:?}, axis={:?}, radius={:.3}", center, axis, radius);
                }
                face_cylinder_info.insert(face_id, result);
            }
            
            // Build adjacency between face groups based on SPATIAL proximity
            // (since Truck tessellation doesn't share vertices across topological faces)
            // Two face groups are adjacent if any of their vertices are within tolerance of each other
            let mut face_group_adjacency: HashMap<(u32, u32), bool> = HashMap::new();
            let face_ids: Vec<u32> = face_group_vertices.keys().cloned().collect();
            
            for i in 0..face_ids.len() {
                for j in (i+1)..face_ids.len() {
                    let fid1 = face_ids[i];
                    let fid2 = face_ids[j];
                    let verts1 = &face_group_vertices[&fid1];
                    let verts2 = &face_group_vertices[&fid2];
                    
                    // Check if any vertex in group 1 is within tolerance of any vertex in group 2
                    // Use a larger tolerance since vertices at seams might not be exactly coincident
                    let prox_tolerance = 0.1; // 0.1 units for vertex proximity
                    let mut is_adjacent = false;
                    
                    // Sample more vertices for better coverage (every 10th, up to 200)
                    let step1 = (verts1.len() / 200).max(1);
                    let step2 = (verts2.len() / 200).max(1);
                    let sample1: Vec<_> = verts1.iter().step_by(step1).collect();
                    let sample2: Vec<_> = verts2.iter().step_by(step2).collect();
                    
                    'outer: for v1 in &sample1 {
                        for v2 in &sample2 {
                            let dist = ((v1[0] - v2[0]).powi(2) + (v1[1] - v2[1]).powi(2) + (v1[2] - v2[2]).powi(2)).sqrt();
                            if dist < prox_tolerance {
                                is_adjacent = true;
                                break 'outer;
                            }
                        }
                    }
                    
                    if is_adjacent {
                        let key = if fid1 < fid2 { (fid1, fid2) } else { (fid2, fid1) };
                        face_group_adjacency.insert(key, true);
                    }
                }
            }
            
            println!("[DEBUG] Found {} adjacent face pairs (spatial proximity)", face_group_adjacency.len());
            
            // Instead of detecting cylinders geometrically, use average normals
            // Compute average normal per face group from triangle normals
            let mut face_avg_normals: HashMap<u32, [f64; 3]> = HashMap::new();
            let mut face_tri_count: HashMap<u32, usize> = HashMap::new();
            
            for (tri_idx, _) in triangles.iter().enumerate() {
                let face_id = mesh.face_ids[tri_idx];
                let normal = triangle_normals[tri_idx];
                
                let entry = face_avg_normals.entry(face_id).or_insert([0.0, 0.0, 0.0]);
                entry[0] += normal[0];
                entry[1] += normal[1];
                entry[2] += normal[2];
                *face_tri_count.entry(face_id).or_insert(0) += 1;
            }
            
            // Normalize the average normals
            for (&face_id, normal) in &mut face_avg_normals {
                let count = face_tri_count[&face_id] as f64;
                normal[0] /= count;
                normal[1] /= count;
                normal[2] /= count;
                let len = (normal[0].powi(2) + normal[1].powi(2) + normal[2].powi(2)).sqrt();
                if len > 1e-6 {
                    normal[0] /= len;
                    normal[1] /= len;
                    normal[2] /= len;
                }
            }
            
            // Find faces that are cylindrical (normals perpendicular to Y axis) and compute their average radius
            let mut is_cylindrical: HashMap<u32, bool> = HashMap::new();
            let mut face_avg_radius: HashMap<u32, f64> = HashMap::new();
            
            for (&face_id, normal) in &face_avg_normals {
                // Cylindrical if normal is perpendicular to Y (n.y close to 0)
                let y_perp = normal[1].abs() < 0.3;
                is_cylindrical.insert(face_id, y_perp);
                
                // Compute average radius from axis (Y axis) for cylindrical faces
                if y_perp {
                    if let Some(verts) = face_group_vertices.get(&face_id) {
                        let mut sum_radius = 0.0;
                        let mut count = 0;
                        for v in verts {
                            // Distance from Y axis (at origin in X-Z plane)
                            let r = (v[0].powi(2) + v[2].powi(2)).sqrt();
                            sum_radius += r;
                            count += 1;
                        }
                        if count > 0 {
                            let avg_r = sum_radius / count as f64;
                            face_avg_radius.insert(face_id, avg_r);
                            println!("[DEBUG] Face {} avg_radius = {:.3}", face_id, avg_r);
                        }
                    }
                }
            }
            
            // Build a map of: for each flat face, which cylindrical faces are adjacent to it
            let mut flat_face_neighbors: HashMap<u32, Vec<u32>> = HashMap::new();
            
            for (&(fid1, fid2), _) in &face_group_adjacency {
                let cyl1 = *is_cylindrical.get(&fid1).unwrap_or(&false);
                let cyl2 = *is_cylindrical.get(&fid2).unwrap_or(&false);
                
                // If one is cylindrical and the other is flat, record the relationship
                if cyl1 && !cyl2 {
                    flat_face_neighbors.entry(fid2).or_default().push(fid1);
                } else if cyl2 && !cyl1 {
                    flat_face_neighbors.entry(fid1).or_default().push(fid2);
                }
            }
            
            // For each flat face, group its cylindrical neighbors by radius and merge each group
            for (&flat_face, neighbors) in &flat_face_neighbors {
                if neighbors.len() < 2 {
                    continue;
                }
                
                println!("[DEBUG] Flat face {} has {} cylindrical neighbors: {:?}", flat_face, neighbors.len(), neighbors);
                
                // Group neighbors by radius (10% tolerance)
                let mut radius_groups: Vec<(f64, Vec<u32>)> = Vec::new();
                
                for &neighbor in neighbors {
                    let r = *face_avg_radius.get(&neighbor).unwrap_or(&0.0);
                    
                    // Find existing group with similar radius
                    let mut found = false;
                    for (group_r, group_faces) in &mut radius_groups {
                        let tolerance = group_r.abs() * 0.1;
                        if (r - *group_r).abs() < tolerance.max(0.5) {
                            group_faces.push(neighbor);
                            found = true;
                            break;
                        }
                    }
                    
                    if !found {
                        radius_groups.push((r, vec![neighbor]));
                    }
                }
                
                // Merge faces within each radius group
                for (group_r, group_faces) in &radius_groups {
                    if group_faces.len() < 2 {
                        continue;
                    }
                    
                    println!("[DEBUG]   Radius group {:.3} has {} faces: {:?}", group_r, group_faces.len(), group_faces);
                    
                    let target = *group_faces.iter().min().unwrap();
                    let final_target = *face_id_remap.get(&target).unwrap_or(&target);
                    
                    for &neighbor in group_faces {
                        if neighbor != target {
                            face_id_remap.insert(neighbor, final_target);
                            println!("[DEBUG]     MERGING {} -> {} (radius group {:.3})", neighbor, final_target, group_r);
                        }
                    }
                }
            }
            
            if !face_id_remap.is_empty() {
                println!("[mesh_to_tessellation] Merged {} cylindrical face groups", face_id_remap.len());
            } else {
                println!("[mesh_to_tessellation] No cylindrical face groups merged");
            }
        }
        
        // Helper function to remap face IDs
        fn remap_face_id(orig_id: u32, remap: &HashMap<u32, u32>) -> u32 {
            let mut id = orig_id;
            while let Some(&remapped) = remap.get(&id) {
                id = remapped;
            }
            id
        }
        
        // 4. Compute smooth normals per (vertex, face-group)
        let mut vertex_smooth_normals: HashMap<(usize, usize), [f64; 3]> = HashMap::new();
        for (tri_idx, (i0, i1, i2)) in triangles.iter().enumerate() {
            let root = if use_face_ids { 
                remap_face_id(mesh.face_ids[tri_idx], &face_id_remap) as usize 
            } else { 
                find(tri_idx, &mut parent) 
            };
            let normal = triangle_normals[tri_idx];
            for &v_idx in &[*i0 as usize, *i1 as usize, *i2 as usize] {
                let entry = vertex_smooth_normals.entry((v_idx, root)).or_insert([0.0, 0.0, 0.0]);
                entry[0] += normal[0];
                entry[1] += normal[1];
                entry[2] += normal[2];
            }
        }
        
        for n in vertex_smooth_normals.values_mut() {
            let len = (n[0]*n[0] + n[1]*n[1] + n[2]*n[2]).sqrt();
            if len > 1e-6 { n[0] /= len; n[1] /= len; n[2] /= len; }
        }
        
        // 5. Generate TopoIds for face groups and add triangles
        let mut group_id_map: HashMap<usize, TopoId> = HashMap::new();
        
        for (tri_idx, (i0, i1, i2)) in triangles.iter().enumerate() {
            let root = if use_face_ids { 
                remap_face_id(mesh.face_ids[tri_idx], &face_id_remap) as usize 
            } else { 
                find(tri_idx, &mut parent) 
            };
            
            let face_id = *group_id_map.entry(root).or_insert_with(|| {
                // Use this triangle's normal for the face (first one encountered in group)
                let n = triangle_normals[tri_idx];
                
                // When using topological face IDs, don't include normal in seed
                // (curved surfaces have varying normals but should be one face)
                // When using normal-based grouping, include normal for stable face IDs
                let seed = if use_face_ids {
                    format!("{}_Face_{}", base_name, root)
                } else {
                    let q = [(n[0] * 100.0) as i64, (n[1] * 100.0) as i64, (n[2] * 100.0) as i64];
                    format!("{}_Face_{}_{}_{}_{}", base_name, root, q[0], q[1], q[2])
                };
                let id = ctx.derive(&seed, TopoRank::Face);
                
                let p0 = &positions[*i0 as usize];
                let entity = KernelEntity {
                    id,
                    geometry: AnalyticGeometry::Plane {
                        origin: [p0.x, p0.y, p0.z],
                        normal: n,
                    },
                };
                topology_manifest.insert(id, entity);
                id
            });
            
            let p0 = &positions[*i0 as usize];
            let p1 = &positions[*i1 as usize];
            let p2 = &positions[*i2 as usize];
            
            let default_n = [0.0, 1.0, 0.0];
            let n0 = vertex_smooth_normals.get(&(*i0 as usize, root)).unwrap_or(&default_n);
            let n1 = vertex_smooth_normals.get(&(*i1 as usize, root)).unwrap_or(&default_n);
            let n2 = vertex_smooth_normals.get(&(*i2 as usize, root)).unwrap_or(&default_n);
            
            tessellation.add_triangle_with_normals(
                GeoPoint3::new(p0.x, p0.y, p0.z),
                GeoPoint3::new(p1.x, p1.y, p1.z),
                GeoPoint3::new(p2.x, p2.y, p2.z),
                GeoVector3::new(n0[0], n0[1], n0[2]),
                GeoVector3::new(n1[0], n1[1], n1[2]),
                GeoVector3::new(n2[0], n2[1], n2[2]),
                face_id,
            );
        }
        
        // 6. Extract feature edges
        // Use position-based edge keys to handle the case where Truck tessellation 
        // doesn't share vertices across topological faces (seam edges have different indices
        // but same positions, so we need to compare by position)
        let mut edge_groups: HashMap<(usize, usize), TopoId> = HashMap::new();
        
        // Helper: quantize position to grid for comparison
        fn pos_key(p: &super::types::Point3D) -> (i64, i64, i64) {
            let scale = 10000.0; // 0.0001 precision
            ((p.x * scale).round() as i64, (p.y * scale).round() as i64, (p.z * scale).round() as i64)
        }
        
        // Build position-based edge map: Map edge (by position pair) -> list of (vertex index pair, face root)
        let mut pos_edge_faces: HashMap<((i64, i64, i64), (i64, i64, i64)), Vec<((usize, usize), usize)>> = HashMap::new();
        // Track feature vertex degree by position (for corner detection)
        let mut position_feature_degree: HashMap<(i64, i64, i64), usize> = HashMap::new();
        
        for ((v1, v2), neighbors) in &edge_map {
            let p1 = &positions[*v1];
            let p2 = &positions[*v2];
            let pk1 = pos_key(p1);
            let pk2 = pos_key(p2);
            let pos_key_pair = if pk1 < pk2 { (pk1, pk2) } else { (pk2, pk1) };
            
            // Get the face root for this edge
            let root = if use_face_ids {
                remap_face_id(mesh.face_ids[neighbors[0]], &face_id_remap) as usize
            } else {
                find(neighbors[0], &mut parent)
            };
            
            pos_edge_faces.entry(pos_key_pair).or_default().push(((*v1, *v2), root));
        }
        
        // Now for each position-based edge, check all face roots that share it
        for (pos_key_pair, edges) in &pos_edge_faces {
            // Collect all unique face roots for this positional edge
            let roots: std::collections::HashSet<usize> = edges.iter().map(|(_, r)| *r).collect();
            
            if roots.len() < 2 {
                // All edges at this position belong to the same face group - INTERNAL edge, skip it
                continue;
            }
            
            // Edge is between different face groups - add it
            let (v1, v2) = edges[0].0;
            let p1 = &positions[v1];
            let p2 = &positions[v2];
            
            // Get the two unique roots for edge identification
            let mut roots_vec: Vec<usize> = roots.into_iter().collect();
            roots_vec.sort();
            let (root1, root2) = (roots_vec[0], roots_vec[1]);
            
            // Track feature degree by POSITION, not vertex index
            let pk1 = pos_key(p1);
            let pk2 = pos_key(p2);
            *position_feature_degree.entry(pk1).or_insert(0) += 1;
            *position_feature_degree.entry(pk2).or_insert(0) += 1;
            
            let edge_id = *edge_groups.entry((root1, root2)).or_insert_with(|| {
                let seed = format!("{}_Edge_{}_{}", base_name, root1, root2);
                let id = ctx.derive(&seed, TopoRank::Edge);
                
                let entity = KernelEntity {
                    id,
                    geometry: AnalyticGeometry::Line {
                        start: [p1.x, p1.y, p1.z],
                        end: [p2.x, p2.y, p2.z],
                    },
                };
                topology_manifest.insert(id, entity);
                id
            });
            
            tessellation.add_line(
                GeoPoint3::new(p1.x, p1.y, p1.z),
                GeoPoint3::new(p2.x, p2.y, p2.z),
                edge_id,
            );
        }
        
        // 7. Extract feature vertices (corners) - using position-based degree
        // A vertex is a corner if it's on a boundary (degree 1) or at a T-junction (degree 3+)
        // Vertices with degree 2 are just points on an edge, not corners
        let mut added_vertex_positions: std::collections::HashSet<(i64, i64, i64)> = std::collections::HashSet::new();
        for (&pk, &degree) in &position_feature_degree {
            if degree > 0 && degree != 2 && !added_vertex_positions.contains(&pk) {
                added_vertex_positions.insert(pk);
                // Find a vertex at this position
                for (i, p) in positions.iter().enumerate() {
                    if pos_key(p) == pk {
                        let v_id = ctx.derive(&format!("{}_V_{}", base_name, i), TopoRank::Vertex);
                        tessellation.add_point(GeoPoint3::new(p.x, p.y, p.z), v_id);
                        break;
                    }
                }
            }
        }
    }
    
    // === Boolean Operations ===
    
    fn boolean_union(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid> {
        truck_shapeops::or(solid_a, solid_b, self.tolerance)
            .ok_or_else(|| KernelOpError::OperationFailed("Boolean union failed".into()))
    }
    
    fn boolean_intersect(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid> {
        truck_shapeops::and(solid_a, solid_b, self.tolerance)
            .ok_or_else(|| KernelOpError::OperationFailed("Boolean intersection failed".into()))
    }
    
    fn boolean_subtract(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid> {
        // Subtraction is: A - B = A AND (NOT B)
        // Solid::not() mutates in place, so we clone first
        let mut complement_b = solid_b.clone();
        complement_b.not();
        truck_shapeops::and(solid_a, &complement_b, self.tolerance)
            .ok_or_else(|| KernelOpError::OperationFailed("Boolean subtraction failed".into()))
    }
    
    // === STEP File I/O ===
    
    fn export_step(&self, solid: &Self::Solid) -> KernelResult<String> {
        use truck_stepio::out::{CompleteStepDisplay, StepHeaderDescriptor, StepModels};
        // Solid::compress() is an inherent method, no trait import needed
        
        // 1. Compress the solid (required for STEP export)
        let compressed = solid.compress();
        
        // 2. Create StepModels from the compressed solid
        // StepModels implements FromIterator for &CompressedSolid
        let models: StepModels<_, _, _> = std::iter::once(&compressed).collect();
        
        // 3. Create header
        let header = StepHeaderDescriptor {
            file_name: "truck_export.step".to_string(),
            time_stamp: "2024-01-01T00:00:00".to_string(), 
            authors: vec!["Antigravity User".to_string()],
            organization: vec!["Antigravity CAD".to_string()],
            organization_system: "truck".to_string(),
            authorization: "".to_string(),
        };
        
        // 4. Create display and convert to string
        let display = CompleteStepDisplay::new(models, header);
        Ok(display.to_string())
    }
    
    fn import_step(&self, _step_data: &str) -> KernelResult<Vec<Self::Solid>> {
        // Truck v0.3 StepIO import is incomplete for solids (ManifoldSolidBrep not supported)
        Err(KernelOpError::NotImplemented(
            "STEP import is not yet supported in Truck v0.3".into()
        ))
    }
}

impl TruckKernel {
    /// Build a truck Wire from 2D points (as 3D with z=0).
    fn build_wire_from_points(&self, points: &[Point2D]) -> KernelResult<Wire> {
        if points.len() < 3 {
            return Err(KernelOpError::InvalidGeometry(
                "Wire requires at least 3 points".into()
            ));
        }
        
        let mut vertices: Vec<Vertex> = points
            .iter()
            .map(|p| builder::vertex(Point3::new(p.x, p.y, 0.0)))
            .collect();
        
        // Close the loop
        vertices.push(vertices[0].clone());
        
        let mut edges = Vec::with_capacity(vertices.len() - 1);
        for i in 0..vertices.len() - 1 {
            edges.push(builder::line(&vertices[i], &vertices[i + 1]));
        }
        
        let wire = Wire::from_iter(edges);
        Ok(wire)
    }
    
    /// Build a circular wire using rsweep (rotational sweep of a vertex).
    /// This creates a true circle/arc edge, preserving cylindrical topology on extrusion.
    fn build_circle_wire(&self, cx: f64, cy: f64, radius: f64) -> KernelResult<Wire> {
        self.build_circle_wire_cw(cx, cy, radius, false)
    }
    
    /// Build a circular wire with optional clockwise winding.
    /// clockwise=true for holes (opposite to exterior CCW winding).
    fn build_circle_wire_cw(&self, cx: f64, cy: f64, radius: f64, clockwise: bool) -> KernelResult<Wire> {
        use std::f64::consts::PI;
        
        // Create a vertex at radius distance from center (on the positive X side)
        let start_point = Point3::new(cx + radius, cy, 0.0);
        let center_point = Point3::new(cx, cy, 0.0);
        
        let v: Vertex = builder::vertex(start_point);
        
        // Sweep the vertex around the center point
        // Truck requires angle > 2π for closed shapes (2π ≈ 6.28, so use 7.0)
        // Use negative angle for clockwise (hole) winding
        let angle = if clockwise { -7.0 } else { 7.0 };
        let circle_wire: Wire = builder::rsweep(
            &v,
            center_point,
            Vector3::new(0.0, 0.0, 1.0),  // Axis perpendicular to XY plane
            Rad(angle),
        );
        
        Ok(circle_wire)
    }
}
