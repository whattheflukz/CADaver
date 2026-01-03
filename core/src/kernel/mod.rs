//! Kernel abstraction layer for CAD geometry operations.
//!
//! This module provides a trait-based abstraction over the underlying CAD kernel,
//! allowing for swapping implementations (e.g., Truck → custom kernel) without
//! changing the rest of the codebase.

pub mod types;
mod truck;

#[cfg(test)]
mod tests_boolean;

pub use truck::TruckKernel;
pub use types::*;

use crate::geometry::Tessellation;
use thiserror::Error;

/// Errors that can occur during kernel operations.
#[derive(Debug, Error, Clone)]
pub enum KernelOpError {
    #[error("Invalid geometry: {0}")]
    InvalidGeometry(String),
    
    #[error("Operation failed: {0}")]
    OperationFailed(String),
    
    #[error("Tessellation failed: {0}")]
    TessellationFailed(String),
    
    #[error("Not implemented: {0}")]
    NotImplemented(String),
}

/// Result type for kernel operations.
pub type KernelResult<T> = Result<T, KernelOpError>;

/// Abstract interface for CAD kernel geometry operations.
///
/// This trait defines the operations needed by the runtime, abstracting
/// over the specific kernel implementation (Truck, custom kernel, etc.).
pub trait GeometryKernel: Send + Sync {
    /// The kernel's internal solid representation.
    type Solid;
    
    /// The kernel's mesh output type.
    type Mesh;
    
    /// Create a box solid with given dimensions centered at origin.
    fn create_box(&self, width: f64, height: f64, depth: f64) -> KernelResult<Self::Solid>;
    
    /// Extrude a 2D polygon along a direction to create a solid.
    ///
    /// # Arguments
    /// * `polygon` - The 2D polygon to extrude (with optional holes)
    /// * `params` - Extrusion parameters (distance, direction, etc.)
    fn extrude_polygon(&self, polygon: &Polygon2D, params: &ExtrudeParams) -> KernelResult<Self::Solid>;
    
    /// Revolve a 2D profile around an axis to create a solid.
    ///
    /// # Arguments
    /// * `profile` - Points defining the 2D profile
    /// * `params` - Revolution parameters (angle, axis, etc.)
    fn revolve_profile(&self, profile: &[Point2D], params: &RevolveParams) -> KernelResult<Self::Solid>;
    
    /// Convert a solid to a triangle mesh for rendering.
    fn tessellate(&self, solid: &Self::Solid) -> KernelResult<TriangleMesh>;
    
    /// Convert a mesh to our internal tessellation format with topology information.
    fn mesh_to_tessellation(
        &self,
        mesh: &TriangleMesh,
        tessellation: &mut Tessellation,
        topology_manifest: &mut std::collections::HashMap<crate::topo::naming::TopoId, crate::topo::registry::KernelEntity>,
        ctx: &crate::topo::naming::NamingContext,
        base_name: &str,
    );
    
    // === Boolean Operations ===
    
    /// Compute the union of two solids (A ∪ B).
    fn boolean_union(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid>;
    
    /// Compute the intersection of two solids (A ∩ B).
    fn boolean_intersect(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid>;
    
    /// Compute the difference of two solids (A - B).
    fn boolean_subtract(&self, solid_a: &Self::Solid, solid_b: &Self::Solid) -> KernelResult<Self::Solid>;
    
    // === STEP File I/O ===
    
    /// Export a solid to STEP format and return as a string.
    fn export_step(&self, solid: &Self::Solid) -> KernelResult<String>;
    
    /// Import a solid from STEP format string.
    fn import_step(&self, step_data: &str) -> KernelResult<Vec<Self::Solid>>;
}

/// Get the default kernel implementation.
pub fn default_kernel() -> TruckKernel {
    TruckKernel::new()
}
