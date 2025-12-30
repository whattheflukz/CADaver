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
        
        // Build the exterior wire
        let exterior_wire = self.build_wire_from_points(&polygon.exterior)?;
        
        // Create the face
        let face = if polygon.interiors.is_empty() {
            builder::try_attach_plane(&[exterior_wire])
                .map_err(|e| KernelOpError::OperationFailed(format!("Failed to create face: {:?}", e)))?
        } else {
            // Build wires for all holes
            let mut all_wires = vec![exterior_wire];
            for hole in &polygon.interiors {
                if hole.len() >= 3 {
                    all_wires.push(self.build_wire_from_points(hole)?);
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
        
        // Iterate through all shells in the solid
        for shell in meshed_solid.boundaries() {
            // Iterate through all faces in the shell
            for face in shell.face_iter() {
                if let Some(polygon_mesh) = face.surface() {
                    // Get positions from this face's mesh
                    let positions = polygon_mesh.positions();
                    for pos in positions.iter() {
                        mesh.add_vertex(Point3D::new(pos.x, pos.y, pos.z));
                    }
                    
                    // Get triangles (tri_faces returns an iterator of vertex index arrays)
                    for tri in polygon_mesh.tri_faces() {
                        mesh.add_triangle(
                            vertex_offset + tri[0].pos as u32,
                            vertex_offset + tri[1].pos as u32,
                            vertex_offset + tri[2].pos as u32,
                        );
                    }
                    
                    vertex_offset += positions.len() as u32;
                }
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
        // This is adapted from the original add_microcad_mesh_to_tessellation
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
        
        // 3. Union-Find for face grouping based on smoothness
        let num_tris = triangles.len();
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
        
        // 4. Compute smooth normals per (vertex, face-group)
        let mut vertex_smooth_normals: HashMap<(usize, usize), [f64; 3]> = HashMap::new();
        for (tri_idx, (i0, i1, i2)) in triangles.iter().enumerate() {
            let root = find(tri_idx, &mut parent);
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
            let root = find(tri_idx, &mut parent);
            
            let face_id = *group_id_map.entry(root).or_insert_with(|| {
                let n = triangle_normals[root];
                let q = [(n[0] * 100.0) as i64, (n[1] * 100.0) as i64, (n[2] * 100.0) as i64];
                let seed = format!("{}_Face_{}_{}_{}_{}", base_name, root, q[0], q[1], q[2]);
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
        let mut edge_groups: HashMap<(usize, usize), TopoId> = HashMap::new();
        
        for ((v1, v2), neighbors) in &edge_map {
            let (root1, root2) = if neighbors.len() != 2 {
                (find(neighbors[0], &mut parent), usize::MAX)
            } else {
                let r1 = find(neighbors[0], &mut parent);
                let r2 = find(neighbors[1], &mut parent);
                if r1 < r2 { (r1, r2) } else { (r2, r1) }
            };
            
            if root1 != root2 {
                vertex_feature_degree[*v1] += 1;
                vertex_feature_degree[*v2] += 1;
                
                let edge_id = *edge_groups.entry((root1, root2)).or_insert_with(|| {
                    let seed = format!("{}_Edge_{}_{}", base_name, root1, root2);
                    let id = ctx.derive(&seed, TopoRank::Edge);
                    
                    let p1 = &positions[*v1];
                    let p2 = &positions[*v2];
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
                
                let p1 = &positions[*v1];
                let p2 = &positions[*v2];
                tessellation.add_line(
                    GeoPoint3::new(p1.x, p1.y, p1.z),
                    GeoPoint3::new(p2.x, p2.y, p2.z),
                    edge_id,
                );
            }
        }
        
        // 7. Extract feature vertices (corners)
        for (i, degree) in vertex_feature_degree.iter().enumerate() {
            if *degree > 0 && *degree != 2 {
                let p = &positions[i];
                let v_id = ctx.derive(&format!("{}_V_{}", base_name, i), TopoRank::Vertex);
            tessellation.add_point(GeoPoint3::new(p.x, p.y, p.z), v_id);
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
}
