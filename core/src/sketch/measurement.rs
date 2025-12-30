//! Measurement calculations for sketch geometry.
//! 
//! These are pure geometry calculations for temporary, non-driving measurements.
//! Measurements are session-only and update live as geometry changes.

use crate::sketch::types::{SketchGeometry, SketchEntity};
use serde::{Deserialize, Serialize};

/// Result of a measurement operation
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum MeasurementResult {
    /// Distance between two points or entities
    Distance { value: f64 },
    /// Angle between two lines (in radians)
    Angle { value: f64 },
    /// Radius of a circle or arc
    Radius { value: f64 },
    /// Arc length
    ArcLength { value: f64 },
    /// Circumference of a circle
    Circumference { value: f64 },
    /// Error when measurement is not possible
    Error { message: String },
}

/// Measure the distance between two 2D points
pub fn measure_point_point_distance(p1: [f64; 2], p2: [f64; 2]) -> f64 {
    let dx = p2[0] - p1[0];
    let dy = p2[1] - p1[1];
    (dx * dx + dy * dy).sqrt()
}

/// Measure the perpendicular distance from a point to an infinite line
/// Line is defined by start and end points
pub fn measure_point_line_distance(point: [f64; 2], line_start: [f64; 2], line_end: [f64; 2]) -> f64 {
    let dx = line_end[0] - line_start[0];
    let dy = line_end[1] - line_start[1];
    let line_len_sq = dx * dx + dy * dy;
    
    if line_len_sq < 1e-15 {
        // Degenerate line (point), return distance to that point
        return measure_point_point_distance(point, line_start);
    }
    
    // Cross product gives signed area of parallelogram, divide by base length for height
    let cross = (point[0] - line_start[0]) * dy - (point[1] - line_start[1]) * dx;
    cross.abs() / line_len_sq.sqrt()
}

/// Measure the angle between two lines (in radians)
/// Returns value in [0, PI]
pub fn measure_line_line_angle(
    l1_start: [f64; 2], l1_end: [f64; 2],
    l2_start: [f64; 2], l2_end: [f64; 2],
) -> f64 {
    let d1x = l1_end[0] - l1_start[0];
    let d1y = l1_end[1] - l1_start[1];
    let d2x = l2_end[0] - l2_start[0];
    let d2y = l2_end[1] - l2_start[1];
    
    let len1 = (d1x * d1x + d1y * d1y).sqrt();
    let len2 = (d2x * d2x + d2y * d2y).sqrt();
    
    if len1 < 1e-10 || len2 < 1e-10 {
        return 0.0; // Degenerate lines
    }
    
    // Normalize
    let (u1x, u1y) = (d1x / len1, d1y / len1);
    let (u2x, u2y) = (d2x / len2, d2y / len2);
    
    // Dot product gives cos(angle)
    let dot = u1x * u2x + u1y * u2y;
    
    // Clamp to [-1, 1] for numerical stability
    dot.clamp(-1.0, 1.0).acos()
}

/// Measure the radius of a circle or arc
pub fn measure_radius(radius: f64) -> f64 {
    radius.abs()
}

/// Measure the arc length of an arc
/// Args: radius, start_angle (radians), end_angle (radians)
pub fn measure_arc_length(radius: f64, start_angle: f64, end_angle: f64) -> f64 {
    let mut angle_diff = end_angle - start_angle;
    // Normalize to positive angle
    while angle_diff < 0.0 {
        angle_diff += std::f64::consts::TAU;
    }
    while angle_diff > std::f64::consts::TAU {
        angle_diff -= std::f64::consts::TAU;
    }
    radius.abs() * angle_diff
}

/// Measure the circumference of a circle
pub fn measure_circumference(radius: f64) -> f64 {
    std::f64::consts::TAU * radius.abs()
}

/// Measure the distance between the center of a circle/arc and a point
pub fn measure_center_point_distance(center: [f64; 2], point: [f64; 2]) -> f64 {
    measure_point_point_distance(center, point)
}

/// Measure between two sketch entities
/// Returns a MeasurementResult based on entity types
pub fn measure_entities(entity1: &SketchEntity, entity2: &SketchEntity) -> MeasurementResult {
    use SketchGeometry::*;
    
    match (&entity1.geometry, &entity2.geometry) {
        // Point to Point
        (Point { pos: p1 }, Point { pos: p2 }) => {
            MeasurementResult::Distance { value: measure_point_point_distance(*p1, *p2) }
        }
        
        // Point to Line
        (Point { pos }, Line { start, end }) | (Line { start, end }, Point { pos }) => {
            MeasurementResult::Distance { 
                value: measure_point_line_distance(*pos, *start, *end) 
            }
        }
        
        // Line to Line (angle)
        (Line { start: s1, end: e1 }, Line { start: s2, end: e2 }) => {
            MeasurementResult::Angle { 
                value: measure_line_line_angle(*s1, *e1, *s2, *e2) 
            }
        }
        
        // Point to Circle center
        (Point { pos }, Circle { center, .. }) | (Circle { center, .. }, Point { pos }) => {
            MeasurementResult::Distance { 
                value: measure_point_point_distance(*pos, *center) 
            }
        }
        
        // Point to Arc center
        (Point { pos }, Arc { center, .. }) | (Arc { center, .. }, Point { pos }) => {
            MeasurementResult::Distance { 
                value: measure_point_point_distance(*pos, *center) 
            }
        }
        
        // Two Circles: same = radius, different = center-to-center distance
        (Circle { center: c1, radius, .. }, Circle { center: c2, .. }) => {
            if entity1.id == entity2.id {
                return MeasurementResult::Radius { value: *radius };
            }
            MeasurementResult::Distance { 
                value: measure_point_point_distance(*c1, *c2) 
            }
        }
        // Two different Arcs: center to center distance
        (Arc { center: c1, radius, start_angle, end_angle, .. }, Arc { center: c2, .. }) => {
            if entity1.id == entity2.id {
                // Same arc: report arc length
                return MeasurementResult::ArcLength { 
                    value: measure_arc_length(*radius, *start_angle, *end_angle) 
                };
            }
            MeasurementResult::Distance { 
                value: measure_point_point_distance(*c1, *c2) 
            }
        }
        
        (Circle { center: c1, .. }, Arc { center: c2, .. }) | 
        (Arc { center: c2, .. }, Circle { center: c1, .. }) => {
            MeasurementResult::Distance { 
                value: measure_point_point_distance(*c1, *c2) 
            }
        }
        // Line to Point already covered
        (Line { start, end }, Point { pos }) => {
            MeasurementResult::Distance { 
                value: measure_point_line_distance(*pos, *start, *end) 
            }
        }
        
        // Unsupported combinations
        _ => MeasurementResult::Error { 
            message: format!(
                "Cannot measure between {:?} and {:?}", 
                std::mem::discriminant(&entity1.geometry),
                std::mem::discriminant(&entity2.geometry)
            ) 
        }
    }
}

/// Get a specific point from a sketch entity
/// point_index: 0 = start/center, 1 = end
pub fn get_entity_point(entity: &SketchEntity, point_index: u8) -> Option<[f64; 2]> {
    match &entity.geometry {
        SketchGeometry::Point { pos } => Some(*pos),
        SketchGeometry::Line { start, end } => match point_index {
            0 => Some(*start),
            1 => Some(*end),
            _ => None,
        },
        SketchGeometry::Circle { center, .. } => Some(*center),
        SketchGeometry::Arc { center, radius, start_angle, end_angle } => match point_index {
            0 => Some(*center),
            1 => Some([center[0] + radius * start_angle.cos(), center[1] + radius * start_angle.sin()]),
            2 => Some([center[0] + radius * end_angle.cos(), center[1] + radius * end_angle.sin()]),
            _ => None,
        },
        SketchGeometry::Ellipse { center, .. } => Some(*center),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::topo::EntityId;

    #[test]
    fn test_point_point_distance() {
        let p1 = [0.0, 0.0];
        let p2 = [3.0, 4.0];
        assert!((measure_point_point_distance(p1, p2) - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_point_point_distance_same() {
        let p = [5.0, 5.0];
        assert!(measure_point_point_distance(p, p) < 1e-15);
    }

    #[test]
    fn test_point_line_distance() {
        // Point above horizontal line
        let point = [5.0, 3.0];
        let line_start = [0.0, 0.0];
        let line_end = [10.0, 0.0];
        assert!((measure_point_line_distance(point, line_start, line_end) - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_point_line_distance_on_line() {
        let point = [5.0, 0.0];
        let line_start = [0.0, 0.0];
        let line_end = [10.0, 0.0];
        assert!(measure_point_line_distance(point, line_start, line_end) < 1e-10);
    }

    #[test]
    fn test_point_line_distance_diagonal() {
        // Point at origin, line from (1,0) to (1,1) - distance should be 1.0
        let point = [0.0, 0.0];
        let line_start = [1.0, 0.0];
        let line_end = [1.0, 1.0];
        assert!((measure_point_line_distance(point, line_start, line_end) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_line_line_angle_perpendicular() {
        let l1_start = [0.0, 0.0];
        let l1_end = [1.0, 0.0];
        let l2_start = [0.0, 0.0];
        let l2_end = [0.0, 1.0];
        let angle = measure_line_line_angle(l1_start, l1_end, l2_start, l2_end);
        assert!((angle - std::f64::consts::FRAC_PI_2).abs() < 1e-10);
    }

    #[test]
    fn test_line_line_angle_parallel() {
        let l1_start = [0.0, 0.0];
        let l1_end = [1.0, 0.0];
        let l2_start = [0.0, 5.0];
        let l2_end = [1.0, 5.0];
        let angle = measure_line_line_angle(l1_start, l1_end, l2_start, l2_end);
        assert!(angle.abs() < 1e-10);
    }

    #[test]
    fn test_line_line_angle_45_degrees() {
        let l1_start = [0.0, 0.0];
        let l1_end = [1.0, 0.0];
        let l2_start = [0.0, 0.0];
        let l2_end = [1.0, 1.0];
        let angle = measure_line_line_angle(l1_start, l1_end, l2_start, l2_end);
        assert!((angle - std::f64::consts::FRAC_PI_4).abs() < 1e-10);
    }

    #[test]
    fn test_arc_length() {
        // Quarter circle with radius 2
        let length = measure_arc_length(2.0, 0.0, std::f64::consts::FRAC_PI_2);
        // Arc length = r * theta = 2 * PI/2 = PI
        assert!((length - std::f64::consts::PI).abs() < 1e-10);
    }

    #[test]
    fn test_circumference() {
        let circ = measure_circumference(1.0);
        assert!((circ - std::f64::consts::TAU).abs() < 1e-10);
    }

    #[test]
    fn test_measure_entities_points() {
        let e1 = SketchEntity {
            id: crate::topo::EntityId::new(),
            geometry: SketchGeometry::Point { pos: [0.0, 0.0] },
            is_construction: false,
        };
        let e2 = SketchEntity {
            id: crate::topo::EntityId::new(),
            geometry: SketchGeometry::Point { pos: [3.0, 4.0] },
            is_construction: false,
        };
        
        match measure_entities(&e1, &e2) {
            MeasurementResult::Distance { value } => {
                assert!((value - 5.0).abs() < 1e-10);
            }
            _ => panic!("Expected Distance result"),
        }
    }

    #[test]
    fn test_measure_entities_lines_angle() {
        let e1 = SketchEntity {
            id: crate::topo::EntityId::new(),
            geometry: SketchGeometry::Line { start: [0.0, 0.0], end: [1.0, 0.0] },
            is_construction: false,
        };
        let e2 = SketchEntity {
            id: crate::topo::EntityId::new(),
            geometry: SketchGeometry::Line { start: [0.0, 0.0], end: [0.0, 1.0] },
            is_construction: false,
        };
        
        match measure_entities(&e1, &e2) {
            MeasurementResult::Angle { value } => {
                assert!((value - std::f64::consts::FRAC_PI_2).abs() < 1e-10);
            }
            _ => panic!("Expected Angle result"),
        }
    }

    #[test]
    fn test_get_entity_point_line() {
        let e = SketchEntity {
            id: crate::topo::EntityId::new(),
            geometry: SketchGeometry::Line { start: [1.0, 2.0], end: [3.0, 4.0] },
            is_construction: false,
        };
        
        assert_eq!(get_entity_point(&e, 0), Some([1.0, 2.0]));
        assert_eq!(get_entity_point(&e, 1), Some([3.0, 4.0]));
        assert_eq!(get_entity_point(&e, 2), None);
    }
}
