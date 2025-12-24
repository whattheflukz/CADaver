//! Tests for constraint suppression functionality

use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, SketchConstraintEntry, ConstraintPoint};
use crate::sketch::solver::SketchSolver;

/// Test that a suppressed Horizontal constraint does not affect geometry
#[test]
fn test_suppressed_constraint_ignored() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create diagonal line
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });

    // Add Horizontal constraint but suppressed
    sketch.constraints.push(SketchConstraintEntry::suppressed(
        SketchConstraint::Horizontal { entity: l1 }
    ));

    // Solve
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    // Check that line is NOT horizontal (constraint was suppressed)
    let ent = &sketch.entities[0];
    if let SketchGeometry::Line { start, end } = ent.geometry {
        // The line should remain diagonal since constraint is suppressed
        assert!((start[1] - end[1]).abs() > 0.1, 
            "Line should NOT be horizontal when constraint is suppressed. y1={}, y2={}", start[1], end[1]);
    } else { 
        panic!("Wrong geometry type"); 
    }
}

/// Test that DOF calculation excludes suppressed constraints
#[test]
fn test_suppressed_constraint_dof() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create a line (4 DOF for a line)
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });

    // Get result with no constraints
    let result_none = SketchSolver::solve_with_result(&mut sketch);
    let dof_none = result_none.dof;

    // Add active Horizontal constraint (removes 1 DOF)
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
    let result_active = SketchSolver::solve_with_result(&mut sketch);
    let dof_active = result_active.dof;

    assert_eq!(dof_none - 1, dof_active, "Active constraint should reduce DOF by 1");

    // Now suppress the constraint
    sketch.set_constraint_suppression(0, true);
    let result_suppressed = SketchSolver::solve_with_result(&mut sketch);
    let dof_suppressed = result_suppressed.dof;

    assert_eq!(dof_none, dof_suppressed, "Suppressed constraint should not affect DOF");
}

/// Test toggle suppression on/off
#[test]
fn test_toggle_constraint_suppression() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create diagonal line
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });

    // Add active Horizontal constraint
    sketch.add_constraint(SketchConstraint::Horizontal { entity: l1 });
    
    // Solve - should be horizontal
    SketchSolver::solve(&mut sketch);
    if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
        assert!((start[1] - end[1]).abs() < 1e-5, "Should be horizontal with active constraint");
    }

    // Re-diagonalize the line to test suppression effect
    if let SketchGeometry::Line { ref mut start, ref mut end } = sketch.entities[0].geometry {
        *start = [0.0, 0.0];
        *end = [10.0, 5.0];
    }

    // Suppress the constraint
    let new_state = sketch.toggle_constraint_suppression(0);
    assert!(new_state, "Constraint should now be suppressed");

    // Solve - should remain diagonal
    SketchSolver::solve(&mut sketch);
    if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
        assert!((start[1] - end[1]).abs() > 0.1, "Should be diagonal with suppressed constraint");
    }

    // Unsuppress
    let new_state = sketch.toggle_constraint_suppression(0);
    assert!(!new_state, "Constraint should now be active");

    // Solve - should become horizontal again
    SketchSolver::solve(&mut sketch);
    if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
        assert!((start[1] - end[1]).abs() < 1e-5, "Should be horizontal with unsuppressed constraint");
    }
}

/// Test mixed active and suppressed constraints
#[test]
fn test_mixed_active_and_suppressed() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create two lines
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
    let l2 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [5.0, 10.0] });

    // Add Horizontal on L1 (active)
    sketch.add_constraint(SketchConstraint::Horizontal { entity: l1 });
    
    // Add Horizontal on L2 (suppressed)
    sketch.add_constraint_with_suppression(
        SketchConstraint::Horizontal { entity: l2 },
        true
    );

    // Solve
    SketchSolver::solve(&mut sketch);

    // L1 should be horizontal
    if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
        assert!((start[1] - end[1]).abs() < 1e-5, "L1 should be horizontal");
    }

    // L2 should NOT be horizontal (its constraint is suppressed)
    if let SketchGeometry::Line { start, end } = sketch.entities[1].geometry {
        assert!((start[1] - end[1]).abs() > 0.1, "L2 should NOT be horizontal (suppressed)");
    }
}
