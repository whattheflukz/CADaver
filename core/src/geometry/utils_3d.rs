//! 3D geometry utilities for CAD operations.
//!
//! This module provides pure 3D geometry functions for plane operations,
//! ray casting, and spatial calculations.

use nalgebra as na;
use super::{Point3, Vector3};

/// Tolerance for floating-point comparisons
pub const EPSILON: f64 = 1e-6;

// =============================================================================
// Plane Representation
// =============================================================================

/// A plane defined by a point and a normal vector.
#[derive(Debug, Clone, Copy)]
pub struct Plane {
    pub origin: Point3,
    pub normal: Vector3,
}

impl Plane {
    /// Create a new plane from origin point and normal vector.
    pub fn new(origin: Point3, normal: Vector3) -> Self {
        Self {
            origin,
            normal: normal.normalize(),
        }
    }

    /// XY plane at z = 0
    pub fn xy() -> Self {
        Self::new(Point3::origin(), Vector3::z())
    }

    /// XZ plane at y = 0
    pub fn xz() -> Self {
        Self::new(Point3::origin(), Vector3::y())
    }

    /// YZ plane at x = 0
    pub fn yz() -> Self {
        Self::new(Point3::origin(), Vector3::x())
    }

    /// Create a plane from normal and distance from origin.
    pub fn from_normal_and_distance(normal: Vector3, distance: f64) -> Self {
        let n = normal.normalize();
        Self {
            origin: Point3::from(n * distance),
            normal: n,
        }
    }

    /// Signed distance from a point to this plane.
    /// Positive = point is on the side the normal points to.
    pub fn signed_distance(&self, point: &Point3) -> f64 {
        self.normal.dot(&(point - self.origin))
    }

    /// Absolute distance from a point to this plane.
    pub fn distance(&self, point: &Point3) -> f64 {
        self.signed_distance(point).abs()
    }

    /// Project a point onto this plane.
    pub fn project_point(&self, point: &Point3) -> Point3 {
        point - self.normal * self.signed_distance(point)
    }

    /// Check if a point lies on this plane (within tolerance).
    pub fn contains_point(&self, point: &Point3) -> bool {
        self.signed_distance(point).abs() < EPSILON
    }
}

// =============================================================================
// Ray Representation
// =============================================================================

/// A ray defined by an origin and direction.
#[derive(Debug, Clone, Copy)]
pub struct Ray {
    pub origin: Point3,
    pub direction: Vector3,
}

impl Ray {
    /// Create a new ray from origin and direction.
    pub fn new(origin: Point3, direction: Vector3) -> Self {
        Self {
            origin,
            direction: direction.normalize(),
        }
    }

    /// Get a point along the ray at parameter t.
    pub fn at(&self, t: f64) -> Point3 {
        self.origin + self.direction * t
    }
}

// =============================================================================
// Plane Intersections
// =============================================================================

/// Intersect a ray with a plane.
/// Returns Some(t, point) where t is the ray parameter, or None if parallel.
pub fn ray_plane_intersect(ray: &Ray, plane: &Plane) -> Option<(f64, Point3)> {
    let denom = plane.normal.dot(&ray.direction);
    
    if denom.abs() < EPSILON {
        return None; // Ray is parallel to plane
    }

    let t = plane.normal.dot(&(plane.origin - ray.origin)) / denom;
    
    if t < 0.0 {
        return None; // Intersection is behind ray origin
    }

    Some((t, ray.at(t)))
}

/// Intersect a line segment with a plane.
/// Returns Some(point) if segment crosses plane, None otherwise.
pub fn segment_plane_intersect(p1: &Point3, p2: &Point3, plane: &Plane) -> Option<Point3> {
    let direction = p2 - p1;
    let length = direction.norm();
    
    if length < EPSILON {
        return None;
    }

    let ray = Ray::new(*p1, direction);
    
    if let Some((t, point)) = ray_plane_intersect(&ray, plane) {
        if t >= 0.0 && t <= length {
            return Some(point);
        }
    }
    
    None
}

/// Intersect two planes to get a line.
/// Returns Some((point_on_line, direction)) or None if planes are parallel.
pub fn plane_plane_intersect(p1: &Plane, p2: &Plane) -> Option<(Point3, Vector3)> {
    let direction = p1.normal.cross(&p2.normal);
    
    if direction.norm() < EPSILON {
        return None; // Planes are parallel
    }

    // Find a point on the intersection line
    // Use the plane equation to solve for a point
    let n1 = p1.normal;
    let n2 = p2.normal;
    let d1 = n1.dot(&p1.origin.coords);
    let d2 = n2.dot(&p2.origin.coords);

    // Choose the largest component of direction to avoid division issues
    let abs_dir = Vector3::new(direction.x.abs(), direction.y.abs(), direction.z.abs());
    
    let point = if abs_dir.z >= abs_dir.x && abs_dir.z >= abs_dir.y {
        // Solve for z = 0
        let denom = n1.x * n2.y - n1.y * n2.x;
        if denom.abs() < EPSILON {
            return None;
        }
        let x = (d1 * n2.y - d2 * n1.y) / denom;
        let y = (n1.x * d2 - n2.x * d1) / denom;
        Point3::new(x, y, 0.0)
    } else if abs_dir.y >= abs_dir.x {
        // Solve for y = 0
        let denom = n1.x * n2.z - n1.z * n2.x;
        if denom.abs() < EPSILON {
            return None;
        }
        let x = (d1 * n2.z - d2 * n1.z) / denom;
        let z = (n1.x * d2 - n2.x * d1) / denom;
        Point3::new(x, 0.0, z)
    } else {
        // Solve for x = 0
        let denom = n1.y * n2.z - n1.z * n2.y;
        if denom.abs() < EPSILON {
            return None;
        }
        let y = (d1 * n2.z - d2 * n1.z) / denom;
        let z = (n1.y * d2 - n2.y * d1) / denom;
        Point3::new(0.0, y, z)
    };

    Some((point, direction.normalize()))
}

// =============================================================================
// Triangle Operations
// =============================================================================

/// Ray-triangle intersection using Möller–Trumbore algorithm.
/// Returns Some((t, u, v)) where t is ray param, u,v are barycentric coords.
pub fn ray_triangle_intersect(
    ray: &Ray,
    v0: &Point3,
    v1: &Point3,
    v2: &Point3,
) -> Option<(f64, f64, f64)> {
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let h = ray.direction.cross(&edge2);
    let a = edge1.dot(&h);

    if a.abs() < EPSILON {
        return None; // Ray is parallel to triangle
    }

    let f = 1.0 / a;
    let s = ray.origin - v0;
    let u = f * s.dot(&h);

    if !(0.0..=1.0).contains(&u) {
        return None;
    }

    let q = s.cross(&edge1);
    let v = f * ray.direction.dot(&q);

    if v < 0.0 || u + v > 1.0 {
        return None;
    }

    let t = f * edge2.dot(&q);

    if t > EPSILON {
        Some((t, u, v))
    } else {
        None // Intersection is behind ray
    }
}

/// Compute the normal of a triangle.
pub fn triangle_normal(v0: &Point3, v1: &Point3, v2: &Point3) -> Vector3 {
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    edge1.cross(&edge2).normalize()
}

/// Compute the area of a triangle.
pub fn triangle_area(v0: &Point3, v1: &Point3, v2: &Point3) -> f64 {
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    edge1.cross(&edge2).norm() / 2.0
}

// =============================================================================
// Point Operations
// =============================================================================

/// Compute the centroid of a set of 3D points.
pub fn points_centroid(points: &[Point3]) -> Point3 {
    if points.is_empty() {
        return Point3::origin();
    }

    let sum: Vector3 = points.iter().map(|p| p.coords).sum();
    Point3::from(sum / points.len() as f64)
}

/// Check if a set of points are coplanar (within tolerance).
pub fn points_coplanar(points: &[Point3]) -> bool {
    if points.len() < 4 {
        return true; // 3 or fewer points are always coplanar
    }

    // Compute plane from first 3 points
    let v1 = points[1] - points[0];
    let v2 = points[2] - points[0];
    let normal = v1.cross(&v2);

    if normal.norm() < EPSILON {
        return true; // First 3 points are collinear
    }

    let plane = Plane::new(points[0], normal);

    // Check all remaining points
    points.iter().skip(3).all(|p| plane.contains_point(p))
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plane_distance() {
        let plane = Plane::xy();
        
        assert!((plane.signed_distance(&Point3::new(0.0, 0.0, 5.0)) - 5.0).abs() < EPSILON);
        assert!((plane.signed_distance(&Point3::new(0.0, 0.0, -3.0)) + 3.0).abs() < EPSILON);
        assert!(plane.contains_point(&Point3::new(5.0, 7.0, 0.0)));
    }

    #[test]
    fn test_ray_plane_intersect() {
        let plane = Plane::xy();
        let ray = Ray::new(Point3::new(0.0, 0.0, 5.0), Vector3::new(0.0, 0.0, -1.0));
        
        let result = ray_plane_intersect(&ray, &plane);
        assert!(result.is_some());
        
        let (t, point) = result.unwrap();
        assert!((t - 5.0).abs() < EPSILON);
        assert!(point.z.abs() < EPSILON);
    }

    #[test]
    fn test_ray_triangle_intersect() {
        let v0 = Point3::new(0.0, 0.0, 0.0);
        let v1 = Point3::new(1.0, 0.0, 0.0);
        let v2 = Point3::new(0.0, 1.0, 0.0);
        
        // Ray hitting center of triangle
        let ray = Ray::new(Point3::new(0.2, 0.2, 1.0), Vector3::new(0.0, 0.0, -1.0));
        let result = ray_triangle_intersect(&ray, &v0, &v1, &v2);
        assert!(result.is_some());
        
        // Ray missing triangle
        let ray = Ray::new(Point3::new(2.0, 2.0, 1.0), Vector3::new(0.0, 0.0, -1.0));
        let result = ray_triangle_intersect(&ray, &v0, &v1, &v2);
        assert!(result.is_none());
    }

    #[test]
    fn test_triangle_area() {
        let v0 = Point3::new(0.0, 0.0, 0.0);
        let v1 = Point3::new(3.0, 0.0, 0.0);
        let v2 = Point3::new(0.0, 4.0, 0.0);
        
        assert!((triangle_area(&v0, &v1, &v2) - 6.0).abs() < EPSILON);
    }

    #[test]
    fn test_points_coplanar() {
        let coplanar = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(1.0, 0.0, 0.0),
            Point3::new(0.0, 1.0, 0.0),
            Point3::new(1.0, 1.0, 0.0),
        ];
        assert!(points_coplanar(&coplanar));

        let not_coplanar = vec![
            Point3::new(0.0, 0.0, 0.0),
            Point3::new(1.0, 0.0, 0.0),
            Point3::new(0.0, 1.0, 0.0),
            Point3::new(0.0, 0.0, 1.0),
        ];
        assert!(!points_coplanar(&not_coplanar));
    }
}
