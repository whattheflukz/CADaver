use super::{Point3, Vector3, ApproxEq, EPSILON};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Line3 {
    pub origin: Point3,
    pub direction: Vector3,
}

impl Line3 {
    pub fn new(origin: Point3, direction: Vector3) -> Self {
        Self {
            origin,
            direction: direction.normalize(),
        }
    }

    pub fn project_point(&self, p: &Point3) -> Point3 {
        let v = p - self.origin;
        let d = v.dot(&self.direction);
        self.origin + self.direction * d
    }

    pub fn distance_to_point(&self, p: &Point3) -> f64 {
        let proj = self.project_point(p);
        (p - proj).norm()
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Plane {
    pub origin: Point3,
    pub normal: Vector3,
}

impl Plane {
    pub fn new(origin: Point3, normal: Vector3) -> Self {
        Self {
            origin,
            normal: normal.normalize(),
        }
    }

    pub fn project_point(&self, p: &Point3) -> Point3 {
        let v = p - self.origin;
        let dist = v.dot(&self.normal);
        p - self.normal * dist
    }

    pub fn intersect_line(&self, line: &Line3) -> Option<Point3> {
        let denom = self.normal.dot(&line.direction);
        if denom.abs() < EPSILON {
            return None; // Parallel
        }
        let v = self.origin - line.origin;
        let t = v.dot(&self.normal) / denom;
        Some(line.origin + line.direction * t)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Aabb {
    pub min: Point3,
    pub max: Point3,
}

impl Aabb {
    pub fn new(min: Point3, max: Point3) -> Self {
        Self { min, max }
    }

    pub fn empty() -> Self {
        Self {
            min: Point3::new(f64::INFINITY, f64::INFINITY, f64::INFINITY),
            max: Point3::new(f64::NEG_INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY),
        }
    }

    pub fn extend(&mut self, p: &Point3) {
        self.min.x = self.min.x.min(p.x);
        self.min.y = self.min.y.min(p.y);
        self.min.z = self.min.z.min(p.z);
        
        self.max.x = self.max.x.max(p.x);
        self.max.y = self.max.y.max(p.y);
        self.max.z = self.max.z.max(p.z);
    }

    pub fn merge(&self, other: &Aabb) -> Aabb {
        let mut res = *self;
        res.min.x = res.min.x.min(other.min.x);
        res.min.y = res.min.y.min(other.min.y);
        res.min.z = res.min.z.min(other.min.z);

        res.max.x = res.max.x.max(other.max.x);
        res.max.y = res.max.y.max(other.max.y);
        res.max.z = res.max.z.max(other.max.z);
        res
    }

    pub fn contains(&self, p: &Point3) -> bool {
        p.x >= self.min.x && p.x <= self.max.x &&
        p.y >= self.min.y && p.y <= self.max.y &&
        p.z >= self.min.z && p.z <= self.max.z
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_line_projection() {
        let line = Line3::new(Point3::origin(), Vector3::x());
        let p = Point3::new(5.0, 5.0, 0.0);
        let proj = line.project_point(&p);
        assert!(proj.approx_eq(&Point3::new(5.0, 0.0, 0.0)));
    }

    #[test]
    fn test_plane_intersection() {
        let plane = Plane::new(Point3::origin(), Vector3::y()); // XZ plane
        let line = Line3::new(Point3::new(0.0, 5.0, 0.0), -Vector3::y());
        
        let hit = plane.intersect_line(&line).expect("Should intersect");
        assert!(hit.approx_eq(&Point3::origin()));
    }

    #[test]
    fn test_aabb() {
        let mut box1 = Aabb::new(Point3::origin(), Point3::new(1.0, 1.0, 1.0));
        let p = Point3::new(0.5, 0.5, 0.5);
        assert!(box1.contains(&p));
        
        box1.extend(&Point3::new(2.0, 2.0, 2.0));
        assert!(box1.max.approx_eq(&Point3::new(2.0, 2.0, 2.0)));
    }
}
