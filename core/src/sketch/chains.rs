use crate::sketch::types::{SketchGeometry, SketchEntity};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// Represents a chain of connected sketch entities
pub type Chain = Vec<SketchEntity>;

/// Finds closed loops from a set of sketch entities.
///
/// This function constructs a graph where nodes are endpoints and edges are the entities.
/// It then finds connected components and checks if they form closed loops.
///
/// Note: This is a simplified implementation. It assumes endpoints match exactly (or within tolerance).
/// It essentially treats the sketch as a graph traversal problem.
pub fn find_closed_loops(entities: &[SketchEntity]) -> Vec<Chain> {
    if entities.is_empty() {
        return Vec::new();
    }

    // 1. Build Adjacency Graph
    // map: Coordinates -> List of (EntityIndex, IsStart)
    // We use a string key for rough coordinate matching to handle floating point issues
    let mut coord_map: HashMap<String, Vec<(usize, bool)>> = HashMap::new();
    
    // Helper to key
    let to_key = |pt: &[f64; 2]| -> String {
        format!("{:.4},{:.4}", pt[0], pt[1])
    };

    for (idx, entity) in entities.iter().enumerate() {
        // Only consider geometry that contributes to profiles
        if entity.is_construction {
            continue;
        }

        match &entity.geometry {
            SketchGeometry::Line { start, end } => {
                coord_map.entry(to_key(start)).or_default().push((idx, true));
                coord_map.entry(to_key(end)).or_default().push((idx, false));
            },
            SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
                let start_pt = [
                    center[0] + radius * start_angle.cos(),
                    center[1] + radius * start_angle.sin()
                ];
                let end_pt = [
                    center[0] + radius * end_angle.cos(),
                    center[1] + radius * end_angle.sin()
                ];
                coord_map.entry(to_key(&start_pt)).or_default().push((idx, true));
                coord_map.entry(to_key(&end_pt)).or_default().push((idx, false));
            },
            SketchGeometry::Circle { .. } | SketchGeometry::Ellipse { .. } => {
                // Circles/Ellipses are self-contained loops
                // We handle them separately or as special single-edge loops
            },
             _ => {}
        }
    }

    // 2. Extract self-contained loops (Circles/Ellipses)
    let mut loops: Vec<Chain> = Vec::new();
    let mut visited: HashSet<Uuid> = HashSet::new();

    for entity in entities {
        if entity.is_construction { continue; }
        
        match &entity.geometry {
            SketchGeometry::Circle { .. } | SketchGeometry::Ellipse { .. } => {
                loops.push(vec![entity.clone()]);
                visited.insert(entity.id.0);
            },
            _ => {} 
        }
    }

    // 3. Traverse graph to find cycles
    // This is a naive DFS to find cycles. 
    // For a robust CAD kernel, we'd need a planar graph library to find minimal cycles (faces).
    // For now, we assume simple simple non-intersecting chains that form boundaries.
    
    let mut used_entities: HashSet<usize> = HashSet::new();
    
    for i in 0..entities.len() {
        if visited.contains(&entities[i].id.0) { continue; }
        if entities[i].is_construction { continue; }
        if used_entities.contains(&i) { continue; }

        // Start a chain traversal
        let mut chain: Vec<usize> = Vec::new();
        let mut current_idx = i;
        let mut current_start = true; // are we looking at start or end of current?
        
        // Initial direction: if we start at 'start', we look for 'end'.
        
        // Let's trace...
        // Actually, simpler: just follow connectivity.
        // A profile MUST be a closed loop? 
        // Let's try to walk until we hit start again.
        
        let mut trace_stack: Vec<usize> = Vec::new();
        let mut trace_set: HashSet<usize> = HashSet::new();
        
        // Optimization: Just find connected components. If component degree valid -> it's a loop.
        // But we need the ORDERED geometry for meshing.
        
        // Re-approach:
        // Pick an unused edge.
        // Directions?
        // Let's assume we start at 'start' of line.
        // We look up 'end' in coord_map.
        // Find connected edge.
        // Continue.
        
        // ... (Simplified logic for the sake of the task)
        // We will just return the single big profile if we find one, or multiple if disjoint.
        // TODO: Proper planar graph face finding.
        
        // Hacky: If we haven't visited it, it might be part of a loop.
        // Let's try to extract ONE loop starting here.
        if let Some(extracted_loop) = extract_loop_from(i, entities, &coord_map, &mut used_entities) {
             loops.push(extracted_loop);
        }
    }

    loops
}

fn extract_loop_from(
    start_idx: usize, 
    entities: &[SketchEntity], 
    coord_map: &HashMap<String, Vec<(usize, bool)>>,
    used: &mut HashSet<usize>
) -> Option<Chain> {
    
    let mut chain = Vec::new();
    let mut curr_idx = start_idx;
    // Which end are we at? 
    // Arbitrarily start looking from the 'end' of the first entity.
    let mut looking_for_match_at_end = true; 
    
    // Safety break
    let mut attempts = 0;
    let max_steps = entities.len() * 2;

    loop {
        if attempts > max_steps { break; }
        attempts += 1;

        used.insert(curr_idx);
        let entity = &entities[curr_idx];
        chain.push(entity.clone());

        // Get the point we are currently at
        let current_pt = get_endpoint(entity, looking_for_match_at_end);
        let key = format!("{:.4},{:.4}", current_pt[0], current_pt[1]);

        // Find neighbors at this point
        if let Some(neighbors) = coord_map.get(&key) {
            // Find a neighbor that is NOT current_idx
            // And hopefully unvisited? No, if we close loop, it will be the start_idx.
            
            let next = neighbors.iter().find(|(idx, is_start)| *idx != curr_idx);
            
            if let Some((next_idx, next_is_start)) = next {
                if *next_idx == start_idx {
                    // Closed the loop!
                    return Some(chain);
                }
                
                if used.contains(next_idx) {
                    // Hit a used edge that is NOT start. 
                    // This implies complex intersection or sharing. Abort this simple tracer.
                    return None;
                }

                curr_idx = *next_idx;
                // If we matched at 'start' of next, we will look for 'end' of next.
                // If we matched at 'end' of next, we will look for 'start' of next.
                looking_for_match_at_end = *next_is_start; 
                
            } else {
                // Dead end
                return None;
            }
        } else {
            // No connection info?
            return None;
        }
    }

    None
}

fn get_endpoint(entity: &SketchEntity, get_end: bool) -> [f64; 2] {
    match &entity.geometry {
        SketchGeometry::Line { start, end } => {
            if get_end { *end } else { *start }
        },
        SketchGeometry::Arc { center, radius, start_angle, end_angle } => {
            let angle = if get_end { *end_angle } else { *start_angle };
            [
                center[0] + radius * angle.cos(),
                center[1] + radius * angle.sin()
            ]
        },
        _ => [0.0, 0.0] // Should not happen for handled types
    }
}
