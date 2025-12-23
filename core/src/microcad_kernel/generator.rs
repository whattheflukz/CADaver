use super::ast::{Program, Statement, Expression, Call, Value};

pub struct Generator;

impl Generator {
    pub fn new() -> Self {
        Self
    }

    /// Creates a simple program that generates a cube.
    /// This is a placeholder for actual feature-to-script compilation.
    pub fn mock_cube_program(&self, size: f64) -> Program {
        Program {
            statements: vec![
                Statement::Assignment {
                    name: "my_cube".to_string(),
                    expr: Expression::Call(Call {
                        function: "cube".to_string(),
                        args: vec![Expression::Value(Value::Number(size))],
                    })
                }
            ]
        }
    }
}
