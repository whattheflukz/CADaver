use microcad_core::geo2d::{Rect, Point, Size2}; 
use microcad_core::geo3d::Extrude;

fn main() {
    let p1 = Point::new(0.0, 0.0);
    // let s = Size2 { width: 10.0, height: 10.0 };
    let p2 = Point::new(10.0, 10.0);
    let r = Rect::new(p1, p2);
    
    // let inner = mesh.inner;
    // println!("Vertices: {}", inner.vertices.len()); // Guessing field
    // println!("Indices: {}", inner.triangles.len()); 
    // Force variant error first to list them?
    // let mesh = poly.extrude(microcad_core::geo3d::Extrusion::Foo);
    
    let poly = r.to_polygon();
    // Valid construction to see fields
    let mesh = poly.extrude(microcad_core::geo3d::Extrusion::Linear {
        height: microcad_core::Length(10.0), 
        scale_x: 1.0, 
        scale_y: 1.0, 
        twist: microcad_core::Angle::from(cgmath::Rad(0.0)) // Try From Rad
    });
    
    let inner = mesh.inner;
    let indices = &inner.triangle_indices;
    println!("First index: {:?}", indices[0]);
    // let _: () = indices[0];
}
