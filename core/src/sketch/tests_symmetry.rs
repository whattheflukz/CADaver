use super::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};
use super::solver::SketchSolver;

#[test]
fn test_symmetry_vertical_axis() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Axis: Vertical line at x=5
    let axis = sketch.add_entity(SketchGeometry::Line { 
        start: [5.0, 0.0], 
        end: [5.0, 10.0] 
    }.into());
    
    // P1 at (0, 5)
    let p1_id = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 5.0] });
    
    // P2 at (8, 5) - Intentionally asymmetric (should be at 10, 5)
    let p2_id = sketch.add_entity(SketchGeometry::Point { pos: [8.0, 5.0] });
    
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: axis, index: 0 }, 
        position: [5.0, 0.0] 
    }.into());
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: axis, index: 1 }, 
        position: [5.0, 10.0] 
    }.into());
    
    sketch.constraints.push(SketchConstraint::Symmetric {
        p1: ConstraintPoint { id: p1_id, index: 0 },
        p2: ConstraintPoint { id: p2_id, index: 0 },
        axis: axis
    }.into());
    
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged);
    
    // Check positions
    if let (
        SketchGeometry::Point { pos: pos1 }, 
        SketchGeometry::Point { pos: pos2 }
    ) = (&sketch.entities[1].geometry, &sketch.entities[2].geometry) {
        // They should meet in the middle of their error?
        // Initial dist to axis: P1=5, P2=3.
        // Average dist = 4.
        // So P1 should be at (1, 5) and P2 at (9, 5).
        // Let's check symmetry property: Midpoint should be on axis (x=5)
        let mid_x = (pos1[0] + pos2[0]) * 0.5;
        assert!((mid_x - 5.0).abs() < 1e-4, "Midpoint x should be 5.0, got {}", mid_x);
        
        // Y coords should remain roughly 5.0 (since projection is perpendicular)
        assert!((pos1[1] - 5.0).abs() < 1e-4);
        assert!((pos2[1] - 5.0).abs() < 1e-4);
        
        // Distance from axis should be equal
        let dist1 = (pos1[0] - 5.0).abs();
        let dist2 = (pos2[0] - 5.0).abs();
        assert!((dist1 - dist2).abs() < 1e-4);
    } else {
        panic!("Wrong geometry");
    }
}

#[test]
fn test_symmetry_diagonal_axis() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Axis: Line y = x (0,0) to (10,10)
    let axis = sketch.add_entity(SketchGeometry::Line { 
        start: [0.0, 0.0], 
        end: [10.0, 10.0] 
    }.into());
    
    // Fix axis
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: axis, index: 0 }, 
        position: [0.0, 0.0] 
    }.into());
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: axis, index: 1 }, 
        position: [10.0, 10.0] 
    }.into());
    
    // P1 at (2, 0)
    let p1_id = sketch.add_entity(SketchGeometry::Point { pos: [2.0, 0.0] });
    
    // P2 at (0, 3) - Should become (0, 2) to be symmetric to (2, 0) across y=x
    let p2_id = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 3.0] });
    
    // Fix P1 to force P2 to move
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: p1_id, index: 0 }, 
        position: [2.0, 0.0] 
    }.into());
    
    sketch.constraints.push(SketchConstraint::Symmetric {
        p1: ConstraintPoint { id: p1_id, index: 0 },
        p2: ConstraintPoint { id: p2_id, index: 0 },
        axis: axis
    }.into());
    
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged);
    
    if let SketchGeometry::Point { pos: pos2 } = &sketch.entities[2].geometry {
        // Reflection of (2,0) across y=x is (0,2)
        assert!((pos2[0] - 0.0).abs() < 1e-4);
        assert!((pos2[1] - 2.0).abs() < 1e-4);
    }
}
