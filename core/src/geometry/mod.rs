use nalgebra as na;

pub type Point3 = na::Point3<f64>;
pub type Vector3 = na::Vector3<f64>;
pub type Matrix4 = na::Matrix4<f64>;
pub type Transform3 = na::Isometry3<f64>;

pub const EPSILON: f64 = 1e-6;

pub trait ApproxEq {
    fn approx_eq(&self, other: &Self) -> bool;
}

impl ApproxEq for f64 {
    fn approx_eq(&self, other: &Self) -> bool {
        (self - other).abs() < EPSILON
    }
}

impl ApproxEq for Point3 {
    fn approx_eq(&self, other: &Self) -> bool {
        na::distance_squared(self, other) < EPSILON * EPSILON
    }
}

impl ApproxEq for Vector3 {
    fn approx_eq(&self, other: &Self) -> bool {
        (self - other).norm_squared() < EPSILON * EPSILON
    }
}

pub mod primitives;
pub use primitives::*;

pub mod tessellation;
pub use tessellation::Tessellation;

pub mod intersection;
pub use intersection::*;

pub fn dist_sq(p1: &Point3, p2: &Point3) -> f64 {

    na::distance_squared(p1, p2)
}
