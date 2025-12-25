use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};
use crate::sketch::solver::SketchSolver;

#[test]
fn test_solver_horizontal_distance() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Points at (0,0) and (10,5)
    let p1 = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 0.0] });
    let p2 = sketch.add_entity(SketchGeometry::Point { pos: [10.0, 5.0] });

    // Horizontal Distance = 20.0 (X distance should be 20)
    // Existing X dist is 10. Solver should move them apart.
    sketch.constraints.push(SketchConstraint::HorizontalDistance { 
        points: [
            ConstraintPoint { id: p1, index: 0 },
            ConstraintPoint { id: p2, index: 0 }
        ],
        value: 20.0,
        style: None 
    }.into());

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    if let (SketchGeometry::Point { pos: pos1 }, SketchGeometry::Point { pos: pos2 }) = 
        (&sketch.entities[0].geometry, &sketch.entities[1].geometry) {
        let dx = (pos1[0] - pos2[0]).abs();
        assert!((dx - 20.0).abs() < 1e-4, "Horizontal distance should be 20.0, got {}", dx);
    } else { panic!("Wrong geometry"); }
}

#[test]
fn test_solver_vertical_distance() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Points at (0,0) and (10,5)
    let p1 = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 0.0] });
    let p2 = sketch.add_entity(SketchGeometry::Point { pos: [10.0, 5.0] });

    // Vertical Distance = 15.0 (Y distance should be 15)
    // Existing Y dist is 5. Solver should move them apart.
    sketch.constraints.push(SketchConstraint::VerticalDistance { 
        points: [
            ConstraintPoint { id: p1, index: 0 },
            ConstraintPoint { id: p2, index: 0 }
        ],
        value: 15.0,
        style: None 
    }.into());

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    if let (SketchGeometry::Point { pos: pos1 }, SketchGeometry::Point { pos: pos2 }) = 
        (&sketch.entities[0].geometry, &sketch.entities[1].geometry) {
        let dy = (pos1[1] - pos2[1]).abs();
        assert!((dy - 15.0).abs() < 1e-4, "Vertical distance should be 15.0, got {}", dy);
    } else { panic!("Wrong geometry"); }
}
