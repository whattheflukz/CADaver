use super::types::{Sketch, SketchEntity, SketchConstraint, SketchGeometry, ConstraintPoint};
#[allow(unused_imports)]
use crate::topo::EntityId;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Result of constraint solving with detailed status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolveResult {
    /// Whether the solver converged within tolerance
    pub converged: bool,
    /// Number of iterations performed
    pub iterations: usize,
    /// Final maximum error across all constraints
    pub max_error: f64,
    /// Number of geometry entities in the sketch
    pub entity_count: usize,
    /// Number of constraints in the sketch
    pub constraint_count: usize,
    /// Estimated degrees of freedom (DOF)
    /// Negative = over-constrained, 0 = fully constrained, Positive = under-constrained
    pub dof: i32,
    /// Human-readable status message
    pub status_message: String,
    /// List of detected redundant constraints
    pub redundant_constraints: Vec<RedundantConstraintInfo>,
    /// Conflict information if solver failed to converge
    pub conflicts: Option<ConflictInfo>,
    /// Per-entity constraint status for visual DOF indicators
    pub entity_statuses: Vec<EntityConstraintStatus>,
}

impl SolveResult {
    /// Returns true if sketch is fully constrained (DOF = 0)
    pub fn is_fully_constrained(&self) -> bool {
        self.dof == 0 && self.converged
    }
    
    /// Returns true if sketch is under-constrained (DOF > 0)
    pub fn is_under_constrained(&self) -> bool {
        self.dof > 0
    }
    
    /// Returns true if sketch is over-constrained (DOF < 0 or didn't converge)
    pub fn is_over_constrained(&self) -> bool {
        self.dof < 0 || !self.converged
    }
}

/// Information about a redundant constraint detected during solving
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedundantConstraintInfo {
    /// Index of the redundant constraint in the constraints vector
    pub constraint_index: usize,
    /// Index of the constraint it duplicates (if an exact duplicate)
    pub duplicates_index: Option<usize>,
    /// Human-readable explanation of why this constraint is redundant
    pub reason: String,
}

/// Information about constraint conflicts when solver fails to converge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    /// Indices of constraints that remain unsatisfied after max iterations
    pub unsatisfied_constraints: Vec<usize>,
    /// Error value for each constraint at termination (indexed by constraint index)
    pub constraint_errors: Vec<(usize, f64)>,
    /// Pairs of constraint indices that may be in conflict (idx1, idx2, reason)
    pub possible_conflicts: Vec<(usize, usize, String)>,
}

/// Per-entity constraint status for visual DOF indicators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityConstraintStatus {
    /// The entity ID
    pub id: EntityId,
    /// Total DOF this entity contributes (2 for Point, 4 for Line, 3 for Circle, 5 for Arc)
    pub total_dof: i32,
    /// DOF consumed by constraints affecting this entity
    pub constrained_dof: i32,
    /// Remaining DOF (total_dof - constrained_dof, clamped to >= 0)
    pub remaining_dof: i32,
    /// True if all entity DOF are consumed by constraints
    pub is_fully_constrained: bool,
    /// True if more constraints than DOF affect this entity
    pub is_over_constrained: bool,
    /// True if entity is involved in a constraint conflict
    pub involved_in_conflict: bool,
}

/// Status of a single constraint after solving
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintStatus {
    /// Index of the constraint in the constraints vector
    pub constraint_index: usize,
    /// Current error value for this constraint
    pub error: f64,
    /// Whether this constraint is satisfied (error < epsilon)
    pub satisfied: bool,
    /// Iteration at which this constraint was first satisfied (if ever)
    pub first_satisfied_at: Option<usize>,
    /// Error reduction ratio from initial to final (0.0 = no reduction, 1.0 = fully reduced)
    pub error_reduction: f64,
}

/// Result of relaxed constraint solving with per-constraint status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelaxedSolveResult {
    /// The base solve result with overall status
    pub base_result: SolveResult,
    /// Per-constraint status information
    pub constraint_statuses: Vec<ConstraintStatus>,
    /// Number of constraints that are satisfied
    pub satisfied_count: usize,
    /// Number of constraints that remain unsatisfied
    pub unsatisfied_count: usize,
    /// Overall progress as percentage (0.0-1.0) of total error reduction
    pub partial_progress: f64,
    /// Initial total error before solving
    pub initial_total_error: f64,
    /// Final total error after solving
    pub final_total_error: f64,
}

pub struct SketchSolver;

impl SketchSolver {
    /// Simple solve that returns just success/failure for backwards compatibility
    pub fn solve(sketch: &mut Sketch) -> bool {
        Self::solve_with_result(sketch).converged
    }

    /// Extended solve that returns detailed status including DOF
    pub fn solve_with_result(sketch: &mut Sketch) -> SolveResult {
        let max_iterations = 100;
        let epsilon = 1e-6;
        let mut converged = false;
        let mut final_max_error = 0.0;
        let mut iterations_used = 0;

        // Map ID to index for fast lookup
        let mut id_map = HashMap::new();
        for (i, entity) in sketch.entities.iter().enumerate() {
            id_map.insert(entity.id, i);
        }

        for iteration in 0..max_iterations {
            iterations_used = iteration + 1;
            let mut max_error = 0.0;

            // Clone constraints to avoid borrowing issues while mutating entities
            // Filter out suppressed constraints
            let constraints: Vec<_> = sketch.constraints.iter()
                .filter(|entry| !entry.suppressed)
                .map(|entry| entry.constraint.clone())
                .collect();

            for constraint in &constraints {
                match constraint {
                    SketchConstraint::Coincident { points } => {
                        let p1 = Self::get_point(sketch, &id_map, points[0]);
                        let p2 = Self::get_point(sketch, &id_map, points[1]);
                        
                        if let (Some(pos1), Some(pos2)) = (p1, p2) {
                            let dist_sq = (pos1[0] - pos2[0]).powi(2) + (pos1[1] - pos2[1]).powi(2);
                            if dist_sq > max_error { max_error = dist_sq; }

                            let mid = [(pos1[0] + pos2[0]) * 0.5, (pos1[1] + pos2[1]) * 0.5];
                            Self::set_point(sketch, &id_map, points[0], mid);
                            Self::set_point(sketch, &id_map, points[1], mid);
                        }
                    },
                    SketchConstraint::Horizontal { entity } => {
                        if let Some(idx) = id_map.get(entity) {
                            match &mut sketch.entities[*idx].geometry {
                                SketchGeometry::Line { start, end } => {
                                    let diff = (start[1] - end[1]).abs();
                                    if diff > max_error { max_error = diff; }

                                    let mid_y = (start[1] + end[1]) * 0.5;
                                    start[1] = mid_y;
                                    end[1] = mid_y;
                                },
                                SketchGeometry::Ellipse { rotation, .. } => {
                                    let error = rotation.sin().abs();
                                    if error > max_error { max_error = error; }
                                    
                                    // Snap to nearest multiple of PI (0, 180, 360...)
                                    let pi = std::f64::consts::PI;
                                    *rotation = (*rotation / pi).round() * pi;
                                },
                                _ => {}
                            }
                        }
                    },
                    SketchConstraint::Vertical { entity } => {
                        if let Some(idx) = id_map.get(entity) {
                            match &mut sketch.entities[*idx].geometry {
                                SketchGeometry::Line { start, end } => {
                                    let diff = (start[0] - end[0]).abs();
                                    if diff > max_error { max_error = diff; }

                                    let mid_x = (start[0] + end[0]) * 0.5;
                                    start[0] = mid_x;
                                    end[0] = mid_x;
                                },
                                SketchGeometry::Ellipse { rotation, .. } => {
                                    let error = rotation.cos().abs();
                                    if error > max_error { max_error = error; }
                                    
                                    // Snap to nearest multiple of PI/2 + k*PI
                                    let pi = std::f64::consts::PI;
                                    let half_pi = std::f64::consts::FRAC_PI_2;
                                    let shifted = *rotation - half_pi;
                                    let rounded_shifted = (shifted / pi).round() * pi;
                                    *rotation = rounded_shifted + half_pi;
                                },
                                _ => {}
                            }
                        }
                    },
                    SketchConstraint::Distance { points, value, .. } => {
                        let p1 = Self::get_point(sketch, &id_map, points[0]);
                        let p2 = Self::get_point(sketch, &id_map, points[1]);

                        if let (Some(pos1), Some(pos2)) = (p1, p2) {
                            let dx = pos2[0] - pos1[0];
                            let dy = pos2[1] - pos1[1];
                            let current_dist = (dx*dx + dy*dy).sqrt();
                            
                            let error = (current_dist - value).abs();
                            if error > max_error { max_error = error; }

                            if current_dist > epsilon {
                                let scale = 0.5 * (1.0 - value / current_dist);
                                let offset_x = dx * scale;
                                let offset_y = dy * scale;

                                let new_p1 = [pos1[0] + offset_x, pos1[1] + offset_y];
                                let new_p2 = [pos2[0] - offset_x, pos2[1] - offset_y];

                                Self::set_point(sketch, &id_map, points[0], new_p1);
                                Self::set_point(sketch, &id_map, points[1], new_p2);
                            } else {
                                // Points coincide but distance should be > 0
                                // Separate them arbitrarily along X
                                if *value > epsilon {
                                     let mid = [(pos1[0] + pos2[0]) * 0.5, (pos1[1] + pos2[1]) * 0.5];
                                     let half = value * 0.5;
                                     Self::set_point(sketch, &id_map, points[0], [mid[0] - half, mid[1]]);
                                     Self::set_point(sketch, &id_map, points[1], [mid[0] + half, mid[1]]);
                                }
                            }
                        }
                    },
                    SketchConstraint::Parallel { lines } => {
                        let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                        let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                        
                        // We need endpoints to apply correction
                        if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
                            
                            if len1 > epsilon && len2 > epsilon {
                                let n1 = [v1[0]/len1, v1[1]/len1];
                                let n2 = [v2[0]/len2, v2[1]/len2];
                                
                                // use cross product 2D for linear angular sensitivity
                                // cross = n1.x * n2.y - n1.y * n2.x
                                let cross = n1[0]*n2[1] - n1[1]*n2[0];
                                let error_par = cross.abs();
                                
                                if error_par > max_error { max_error = error_par; }
                                
                                if error_par > epsilon {
                                    // Align both to average direction
                                    // Need to align signs first. Dot product tells us if they are opposed.
                                    let dot = n1[0]*n2[0] + n1[1]*n2[1];
                                    let sign = if dot > 0.0 { 1.0 } else { -1.0 };
                                    
                                    let avg_x = n1[0] + n2[0] * sign;
                                    let avg_y = n1[1] + n2[1] * sign;
                                    let avg_len = (avg_x*avg_x + avg_y*avg_y).sqrt();
                                    
                                    if avg_len > epsilon {
                                        let target_nx = avg_x / avg_len;
                                        let target_ny = avg_y / avg_len;
                                        
                                        Self::rotate_line_to_dir(sketch, &id_map, lines[0], [target_nx, target_ny]);
                                        Self::rotate_line_to_dir(sketch, &id_map, lines[1], [target_nx * sign, target_ny * sign]);
                                    }
                                }
                            }
                        }
                    },
                    SketchConstraint::Perpendicular { lines } => {
                       let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                       let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                       
                       if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                           let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                           let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();

                           if len1 > epsilon && len2 > epsilon {
                               let n1 = [v1[0]/len1, v1[1]/len1];
                               let n2 = [v2[0]/len2, v2[1]/len2];
                               let dot = n1[0]*n2[0] + n1[1]*n2[1];
                               
                               if dot.abs() > max_error { max_error = dot.abs(); }

                               if dot.abs() > epsilon {
                                   // Rotate L2 to be perp to L1? Or rotate both?
                                   // Let's rotate L2 to be -90 deg from L1's current dir, mixed with L2's current dir?
                                   // Better: Average the deviations.
                                   // Target for L2 is L1 rotated 90.
                                   // Target for L1 is L2 rotated -90.
                                   // Let's just do a simple relaxation: Rotate L2 to be perp to L1.
                                   // Or better: Rotate L2 to eliminate component along L1. 
                                   // n2_new = n2 - dot * n1. Normalize.
                                   
                                   let n2_new_x = n2[0] - dot * n1[0];
                                   let n2_new_y = n2[1] - dot * n1[1];
                                   let n2_len = (n2_new_x*n2_new_x + n2_new_y*n2_new_y).sqrt();
                                   if n2_len > epsilon {
                                       Self::rotate_line_to_dir(sketch, &id_map, lines[1], [n2_new_x/n2_len, n2_new_y/n2_len]);
                                   }
                                   
                                   // Balancing: Rotate L1 too?
                                   let n1_new_x = n1[0] - dot * n2[0];
                                   let n1_new_y = n1[1] - dot * n2[1];
                                   let n1_len = (n1_new_x*n1_new_x + n1_new_y*n1_new_y).sqrt();
                                   if n1_len > epsilon {
                                       Self::rotate_line_to_dir(sketch, &id_map, lines[0], [n1_new_x/n1_len, n1_new_y/n1_len]);
                                   }
                               }
                           }
                       }
                    },
                    SketchConstraint::Equal { entities } => {
                        let g1 = Self::get_geometry(sketch, &id_map, entities[0]);
                        let g2 = Self::get_geometry(sketch, &id_map, entities[1]);
                        
                        match (g1, g2) {
                            (Some(SketchGeometry::Line { start: s1, end: e1 }), Some(SketchGeometry::Line { start: s2, end: e2 })) => {
                                let l1 = ((s1[0]-e1[0]).powi(2) + (s1[1]-e1[1]).powi(2)).sqrt();
                                let l2 = ((s2[0]-e2[0]).powi(2) + (s2[1]-e2[1]).powi(2)).sqrt();
                                
                                let diff = (l1 - l2).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    let avg = (l1 + l2) * 0.5;
                                    Self::set_line_length(sketch, &id_map, entities[0], avg);
                                    Self::set_line_length(sketch, &id_map, entities[1], avg);
                                }
                            },
                             (Some(SketchGeometry::Circle { radius: r1, .. }), Some(SketchGeometry::Circle { radius: r2, .. })) => {
                                let diff = (r1 - r2).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    let avg = (r1 + r2) * 0.5;
                                    Self::set_circle_radius(sketch, &id_map, entities[0], avg);
                                    Self::set_circle_radius(sketch, &id_map, entities[1], avg);
                                }
                            },
                            _ => {}
                        }
                    },
                     SketchConstraint::Tangent { entities } => {
                        // Implement Line-Circle tangent ONLY for now
                        // Circle-Circle is harder (internal/external)
                        let g1 = Self::get_geometry_copy(sketch, &id_map, entities[0]);
                        let g2 = Self::get_geometry_copy(sketch, &id_map, entities[1]);
                        
                        if let (Some(geo1), Some(geo2)) = (g1, g2) {
                            // Check Line/Circle combo using references to avoid move
                             if let (SketchGeometry::Line { start, end }, SketchGeometry::Circle { center, radius }) = (&geo1, &geo2) {
                                 Self::solve_line_circle_tangent(sketch, &id_map, entities[0], entities[1], *start, *end, *center, *radius, &mut max_error);
                             } else if let (SketchGeometry::Circle { center, radius }, SketchGeometry::Line { start, end }) = (&geo1, &geo2) {
                                 Self::solve_line_circle_tangent(sketch, &id_map, entities[1], entities[0], *start, *end, *center, *radius, &mut max_error);
                             }
                        }
                    },
                    SketchConstraint::Fix { point, position } => {
                        let p = Self::get_point(sketch, &id_map, *point);
                        if let Some(pos) = p {
                            let dist_sq = (pos[0] - position[0]).powi(2) + (pos[1] - position[1]).powi(2);
                            let dist = dist_sq.sqrt();
                            if dist > max_error { max_error = dist; }
                            
                            if dist > epsilon {
                                Self::set_point(sketch, &id_map, *point, *position);
                            }
                        }
                    },
                    SketchConstraint::Angle { lines, value, .. } => {
                        // Solve angle constraint between two lines
                        let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                        let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                        
                        if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
                            
                            if len1 > epsilon && len2 > epsilon {
                                let n1 = [v1[0]/len1, v1[1]/len1];
                                let n2 = [v2[0]/len2, v2[1]/len2];
                                let dot = n1[0]*n2[0] + n1[1]*n2[1];
                                let current_angle = dot.clamp(-1.0, 1.0).acos();
                                let angle_error = (current_angle - value).abs();
                                
                                if angle_error > max_error { max_error = angle_error; }
                                
                                // Rotate L2 to achieve target angle
                                if angle_error > epsilon {
                                    // Target direction for L2 based on L1 + desired angle
                                    let cos_target = value.cos();
                                    let sin_target = value.sin();
                                    // Rotate n1 by target angle to get target n2
                                    let target_n2 = [
                                        n1[0] * cos_target - n1[1] * sin_target,
                                        n1[0] * sin_target + n1[1] * cos_target
                                    ];
                                    Self::rotate_line_to_dir(sketch, &id_map, lines[1], target_n2);
                                }
                            }
                        }
                    },
                    SketchConstraint::Radius { entity, value, .. } => {
                        let geo = Self::get_geometry(sketch, &id_map, *entity);
                         match geo {
                            Some(SketchGeometry::Circle { radius, .. }) => {
                                let diff = (radius - value).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    Self::set_circle_radius(sketch, &id_map, *entity, *value);
                                }
                            },
                             Some(SketchGeometry::Arc { radius, .. }) => {
                                let diff = (radius - value).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    Self::set_arc_radius(sketch, &id_map, *entity, *value);
                                }
                            },
                            _ => {}
                        }
                    },
                    SketchConstraint::Symmetric { p1, p2, axis } => {
                        let pos1 = Self::get_point(sketch, &id_map, *p1);
                        let pos2 = Self::get_point(sketch, &id_map, *p2);
                        let axis_geo = Self::get_geometry_copy(sketch, &id_map, *axis);
                        
                        if let (Some(pt1), Some(pt2), Some(SketchGeometry::Line { start: s, end: e })) = (pos1, pos2, axis_geo) {
                             // Line direction vector
                             let lx = e[0] - s[0];
                             let ly = e[1] - s[1];
                             let len_sq = lx * lx + ly * ly;
                             
                             if len_sq > 1e-9 {
                                 let inv_len = 1.0 / len_sq.sqrt();
                                 let nx = lx * inv_len;
                                 let ny = ly * inv_len;
                                 
                                 // Calculate reflected target for P1 (Reflect P2 over axis)
                                 // Proj P2
                                 let v2x = pt2[0] - s[0];
                                 let v2y = pt2[1] - s[1];
                                 let dot2 = v2x * nx + v2y * ny;
                                 let proj2_x = s[0] + dot2 * nx;
                                 let proj2_y = s[1] + dot2 * ny;
                                 let perp2_x = pt2[0] - proj2_x;
                                 let perp2_y = pt2[1] - proj2_y;
                                 let target_p1_x = proj2_x - perp2_x;
                                 let target_p1_y = proj2_y - perp2_y;
                                 
                                 // Calculate reflected target for P2 (Reflect P1 over axis)
                                 // Proj P1
                                 let v1x = pt1[0] - s[0];
                                 let v1y = pt1[1] - s[1];
                                 let dot1 = v1x * nx + v1y * ny;
                                 let proj1_x = s[0] + dot1 * nx;
                                 let proj1_y = s[1] + dot1 * ny;
                                 let perp1_x = pt1[0] - proj1_x;
                                 let perp1_y = pt1[1] - proj1_y;
                                 let target_p2_x = proj1_x - perp1_x;
                                 let target_p2_y = proj1_y - perp1_y;
                                 
                                 // Error
                                 let err_sq = (pt2[0] - target_p2_x).powi(2) + (pt2[1] - target_p2_y).powi(2);
                                 let err = err_sq.sqrt();
                                 if err > max_error { max_error = err; }
                                 
                                 if err > epsilon {
                                    // Move both towards their targets
                                    // Or move to the average symmetric position?
                                    // Average P1 is (pt1 + target_p1) / 2
                                    let new_p1_x = (pt1[0] + target_p1_x) * 0.5;
                                    let new_p1_y = (pt1[1] + target_p1_y) * 0.5;
                                    
                                    let new_p2_x = (pt2[0] + target_p2_x) * 0.5;
                                    let new_p2_y = (pt2[1] + target_p2_y) * 0.5;
                                    
                                    Self::set_point(sketch, &id_map, *p1, [new_p1_x, new_p1_y]);
                                    Self::set_point(sketch, &id_map, *p2, [new_p2_x, new_p2_y]);
                                 }
                             }
                        }
                    },
                    SketchConstraint::DistancePointLine { point, line, value, .. } => {
                        let p = Self::get_point(sketch, &id_map, *point);
                        let l_geo = Self::get_geometry_copy(sketch, &id_map, *line);

                        if let (Some(pos), Some(SketchGeometry::Line { start, end })) = (p, l_geo) {
                            // Line vector
                            let lx = end[0] - start[0];
                            let ly = end[1] - start[1];
                            let len_sq = lx * lx + ly * ly;

                            if len_sq > epsilon {
                                let len = len_sq.sqrt();
                                // Normal vector (normalized) - perpendicular to line
                                let nx = -ly / len;
                                let ny = lx / len;

                                // Project vector from Start to Point onto Normal
                                let v_x = pos[0] - start[0];
                                let v_y = pos[1] - start[1];
                                
                                // Signed distance from line
                                let signed_dist = v_x * nx + v_y * ny;
                                let current_dist = signed_dist.abs();
                                
                                let error = (current_dist - value).abs();
                                if error > max_error { max_error = error; }

                                if error > epsilon {
                                    // Direction to move P: towards the target distance line
                                    // Target signed distance is +/- value. We choose the one closer to current signed_dist.
                                    let target_signed_dist = if signed_dist >= 0.0 { *value } else { -*value };
                                    
                                    // Shift needed along normal
                                    let shift = target_signed_dist - signed_dist;
                                    // Move P by shift * 0.5 (along Normal)
                                    // Move Line by -shift * 0.5 (along Normal)
                                    
                                    let p_dx = nx * shift * 0.5;
                                    let p_dy = ny * shift * 0.5;
                                    
                                    Self::set_point(sketch, &id_map, *point, [pos[0] + p_dx, pos[1] + p_dy]);
                                    
                                    // Move line (both endpoints)
                                    let l_dx = -p_dx;
                                    let l_dy = -p_dy;
                                    Self::set_point(sketch, &id_map, ConstraintPoint { id: *line, index: 0 }, [start[0] + l_dx, start[1] + l_dy]);
                                    Self::set_point(sketch, &id_map, ConstraintPoint { id: *line, index: 1 }, [end[0] + l_dx, end[1] + l_dy]);
                                }
                            }
                        }
                    }
                }
            }

            final_max_error = max_error;

            if max_error < epsilon {
                converged = true;
                break;
            }
        }

        // Calculate DOF
        let entity_count = sketch.entities.len();
        let constraint_count = sketch.constraints.len();
        let dof = Self::calculate_dof(sketch);
        
        // Detect redundant constraints
        let redundant_constraints = Self::detect_redundant_constraints(sketch);
        
        // Detect conflicts if solver didn't converge
        let conflicts = if !converged {
            Some(Self::detect_conflicts(sketch, &id_map, epsilon))
        } else {
            None
        };
        
        let status_message = if !converged {
            "Solver did not converge - constraints may be conflicting".to_string()
        } else if dof < 0 {
            format!("Over-constrained by {} DOF", -dof)
        } else if dof == 0 {
            "Fully constrained".to_string()
        } else {
            format!("Under-constrained by {} DOF", dof)
        };

        // Calculate per-entity constraint status for visual indicators
        let entity_statuses = Self::calculate_entity_statuses(sketch, &conflicts);

        SolveResult {
            converged,
            iterations: iterations_used,
            max_error: final_max_error,
            entity_count,
            constraint_count,
            dof,
            status_message,
            redundant_constraints,
            conflicts,
            entity_statuses,
        }
    }

    /// Relaxed solve that returns detailed per-constraint status and partial progress
    /// This is useful for interactive editing where sketches may be temporarily invalid
    pub fn solve_relaxed(sketch: &mut Sketch) -> RelaxedSolveResult {
        let max_iterations = 100;
        let epsilon = 1e-6;
        
        // Map ID to index for fast lookup
        let mut id_map = HashMap::new();
        for (i, entity) in sketch.entities.iter().enumerate() {
            id_map.insert(entity.id, i);
        }
        
        let constraint_count = sketch.constraints.len();
        
        // Build list of active (non-suppressed) constraints with original indices
        let active_constraints: Vec<(usize, SketchConstraint)> = sketch.constraints.iter()
            .enumerate()
            .filter(|(_, entry)| !entry.suppressed)
            .map(|(i, entry)| (i, entry.constraint.clone()))
            .collect();
        
        // Track per-constraint initial errors (only for active constraints)
        let mut initial_errors: Vec<f64> = Vec::with_capacity(active_constraints.len());
        for (_, constraint) in &active_constraints {
            initial_errors.push(Self::calculate_constraint_error(sketch, &id_map, constraint));
        }
        let initial_total_error: f64 = initial_errors.iter().sum();
        
        // Track when each active constraint was first satisfied
        let mut first_satisfied_at: Vec<Option<usize>> = vec![None; active_constraints.len()];
        
        // Run the solver iterations
        let mut converged = false;
        let mut final_max_error = 0.0;
        let mut iterations_used = 0;

        for iteration in 0..max_iterations {
            iterations_used = iteration + 1;
            let mut max_error = 0.0;

            for (active_idx, (_, constraint)) in active_constraints.iter().enumerate() {
                // Check if this constraint is already satisfied and record first satisfaction
                let pre_error = Self::calculate_constraint_error(sketch, &id_map, constraint);
                if pre_error < epsilon && first_satisfied_at[active_idx].is_none() {
                    first_satisfied_at[active_idx] = Some(iteration);
                }
                
                match constraint {
                    SketchConstraint::Coincident { points } => {
                        let p1 = Self::get_point(sketch, &id_map, points[0]);
                        let p2 = Self::get_point(sketch, &id_map, points[1]);
                        
                        if let (Some(pos1), Some(pos2)) = (p1, p2) {
                            let dist_sq = (pos1[0] - pos2[0]).powi(2) + (pos1[1] - pos2[1]).powi(2);
                            if dist_sq > max_error { max_error = dist_sq; }

                            let mid = [(pos1[0] + pos2[0]) * 0.5, (pos1[1] + pos2[1]) * 0.5];
                            Self::set_point(sketch, &id_map, points[0], mid);
                            Self::set_point(sketch, &id_map, points[1], mid);
                        }
                    },
                    SketchConstraint::Horizontal { entity } => {
                        if let Some(idx) = id_map.get(entity) {
                            if let SketchGeometry::Line { start, end } = sketch.entities[*idx].geometry {
                                let diff = (start[1] - end[1]).abs();
                                if diff > max_error { max_error = diff; }

                                let mid_y = (start[1] + end[1]) * 0.5;
                                if let SketchGeometry::Line { start, end } = &mut sketch.entities[*idx].geometry {
                                    start[1] = mid_y;
                                    end[1] = mid_y;
                                }
                            }
                        }
                    },
                    SketchConstraint::Vertical { entity } => {
                        if let Some(idx) = id_map.get(entity) {
                            if let SketchGeometry::Line { start, end } = sketch.entities[*idx].geometry {
                                let diff = (start[0] - end[0]).abs();
                                if diff > max_error { max_error = diff; }

                                let mid_x = (start[0] + end[0]) * 0.5;
                                if let SketchGeometry::Line { start, end } = &mut sketch.entities[*idx].geometry {
                                    start[0] = mid_x;
                                    end[0] = mid_x;
                                }
                            }
                        }
                    },
                    SketchConstraint::Distance { points, value, .. } => {
                        let p1 = Self::get_point(sketch, &id_map, points[0]);
                        let p2 = Self::get_point(sketch, &id_map, points[1]);

                        if let (Some(pos1), Some(pos2)) = (p1, p2) {
                            let dx = pos2[0] - pos1[0];
                            let dy = pos2[1] - pos1[1];
                            let current_dist = (dx*dx + dy*dy).sqrt();
                            
                            let error = (current_dist - value).abs();
                            if error > max_error { max_error = error; }

                            if current_dist > epsilon {
                                let scale = 0.5 * (1.0 - value / current_dist);
                                let offset_x = dx * scale;
                                let offset_y = dy * scale;

                                let new_p1 = [pos1[0] + offset_x, pos1[1] + offset_y];
                                let new_p2 = [pos2[0] - offset_x, pos2[1] - offset_y];

                                Self::set_point(sketch, &id_map, points[0], new_p1);
                                Self::set_point(sketch, &id_map, points[1], new_p2);
                            } else if *value > epsilon {
                                let mid = [(pos1[0] + pos2[0]) * 0.5, (pos1[1] + pos2[1]) * 0.5];
                                let half = value * 0.5;
                                Self::set_point(sketch, &id_map, points[0], [mid[0] - half, mid[1]]);
                                Self::set_point(sketch, &id_map, points[1], [mid[0] + half, mid[1]]);
                            }
                        }
                    },
                    SketchConstraint::Parallel { lines } => {
                        let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                        let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                        
                        if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
                            
                            if len1 > epsilon && len2 > epsilon {
                                let n1 = [v1[0]/len1, v1[1]/len1];
                                let n2 = [v2[0]/len2, v2[1]/len2];
                                let cross = n1[0]*n2[1] - n1[1]*n2[0];
                                let error_par = cross.abs();
                                
                                if error_par > max_error { max_error = error_par; }
                                
                                if error_par > epsilon {
                                    let dot = n1[0]*n2[0] + n1[1]*n2[1];
                                    let sign = if dot > 0.0 { 1.0 } else { -1.0 };
                                    
                                    let avg_x = n1[0] + n2[0] * sign;
                                    let avg_y = n1[1] + n2[1] * sign;
                                    let avg_len = (avg_x*avg_x + avg_y*avg_y).sqrt();
                                    
                                    if avg_len > epsilon {
                                        let target_nx = avg_x / avg_len;
                                        let target_ny = avg_y / avg_len;
                                        
                                        Self::rotate_line_to_dir(sketch, &id_map, lines[0], [target_nx, target_ny]);
                                        Self::rotate_line_to_dir(sketch, &id_map, lines[1], [target_nx * sign, target_ny * sign]);
                                    }
                                }
                            }
                        }
                    },
                    SketchConstraint::Perpendicular { lines } => {
                       let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                       let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                       
                       if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                           let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                           let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();

                           if len1 > epsilon && len2 > epsilon {
                               let n1 = [v1[0]/len1, v1[1]/len1];
                               let n2 = [v2[0]/len2, v2[1]/len2];
                               let dot = n1[0]*n2[0] + n1[1]*n2[1];
                               
                               if dot.abs() > max_error { max_error = dot.abs(); }

                               if dot.abs() > epsilon {
                                   let n2_new_x = n2[0] - dot * n1[0];
                                   let n2_new_y = n2[1] - dot * n1[1];
                                   let n2_len = (n2_new_x*n2_new_x + n2_new_y*n2_new_y).sqrt();
                                   if n2_len > epsilon {
                                       Self::rotate_line_to_dir(sketch, &id_map, lines[1], [n2_new_x/n2_len, n2_new_y/n2_len]);
                                   }
                                   
                                   let n1_new_x = n1[0] - dot * n2[0];
                                   let n1_new_y = n1[1] - dot * n2[1];
                                   let n1_len = (n1_new_x*n1_new_x + n1_new_y*n1_new_y).sqrt();
                                   if n1_len > epsilon {
                                       Self::rotate_line_to_dir(sketch, &id_map, lines[0], [n1_new_x/n1_len, n1_new_y/n1_len]);
                                   }
                               }
                           }
                       }
                    },
                    SketchConstraint::Equal { entities } => {
                        let g1 = Self::get_geometry(sketch, &id_map, entities[0]);
                        let g2 = Self::get_geometry(sketch, &id_map, entities[1]);
                        
                        match (g1, g2) {
                            (Some(SketchGeometry::Line { start: s1, end: e1 }), Some(SketchGeometry::Line { start: s2, end: e2 })) => {
                                let l1 = ((s1[0]-e1[0]).powi(2) + (s1[1]-e1[1]).powi(2)).sqrt();
                                let l2 = ((s2[0]-e2[0]).powi(2) + (s2[1]-e2[1]).powi(2)).sqrt();
                                
                                let diff = (l1 - l2).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    let avg = (l1 + l2) * 0.5;
                                    Self::set_line_length(sketch, &id_map, entities[0], avg);
                                    Self::set_line_length(sketch, &id_map, entities[1], avg);
                                }
                            },
                             (Some(SketchGeometry::Circle { radius: r1, .. }), Some(SketchGeometry::Circle { radius: r2, .. })) => {
                                let diff = (r1 - r2).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    let avg = (r1 + r2) * 0.5;
                                    Self::set_circle_radius(sketch, &id_map, entities[0], avg);
                                    Self::set_circle_radius(sketch, &id_map, entities[1], avg);
                                }
                            },
                            _ => {}
                        }
                    },
                    SketchConstraint::Fix { point, position } => {
                        let p = Self::get_point(sketch, &id_map, *point);
                        if let Some(pos) = p {
                            let dist_sq = (pos[0] - position[0]).powi(2) + (pos[1] - position[1]).powi(2);
                            let dist = dist_sq.sqrt();
                            if dist > max_error { max_error = dist; }
                            
                            if dist > epsilon {
                                Self::set_point(sketch, &id_map, *point, *position);
                            }
                        }
                    },
                     SketchConstraint::Tangent { entities } => {
                        let g1 = Self::get_geometry_copy(sketch, &id_map, entities[0]);
                        let g2 = Self::get_geometry_copy(sketch, &id_map, entities[1]);
                        
                        if let (Some(geo1), Some(geo2)) = (g1, g2) {
                             if let (SketchGeometry::Line { start, end }, SketchGeometry::Circle { center, radius }) = (&geo1, &geo2) {
                                 Self::solve_line_circle_tangent(sketch, &id_map, entities[0], entities[1], *start, *end, *center, *radius, &mut max_error);
                             } else if let (SketchGeometry::Circle { center, radius }, SketchGeometry::Line { start, end }) = (&geo1, &geo2) {
                                 Self::solve_line_circle_tangent(sketch, &id_map, entities[1], entities[0], *start, *end, *center, *radius, &mut max_error);
                             }
                        }
                    },
                    SketchConstraint::Angle { lines, value, .. } => {
                        let l1_vec = Self::get_line_vector(sketch, &id_map, lines[0]);
                        let l2_vec = Self::get_line_vector(sketch, &id_map, lines[1]);
                        
                        if let (Some(v1), Some(v2)) = (l1_vec, l2_vec) {
                            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
                            
                            if len1 > epsilon && len2 > epsilon {
                                let n1 = [v1[0]/len1, v1[1]/len1];
                                let n2 = [v2[0]/len2, v2[1]/len2];
                                let dot = n1[0]*n2[0] + n1[1]*n2[1];
                                let current_angle = dot.clamp(-1.0, 1.0).acos();
                                let angle_error = (current_angle - value).abs();
                                
                                if angle_error > max_error { max_error = angle_error; }
                                
                                if angle_error > epsilon {
                                    let cos_target = value.cos();
                                    let sin_target = value.sin();
                                    let target_n2 = [
                                        n1[0] * cos_target - n1[1] * sin_target,
                                        n1[0] * sin_target + n1[1] * cos_target
                                    ];
                                    Self::rotate_line_to_dir(sketch, &id_map, lines[1], target_n2);
                                }
                            }
                        }
                    },
                    SketchConstraint::Radius { entity, value, .. } => {
                         let geo = Self::get_geometry(sketch, &id_map, *entity);
                         match geo {
                            Some(SketchGeometry::Circle { radius, .. }) => {
                                let diff = (radius - value).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    Self::set_circle_radius(sketch, &id_map, *entity, *value);
                                }
                            },
                             Some(SketchGeometry::Arc { radius, .. }) => {
                                let diff = (radius - value).abs();
                                if diff > max_error { max_error = diff; }
                                
                                if diff > epsilon {
                                    Self::set_arc_radius(sketch, &id_map, *entity, *value);
                                }
                            },
                            _ => {}
                        }
                    },
                    SketchConstraint::Symmetric { p1, p2, axis } => {
                        let pos1 = Self::get_point(sketch, &id_map, *p1);
                        let pos2 = Self::get_point(sketch, &id_map, *p2);
                        let axis_geo = Self::get_geometry_copy(sketch, &id_map, *axis);
                        
                        if let (Some(pt1), Some(pt2), Some(SketchGeometry::Line { start: s, end: e })) = (pos1, pos2, axis_geo) {
                             // Line direction vector
                             let lx = e[0] - s[0];
                             let ly = e[1] - s[1];
                             let len_sq = lx * lx + ly * ly;
                             
                             if len_sq > 1e-9 {
                                 let inv_len = 1.0 / len_sq.sqrt();
                                 let nx = lx * inv_len;
                                 let ny = ly * inv_len;
                                 
                                 // Calculate reflected target for P1 (Reflect P2 over axis)
                                 // Proj P2
                                 let v2x = pt2[0] - s[0];
                                 let v2y = pt2[1] - s[1];
                                 let dot2 = v2x * nx + v2y * ny;
                                 let proj2_x = s[0] + dot2 * nx;
                                 let proj2_y = s[1] + dot2 * ny;
                                 let perp2_x = pt2[0] - proj2_x;
                                 let perp2_y = pt2[1] - proj2_y;
                                 let target_p1_x = proj2_x - perp2_x;
                                 let target_p1_y = proj2_y - perp2_y;
                                 
                                 // Calculate reflected target for P2 (Reflect P1 over axis)
                                 // Proj P1
                                 let v1x = pt1[0] - s[0];
                                 let v1y = pt1[1] - s[1];
                                 let dot1 = v1x * nx + v1y * ny;
                                 let proj1_x = s[0] + dot1 * nx;
                                 let proj1_y = s[1] + dot1 * ny;
                                 let perp1_x = pt1[0] - proj1_x;
                                 let perp1_y = pt1[1] - proj1_y;
                                 let target_p2_x = proj1_x - perp1_x;
                                 let target_p2_y = proj1_y - perp1_y;
                                 
                                 // Error
                                 let err_sq = (pt2[0] - target_p2_x).powi(2) + (pt2[1] - target_p2_y).powi(2);
                                 let err = err_sq.sqrt();
                                 if err > max_error { max_error = err; }
                                 
                                 if err > epsilon {
                                    // Move both towards their targets
                                    // Or move to the average symmetric position?
                                    // Average P1 is (pt1 + target_p1) / 2
                                    let new_p1_x = (pt1[0] + target_p1_x) * 0.5;
                                    let new_p1_y = (pt1[1] + target_p1_y) * 0.5;
                                    
                                    let new_p2_x = (pt2[0] + target_p2_x) * 0.5;
                                    let new_p2_y = (pt2[1] + target_p2_y) * 0.5;
                                    
                                    Self::set_point(sketch, &id_map, *p1, [new_p1_x, new_p1_y]);
                                    Self::set_point(sketch, &id_map, *p2, [new_p2_x, new_p2_y]);
                                 }
                             }
                        }
                    },
                    SketchConstraint::DistancePointLine { point, line, value, .. } => {
                        let p = Self::get_point(sketch, &id_map, *point);
                        let l_geo = Self::get_geometry_copy(sketch, &id_map, *line);

                        if let (Some(pos), Some(SketchGeometry::Line { start, end })) = (p, l_geo) {
                            // Line vector
                            let lx = end[0] - start[0];
                            let ly = end[1] - start[1];
                            let len_sq = lx * lx + ly * ly;

                            if len_sq > epsilon {
                                let len = len_sq.sqrt();
                                // Normal vector (normalized) - perpendicular to line
                                let nx = -ly / len;
                                let ny = lx / len;

                                // Project vector from Start to Point onto Normal
                                let v_x = pos[0] - start[0];
                                let v_y = pos[1] - start[1];
                                
                                // Signed distance from line
                                let signed_dist = v_x * nx + v_y * ny;
                                let current_dist = signed_dist.abs();
                                
                                let error = (current_dist - value).abs();
                                if error > max_error { max_error = error; }

                                if error > epsilon {
                                    // Direction to move P: towards the target distance line
                                    // Target signed distance is +/- value. We choose the one closer to current signed_dist.
                                    let target_signed_dist = if signed_dist >= 0.0 { *value } else { -*value };
                                    
                                    // Shift needed along normal
                                    let shift = target_signed_dist - signed_dist;
                                    // Move P by shift * 0.5 (along Normal)
                                    // Move Line by -shift * 0.5 (along Normal)
                                    
                                    let p_dx = nx * shift * 0.5;
                                    let p_dy = ny * shift * 0.5;
                                    
                                    Self::set_point(sketch, &id_map, *point, [pos[0] + p_dx, pos[1] + p_dy]);
                                    
                                    // Move line (both endpoints)
                                    let l_dx = -p_dx;
                                    let l_dy = -p_dy;
                                    Self::set_point(sketch, &id_map, ConstraintPoint { id: *line, index: 0 }, [start[0] + l_dx, start[1] + l_dy]);
                                    Self::set_point(sketch, &id_map, ConstraintPoint { id: *line, index: 1 }, [end[0] + l_dx, end[1] + l_dy]);
                                }
                            }
                        }
                    }
                }
            }

            final_max_error = max_error;

            if max_error < epsilon {
                converged = true;
                break;
            }
        }

        // Calculate final per-constraint errors and statuses (only active constraints)
        let mut constraint_statuses = Vec::with_capacity(active_constraints.len());
        let mut satisfied_count = 0;
        let mut final_total_error = 0.0;
        
        for (active_idx, (original_idx, constraint)) in active_constraints.iter().enumerate() {
            let final_error = Self::calculate_constraint_error(sketch, &id_map, constraint);
            final_total_error += final_error;
            let satisfied = final_error < epsilon;
            if satisfied {
                satisfied_count += 1;
            }
            
            let initial_err = if active_idx < initial_errors.len() {
                initial_errors[active_idx]
            } else {
                0.0
            };
            let error_reduction = if initial_err > epsilon {
                1.0 - (final_error / initial_err).min(1.0)
            } else {
                1.0 // Already satisfied initially
            };
            
            constraint_statuses.push(ConstraintStatus {
                constraint_index: *original_idx,
                error: final_error,
                satisfied,
                first_satisfied_at: if active_idx < first_satisfied_at.len() {
                    first_satisfied_at[active_idx]
                } else {
                    None
                },
                error_reduction,
            }.into());
        }
        
        let active_count = active_constraints.len();
        let unsatisfied_count = active_count - satisfied_count;
        
        // Calculate overall progress
        let partial_progress = if initial_total_error > epsilon {
            1.0 - (final_total_error / initial_total_error).min(1.0)
        } else {
            1.0 // Already solved
        };
        
        // Build base result
        let entity_count = sketch.entities.len();
        let dof = Self::calculate_dof(sketch);
        let redundant_constraints = Self::detect_redundant_constraints(sketch);
        
        let conflicts = if !converged {
            Some(Self::detect_conflicts(sketch, &id_map, epsilon))
        } else {
            None
        };
        
        let status_message = if converged {
            if dof == 0 {
                "Fully constrained".to_string()
            } else if dof > 0 {
                format!("Under-constrained by {} DOF", dof)
            } else {
                format!("Over-constrained by {} DOF", -dof)
            }
        } else {
            format!("Partial solve: {}/{} constraints satisfied ({:.1}% error reduction)", 
                    satisfied_count, constraint_count, partial_progress * 100.0)
        };

        // Calculate per-entity constraint status for visual indicators
        let entity_statuses = Self::calculate_entity_statuses(sketch, &conflicts);

        let base_result = SolveResult {
            converged,
            iterations: iterations_used,
            max_error: final_max_error,
            entity_count,
            constraint_count,
            dof,
            status_message,
            redundant_constraints,
            conflicts,
            entity_statuses,
        };

        RelaxedSolveResult {
            base_result,
            constraint_statuses,
            satisfied_count,
            unsatisfied_count,
            partial_progress,
            initial_total_error,
            final_total_error,
        }
    }

    /// Calculate estimated degrees of freedom (DOF) for the sketch
    /// DOF = total entity DOF - total constraint DOF removed
    fn calculate_dof(sketch: &Sketch) -> i32 {
        // Each geometry type has a certain number of DOF
        let mut total_dof: i32 = 0;
        for entity in &sketch.entities {
            total_dof += match &entity.geometry {
                SketchGeometry::Point { .. } => 2,  // x, y
                SketchGeometry::Line { .. } => 4,   // start_x, start_y, end_x, end_y
                SketchGeometry::Circle { .. } => 3, // center_x, center_y, radius
                SketchGeometry::Arc { .. } => 5,    // center_x, center_y, radius, start_angle, end_angle
                SketchGeometry::Ellipse { .. } => 5, // center_x, center_y, semi_major, semi_minor, rotation
            };
        }

        // Each constraint removes a certain number of DOF (skip suppressed)
        let mut constrained_dof: i32 = 0;
        for entry in &sketch.constraints {
            // Skip suppressed constraints
            if entry.suppressed {
                continue;
            }
            constrained_dof += match &entry.constraint {
                SketchConstraint::Coincident { .. } => 2, // Removes 2 DOF (x, y)
                SketchConstraint::Horizontal { .. } => 1, // Removes 1 DOF (forces same y)
                SketchConstraint::Vertical { .. } => 1,   // Removes 1 DOF (forces same x)
                SketchConstraint::Distance { .. } => 1,   // Removes 1 DOF
                SketchConstraint::Angle { .. } => 1,      // Removes 1 DOF (angle between lines)
                SketchConstraint::Parallel { .. } => 1,   // Removes 1 DOF (angle)
                SketchConstraint::Perpendicular { .. } => 1, // Removes 1 DOF (angle)
                SketchConstraint::Tangent { .. } => 1,    // Removes 1 DOF
                SketchConstraint::Equal { .. } => 1,      // Removes 1 DOF (length/radius)
                SketchConstraint::Fix { .. } => 2,        // Removes 2 DOF (x, y)
                SketchConstraint::Symmetric { .. } => 2,  // Removes 2 DOF (reflection is precise)
                SketchConstraint::Radius { .. } => 1,     // Removes 1 DOF (radius)
                SketchConstraint::DistancePointLine { .. } => 1, // Removes 1 DOF (distance)
            };
        }

        total_dof - constrained_dof
    }
    
    /// Calculate per-entity constraint status for visual DOF indicators
    /// Returns a status for each entity showing how constrained it is
    fn calculate_entity_statuses(sketch: &Sketch, conflicts: &Option<ConflictInfo>) -> Vec<EntityConstraintStatus> {
        let mut entity_dof_map: HashMap<EntityId, (i32, i32)> = HashMap::new(); // (total_dof, constrained_dof)
        
        // Initialize with total DOF for each entity
        for entity in &sketch.entities {
            let total = match &entity.geometry {
                SketchGeometry::Point { .. } => 2,
                SketchGeometry::Line { .. } => 4,
                SketchGeometry::Circle { .. } => 3,
                SketchGeometry::Arc { .. } => 5,
                SketchGeometry::Ellipse { .. } => 5,
            };
            entity_dof_map.insert(entity.id, (total, 0));
        }
        
        // Accumulate constrained DOF from each active (non-suppressed) constraint
        for entry in &sketch.constraints {
            if entry.suppressed {
                continue;
            }
            let (affected_entities, dof_per_entity) = match &entry.constraint {
                SketchConstraint::Coincident { points } => {
                    // Coincident removes 2 DOF total, split between entities
                    (vec![points[0].id, points[1].id], 1)
                },
                SketchConstraint::Horizontal { entity } => (vec![*entity], 1),
                SketchConstraint::Vertical { entity } => (vec![*entity], 1),
                SketchConstraint::Distance { points, .. } => {
                    // Distance removes 1 DOF, affects both points' entities
                    (vec![points[0].id, points[1].id], 1)
                },
                SketchConstraint::Angle { lines, .. } => (vec![lines[0], lines[1]], 1),
                SketchConstraint::Parallel { lines } => (vec![lines[0], lines[1]], 1),
                SketchConstraint::Perpendicular { lines } => (vec![lines[0], lines[1]], 1),
                SketchConstraint::Tangent { entities } => (vec![entities[0], entities[1]], 1),
                SketchConstraint::Equal { entities } => (vec![entities[0], entities[1]], 1),
                SketchConstraint::Fix { point, .. } => (vec![point.id], 2),
                SketchConstraint::Symmetric { p1, p2, axis } => (vec![p1.id, p2.id, *axis], 2), // 2 DOF distributed?
                SketchConstraint::Radius { entity, .. } => (vec![*entity], 1),
                SketchConstraint::DistancePointLine { point, line, .. } => (vec![point.id, *line], 1),
            };
            
            // Distribute the constraint DOF to affected entities
            for entity_id in affected_entities {
                if let Some((_, constrained)) = entity_dof_map.get_mut(&entity_id) {
                    *constrained += dof_per_entity;
                }
            }
        }
        
        // Collect conflict entity IDs if any
        let conflict_entity_ids: std::collections::HashSet<EntityId> = if let Some(c) = conflicts {
            let mut ids = std::collections::HashSet::new();
            for &idx in &c.unsatisfied_constraints {
                if idx < sketch.constraints.len() {
                    let entity_ids = Self::get_constraint_entities(&sketch.constraints[idx].constraint);
                    for id in entity_ids {
                        ids.insert(id);
                    }
                }
            }
            ids
        } else {
            std::collections::HashSet::new()
        };
        
        // Build result vector
        sketch.entities.iter().map(|entity| {
            let (total_dof, constrained_dof) = entity_dof_map.get(&entity.id).copied().unwrap_or((0, 0));
            let remaining_dof = (total_dof - constrained_dof).max(0);
            let is_fully_constrained = remaining_dof == 0 && constrained_dof <= total_dof;
            let is_over_constrained = constrained_dof > total_dof;
            let involved_in_conflict = conflict_entity_ids.contains(&entity.id);
            
            EntityConstraintStatus {
                id: entity.id,
                total_dof,
                constrained_dof,
                remaining_dof,
                is_fully_constrained,
                is_over_constrained,
                involved_in_conflict,
            }
        }).collect()
    }
    
    /// Detect redundant constraints in the sketch
    /// Returns a list of constraints that are duplicates or implied by others
    fn detect_redundant_constraints(sketch: &Sketch) -> Vec<RedundantConstraintInfo> {
        use std::collections::HashSet;
        
        let mut redundant = Vec::new();
        let constraints = &sketch.constraints;
        
        // Track constraint "signatures" for duplicate detection
        // Signature is a normalized representation of what the constraint does
        let mut seen_signatures: HashSet<String> = HashSet::new();
        
        // Track coincident relationships for transitive redundancy detection
        // Uses union-find concept: map each point signature to its "root"
        let mut coincident_groups: HashMap<String, String> = HashMap::new();
        
        // Helper to get normalized point signature
        fn point_sig(cp: &ConstraintPoint) -> String {
            format!("{}:{}", cp.id, cp.index)
        }
        
        // Helper to find the root of a coincident group
        fn find_root(groups: &HashMap<String, String>, key: &str) -> String {
            let mut current = key.to_string();
            while let Some(parent) = groups.get(&current) {
                if parent == &current {
                    break;
                }
                current = parent.clone();
            }
            current
        }
        
        // First pass: collect coincident groups (from active constraints only)
        for entry in constraints.iter() {
            if entry.suppressed {
                continue;
            }
            if let SketchConstraint::Coincident { points } = &entry.constraint {
                let sig1 = point_sig(&points[0]);
                let sig2 = point_sig(&points[1]);
                
                let root1 = find_root(&coincident_groups, &sig1);
                let root2 = find_root(&coincident_groups, &sig2);
                
                // Ensure both points are in the map
                coincident_groups.entry(sig1.clone()).or_insert_with(|| sig1.clone());
                coincident_groups.entry(sig2.clone()).or_insert_with(|| sig2.clone());
                
                // Union the groups (make root2 point to root1)
                if root1 != root2 {
                    coincident_groups.insert(root2, root1);
                }
            }
        }
        
        // Second pass: detect redundant constraints (from active constraints only)
        for (i, entry) in constraints.iter().enumerate() {
            if entry.suppressed {
                continue;
            }
            let signature = match &entry.constraint {
                SketchConstraint::Coincident { points } => {
                    // Check if this coincident is implied by transitivity
                    let sig1 = point_sig(&points[0]);
                    let sig2 = point_sig(&points[1]);
                    let root1 = find_root(&coincident_groups, &sig1);
                    let root2 = find_root(&coincident_groups, &sig2);
                    
                    // Normalize: smaller string first
                    let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                    format!("COINC:{}:{}", a, b)
                },
                SketchConstraint::Horizontal { entity } => {
                    format!("HORIZ:{}", entity)
                },
                SketchConstraint::Vertical { entity } => {
                    format!("VERT:{}", entity)
                },
                SketchConstraint::Distance { points, value, .. } => {
                    let sig1 = point_sig(&points[0]);
                    let sig2 = point_sig(&points[1]);
                    let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                    format!("DIST:{}:{}:{:.6}", a, b, value)
                },
                SketchConstraint::Parallel { lines } => {
                    let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                    format!("PAR:{}:{}", a, b)
                },
                SketchConstraint::Perpendicular { lines } => {
                    let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                    format!("PERP:{}:{}", a, b)
                },
                SketchConstraint::Tangent { entities } => {
                    let (a, b) = if entities[0] < entities[1] { (entities[0], entities[1]) } else { (entities[1], entities[0]) };
                    format!("TAN:{}:{}", a, b)
                },
                SketchConstraint::Equal { entities } => {
                    let (a, b) = if entities[0] < entities[1] { (entities[0], entities[1]) } else { (entities[1], entities[0]) };
                    format!("EQ:{}:{}", a, b)
                },
                SketchConstraint::Fix { point, position } => {
                    format!("FIX:{}:{}:{:.6}:{:.6}", point.id, point.index, position[0], position[1])
                },
                SketchConstraint::Angle { lines, value, .. } => {
                    let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                    format!("ANGLE:{}:{}:{:.6}", a, b, value)
                },
                SketchConstraint::Radius { entity, value, .. } => {
                    format!("RADIUS:{}:{:.6}", entity, value)
                },
                SketchConstraint::Symmetric { p1, p2, axis } => {
                    let sig1 = point_sig(p1);
                    let sig2 = point_sig(p2);
                    let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                    format!("SYM:{}:{}:{}", a, b, axis)
                },
                SketchConstraint::DistancePointLine { point, line, value, .. } => {
                    format!("DIST_PL:{}:{}:{:.6}", point_sig(point), line, value)
                },
            };
            
            // Check for exact duplicate
            if seen_signatures.contains(&signature) {
                // Find which constraint this duplicates
                let dup_index = constraints.iter().position(|entry| {
                    if entry.suppressed {
                        return false;
                    }
                    let other_sig = match &entry.constraint {
                        SketchConstraint::Coincident { points } => {
                            let sig1 = point_sig(&points[0]);
                            let sig2 = point_sig(&points[1]);
                            let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                            format!("COINC:{}:{}", a, b)
                        },
                        SketchConstraint::Horizontal { entity } => format!("HORIZ:{}", entity),
                        SketchConstraint::Vertical { entity } => format!("VERT:{}", entity),
                        SketchConstraint::Distance { points, value, .. } => {
                            let sig1 = point_sig(&points[0]);
                            let sig2 = point_sig(&points[1]);
                            let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                            format!("DIST:{}:{}:{:.6}", a, b, value)
                        },
                        SketchConstraint::Parallel { lines } => {
                            let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                            format!("PAR:{}:{}", a, b)
                        },
                        SketchConstraint::Perpendicular { lines } => {
                            let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                            format!("PERP:{}:{}", a, b)
                        },
                        SketchConstraint::Tangent { entities } => {
                            let (a, b) = if entities[0] < entities[1] { (entities[0], entities[1]) } else { (entities[1], entities[0]) };
                            format!("TAN:{}:{}", a, b)
                        },
                        SketchConstraint::Equal { entities } => {
                            let (a, b) = if entities[0] < entities[1] { (entities[0], entities[1]) } else { (entities[1], entities[0]) };
                            format!("EQ:{}:{}", a, b)
                        },
                        SketchConstraint::Fix { point, position } => {
                            format!("FIX:{}:{}:{:.6}:{:.6}", point.id, point.index, position[0], position[1])
                        },
                        SketchConstraint::Angle { lines, value, .. } => {
                            let (a, b) = if lines[0] < lines[1] { (lines[0], lines[1]) } else { (lines[1], lines[0]) };
                            format!("ANGLE:{}:{}:{:.6}", a, b, value)
                        },
                        SketchConstraint::Radius { entity, value, .. } => {
                            format!("RADIUS:{}:{:.6}", entity, value)
                        },
                        SketchConstraint::Symmetric { p1, p2, axis } => {
                            let sig1 = point_sig(p1);
                            let sig2 = point_sig(p2);
                            let (a, b) = if sig1 < sig2 { (sig1, sig2) } else { (sig2, sig1) };
                            format!("SYM:{}:{}:{}", a, b, axis)
                        },
                        SketchConstraint::DistancePointLine { point, line, value, .. } => {
                            format!("DIST_PL:{}:{}:{:.6}", point_sig(point), line, value)
                        },
                    };
                    other_sig == signature
                }.into());
                
                redundant.push(RedundantConstraintInfo {
                    constraint_index: i,
                    duplicates_index: dup_index,
                    reason: format!("Exact duplicate of constraint #{}", dup_index.map_or("?".to_string(), |idx| idx.to_string())),
                }.into());
            } else {
                seen_signatures.insert(signature);
            }
        }
        
        // Third pass: check for transitive coincident redundancy
        // (A=B and B=C already implies A=C)
        let mut coincident_pairs: Vec<(String, String, usize)> = Vec::new();
        for (i, entry) in constraints.iter().enumerate() {
            if entry.suppressed {
                continue;
            }
            if let SketchConstraint::Coincident { points } = &entry.constraint {
                let sig1 = point_sig(&points[0]);
                let sig2 = point_sig(&points[1]);
                coincident_pairs.push((sig1, sig2, i));
            }
        }
        
        // For each coincident constraint, check if it's implied by transitivity
        for (sig1, sig2, idx) in &coincident_pairs {
            let root1 = find_root(&coincident_groups, sig1);
            let root2 = find_root(&coincident_groups, sig2);
            
            // If both points converge to the same root through OTHER constraints,
            // then this constraint is redundant
            // We need to check if removing this constraint would still leave them connected
            
            // Build a graph without this constraint
            let mut temp_groups: HashMap<String, String> = HashMap::new();
            for (s1, s2, other_idx) in &coincident_pairs {
                if other_idx != idx {
                    let r1 = find_root(&temp_groups, s1);
                    let r2 = find_root(&temp_groups, s2);
                    temp_groups.entry(s1.clone()).or_insert_with(|| s1.clone());
                    temp_groups.entry(s2.clone()).or_insert_with(|| s2.clone());
                    if r1 != r2 {
                        temp_groups.insert(r2, r1);
                    }
                }
            }
            
            let temp_root1 = find_root(&temp_groups, sig1);
            let temp_root2 = find_root(&temp_groups, sig2);
            
            // If they're still in the same group without this constraint, it's redundant
            if temp_root1 == temp_root2 {
                // Only report if not already reported as exact duplicate
                if !redundant.iter().any(|r: &RedundantConstraintInfo| r.constraint_index == *idx) {
                    redundant.push(RedundantConstraintInfo {
                        constraint_index: *idx,
                        duplicates_index: None,
                        reason: "Implied by transitivity through other coincident constraints".to_string(),
                    });
                }
            }
        }
        
        redundant
    }
    
    /// Detect conflicting constraints when solver fails to converge
    /// Analyzes which constraints remain unsatisfied and identifies potential conflicts
    fn detect_conflicts(sketch: &Sketch, id_map: &HashMap<EntityId, usize>, epsilon: f64) -> ConflictInfo {
        let mut unsatisfied_constraints = Vec::new();
        let mut constraint_errors = Vec::new();
        let mut possible_conflicts = Vec::new();
        
        // Calculate current error for each active constraint
        for (i, entry) in sketch.constraints.iter().enumerate() {
            if entry.suppressed {
                continue;
            }
            let error = Self::calculate_constraint_error(sketch, id_map, &entry.constraint);
            
            if error > epsilon {
                unsatisfied_constraints.push(i);
                constraint_errors.push((i, error));
            }
        }
        
        // Find potential conflicts: constraints that share entities and both have high error
        // This is a heuristic - if two constraints operate on the same geometry and both fail,
        // they might be in conflict
        for i in 0..unsatisfied_constraints.len() {
            for j in (i + 1)..unsatisfied_constraints.len() {
                let idx1 = unsatisfied_constraints[i];
                let idx2 = unsatisfied_constraints[j];
                
                let c1 = &sketch.constraints[idx1].constraint;
                let c2 = &sketch.constraints[idx2].constraint;
                
                // Extract entities referenced by each constraint
                let entities1 = Self::get_constraint_entities(c1);
                let entities2 = Self::get_constraint_entities(c2);
                
                // Check for overlap
                let mut shared = Vec::new();
                for e1 in &entities1 {
                    if entities2.contains(e1) {
                        shared.push(*e1);
                    }
                }
                
                if !shared.is_empty() {
                    let reason = format!(
                        "Both constraints affect same entit{}: {:?}",
                        if shared.len() == 1 { "y" } else { "ies" },
                        shared.iter().map(|id| id.to_string()).collect::<Vec<_>>()
                    );
                    possible_conflicts.push((idx1, idx2, reason));
                }
            }
        }
        
        // Also detect direct conflicts like Horizontal + Vertical on same line (skip suppressed)
        for i in 0..sketch.constraints.len() {
            if sketch.constraints[i].suppressed {
                continue;
            }
            for j in (i + 1)..sketch.constraints.len() {
                if sketch.constraints[j].suppressed {
                    continue;
                }
                let c1 = &sketch.constraints[i].constraint;
                let c2 = &sketch.constraints[j].constraint;
                
                // Check for Horizontal + Vertical on same entity
                if let (SketchConstraint::Horizontal { entity: e1 }, SketchConstraint::Vertical { entity: e2 }) = (c1, c2) {
                    if e1 == e2 {
                        if !possible_conflicts.iter().any(|(a, b, _)| (*a == i && *b == j) || (*a == j && *b == i)) {
                            possible_conflicts.push((i, j, format!("Horizontal and Vertical constraints on same line {}", e1)));
                        }
                    }
                }
                if let (SketchConstraint::Vertical { entity: e1 }, SketchConstraint::Horizontal { entity: e2 }) = (c1, c2) {
                    if e1 == e2 {
                        if !possible_conflicts.iter().any(|(a, b, _)| (*a == i && *b == j) || (*a == j && *b == i)) {
                            possible_conflicts.push((i, j, format!("Vertical and Horizontal constraints on same line {}", e1)));
                        }
                    }
                }
                
                // Check for conflicting Distance constraints (same points, different values)
                if let (
                    SketchConstraint::Distance { points: p1, value: v1, .. },
                    SketchConstraint::Distance { points: p2, value: v2, .. }
                ) = (c1, c2) {
                    // Normalize point order for comparison
                    let (a1, b1) = if p1[0].id < p1[1].id || (p1[0].id == p1[1].id && p1[0].index < p1[1].index) {
                        (p1[0], p1[1])
                    } else {
                        (p1[1], p1[0])
                    };
                    let (a2, b2) = if p2[0].id < p2[1].id || (p2[0].id == p2[1].id && p2[0].index < p2[1].index) {
                        (p2[0], p2[1])
                    } else {
                        (p2[1], p2[0])
                    };
                    
                    if a1.id == a2.id && a1.index == a2.index && b1.id == b2.id && b1.index == b2.index {
                        if (v1 - v2).abs() > epsilon {
                            if !possible_conflicts.iter().any(|(a, b, _)| (*a == i && *b == j) || (*a == j && *b == i)) {
                                possible_conflicts.push((i, j, format!("Conflicting distance values: {} vs {}", v1, v2)));
                            }
                        }
                    }
                }
            }
        }
        
        ConflictInfo {
            unsatisfied_constraints,
            constraint_errors,
            possible_conflicts,
        }
    }
    
    /// Calculate the current error for a single constraint
    fn calculate_constraint_error(sketch: &Sketch, id_map: &HashMap<EntityId, usize>, constraint: &SketchConstraint) -> f64 {
        match constraint {
            SketchConstraint::Coincident { points } => {
                let p1 = Self::get_point(sketch, id_map, points[0]);
                let p2 = Self::get_point(sketch, id_map, points[1]);
                if let (Some(pos1), Some(pos2)) = (p1, p2) {
                    ((pos1[0] - pos2[0]).powi(2) + (pos1[1] - pos2[1]).powi(2)).sqrt()
                } else {
                    0.0
                }
            },
            SketchConstraint::Horizontal { entity } => {
                if let Some(idx) = id_map.get(entity) {
                    match &sketch.entities[*idx].geometry {
                        SketchGeometry::Line { start, end } => (start[1] - end[1]).abs(),
                        SketchGeometry::Ellipse { rotation, .. } => rotation.sin().abs(),
                        _ => 0.0
                    }
                } else { 0.0 }
            },
            SketchConstraint::Vertical { entity } => {
                if let Some(idx) = id_map.get(entity) {
                    match &sketch.entities[*idx].geometry {
                        SketchGeometry::Line { start, end } => (start[0] - end[0]).abs(),
                        SketchGeometry::Ellipse { rotation, .. } => rotation.cos().abs(),
                        _ => 0.0
                    }
                } else { 0.0 }
            },
            SketchConstraint::Distance { points, value, .. } => {
                let p1 = Self::get_point(sketch, id_map, points[0]);
                let p2 = Self::get_point(sketch, id_map, points[1]);
                if let (Some(pos1), Some(pos2)) = (p1, p2) {
                    let current_dist = ((pos2[0] - pos1[0]).powi(2) + (pos2[1] - pos1[1]).powi(2)).sqrt();
                    (current_dist - value).abs()
                } else { 0.0 }
            },
            SketchConstraint::Parallel { lines } => {
                Self::get_parallel_error(sketch, id_map, lines[0], lines[1])
            },
            SketchConstraint::Perpendicular { lines } => {
                Self::get_perpendicular_error(sketch, id_map, lines[0], lines[1])
            },
            SketchConstraint::Equal { entities } => {
                let g1 = Self::get_geometry(sketch, id_map, entities[0]);
                let g2 = Self::get_geometry(sketch, id_map, entities[1]);
                match (g1, g2) {
                    (Some(SketchGeometry::Line { start: s1, end: e1 }), Some(SketchGeometry::Line { start: s2, end: e2 })) => {
                        let l1 = ((s1[0]-e1[0]).powi(2) + (s1[1]-e1[1]).powi(2)).sqrt();
                        let l2 = ((s2[0]-e2[0]).powi(2) + (s2[1]-e2[1]).powi(2)).sqrt();
                        (l1 - l2).abs()
                    },
                    (Some(SketchGeometry::Circle { radius: r1, .. }), Some(SketchGeometry::Circle { radius: r2, .. })) => {
                        (r1 - r2).abs()
                    },
                    _ => 0.0
                }
            },
            SketchConstraint::Tangent { entities } => {
                // Simplified: just check line-circle tangency
                let g1 = Self::get_geometry(sketch, id_map, entities[0]);
                let g2 = Self::get_geometry(sketch, id_map, entities[1]);
                match (g1, g2) {
                    (Some(SketchGeometry::Line { start, end }), Some(SketchGeometry::Circle { center, radius })) |
                    (Some(SketchGeometry::Circle { center, radius }), Some(SketchGeometry::Line { start, end })) => {
                        let dx = end[0] - start[0];
                        let dy = end[1] - start[1];
                        let len = (dx*dx + dy*dy).sqrt();
                        if len < 1e-9 { return 0.0; }
                        let nx = -dy / len;
                        let ny = dx / len;
                        let v_cx = center[0] - start[0];
                        let v_cy = center[1] - start[1];
                        let dist = (v_cx * nx + v_cy * ny).abs();
                        (dist - radius).abs()
                    },
                    _ => 0.0
                }
            },
            SketchConstraint::Fix { point, position } => {
                let p = Self::get_point(sketch, id_map, *point);
                if let Some(pos) = p {
                    ((pos[0] - position[0]).powi(2) + (pos[1] - position[1]).powi(2)).sqrt()
                } else { 0.0 }
            },
            SketchConstraint::DistancePointLine { point, line, value, .. } => {
                let p = Self::get_point(sketch, id_map, *point);
                let l_geo = Self::get_geometry(sketch, id_map, *line);
                if let (Some(pos), Some(SketchGeometry::Line { start, end })) = (p, l_geo) {
                     let lx = end[0] - start[0];
                     let ly = end[1] - start[1];
                     let len = (lx*lx + ly*ly).sqrt();
                     if len > 1e-9 {
                         let nx = -ly / len;
                         let ny = lx / len;
                         let v_x = pos[0] - start[0];
                         let v_y = pos[1] - start[1];
                         let dist = (v_x * nx + v_y * ny).abs();
                         (dist - value).abs()
                     } else { 0.0 }
                } else { 0.0 }
            },
            SketchConstraint::Angle { lines, value, .. } => {
                // Calculate angle between two lines
                let geo1 = Self::get_geometry(sketch, id_map, lines[0]);
                let geo2 = Self::get_geometry(sketch, id_map, lines[1]);
                
                if let (Some(SketchGeometry::Line { start: s1, end: e1 }), Some(SketchGeometry::Line { start: s2, end: e2 })) = (geo1, geo2) {
                    // Determine connectivity to normalize vectors (outward from vertex)
                    let d_ss = ((s1[0]-s2[0]).powi(2) + (s1[1]-s2[1]).powi(2));
                    let d_se = ((s1[0]-e2[0]).powi(2) + (s1[1]-e2[1]).powi(2));
                    let d_es = ((e1[0]-s2[0]).powi(2) + (e1[1]-s2[1]).powi(2));
                    let d_ee = ((e1[0]-e2[0]).powi(2) + (e1[1]-e2[1]).powi(2));
                    
                    let min_dist = d_ss.min(d_se).min(d_es).min(d_ee);
                    
                    let v1_raw = [e1[0] - s1[0], e1[1] - s1[1]];
                    let v2_raw = [e2[0] - s2[0], e2[1] - s2[1]];
                    
                    // Determine if we need to flip vectors to point OUTWARD from vertex
                    let (v1, v2) = if (min_dist - d_ss).abs() < 1e-9 {
                        // Tail-Tail: Both Outward
                        (v1_raw, v2_raw)
                    } else if (min_dist - d_ee).abs() < 1e-9 {
                        // Head-Head: Both Inward -> Flip Both
                        ([-v1_raw[0], -v1_raw[1]], [-v2_raw[0], -v2_raw[1]])
                    } else if (min_dist - d_es).abs() < 1e-9 {
                        // Head-Tail (L1 End near L2 Start): L1 Inward -> Flip L1
                        ([-v1_raw[0], -v1_raw[1]], v2_raw)
                    } else {
                        // Tail-Head (L1 Start near L2 End): L2 Inward -> Flip L2
                        (v1_raw, [-v2_raw[0], -v2_raw[1]])
                    };
                    
                    let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
                    let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
                    
                    if len1 > 1e-9 && len2 > 1e-9 {
                        let n1 = [v1[0]/len1, v1[1]/len1];
                        let n2 = [v2[0]/len2, v2[1]/len2];
                        let dot = n1[0]*n2[0] + n1[1]*n2[1];
                        let current_angle = dot.clamp(-1.0, 1.0).acos();
                        (current_angle - value).abs()
                    } else { 0.0 }
                } else { 0.0 }
            },
            SketchConstraint::Radius { entity, value, .. } => {
                let geo = Self::get_geometry(sketch, id_map, *entity);
                match geo {
                    Some(SketchGeometry::Circle { radius, .. }) => (radius - value).abs(),
                    Some(SketchGeometry::Arc { radius, .. }) => (radius - value).abs(),
                    _ => 0.0
                }
            },
            SketchConstraint::Symmetric { p1, p2, axis } => {
                let pos1 = Self::get_point(sketch, id_map, *p1);
                let pos2 = Self::get_point(sketch, id_map, *p2);
                let axis_geo = Self::get_geometry(sketch, id_map, *axis);
                
                if let (Some(pt1), Some(pt2), Some(SketchGeometry::Line { start: s, end: e })) = (pos1, pos2, axis_geo) {
                     let lx = e[0] - s[0];
                     let ly = e[1] - s[1];
                     let len_sq = lx * lx + ly * ly;
                     
                     if len_sq > 1e-9 {
                         let inv_len = 1.0 / len_sq.sqrt();
                         let nx = lx * inv_len;
                         let ny = ly * inv_len;
                         
                         // Reflect P1 over axis
                         let v1x = pt1[0] - s[0];
                         let v1y = pt1[1] - s[1];
                         let dot = v1x * nx + v1y * ny;
                         let proj_x = s[0] + dot * nx;
                         let proj_y = s[1] + dot * ny;
                         let perp_x = pt1[0] - proj_x;
                         let perp_y = pt1[1] - proj_y;
                         let target_x = proj_x - perp_x;
                         let target_y = proj_y - perp_y;
                         
                         let dx = pt2[0] - target_x;
                         let dy = pt2[1] - target_y;
                         (dx*dx + dy*dy).sqrt()
                     } else { 0.0 }
                } else { 0.0 }
            }
        }
    }
    
    /// Get all entity IDs referenced by a constraint
    fn get_constraint_entities(constraint: &SketchConstraint) -> Vec<EntityId> {
        match constraint {
            SketchConstraint::Coincident { points } => vec![points[0].id, points[1].id],
            SketchConstraint::Horizontal { entity } => vec![*entity],
            SketchConstraint::Vertical { entity } => vec![*entity],
            SketchConstraint::Distance { points, .. } => vec![points[0].id, points[1].id],
            SketchConstraint::Fix { point, .. } => vec![point.id],
            SketchConstraint::Angle { lines, .. } => vec![lines[0], lines[1]],
            SketchConstraint::Parallel { lines } => vec![lines[0], lines[1]],
            SketchConstraint::Perpendicular { lines } => vec![lines[0], lines[1]],
            SketchConstraint::Tangent { entities } => vec![entities[0], entities[1]],
            SketchConstraint::Equal { entities } => vec![entities[0], entities[1]],
            SketchConstraint::Radius { entity, .. } => vec![*entity],
            SketchConstraint::Symmetric { p1, p2, axis } => vec![p1.id, p2.id, *axis],
            SketchConstraint::DistancePointLine { point, line, .. } => vec![point.id, *line],
        }
    }
    
    /// Calculate parallel constraint error
    fn get_parallel_error(sketch: &Sketch, id_map: &HashMap<EntityId, usize>, id1: EntityId, id2: EntityId) -> f64 {
        let v1 = Self::get_line_vector(sketch, id_map, id1);
        let v2 = Self::get_line_vector(sketch, id_map, id2);
        if let (Some(v1), Some(v2)) = (v1, v2) {
            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
            if len1 > 1e-9 && len2 > 1e-9 {
                let n1 = [v1[0]/len1, v1[1]/len1];
                let n2 = [v2[0]/len2, v2[1]/len2];
                let cross = (n1[0]*n2[1] - n1[1]*n2[0]).abs();
                return cross;
            }
        }
        0.0
    }
    
    /// Calculate perpendicular constraint error
    fn get_perpendicular_error(sketch: &Sketch, id_map: &HashMap<EntityId, usize>, id1: EntityId, id2: EntityId) -> f64 {
        let v1 = Self::get_line_vector(sketch, id_map, id1);
        let v2 = Self::get_line_vector(sketch, id_map, id2);
        if let (Some(v1), Some(v2)) = (v1, v2) {
            let len1 = (v1[0]*v1[0] + v1[1]*v1[1]).sqrt();
            let len2 = (v2[0]*v2[0] + v2[1]*v2[1]).sqrt();
            if len1 > 1e-9 && len2 > 1e-9 {
                let n1 = [v1[0]/len1, v1[1]/len1];
                let n2 = [v2[0]/len2, v2[1]/len2];
                let dot = (n1[0]*n2[0] + n1[1]*n2[1]).abs();
                return dot;
            }
        }
        0.0
    }
    
    // ... helper methods ...

    fn get_point(sketch: &Sketch, map: &HashMap<EntityId, usize>, cp: ConstraintPoint) -> Option<[f64; 2]> {
        if cp.id == EntityId::from_uuid(uuid::Uuid::nil()) {
            return Some([0.0, 0.0]);
        }
        
        if let Some(idx) = map.get(&cp.id) {
            let ent = &sketch.entities[*idx];
            match &ent.geometry {
                SketchGeometry::Line { start, end } => {
                    if cp.index == 0 { Some(*start) } else { Some(*end) }
                },
                SketchGeometry::Point { pos } => Some(*pos),
                SketchGeometry::Circle { center, .. } => {
                    if cp.index == 0 { Some(*center) } else { None }
                },
                SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                    match cp.index {
                        0 => Some(*center),
                        1 => Some([center[0] + radius * start_angle.cos(), center[1] + radius * start_angle.sin()]),
                        2 => Some([center[0] + radius * end_angle.cos(), center[1] + radius * end_angle.sin()]),
                        _ => None,
                    }
                },
                SketchGeometry::Ellipse { center, semi_major, semi_minor, rotation } => {
                    match cp.index {
                        0 => Some(*center),
                        1 => {
                            // Major Axis End (+U)
                            let dx = semi_major * rotation.cos();
                            let dy = semi_major * rotation.sin();
                            Some([center[0] + dx, center[1] + dy])
                        },
                        2 => {
                            // Minor Axis End (+V) - Perpendicular (+90 deg)
                            let dx = semi_minor * (rotation + std::f64::consts::FRAC_PI_2).cos();
                            let dy = semi_minor * (rotation + std::f64::consts::FRAC_PI_2).sin();
                            Some([center[0] + dx, center[1] + dy])
                        },
                        _ => None,
                    }
                },
            }
        } else {
            None
        }
    }

    fn get_line_vector(sketch: &Sketch, map: &HashMap<EntityId, usize>, id: EntityId) -> Option<[f64; 2]> {
        if let Some(idx) = map.get(&id) {
             if let SketchGeometry::Line { start, end } = sketch.entities[*idx].geometry {
                 return Some([end[0] - start[0], end[1] - start[1]]);
             }
        }
        None
    }

    fn get_geometry<'a>(sketch: &'a Sketch, map: &HashMap<EntityId, usize>, id: EntityId) -> Option<&'a SketchGeometry> {
        if let Some(idx) = map.get(&id) {
            Some(&sketch.entities[*idx].geometry)
        } else {
            None
        }
    }
    
    // Non-borrowing copy for matching
    fn get_geometry_copy(sketch: &Sketch, map: &HashMap<EntityId, usize>, id: EntityId) -> Option<SketchGeometry> {
        if let Some(idx) = map.get(&id) {
            Some(sketch.entities[*idx].geometry.clone())
        } else {
            None
        }
    }

    fn set_line_length(sketch: &mut Sketch, map: &HashMap<EntityId, usize>, id: EntityId, new_len: f64) {
        if let Some(idx) = map.get(&id) {
            if let SketchGeometry::Line { start, end } = &mut sketch.entities[*idx].geometry {
                let dx = end[0] - start[0];
                let dy = end[1] - start[1];
                let cur = (dx*dx+dy*dy).sqrt();
                if cur > 1e-9 {
                    let scale = new_len / cur;
                    let mid_x = (start[0] + end[0]) * 0.5;
                    let mid_y = (start[1] + end[1]) * 0.5;
                    let half_dx = dx * scale * 0.5;
                    let half_dy = dy * scale * 0.5;
                    *start = [mid_x - half_dx, mid_y - half_dy];
                    *end = [mid_x + half_dx, mid_y + half_dy];
                }
            }
        }
    }

    fn set_circle_radius(sketch: &mut Sketch, map: &HashMap<EntityId, usize>, id: EntityId, new_r: f64) {
        if let Some(idx) = map.get(&id) {
            if let SketchGeometry::Circle { radius, .. } = &mut sketch.entities[*idx].geometry {
                *radius = new_r;
            }
        }
    }

    fn set_arc_radius(sketch: &mut Sketch, map: &HashMap<EntityId, usize>, id: EntityId, new_r: f64) {
        if let Some(idx) = map.get(&id) {
            if let SketchGeometry::Arc { radius, .. } = &mut sketch.entities[*idx].geometry {
                *radius = new_r;
            }
        }
    }

    fn solve_line_circle_tangent(
        sketch: &mut Sketch, 
        map: &HashMap<EntityId, usize>, 
        _line_id: EntityId, // Unused
        circle_id: EntityId,
        start: [f64; 2], end: [f64; 2], center: [f64; 2], radius: f64,
        max_error: &mut f64
    ) {
        // Distance from center to line
        let dx = end[0] - start[0];
        let dy = end[1] - start[1];
        let len = (dx*dx + dy*dy).sqrt();
        
        if len < 1e-9 { return; } // Degenerate line
        
        // Normal vector
        let nx = -dy / len;
        let ny = dx / len;
        
        // Project center onto line to find distance
        // Line eq: (p - start) . n = dist
        // But simpler: Signed distance = ((center - start) . n)
        let v_cx = center[0] - start[0];
        let v_cy = center[1] - start[1];
        let dist = (v_cx * nx + v_cy * ny).abs();
        
        let err = (dist - radius).abs();
        if err > *max_error { *max_error = err; }
        
        if err > 1e-6 {
           // Move circle towards line (or line towards circle)
           // Move circle center along normal direction
           // Find current sign
           let sign = if (v_cx * nx + v_cy * ny) > 0.0 { 1.0 } else { -1.0 };
           let target_dist = radius * sign;
           
           // Current projection
           let current_proj = v_cx * nx + v_cy * ny;
           let shift = target_dist - current_proj;
           
           let shift_x = shift * nx;
           let shift_y = shift * ny;
           
           // Move center
           if let Some(idx) = map.get(&circle_id) {
               if let SketchGeometry::Circle { center: c, .. } = &mut sketch.entities[*idx].geometry {
                   c[0] += shift_x * 0.5; // Relaxation
                   c[1] += shift_y * 0.5;
               }
           }
        }
    }

    fn rotate_line_to_dir(sketch: &mut Sketch, map: &HashMap<EntityId, usize>, id: EntityId, dir: [f64; 2]) {
        if let Some(idx) = map.get(&id) {
            if let SketchGeometry::Line { start, end } = &mut sketch.entities[*idx].geometry {
                let mid_x = (start[0] + end[0]) * 0.5;
                let mid_y = (start[1] + end[1]) * 0.5;
                let dx = end[0] - start[0];
                let dy = end[1] - start[1];
                let len = (dx*dx+dy*dy).sqrt();
                let half_len = len * 0.5;
                
                let new_half_dx = dir[0] * half_len;
                let new_half_dy = dir[1] * half_len;
                
                *start = [mid_x - new_half_dx, mid_y - new_half_dy];
                *end = [mid_x + new_half_dx, mid_y + new_half_dy];
            }
        }
    }

    fn set_point(sketch: &mut Sketch, map: &HashMap<EntityId, usize>, cp: ConstraintPoint, new_pos: [f64; 2]) {
        if cp.id == EntityId::from_uuid(uuid::Uuid::nil()) {
            return;
        }

        if let Some(idx) = map.get(&cp.id) {
            match &mut sketch.entities[*idx].geometry {
                SketchGeometry::Line { start, end } => {
                    if cp.index == 0 { *start = new_pos; } else { *end = new_pos; }
                },
                SketchGeometry::Point { pos } => { *pos = new_pos; },
                SketchGeometry::Circle { center, .. } => {
                     if cp.index == 0 { *center = new_pos; }
                },
                SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                     match cp.index {
                         0 => *center = new_pos,
                         1 => *start_angle = (new_pos[1] - center[1]).atan2(new_pos[0] - center[0]),
                         2 => *end_angle = (new_pos[1] - center[1]).atan2(new_pos[0] - center[0]),
                         _ => {}
                     }
                },
                SketchGeometry::Ellipse { center, semi_major, semi_minor, rotation } => {
                     match cp.index {
                         0 => *center = new_pos,
                         1 => {
                             // Modify Semi-Major and Rotation
                             let dx = new_pos[0] - center[0];
                             let dy = new_pos[1] - center[1];
                             *semi_major = (dx*dx + dy*dy).sqrt();
                             *rotation = dy.atan2(dx);
                         },
                         2 => {
                            // Modify Semi-Minor only (projection onto minor axis direction)
                            // Minor axis direction is current rotation + 90deg
                            // But usually, if we drag the minor axis point, we want the ellipse to widen/narrow.
                            // We shouldn't rotate the ellipse via the minor axis handle in most CAD UX, 
                            // OR we should? 
                            // Let's implement it such that it updates semi_minor based on distance to center,
                            // BUT we might assume the point stays on the minor axis?
                            // Safest: Update semi_minor to match the distance from center.
                            // Does NOT update rotation.
                             let dx = new_pos[0] - center[0];
                             let dy = new_pos[1] - center[1];
                             *semi_minor = (dx*dx + dy*dy).sqrt();
                         },
                         _ => {}
                     }
                },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sketch::types::{SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint};

    #[test]
    fn test_rectangle_constraints() {
        let mut sketch = Sketch::new(SketchPlane::default());
        
        // Create 4 lines forming an approximate rectangle
        // L1 (Top): (0,10) -> (10,10)
        // L2 (Right): (10,10) -> (10,0)
        // L3 (Bottom): (10,0) -> (0,0)
        // L4 (Left): (0,0) -> (0,10)
        
        // Intentionally perturb one point to test solver
        // L1 end is at (10.1, 9.9) instead of (10,10)
        
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 10.0], end: [10.1, 9.9] });
        let l2 = sketch.add_entity(SketchGeometry::Line { start: [10.1, 9.9], end: [10.0, 0.0] });
        let l3 = sketch.add_entity(SketchGeometry::Line { start: [10.0, 0.0], end: [0.0, 0.0] });
        let l4 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [0.0, 10.0] });

        // Add Constraints
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Vertical { entity: l2 }.into());
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l3 }.into());
        sketch.constraints.push(SketchConstraint::Vertical { entity: l4 }.into());

        // Coincident Corners
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l1, index: 1 },
            ConstraintPoint { id: l2, index: 0 }
        ]}.into());
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l2, index: 1 },
            ConstraintPoint { id: l3, index: 0 }
        ]}.into());
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l3, index: 1 },
            ConstraintPoint { id: l4, index: 0 }
        ]}.into());
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l4, index: 1 },
            ConstraintPoint { id: l1, index: 0 }
        ]}.into());

        let converged = SketchSolver::solve(&mut sketch);
        assert!(converged, "Solver should converge");

        // Verify Horizontal L1
        if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
            assert!((start[1] - end[1]).abs() < 1e-4, "L1 should be horizontal");
        }

        // Verify Vertical L2
        if let SketchGeometry::Line { start, end } = sketch.entities[1].geometry {
            assert!((start[0] - end[0]).abs() < 1e-4, "L2 should be vertical");
        }

        // Verify Coincidence L1.end == L2.start
        if let (SketchGeometry::Line { end: l1_end, .. }, SketchGeometry::Line { start: l2_start, .. }) = 
               (&sketch.entities[0].geometry, &sketch.entities[1].geometry) 
        {
            let dist = ((l1_end[0] - l2_start[0]).powi(2) + (l1_end[1] - l2_start[1]).powi(2)).sqrt();
            assert!(dist < 1e-4, "Corners should be coincident");
        }
    }

    #[test]
    fn test_parallel_perpendicular() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // L1: Horizontal
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        // L2: Slanted
        let l2 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 5.0], end: [10.0, 6.0] });
        // L3: Nearly vertical
        let l3 = sketch.add_entity(SketchGeometry::Line { start: [5.0, 0.0], end: [5.1, 10.0] });

        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Parallel { lines: [l1, l2] }.into());
        sketch.constraints.push(SketchConstraint::Perpendicular { lines: [l1, l3] }.into());

        let converged = SketchSolver::solve(&mut sketch);
        
        // Debug output
        
        assert!(converged, "Parallel/Perp solver should converge");

        // Check L2 Parallel to L1 (Horizontal)
        if let SketchGeometry::Line { start, end } = sketch.entities[1].geometry {
            assert!((start[1] - end[1]).abs() < 1e-4, "L2 should be horizontal (parallel to L1)");
        }
        
        // Check L3 Perpendicular to L1 (Vertical)
        if let SketchGeometry::Line { start, end } = sketch.entities[2].geometry {
             assert!((start[0] - end[0]).abs() < 1e-4, "L3 should be vertical (perp to L1)");
        }
    }

    #[test]
    fn test_equal_length() {
        let mut sketch = Sketch::new(SketchPlane::default());
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        let l2 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 5.0], end: [5.0, 5.0] });

        sketch.constraints.push(SketchConstraint::Equal { entities: [l1, l2] }.into());

        let converged = SketchSolver::solve(&mut sketch);
        assert!(converged);

        if let (SketchGeometry::Line { start: s1, end: e1 }, SketchGeometry::Line { start: s2, end: e2 }) = 
               (&sketch.entities[0].geometry, &sketch.entities[1].geometry) {
            let len1 = ((s1[0]-e1[0]).powi(2) + (s1[1]-e1[1]).powi(2)).sqrt();
            let len2 = ((s2[0]-e2[0]).powi(2) + (s2[1]-e2[1]).powi(2)).sqrt();
            assert!((len1 - len2).abs() < 1e-4, "Lengths should be equal");
            // They should converge to average (7.5)
            assert!((len1 - 7.5).abs() < 0.1, "Should converge towards average");
        }
    }

    #[test]
    fn test_tangent_line_circle() {
        let mut sketch = Sketch::new(SketchPlane::default());
        let c1 = sketch.add_entity(SketchGeometry::Circle { center: [0.0, 0.0], radius: 5.0 });
        // Line at y=6 (dist 6 from center, radius is 5, error 1.0)
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [-10.0, 6.0], end: [10.0, 6.0] });

        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Tangent { entities: [l1, c1] }.into()); // Or [c1, l1]

        let converged = SketchSolver::solve(&mut sketch);
        assert!(converged);

        if let SketchGeometry::Circle { center, .. } = sketch.entities[0].geometry {
            // Center should move up to y=1.0 OR y=-11? or radius change?
            // Our logic moves Center.
            // Distance to line y=6 is |6 - center.y|
            // Radius is 5.
            // So |6 - center.y| == 5 => center.y = 1 or 11.
            // Starts at 0, should move to 1.
            assert!((center[1] - 1.0).abs() < 1e-3, "Circle center should move to satisfy tangent");
        }
    }
    #[test]
    fn test_arc_connectivity() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Arc at (0,0) radius 10, from 0 to 90 degrees
        let arc = sketch.add_entity(SketchGeometry::Arc { center: [0.0, 0.0], radius: 10.0, start_angle: 0.0, end_angle: std::f64::consts::FRAC_PI_2 });
        // Line starting near arc end (0, 10)
        let line = sketch.add_entity(SketchGeometry::Line { start: [0.1, 10.1], end: [0.0, 20.0 ]}); // Slightly off

        // Coincident Line Start with Arc End (Index 2)
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: line, index: 0 },
            ConstraintPoint { id: arc, index: 2 }
        ]}.into());

        let converged = SketchSolver::solve(&mut sketch);
        assert!(converged);

        if let (SketchGeometry::Arc { end_angle, radius, .. }, SketchGeometry::Line { start, .. }) = 
               (&sketch.entities[0].geometry, &sketch.entities[1].geometry) 
        {
             let arc_end_x = radius * end_angle.cos();
             let arc_end_y = radius * end_angle.sin();
             let dist = ((start[0] - arc_end_x).powi(2) + (start[1] - arc_end_y).powi(2)).sqrt();
             assert!(dist < 1e-3, "Line should be connected to arc end");
        }
    }

    // ============ Redundant Constraint Detection Tests ============

    #[test]
    fn test_redundant_exact_duplicate() {
        let mut sketch = Sketch::new(SketchPlane::default());
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
        
        // Add same Horizontal constraint twice - second should be detected as redundant
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        assert!(result.converged, "Solver should still converge");
        assert_eq!(result.redundant_constraints.len(), 1, "Should detect exactly one redundant constraint");
        assert_eq!(result.redundant_constraints[0].constraint_index, 1, "Second constraint should be marked redundant");
        assert_eq!(result.redundant_constraints[0].duplicates_index, Some(0), "Should reference first constraint");
        assert!(result.redundant_constraints[0].reason.contains("duplicate"), "Reason should mention duplicate");
    }

    #[test]
    fn test_redundant_coincident_transitive() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Three lines: A, B, C
        let l_a = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        let l_b = sketch.add_entity(SketchGeometry::Line { start: [10.0, 0.0], end: [20.0, 0.0] });
        let l_c = sketch.add_entity(SketchGeometry::Line { start: [20.0, 0.0], end: [30.0, 0.0] });
        
        // A.end = B.start
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l_a, index: 1 },
            ConstraintPoint { id: l_b, index: 0 },
        ]}.into());
        // B.start = C.start (B.start is effectively same as A.end now)
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l_b, index: 0 },
            ConstraintPoint { id: l_c, index: 0 },
        ]}.into());
        // A.end = C.start - this is implied by transitivity (A.end = B.start = C.start)
        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l_a, index: 1 },
            ConstraintPoint { id: l_c, index: 0 },
        ]}.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        assert!(result.converged, "Solver should converge");
        // In a triangle of coincidents (A=B, B=C, A=C), not all are structurally independent
        // The algorithm detects that at least one can be removed without breaking connectivity
        // Since we're detecting via union-find, we may detect multiple as redundant
        assert!(result.redundant_constraints.len() >= 1, "Should detect at least one redundant constraint");
        // The last one added (A=C) should definitely be detected since A and C are already
        // connected through B by the time we process it
        let has_transitive = result.redundant_constraints.iter().any(|r| r.reason.contains("transitivity"));
        assert!(has_transitive, "At least one should be marked as transitively implied");
    }

    #[test]
    fn test_no_false_positives() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Two different lines with Horizontal constraints (not redundant)
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
        let l2 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 10.0], end: [10.0, 15.0] });
        
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l2 }.into());
        sketch.constraints.push(SketchConstraint::Parallel { lines: [l1, l2] }.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        assert!(result.converged, "Solver should converge");
        // Horizontal on L1, Horizontal on L2, and Parallel L1-L2 are NOT redundant
        // (Even though horizontal implies parallel, they lock DIFFERENT DOFs)
        assert_eq!(result.redundant_constraints.len(), 0, "Should not detect any redundant constraints");
    }

    // ============ Conflict Detection Tests ============

    #[test]
    fn test_conflict_detection_horizontal_vertical() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Create a diagonal line
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 10.0] });
        
        // Apply both Horizontal AND Vertical
        // Note: This converges to a degenerate (zero-length line / point)
        // DOF = 4 (line) - 1 (horiz) - 1 (vert) = 2 (still under-constrained)
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        sketch.constraints.push(SketchConstraint::Vertical { entity: l1 }.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        // The solver converges to a degenerate solution (zero-length line/point)
        // This is mathematically valid - both constraints satisfied when start==end
        // Verify the line collapsed to a point
        if let SketchGeometry::Line { start, end } = sketch.entities[0].geometry {
            let len = ((end[0] - start[0]).powi(2) + (end[1] - start[1]).powi(2)).sqrt();
            assert!(len < 1e-4, "Line should collapse to nearly zero length");
        }
        
        // No conflicts because solver converged
        assert!(result.conflicts.is_none(), "No conflicts when converged (even to degenerate solution)");
    }

    #[test]
    fn test_conflict_detection_opposing_distance() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Two points
        let p1 = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 0.0] });
        let p2 = sketch.add_entity(SketchGeometry::Point { pos: [5.0, 0.0] });
        
        // Conflicting distance constraints: 10 and 20
        sketch.constraints.push(SketchConstraint::Distance { 
            points: [
                ConstraintPoint { id: p1, index: 0 },
                ConstraintPoint { id: p2, index: 0 },
            ],
            value: 10.0,
            style: None,
        }.into());
        sketch.constraints.push(SketchConstraint::Distance { 
            points: [
                ConstraintPoint { id: p1, index: 0 },
                ConstraintPoint { id: p2, index: 0 },
            ],
            value: 20.0,
            style: None,
        }.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        // Solver should NOT converge - can't be both 10 and 20 apart
        assert!(!result.converged, "Solver should not converge with conflicting distance constraints");
        
        // Should have conflict info
        assert!(result.conflicts.is_some(), "Should have conflict information");
        
        let conflicts = result.conflicts.unwrap();
        
        // Should detect the conflicting distance values
        let has_distance_conflict = conflicts.possible_conflicts.iter().any(|(_, _, reason)| {
            reason.contains("distance") || reason.contains("10") || reason.contains("20")
        }.into());
        assert!(has_distance_conflict, "Should detect conflicting distance values");
    }

    #[test]
    fn test_no_conflict_when_converged() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Simple valid sketch
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 5.0] });
        
        // Single Horizontal constraint - should converge fine
        sketch.constraints.push(SketchConstraint::Horizontal { entity: l1 }.into());
        
        let result = SketchSolver::solve_with_result(&mut sketch);
        
        assert!(result.converged, "Solver should converge");
        assert!(result.conflicts.is_none(), "Should have no conflict info when converged");
    }
    #[test]
    fn test_angle_head_to_tail_fix() {
        let mut sketch = Sketch::new(SketchPlane::default());
        let l1 = sketch.add_entity(SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] });
        // L2: (-5, 8.66) -> (0,0) (Head is at 0,0) -> Visual 120 deg
        let l2 = sketch.add_entity(SketchGeometry::Line { start: [-5.0, 8.66025], end: [0.0, 0.0] });

        sketch.constraints.push(SketchConstraint::Coincident { points: [
            ConstraintPoint { id: l1, index: 0 },
            ConstraintPoint { id: l2, index: 1 }
        ]}.into());

        let target_angle = 120.0 * std::f64::consts::PI / 180.0;
        sketch.constraints.push(SketchConstraint::Angle { 
            lines: [l1, l2],
            value: target_angle,
            style: None
        }.into());

        let id_map: std::collections::HashMap<_, _> = sketch.entities.iter().enumerate().map(|(i,e)| (e.id, i)).collect();
        let error = SketchSolver::calculate_constraint_error(&sketch, &id_map, &sketch.constraints[1].constraint);
        assert!(error < 1e-3, "Initial error should be zero for matching geometry (120 deg). Got {}", error);
    }
}
