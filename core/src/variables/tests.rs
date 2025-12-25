//! Integration tests for the variable system.

use super::*;
use super::evaluator::{evaluate_all, get_value_in_base_units, resolve_expression};
use crate::units::LengthUnit;


#[test]
fn test_variable_store_add_and_lookup() {
    let mut store = VariableStore::new();
    
    let var = Variable::new("thickness", 10.0, Unit::Length(LengthUnit::Millimeter));
    let id = store.add(var).unwrap();
    
    assert!(store.get(id).is_some());
    assert!(store.get_by_name("thickness").is_some());
    assert_eq!(store.get_by_name("thickness").unwrap().name, "thickness");
}

#[test]
fn test_variable_store_duplicate_name_error() {
    let mut store = VariableStore::new();
    
    store.add(Variable::new("x", 1.0, Unit::Dimensionless)).unwrap();
    let result = store.add(Variable::new("x", 2.0, Unit::Dimensionless));
    
    assert!(result.is_err());
}

#[test]
fn test_variable_store_remove() {
    let mut store = VariableStore::new();
    
    let var = Variable::new("temp", 5.0, Unit::Dimensionless);
    let id = store.add(var).unwrap();
    
    assert!(store.get(id).is_some());
    
    let removed = store.remove(id);
    assert!(removed.is_some());
    assert!(store.get(id).is_none());
    assert!(store.get_by_name("temp").is_none());
}

#[test]
fn test_variable_store_update_name() {
    let mut store = VariableStore::new();
    
    let var = Variable::new("old_name", 1.0, Unit::Dimensionless);
    let id = store.add(var).unwrap();
    
    store.update_name(id, "new_name").unwrap();
    
    assert!(store.get_by_name("old_name").is_none());
    assert!(store.get_by_name("new_name").is_some());
}

#[test]
fn test_variable_store_update_expression() {
    let mut store = VariableStore::new();
    
    let var = Variable::new("x", 1.0, Unit::Dimensionless);
    let id = store.add(var).unwrap();
    
    // Initially cached
    assert_eq!(store.get(id).unwrap().cached_value, Some(1.0));
    
    // Update expression - cache should be invalidated
    store.update_expression(id, "2 + 2").unwrap();
    assert_eq!(store.get(id).unwrap().cached_value, None);
    assert_eq!(store.get(id).unwrap().expression, "2 + 2");
}

#[test]
fn test_variable_store_ordering() {
    let mut store = VariableStore::new();
    
    let a = Variable::new("a", 1.0, Unit::Dimensionless);
    let b = Variable::new("b", 2.0, Unit::Dimensionless);
    let c = Variable::new("c", 3.0, Unit::Dimensionless);
    
    store.add(a).unwrap();
    store.add(b).unwrap();
    store.add(c).unwrap();
    
    let ordered = store.ordered_variables();
    assert_eq!(ordered.len(), 3);
    assert_eq!(ordered[0].name, "a");
    assert_eq!(ordered[1].name, "b");
    assert_eq!(ordered[2].name, "c");
}

#[test]
fn test_variable_store_reorder() {
    let mut store = VariableStore::new();
    
    let a = Variable::new("a", 1.0, Unit::Dimensionless);
    let b = Variable::new("b", 2.0, Unit::Dimensionless);
    let c = Variable::new("c", 3.0, Unit::Dimensionless);
    
    let a_id = store.add(a).unwrap();
    store.add(b).unwrap();
    store.add(c).unwrap();
    
    // Move 'a' to the end
    store.reorder(a_id, 10).unwrap(); // 10 is clamped to end
    
    let ordered = store.ordered_variables();
    assert_eq!(ordered[0].name, "b");
    assert_eq!(ordered[1].name, "c");
    assert_eq!(ordered[2].name, "a");
}

#[test]
fn test_evaluate_all_variables() {
    let mut store = VariableStore::new();
    
    store.add(Variable::new("base", 10.0, Unit::Dimensionless)).unwrap();
    store.add(Variable::with_expression("doubled", "@base * 2", Unit::Dimensionless)).unwrap();
    store.add(Variable::with_expression("tripled", "@base * 3", Unit::Dimensionless)).unwrap();
    
    evaluate_all(&mut store);
    
    assert_eq!(store.get_by_name("base").unwrap().cached_value, Some(10.0));
    assert_eq!(store.get_by_name("doubled").unwrap().cached_value, Some(20.0));
    assert_eq!(store.get_by_name("tripled").unwrap().cached_value, Some(30.0));
}

#[test]
fn test_evaluate_all_with_error() {
    let mut store = VariableStore::new();
    
    store.add(Variable::new("good", 5.0, Unit::Dimensionless)).unwrap();
    store.add(Variable::with_expression("bad", "@undefined", Unit::Dimensionless)).unwrap();
    
    evaluate_all(&mut store);
    
    assert!(store.get_by_name("good").unwrap().cached_value.is_some());
    assert!(store.get_by_name("bad").unwrap().cached_value.is_none());
    assert!(store.get_by_name("bad").unwrap().error.is_some());
}

#[test]
fn test_unit_conversions() {
    // Test length unit conversions
    let mm = Unit::Length(LengthUnit::Millimeter);
    let inch = Unit::Length(LengthUnit::Inch);
    
    assert!((mm.to_base(10.0) - 10.0).abs() < 1e-10); // mm is base
    assert!((inch.to_base(1.0) - 25.4).abs() < 1e-10); // 1 inch = 25.4mm
    assert!((inch.from_base(25.4) - 1.0).abs() < 1e-10);
    
    // Test angle unit conversions
    let deg = Unit::Angle(AngleUnit::Degrees);
    let rad = Unit::Angle(AngleUnit::Radians);
    
    assert!((rad.to_base(std::f64::consts::PI) - std::f64::consts::PI).abs() < 1e-10);
    assert!((deg.to_base(180.0) - std::f64::consts::PI).abs() < 1e-10);
}

#[test]
fn test_unit_compatibility() {
    let mm = Unit::Length(LengthUnit::Millimeter);
    let inch = Unit::Length(LengthUnit::Inch);
    let deg = Unit::Angle(AngleUnit::Degrees);
    let dimensionless = Unit::Dimensionless;
    
    assert!(mm.is_compatible(&inch));
    assert!(!mm.is_compatible(&deg));
    assert!(!mm.is_compatible(&dimensionless));
    assert!(dimensionless.is_compatible(&Unit::Dimensionless));
}

#[test]
fn test_get_value_in_base_units() {
    let mut store = VariableStore::new();
    
    // Add a variable in inches with cached value
    store.add(Variable::new("width", 2.0, Unit::Length(LengthUnit::Inch))).unwrap();
    
    // Should return value in mm (base unit)
    let value = get_value_in_base_units("width", &store);
    assert!(value.is_some());
    assert!((value.unwrap() - 50.8).abs() < 1e-10); // 2 inches = 50.8mm
}

#[test]
fn test_resolve_expression() {
    let mut store = VariableStore::new();
    store.add(Variable::new("scale", 2.0, Unit::Dimensionless)).unwrap();
    
    let result = resolve_expression("@scale * 5 + 10", &store).unwrap();
    assert!((result - 20.0).abs() < 1e-10);
}

#[test]
fn test_complex_variable_chain() {
    let mut store = VariableStore::new();
    
    store.add(Variable::new("base_size", 10.0, Unit::Length(LengthUnit::Millimeter))).unwrap();
    store.add(Variable::with_expression("margin", "@base_size * 0.1", Unit::Length(LengthUnit::Millimeter))).unwrap();
    store.add(Variable::with_expression("total", "@base_size + @margin * 2", Unit::Length(LengthUnit::Millimeter))).unwrap();
    
    evaluate_all(&mut store);
    
    // base_size = 10mm
    // margin = 10 * 0.1 = 1mm (but base_size gets converted to base units = 10mm)
    // total = 10 + 1 * 2 = 12mm
    let total = store.get_by_name("total").unwrap().cached_value.unwrap();
    assert!((total - 12.0).abs() < 1e-10);
}

#[test]
fn test_serialization_round_trip() {
    let mut store = VariableStore::new();
    store.add(Variable::new("x", 5.0, Unit::Dimensionless)).unwrap();
    store.add(Variable::with_expression("y", "@x * 2", Unit::Length(LengthUnit::Millimeter))).unwrap();
    
    // Serialize
    let json = serde_json::to_string(&store).unwrap();
    
    // Deserialize
    let mut restored: VariableStore = serde_json::from_str(&json).unwrap();
    restored.rebuild_index(); // Rebuild the by_name index
    
    assert!(restored.get_by_name("x").is_some());
    assert!(restored.get_by_name("y").is_some());
    assert_eq!(restored.get_by_name("y").unwrap().expression, "@x * 2");
}
