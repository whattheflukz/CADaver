//! Snap point detection for sketch mode
//! 
//! Provides snap-to-point detection for professional sketch usability,
//! supporting endpoint, midpoint, center, intersection, origin, and grid snapping.

use super::types::{Sketch, SketchGeometry};
use crate::geometry::intersection::line_line_intersection;
use crate::topo::EntityId;
use serde::{Deserialize, Serialize};

/// Types of snap points available in sketch mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SnapType {
    /// Snap to line endpoints, arc endpoints
    Endpoint,
    /// Snap to line midpoints
    Midpoint,
    /// Snap to circle/arc centers
    Center,
    /// Snap to intersection of two entities
    Intersection,
    /// Snap to sketch origin (0, 0)
    Origin,
    /// Snap to grid points
    Grid,
}

impl SnapType {
    /// Priority for snap types (lower = higher priority)
    /// This determines which snap wins when multiple are within threshold
    pub fn priority(&self) -> u8 {
        match self {
            SnapType::Endpoint => 1,
            SnapType::Center => 2,
            SnapType::Intersection => 3,
            SnapType::Midpoint => 4,
            SnapType::Origin => 5,
            SnapType::Grid => 10,
        }
    }
}

/// A detected snap point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapPoint {
    /// The position to snap to
    pub position: [f64; 2],
    /// Type of snap
    pub snap_type: SnapType,
    /// Entity ID if snap is associated with an entity
    pub entity_id: Option<EntityId>,
    /// Distance from cursor (for sorting)
    pub distance: f64,
}

/// Configuration for snap detection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapConfig {
    /// Maximum distance (in sketch units) for a snap to activate
    pub snap_radius: f64,
    /// Enable endpoint snapping
    pub enable_endpoint: bool,
    /// Enable midpoint snapping
    pub enable_midpoint: bool,
    /// Enable center snapping (circle/arc centers)
    pub enable_center: bool,
    /// Enable intersection snapping
    pub enable_intersection: bool,
    /// Enable origin snapping (0, 0)
    pub enable_origin: bool,
    /// Enable grid snapping
    pub enable_grid: bool,
    /// Grid spacing for grid snapping
    pub grid_spacing: f64,
}

impl Default for SnapConfig {
    fn default() -> Self {
        Self {
            snap_radius: 0.5, // Half a unit default
            enable_endpoint: true,
            enable_midpoint: true,
            enable_center: true,
            enable_intersection: true,
            enable_origin: true,
            enable_grid: false, // Off by default
            grid_spacing: 1.0,
        }
    }
}

/// Calculate distance between two 2D points
fn distance(a: [f64; 2], b: [f64; 2]) -> f64 {
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    (dx * dx + dy * dy).sqrt()
}

/// Find all snap points within the sketch that are near the cursor
pub fn find_snap_points(
    cursor: [f64; 2],
    sketch: &Sketch,
    config: &SnapConfig,
) -> Vec<SnapPoint> {
    let mut snaps = Vec::new();

    // Collect snap candidates from entities
    for entity in &sketch.entities {
        // Skip preview entities
        if entity.id.to_string().starts_with("preview_") {
            continue;
        }

        match &entity.geometry {
            SketchGeometry::Line { start, end } => {
                // Endpoint snapping
                if config.enable_endpoint {
                    let d_start = distance(cursor, *start);
                    if d_start <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *start,
                            snap_type: SnapType::Endpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d_start,
                        });
                    }

                    let d_end = distance(cursor, *end);
                    if d_end <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *end,
                            snap_type: SnapType::Endpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d_end,
                        });
                    }
                }

                // Midpoint snapping
                if config.enable_midpoint {
                    let mid = [
                        (start[0] + end[0]) / 2.0,
                        (start[1] + end[1]) / 2.0,
                    ];
                    let d_mid = distance(cursor, mid);
                    if d_mid <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: mid,
                            snap_type: SnapType::Midpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d_mid,
                        });
                    }
                }
            }

            SketchGeometry::Circle { center, radius: _ } => {
                // Center snapping
                if config.enable_center {
                    let d = distance(cursor, *center);
                    if d <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *center,
                            snap_type: SnapType::Center,
                            entity_id: Some(entity.id.clone()),
                            distance: d,
                        });
                    }
                }
            }

            SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                // Center snapping
                if config.enable_center {
                    let d = distance(cursor, *center);
                    if d <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *center,
                            snap_type: SnapType::Center,
                            entity_id: Some(entity.id.clone()),
                            distance: d,
                        });
                    }
                }

                // Arc endpoint snapping
                if config.enable_endpoint {
                    let start_pt = [
                        center[0] + radius * start_angle.cos(),
                        center[1] + radius * start_angle.sin(),
                    ];
                    let end_pt = [
                        center[0] + radius * end_angle.cos(),
                        center[1] + radius * end_angle.sin(),
                    ];

                    let d_start = distance(cursor, start_pt);
                    if d_start <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: start_pt,
                            snap_type: SnapType::Endpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d_start,
                        });
                    }

                    let d_end = distance(cursor, end_pt);
                    if d_end <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: end_pt,
                            snap_type: SnapType::Endpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d_end,
                        });
                    }
                }
            }

            SketchGeometry::Point { pos } => {
                // Point snapping (as endpoint)
                if config.enable_endpoint {
                    let d = distance(cursor, *pos);
                    if d <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *pos,
                            snap_type: SnapType::Endpoint,
                            entity_id: Some(entity.id.clone()),
                            distance: d,
                        });
                    }
                }
            }

            SketchGeometry::Ellipse { center, .. } => {
                // Center snapping for ellipse
                if config.enable_center {
                    let d = distance(cursor, *center);
                    if d <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: *center,
                            snap_type: SnapType::Center,
                            entity_id: Some(entity.id.clone()),
                            distance: d,
                        });
                    }
                }
            }
        }
    }

    // Intersection snapping (line-line only for now)
    if config.enable_intersection {
        let lines: Vec<_> = sketch.entities.iter()
            .filter(|e| !e.id.to_string().starts_with("preview_"))
            .filter_map(|e| match &e.geometry {
                SketchGeometry::Line { start, end } => Some((e.id.clone(), *start, *end)),
                _ => None,
            })
            .collect();

        for i in 0..lines.len() {
            for j in (i + 1)..lines.len() {
                let (_, s1, e1) = &lines[i];
                let (_, s2, e2) = &lines[j];

                if let Some(intersection) = line_line_intersection(*s1, *e1, *s2, *e2) {
                    let d = distance(cursor, intersection);
                    if d <= config.snap_radius {
                        snaps.push(SnapPoint {
                            position: intersection,
                            snap_type: SnapType::Intersection,
                            entity_id: None, // Intersection involves two entities
                            distance: d,
                        });
                    }
                }
            }
        }
    }

    // Origin snapping
    if config.enable_origin {
        let origin = [0.0, 0.0];
        let d = distance(cursor, origin);
        if d <= config.snap_radius {
            snaps.push(SnapPoint {
                position: origin,
                snap_type: SnapType::Origin,
                entity_id: None,
                distance: d,
            });
        }
    }

    // Grid snapping
    if config.enable_grid && config.grid_spacing > 0.0 {
        let grid_x = (cursor[0] / config.grid_spacing).round() * config.grid_spacing;
        let grid_y = (cursor[1] / config.grid_spacing).round() * config.grid_spacing;
        let grid_pt = [grid_x, grid_y];
        let d = distance(cursor, grid_pt);
        if d <= config.snap_radius {
            snaps.push(SnapPoint {
                position: grid_pt,
                snap_type: SnapType::Grid,
                entity_id: None,
                distance: d,
            });
        }
    }

    snaps
}

/// Find the best snap point for the cursor position.
/// Returns the highest-priority snap point within the snap radius.
pub fn snap_cursor(
    cursor: [f64; 2],
    sketch: &Sketch,
    config: &SnapConfig,
) -> Option<SnapPoint> {
    let mut snaps = find_snap_points(cursor, sketch, config);

    if snaps.is_empty() {
        return None;
    }

    // Sort by priority first, then by distance
    snaps.sort_by(|a, b| {
        let pri_cmp = a.snap_type.priority().cmp(&b.snap_type.priority());
        if pri_cmp == std::cmp::Ordering::Equal {
            a.distance.partial_cmp(&b.distance).unwrap_or(std::cmp::Ordering::Equal)
        } else {
            pri_cmp
        }
    });

    snaps.into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sketch::types::{SketchPlane, SketchEntity};

    fn create_test_sketch() -> Sketch {
        let mut sketch = Sketch::new(SketchPlane::default());
        
        // Add a line from (0, 0) to (10, 0)
        sketch.entities.push(SketchEntity {
            id: EntityId::new_deterministic("line1"),
            geometry: SketchGeometry::Line {
                start: [0.0, 0.0],
                end: [10.0, 0.0],
            },
            is_construction: false,
        });

        // Add a circle at (5, 5) with radius 2
        sketch.entities.push(SketchEntity {
            id: EntityId::new_deterministic("circle1"),
            geometry: SketchGeometry::Circle {
                center: [5.0, 5.0],
                radius: 2.0,
            },
            is_construction: false,
        });

        // Add a second line from (10, 0) to (10, 10) 
        sketch.entities.push(SketchEntity {
            id: EntityId::new_deterministic("line2"),
            geometry: SketchGeometry::Line {
                start: [10.0, 0.0],
                end: [10.0, 10.0],
            },
            is_construction: false,
        });

        sketch
    }

    #[test]
    fn test_endpoint_snapping() {
        let sketch = create_test_sketch();
        let config = SnapConfig::default();

        // Cursor near (0, 0) - should snap to line endpoint
        let result = snap_cursor([0.1, 0.1], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Endpoint);
        assert!((snap.position[0] - 0.0).abs() < 1e-6);
        assert!((snap.position[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_midpoint_snapping() {
        let sketch = create_test_sketch();
        let config = SnapConfig::default();

        // Cursor near midpoint of line (5, 0)
        let result = snap_cursor([5.0, 0.2], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Midpoint);
        assert!((snap.position[0] - 5.0).abs() < 1e-6);
        assert!((snap.position[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_center_snapping() {
        let sketch = create_test_sketch();
        let config = SnapConfig::default();

        // Cursor near circle center (5, 5)
        let result = snap_cursor([5.1, 5.1], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Center);
        assert!((snap.position[0] - 5.0).abs() < 1e-6);
        assert!((snap.position[1] - 5.0).abs() < 1e-6);
    }

    #[test]
    fn test_intersection_snapping() {
        let mut sketch = Sketch::new(SketchPlane::default());
        
        // Two crossing lines
        sketch.entities.push(SketchEntity {
            id: EntityId::new_deterministic("line_x"),
            geometry: SketchGeometry::Line {
                start: [0.0, 0.0],
                end: [10.0, 10.0],
            },
            is_construction: false,
        });
        sketch.entities.push(SketchEntity {
            id: EntityId::new_deterministic("line_y"),
            geometry: SketchGeometry::Line {
                start: [0.0, 10.0],
                end: [10.0, 0.0],
            },
            is_construction: false,
        });

        let config = SnapConfig::default();

        // Cursor near intersection (5, 5)
        let result = snap_cursor([5.1, 5.1], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Intersection);
        assert!((snap.position[0] - 5.0).abs() < 1e-6);
        assert!((snap.position[1] - 5.0).abs() < 1e-6);
    }


    #[test]
    fn test_origin_snapping() {
        // Empty sketch - only origin should be available
        let sketch = Sketch::new(SketchPlane::default());
        let config = SnapConfig::default();

        let result = snap_cursor([0.1, 0.1], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Origin);
        assert!((snap.position[0] - 0.0).abs() < 1e-6);
        assert!((snap.position[1] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn test_grid_snapping() {
        let sketch = Sketch::new(SketchPlane::default());
        let mut config = SnapConfig::default();
        config.enable_grid = true;
        config.grid_spacing = 1.0;
        config.snap_radius = 1.0; // Increase to catch grid

        // Cursor at (2.3, 3.7) should snap to (2, 4)
        let result = snap_cursor([2.3, 3.7], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Grid);
        assert!((snap.position[0] - 2.0).abs() < 1e-6);
        assert!((snap.position[1] - 4.0).abs() < 1e-6);
    }

    #[test]
    fn test_snap_priority() {
        // When cursor is exactly at origin (0,0) which is also an endpoint,
        // endpoint should have higher priority
        let sketch = create_test_sketch();
        let config = SnapConfig::default();

        let result = snap_cursor([0.0, 0.0], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        // Endpoint has priority 1, Origin has priority 5
        assert_eq!(snap.snap_type, SnapType::Endpoint);
    }

    #[test]
    fn test_snap_config_toggle() {
        let sketch = create_test_sketch();
        let mut config = SnapConfig::default();
        
        // Disable endpoint snapping
        config.enable_endpoint = false;

        // Cursor near (0, 0) - should not snap to endpoint, but should snap to origin
        let result = snap_cursor([0.1, 0.1], &sketch, &config);
        assert!(result.is_some());
        let snap = result.unwrap();
        assert_eq!(snap.snap_type, SnapType::Origin);
    }

    #[test]
    fn test_no_snap_outside_radius() {
        let sketch = create_test_sketch();
        let config = SnapConfig::default();

        // Cursor far from any snap point
        let result = snap_cursor([100.0, 100.0], &sketch, &config);
        assert!(result.is_none());
    }
}
