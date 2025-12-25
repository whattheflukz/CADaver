import { createSignal, type Component, onMount, createMemo, createEffect } from 'solid-js';
import { BaseModal } from './BaseModal';
import NumericInput from './NumericInput';
import { parseValueOrExpression } from '../expressionEvaluator';
import type { ParameterValue, FeatureGraphState, Sketch, SketchEntity, SketchRegion } from '../types';

interface ExtrudeModalProps {
    featureId: string;
    initialParams: { [key: string]: ParameterValue };
    onUpdate: (id: string, params: { [key: string]: ParameterValue }) => void;
    onClose: () => void;
    selection: any[];
    setSelection: (sel: any[]) => void;
    graph: FeatureGraphState;
    // For viewport region click detection
    regionClickPoint?: [number, number] | null;
    onConsumeRegionClick?: () => void;
    // Backend computed regions (with planar graph algorithm for intersections)
    backendRegions?: SketchRegion[] | null;
    onRequestRegions?: (sketchId: string) => void;
}

/** 
 * Compute regions from sketch entities using frontend point-in-polygon logic.
 * Handles: circles, ellipses, and closed line loops (rectangles, triangles, etc.)
 * 
 * NOTE: This does NOT handle regions formed by intersecting entities (like the lens
 * between two overlapping circles). That requires the full planar graph algorithm
 * which is implemented in the backend regions.rs module.
 */
function computeRegionsFromEntities(entities: SketchEntity[]): SketchRegion[] {
    const regions: SketchRegion[] = [];
    const EPSILON = 1e-6;

    // Helper to compare 2D points
    const pointsEqual = (a: [number, number], b: [number, number]) =>
        Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

    // 1. Collect self-contained regions (circles, ellipses)
    for (const entity of entities) {
        if (entity.is_construction) continue;

        if (entity.geometry.Circle) {
            const { center, radius } = entity.geometry.Circle;
            const segments = 32;
            const points: [number, number][] = [];
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * 2 * Math.PI;
                points.push([
                    center[0] + radius * Math.cos(angle),
                    center[1] + radius * Math.sin(angle)
                ]);
            }
            regions.push({
                id: `region_${entity.id}`,
                boundary_entity_ids: [entity.id],
                boundary_points: points,
                voids: [],
                centroid: center,
                area: Math.PI * radius * radius
            });
        } else if (entity.geometry.Ellipse) {
            const { center, semi_major, semi_minor, rotation } = entity.geometry.Ellipse;
            const segments = 32;
            const points: [number, number][] = [];
            const cosR = Math.cos(rotation);
            const sinR = Math.sin(rotation);
            for (let i = 0; i < segments; i++) {
                const t = (i / segments) * 2 * Math.PI;
                const xLocal = semi_major * Math.cos(t);
                const yLocal = semi_minor * Math.sin(t);
                points.push([
                    center[0] + xLocal * cosR - yLocal * sinR,
                    center[1] + xLocal * sinR + yLocal * cosR
                ]);
            }
            regions.push({
                id: `region_${entity.id}`,
                boundary_entity_ids: [entity.id],
                boundary_points: points,
                voids: [],
                centroid: center,
                area: Math.PI * semi_major * semi_minor
            });
        }
    }

    // 2. Find closed loops formed by connected lines
    // Build adjacency: endpoint -> list of (entity, startOrEnd)
    const lines = entities.filter(e => !e.is_construction && e.geometry.Line);
    const endpointMap = new Map<string, { entity: SketchEntity; isStart: boolean }[]>();

    const pointKey = (p: [number, number]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

    for (const line of lines) {
        const { start, end } = line.geometry.Line!;
        const startKey = pointKey(start);
        const endKey = pointKey(end);

        if (!endpointMap.has(startKey)) endpointMap.set(startKey, []);
        if (!endpointMap.has(endKey)) endpointMap.set(endKey, []);

        endpointMap.get(startKey)!.push({ entity: line, isStart: true });
        endpointMap.get(endKey)!.push({ entity: line, isStart: false });
    }

    // Find closed loops by traversing
    const usedLines = new Set<string>();

    for (const line of lines) {
        if (usedLines.has(line.id)) continue;

        // Try to trace a loop starting from this line
        const loopEntities: SketchEntity[] = [line];
        const loopPoints: [number, number][] = [];

        let { start, end } = line.geometry.Line!;
        loopPoints.push(start);
        let currentEnd = end;
        let foundLoop = false;

        const visited = new Set<string>([line.id]);

        while (loopEntities.length < lines.length) {
            const currentKey = pointKey(currentEnd);
            const neighbors = endpointMap.get(currentKey) || [];

            // Find next unvisited connected line
            let nextLine: { entity: SketchEntity; isStart: boolean } | null = null;
            for (const n of neighbors) {
                if (!visited.has(n.entity.id)) {
                    nextLine = n;
                    break;
                }
            }

            if (!nextLine) break;

            visited.add(nextLine.entity.id);
            loopEntities.push(nextLine.entity);
            loopPoints.push(currentEnd);

            const { start: nStart, end: nEnd } = nextLine.entity.geometry.Line!;
            currentEnd = nextLine.isStart ? nEnd : nStart;

            // Check if we've completed the loop
            if (pointsEqual(currentEnd, start)) {
                foundLoop = true;
                break;
            }
        }

        if (foundLoop && loopEntities.length >= 3) {
            // Mark all lines in loop as used
            loopEntities.forEach(e => usedLines.add(e.id));

            // Compute centroid
            let cx = 0, cy = 0;
            for (const p of loopPoints) {
                cx += p[0];
                cy += p[1];
            }
            cx /= loopPoints.length;
            cy /= loopPoints.length;

            // Compute area using shoelace formula
            let area = 0;
            for (let i = 0; i < loopPoints.length; i++) {
                const j = (i + 1) % loopPoints.length;
                area += loopPoints[i][0] * loopPoints[j][1];
                area -= loopPoints[j][0] * loopPoints[i][1];
            }
            area = Math.abs(area) / 2;

            regions.push({
                id: `region_loop_${loopEntities.map(e => e.id).join('_').substring(0, 20)}`,
                boundary_entity_ids: loopEntities.map(e => e.id),
                boundary_points: loopPoints,
                voids: [],
                centroid: [cx, cy],
                area: area
            });
        }
    }

    return regions;
}

/** Test if a point is inside a region using winding number algorithm */
export function pointInRegion(point: [number, number], region: SketchRegion): boolean {
    const pts = region.boundary_points;
    if (pts.length < 3) return false;

    let winding = 0;
    const n = pts.length;

    for (let i = 0; i < n; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];

        if (p1[1] <= point[1]) {
            if (p2[1] > point[1]) {
                const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
                if (cross > 0) winding++;
            }
        } else {
            if (p2[1] <= point[1]) {
                const cross = (p2[0] - p1[0]) * (point[1] - p1[1]) - (p2[1] - p1[1]) * (point[0] - p1[0]);
                if (cross < 0) winding--;
            }
        }
    }

    return winding !== 0;
}

const ExtrudeModal: Component<ExtrudeModalProps> = (props) => {
    // Store distance as expression string to support variables
    const [distanceExpr, setDistanceExpr] = createSignal("10");
    const [operation, setOperation] = createSignal("Add");
    const [flipExtrude, setFlipExtrude] = createSignal(false);

    // Selected region IDs
    const [selectedRegions, setSelectedRegions] = createSignal<string[]>([]);
    // Initialization source tracking
    const [initSource, setInitSource] = createSignal<'none' | 'fallback' | 'backend'>('none');

    // Get the sketch ID from this extrude feature's dependencies
    const sketchId = createMemo(() => {
        const nodes = props.graph?.nodes;
        const extrudeFeature = nodes?.[props.featureId];
        return extrudeFeature?.dependencies?.[0] ?? null;
    });

    // Use backend regions if available, otherwise compute locally
    const availableRegions = createMemo(() => {
        // Prefer backend regions (handles circle intersections)
        // If we have backend regions, we ALWAYS prioritize them
        if (props.backendRegions && props.backendRegions.length > 0) {
            console.log("ExtrudeModal: Using BACKEND regions", props.backendRegions.length);
            // Verify voids
            props.backendRegions.forEach((r: SketchRegion, i: number) => {
                if (r.voids && r.voids.length > 0) {
                    console.log(`  Region ${i} has ${r.voids.length} voids. ID: ${r.id}`);
                } else {
                    console.log(`  Region ${i} has NO voids. ID: ${r.id}`);
                }
            });
            return props.backendRegions;
        }

        const nodes = props.graph?.nodes;
        const extrudeFeature = nodes?.[props.featureId];
        if (!extrudeFeature?.dependencies?.[0]) return [];

        const skId = extrudeFeature.dependencies[0];
        const sketchFeature = nodes?.[skId];
        const sketchData = sketchFeature?.parameters?.sketch_data?.Sketch as Sketch | undefined;

        if (!sketchData?.entities) return [];

        const nonConstruction = sketchData.entities.filter((e: SketchEntity) => !e.is_construction);
        console.log("ExtrudeModal: Computing LOCAL regions fallback");
        return computeRegionsFromEntities(nonConstruction);
    });

    // Helper to sync selected regions to backend - MUST be defined before onMount
    // Accept optional regions param to avoid stale availableRegions() memo issue
    const syncProfilesToBackend = (selectedIds: string[], regionsList?: SketchRegion[]) => {
        const regions = regionsList || availableRegions();
        // console.log("syncProfilesToBackend called with selectedIds:", selectedIds);

        if (!regions || regions.length === 0) {
            props.onUpdate(props.featureId, { profiles: { List: [] }, profile_regions: { ProfileRegions: [] } });
            return;
        }

        // Get the selected regions
        const selectedRegionObjects = regions.filter(r => selectedIds.includes(r.id));

        // Extract entity IDs for backwards compatibility
        const entityIds = selectedRegionObjects.flatMap(r => r.boundary_entity_ids);

        // Deduplicate entity IDs (regions may share boundary entities)
        const uniqueEntityIds = [...new Set(entityIds)];

        // Collect boundary points for region-based extrusion (critical for intersection regions)
        // Structure: Profile[] -> Loop[] -> Point[]
        const boundaryPoints = selectedRegionObjects.map(r => {
            const loops = [r.boundary_points, ...(r.voids || [])];
            console.log(`Syncing Region ${r.id}: ${loops.length} loops (1 outer + ${loops.length - 1} voids)`);
            return loops;
        });
        // console.log("Syncing profiles:", uniqueEntityIds.length, "entities, regions:", boundaryPoints.length);

        props.onUpdate(props.featureId, {
            profiles: { List: uniqueEntityIds },
            profile_regions: { ProfileRegions: boundaryPoints }
        });
    };

    // Helper to determine initial selection from saved params vs default (all)
    const getInitialSelection = (regions: SketchRegion[], source: string): string[] => {
        const params = props.initialParams;
        console.log(`getInitialSelection (${source}): Checking against ${regions.length} available regions`);

        let candidates = regions;
        const savedEntityIds = (params['profiles'] && 'List' in params['profiles'])
            ? (params['profiles'] as any).List as string[]
            : [];

        // Step 1: Narrow down candidates using Entity IDs (if available)
        // This helps restrict the search space, especially for the fallback cases.
        if (savedEntityIds.length > 0) {
            const idMatched = regions.filter(r =>
                r.boundary_entity_ids.length > 0 &&
                r.boundary_entity_ids.every(eId => savedEntityIds.includes(eId))
            );

            if (idMatched.length > 0) {
                // console.log(`  Filtered to ${idMatched.length} candidates using Entity IDs`);
                candidates = idMatched;
            } else {
                console.warn(`  Entity ID match returned 0 candidates. Checking all regions (Geom Fallback).`);
            }
        }

        // Step 2: Use Geometry to find the specific regions (Disambiguation)
        if (params['profile_regions'] && 'ProfileRegions' in params['profile_regions']) {
            const rawData = (params['profile_regions'] as any).ProfileRegions;

            // Normalize to [Outer, ...Voids][] structure
            // Check for legacy format (Vec<Vec<Point>>) vs new format (Vec<Vec<Vec<Point>>>)
            // If new format, rawData[0][0][0] is number? No, rawData[0][0][0] is number (x) in old format.
            // Old: Region[0] -> Point[0] -> x (number)
            // New: Profile[0] -> Loop[0] -> Point[0] -> x (number)
            // So if rawData[0][0][0] is a number, it's OLD format?
            // Wait: 
            // Old: `[[[x,y],...], ...]` -> `List of Loop`. `Loop` = `List of Point`. `Point` = `[x,y]`.
            // rawData[0] = Loop. rawData[0][0] = Point. rawData[0][0][0] = number.

            // New: `[[[[x,y],...],...], ...]` -> `List of Profile`. `Profile` = `List of Loop`.
            // rawData[0] = Profile. rawData[0][0] = Loop. rawData[0][0][0] = Point. rawData[0][0][0][0] = number.

            // So check depth.
            let savedLoops: [number, number][][] = [];

            if (rawData.length > 0) {
                // Check if rawData[0][0][0] is a number
                const isOldFormat = typeof rawData[0][0][0] === 'number';
                if (isOldFormat) {
                    savedLoops = rawData as [number, number][][];
                } else {
                    // New format: extract OUTER loops from profiles
                    const profiles = rawData as [number, number][][][];
                    savedLoops = profiles.map(p => p.length > 0 ? p[0] : []).filter(l => l.length > 0);
                }
            } else {
                // Empty array
                savedLoops = [];
            }

            if (savedLoops.length > 0) {
                // console.log(`  Attempting geometry match with ${savedLoops.length} saved loops against ${candidates.length} candidates`);
                const matchedIds = new Set<string>();

                // For each saved loop, find the CLOSEST matching candidate
                for (let i = 0; i < savedLoops.length; i++) {
                    const loop = savedLoops[i];
                    if (loop.length < 3) continue;

                    // Compute polygon centroid/area for the saved loop (Shoelace Formula)
                    let signedArea = 0;
                    let cx = 0, cy = 0;

                    for (let k = 0; k < loop.length; k++) {
                        const p0 = loop[k];
                        const p1 = loop[(k + 1) % loop.length];
                        const cross = p0[0] * p1[1] - p1[0] * p1[1];

                        signedArea += cross;
                        cx += (p0[0] + p1[0]) * cross;
                        cy += (p0[1] + p1[1]) * cross;
                    }

                    signedArea /= 2;
                    if (Math.abs(signedArea) > 1e-6) {
                        cx /= (6 * signedArea);
                        cy /= (6 * signedArea);
                    } else {
                        cx = loop.reduce((s, p) => s + p[0], 0) / loop.length;
                        cy = loop.reduce((s, p) => s + p[1], 0) / loop.length;
                    }

                    const targetArea = Math.abs(signedArea);
                    // console.log(`    Target: Area=${targetArea.toFixed(2)} C=(${cx.toFixed(2)},${cy.toFixed(2)})`);

                    // Find "Best Match" among candidates
                    let bestMatch: SketchRegion | null = null;
                    let bestScore = Infinity;

                    for (const r of candidates) {
                        const dArea = Math.abs(r.area - targetArea);
                        const dCentroid = Math.sqrt(Math.pow(r.centroid[0] - cx, 2) + Math.pow(r.centroid[1] - cy, 2));
                        // Normalize scores roughly
                        const score = dArea + dCentroid * 10;

                        if (score < bestScore) {
                            bestScore = score;
                            bestMatch = r;
                        }
                    }

                    // We take the best match if it's somewhat reasonable, or significantly better than others
                    // With a generous threshold because "Correct Candidate" should be much closer than "Wrong Candidate"
                    if (bestMatch && bestScore < 100.0) {
                        matchedIds.add(bestMatch.id);
                    } else {
                        console.warn(`    -> NO MATCH found for Loop ${i}. Best Score: ${bestScore.toFixed(4)}`);
                    }
                }

                if (matchedIds.size > 0) {
                    return Array.from(matchedIds);
                }

                // MATCH FAILURE CASE
                // If we have saved loops but matched NOTHING, returning [] triggers "Select All" in backend.
                // This is bad. But usually happens if data is corrupted.
                console.error("Geometry Match returned 0 selections.");
                return [];

            } else if (params['profile_regions'].ProfileRegions.length === 0) {
                // Explicit empty selection
                return [];
            }
        }

        // Step 3: Legacy Fallback (No Geometry Data)
        // If we filtered candidates by ID and have no geometry, select all those candidates.
        // For Lens case (Circle A + Circle B), this selects Left+Lens+Right.
        // This is the best we can do without geometry.
        if (savedEntityIds.length > 0 && candidates.length > 0) {
            console.log("Legacy fallback: Selecting all ID-matched candidates");
            return candidates.map(r => r.id);
        }

        // Default: Select All
        console.log("No saved profiles, defaulting to Select All");
        return regions.map(r => r.id);
    };

    // Initialize from props and request backend regions
    onMount(() => {
        const params = props.initialParams;
        if (params['distance'] && typeof params['distance'] === 'object' && 'Float' in params['distance']) {
            setDistanceExpr(String((params['distance'] as any).Float));
        }
        if (params['operation'] && typeof params['operation'] === 'object' && 'String' in params['operation']) {
            setOperation((params['operation'] as any).String);
        }

        // Request backend region computation for proper intersection detection
        const skId = sketchId();
        if (skId && props.onRequestRegions) {
            props.onRequestRegions(skId);
        }

        // Fallback initialization if backend is slow
        setTimeout(() => {
            if (initSource() === 'none') {
                const regions = availableRegions();
                if (regions.length > 0) {
                    console.log("Frontend Fallback Initialization triggered");
                    const initialSelection = getInitialSelection(regions, "fallback");
                    setSelectedRegions(initialSelection);
                    // Do NOT sync back to backend on fallback init, as it might overwrite good data with bad fallback data
                    // syncProfilesToBackend(initialSelection, regions); 
                    setInitSource('fallback');
                }
            }
        }, 500); // Give backend time to respond
    });

    // When backend regions arrive, do initial selection (overriding fallback)
    createEffect(() => {
        const regions = props.backendRegions;
        const currentSource = initSource();

        // We initialize if we haven't yet, OR if we only did fallback and now have real data
        if (regions && regions.length > 0 && currentSource !== 'backend') {
            console.log("Backend regions arrived, upgrading initialization from", currentSource);

            // Restore selection or default to all
            const initialSelection = getInitialSelection(regions, "backend");
            console.log("Backend regions arrived, setting selection:", initialSelection);

            setSelectedRegions(initialSelection);
            // NOW we can sync, because we have the authoritative backend regions
            syncProfilesToBackend(initialSelection, regions);

            setInitSource('backend');
        }
    });

    // Handle viewport region clicks
    createEffect(() => {
        const clickPoint = props.regionClickPoint;
        if (!clickPoint) return;

        const regions = availableRegions();
        console.log("Viewport click - availableRegions IDs:", regions.map(r => r.id));
        if (regions.length === 0) return;

        // Find ALL regions containing the click point
        const containingRegions = regions.filter(r => pointInRegion(clickPoint, r));
        console.log("Containing regions:", containingRegions.length, "IDs:", containingRegions.map(r => r.id));

        if (containingRegions.length > 0) {
            // Pick the SMALLEST region (most specific - the actual intersection, not the full circles)
            const targetRegion = containingRegions.reduce((smallest, r) =>
                r.area < smallest.area ? r : smallest
            );
            console.log("Target region:", targetRegion.id, "area:", targetRegion.area);

            // Toggle only this specific region
            const current = selectedRegions();
            let newSelection: string[];
            if (current.includes(targetRegion.id)) {
                newSelection = current.filter(id => id !== targetRegion.id);
            } else {
                newSelection = [...current, targetRegion.id];
            }
            console.log("New selection:", newSelection);
            setSelectedRegions(newSelection);
            syncProfilesToBackend(newSelection, regions); // Pass regions directly!
        }

        // Consume the click
        props.onConsumeRegionClick?.();
    });

    const updateParam = (key: string, value: ParameterValue) => {
        props.onUpdate(props.featureId, { [key]: value });
    };

    const handleDistanceChange = (expr: string) => {
        setDistanceExpr(expr);
        const variables = props.graph?.variables || { variables: {}, order: [] };
        const val = parseValueOrExpression(expr, variables);
        if (val !== null) {
            updateParam('distance', { Float: val });
        }
    };

    const handleOperationChange = (val: string) => {
        setOperation(val);
        updateParam('operation', { String: val });
    };

    const toggleRegion = (regionId: string) => {
        const current = selectedRegions();
        let newSelection: string[];
        if (current.includes(regionId)) {
            newSelection = current.filter(id => id !== regionId);
        } else {
            newSelection = [...current, regionId];
        }
        setSelectedRegions(newSelection);
        syncProfilesToBackend(newSelection);
    };

    const selectAllRegions = () => {
        const allIds = availableRegions().map(r => r.id);
        setSelectedRegions(allIds);
        syncProfilesToBackend(allIds);
    };

    const clearAllRegions = () => {
        setSelectedRegions([]);
        syncProfilesToBackend([]);
    };

    const toggleFlipExtrude = () => {
        const newFlip = !flipExtrude();
        setFlipExtrude(newFlip);
        updateParam('flip_direction', { Bool: newFlip });
    };

    return (
        <BaseModal
            title="Extrude"
            isOpen={true}
            onCancel={props.onClose}
            onConfirm={props.onClose}
            confirmLabel="Finish"
        >
            <div class="flex flex-col gap-3">

                {/* Profiles/Regions Selection */}
                <div class="flex flex-col gap-1">
                    <div class="flex justify-between items-center">
                        <label class="text-xs text-gray-400 uppercase font-bold">Faces and sketch regions to extrude</label>
                        <div class="flex gap-2">
                            <button
                                onClick={selectAllRegions}
                                class="text-[10px] text-green-400 hover:text-green-300"
                                title="Select all profiles"
                            >
                                All
                            </button>
                            <button
                                onClick={clearAllRegions}
                                class="text-[10px] text-red-400 hover:text-red-300"
                                title="Clear selection"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    <div
                        class="rounded border border-gray-600 overflow-hidden"
                        style={{ "max-height": "140px", display: "flex", "flex-direction": "column" }}
                    >
                        {/* Header bar */}
                        <div
                            class="px-3 py-1.5 text-xs font-medium"
                            style={{
                                background: "linear-gradient(to bottom, #4a9eff, #3a8eef)",
                                color: "white",
                                "border-bottom": "1px solid #2a7edf",
                                "flex-shrink": 0
                            }}
                        >
                            {selectedRegions().length} profile{selectedRegions().length !== 1 ? 's' : ''} selected
                        </div>
                        {/* Scrollable list container */}
                        <div
                            class="overflow-y-auto"
                            style={{
                                background: "#e8f4ff",
                                "flex-grow": 1,
                                "min-height": "32px"
                            }}
                        >
                            {selectedRegions().length === 0 ? (
                                <div
                                    class="px-3 py-2 text-xs italic"
                                    style={{ color: "#666" }}
                                >
                                    Click profiles in viewport to add
                                </div>
                            ) : (
                                <div class="flex flex-col">
                                    {availableRegions()
                                        .filter(region => selectedRegions().includes(region.id))
                                        .map((region) => (
                                            <div
                                                class="flex items-center justify-between px-3 py-1.5 hover:bg-blue-100"
                                                style={{
                                                    "border-bottom": "1px solid #d0e8ff",
                                                    color: "#1a1a1a"
                                                }}
                                            >
                                                <span class="text-xs">
                                                    Profile ({region.area.toFixed(1)} mm²)
                                                </span>
                                                <button
                                                    onClick={() => toggleRegion(region.id)}
                                                    class="ml-2 text-gray-500 hover:text-red-500 transition-colors"
                                                    style={{
                                                        "font-size": "16px",
                                                        "line-height": "1",
                                                        padding: "0 4px"
                                                    }}
                                                    title="Remove from selection"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                    <div class="text-[10px] text-gray-500 italic">
                        Click profiles in viewport to add • Click × to remove
                    </div>
                </div>

                <div class="h-px bg-gray-700 w-full"></div>

                {/* Operation */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">Operation</label>
                    <select
                        value={operation()}
                        onInput={(e) => handleOperationChange(e.currentTarget.value)}
                        class="bg-gray-700 text-white p-1 rounded text-sm border border-gray-600 outline-none focus:border-blue-500"
                    >
                        <option value="Add">Add / New</option>
                        <option value="Cut">Cut / Remove</option>
                        <option value="Intersect">Intersect</option>
                    </select>
                </div>

                {/* Direction / Extent */}
                <div class="flex flex-col gap-1">
                    <label class="text-xs text-gray-400 uppercase font-bold">End Condition</label>
                    <div class="flex gap-2 items-center">
                        <span class="text-xs">Blind</span>
                        <button
                            onClick={toggleFlipExtrude}
                            class={`ml-auto p-1 px-2 rounded text-xs border ${flipExtrude() ? 'bg-blue-600 border-blue-500' : 'bg-gray-700 border-gray-600'}`}
                        >
                            {flipExtrude() ? 'Reverse' : 'Normal'} ↗
                        </button>
                    </div>

                    <div class="flex gap-2 items-center mt-1">
                        <span class="text-xs text-gray-400 w-12">Depth:</span>
                        <NumericInput
                            value={distanceExpr()}
                            onChange={handleDistanceChange}
                            onEvaluate={(expr) => parseValueOrExpression(expr, props.graph?.variables || { variables: {}, order: [] })}
                            variables={props.graph?.variables || { variables: {}, order: [] }}
                            unit="mm"
                            step={1}
                            min={0.01}
                            placeholder="10 or @depth"
                        />
                    </div>
                </div>

            </div>
        </BaseModal>
    );
};

export default ExtrudeModal;
