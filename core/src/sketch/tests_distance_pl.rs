use super::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};
use super::solver::SketchSolver;

#[test]
fn test_distance_point_line() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Line from (0,0) to (10,0) [Horizontal on X-axis]
    let line_id = sketch.add_entity(SketchGeometry::Line { 
        start: [0.0, 0.0], 
        end: [10.0, 0.0] 
    }.into());
    
    // Point at (5, 5)
    let point_id = sketch.add_entity(SketchGeometry::Point { pos: [5.0, 5.0] });
    
    // Constrain distance to 2.0
    // Point should move to (5, 2) or (5, -2) depending on what's closer. Here (5, 2).
    // Or (5, 8)? No, distance is absolute. 5.0 -> 2.0.
    
    // Fix the line so it doesn't move
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: line_id, index: 0 }, 
        position: [0.0, 0.0] 
    }.into());
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: line_id, index: 1 }, 
        position: [10.0, 0.0] 
    }.into());
    
    sketch.constraints.push(SketchConstraint::DistancePointLine {
        point: ConstraintPoint { id: point_id, index: 0 },
        line: line_id,
        value: 2.0,
        style: None
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    assert!(result.converged, "Solver should converge");
    
    if let SketchGeometry::Point { pos } = &sketch.entities[1].geometry {
        println!("Final Point Pos: {:?}", pos);
        // Should be at y=2.0 (since it started at y=5.0)
        assert!((pos[1] - 2.0).abs() < 1e-4);
        // X shouldn't change much (orthogonal projection is at x=5)
        assert!((pos[0] - 5.0).abs() < 1e-4);
    } else {
        panic!("Wrong geometry type");
    }
}

#[test]
fn test_distance_point_line_move_line() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Line from (0,0) to (10,0)
    let line_id = sketch.add_entity(SketchGeometry::Line { 
        start: [0.0, 0.0], 
        end: [10.0, 0.0] 
    }.into());
    
    // Point at (5, 5) -> Fixed
    let point_id = sketch.add_entity(SketchGeometry::Point { pos: [5.0, 5.0] });
    
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: point_id, index: 0 }, 
        position: [5.0, 5.0] 
    }.into());
    
    // Constrain distance to 2.0
    // Line should move up to y=3.0 (dist=2 from 5)
    sketch.constraints.push(SketchConstraint::DistancePointLine {
        point: ConstraintPoint { id: point_id, index: 0 },
        line: line_id,
        value: 2.0,
        style: None
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    assert!(result.converged);
    
    if let SketchGeometry::Line { start, end } = &sketch.entities[0].geometry {
        println!("Final Line Y: {}", start[1]);
        assert!((start[1] - 3.0).abs() < 1e-4);
        assert!((end[1] - 3.0).abs() < 1e-4);
    }
}
