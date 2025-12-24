use super::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};
use super::solver::SketchSolver;

#[test]
fn test_ellipse_center_constraint() {
    let mut sketch = Sketch::new(SketchPlane::default());
    let ellipse = sketch.add_entity(SketchGeometry::Ellipse { 
        center: [0.0, 0.0], 
        semi_major: 10.0, 
        semi_minor: 5.0, 
        rotation: 0.0 
    }.into());

    // Constrain center to (5,5)
    sketch.constraints.push(SketchConstraint::Fix {
        point: ConstraintPoint { id: ellipse, index: 0 },
        position: [5.0, 5.0],
    }.into());

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged);

    if let SketchGeometry::Ellipse { center, .. } = sketch.entities[0].geometry {
        assert!((center[0] - 5.0).abs() < 1e-4);
        assert!((center[1] - 5.0).abs() < 1e-4);
    } else {
        panic!("Wrong geometry type");
    }
}

#[test]
fn test_ellipse_major_axis_point() {
    let mut sketch = Sketch::new(SketchPlane::default());
    // Ellipse at origin, major=10 (extends to x=10), minor=5, rot=0
    let ellipse = sketch.add_entity(SketchGeometry::Ellipse { 
        center: [0.0, 0.0], 
        semi_major: 10.0, 
        semi_minor: 5.0, 
        rotation: 0.0 
    }.into());

    // Try to access Major Axis Endpoint (Index 1)
    // Theoretically should be at (10, 0)
    // We want to constrain it to (12, 0), which should increase semi_major to 12
    sketch.constraints.push(SketchConstraint::Fix {
        point: ConstraintPoint { id: ellipse, index: 1 },
        position: [12.0, 0.0],
    }.into());

    let converged = SketchSolver::solve(&mut sketch);
    
    assert!(converged);
    

    
    // We want to assert that the value CHANGED.
    if let SketchGeometry::Ellipse { semi_major, .. } = sketch.entities[0].geometry {
        assert!((semi_major - 12.0).abs() < 1e-4, "Semi-major axis did not update, was {}", semi_major);
    }
}

#[test]
fn test_ellipse_horizontal_constraint() {
    let mut sketch = Sketch::new(SketchPlane::default());
    // Ellipse at 45 degrees
    let ellipse = sketch.add_entity(SketchGeometry::Ellipse { 
        center: [0.0, 0.0], 
        semi_major: 10.0, 
        semi_minor: 5.0, 
        rotation: std::f64::consts::FRAC_PI_4 
    }.into());

    // Constrain Horizontal
    sketch.constraints.push(SketchConstraint::Horizontal { entity: ellipse }.into());

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged);

    if let SketchGeometry::Ellipse { rotation, .. } = sketch.entities[0].geometry {
        // Should be 0 (or PI, or -PI)
        let sin_rot = rotation.sin().abs();
        assert!(sin_rot < 1e-4, "Ellipse should be horizontal, rotation was {}", rotation);
    }
}
