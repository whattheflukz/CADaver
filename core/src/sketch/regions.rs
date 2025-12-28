//! Region detection for 2D sketch geometry.
//!
//! Computes enclosed faces (regions) from sketch entities by:
//! 1. Finding all intersection points between curves
//! 2. Building a planar graph with vertices at endpoints/intersections
//! 3. Traversing the graph to find minimal enclosed faces

use crate::geometry::utils_2d::{self, EPSILON};
use crate::sketch::types::{SketchEntity, SketchGeometry};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;
use serde::{Deserialize, Serialize};

/// A detected closed region in the sketch
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SketchRegion {
    /// Stable identifier for this region (hash of boundary)
    pub id: String,
    /// Entity IDs that form the boundary
    pub boundary_entity_ids: Vec<Uuid>,
    /// Ordered boundary points (for rendering/tessellation)
    pub boundary_points: Vec<[f64; 2]>,
    /// Inner loops (holes) inside this region
    #[serde(default)]
    pub voids: Vec<Vec<[f64; 2]>>,
    /// Centroid of the region
    pub centroid: [f64; 2],
    /// Signed area (positive = CCW, negative = CW)
    pub area: f64,
}

/// A vertex in the planar graph
#[derive(Debug, Clone)]
struct GraphVertex {
    pos: [f64; 2],
    /// Edges incident to this vertex, sorted by angle
    edges: Vec<usize>,
}

/// A half-edge in the planar graph
#[derive(Debug, Clone)]
struct HalfEdge {
    /// Start vertex index
    start: usize,
    /// End vertex index
    end: usize,
    /// Original entity this edge came from
    entity_id: Uuid,
    /// Twin half-edge (opposite direction)
    twin: Option<usize>,
    /// Next half-edge in face traversal
    next: Option<usize>,
    /// Has this edge been used in face extraction?
    used: bool,
}

/// Find all closed regions in the sketch
pub fn find_regions(entities: &[SketchEntity]) -> Vec<SketchRegion> {
    let mut regions = Vec::new();
    
    // Filter to non-construction entities
    let geom_entities: Vec<&SketchEntity> = entities
        .iter()
        .filter(|e| !e.is_construction)
        .collect();
    
    if geom_entities.is_empty() {
        return regions;
    }
    
    // 1. Find all intersection points
    let intersections = find_all_intersections(&geom_entities);
    
    // 2. Build planar graph
    let (vertices, mut edges) = build_planar_graph(&geom_entities, &intersections);
    
    if vertices.is_empty() || edges.is_empty() {
        // Handle self-contained loops (circles/ellipses)
        for entity in &geom_entities {
            if let Some(region) = entity_as_region(entity) {
                regions.push(region);
            }
        }
        return regions;
    }
    
    // 3. Link half-edges by sorting around vertices
    link_half_edges(&vertices, &mut edges);
    
    // 4. Extract faces by following half-edge chains
    let faces = extract_faces(&mut edges);
    
    // 5. Convert faces to regions
    for face in faces {
        if let Some(mut region) = face_to_region(&face, &vertices, &edges) {
            // Interior faces have negative area (CW winding in our half-edge structure)
            // The outer unbounded face has positive area (CCW winding)
            // Skip faces with positive area (the exterior)
            if region.area < -EPSILON {
                // Interior faces are CW. Reverse to make CCW (standard).
                region.boundary_points.reverse();
                region.area = region.area.abs();
                regions.push(region);
            }
        }
    }
    
    // Also add any self-contained circles/ellipses that weren't split
    for entity in &geom_entities {
        match &entity.geometry {
            SketchGeometry::Circle { .. } | SketchGeometry::Ellipse { .. } => {
                // Check if this entity was split by intersections
                let was_split = edges.iter().any(|e| e.entity_id == entity.id.0);
                if !was_split {
                    if let Some(region) = entity_as_region(entity) {
                        regions.push(region);
                    }
                }
            }
            _ => {}
        }
    }
    
    // 6. Detect containment and build hierarchy to identifying voids
    let mut final_regions = Vec::new();
    let mut raw_regions = regions; // Rename for clarity
    
    // Sort by area descending (largest first)
    raw_regions.sort_by(|a, b| b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal));
    
    // Build containment tree
    // parents[i] = Some(p_idx) means region i is inside region p_idx
    let mut parents: Vec<Option<usize>> = vec![None; raw_regions.len()];
    
    for i in 0..raw_regions.len() {
        // Find the smallest parent that contains region i
        // Since we sorted by area, potential parents are always at indices < i
        // We pick the "closest" parent (deepest in hierarchy)
        
        let mut best_parent = None;
        let mut min_parent_area = f64::INFINITY;
        
        println!("Checking containment for Region {} (Area {}) using centroid {:?}", i, raw_regions[i].area, raw_regions[i].centroid);
        
        for j in 0..i {
            // Check if i is inside j
            // Using first point of boundary for check
            // TODO: Robustness improvement needed for tangent boundaries
            if !raw_regions[i].boundary_points.is_empty() && 
               point_in_region(raw_regions[i].centroid, &raw_regions[j]) {
                
                println!("  -> Contained in Region {} (Area {})", j, raw_regions[j].area);
                
                if raw_regions[j].area < min_parent_area {
                     min_parent_area = raw_regions[j].area;
                     best_parent = Some(j);
                }
            }
        }
        parents[i] = best_parent;
    }
    
    // Populate voids
    // For every region in the list, its 'voids' are its immediate children in the tree.
    // If Parent P contains Child C, and C contains Grandchild G.
    // P.voids should contain C.
    // C.voids should contain G.
    // G.voids = [].
    //
    // Then we output all of them as valid regions: P (with void C), C (with void G), G.
    // This effectively produces: (P-C), (C-G), G.
    // These are disjoint and cover the original union.
    
    for i in 0..raw_regions.len() {
        let mut region = raw_regions[i].clone();
        
        // Find all immediate children
        for j in (i + 1)..raw_regions.len() {
            if parents[j] == Some(i) {
                println!("  Region {} has void: Region {}", i, j);
                // Add child as void. Child is CCW. Reverse to make it CW for triangulation.
                let mut void_loop = raw_regions[j].boundary_points.clone();
                void_loop.reverse();
                region.voids.push(void_loop);
                
                // Subtract void area from region area
                region.area -= raw_regions[j].area;
            }
        }
        
        final_regions.push(region);
    }
    
    final_regions
}

/// Test if a point is inside a region using winding number algorithm
pub fn point_in_region(point: [f64; 2], region: &SketchRegion) -> bool {
    utils_2d::point_in_polygon(point, &region.boundary_points)
}

/// Find all intersection points between entities
fn find_all_intersections(entities: &[&SketchEntity]) -> Vec<([f64; 2], Uuid, Uuid)> {
    let mut intersections = Vec::new();
    
    for i in 0..entities.len() {
        for j in (i + 1)..entities.len() {
            let pts = intersect_entities(entities[i], entities[j]);
            for pt in pts {
                intersections.push((pt, entities[i].id.0, entities[j].id.0));
            }
        }
    }
    
    intersections
}

/// Intersect two entities and return intersection points
fn intersect_entities(e1: &SketchEntity, e2: &SketchEntity) -> Vec<[f64; 2]> {
    match (&e1.geometry, &e2.geometry) {
        (SketchGeometry::Circle { center: c1, radius: r1 }, 
         SketchGeometry::Circle { center: c2, radius: r2 }) => {
            circle_circle_intersect(*c1, *r1, *c2, *r2)
        }
        (SketchGeometry::Line { start: s1, end: e1 },
         SketchGeometry::Line { start: s2, end: e2 }) => {
            if let Some(pt) = line_line_intersect(*s1, *e1, *s2, *e2) {
                vec![pt]
            } else {
                vec![]
            }
        }
        (SketchGeometry::Line { start, end }, SketchGeometry::Circle { center, radius }) |
        (SketchGeometry::Circle { center, radius }, SketchGeometry::Line { start, end }) => {
            line_circle_intersect(*start, *end, *center, *radius)
        }
        // TODO: Add Arc, Ellipse intersections
        _ => vec![]
    }
}

/// Circle-circle intersection - delegates to utils_2d
fn circle_circle_intersect(c1: [f64; 2], r1: f64, c2: [f64; 2], r2: f64) -> Vec<[f64; 2]> {
    utils_2d::circle_circle_intersect(c1, r1, c2, r2)
}

/// Line-line intersection (segments) - delegates to utils_2d
fn line_line_intersect(s1: [f64; 2], e1: [f64; 2], s2: [f64; 2], e2: [f64; 2]) -> Option<[f64; 2]> {
    utils_2d::line_line_intersect(s1, e1, s2, e2)
}

/// Line-circle intersection - delegates to utils_2d
fn line_circle_intersect(s: [f64; 2], e: [f64; 2], c: [f64; 2], r: f64) -> Vec<[f64; 2]> {
    utils_2d::line_circle_intersect(s, e, c, r)
}

/// Build planar graph from entities and intersection points
fn build_planar_graph(
    entities: &[&SketchEntity],
    intersections: &[([f64; 2], Uuid, Uuid)]
) -> (Vec<GraphVertex>, Vec<HalfEdge>) {
    let mut vertices: Vec<GraphVertex> = Vec::new();
    let mut edges: Vec<HalfEdge> = Vec::new();
    let mut pos_to_vertex: HashMap<String, usize> = HashMap::new();
    
    let pos_key = |p: [f64; 2]| format!("{:.6},{:.6}", p[0], p[1]);
    
    let get_or_create_vertex = |pos: [f64; 2], 
                                 vertices: &mut Vec<GraphVertex>, 
                                 pos_to_vertex: &mut HashMap<String, usize>| -> usize {
        let key = pos_key(pos);
        if let Some(&idx) = pos_to_vertex.get(&key) {
            idx
        } else {
            let idx = vertices.len();
            vertices.push(GraphVertex { pos, edges: Vec::new() });
            pos_to_vertex.insert(key, idx);
            idx
        }
    };
    
    for entity in entities {
        match &entity.geometry {
            SketchGeometry::Line { start, end } => {
                // Collect all points on this line (endpoints + intersections)
                let mut pts_on_line: Vec<[f64; 2]> = vec![*start, *end];
                
                for (pt, id1, id2) in intersections {
                    if *id1 == entity.id.0 || *id2 == entity.id.0 {
                        pts_on_line.push(*pt);
                    }
                }
                
                // Sort by parameter along line
                let dx = end[0] - start[0];
                let dy = end[1] - start[1];
                pts_on_line.sort_by(|a, b| {
                    let ta = if dx.abs() > dy.abs() { (a[0] - start[0]) / dx } else { (a[1] - start[1]) / dy };
                    let tb = if dx.abs() > dy.abs() { (b[0] - start[0]) / dx } else { (b[1] - start[1]) / dy };
                    ta.partial_cmp(&tb).unwrap()
                });
                
                // Deduplicate
                pts_on_line.dedup_by(|a, b| (a[0] - b[0]).abs() < EPSILON && (a[1] - b[1]).abs() < EPSILON);
                
                // Create edges between consecutive points
                for i in 0..(pts_on_line.len() - 1) {
                    let v1 = get_or_create_vertex(pts_on_line[i], &mut vertices, &mut pos_to_vertex);
                    let v2 = get_or_create_vertex(pts_on_line[i + 1], &mut vertices, &mut pos_to_vertex);
                    
                    let e1_idx = edges.len();
                    let e2_idx = edges.len() + 1;
                    
                    edges.push(HalfEdge {
                        start: v1,
                        end: v2,
                        entity_id: entity.id.0,
                        twin: Some(e2_idx),
                        next: None,
                        used: false,
                    });
                    edges.push(HalfEdge {
                        start: v2,
                        end: v1,
                        entity_id: entity.id.0,
                        twin: Some(e1_idx),
                        next: None,
                        used: false,
                    });
                    
                    vertices[v1].edges.push(e1_idx);
                    vertices[v2].edges.push(e2_idx);
                }
            }
            SketchGeometry::Circle { center, radius: _ } => {
                // Collect intersection points on this circle
                let mut pts_on_circle: Vec<[f64; 2]> = Vec::new();
                
                for (pt, id1, id2) in intersections {
                    if *id1 == entity.id.0 || *id2 == entity.id.0 {
                        pts_on_circle.push(*pt);
                    }
                }
                
                if pts_on_circle.is_empty() {
                    // Self-contained circle, handled separately
                    continue;
                }
                
                // Sort by angle
                pts_on_circle.sort_by(|a, b| {
                    let angle_a = (a[1] - center[1]).atan2(a[0] - center[0]);
                    let angle_b = (b[1] - center[1]).atan2(b[0] - center[0]);
                    angle_a.partial_cmp(&angle_b).unwrap()
                });
                
                // For each arc between consecutive intersection points, 
                // discretize into line segments so graph traversal works
                let n = pts_on_circle.len();
                for i in 0..n {
                    let p1 = pts_on_circle[i];
                    let p2 = pts_on_circle[(i + 1) % n];
                    
                    // Calculate arc between p1 and p2 (going CCW)
                    let angle1 = (p1[1] - center[1]).atan2(p1[0] - center[0]);
                    let mut angle2 = (p2[1] - center[1]).atan2(p2[0] - center[0]);
                    
                    // Ensure we go CCW from angle1 to angle2  
                    if angle2 <= angle1 {
                        angle2 += 2.0 * std::f64::consts::PI;
                    }
                    
                    let arc_length = angle2 - angle1;
                    
                    // Discretize into segments (more for longer arcs)
                    let num_segments = ((arc_length / (std::f64::consts::PI / 16.0)).max(1.0)) as usize;
                    
                    let mut prev_vertex = get_or_create_vertex(p1, &mut vertices, &mut pos_to_vertex);
                    
                    for seg in 1..=num_segments {
                        let t = seg as f64 / num_segments as f64;
                        let angle = angle1 + t * arc_length;
                        let pt = if seg == num_segments {
                            p2 // Use exact endpoint
                        } else {
                            let r = ((p1[0] - center[0]).powi(2) + (p1[1] - center[1]).powi(2)).sqrt();
                            [center[0] + r * angle.cos(), center[1] + r * angle.sin()]
                        };
                        
                        let curr_vertex = get_or_create_vertex(pt, &mut vertices, &mut pos_to_vertex);
                        
                        // Create half-edge pair
                        let e1_idx = edges.len();
                        let e2_idx = edges.len() + 1;
                        
                        edges.push(HalfEdge {
                            start: prev_vertex,
                            end: curr_vertex,
                            entity_id: entity.id.0,
                            twin: Some(e2_idx),
                            next: None,
                            used: false,
                        });
                        edges.push(HalfEdge {
                            start: curr_vertex,
                            end: prev_vertex,
                            entity_id: entity.id.0,
                            twin: Some(e1_idx),
                            next: None,
                            used: false,
                        });
                        
                        vertices[prev_vertex].edges.push(e1_idx);
                        vertices[curr_vertex].edges.push(e2_idx);
                        
                        prev_vertex = curr_vertex;
                    }
                }
            }
            _ => {}
        }
    }
    
    // Prune filaments (degree-1 vertices)
    prune_filaments(&mut vertices, &mut edges);

    (vertices, edges)
}

/// Iteratively remove degree-1 vertices (dead ends) and their incident edges
fn prune_filaments(vertices: &mut [GraphVertex], edges: &mut Vec<HalfEdge>) {
    let mut changed = true;
    while changed {
        changed = false;
        
        // Count active edges per vertex
        let mut degree = vec![0; vertices.len()];
        let mut active_edge_indices = vec![Vec::new(); vertices.len()];

        for (i, edge) in edges.iter().enumerate() {
            if !edge.used { // reusing 'used' flag to mark deleted edges for now? No, 'used' is for face extraction
                 // We should add a 'deleted' flag or just modify the edges list? 
                 // Modifying edges list is hard because indices. 
                 // Let's assume edges not marked 'deleted' contribute to degree.
            }
        }
        // Wait, 'used' is cleared before face extraction anyway. Let's use it as 'deleted' here and reset it after.
        
        fill_degrees(vertices, edges, &mut degree, &mut active_edge_indices);
        
        for v_idx in 0..vertices.len() {
            if degree[v_idx] == 1 {
                // This is a dead end. Remove the edge connected to it.
                if let Some(&e_idx) = active_edge_indices[v_idx].first() {
                    edges[e_idx].used = true; // Mark as deleted
                    if let Some(twin) = edges[e_idx].twin {
                        edges[twin].used = true; // Mark twin as deleted
                    }
                    changed = true;
                }
            }
        }
    }
    
    // Actually remove deleted edges from vertex lists to clean up graph structure?
    // Or just filter them out during linking.
    // The current linking logic iterates `vertex.edges`. We need to remove deleted edges from there.
    for vertex in vertices.iter_mut() {
        vertex.edges.retain(|&e_idx| !edges[e_idx].used);
    }
    
    // Reset 'used' flag for face extraction
    for edge in edges.iter_mut() {
        edge.used = false;
    }
}

fn fill_degrees(vertices: &[GraphVertex], edges: &[HalfEdge], degree: &mut [usize], active_edge_indices: &mut [Vec<usize>]) {
    for d in degree.iter_mut() { *d = 0; }
    for l in active_edge_indices.iter_mut() { l.clear(); }
    
    for (i, edge) in edges.iter().enumerate() {
        if !edge.used {
            degree[edge.start] += 1;
            active_edge_indices[edge.start].push(i);
        }
    }
}

/// Link half-edges by sorting edges around each vertex by angle
fn link_half_edges(vertices: &[GraphVertex], edges: &mut [HalfEdge]) {
    for vertex in vertices {
        if vertex.edges.len() < 2 {
            continue;
        }
        
        // Sort edges by outgoing angle
        let mut sorted_edges: Vec<usize> = vertex.edges.clone();
        sorted_edges.sort_by(|&a, &b| {
            let ea = &edges[a];
            let eb = &edges[b];
            let end_a = vertices[ea.end].pos;
            let end_b = vertices[eb.end].pos;
            let angle_a = (end_a[1] - vertex.pos[1]).atan2(end_a[0] - vertex.pos[0]);
            let angle_b = (end_b[1] - vertex.pos[1]).atan2(end_b[0] - vertex.pos[0]);
            angle_a.partial_cmp(&angle_b).unwrap()
        });
        
        // Link: incoming edge's next = CCW next outgoing edge
        for i in 0..sorted_edges.len() {
            let outgoing = sorted_edges[i];
            let next_outgoing = sorted_edges[(i + 1) % sorted_edges.len()];
            
            // The incoming edge is the twin of this outgoing edge
            if let Some(twin_idx) = edges[outgoing].twin {
                edges[twin_idx].next = Some(next_outgoing);
            }
        }
    }
}

/// Extract faces by following half-edge chains
fn extract_faces(edges: &mut [HalfEdge]) -> Vec<Vec<usize>> {
    let mut faces = Vec::new();
    
    for start_edge in 0..edges.len() {
        if edges[start_edge].used {
            continue;
        }
        
        let mut face = Vec::new();
        let mut current = start_edge;
        let mut iterations = 0;
        let max_iterations = edges.len() * 2;
        
        loop {
            if edges[current].used {
                break;
            }
            
            edges[current].used = true;
            face.push(current);
            
            if let Some(next) = edges[current].next {
                if next == start_edge {
                    // Completed the loop
                    faces.push(face);
                    break;
                }
                current = next;
            } else {
                break; // Dead end
            }
            
            iterations += 1;
            if iterations > max_iterations {
                break; // Safety
            }
        }
    }
    
    faces
}

/// Convert a face (list of half-edge indices) to a SketchRegion
fn face_to_region(
    face: &[usize], 
    vertices: &[GraphVertex], 
    edges: &[HalfEdge]
) -> Option<SketchRegion> {
    if face.len() < 3 {
        return None;
    }
    
    let mut boundary_points: Vec<[f64; 2]> = Vec::new();
    let mut boundary_entity_ids: HashSet<Uuid> = HashSet::new();
    
    for &edge_idx in face {
        let edge = &edges[edge_idx];
        let start_pos = vertices[edge.start].pos;
        boundary_points.push(start_pos);
        boundary_entity_ids.insert(edge.entity_id);
    }
    
    // Calculate area and centroid
    let (area, centroid) = compute_area_and_centroid(&boundary_points);
    
    // Generate stable ID from boundary entity IDs AND centroid (for uniqueness)
    // Note: All regions from overlapping circles share the same entity IDs,
    // so we need to include the centroid to differentiate them
    let mut id_parts: Vec<String> = boundary_entity_ids.iter().map(|id| id.to_string()).collect();
    id_parts.sort();
    let id = format!("region_{:x}", {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        id_parts.hash(&mut hasher);
        // Include centroid to differentiate regions with same boundary entities
        ((centroid[0] * 10000.0) as i64).hash(&mut hasher);
        ((centroid[1] * 10000.0) as i64).hash(&mut hasher);
        hasher.finish()
    });
    
    Some(SketchRegion {
        id,
        boundary_entity_ids: boundary_entity_ids.into_iter().collect(),
        boundary_points,
        voids: Vec::new(),
        centroid,
        area,
    })
}

/// Compute signed area and centroid using shoelace formula
fn compute_area_and_centroid(pts: &[[f64; 2]]) -> (f64, [f64; 2]) {
    let n = pts.len();
    if n < 3 {
        return (0.0, [0.0, 0.0]);
    }
    
    let mut signed_area = 0.0;
    let mut cx = 0.0;
    let mut cy = 0.0;
    
    for i in 0..n {
        let j = (i + 1) % n;
        let cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
        signed_area += cross;
        cx += (pts[i][0] + pts[j][0]) * cross;
        cy += (pts[i][1] + pts[j][1]) * cross;
    }
    
    signed_area /= 2.0;
    
    if signed_area.abs() > EPSILON {
        cx /= 6.0 * signed_area;
        cy /= 6.0 * signed_area;
    } else {
        // Degenerate, use average
        cx = pts.iter().map(|p| p[0]).sum::<f64>() / n as f64;
        cy = pts.iter().map(|p| p[1]).sum::<f64>() / n as f64;
    }
    
    (signed_area, [cx, cy])
}

/// Convert a self-contained entity (circle/ellipse) to a region
fn entity_as_region(entity: &SketchEntity) -> Option<SketchRegion> {
    match &entity.geometry {
        SketchGeometry::Circle { center, radius } => {
            // Discretize circle
            let segments = 64;
            let mut pts = Vec::with_capacity(segments);
            for i in 0..segments {
                let angle = (i as f64 / segments as f64) * 2.0 * std::f64::consts::PI;
                pts.push([
                    center[0] + radius * angle.cos(),
                    center[1] + radius * angle.sin(),
                ]);
            }
            
            let area = std::f64::consts::PI * radius * radius;
            
            Some(SketchRegion {
                id: format!("region_{}", entity.id.0),
                boundary_entity_ids: vec![entity.id.0],
                boundary_points: pts,
                voids: Vec::new(),
                centroid: *center,
                area,
            })
        }
        SketchGeometry::Ellipse { center, semi_major, semi_minor, rotation } => {
            let segments = 64;
            let cos_r = rotation.cos();
            let sin_r = rotation.sin();
            let mut pts = Vec::with_capacity(segments);
            
            for i in 0..segments {
                let t = (i as f64 / segments as f64) * 2.0 * std::f64::consts::PI;
                let x_local = semi_major * t.cos();
                let y_local = semi_minor * t.sin();
                pts.push([
                    center[0] + x_local * cos_r - y_local * sin_r,
                    center[1] + x_local * sin_r + y_local * cos_r,
                ]);
            }
            
            let area = std::f64::consts::PI * semi_major * semi_minor;
            
            Some(SketchRegion {
                id: format!("region_{}", entity.id.0),
                boundary_entity_ids: vec![entity.id.0],
                boundary_points: pts,
                voids: Vec::new(),
                centroid: *center,
                area,
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::topo::EntityId;

    #[test]
    fn test_two_non_overlapping_circles() {
        let entities = vec![
            SketchEntity {
                id: EntityId::new(),
                geometry: SketchGeometry::Circle { center: [0.0, 0.0], radius: 5.0 },
                is_construction: false,
            },
            SketchEntity {
                id: EntityId::new(),
                geometry: SketchGeometry::Circle { center: [20.0, 0.0], radius: 5.0 },
                is_construction: false,
            },
        ];
        
        let regions = find_regions(&entities);
        assert_eq!(regions.len(), 2, "Two non-overlapping circles should produce 2 regions");
    }

    #[test]
    fn test_two_overlapping_circles() {
        let entities = vec![
            SketchEntity {
                id: EntityId::new(),
                geometry: SketchGeometry::Circle { center: [0.0, 0.0], radius: 5.0 },
                is_construction: false,
            },
            SketchEntity {
                id: EntityId::new(),
                geometry: SketchGeometry::Circle { center: [6.0, 0.0], radius: 5.0 },
                is_construction: false,
            },
        ];
        
        let regions = find_regions(&entities);
        // Should have 3 regions: left crescent, intersection, right crescent
        assert_eq!(regions.len(), 3, "Two overlapping circles should produce 3 regions");
        
        // All regions should have positive area
        for region in &regions {
            assert!(region.area > 0.0, "Region area should be positive");
        }
    }

    #[test]
    fn test_point_in_circle_region() {
        let entity = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Circle { center: [0.0, 0.0], radius: 5.0 },
            is_construction: false,
        };
        
        let regions = find_regions(&[entity]);
        assert_eq!(regions.len(), 1);
        
        let region = &regions[0];
        
        // Point at center should be inside
        assert!(point_in_region([0.0, 0.0], region), "Center should be inside");
        
        // Point outside should be outside
        assert!(!point_in_region([10.0, 0.0], region), "Point at (10,0) should be outside");
    }

    #[test]
    fn test_circle_circle_intersection() {
        let pts = circle_circle_intersect([0.0, 0.0], 5.0, [6.0, 0.0], 5.0);
        assert_eq!(pts.len(), 2, "Overlapping circles should have 2 intersection points");
    }
    #[test]
    fn test_square_intersected_by_circle() {
        let square_lines = vec![
            // Bottom
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, -10.0], end: [10.0, -10.0] }, is_construction: false },
            // Right
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, -10.0], end: [10.0, 10.0] }, is_construction: false },
            // Top
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, 10.0], end: [-10.0, 10.0] }, is_construction: false },
            // Left
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, 10.0], end: [-10.0, -10.0] }, is_construction: false },
        ];
        
        let circle = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Circle { center: [10.0, 0.0], radius: 5.0 },
            is_construction: false,
        };
        
        let mut entities = square_lines;
        entities.push(circle);
        
        let regions = find_regions(&entities);
        
        // Debug output
        println!("Found regions: {}", regions.len());
        for (i, r) in regions.iter().enumerate() {
            println!("Region {}: Area={}, Centroid={:?}", i, r.area, r.centroid);
        }

        assert_eq!(regions.len(), 3, "Square intersected by circle should produce 3 regions");
    }

    #[test]
    fn test_square_crossed_by_line() {
        // Square from -10 to 10
        let square_lines = vec![
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, -10.0], end: [10.0, -10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, -10.0], end: [10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, 10.0], end: [-10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, 10.0], end: [-10.0, -10.0] }, is_construction: false },
        ];
        
        // Line crossing from left (-15, 0) to right (15, 0)
        let crossing_line = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [-15.0, 0.0], end: [15.0, 0.0] },
            is_construction: false,
        };
        
        let mut entities = square_lines;
        entities.push(crossing_line);
        
        let regions = find_regions(&entities);
        
        // Should have 2 regions (top rectangular, bottom rectangular)
        println!("Found regions: {}", regions.len());
        for (i, r) in regions.iter().enumerate() {
            println!("Region {}: Area={}", i, r.area);
        }

        assert_eq!(regions.len(), 2, "Square bisected by line should produce 2 regions");
    }

    #[test]
    fn test_square_two_vertical_lines() {
        // Square from -10 to 10. Area = 400.
        let square_lines = vec![
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, -10.0], end: [10.0, -10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, -10.0], end: [10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, 10.0], end: [-10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, 10.0], end: [-10.0, -10.0] }, is_construction: false },
        ];
        
        // Line x = -2
        let line1 = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [-2.0, -15.0], end: [-2.0, 15.0] },
            is_construction: false,
        };
        // Line x = 2
        let line2 = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [2.0, -15.0], end: [2.0, 15.0] },
            is_construction: false,
        };
        
        let mut entities = square_lines;
        entities.push(line1);
        entities.push(line2);
        
        let regions = find_regions(&entities);
        
        // Should have 3 regions: Left, Middle, Right
        println!("Found regions: {}", regions.len());
        for (i, r) in regions.iter().enumerate() {
            println!("Region {}: Area={}", i, r.area);
        }

        assert_eq!(regions.len(), 3, "Square cut by two parallel lines should produce 3 regions");
    }

    #[test]
    fn test_user_scenario_exact() {
        let rect = vec![
            // Top
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-3.427366411755626, 5.128495017868517], end: [8.188989683086833, 5.128495017868517] }, is_construction: false },
            // Right
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [8.188989683086833, 5.128495017868517], end: [8.188989683086833, -6.730505441649946] }, is_construction: false },
            // Bottom
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [8.188989683086833, -6.730505441649946], end: [-3.427366411755626, -6.730505441649946] }, is_construction: false },
            // Left
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-3.427366411755626, -6.730505441649946], end: [-3.427366411755626, 5.128495017868517] }, is_construction: false },
        ];
        
        // 08d8e4ca-0328-4461-93c8-f64607604196
        let line1 = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [2.5947459039737835, 6.200382959225407], end: [-4.952031485437824, -5.9013985762803935] },
            is_construction: false,
        };
        // fee6a609-aea6-497a-8ace-6d2d6fb07c23
        let line2 = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [0.0, 6.380964821606707], end: [-5.3890639322594875, -2.260773369926582] },
            is_construction: false,
        };
        
        let circle = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Circle { center: [8.981862600577657, -9.740999883411394], radius: 8.503277250188482 },
            is_construction: false,
        };
        
        let mut entities = rect;
        entities.push(line1);
        entities.push(line2);
        entities.push(circle);
        
        let regions = find_regions(&entities);
        
        println!("Found regions: {}", regions.len());
        for (i, r) in regions.iter().enumerate() {
            println!("Region {}: Area={}", i, r.area);
        }

        // We expect more than 2.
        assert!(regions.len() > 2, "Complex scenario should produce multiple regions");
    }

    #[test]
    fn test_square_with_filament() {
        // Square from -10 to 10
        let square_lines = vec![
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, -10.0], end: [10.0, -10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, -10.0], end: [10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [10.0, 10.0], end: [-10.0, 10.0] }, is_construction: false },
            SketchEntity { id: EntityId::new(), geometry: SketchGeometry::Line { start: [-10.0, 10.0], end: [-10.0, -10.0] }, is_construction: false },
        ];
        
        // Line crossing top edge (-5, 10) and stopping inside (-5, 0)
        let filament = SketchEntity {
            id: EntityId::new(),
            geometry: SketchGeometry::Line { start: [-5.0, 15.0], end: [-5.0, 0.0] },
            is_construction: false,
        };
        
        let mut entities = square_lines;
        entities.push(filament);
        
        let regions = find_regions(&entities);
        
        // Should have at least 1 region (the square itself, area 400)
        println!("Found regions: {}", regions.len());
        for (i, r) in regions.iter().enumerate() {
            println!("Region {}: Area={}", i, r.area);
        }

        assert_eq!(regions.len(), 1, "Square with filament should still be 1 region");
        assert!((regions[0].area - 400.0).abs() < 1.0, "Area should be approx 400");
    }
}
