
use crate::microcad_kernel::ast::*;
use crate::microcad_kernel::Runtime;
use crate::topo::IdGenerator;
use crate::topo::naming::{TopoRank, TopoId};

#[test]
fn test_determinism_across_runs() {
    let runtime = Runtime::new();
    
    // Run 1
    let gen1 = IdGenerator::new("SessionA");
    let prog1 = Program {
        statements: vec![
            // Context switch essential for stability
            Statement::Expression(Expression::Call(Call {
                function: "set_context".to_string(),
                args: vec![Expression::Value(Value::String("FeatureA".to_string()))]
            })),
            Statement::Assignment {
                name: "c1".to_string(),
                expr: Expression::Call(Call { function: "cube".to_string(), args: vec![] })
            }
        ]
    };
    
    let res1 = runtime.evaluate(&prog1, &gen1).expect("Run 1 failed");
    
    // Run 2 (Fresh generator, same seed)
    let gen2 = IdGenerator::new("SessionA");
    let prog2 = prog1.clone();
    
    let res2 = runtime.evaluate(&prog2, &gen2).expect("Run 2 failed");

    // Assert that the generated TopoIds in the manifest are identical
    assert_eq!(res1.topology_manifest.len(), res2.topology_manifest.len());
    assert!(res1.topology_manifest.len() > 0);

    for (id1, _) in &res1.topology_manifest {
        assert!(res2.topology_manifest.contains_key(id1), "Run 2 missing ID {:?}", id1);
    }
}

#[test]
fn test_differentiation_by_feature_seed() {
    let runtime = Runtime::new();
    let gen = IdGenerator::new("Session");

    // Feature A
    let prog_a = Program {
        statements: vec![
            Statement::Expression(Expression::Call(Call {
                function: "set_context".to_string(),
                args: vec![Expression::Value(Value::String("FeatureA".to_string()))]
            })),
            Statement::Assignment {
                name: "c".to_string(),
                expr: Expression::Call(Call { function: "cube".to_string(), args: vec![] })
            }
        ]
    };
    let res_a = runtime.evaluate(&prog_a, &gen).expect("A failed");

    // Feature B (Same geometry, different seed)
    let prog_b = Program {
        statements: vec![
            Statement::Expression(Expression::Call(Call {
                function: "set_context".to_string(),
                args: vec![Expression::Value(Value::String("FeatureB".to_string()))]
            })),
            Statement::Assignment {
                name: "c".to_string(),
                expr: Expression::Call(Call { function: "cube".to_string(), args: vec![] })
            }
        ]
    };
    let res_b = runtime.evaluate(&prog_b, &gen).expect("B failed");

    // IDs should be completely different
    for (id_a, _) in &res_a.topology_manifest {
        assert!(!res_b.topology_manifest.contains_key(id_a), "Feature B should not share IDs with A");
    }
}

#[test]
fn test_analytic_data_integrity() {
    let runtime = Runtime::new();
    let gen = IdGenerator::new("Session");
    
    let prog = Program {
        statements: vec![
             Statement::Expression(Expression::Call(Call {
                function: "set_context".to_string(),
                args: vec![Expression::Value(Value::String("F1".to_string()))]
            })),
            Statement::Assignment {
                name: "e".to_string(),
                expr: Expression::Call(Call { function: "extrude".to_string(), args: vec![] })
            }
        ]
    };

    let res = runtime.evaluate(&prog, &gen).expect("Eval failed");
    
    // We expect at least one plane (from our mock implementation)
    let mut found_plane = false;
    for (_, entity) in &res.topology_manifest {
        if let crate::topo::registry::AnalyticGeometry::Plane { normal, .. } = entity.geometry {
            found_plane = true;
            // Our mock extrude creates a top face with normal (0, 0, 1)
            assert_eq!(normal, [0.0, 0.0, 1.0]); 
        }
    }
    assert!(found_plane, "Should have generated analytic plane data");
}
