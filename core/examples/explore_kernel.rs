use microcad_core::geo2d::{Rect, Point};
use microcad_core::geo3d::{Extrusion};
use microcad_core::{Length, Extrude};

fn main() {
    println!("Exploring Mesh API...");
    
    let p1 = Point::new(0.0, 0.0);
    let p2 = Point::new(10.0, 10.0);
    let rect = Rect::new(p1, p2);
    let poly = rect.to_polygon();
    
    let mesh = poly.extrude(Extrusion::Linear { 
        height: Length(10.0), 
        scale_x: 1.0, 
        scale_y: 1.0, 
        twist: cgmath::Rad(0.0).into() 
    });
    
    println!("Mesh generated. Vertices: {}", mesh.positions.len());
    
    // Note: microcad_core v0.2 produces a raw TriangleMesh from extrusion.
    // Use of boolean operations or B-Rep modification is not currently supported.
}

fn print_type_of<T>(_: &T) {
    println!("{}", std::any::type_name::<T>());
}
