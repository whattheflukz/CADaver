// Test file to verify truck boolean operations work
// Based on GitHub issue #68: https://github.com/ricosjp/truck/issues/68

use truck_modeling::*;
use truck_shapeops::{and, or};

#[test]
fn test_truck_boolean_cube_cylinder() {
    // Make a cube with side length 10
    let origin = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    let x_axis = builder::tsweep(&origin, Vector3::new(10.0, 0.0, 0.0));
    let xy_square = builder::tsweep(&x_axis, Vector3::new(0.0, 10.0, 0.0));
    let cube: Solid = builder::tsweep(&xy_square, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Cube created: {} boundaries", cube.boundaries().len());
    for (i, shell) in cube.boundaries().iter().enumerate() {
        println!("  Shell {}: {} faces", i, shell.face_iter().count());
    }

    // Make a cylinder that interferes with the cube
    let point = builder::vertex(Point3::new(3.5, 5.0, -2.0));
    let circle: Wire = builder::rsweep(
        &point,
        Point3::new(5.0, 5.0, -2.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk = builder::try_attach_plane(&[circle]).expect("Failed to create disk");
    let cylinder: Solid = builder::tsweep(&disk, Vector3::new(0.0, 0.0, 14.0));
    
    println!("Cylinder created: {} boundaries", cylinder.boundaries().len());
    for (i, shell) in cylinder.boundaries().iter().enumerate() {
        println!("  Shell {}: {} faces", i, shell.face_iter().count());
    }

    // Test AND operation (intersection)
    println!("Testing AND operation...");
    let and_result = and(&cube, &cylinder, 0.05);
    match &and_result {
        Some(solid) => {
            println!("AND succeeded! Result has {} boundaries", solid.boundaries().len());
        }
        None => {
            println!("AND failed - returned None");
        }
    }
    assert!(and_result.is_some(), "AND operation should succeed");

    // Test OR operation (union)
    println!("Testing OR operation...");
    let or_result = or(&cube, &cylinder, 0.05);
    match &or_result {
        Some(solid) => {
            println!("OR succeeded! Result has {} boundaries", solid.boundaries().len());
        }
        None => {
            println!("OR failed - returned None");
        }
    }
    assert!(or_result.is_some(), "OR operation should succeed");

    // Test subtraction (A AND NOT B)
    println!("Testing SUBTRACTION operation...");
    let mut not_cylinder = cylinder.clone();
    not_cylinder.not();
    let subtract_result = and(&cube, &not_cylinder, 0.05);
    match &subtract_result {
        Some(solid) => {
            println!("SUBTRACT succeeded! Result has {} boundaries", solid.boundaries().len());
        }
        None => {
            println!("SUBTRACT failed - returned None");
        }
    }
    assert!(subtract_result.is_some(), "SUBTRACT operation should succeed");
}

#[test]
fn test_truck_boolean_non_intersecting_cylinders() {
    // Test what happens when two native cylinders don't intersect
    // This simulates the real-world case where solids are in local coordinates
    
    // Cylinder 1: at origin
    let point1 = builder::vertex(Point3::new(5.0, 0.0, 0.0));
    let circle1: Wire = builder::rsweep(
        &point1,
        Point3::new(0.0, 0.0, 0.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk1 = builder::try_attach_plane(&[circle1]).expect("Disk 1");
    let cylinder1: Solid = builder::tsweep(&disk1, Vector3::new(0.0, 0.0, 10.0));
    
    // Cylinder 2: FAR AWAY (not intersecting!)
    let point2 = builder::vertex(Point3::new(105.0, 100.0, 0.0));
    let circle2: Wire = builder::rsweep(
        &point2,
        Point3::new(100.0, 100.0, 0.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk2 = builder::try_attach_plane(&[circle2]).expect("Disk 2");
    let cylinder2: Solid = builder::tsweep(&disk2, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Non-intersecting cylinders:");
    println!("  Cylinder 1: {} faces", cylinder1.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    println!("  Cylinder 2: {} faces", cylinder2.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Test subtraction: should this work or fail for non-intersecting geometry?
    println!("Testing SUBTRACT of non-intersecting cylinders...");
    let mut not_cylinder2 = cylinder2.clone();
    not_cylinder2.not();
    let subtract_result = and(&cylinder1, &not_cylinder2, 0.05);
    match &subtract_result {
        Some(s) => println!("SUBTRACT succeeded - returned cylinder1 unchanged ({} boundaries)", s.boundaries().len()),
        None => println!("SUBTRACT FAILED for non-intersecting geometry!"),
    }
    
    // If non-intersecting, subtraction should return the original solid unchanged
    // because A - B = A when A and B don't intersect
    // BUT truck might return None if it can't compute the result
}

#[test]
fn test_truck_boolean_intersecting_cylinders() {
    // Test intersecting cylinders: small cylinder inside larger cylinder
    // This is a real drilling scenario
    
    // Large cylinder (outer): radius 10
    let point1 = builder::vertex(Point3::new(10.0, 0.0, 0.0));
    let circle1: Wire = builder::rsweep(
        &point1,
        Point3::new(0.0, 0.0, 0.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk1 = builder::try_attach_plane(&[circle1]).expect("Disk 1");
    let cylinder1: Solid = builder::tsweep(&disk1, Vector3::new(0.0, 0.0, 10.0));
    
    // Small cylinder (inner): radius 3, centered at same position (inside cylinder1)
    let point2 = builder::vertex(Point3::new(3.0, 0.0, -2.0));
    let circle2: Wire = builder::rsweep(
        &point2,
        Point3::new(0.0, 0.0, -2.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk2 = builder::try_attach_plane(&[circle2]).expect("Disk 2");
    let cylinder2: Solid = builder::tsweep(&disk2, Vector3::new(0.0, 0.0, 14.0));
    
    println!("Intersecting cylinders (hole drilling scenario):");
    println!("  Outer cylinder: {} faces", cylinder1.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    println!("  Inner cylinder: {} faces", cylinder2.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Subtract inner from outer (drilling a hole)
    println!("Testing SUBTRACT (drill hole in cylinder)...");
    let mut not_cylinder2 = cylinder2.clone();
    not_cylinder2.not();
    let subtract_result = and(&cylinder1, &not_cylinder2, 0.05);
    match &subtract_result {
        Some(s) => {
            let faces: usize = s.boundaries().iter().map(|sh| sh.face_iter().count()).sum();
            println!("SUBTRACT succeeded! {} boundaries, {} faces", s.boundaries().len(), faces);
        }
        None => println!("SUBTRACT FAILED for intersecting cylinders!"),
    }
    
    // This should succeed and produce a cylinder with a hole through it
    assert!(subtract_result.is_some(), "SUBTRACT of intersecting cylinders should work");
}

#[test]
fn test_truck_boolean_runtime_replica() {
    // Exact replica of the failing runtime case:
    // Solid A bbox: (-3.31, -5.73, 0.00) to (6.62, 5.73, 10.00) - circle at (0,0) r=6.62
    // Solid B bbox: (4.84, -20.86, 0.00) to (26.82, 4.52, 10.00) - circle at (12.17, -8.17) r=14.66
    
    // Circle A: center=(0, 0), radius=6.62
    let point_a = builder::vertex(Point3::new(6.62, 0.0, 0.0));
    let circle_a: Wire = builder::rsweep(
        &point_a,
        Point3::new(0.0, 0.0, 0.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk_a = builder::try_attach_plane(&[circle_a]).expect("Disk A");
    let cylinder_a: Solid = builder::tsweep(&disk_a, Vector3::new(0.0, 0.0, 10.0));
    
    // Circle B: center=(12.17, -8.17), radius=14.66
    let point_b = builder::vertex(Point3::new(12.17 + 14.66, -8.17, 0.0));
    let circle_b: Wire = builder::rsweep(
        &point_b,
        Point3::new(12.17, -8.17, 0.0),
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk_b = builder::try_attach_plane(&[circle_b]).expect("Disk B");
    let cylinder_b: Solid = builder::tsweep(&disk_b, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Runtime replica test:");
    println!("  Cylinder A: {} faces", cylinder_a.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    println!("  Cylinder B: {} faces", cylinder_b.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Print bboxes
    fn bbox(solid: &Solid) -> ([f64; 3], [f64; 3]) {
        let mut min = [f64::INFINITY; 3];
        let mut max = [f64::NEG_INFINITY; 3];
        for shell in solid.boundaries() {
            for v in shell.vertex_iter() {
                let p = v.point();
                min[0] = min[0].min(p.x); min[1] = min[1].min(p.y); min[2] = min[2].min(p.z);
                max[0] = max[0].max(p.x); max[1] = max[1].max(p.y); max[2] = max[2].max(p.z);
            }
        }
        (min, max)
    }
    let (min_a, max_a) = bbox(&cylinder_a);
    let (min_b, max_b) = bbox(&cylinder_b);
    println!("  Cylinder A bbox: ({:.2}, {:.2}, {:.2}) to ({:.2}, {:.2}, {:.2})", 
             min_a[0], min_a[1], min_a[2], max_a[0], max_a[1], max_a[2]);
    println!("  Cylinder B bbox: ({:.2}, {:.2}, {:.2}) to ({:.2}, {:.2}, {:.2})", 
             min_b[0], min_b[1], min_b[2], max_b[0], max_b[1], max_b[2]);
    
    // Test subtraction
    println!("Testing SUBTRACT (cylinder A - cylinder B)...");
    let mut not_b = cylinder_b.clone();
    not_b.not();
    let result = and(&cylinder_a, &not_b, 0.05);
    match &result {
        Some(s) => {
            let faces: usize = s.boundaries().iter().map(|sh| sh.face_iter().count()).sum();
            println!("SUBTRACT succeeded! {} boundaries, {} faces", s.boundaries().len(), faces);
        }
        None => println!("SUBTRACT FAILED!"),
    }
    
    // Also try with different tolerances to match what runtime tries
    if result.is_none() {
        println!("Trying tolerances that runtime uses...");
        for tol in [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0] {
            if let Some(_) = and(&cylinder_a, &not_b, tol) {
                println!("  !! SUCCESS with tolerance={}", tol);
                break;
            } else {
                println!("  Failed with tolerance={}", tol);
            }
        }
    }
}

#[test]
fn test_truck_boolean_cylinder_minus_box() {
    // User's failing case: cylinder - box
    // HYPOTHESIS: Coincident faces at Z=0 and Z=10 cause failures
    // The working GitHub example has cylinder extending beyond the cube (-2 to 12 vs 0 to 10)
    
    // Create cylinder that EXTENDS BEYOND in Z (like the working example)
    let point_a = builder::vertex(Point3::new(9.13, 0.0, -2.0));  // Note: Z=-2
    let circle_a: Wire = builder::rsweep(
        &point_a,
        Point3::new(0.0, 0.0, -2.0),  // center at origin, Z=-2
        Vector3::new(0.0, 0.0, 1.0),
        Rad(7.0),
    );
    let disk_a = builder::try_attach_plane(&[circle_a]).expect("Disk A");
    let cylinder: Solid = builder::tsweep(&disk_a, Vector3::new(0.0, 0.0, 14.0)); // Z from -2 to 12
    
    // Create box at overlapping position
    // bbox (1.50, -6.05, 0.00) to (14.84, 5.54, 10.00)
    let v0 = builder::vertex(Point3::new(1.5, -6.0, 0.0));
    let v1 = builder::vertex(Point3::new(14.84, -6.0, 0.0));
    let v2 = builder::vertex(Point3::new(14.84, 5.54, 0.0));
    let v3 = builder::vertex(Point3::new(1.5, 5.54, 0.0));
    let v0_close = v0.clone();
    
    let e0 = builder::line(&v0, &v1);
    let e1 = builder::line(&v1, &v2);
    let e2 = builder::line(&v2, &v3);
    let e3 = builder::line(&v3, &v0_close);
    
    let wire: Wire = Wire::from_iter(vec![e0, e1, e2, e3]);
    let face = builder::try_attach_plane(&[wire]).expect("Face");
    let box_solid: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Cylinder minus Box test:");
    println!("  Cylinder: {} faces", cylinder.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    println!("  Box: {} faces", box_solid.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Cylinder - Box 
    println!("Testing SUBTRACT (cylinder - box)...");
    let mut not_box = box_solid.clone();
    not_box.not();
    let result = and(&cylinder, &not_box, 0.05);
    match &result {
        Some(s) => {
            let faces: usize = s.boundaries().iter().map(|sh| sh.face_iter().count()).sum();
            println!("SUBTRACT (cylinder - box) succeeded! {} boundaries, {} faces", s.boundaries().len(), faces);
        }
        None => println!("SUBTRACT (cylinder - box) FAILED!"),
    }
    
    // Also try Box - Cylinder (drilling) which should work
    println!("Testing SUBTRACT (box - cylinder)...");
    let mut not_cylinder = cylinder.clone();
    not_cylinder.not();
    let result2 = and(&box_solid, &not_cylinder, 0.05);
    match &result2 {
        Some(s) => {
            let faces: usize = s.boundaries().iter().map(|sh| sh.face_iter().count()).sum();
            println!("SUBTRACT (box - cylinder) succeeded! {} boundaries, {} faces", s.boundaries().len(), faces);
        }
        None => println!("SUBTRACT (box - cylinder) FAILED!"),
    }
    
    // Try both directions with various tolerances if they failed
    if result.is_none() {
        println!("Trying cylinder - box with various tolerances...");
        for tol in [0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0] {
            if let Some(_) = and(&cylinder, &not_box, tol) {
                println!("  !! cylinder - box SUCCESS with tol={}", tol);
                break;
            }
        }
    }
}

#[test]
fn test_truck_boolean_two_boxes() {
    // Create two overlapping boxes
    let origin1 = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    let x1 = builder::tsweep(&origin1, Vector3::new(10.0, 0.0, 0.0));
    let xy1 = builder::tsweep(&x1, Vector3::new(0.0, 10.0, 0.0));
    let box1: Solid = builder::tsweep(&xy1, Vector3::new(0.0, 0.0, 10.0));
    
    let origin2 = builder::vertex(Point3::new(5.0, 5.0, 5.0));
    let x2 = builder::tsweep(&origin2, Vector3::new(10.0, 0.0, 0.0));
    let xy2 = builder::tsweep(&x2, Vector3::new(0.0, 10.0, 0.0));
    let box2: Solid = builder::tsweep(&xy2, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Box1 created, Box2 created");
    
    // Test OR operation
    println!("Testing OR of two boxes...");
    let or_result = or(&box1, &box2, 0.05);
    match &or_result {
        Some(solid) => {
            println!("OR succeeded!");
        }
        None => {
            println!("OR failed - returned None");
        }
    }
    assert!(or_result.is_some(), "OR of two boxes should succeed");

    // Test subtraction
    println!("Testing SUBTRACT of two boxes...");
    let mut not_box2 = box2.clone();
    not_box2.not();
    let subtract_result = and(&box1, &not_box2, 0.05);
    match &subtract_result {
        Some(solid) => {
            println!("SUBTRACT succeeded!");
        }
        None => {
            println!("SUBTRACT failed - returned None");
        }
    }
    assert!(subtract_result.is_some(), "SUBTRACT of two boxes should succeed");
}

#[test]
fn test_truck_boolean_with_wire_from_iter() {
    // This test creates geometry the same way our extrude_polygon does:
    // 1. Create vertices
    // 2. Connect with line edges
    // 3. Create Wire from edges
    // 4. Attach plane to make face
    // 5. tsweep to make solid
    
    // Box 1: at origin, 10x10x10
    let v0 = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    let v1 = builder::vertex(Point3::new(10.0, 0.0, 0.0));
    let v2 = builder::vertex(Point3::new(10.0, 10.0, 0.0));
    let v3 = builder::vertex(Point3::new(0.0, 10.0, 0.0));
    let v0_close = v0.clone();
    
    let e0 = builder::line(&v0, &v1);
    let e1 = builder::line(&v1, &v2);
    let e2 = builder::line(&v2, &v3);
    let e3 = builder::line(&v3, &v0_close);
    
    let wire1: Wire = Wire::from_iter(vec![e0, e1, e2, e3]);
    let face1 = builder::try_attach_plane(&[wire1]).expect("Face 1");
    let box1: Solid = builder::tsweep(&face1, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Box1 from wire: {} shells, {} faces", 
             box1.boundaries().len(),
             box1.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Box 2: overlapping at (5,5,5), 10x10x10
    let v0 = builder::vertex(Point3::new(5.0, 5.0, 5.0));
    let v1 = builder::vertex(Point3::new(15.0, 5.0, 5.0));
    let v2 = builder::vertex(Point3::new(15.0, 15.0, 5.0));
    let v3 = builder::vertex(Point3::new(5.0, 15.0, 5.0));
    let v0_close = v0.clone();
    
    let e0 = builder::line(&v0, &v1);
    let e1 = builder::line(&v1, &v2);
    let e2 = builder::line(&v2, &v3);
    let e3 = builder::line(&v3, &v0_close);
    
    let wire2: Wire = Wire::from_iter(vec![e0, e1, e2, e3]);
    let face2 = builder::try_attach_plane(&[wire2]).expect("Face 2");
    let box2: Solid = builder::tsweep(&face2, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Box2 from wire: {} shells, {} faces", 
             box2.boundaries().len(),
             box2.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Test OR
    println!("Testing OR with wire-based boxes...");
    let or_result = or(&box1, &box2, 0.05);
    match &or_result {
        Some(s) => println!("OR succeeded! {} boundaries", s.boundaries().len()),
        None => println!("OR FAILED"),
    }
    assert!(or_result.is_some(), "OR with wire-based boxes should work");
    
    // Test subtraction
    println!("Testing SUBTRACT with wire-based boxes...");
    let mut not_box2 = box2.clone();
    not_box2.not();
    let subtract_result = and(&box1, &not_box2, 0.05);
    match &subtract_result {
        Some(s) => println!("SUBTRACT succeeded! {} boundaries", s.boundaries().len()),
        None => println!("SUBTRACT FAILED"),
    }
    assert!(subtract_result.is_some(), "SUBTRACT with wire-based boxes should work");
}

#[test]
fn test_truck_boolean_with_many_face_polygon() {
    // Simulate what happens with a 64-point circle polygon
    // Create a cylinder-like shape using many line segments
    let num_points = 64;
    let radius = 5.0;
    let center = Point3::new(5.0, 5.0, 0.0);
    
    // Create vertices for polygon
    let mut vertices = Vec::with_capacity(num_points + 1);
    for i in 0..num_points {
        let angle = 2.0 * std::f64::consts::PI * (i as f64) / (num_points as f64);
        let x = center.x + radius * angle.cos();
        let y = center.y + radius * angle.sin();
        vertices.push(builder::vertex(Point3::new(x, y, 0.0)));
    }
    // Close the loop
    vertices.push(vertices[0].clone());
    
    // Create edges
    let mut edges = Vec::with_capacity(num_points);
    for i in 0..num_points {
        edges.push(builder::line(&vertices[i], &vertices[i + 1]));
    }
    
    let wire: Wire = Wire::from_iter(edges);
    let face = builder::try_attach_plane(&[wire]).expect("Face should attach");
    let cylinder_like: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Many-face cylinder: {} shells, {} faces", 
             cylinder_like.boundaries().len(),
             cylinder_like.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Create a simple box to boolean with
    let v0 = builder::vertex(Point3::new(0.0, 0.0, 0.0));
    let v1 = builder::vertex(Point3::new(20.0, 0.0, 0.0));
    let v2 = builder::vertex(Point3::new(20.0, 20.0, 0.0));
    let v3 = builder::vertex(Point3::new(0.0, 20.0, 0.0));
    let v0_close = v0.clone();
    
    let e0 = builder::line(&v0, &v1);
    let e1 = builder::line(&v1, &v2);
    let e2 = builder::line(&v2, &v3);
    let e3 = builder::line(&v3, &v0_close);
    
    let wire: Wire = Wire::from_iter(vec![e0, e1, e2, e3]);
    let face = builder::try_attach_plane(&[wire]).expect("Face");
    let box1: Solid = builder::tsweep(&face, Vector3::new(0.0, 0.0, 10.0));
    
    println!("Box: {} shells, {} faces", 
             box1.boundaries().len(),
             box1.boundaries().iter().map(|s| s.face_iter().count()).sum::<usize>());
    
    // Test subtraction: box - cylinder_like
    println!("Testing SUBTRACT (box - many-face-cylinder)...");
    let mut not_cylinder = cylinder_like.clone();
    not_cylinder.not();
    let subtract_result = and(&box1, &not_cylinder, 0.05);
    match &subtract_result {
        Some(s) => println!("SUBTRACT succeeded! {} boundaries", s.boundaries().len()),
        None => println!("SUBTRACT FAILED with many-face polygon!"),
    }
    
    // Try different tolerances
    if subtract_result.is_none() {
        println!("Trying with larger tolerances...");
        for tol in [0.1, 0.5, 1.0, 2.0, 5.0] {
            if let Some(s) = and(&box1, &not_cylinder, tol) {
                println!("!! SUCCEEDED with tolerance={}", tol);
                break;
            } else {
                println!("Failed with tolerance={}", tol);
            }
        }
    }
    
    // For now, just document if it fails - we need to understand the behavior
    // assert!(subtract_result.is_some(), "SUBTRACT with many-face polygon should work");
}
