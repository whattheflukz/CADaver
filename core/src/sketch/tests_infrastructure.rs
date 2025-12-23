
use crate::sketch::types::{Sketch, SketchPlane, SketchGeometry};
use crate::features::types::{Feature, FeatureType, ParameterValue};

#[test]
fn test_sketch_feature_integration() {
    // 1. Create a Sketch
    let mut sketch = Sketch::new(SketchPlane::default());
    let line_id = sketch.add_entity(SketchGeometry::Line {
        start: [0.0, 0.0],
        end: [10.0, 10.0],
    });

    assert_eq!(sketch.entities.len(), 1);
    assert_eq!(sketch.entities[0].id, line_id);

    // 2. Wrap in Feature
    let feature = Feature::new("Sketch1", FeatureType::Sketch)
        .with_param("sketch_data", ParameterValue::Sketch(sketch));

    // 3. Serialize/Deserialize (Simulate persistence)
    let json = serde_json::to_string(&feature).expect("Failed to serialize feature");
    let deserialized: Feature = serde_json::from_str(&json).expect("Failed to deserialize feature");

    assert_eq!(deserialized.name, "Sketch1");
    
    if let ParameterValue::Sketch(restored_sketch) = deserialized.parameters.get("sketch_data").unwrap() {
        assert_eq!(restored_sketch.entities.len(), 1);
        assert_eq!(restored_sketch.entities[0].id, line_id); // IDs must persist!
    } else {
        panic!("Parameter 'sketch_data' was not preserved as Sketch variant");
    }
}
