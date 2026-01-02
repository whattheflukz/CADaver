use cad_core::evaluator::runtime::Runtime;
use cad_core::evaluator::ast::{Program, Statement, Expression, Call, Value};
use cad_core::topo::IdGenerator;
use cad_core::sketch::types::{Sketch, SketchPlane, SketchGeometry, SketchEntity};
use cad_core::topo::EntityId;

fn make_line(x1: f64, y1: f64, x2: f64, y2: f64) -> SketchEntity {
    SketchEntity {
        id: EntityId::new(),
        geometry: SketchGeometry::Line {
            start: [x1, y1],
            end: [x2, y2],
        },
        is_construction: false,
    }
}

#[test]
fn test_extrude_intersecting_regions_runtime() {
    let mut sketch = Sketch::new(SketchPlane::default());
    
    // Rectangle edges
    sketch.entities.push(make_line(0.0, 0.0, 10.0, 0.0));
    sketch.entities.push(make_line(10.0, 0.0, 10.0, 10.0));
    sketch.entities.push(make_line(10.0, 10.0, 0.0, 10.0));
    sketch.entities.push(make_line(0.0, 10.0, 0.0, 0.0));

    // Bisector
    sketch.entities.push(make_line(5.0, -1.0, 5.0, 11.0));
    
    let sketch_json = serde_json::to_string(&sketch).unwrap();
    
    let program = Program {
        statements: vec![
            Statement::Expression(Expression::Call(Call {
                function: "extrude".to_string(),
                args: vec![
                    Expression::Value(Value::String(sketch_json)),
                    Expression::Value(Value::Number(10.0)),
                    Expression::Value(Value::String("Add".to_string())),
                    Expression::Value(Value::Number(0.0)),
                    Expression::Value(Value::Array(vec![])), 
                ]
            }))
        ]
    };
    
    let runtime = Runtime::new();
    let gen = IdGenerator::new("test_run");
    let result = runtime.evaluate(&program, &gen).unwrap();
    
    // Check logs for debug info
    for log in &result.logs {
        println!("{}", log);
    }
    
    // We expect 2 regions to be processed.
    assert!(result.logs.iter().any(|l| l.contains("Found 2 regions for extrusion")));
    
    // We expect tessellation to contain triangles.
    assert!(result.tessellation.indices.len() > 0, "Should generate geometry");
    
    // Count distinct TopFace entities
    // The derived ID logic uses strings like "TopFace_0", "TopFace_1"
    // Since TopoId is opaque slightly (u128), we rely on the manifest which stores KernelEntity.
    // But runtime doesn't expose the name explicitly in KernelEntity, just ID and Geometry.
    // However, we can check the count of analytic planes.
    
    let planes = result.topology_manifest.values().filter(|e| {
        matches!(e.geometry, cad_core::topo::registry::AnalyticGeometry::Plane { .. })
    }).count();
    
    // 2 regions. Each has Top(1) + Bottom(1) + Side faces.
    // Square 1 sides: 4 sides. Square 2 sides: 4 sides. 
    // Total approx 2*(1+1+4) = 12 planes.
    // Could be faces for bisector segments too.
    
    assert!(planes >= 12, "Should have enough planes for 2 rectangular prisms (found {})", planes);
}
