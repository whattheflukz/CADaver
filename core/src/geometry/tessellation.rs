use super::{Point3, Vector3};
use crate::topo::naming::TopoId;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Tessellation {
    pub vertices: Vec<f32>, // Flattened x, y, z
    pub indices: Vec<u32>,  // Triangle indices
    pub normals: Vec<f32>,  // Flattened nx, ny, nz
    pub triangle_ids: Vec<TopoId>, // Maps triangle index -> TopoId
    
    // Line support for Sketches/Edges
    pub line_indices: Vec<u32>, // Pairs of indices into vertices
    pub line_ids: Vec<TopoId>, // Maps line segment index -> TopoId
    
    // Point support for Vertices
    pub point_indices: Vec<u32>, // Indices into vertices
    pub point_ids: Vec<TopoId>, // Maps point index -> TopoId
    
    // Maps TopoId feature_id (EntityId string) -> FeatureGraph node UUID string
    // This enables the frontend to map from viewport selections back to feature nodes
    #[serde(default)]
    pub feature_id_map: HashMap<String, String>,
}

impl Tessellation {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_triangle(&mut self, p1: Point3, p2: Point3, p3: Point3, id: TopoId) {
        let idx = (self.vertices.len() / 3) as u32;
        
        // Add vertices
        self.vertices.push(p1.x as f32); self.vertices.push(p1.y as f32); self.vertices.push(p1.z as f32);
        self.vertices.push(p2.x as f32); self.vertices.push(p2.y as f32); self.vertices.push(p2.z as f32);
        self.vertices.push(p3.x as f32); self.vertices.push(p3.y as f32); self.vertices.push(p3.z as f32);

        // Add indices
        self.indices.push(idx);
        self.indices.push(idx + 1);
        self.indices.push(idx + 2);

        // Compute flat normal (very basic)
        let v1 = p2 - p1;
        let v2 = p3 - p1;
        let normal = v1.cross(&v2).normalize();
        
        // Add normals for each vertex (flat shading style for now)
        for _ in 0..3 {
            self.normals.push(normal.x as f32);
            self.normals.push(normal.y as f32);
            self.normals.push(normal.z as f32);
        }
        
        self.triangle_ids.push(id);
    }

    pub fn add_triangle_with_normals(&mut self, p1: Point3, p2: Point3, p3: Point3, n1: Vector3, n2: Vector3, n3: Vector3, id: TopoId) {
        let idx = (self.vertices.len() / 3) as u32;
        
        // Add vertices
        self.vertices.push(p1.x as f32); self.vertices.push(p1.y as f32); self.vertices.push(p1.z as f32);
        self.vertices.push(p2.x as f32); self.vertices.push(p2.y as f32); self.vertices.push(p2.z as f32);
        self.vertices.push(p3.x as f32); self.vertices.push(p3.y as f32); self.vertices.push(p3.z as f32);

        // Add indices
        self.indices.push(idx);
        self.indices.push(idx + 1);
        self.indices.push(idx + 2);

        // Add explicit vertex normals
        self.normals.push(n1.x as f32); self.normals.push(n1.y as f32); self.normals.push(n1.z as f32);
        self.normals.push(n2.x as f32); self.normals.push(n2.y as f32); self.normals.push(n2.z as f32);
        self.normals.push(n3.x as f32); self.normals.push(n3.y as f32); self.normals.push(n3.z as f32);
        
        self.triangle_ids.push(id);
    }

    pub fn add_line(&mut self, p1: Point3, p2: Point3, id: TopoId) {
       let idx = (self.vertices.len() / 3) as u32;

       // Add vertices
       self.vertices.push(p1.x as f32); self.vertices.push(p1.y as f32); self.vertices.push(p1.z as f32);
       self.vertices.push(p2.x as f32); self.vertices.push(p2.y as f32); self.vertices.push(p2.z as f32);

       // Add indices for line
       self.line_indices.push(idx);
       self.line_indices.push(idx + 1);
       
       // Lines don't strictly need normals for basic rendering, but to keep arrays aligned implies equal length?
       // Three.js BufferGeometry handles different attributes separately. 
       // But if we reuse 'position' attribute with 'vertices', we need to be careful.
       // Yes, we are appending to the SAME 'vertices' vector. 
       // So we should probably add dummy normals to keep 'normal' attribute length matching 'position' length if interleaved,
       // but here they are separate arrays.
       // Three.js doesn't enforce normals if we only use a LineMaterial, but if we mix in same buffer...
       // Generally safer to pad normals with zeros.
       for _ in 0..2 {
           self.normals.push(0.0); self.normals.push(1.0); self.normals.push(0.0);
       }

       self.line_ids.push(id);
    }

    pub fn add_point(&mut self, p: Point3, id: TopoId) {
        let idx = (self.vertices.len() / 3) as u32;

        // Add vertex
        self.vertices.push(p.x as f32); self.vertices.push(p.y as f32); self.vertices.push(p.z as f32);

        // Add index
        self.point_indices.push(idx);

        // Pad normal (arbitrary up vector)
        self.normals.push(0.0); self.normals.push(1.0); self.normals.push(0.0);

        self.point_ids.push(id);
    }
}

/// Triangulate a 2D polygon using ear-clipping algorithm.
/// Works for both convex and concave simple polygons.
/// Returns a list of triangle indices (i, j, k) into the input polygon.
pub fn ear_clip_triangulate(polygon: &[[f64; 2]]) -> Vec<(usize, usize, usize)> {
    let n = polygon.len();
    if n < 3 {
        return vec![];
    }
    
    // Create index list
    let mut indices: Vec<usize> = (0..n).collect();
    let mut triangles = Vec::new();
    
    // Helper: compute signed area of triangle
    fn signed_area(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> f64 {
        (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
    }
    
    // Determine overall polygon winding (positive = CCW, negative = CW)
    let mut total_signed_area = 0.0;
    for i in 0..n {
        let a = polygon[i];
        let b = polygon[(i + 1) % n];
        total_signed_area += (b[0] - a[0]) * (b[1] + a[1]);
    }
    let is_ccw = total_signed_area < 0.0;
    
    println!("[EAR_CLIP] n={}, total_signed_area={:.6}, is_ccw={}", n, total_signed_area, is_ccw);
    
    // Helper: check if point is inside triangle
    fn point_in_triangle(p: [f64; 2], a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> bool {
        let sign = |p1: [f64; 2], p2: [f64; 2], p3: [f64; 2]| -> f64 {
            (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        };
        let d1 = sign(p, a, b);
        let d2 = sign(p, b, c);
        let d3 = sign(p, c, a);
        let has_neg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
        let has_pos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
        !(has_neg && has_pos)
    }
    
    // Ear clipping
    let mut safety = 0;
    let no_ear_count = 0;
    while indices.len() > 3 && safety < n * n {
        safety += 1;
        let mut found_ear = false;
        
        for i in 0..indices.len() {
            let len = indices.len();
            let prev = indices[(i + len - 1) % len];
            let curr = indices[i];
            let next = indices[(i + 1) % len];
            
            let a = polygon[prev];
            let b = polygon[curr];
            let c = polygon[next];
            
            let area = signed_area(a, b, c);
            
            // Check if this is a convex vertex (ear candidate)
            let is_convex = if is_ccw { area > 0.0 } else { area < 0.0 };
            
            if !is_convex {
                continue;
            }
            
            // Check if any other vertex is inside this triangle
            let mut is_ear = true;
            for j in 0..indices.len() {
                if j == (i + len - 1) % len || j == i || j == (i + 1) % len {
                    continue;
                }
                let p = polygon[indices[j]];
                if point_in_triangle(p, a, b, c) {
                    is_ear = false;
                    break;
                }
            }
            
            if is_ear {
                triangles.push((prev, curr, next));
                indices.remove(i);
                found_ear = true;
                break;
            }
        }
        
        if !found_ear {
            // Fallback: try to find any ear (degenerate case)
            break;
        }
    }
    
    // Handle remaining triangle
    if indices.len() == 3 {
        triangles.push((indices[0], indices[1], indices[2]));
    }
    
    triangles
}

/// Triangulate a polygon with holes using earcutr library.
/// Returns the merged 2D points and triangle indices.
pub fn triangulate_polygon_with_holes(outer: &[[f64; 2]], holes: &[Vec<[f64; 2]>]) -> (Vec<[f64; 2]>, Vec<(usize, usize, usize)>) {
    println!("[TRIANGULATE] outer={} pts, holes={}", outer.len(), holes.len());
    
    if outer.len() < 3 {
        return (outer.to_vec(), vec![]);
    }
    
    // Build flattened vertex array and hole indices for earcutr
    let mut vertices: Vec<f64> = Vec::with_capacity((outer.len() + holes.iter().map(|h| h.len()).sum::<usize>()) * 2);
    let mut hole_indices: Vec<usize> = Vec::with_capacity(holes.len());
    
    // Add outer polygon vertices
    for pt in outer {
        vertices.push(pt[0]);
        vertices.push(pt[1]);
    }
    
    // Add hole vertices
    for hole in holes {
        hole_indices.push(vertices.len() / 2); // Index of first vertex of this hole
        for pt in hole {
            vertices.push(pt[0]);
            vertices.push(pt[1]);
        }
    }
    
    // Run earcutr triangulation
    let indices = earcutr::earcut(&vertices, &hole_indices, 2).unwrap_or_default();
    
    // Convert flat indices to triangle tuples
    let triangles: Vec<(usize, usize, usize)> = indices
        .chunks(3)
        .map(|chunk| (chunk[0], chunk[1], chunk[2]))
        .collect();
    
    // Build merged points array for compatibility with existing code
    let merged_points: Vec<[f64; 2]> = vertices
        .chunks(2)
        .map(|chunk| [chunk[0], chunk[1]])
        .collect();
    
    println!("[TRIANGULATE] earcutr produced {} triangles", triangles.len());
    (merged_points, triangles)
}

fn is_visible_segment(p1: &[f64; 2], p2: &[f64; 2], poly: &[[f64; 2]]) -> bool {
    let n = poly.len();
    for i in 0..n {
        let a = poly[i];
        let b = poly[(i+1)%n];
        
        // Ignore edges incident to p1 or p2
        if (p1[0]-a[0]).abs() < 1e-6 && (p1[1]-a[1]).abs() < 1e-6 { continue; }
        if (p1[0]-b[0]).abs() < 1e-6 && (p1[1]-b[1]).abs() < 1e-6 { continue; }
        if (p2[0]-a[0]).abs() < 1e-6 && (p2[1]-a[1]).abs() < 1e-6 { continue; }
        if (p2[0]-b[0]).abs() < 1e-6 && (p2[1]-b[1]).abs() < 1e-6 { continue; }
        
        if segments_intersect(*p1, *p2, a, b) {
            return false;
        }
    }
    true
}

fn segments_intersect(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    fn ccw(p1: [f64; 2], p2: [f64; 2], p3: [f64; 2]) -> f64 {
        (p2[0]-p1[0])*(p3[1]-p1[1]) - (p2[1]-p1[1])*(p3[0]-p1[0])
    }
    
    let d1 = ccw(c, d, a);
    let d2 = ccw(c, d, b);
    let d3 = ccw(a, b, c);
    let d4 = ccw(a, b, d);
    
    // Strict intersection
    ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0)) &&
    ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
}
