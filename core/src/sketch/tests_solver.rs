use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};
use crate::sketch::solver::SketchSolver;

#[test]
fn test_solver_horizontal() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create diagonal line
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });

    // Add Horizontal Constraint
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());

    // Solve
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");

    // Check results (y should be equal, ~2.5)
    let ent = &sketch.entities[0];
    if let SketchGeometry::Line { start, end } = ent.geometry {
        assert!((start[1] - end[1]).abs() < 1e-5);
        assert!((start[1] - 2.5).abs() < 1e-5);
    } else { panic!("Wrong geometry type"); }
}

#[test]
fn test_solver_coincident() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Line 1: 0,0 -> 10,0
    let l1_id = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
    // Line 2: 12,2 -> 20,2
    let l2_id = sketch.add_entity(SketchGeometry::Line { start: [12.0, 2.0], end: [20.0, 2.0] });

    // Coincident L1.End (idx 1) and L2.Start (idx 0)
    sketch.constraints.push(SketchConstraint::Coincident {
        points: [
            ConstraintPoint { id: l1_id, index: 1 },
            ConstraintPoint { id: l2_id, index: 0 },
        ]
    }.into());

    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged);

    let l1 = &sketch.entities[0].geometry;
    let l2 = &sketch.entities[1].geometry;

    if let (SketchGeometry::Line { end: l1_end, .. }, SketchGeometry::Line { start: l2_start, .. }) = (l1, l2) {
        // They should meet at avg of (10,0) and (12,2) => (11, 1)
        assert!((l1_end[0] - 11.0).abs() < 1e-5);
        assert!((l1_end[1] - 1.0).abs() < 1e-5);
        assert!((l1_end[0] - l2_start[0]).abs() < 1e-5);
        assert!((l1_end[1] - l2_start[1]).abs() < 1e-5);
    } else { panic!("Geometry mismatch"); }
}

// ============================================================================
// Tests for solve_relaxed()
// ============================================================================

#[test]
fn test_relaxed_solve_full_convergence() {
    // Test that solve_relaxed returns correct results when solver fully converges
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create diagonal line
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());

    let result = SketchSolver::solve_relaxed(&mut sketch);
    
    assert!(result.base_result.converged, "Should converge");
    assert_eq!(result.satisfied_count, 1);
    assert_eq!(result.unsatisfied_count, 0);
    assert!(result.partial_progress > 0.99, "Progress should be ~100%");
    assert_eq!(result.constraint_statuses.len(), 1);
    
    let status = &result.constraint_statuses[0];
    assert!(status.satisfied, "Constraint should be satisfied");
    assert!(status.error < 1e-5, "Error should be near zero");
    assert!(status.first_satisfied_at.is_some(), "Should have recorded satisfaction iteration");
}

#[test]
fn test_relaxed_solve_partial_convergence() {
    // Test that solve_relaxed reports partial progress when solver can't fully converge
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create two lines with endpoints that we'll try to constrain contradictorily
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
    let l2 = sketch.add_entity(SketchGeometry::Line { start: [20.0, 0.0], end: [30.0, 0.0] });
    
    // Add conflicting distance constraints: L1.end to L2.start should be both 5 and 15
    // This is impossible to satisfy
    sketch.constraints.push(SketchConstraint::Distance {
        points: [
            ConstraintPoint { id: l1, index: 1 },  // L1 end
            ConstraintPoint { id: l2, index: 0 },  // L2 start
        ],
        value: 5.0,
        style: None,
    }.into());
    sketch.constraints.push(SketchConstraint::Distance {
        points: [
            ConstraintPoint { id: l1, index: 1 },  // L1 end (same points)
            ConstraintPoint { id: l2, index: 0 },  // L2 start
        ],
        value: 15.0,
        style: None,
    }.into());

    let result = SketchSolver::solve_relaxed(&mut sketch);
    
    // Should NOT fully converge due to conflicting distance values
    assert!(!result.base_result.converged, 
            "Should not converge with conflicting distance constraints. Status: {}", 
            result.base_result.status_message);
    
    // Should still report per-constraint status
    assert_eq!(result.constraint_statuses.len(), 2);
    
    // At least some progress should be made (solver tries to find middle ground)
    assert!(result.partial_progress >= 0.0, "Should make some progress or at least not regress");
    
    // Status message should indicate partial solve
    assert!(result.base_result.status_message.contains("Partial solve"), 
            "Status should indicate partial solve: {}", result.base_result.status_message);
}

#[test]
fn test_relaxed_solve_constraint_status_tracking() {
    // Test that individual constraint statuses are correctly tracked
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create two lines
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
    let l2 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 10.0], end: [10.0, 15.0] });
    
    // Add horizontal constraints to both
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l2 }.into());

    let result = SketchSolver::solve_relaxed(&mut sketch);
    
    assert!(result.base_result.converged);
    assert_eq!(result.constraint_statuses.len(), 2);
    
    // Both constraints should be satisfied
    for (i, status) in result.constraint_statuses.iter().enumerate() {
        assert_eq!(status.constraint_index, i);
        assert!(status.satisfied, "Constraint {} should be satisfied", i);
        assert!(status.error_reduction > 0.99, "Error reduction should be high");
    }
    
    assert_eq!(result.satisfied_count, 2);
    assert_eq!(result.unsatisfied_count, 0);
}

#[test]
fn test_relaxed_solve_error_reduction_metric() {
    // Test that the error reduction metric is calculated correctly
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create a very diagonal line (high initial error for horizontal constraint)
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 100.0] });
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());

    let result = SketchSolver::solve_relaxed(&mut sketch);
    
    assert!(result.base_result.converged);
    
    // Initial error was high (100 units Y difference)
    // Final error should be near 0
    assert!(result.initial_total_error > 50.0, "Initial error should be high: {}", result.initial_total_error);
    assert!(result.final_total_error < 1e-5, "Final error should be near zero: {}", result.final_total_error);
    assert!(result.partial_progress > 0.999, "Progress should be nearly 100%: {}", result.partial_progress);
}

#[test]
fn test_relaxed_solve_already_satisfied() {
    // Test behavior when constraints are already satisfied
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create an already horizontal line
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 5.0], end: [10.0, 5.0] });
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());

    let result = SketchSolver::solve_relaxed(&mut sketch);
    
    assert!(result.base_result.converged);
    assert_eq!(result.satisfied_count, 1);
    
    let status = &result.constraint_statuses[0];
    assert!(status.satisfied);
    // Error reduction should be 1.0 (100%) since initial error was ~0 and stays ~0
    assert!(status.error_reduction >= 0.99, "Error reduction for already-satisfied should be 1.0");
    // First satisfied at iteration 0 (or None if already satisfied before first check)
    // The implementation checks before applying, so first_satisfied_at should be Some(0)
    assert_eq!(status.first_satisfied_at, Some(0), "Should be satisfied at first iteration");
}

#[test]
fn test_solver_fix() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Create a line from 0,0 to 10,0
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
    
    // Fix the start point at 0,0
    sketch.constraints.push(SketchConstraint::Fix {
        point: ConstraintPoint { id: l1, index: 0 },
        position: [0.0, 0.0],
    }.into());

    // Try to move the start point by setting it wrong initially?
    // The solver doesn't "try" to move things unless constraints conflict.
    // Let's create a scenario where another constraint WANTS to move it.
    
    // Add a second line at 20,0 that is horizontally constrained
    let l2 = sketch.add_entity(SketchGeometry::Line { start: [20.0, 0.0], end: [30.0, 0.0] });
    
    // Coincident the fixed point (l1 start) with l2 start?
    // That would drag l2 start to 0,0 (or l1 start to 20,0).
    // Beause Fix is "strong" (direct set), it should win or stabilize at the fixed pos.
    
    sketch.constraints.push(SketchConstraint::Coincident {
        points: [
            ConstraintPoint { id: l1, index: 0 },
            ConstraintPoint { id: l2, index: 0 },
        ]
    }.into());
    
    // The coincident solver averages positions. The fix solver strictly sets position.
    // If we run them, eventually L1.start should be at 0,0 and L2.start should come to 0,0.
    
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");
    
    let g1 = &sketch.entities[0].geometry;
    let g2 = &sketch.entities[1].geometry;
    
    if let (
        SketchGeometry::Line { start: s1, .. },
        SketchGeometry::Line { start: s2, .. }
    ) = (g1, g2) {
        // s1 MUST be at 0,0 because it is fixed
        assert!((s1[0] - 0.0).abs() < 1e-5, "Fixed point X mismatch: {}", s1[0]);
        assert!((s1[1] - 0.0).abs() < 1e-5, "Fixed point Y mismatch: {}", s1[1]);
        
        // s2 should have been dragged to s1
        assert!((s2[0] - 0.0).abs() < 1e-5, "Coincident point X mismatch");
        assert!((s2[1] - 0.0).abs() < 1e-5, "Coincident point Y mismatch");
    } else {
        panic!("Geometry mismatch");
    }
}

// ============================================================================
// Tests for entity_statuses (Visual DOF Indicators)
// ============================================================================

#[test]
fn test_entity_status_under_constrained() {
    // Single line with no constraints: should be under-constrained (4 DOF remaining)
    let mut sketch = Sketch::new(SketchPlane::default());
    sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert_eq!(result.entity_statuses.len(), 1);
    let status = &result.entity_statuses[0];
    
    assert_eq!(status.total_dof, 4, "Line has 4 DOF");
    assert_eq!(status.constrained_dof, 0, "No constraints applied");
    assert_eq!(status.remaining_dof, 4, "All DOF remain");
    assert!(!status.is_fully_constrained, "Should be under-constrained");
    assert!(!status.is_over_constrained, "Should not be over-constrained");
    assert!(!status.involved_in_conflict, "No conflicts");
}

#[test]
fn test_entity_status_fully_constrained() {
    // Line with Horizontal (1 DOF) + 2x Fix constraints (4 DOF total) = fully constrained
    let mut sketch = Sketch::new(SketchPlane::default());
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
    
    // Horizontal: 1 DOF
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
    // Fix start: 2 DOF
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: l1, index: 0 },
        position: [0.0, 0.0]
    }.into());
    // Fix end: 2 DOF (this gives us 5 constrained DOF, but we cap at 4 for fully constrained)
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: l1, index: 1 },
        position: [10.0, 0.0]
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert_eq!(result.entity_statuses.len(), 1);
    let status = &result.entity_statuses[0];
    
    assert_eq!(status.total_dof, 4, "Line has 4 DOF");
    // 1 (Horizontal) + 2 (Fix start) + 2 (Fix end) = 5
    assert_eq!(status.constrained_dof, 5, "5 DOF consumed by constraints");
    assert_eq!(status.remaining_dof, 0, "Remaining clamped to 0");
    // With 5 constrained > 4 total, it's technically over-constrained
    assert!(status.is_over_constrained, "Should be over-constrained (5 > 4)");
}

#[test]
fn test_entity_status_exactly_constrained() {
    // Circle with 1 Radius + 2 Fix (center) = 3 DOF exactly matched
    let mut sketch = Sketch::new(SketchPlane::default());
    let c1 = sketch.add_entity(SketchGeometry::Circle { center: [5.0, 5.0], radius: 3.0 });
    
    // Radius: 1 DOF
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 5.0, style: None }.into());
    // Fix center: 2 DOF
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: c1, index: 0 },  // Circle center
        position: [5.0, 5.0]
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert_eq!(result.entity_statuses.len(), 1);
    let status = &result.entity_statuses[0];
    
    assert_eq!(status.total_dof, 3, "Circle has 3 DOF");
    assert_eq!(status.constrained_dof, 3, "3 DOF consumed (1 radius + 2 fix)");
    assert_eq!(status.remaining_dof, 0, "No DOF remaining");
    assert!(status.is_fully_constrained, "Should be fully constrained");
    assert!(!status.is_over_constrained, "Not over-constrained");
}

#[test]
fn test_entity_status_over_constrained_conflict() {
    // Two conflicting radius constraints should trigger conflict detection
    // But note: 2 Radius constraints = 2 DOF consumed, Circle has 3 DOF, so NOT over-constrained
    // by DOF count alone. However, entity IS involved in conflict.
    let mut sketch = Sketch::new(SketchPlane::default());
    let c1 = sketch.add_entity(SketchGeometry::Circle { center: [0.0, 0.0], radius: 5.0 });
    
    // Two conflicting radius values
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 10.0, style: None }.into());
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 20.0, style: None }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert!(!result.converged, "Should not converge with conflicting radii");
    assert!(result.conflicts.is_some(), "Should detect conflicts");
    
    assert_eq!(result.entity_statuses.len(), 1);
    let status = &result.entity_statuses[0];
    
    // DOF analysis: Circle has 3 DOF, 2 Radius constraints = 2 DOF consumed
    // So it's NOT over-constrained by DOF count (2 < 3)
    assert_eq!(status.total_dof, 3, "Circle has 3 DOF");
    assert_eq!(status.constrained_dof, 2, "2 Radius constraints = 2 DOF");
    assert!(!status.is_over_constrained, "Not over-constrained by DOF (2 < 3)");
    
    // But it IS involved in a conflict (solver failed to converge)
    assert!(status.involved_in_conflict, "Should be involved in conflict");
}

#[test]
fn test_entity_status_mixed_sketch() {
    // Multiple entities with varying constraint levels
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Line 1: Horizontal constraint only (1/4 DOF used)
    let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
    sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
    
    // Circle 1: Fully constrained (3/3 DOF)
    let c1 = sketch.add_entity(SketchGeometry::Circle { center: [20.0, 20.0], radius: 5.0 });
    sketch.constraints.push(SketchConstraint::Radius { entity: c1, value: 5.0, style: None }.into());
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: c1, index: 0 },
        position: [20.0, 20.0]
    }.into());
    
    // Line 2: No constraints (0/4 DOF used)
    let _l2 = sketch.add_entity(SketchGeometry::Line { start: [50.0, 50.0], end: [60.0, 60.0] });
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert_eq!(result.entity_statuses.len(), 3);
    
    // Line 1: under-constrained (1/4)
    let l1_status = &result.entity_statuses[0];
    assert_eq!(l1_status.total_dof, 4);
    assert_eq!(l1_status.constrained_dof, 1);
    assert!(!l1_status.is_fully_constrained);
    
    // Circle 1: fully constrained (3/3)
    let c1_status = &result.entity_statuses[1];
    assert_eq!(c1_status.total_dof, 3);
    assert_eq!(c1_status.constrained_dof, 3);
    assert!(c1_status.is_fully_constrained);
    
    // Line 2: completely free (0/4)
    let l2_status = &result.entity_statuses[2];
    assert_eq!(l2_status.total_dof, 4);
    assert_eq!(l2_status.constrained_dof, 0);
    assert!(!l2_status.is_fully_constrained);
}

#[test]
fn test_entity_status_point_geometry() {
    // Point geometry (2 DOF)
    let mut sketch = Sketch::new(SketchPlane::default());
    let p1 = sketch.add_entity(SketchGeometry::Point { pos: [5.0, 5.0] });
    
    // No constraints
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    let status = &result.entity_statuses[0];
    assert_eq!(status.total_dof, 2, "Point has 2 DOF");
    assert_eq!(status.constrained_dof, 0);
    assert!(!status.is_fully_constrained);
    
    // Add Fix constraint (2 DOF) - should fully constrain
    sketch.constraints.push(SketchConstraint::Fix { 
        point: ConstraintPoint { id: p1, index: 0 },
        position: [5.0, 5.0]
    }.into());
    
    let result2 = SketchSolver::solve_with_result(&mut sketch);
    let status2 = &result2.entity_statuses[0];
    assert_eq!(status2.constrained_dof, 2);
    assert!(status2.is_fully_constrained);
}

#[test]
fn test_entity_status_arc_geometry() {
    // Arc geometry (5 DOF: center 2 + radius 1 + start_angle 1 + end_angle 1)
    let mut sketch = Sketch::new(SketchPlane::default());
    sketch.add_entity(SketchGeometry::Arc { 
        center: [0.0, 0.0], 
        radius: 5.0, 
        start_angle: 0.0, 
        end_angle: std::f64::consts::PI 
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    let status = &result.entity_statuses[0];
    assert_eq!(status.total_dof, 5, "Arc has 5 DOF");
    assert_eq!(status.remaining_dof, 5);
    assert!(!status.is_fully_constrained);
}

#[test]
fn test_entity_status_ellipse_geometry() {
    // Ellipse geometry (5 DOF: center_x, center_y, semi_major, semi_minor, rotation)
    let mut sketch = Sketch::new(SketchPlane::default());
    sketch.add_entity(SketchGeometry::Ellipse { 
        center: [5.0, 5.0], 
        semi_major: 10.0, 
        semi_minor: 5.0, 
        rotation: 0.0 
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert_eq!(result.entity_statuses.len(), 1);
    let status = &result.entity_statuses[0];
    assert_eq!(status.total_dof, 5, "Ellipse has 5 DOF");
    assert_eq!(status.constrained_dof, 0, "No constraints applied");
    assert_eq!(status.remaining_dof, 5, "All DOF remain");
    assert!(!status.is_fully_constrained, "Should be under-constrained");
    assert!(!status.is_over_constrained);
}

#[test]
fn test_ellipse_fix_center() {
    // Test that Fix constraint on ellipse center works
    let mut sketch = Sketch::new(SketchPlane::default());
    let e1 = sketch.add_entity(SketchGeometry::Ellipse { 
        center: [10.0, 10.0], 
        semi_major: 8.0, 
        semi_minor: 4.0, 
        rotation: 0.5 
    }.into());
    
    // Fix the center at 10,10
    sketch.constraints.push(SketchConstraint::Fix {
        point: ConstraintPoint { id: e1, index: 0 },
        position: [10.0, 10.0],
    }.into());
    
    let result = SketchSolver::solve_with_result(&mut sketch);
    
    assert!(result.converged, "Solver should converge");
    
    // Verify Fix adds 2 DOF constraint
    let status = &result.entity_statuses[0];
    assert_eq!(status.constrained_dof, 2, "Fix constraint adds 2 DOF");
    assert_eq!(status.remaining_dof, 3, "3 DOF should remain (semi_major, semi_minor, rotation)");
    
    // Verify center is at the fixed position
    if let SketchGeometry::Ellipse { center, .. } = &sketch.entities[0].geometry {
        assert!((center[0] - 10.0).abs() < 1e-5, "Center X should be fixed at 10");
        assert!((center[1] - 10.0).abs() < 1e-5, "Center Y should be fixed at 10");
    } else {
        panic!("Expected Ellipse geometry");
    }
}

#[test]
fn test_ellipse_coincident_with_line() {
    // Test Coincident constraint between ellipse center and line endpoint
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Ellipse at (10, 10)
    let e1 = sketch.add_entity(SketchGeometry::Ellipse { 
        center: [10.0, 10.0], 
        semi_major: 5.0, 
        semi_minor: 3.0, 
        rotation: 0.0 
    }.into());
    
    // Line ending at (8, 8)
    let l1 = sketch.add_entity(SketchGeometry::Line { 
        start: [0.0, 0.0], 
        end: [8.0, 8.0] 
    }.into());
    
    // Coincident: ellipse center (index 0) = line end (index 1)
    sketch.constraints.push(SketchConstraint::Coincident {
        points: [
            ConstraintPoint { id: e1, index: 0 },
            ConstraintPoint { id: l1, index: 1 },
        ]
    }.into());
    
    let converged = SketchSolver::solve(&mut sketch);
    assert!(converged, "Solver should converge");
    
    // Verify they meet in the middle
    if let (
        SketchGeometry::Ellipse { center, .. },
        SketchGeometry::Line { end, .. }
    ) = (&sketch.entities[0].geometry, &sketch.entities[1].geometry) {
        assert!((center[0] - end[0]).abs() < 1e-5, "Ellipse center X should match line end X");
        assert!((center[1] - end[1]).abs() < 1e-5, "Ellipse center Y should match line end Y");
        // Should meet at midpoint (9, 9)
        assert!((center[0] - 9.0).abs() < 1e-5, "Should meet at midpoint X");
        assert!((center[1] - 9.0).abs() < 1e-5, "Should meet at midpoint Y");
    } else {
        panic!("Geometry mismatch");
    }
}
