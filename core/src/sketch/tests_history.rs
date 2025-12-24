#[cfg(test)]
mod tests {
    use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchConstraint, ConstraintPoint, SketchOperation};
    use crate::topo::EntityId;

    #[test]
    fn test_history_appending() {
        let mut sketch = Sketch::new(SketchPlane::default());
        let id = sketch.add_entity(SketchGeometry::Point { pos: [0.0, 0.0] });

        assert_eq!(sketch.history.len(), 1);
        match &sketch.history[0] {
            SketchOperation::AddGeometry { id: op_id, geometry } => {
                assert_eq!(id, *op_id);
                match geometry {
                    SketchGeometry::Point { pos } => assert_eq!(*pos, [0.0, 0.0]),
                    _ => panic!("Wrong geometry type"),
                }
            }
            _ => panic!("Wrong operation type"),
        }

        let constraint = SketchConstraint::Fix { 
            point: ConstraintPoint { id, index: 0 }, 
            position: [0.0, 0.0] 
        };
        sketch.add_constraint(constraint.clone());

        assert_eq!(sketch.history.len(), 2);
        match &sketch.history[1] {
            SketchOperation::AddConstraint { constraint: op_constraint } => {
                // Determine equality by checking variant since PartialEq might not be fully transparent (it is derived, so it should be fine)
                assert_eq!(*op_constraint, constraint);
            }
            _ => panic!("Wrong operation type"),
        }
    }

    #[test]
    fn test_migration() {
        let mut sketch = Sketch::new(SketchPlane::default());
        // Manually push to simulate legacy state (bypass add_entity/add_constraint helpers that auto-push to history)
        let id1 = EntityId::new();
        let geom1 = SketchGeometry::Line { start: [0.0, 0.0], end: [10.0, 0.0] };
        sketch.entities.push(crate::sketch::types::SketchEntity { 
            id: id1, 
            geometry: geom1.clone(), 
            is_construction: false 
        });

        let constraint = SketchConstraint::Horizontal { entity: id1 };
        sketch.constraints.push(constraint.clone().into());

        // History should be empty initially (simulating legacy)
        assert!(sketch.history.is_empty());

        // Run migration
        sketch.ensure_history();

        assert_eq!(sketch.history.len(), 2);
        match &sketch.history[0] {
            SketchOperation::AddGeometry { id, geometry } => {
                assert_eq!(*id, id1);
                assert_eq!(*geometry, geom1);
            }
            _ => panic!("Expected AddGeometry"),
        }
        match &sketch.history[1] {
            SketchOperation::AddConstraint { constraint: op_c } => {
                assert_eq!(*op_c, constraint);
            }
            _ => panic!("Expected AddConstraint"),
        }

        // Run usage again to ensure idempotency
        sketch.ensure_history();
        assert_eq!(sketch.history.len(), 2);
    }
}
