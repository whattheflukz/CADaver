use super::Point3;
use crate::topo::naming::TopoId;
use serde::{Deserialize, Serialize};

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
        let mut normal = v1.cross(&v2).normalize();
        
        // Add normals for each vertex (flat shading style for now)
        for _ in 0..3 {
            self.normals.push(normal.x as f32);
            self.normals.push(normal.y as f32);
            self.normals.push(normal.z as f32);
        }
        
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
