//! Global parametric variables module.
//!
//! Provides a system for defining named numeric values with:
//! - Mathematical expressions with variable references
//! - Unit-aware evaluation with automatic conversion
//! - Dependency tracking and circular dependency detection

pub mod types;
pub mod parser;
pub mod evaluator;

#[cfg(test)]
mod tests;

pub use types::{Variable, VariableStore, Unit, AngleUnit};
pub use parser::{parse_expression, Expr, ParseError};
pub use evaluator::{evaluate, EvalError, EvalContext};
