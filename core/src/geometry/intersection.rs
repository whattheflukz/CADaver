//! 2D curve intersection calculations for sketch geometry

/// Calculate intersection point of two 2D line segments.
/// Returns Some(point) if segments intersect, None otherwise.
/// 
/// Uses parametric line representation: P = P0 + t*(P1-P0)
/// where t in [0,1] for the segment.
pub fn line_line_intersection(
    l1_start: [f64; 2], l1_end: [f64; 2],
    l2_start: [f64; 2], l2_end: [f64; 2]
) -> Option<[f64; 2]> {
    let d1x = l1_end[0] - l1_start[0];
    let d1y = l1_end[1] - l1_start[1];
    let d2x = l2_end[0] - l2_start[0];
    let d2y = l2_end[1] - l2_start[1];

    // Cross product of direction vectors (2D determinant)
    let cross = d1x * d2y - d1y * d2x;

    // Parallel or coincident lines
    if cross.abs() < 1e-10 {
        return None;
    }

    // Vector from L1 start to L2 start
    let dx = l2_start[0] - l1_start[0];
    let dy = l2_start[1] - l1_start[1];

    // Parameter t for L1: intersection = L1_start + t * (L1_end - L1_start)
    let t = (dx * d2y - dy * d2x) / cross;
    // Parameter s for L2
    let s = (dx * d1y - dy * d1x) / cross;

    // Check if intersection is within both segments
    if t >= 0.0 && t <= 1.0 && s >= 0.0 && s <= 1.0 {
        Some([
            l1_start[0] + t * d1x,
            l1_start[1] + t * d1y
        ])
    } else {
        None
    }
}

/// Calculate intersection point of two infinite lines (not segments).
/// Returns Some(point) if lines are not parallel, None if parallel.
pub fn line_line_intersection_unbounded(
    l1_start: [f64; 2], l1_end: [f64; 2],
    l2_start: [f64; 2], l2_end: [f64; 2]
) -> Option<([f64; 2], f64, f64)> {
    let d1x = l1_end[0] - l1_start[0];
    let d1y = l1_end[1] - l1_start[1];
    let d2x = l2_end[0] - l2_start[0];
    let d2y = l2_end[1] - l2_start[1];

    let cross = d1x * d2y - d1y * d2x;

    if cross.abs() < 1e-10 {
        return None;
    }

    let dx = l2_start[0] - l1_start[0];
    let dy = l2_start[1] - l1_start[1];

    let t = (dx * d2y - dy * d2x) / cross;
    let s = (dx * d1y - dy * d1x) / cross;

    Some(([
        l1_start[0] + t * d1x,
        l1_start[1] + t * d1y
    ], t, s))
}

/// Find the parameter t along line segment where a point lies.
/// Returns t such that point = start + t * (end - start)
/// t in [0,1] means point is on segment.
pub fn point_on_line_parameter(
    start: [f64; 2], end: [f64; 2],
    point: [f64; 2]
) -> f64 {
    let dx = end[0] - start[0];
    let dy = end[1] - start[1];
    let len_sq = dx * dx + dy * dy;
    
    if len_sq < 1e-15 {
        return 0.0;
    }

    let px = point[0] - start[0];
    let py = point[1] - start[1];

    (px * dx + py * dy) / len_sq
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_line_intersection_basic() {
        // X from (0,0)-(10,10) and (0,10)-(10,0)
        let p = line_line_intersection(
            [0.0, 0.0], [10.0, 10.0],
            [0.0, 10.0], [10.0, 0.0]
        );
        assert!(p.is_some());
        let pt = p.unwrap();
        assert!((pt[0] - 5.0).abs() < 1e-6);
        assert!((pt[1] - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_line_line_no_intersection() {
        // Parallel lines
        let p = line_line_intersection(
            [0.0, 0.0], [10.0, 0.0],
            [0.0, 5.0], [10.0, 5.0]
        );
        assert!(p.is_none());
    }

    #[test]
    fn test_line_line_intersection_outside_segment() {
        // Lines would intersect if extended, but not within segments
        let p = line_line_intersection(
            [0.0, 0.0], [5.0, 0.0],
            [10.0, 5.0], [10.0, -5.0]
        );
        assert!(p.is_none());
    }

    #[test]
    fn test_point_on_line_parameter() {
        let t = point_on_line_parameter([0.0, 0.0], [10.0, 0.0], [5.0, 0.0]);
        assert!((t - 0.5).abs() < 1e-6);

        let t2 = point_on_line_parameter([0.0, 0.0], [10.0, 0.0], [15.0, 0.0]);
        assert!((t2 - 1.5).abs() < 1e-6);
    }
}
