use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnitType {
    Length,
    Angle,
    Mass,
    Time,
    Dimensionless,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum LengthUnit {
    Millimeter,
    Centimeter,
    Meter,
    Inch,
    Foot,
}

impl LengthUnit {
    pub fn to_mm(&self, value: f64) -> f64 {
        match self {
            Self::Millimeter => value,
            Self::Centimeter => value * 10.0,
            Self::Meter => value * 1000.0,
            Self::Inch => value * 25.4,
            Self::Foot => value * 304.8,
        }
    }

    pub fn from_mm(&self, mm: f64) -> f64 {
        match self {
            Self::Millimeter => mm,
            Self::Centimeter => mm / 10.0,
            Self::Meter => mm / 1000.0,
            Self::Inch => mm / 25.4,
            Self::Foot => mm / 304.8,
        }
    }
}

impl fmt::Display for LengthUnit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Millimeter => write!(f, "mm"),
            Self::Centimeter => write!(f, "cm"),
            Self::Meter => write!(f, "m"),
            Self::Inch => write!(f, "in"),
            Self::Foot => write!(f, "ft"),
        }
    }
}
