//! 2D geometry utilities for sketch and CAD operations.
//!
//! This module provides pure 2D geometry functions that are reused across
//! the codebase for intersection detection, containment tests, and 
//! polygon operations.

use std::f64::consts::PI;

/// Tolerance for floating-point comparisons
pub const EPSILON: f64 = 1e-6;

// =============================================================================
// Point Operations
// =============================================================================

/// Check if two 2D points are approximately equal within EPSILON.
#[inline]
pub fn points_equal(p1: [f64; 2], p2: [f64; 2]) -> bool {
    (p1[0] - p2[0]).abs() < EPSILON && (p1[1] - p2[1]).abs() < EPSILON
}

/// Compute squared distance between two 2D points.
#[inline]
pub fn distance_squared(p1: [f64; 2], p2: [f64; 2]) -> f64 {
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    dx * dx + dy * dy
}

/// Compute distance between two 2D points.
#[inline]
pub fn distance(p1: [f64; 2], p2: [f64; 2]) -> f64 {
    distance_squared(p1, p2).sqrt()
}

/// Linear interpolation between two 2D points.
#[inline]
pub fn lerp(p1: [f64; 2], p2: [f64; 2], t: f64) -> [f64; 2] {
    [
        p1[0] + t * (p2[0] - p1[0]),
        p1[1] + t * (p2[1] - p1[1]),
    ]
}

/// Midpoint between two 2D points.
#[inline]
pub fn midpoint(p1: [f64; 2], p2: [f64; 2]) -> [f64; 2] {
    lerp(p1, p2, 0.5)
}

// =============================================================================
// Vector Operations
// =============================================================================

/// 2D cross product (z-component of 3D cross product).
/// Positive if v2 is counter-clockwise from v1.
#[inline]
pub fn cross_2d(v1: [f64; 2], v2: [f64; 2]) -> f64 {
    v1[0] * v2[1] - v1[1] * v2[0]
}

/// 2D dot product.
#[inline]
pub fn dot_2d(v1: [f64; 2], v2: [f64; 2]) -> f64 {
    v1[0] * v2[0] + v1[1] * v2[1]
}

/// Normalize a 2D vector. Returns [0, 0] if vector is zero.
#[inline]
pub fn normalize_2d(v: [f64; 2]) -> [f64; 2] {
    let len = (v[0] * v[0] + v[1] * v[1]).sqrt();
    if len < EPSILON {
        [0.0, 0.0]
    } else {
        [v[0] / len, v[1] / len]
    }
}

/// Perpendicular vector (90° counter-clockwise rotation).
#[inline]
pub fn perpendicular_ccw(v: [f64; 2]) -> [f64; 2] {
    [-v[1], v[0]]
}

/// Perpendicular vector (90° clockwise rotation).
#[inline]
pub fn perpendicular_cw(v: [f64; 2]) -> [f64; 2] {
    [v[1], -v[0]]
}

// =============================================================================
// Line Segment Operations
// =============================================================================

/// Find parameter t where point projects onto line segment.
/// Returns t such that point ≈ start + t * (end - start).
/// t in [0,1] means projection is on segment.
pub fn project_point_on_line(start: [f64; 2], end: [f64; 2], point: [f64; 2]) -> f64 {
    let dx = end[0] - start[0];
    let dy = end[1] - start[1];
    let len_sq = dx * dx + dy * dy;

    if len_sq < EPSILON * EPSILON {
        return 0.0;
    }

    let px = point[0] - start[0];
    let py = point[1] - start[1];

    (px * dx + py * dy) / len_sq
}

/// Compute perpendicular distance from point to infinite line.
pub fn distance_point_to_line(line_start: [f64; 2], line_end: [f64; 2], point: [f64; 2]) -> f64 {
    let dx = line_end[0] - line_start[0];
    let dy = line_end[1] - line_start[1];
    let len = (dx * dx + dy * dy).sqrt();

    if len < EPSILON {
        return distance(line_start, point);
    }

    // Signed distance using cross product
    let px = point[0] - line_start[0];
    let py = point[1] - line_start[1];
    ((px * dy - py * dx) / len).abs()
}

/// Compute closest point on line segment to given point.
pub fn closest_point_on_segment(start: [f64; 2], end: [f64; 2], point: [f64; 2]) -> [f64; 2] {
    let t = project_point_on_line(start, end, point).clamp(0.0, 1.0);
    lerp(start, end, t)
}

// =============================================================================
// Line-Line Intersection
// =============================================================================

/// Calculate intersection point of two 2D line segments.
/// Returns Some(point) if segments intersect, None otherwise.
pub fn line_line_intersect(
    s1: [f64; 2], e1: [f64; 2],
    s2: [f64; 2], e2: [f64; 2],
) -> Option<[f64; 2]> {
    let d1x = e1[0] - s1[0];
    let d1y = e1[1] - s1[1];
    let d2x = e2[0] - s2[0];
    let d2y = e2[1] - s2[1];

    let denom = d1x * d2y - d1y * d2x;
    if denom.abs() < EPSILON {
        return None; // Parallel
    }

    let t = ((s2[0] - s1[0]) * d2y - (s2[1] - s1[1]) * d2x) / denom;
    let u = ((s2[0] - s1[0]) * d1y - (s2[1] - s1[1]) * d1x) / denom;

    // Check if intersection is within both segments (with small tolerance)
    if t >= -EPSILON && t <= 1.0 + EPSILON && u >= -EPSILON && u <= 1.0 + EPSILON {
        Some([s1[0] + t * d1x, s1[1] + t * d1y])
    } else {
        None
    }
}

/// Calculate intersection of two infinite lines (unbounded).
/// Returns Some((point, t1, t2)) where t1, t2 are parameters on each line.
pub fn line_line_intersect_unbounded(
    s1: [f64; 2], e1: [f64; 2],
    s2: [f64; 2], e2: [f64; 2],
) -> Option<([f64; 2], f64, f64)> {
    let d1x = e1[0] - s1[0];
    let d1y = e1[1] - s1[1];
    let d2x = e2[0] - s2[0];
    let d2y = e2[1] - s2[1];

    let denom = d1x * d2y - d1y * d2x;
    if denom.abs() < EPSILON {
        return None;
    }

    let dx = s2[0] - s1[0];
    let dy = s2[1] - s1[1];

    let t = (dx * d2y - dy * d2x) / denom;
    let u = (dx * d1y - dy * d1x) / denom;

    Some(([s1[0] + t * d1x, s1[1] + t * d1y], t, u))
}

// =============================================================================
// Line-Circle Intersection
// =============================================================================

/// Calculate intersection points of a line segment with a circle.
/// Returns 0, 1, or 2 intersection points.
pub fn line_circle_intersect(
    line_start: [f64; 2], line_end: [f64; 2],
    center: [f64; 2], radius: f64,
) -> Vec<[f64; 2]> {
    let dx = line_end[0] - line_start[0];
    let dy = line_end[1] - line_start[1];
    let fx = line_start[0] - center[0];
    let fy = line_start[1] - center[1];

    let a = dx * dx + dy * dy;
    let b = 2.0 * (fx * dx + fy * dy);
    let c = fx * fx + fy * fy - radius * radius;

    let discriminant = b * b - 4.0 * a * c;

    if discriminant < 0.0 || a < EPSILON * EPSILON {
        return vec![];
    }

    let sqrt_disc = discriminant.sqrt();
    let mut results = Vec::new();

    let t1 = (-b - sqrt_disc) / (2.0 * a);
    let t2 = (-b + sqrt_disc) / (2.0 * a);

    // Include intersections within segment bounds (with tolerance)
    if t1 >= -EPSILON && t1 <= 1.0 + EPSILON {
        results.push([line_start[0] + t1 * dx, line_start[1] + t1 * dy]);
    }
    if t2 >= -EPSILON && t2 <= 1.0 + EPSILON && (t2 - t1).abs() > EPSILON {
        results.push([line_start[0] + t2 * dx, line_start[1] + t2 * dy]);
    }

    results
}

// =============================================================================
// Circle-Circle Intersection
// =============================================================================

/// Calculate intersection points of two circles.
/// Returns 0, 1 (tangent), or 2 intersection points.
pub fn circle_circle_intersect(
    c1: [f64; 2], r1: f64,
    c2: [f64; 2], r2: f64,
) -> Vec<[f64; 2]> {
    let dx = c2[0] - c1[0];
    let dy = c2[1] - c1[1];
    let d = (dx * dx + dy * dy).sqrt();

    // No intersection: too far apart, one inside the other, or coincident
    if d > r1 + r2 + EPSILON || d < (r1 - r2).abs() - EPSILON || d < EPSILON {
        return vec![];
    }

    let a = (r1 * r1 - r2 * r2 + d * d) / (2.0 * d);
    let h_sq = r1 * r1 - a * a;

    if h_sq < 0.0 {
        return vec![];
    }

    let h = h_sq.sqrt();
    let px = c1[0] + a * dx / d;
    let py = c1[1] + a * dy / d;

    if h < EPSILON {
        // Tangent: single point
        return vec![[px, py]];
    }

    let ox = h * dy / d;
    let oy = h * dx / d;

    vec![
        [px + ox, py - oy],
        [px - ox, py + oy],
    ]
}

// =============================================================================
// Polygon Operations
// =============================================================================

/// Compute signed area of a polygon using the Shoelace formula.
/// Positive = CCW winding, Negative = CW winding.
pub fn polygon_signed_area(vertices: &[[f64; 2]]) -> f64 {
    let n = vertices.len();
    if n < 3 {
        return 0.0;
    }

    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += vertices[i][0] * vertices[j][1];
        area -= vertices[j][0] * vertices[i][1];
    }
    area / 2.0
}

/// Compute absolute area of a polygon.
pub fn polygon_area(vertices: &[[f64; 2]]) -> f64 {
    polygon_signed_area(vertices).abs()
}

/// Compute centroid of a polygon.
pub fn polygon_centroid(vertices: &[[f64; 2]]) -> [f64; 2] {
    let n = vertices.len();
    if n == 0 {
        return [0.0, 0.0];
    }
    if n == 1 {
        return vertices[0];
    }
    if n == 2 {
        return midpoint(vertices[0], vertices[1]);
    }

    let mut signed_area = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;

    for i in 0..n {
        let j = (i + 1) % n;
        let cross = vertices[i][0] * vertices[j][1] - vertices[j][0] * vertices[i][1];
        signed_area += cross;
        cx += (vertices[i][0] + vertices[j][0]) * cross;
        cy += (vertices[i][1] + vertices[j][1]) * cross;
    }

    signed_area /= 2.0;

    if signed_area.abs() > EPSILON {
        cx /= 6.0 * signed_area;
        cy /= 6.0 * signed_area;
    } else {
        // Degenerate polygon: use average
        cx = vertices.iter().map(|p| p[0]).sum::<f64>() / n as f64;
        cy = vertices.iter().map(|p| p[1]).sum::<f64>() / n as f64;
    }

    [cx, cy]
}

/// Test if a point is inside a polygon using the winding number algorithm.
/// Works for both convex and concave polygons.
pub fn point_in_polygon(point: [f64; 2], polygon: &[[f64; 2]]) -> bool {
    let n = polygon.len();
    if n < 3 {
        return false;
    }

    let mut winding: i32 = 0;

    for i in 0..n {
        let p1 = polygon[i];
        let p2 = polygon[(i + 1) % n];

        if p1[1] <= point[1] {
            if p2[1] > point[1] {
                // Upward crossing
                let cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
                if cross > 0.0 {
                    winding += 1;
                }
            }
        } else if p2[1] <= point[1] {
            // Downward crossing
            let cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
            if cross < 0.0 {
                winding -= 1;
            }
        }
    }

    winding != 0
}

// =============================================================================
// Arc Utilities
// =============================================================================

/// Compute a point on an arc given center, radius, and angle (radians).
#[inline]
pub fn arc_point(center: [f64; 2], radius: f64, angle: f64) -> [f64; 2] {
    [
        center[0] + radius * angle.cos(),
        center[1] + radius * angle.sin(),
    ]
}

/// Discretize an arc into line segments.
/// Returns `segments + 1` points from start_angle to end_angle.
pub fn discretize_arc(
    center: [f64; 2],
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    segments: usize,
) -> Vec<[f64; 2]> {
    let mut sweep = end_angle - start_angle;
    
    // Normalize sweep to be positive for CCW traversal
    if sweep < 0.0 {
        sweep += 2.0 * PI;
    }

    let segments = segments.max(1);
    let mut points = Vec::with_capacity(segments + 1);

    for i in 0..=segments {
        let t = i as f64 / segments as f64;
        let angle = start_angle + t * sweep;
        points.push(arc_point(center, radius, angle));
    }

    points
}

/// Discretize a full circle into line segments.
pub fn discretize_circle(center: [f64; 2], radius: f64, segments: usize) -> Vec<[f64; 2]> {
    let segments = segments.max(3);
    let mut points = Vec::with_capacity(segments);

    for i in 0..segments {
        let angle = (i as f64 / segments as f64) * 2.0 * PI;
        points.push(arc_point(center, radius, angle));
    }

    points
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_points_equal() {
        assert!(points_equal([1.0, 2.0], [1.0, 2.0]));
        assert!(points_equal([1.0, 2.0], [1.0 + 1e-8, 2.0 - 1e-8]));
        assert!(!points_equal([1.0, 2.0], [1.1, 2.0]));
    }

    #[test]
    fn test_distance() {
        assert!((distance([0.0, 0.0], [3.0, 4.0]) - 5.0).abs() < EPSILON);
    }

    #[test]
    fn test_line_line_intersect() {
        // X intersection
        let p = line_line_intersect([0.0, 0.0], [10.0, 10.0], [0.0, 10.0], [10.0, 0.0]);
        assert!(p.is_some());
        let pt = p.unwrap();
        assert!((pt[0] - 5.0).abs() < EPSILON);
        assert!((pt[1] - 5.0).abs() < EPSILON);

        // Parallel lines
        let p = line_line_intersect([0.0, 0.0], [10.0, 0.0], [0.0, 5.0], [10.0, 5.0]);
        assert!(p.is_none());
    }

    #[test]
    fn test_circle_circle_intersect() {
        // Two touching circles
        let pts = circle_circle_intersect([0.0, 0.0], 5.0, [10.0, 0.0], 5.0);
        assert_eq!(pts.len(), 1);
        assert!((pts[0][0] - 5.0).abs() < EPSILON);

        // Two overlapping circles
        let pts = circle_circle_intersect([0.0, 0.0], 5.0, [6.0, 0.0], 5.0);
        assert_eq!(pts.len(), 2);
    }

    #[test]
    fn test_polygon_area() {
        // Unit square
        let square = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        assert!((polygon_area(&square) - 1.0).abs() < EPSILON);

        // Triangle
        let tri = [[0.0, 0.0], [4.0, 0.0], [2.0, 3.0]];
        assert!((polygon_area(&tri) - 6.0).abs() < EPSILON);
    }

    #[test]
    fn test_point_in_polygon() {
        let square = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]];
        
        assert!(point_in_polygon([5.0, 5.0], &square));
        assert!(point_in_polygon([1.0, 1.0], &square));
        assert!(!point_in_polygon([15.0, 5.0], &square));
        assert!(!point_in_polygon([-1.0, 5.0], &square));
    }

    #[test]
    fn test_discretize_circle() {
        let pts = discretize_circle([0.0, 0.0], 5.0, 8);
        assert_eq!(pts.len(), 8);
        
        // All points should be on circle
        for pt in &pts {
            let dist = distance([0.0, 0.0], *pt);
            assert!((dist - 5.0).abs() < EPSILON);
        }
    }
}
