//! Common geometry types for the kernel abstraction layer.
//!
//! These types are kernel-agnostic and used to communicate between
//! the runtime and the kernel implementation.

use serde::{Deserialize, Serialize};

/// A 2D point in sketch space.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
}

impl Point2D {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
    
    pub fn from_array(arr: [f64; 2]) -> Self {
        Self { x: arr[0], y: arr[1] }
    }
    
    pub fn to_array(&self) -> [f64; 2] {
        [self.x, self.y]
    }
}

impl From<[f64; 2]> for Point2D {
    fn from(arr: [f64; 2]) -> Self {
        Self::from_array(arr)
    }
}

/// A 3D point in world space.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Point3D {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    
    pub fn from_array(arr: [f64; 3]) -> Self {
        Self { x: arr[0], y: arr[1], z: arr[2] }
    }
    
    pub fn to_array(&self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }
}

impl From<[f64; 3]> for Point3D {
    fn from(arr: [f64; 3]) -> Self {
        Self::from_array(arr)
    }
}

/// A 3D vector/direction.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vector3D {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vector3D {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    
    pub fn from_array(arr: [f64; 3]) -> Self {
        Self { x: arr[0], y: arr[1], z: arr[2] }
    }
    
    pub fn to_array(&self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }
    
    /// Normalize to unit length.
    pub fn normalize(&self) -> Self {
        let len = (self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if len < 1e-10 {
            Self::new(0.0, 0.0, 1.0) // Default to Z-up if zero vector
        } else {
            Self::new(self.x / len, self.y / len, self.z / len)
        }
    }
    
    pub fn cross(&self, other: &Self) -> Self {
        Self::new(
            self.y * other.z - self.z * other.y,
            self.z * other.x - self.x * other.z,
            self.x * other.y - self.y * other.x,
        )
    }
    
    pub fn dot(&self, other: &Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }
}

impl From<[f64; 3]> for Vector3D {
    fn from(arr: [f64; 3]) -> Self {
        Self::from_array(arr)
    }
}

/// A 2D polygon with optional holes.
#[derive(Debug, Clone)]
pub struct Polygon2D {
    /// Outer boundary (counter-clockwise winding).
    pub exterior: Vec<Point2D>,
    /// Inner holes (clockwise winding).
    pub interiors: Vec<Vec<Point2D>>,
}

impl Polygon2D {
    pub fn new(exterior: Vec<Point2D>) -> Self {
        Self {
            exterior,
            interiors: Vec::new(),
        }
    }
    
    pub fn with_holes(exterior: Vec<Point2D>, interiors: Vec<Vec<Point2D>>) -> Self {
        Self { exterior, interiors }
    }
    
    /// Create from raw coordinate arrays.
    pub fn from_arrays(exterior: &[[f64; 2]], interiors: &[Vec<[f64; 2]>]) -> Self {
        Self {
            exterior: exterior.iter().map(|p| Point2D::from_array(*p)).collect(),
            interiors: interiors
                .iter()
                .map(|hole| hole.iter().map(|p| Point2D::from_array(*p)).collect())
                .collect(),
        }
    }
}

/// Parameters for extrusion operations.
#[derive(Debug, Clone)]
pub struct ExtrudeParams {
    /// Extrusion distance (height).
    pub distance: f64,
    /// Direction vector (typically sketch plane normal).
    pub direction: Vector3D,
    /// Start offset before extrusion begins.
    pub start_offset: f64,
    /// Scale factors at the end of extrusion.
    pub scale: (f64, f64),
    /// Twist angle during extrusion (radians).
    pub twist: f64,
}

impl Default for ExtrudeParams {
    fn default() -> Self {
        Self {
            distance: 10.0,
            direction: Vector3D::new(0.0, 0.0, 1.0),
            start_offset: 0.0,
            scale: (1.0, 1.0),
            twist: 0.0,
        }
    }
}

impl ExtrudeParams {
    pub fn linear(distance: f64) -> Self {
        Self {
            distance,
            ..Default::default()
        }
    }
    
    pub fn with_direction(mut self, direction: Vector3D) -> Self {
        self.direction = direction;
        self
    }
    
    pub fn with_start_offset(mut self, offset: f64) -> Self {
        self.start_offset = offset;
        self
    }
}

/// Parameters for revolution operations.
#[derive(Debug, Clone)]
pub struct RevolveParams {
    /// Angle of revolution in radians.
    pub angle: f64,
    /// Axis of revolution.
    pub axis: RevolveAxis,
}

/// Axis options for revolution.
#[derive(Debug, Clone, Copy)]
pub enum RevolveAxis {
    X,
    Y,
    Z,
    Custom { origin: Point3D, direction: Vector3D },
}

impl Default for RevolveParams {
    fn default() -> Self {
        Self {
            angle: std::f64::consts::TAU, // Full 360°
            axis: RevolveAxis::X,
        }
    }
}

/// A sketch plane definition for transforming 2D → 3D.
#[derive(Debug, Clone)]
pub struct SketchPlane {
    pub origin: Point3D,
    pub x_axis: Vector3D,
    pub y_axis: Vector3D,
    pub normal: Vector3D,
}

impl SketchPlane {
    /// XY plane at origin.
    pub fn xy() -> Self {
        Self {
            origin: Point3D::new(0.0, 0.0, 0.0),
            x_axis: Vector3D::new(1.0, 0.0, 0.0),
            y_axis: Vector3D::new(0.0, 1.0, 0.0),
            normal: Vector3D::new(0.0, 0.0, 1.0),
        }
    }
    
    /// Transform a 2D point to 3D world coordinates.
    pub fn to_world(&self, p: Point2D) -> Point3D {
        Point3D::new(
            self.origin.x + p.x * self.x_axis.x + p.y * self.y_axis.x,
            self.origin.y + p.x * self.x_axis.y + p.y * self.y_axis.y,
            self.origin.z + p.x * self.x_axis.z + p.y * self.y_axis.z,
        )
    }
}

impl From<&crate::sketch::types::SketchPlane> for SketchPlane {
    fn from(plane: &crate::sketch::types::SketchPlane) -> Self {
        Self {
            origin: Point3D::from_array(plane.origin.into()),
            x_axis: Vector3D::from_array(plane.x_axis.into()),
            y_axis: Vector3D::from_array(plane.y_axis.into()),
            normal: Vector3D::from_array(plane.normal.into()),
        }
    }
}

/// Output triangle mesh from tessellation.
#[derive(Debug, Clone, Default)]
pub struct TriangleMesh {
    /// Vertex positions.
    pub positions: Vec<Point3D>,
    /// Triangle indices (each triple refers to positions).
    pub triangles: Vec<(u32, u32, u32)>,
    /// Optional per-vertex normals.
    pub normals: Option<Vec<Vector3D>>,
    /// Optional per-triangle topological face ID.
    /// When present, triangles with the same face_id belong to the same logical face.
    pub face_ids: Vec<u32>,
}

impl TriangleMesh {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn with_capacity(vertices: usize, triangles: usize) -> Self {
        Self {
            positions: Vec::with_capacity(vertices),
            triangles: Vec::with_capacity(triangles),
            normals: None,
            face_ids: Vec::with_capacity(triangles),
        }
    }
    
    pub fn add_vertex(&mut self, pos: Point3D) -> u32 {
        let idx = self.positions.len() as u32;
        self.positions.push(pos);
        idx
    }
    
    pub fn add_triangle(&mut self, i0: u32, i1: u32, i2: u32) {
        self.triangles.push((i0, i1, i2));
        // Note: face_ids left empty for backward compat (will use normal-based grouping)
    }
    
    /// Add a triangle with an associated topological face ID.
    pub fn add_triangle_with_face(&mut self, i0: u32, i1: u32, i2: u32, face_id: u32) {
        self.triangles.push((i0, i1, i2));
        self.face_ids.push(face_id);
    }
    
    /// Check if this mesh has face ID information.
    pub fn has_face_ids(&self) -> bool {
        !self.face_ids.is_empty() && self.face_ids.len() == self.triangles.len()
    }
}
