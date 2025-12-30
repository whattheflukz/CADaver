//! Expression evaluator with variable resolution and unit conversion.

use super::parser::{BinaryOperator, Expr, UnaryOperator};
use super::types::VariableStore;
use std::collections::HashSet;

/// Evaluation error
#[derive(Debug, Clone, PartialEq)]
pub enum EvalError {
    /// Reference to undefined variable
    UndefinedVariable(String),
    /// Circular dependency detected
    CircularDependency(Vec<String>),
    /// Division by zero
    DivisionByZero,
    /// Unknown function
    UnknownFunction(String),
    /// Invalid function argument (e.g., sqrt of negative)
    InvalidArgument(String),
    /// Unit mismatch in operation
    UnitMismatch { expected: String, got: String },
    /// Parse error during evaluation
    ParseError(String),
}

impl std::fmt::Display for EvalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UndefinedVariable(name) => write!(f, "Undefined variable: @{}", name),
            Self::CircularDependency(path) => {
                write!(f, "Circular dependency: {}", path.join(" → "))
            }
            Self::DivisionByZero => write!(f, "Division by zero"),
            Self::UnknownFunction(name) => write!(f, "Unknown function: {}", name),
            Self::InvalidArgument(msg) => write!(f, "Invalid argument: {}", msg),
            Self::UnitMismatch { expected, got } => {
                write!(f, "Unit mismatch: expected {}, got {}", expected, got)
            }
            Self::ParseError(msg) => write!(f, "Parse error: {}", msg),
        }
    }
}

impl std::error::Error for EvalError {}

/// Evaluation context
pub struct EvalContext<'a> {
    store: &'a VariableStore,
    /// Track variables being evaluated to detect cycles
    evaluating: HashSet<String>,
    /// Path of variables for error reporting
    eval_path: Vec<String>,
}

impl<'a> EvalContext<'a> {
    pub fn new(store: &'a VariableStore) -> Self {
        Self {
            store,
            evaluating: HashSet::new(),
            eval_path: Vec::new(),
        }
    }

    /// Evaluate a variable by name, returning value in base units
    fn eval_variable(&mut self, name: &str) -> Result<f64, EvalError> {
        // Check for circular dependency
        if self.evaluating.contains(name) {
            self.eval_path.push(name.to_string());
            return Err(EvalError::CircularDependency(self.eval_path.clone()));
        }

        // Look up variable
        let var = self
            .store
            .get_by_name(name)
            .ok_or_else(|| EvalError::UndefinedVariable(name.to_string()))?;

        // Parse expression
        let expr = super::parser::parse_expression(&var.expression)
            .map_err(|e| EvalError::ParseError(e.message))?;

        // Mark as being evaluated
        self.evaluating.insert(name.to_string());
        self.eval_path.push(name.to_string());

        // Evaluate expression (returns value in variable's own unit)
        let value_in_own_unit = self.eval_expr(&expr)?;

        // Convert to base units
        let value_in_base = var.unit.to_base(value_in_own_unit);

        // Unmark
        self.evaluating.remove(name);
        self.eval_path.pop();

        Ok(value_in_base)
    }

    /// Evaluate an expression, returning value (dimensionless or in calling context)
    fn eval_expr(&mut self, expr: &Expr) -> Result<f64, EvalError> {
        match expr {
            Expr::Number(n) => Ok(*n),

            Expr::VarRef(name) => {
                // Get value in base units, then we assume same dimension context
                self.eval_variable(name)
            }

            Expr::Constant(name) => match name.as_str() {
                "PI" => Ok(std::f64::consts::PI),
                "E" => Ok(std::f64::consts::E),
                _ => Err(EvalError::InvalidArgument(format!("Unknown constant: {}", name))),
            },

            Expr::BinaryOp { op, left, right } => {
                let l = self.eval_expr(left)?;
                let r = self.eval_expr(right)?;

                match op {
                    BinaryOperator::Add => Ok(l + r),
                    BinaryOperator::Sub => Ok(l - r),
                    BinaryOperator::Mul => Ok(l * r),
                    BinaryOperator::Div => {
                        if r.abs() < 1e-15 {
                            Err(EvalError::DivisionByZero)
                        } else {
                            Ok(l / r)
                        }
                    }
                    BinaryOperator::Pow => Ok(l.powf(r)),
                }
            }

            Expr::UnaryOp { op, operand } => {
                let val = self.eval_expr(operand)?;
                match op {
                    UnaryOperator::Neg => Ok(-val),
                }
            }

            Expr::FnCall { name, arg } => {
                let val = self.eval_expr(arg)?;
                match name.as_str() {
                    "sin" => Ok(val.sin()),
                    "cos" => Ok(val.cos()),
                    "tan" => Ok(val.tan()),
                    "asin" => {
                        if val < -1.0 || val > 1.0 {
                            Err(EvalError::InvalidArgument("asin argument must be in [-1, 1]".to_string()))
                        } else {
                            Ok(val.asin())
                        }
                    }
                    "acos" => {
                        if val < -1.0 || val > 1.0 {
                            Err(EvalError::InvalidArgument("acos argument must be in [-1, 1]".to_string()))
                        } else {
                            Ok(val.acos())
                        }
                    }
                    "atan" => Ok(val.atan()),
                    "sqrt" => {
                        if val < 0.0 {
                            Err(EvalError::InvalidArgument("sqrt of negative number".to_string()))
                        } else {
                            Ok(val.sqrt())
                        }
                    }
                    "abs" => Ok(val.abs()),
                    "ln" => {
                        if val <= 0.0 {
                            Err(EvalError::InvalidArgument("ln of non-positive number".to_string()))
                        } else {
                            Ok(val.ln())
                        }
                    }
                    "log10" => {
                        if val <= 0.0 {
                            Err(EvalError::InvalidArgument("log10 of non-positive number".to_string()))
                        } else {
                            Ok(val.log10())
                        }
                    }
                    "exp" => Ok(val.exp()),
                    "floor" => Ok(val.floor()),
                    "ceil" => Ok(val.ceil()),
                    "round" => Ok(val.round()),
                    _ => Err(EvalError::UnknownFunction(name.clone())),
                }
            }
        }
    }
}

/// Evaluate an expression string given a variable store
/// Returns value in the expression's implied unit (or dimensionless)
pub fn evaluate(expression: &str, store: &VariableStore) -> Result<f64, EvalError> {
    let expr = super::parser::parse_expression(expression)
        .map_err(|e| EvalError::ParseError(e.message))?;

    let mut ctx = EvalContext::new(store);
    ctx.eval_expr(&expr)
}

/// Evaluate a variable by ID, caching the result
/// Returns value in the variable's own unit
pub fn evaluate_variable(
    var_id: crate::topo::EntityId,
    store: &mut VariableStore,
) -> Result<f64, EvalError> {
    // First, check if already cached
    if let Some(var) = store.get(var_id) {
        if let Some(cached) = var.cached_value {
            return Ok(cached);
        }
    }

    // Get immutable ref for evaluation
    let (expression, unit) = {
        let var = store.get(var_id).ok_or_else(|| {
            EvalError::UndefinedVariable(format!("ID: {}", var_id))
        })?;
        (var.expression.clone(), var.unit)
    };

    // Evaluate
    let expr = super::parser::parse_expression(&expression)
        .map_err(|e| EvalError::ParseError(e.message))?;

    // Create temp store ref for context
    let store_ref = &*store;
    let mut ctx = EvalContext::new(store_ref);
    
    // Add current variable to evaluating set
    if let Some(var) = store_ref.get(var_id) {
        ctx.evaluating.insert(var.name.clone());
        ctx.eval_path.push(var.name.clone());
    }
    
    let value_in_own_unit = ctx.eval_expr(&expr)?;

    // Cache the result
    if let Some(var) = store.get_mut(var_id) {
        var.cached_value = Some(value_in_own_unit);
        var.error = None;
    }

    Ok(value_in_own_unit)
}

/// Evaluate all variables in the store in dependency order
/// Updates cached values and error states
pub fn evaluate_all(store: &mut VariableStore) {
    // Get all variable IDs in order
    let var_ids: Vec<_> = store.order.clone();

    for var_id in var_ids {
        // Get expression
        let (expression, name) = {
            if let Some(var) = store.get(var_id) {
                (var.expression.clone(), var.name.clone())
            } else {
                continue;
            }
        };

        // Try to evaluate
        match super::parser::parse_expression(&expression) {
            Err(e) => {
                if let Some(var) = store.get_mut(var_id) {
                    var.cached_value = None;
                    var.error = Some(e.message);
                }
            }
            Ok(expr) => {
                let store_ref = &*store;
                let mut ctx = EvalContext::new(store_ref);
                ctx.evaluating.insert(name.clone());
                ctx.eval_path.push(name);

                match ctx.eval_expr(&expr) {
                    Ok(value) => {
                        if let Some(var) = store.get_mut(var_id) {
                            var.cached_value = Some(value);
                            var.error = None;
                        }
                    }
                    Err(e) => {
                        if let Some(var) = store.get_mut(var_id) {
                            var.cached_value = None;
                            var.error = Some(e.to_string());
                        }
                    }
                }
            }
        }
    }
}

/// Get the value of a variable by name in base units (mm for length, radians for angle)
/// Returns None if variable doesn't exist or has an error
pub fn get_value_in_base_units(name: &str, store: &VariableStore) -> Option<f64> {
    let var = store.get_by_name(name)?;
    let cached = var.cached_value?;
    Some(var.unit.to_base(cached))
}

/// Resolve an expression that may contain @variable references
/// Returns the evaluated numeric value
pub fn resolve_expression(expression: &str, store: &VariableStore) -> Result<f64, EvalError> {
    evaluate(expression, store)
}

#[cfg(test)]
mod evaluator_tests {
    use super::*;
    use crate::units::LengthUnit;
    use crate::variables::{Variable, Unit};

    #[test]
    fn test_eval_simple() {
        let store = VariableStore::new();
        let result = evaluate("2 + 3", &store).unwrap();
        assert!((result - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_precedence() {
        let store = VariableStore::new();
        let result = evaluate("2 + 3 * 4", &store).unwrap();
        assert!((result - 14.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_parentheses() {
        let store = VariableStore::new();
        let result = evaluate("(2 + 3) * 4", &store).unwrap();
        assert!((result - 20.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_power() {
        let store = VariableStore::new();
        let result = evaluate("2 ^ 3", &store).unwrap();
        assert!((result - 8.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_negation() {
        let store = VariableStore::new();
        let result = evaluate("-5 + 10", &store).unwrap();
        assert!((result - 5.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_variable() {
        let mut store = VariableStore::new();
        store.add(Variable::new("x", 5.0, Unit::Dimensionless)).unwrap();

        let result = evaluate("@x * 2", &store).unwrap();
        assert!((result - 10.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_chained_variables() {
        let mut store = VariableStore::new();
        store.add(Variable::new("a", 1.0, Unit::Dimensionless)).unwrap();
        store.add(Variable::with_expression("b", "@a + 1", Unit::Dimensionless)).unwrap();

        // First evaluate 'a' to cache it
        let a_id = store.by_name["a"];
        evaluate_variable(a_id, &mut store).unwrap();

        let result = evaluate("@a + @b", &store).unwrap();
        // a=1, b=a+1=2, result = 1+2=3
        assert!((result - 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_circular_dependency() {
        let mut store = VariableStore::new();
        store.add(Variable::with_expression("a", "@b + 1", Unit::Dimensionless)).unwrap();
        store.add(Variable::with_expression("b", "@a + 1", Unit::Dimensionless)).unwrap();

        let result = evaluate("@a", &store);
        assert!(matches!(result, Err(EvalError::CircularDependency(_))));
    }

    #[test]
    fn test_eval_undefined_variable() {
        let store = VariableStore::new();
        let result = evaluate("@undefined", &store);
        assert!(matches!(result, Err(EvalError::UndefinedVariable(_))));
    }

    #[test]
    fn test_eval_division_by_zero() {
        let store = VariableStore::new();
        let result = evaluate("1 / 0", &store);
        assert!(matches!(result, Err(EvalError::DivisionByZero)));
    }

    #[test]
    fn test_eval_sqrt() {
        let store = VariableStore::new();
        let result = evaluate("sqrt(16)", &store).unwrap();
        assert!((result - 4.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_sqrt_negative_error() {
        let store = VariableStore::new();
        let result = evaluate("sqrt(-1)", &store);
        assert!(matches!(result, Err(EvalError::InvalidArgument(_))));
    }

    #[test]
    fn test_eval_trig_functions() {
        let store = VariableStore::new();
        
        let sin_result = evaluate("sin(0)", &store).unwrap();
        assert!(sin_result.abs() < 1e-10);

        let cos_result = evaluate("cos(0)", &store).unwrap();
        assert!((cos_result - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_eval_constant_pi() {
        let store = VariableStore::new();
        let result = evaluate("PI", &store).unwrap();
        assert!((result - std::f64::consts::PI).abs() < 1e-10);
    }

    #[test]
    fn test_eval_constant_e() {
        let store = VariableStore::new();
        let result = evaluate("E", &store).unwrap();
        assert!((result - std::f64::consts::E).abs() < 1e-10);
    }

    #[test]
    fn test_eval_complex_expression() {
        let store = VariableStore::new();
        let result = evaluate("2 * PI + sqrt(16)", &store).unwrap();
        let expected = 2.0 * std::f64::consts::PI + 4.0;
        assert!((result - expected).abs() < 1e-10);
    }

    #[test]
    fn test_eval_unit_conversion() {
        let mut store = VariableStore::new();
        // Add a variable in inches
        store.add(Variable::new("inch_val", 1.0, Unit::Length(LengthUnit::Inch))).unwrap();

        // When we reference it, we get value in base units (mm)
        let result = evaluate("@inch_val", &store).unwrap();
        assert!((result - 25.4).abs() < 1e-10);
    }

    #[test]
    fn test_unknown_function_error() {
        let store = VariableStore::new();
        let result = evaluate("mystery(5)", &store);
        assert!(matches!(result, Err(EvalError::UnknownFunction(_))));
    }
}
