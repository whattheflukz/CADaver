use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint};
use crate::sketch::solver::SketchSolver;

#[test]
fn test_solver_circle_radius() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create Circle with radius 10.0
    let c1 = sketch.add_entity(SketchGeometry::Circle { center: [0.0, 0.0], radius: 10.0 });

    // Add Radius Constraint for 20.0
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 20.0, style: None });

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    if let SketchGeometry::Circle { radius, .. } = sketch.entities[0].geometry {
        assert!((radius - 20.0).abs() < 1e-5, "Radius should be updated to 20.0");
    } else {
        panic!("Geometry mismatch");
    }
}

#[test]
fn test_solver_arc_radius() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create Arc with radius 10.0
    let a1 = sketch.add_entity(SketchGeometry::Arc { 
        center: [0.0, 0.0], 
        radius: 10.0, 
        start_angle: 0.0, 
        end_angle: 1.57 
    });

    // Add Radius Constraint for 15.0
    sketch.constraints.push(SketchConstraint::Radius { entity: a1, value: 15.0, style: None });

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    if let SketchGeometry::Arc { radius, .. } = sketch.entities[0].geometry {
        assert!((radius - 15.0).abs() < 1e-5, "Radius should be updated to 15.0");
    } else {
        panic!("Geometry mismatch");
    }
}

#[test]
fn test_solver_radius_conflict() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create Circle
    let c1 = sketch.add_entity(SketchGeometry::Circle { center: [0.0, 0.0], radius: 10.0 });

    // Add Conflicting Radius Constraints
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 20.0, style: None });
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 30.0, style: None });

    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert!(!result.converged, "Solver should not converge with conflicting radii");
    assert!(result.conflicts.is_some(), "Should detect conflicts");
}
