//! Expression parser for variable expressions.
//!
//! Supports:
//! - Numbers (integers and floats)
//! - Variable references (@name)
//! - Arithmetic operators (+, -, *, /, ^)
//! - Parentheses for grouping
//! - Built-in functions (sin, cos, tan, sqrt, abs, ln, log10, exp)
//! - Built-in constants (PI, E)

use std::iter::Peekable;
use std::str::Chars;

/// Parse error with location info
#[derive(Debug, Clone, PartialEq)]
pub struct ParseError {
    pub message: String,
    pub position: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Parse error at position {}: {}", self.position, self.message)
    }
}

impl std::error::Error for ParseError {}

/// Expression AST node
#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    /// Numeric literal
    Number(f64),
    /// Variable reference (name without @)
    VarRef(String),
    /// Built-in constant (PI, E)
    Constant(String),
    /// Binary operation
    BinaryOp {
        op: BinaryOperator,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    /// Unary operation (negation)
    UnaryOp {
        op: UnaryOperator,
        operand: Box<Expr>,
    },
    /// Function call
    FnCall {
        name: String,
        arg: Box<Expr>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BinaryOperator {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UnaryOperator {
    Neg,
}

/// Token types
#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Identifier(String),
    VarRef(String),
    Plus,
    Minus,
    Star,
    Slash,
    Caret,
    LParen,
    RParen,
    Comma,
    Eof,
}

/// Tokenizer
struct Lexer<'a> {
    chars: Peekable<Chars<'a>>,
    position: usize,
}

impl<'a> Lexer<'a> {
    fn new(input: &'a str) -> Self {
        Self {
            chars: input.chars().peekable(),
            position: 0,
        }
    }

    fn next_token(&mut self) -> Result<Token, ParseError> {
        self.skip_whitespace();

        let pos = self.position;

        match self.chars.peek() {
            None => Ok(Token::Eof),
            Some(&c) => match c {
                '+' => {
                    self.advance();
                    Ok(Token::Plus)
                }
                '-' => {
                    self.advance();
                    Ok(Token::Minus)
                }
                '*' => {
                    self.advance();
                    Ok(Token::Star)
                }
                '/' => {
                    self.advance();
                    Ok(Token::Slash)
                }
                '^' => {
                    self.advance();
                    Ok(Token::Caret)
                }
                '(' => {
                    self.advance();
                    Ok(Token::LParen)
                }
                ')' => {
                    self.advance();
                    Ok(Token::RParen)
                }
                ',' => {
                    self.advance();
                    Ok(Token::Comma)
                }
                '@' => {
                    self.advance();
                    let name = self.read_identifier()?;
                    if name.is_empty() {
                        Err(ParseError {
                            message: "Expected variable name after @".to_string(),
                            position: pos,
                        })
                    } else {
                        Ok(Token::VarRef(name))
                    }
                }
                c if c.is_ascii_digit() || c == '.' => self.read_number(),
                c if c.is_ascii_alphabetic() || c == '_' => {
                    let name = self.read_identifier()?;
                    Ok(Token::Identifier(name))
                }
                _ => Err(ParseError {
                    message: format!("Unexpected character: '{}'", c),
                    position: pos,
                }),
            },
        }
    }

    fn advance(&mut self) -> Option<char> {
        self.position += 1;
        self.chars.next()
    }

    fn skip_whitespace(&mut self) {
        while let Some(&c) = self.chars.peek() {
            if c.is_whitespace() {
                self.advance();
            } else {
                break;
            }
        }
    }

    fn read_number(&mut self) -> Result<Token, ParseError> {
        let pos = self.position;
        let mut num_str = String::new();
        let mut has_dot = false;

        while let Some(&c) = self.chars.peek() {
            if c.is_ascii_digit() {
                num_str.push(c);
                self.advance();
            } else if c == '.' && !has_dot {
                has_dot = true;
                num_str.push(c);
                self.advance();
            } else {
                break;
            }
        }

        // Handle scientific notation (e.g., 1e10, 1.5e-3)
        if let Some(&c) = self.chars.peek() {
            if c == 'e' || c == 'E' {
                num_str.push(c);
                self.advance();
                if let Some(&sign) = self.chars.peek() {
                    if sign == '+' || sign == '-' {
                        num_str.push(sign);
                        self.advance();
                    }
                }
                while let Some(&c) = self.chars.peek() {
                    if c.is_ascii_digit() {
                        num_str.push(c);
                        self.advance();
                    } else {
                        break;
                    }
                }
            }
        }

        num_str.parse::<f64>().map(Token::Number).map_err(|_| ParseError {
            message: format!("Invalid number: '{}'", num_str),
            position: pos,
        })
    }

    fn read_identifier(&mut self) -> Result<String, ParseError> {
        let mut name = String::new();
        while let Some(&c) = self.chars.peek() {
            if c.is_ascii_alphanumeric() || c == '_' {
                name.push(c);
                self.advance();
            } else {
                break;
            }
        }
        Ok(name)
    }
}

/// Parser for expressions
struct Parser<'a> {
    lexer: Lexer<'a>,
    current: Token,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Result<Self, ParseError> {
        let mut lexer = Lexer::new(input);
        let current = lexer.next_token()?;
        Ok(Self { lexer, current })
    }

    fn advance(&mut self) -> Result<(), ParseError> {
        self.current = self.lexer.next_token()?;
        Ok(())
    }

    fn parse(&mut self) -> Result<Expr, ParseError> {
        let expr = self.parse_additive()?;
        if self.current != Token::Eof {
            return Err(ParseError {
                message: format!("Unexpected token after expression: {:?}", self.current),
                position: self.lexer.position,
            });
        }
        Ok(expr)
    }

    // Additive: term (('+' | '-') term)*
    fn parse_additive(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_multiplicative()?;

        loop {
            let op = match &self.current {
                Token::Plus => BinaryOperator::Add,
                Token::Minus => BinaryOperator::Sub,
                _ => break,
            };
            self.advance()?;
            let right = self.parse_multiplicative()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    // Multiplicative: power (('*' | '/') power)*
    fn parse_multiplicative(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_power()?;

        loop {
            let op = match &self.current {
                Token::Star => BinaryOperator::Mul,
                Token::Slash => BinaryOperator::Div,
                _ => break,
            };
            self.advance()?;
            let right = self.parse_power()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }

        Ok(left)
    }

    // Power: unary ('^' power)?  (right associative)
    fn parse_power(&mut self) -> Result<Expr, ParseError> {
        let base = self.parse_unary()?;

        if self.current == Token::Caret {
            self.advance()?;
            let exp = self.parse_power()?; // Right associative
            Ok(Expr::BinaryOp {
                op: BinaryOperator::Pow,
                left: Box::new(base),
                right: Box::new(exp),
            })
        } else {
            Ok(base)
        }
    }

    // Unary: '-' unary | primary
    fn parse_unary(&mut self) -> Result<Expr, ParseError> {
        if self.current == Token::Minus {
            self.advance()?;
            let operand = self.parse_unary()?;
            Ok(Expr::UnaryOp {
                op: UnaryOperator::Neg,
                operand: Box::new(operand),
            })
        } else {
            self.parse_primary()
        }
    }

    // Primary: number | varref | constant | function_call | '(' expr ')'
    fn parse_primary(&mut self) -> Result<Expr, ParseError> {
        match &self.current {
            Token::Number(n) => {
                let val = *n;
                self.advance()?;
                Ok(Expr::Number(val))
            }
            Token::VarRef(name) => {
                let name = name.clone();
                self.advance()?;
                Ok(Expr::VarRef(name))
            }
            Token::Identifier(name) => {
                let name = name.clone();
                self.advance()?;

                // Check for built-in constants
                match name.as_str() {
                    "PI" | "pi" => Ok(Expr::Constant("PI".to_string())),
                    "E" | "e" => Ok(Expr::Constant("E".to_string())),
                    // Check for function call
                    _ if self.current == Token::LParen => {
                        self.advance()?; // consume '('
                        let arg = self.parse_additive()?;
                        if self.current != Token::RParen {
                            return Err(ParseError {
                                message: "Expected ')' after function argument".to_string(),
                                position: self.lexer.position,
                            });
                        }
                        self.advance()?; // consume ')'
                        Ok(Expr::FnCall {
                            name,
                            arg: Box::new(arg),
                        })
                    }
                    _ => Err(ParseError {
                        message: format!("Unknown identifier: '{}'. Did you mean '@{}'?", name, name),
                        position: self.lexer.position,
                    }),
                }
            }
            Token::LParen => {
                self.advance()?;
                let expr = self.parse_additive()?;
                if self.current != Token::RParen {
                    return Err(ParseError {
                        message: "Expected ')'".to_string(),
                        position: self.lexer.position,
                    });
                }
                self.advance()?;
                Ok(expr)
            }
            _ => Err(ParseError {
                message: format!("Unexpected token: {:?}", self.current),
                position: self.lexer.position,
            }),
        }
    }
}

/// Parse an expression string into an AST
pub fn parse_expression(input: &str) -> Result<Expr, ParseError> {
    if input.trim().is_empty() {
        return Err(ParseError {
            message: "Empty expression".to_string(),
            position: 0,
        });
    }
    let mut parser = Parser::new(input)?;
    parser.parse()
}

#[cfg(test)]
mod parser_tests {
    use super::*;

    #[test]
    fn test_parse_simple_number() {
        let expr = parse_expression("42").unwrap();
        assert_eq!(expr, Expr::Number(42.0));
    }

    #[test]
    fn test_parse_float() {
        let expr = parse_expression("3.14159").unwrap();
        if let Expr::Number(n) = expr {
            assert!((n - 3.14159).abs() < 1e-10);
        } else {
            panic!("Expected number");
        }
    }

    #[test]
    fn test_parse_scientific_notation() {
        let expr = parse_expression("1.5e-3").unwrap();
        if let Expr::Number(n) = expr {
            assert!((n - 0.0015).abs() < 1e-10);
        } else {
            panic!("Expected number");
        }
    }

    #[test]
    fn test_parse_variable_ref() {
        let expr = parse_expression("@thickness").unwrap();
        assert_eq!(expr, Expr::VarRef("thickness".to_string()));
    }

    #[test]
    fn test_parse_addition() {
        let expr = parse_expression("1 + 2").unwrap();
        match expr {
            Expr::BinaryOp { op, left, right } => {
                assert_eq!(op, BinaryOperator::Add);
                assert_eq!(*left, Expr::Number(1.0));
                assert_eq!(*right, Expr::Number(2.0));
            }
            _ => panic!("Expected binary op"),
        }
    }

    #[test]
    fn test_parse_precedence() {
        // 1 + 2 * 3 should parse as 1 + (2 * 3)
        let expr = parse_expression("1 + 2 * 3").unwrap();
        match expr {
            Expr::BinaryOp { op, left, right } => {
                assert_eq!(op, BinaryOperator::Add);
                assert_eq!(*left, Expr::Number(1.0));
                match *right {
                    Expr::BinaryOp { op, left, right } => {
                        assert_eq!(op, BinaryOperator::Mul);
                        assert_eq!(*left, Expr::Number(2.0));
                        assert_eq!(*right, Expr::Number(3.0));
                    }
                    _ => panic!("Expected binary op for right"),
                }
            }
            _ => panic!("Expected binary op"),
        }
    }

    #[test]
    fn test_parse_parentheses() {
        // (1 + 2) * 3 should parse as (1 + 2) * 3
        let expr = parse_expression("(1 + 2) * 3").unwrap();
        match expr {
            Expr::BinaryOp { op, left, right } => {
                assert_eq!(op, BinaryOperator::Mul);
                assert_eq!(*right, Expr::Number(3.0));
                match *left {
                    Expr::BinaryOp { op, left, right } => {
                        assert_eq!(op, BinaryOperator::Add);
                        assert_eq!(*left, Expr::Number(1.0));
                        assert_eq!(*right, Expr::Number(2.0));
                    }
                    _ => panic!("Expected binary op for left"),
                }
            }
            _ => panic!("Expected binary op"),
        }
    }

    #[test]
    fn test_parse_power() {
        let expr = parse_expression("2 ^ 3").unwrap();
        match expr {
            Expr::BinaryOp { op, left, right } => {
                assert_eq!(op, BinaryOperator::Pow);
                assert_eq!(*left, Expr::Number(2.0));
                assert_eq!(*right, Expr::Number(3.0));
            }
            _ => panic!("Expected binary op"),
        }
    }

    #[test]
    fn test_parse_negation() {
        let expr = parse_expression("-5").unwrap();
        match expr {
            Expr::UnaryOp { op, operand } => {
                assert_eq!(op, UnaryOperator::Neg);
                assert_eq!(*operand, Expr::Number(5.0));
            }
            _ => panic!("Expected unary op"),
        }
    }

    #[test]
    fn test_parse_function() {
        let expr = parse_expression("sqrt(16)").unwrap();
        match expr {
            Expr::FnCall { name, arg } => {
                assert_eq!(name, "sqrt");
                assert_eq!(*arg, Expr::Number(16.0));
            }
            _ => panic!("Expected function call"),
        }
    }

    #[test]
    fn test_parse_constant_pi() {
        let expr = parse_expression("PI").unwrap();
        assert_eq!(expr, Expr::Constant("PI".to_string()));
    }

    #[test]
    fn test_parse_complex_expression() {
        // @thickness * 2 + sqrt(PI)
        let expr = parse_expression("@thickness * 2 + sqrt(PI)").unwrap();
        match expr {
            Expr::BinaryOp { op, .. } => {
                assert_eq!(op, BinaryOperator::Add);
            }
            _ => panic!("Expected binary op"),
        }
    }

    #[test]
    fn test_parse_empty_error() {
        let result = parse_expression("");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_invalid_token_error() {
        let result = parse_expression("1 $ 2");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_missing_paren_error() {
        let result = parse_expression("(1 + 2");
        assert!(result.is_err());
    }
}
