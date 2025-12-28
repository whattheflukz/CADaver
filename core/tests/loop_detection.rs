use cad_core::sketch::regions::find_regions;
use cad_core::sketch::types::{SketchEntity, SketchGeometry};

fn make_line(x1: f64, y1: f64, x2: f64, y2: f64) -> SketchEntity {
    SketchEntity {
        id: cad_core::topo::EntityId::new(),
        geometry: SketchGeometry::Line {
            start: [x1, y1],
            end: [x2, y2],
        },
        is_construction: false,
    }
}

#[test]
fn test_intersecting_geometry_regions() {
    // defined endpoints
    let p00 = [0.0, 0.0];
    let p100 = [10.0, 0.0];
    let p1010 = [10.0, 10.0];
    let p010 = [0.0, 10.0];
    
    // Rectangle edges
    let l1 = make_line(p00[0], p00[1], p100[0], p100[1]);
    let l2 = make_line(p100[0], p100[1], p1010[0], p1010[1]);
    let l3 = make_line(p1010[0], p1010[1], p010[0], p010[1]);
    let l4 = make_line(p010[0], p010[1], p00[0], p00[1]);

    // Bisector line (vertical at x=5, from -1 to 11 to generally cross)
    let bisector = make_line(5.0, -1.0, 5.0, 11.0);

    let entities = vec![l1, l2, l3, l4, bisector];

    let regions = find_regions(&entities);

    // Should find 2 regions (left rectangle, right rectangle)
    // regions.rs returns non-overlapping regions.
    // If it works, verification passed.
    assert_eq!(regions.len(), 2, "Should find 2 regions from bisected rectangle");
}
