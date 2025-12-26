import { createSignal, onMount, onCleanup, type Accessor } from 'solid-js';
import { type FeatureGraphState, type Tessellation, type SolveResult, type Sketch, type KernelError } from '../types';

export interface SelectionGroup {
    name: string;
    count: number;
}

interface MicrocadConnectionProps {
    onAutoStartSketch: (id: string) => void;
    onSketchSolved: (id: string, sketch: Sketch) => void;
    autostartNextSketch: Accessor<boolean>;
    setAutostartNextSketch: (val: boolean) => void;
}

export function useMicrocadConnection(props: MicrocadConnectionProps) {
    const [status, setStatus] = createSignal("Disconnected");
    const [graph, setGraph] = createSignal<FeatureGraphState>({ nodes: {}, sort_order: [] });
    const [lastTessellation, setTessellation] = createSignal<Tessellation | null>(null);
    const [selection, setSelection] = createSignal<any[]>([]); // Array of TopoIds
    const [zombies, setZombies] = createSignal<any[]>([]);
    const [solveResult, setSolveResult] = createSignal<SolveResult | null>(null);
    const [backendRegions, setBackendRegions] = createSignal<any[] | null>(null);
    const [selectionGroups, setSelectionGroups] = createSignal<SelectionGroup[]>([]);
    const [kernelErrors, setKernelErrors] = createSignal<KernelError[]>([]);
    const MAX_ERRORS = 5; // Keep only this many recent errors

    // We can track selectedFeature here or just let App handle it via effect on graph?
    // The original code set selectedFeature logic inside onmessage.
    // We'll expose a signal for "feature that requested selection" or just handle it here if we move selectedFeature here.
    // But selectedFeature is used in ModelingToolbar etc. Let's keep it simple and expose it?
    // Actually the logic was: if new node && autostart -> auto select & auto start.
    // The auto-select NEW feature seems generic.
    const [selectedFeature, setSelectedFeature] = createSignal<string | null>(null);

    let socket: WebSocket | null = null;

    onMount(() => {
        socket = new WebSocket("ws://localhost:3000/ws");

        socket.onopen = () => {
            setStatus("Connected");
            console.log("WebSocket Connected");
        };

        socket.onmessage = (event) => {
            const msg = event.data;
            if (typeof msg === 'string') {
                if (msg.startsWith("GRAPH_UPDATE:")) {
                    try {
                        const json = msg.substring("GRAPH_UPDATE:".length);
                        const data = JSON.parse(json);

                        // Auto-select new feature logic
                        const oldKeys = Object.keys(graph().nodes);
                        const newKeys = Object.keys(data.nodes);

                        console.log("Graph Update. Nodes:", Object.keys(data.nodes).length, "Sort:", data.sort_order.length);
                        setGraph(data);

                        if (newKeys.length === oldKeys.length + 1) {
                            const newId = newKeys.find(k => !oldKeys.includes(k));
                            if (newId) {
                                const feature = data.nodes[newId];
                                if (feature.feature_type === "Sketch") {
                                    console.log("Auto-selecting new sketch:", newId);
                                    setSelectedFeature(newId);

                                    if (props.autostartNextSketch()) {
                                        console.log("Auto-starting new sketch:", newId);
                                        setTimeout(() => props.onAutoStartSketch(newId), 0);
                                        props.setAutostartNextSketch(false);
                                    }
                                }
                            }
                        }

                        // Sync solved sketch - implementation relies on App passing the callback which checks activeSketchId
                        // We just notify "Graph Updated" effectively, or parse and notify.
                        // But we need to extract the sketch from the graph node to notify.
                        // Since we don't know activeSketchId here easily without more props, we can scan or just pass the whole graph?
                        // Actually the prompt logic was specific: check activeSketchId.
                        // Let's defer to the callback by passing the whole data or checking all sketches?
                        // Better: Iterate all nodes? No.
                        // The original logic checked `activeSketchId`.
                        // We can just trigger an effect in App?
                        // "onSketchSolved" Logic:
                        // "if (activeFeature && activeFeature.parameters?.sketch_data?.Sketch)"
                        // This needs to happen for the active sketch.
                        // Let's pass the responsibility to `props.onSketchSolved`.
                        // But we need to pass the DATA.
                        // So we can say: props.onSketchSolved(data) ? No, that's heavy.
                        // How about we just expose `graph` signal, and App uses createEffect(() => graph()) to sync?
                        // That is the "Solid" way.
                        // The constraint: "Sync currentSketch when in sketch mode and receiving solved geometry"
                        // If we depend on `graph()` in App, we can react to it.
                        // The only reason it was in `onmessage` was probably convenience/imperative style.

                    } catch (e) {
                        console.error("Failed to parse graph update", e);
                    }
                } else if (msg.startsWith("RENDER_UPDATE:")) {
                    try {
                        const json = msg.substring("RENDER_UPDATE:".length);
                        const data = JSON.parse(json);
                        console.log("Got tessellation:", data);
                        setTessellation(data);
                    } catch (e) {
                        console.error("Failed to parse render update", e);
                    }
                } else if (msg.startsWith("SELECTION_UPDATE:")) {
                    try {
                        const json = msg.substring("SELECTION_UPDATE:".length);
                        const data = JSON.parse(json);
                        console.log("Got selection update:", data);
                        setSelection(data);
                    } catch (e) {
                        console.error("Failed to parse selection update", e);
                    }
                } else if (msg.startsWith("ZOMBIE_UPDATE:")) {
                    try {
                        const json = msg.substring("ZOMBIE_UPDATE:".length);
                        const data = JSON.parse(json);
                        console.warn("Got zombie update:", data);
                        setZombies(data);
                    } catch (e) {
                        console.error("Failed to parse zombie update", e);
                    }
                } else if (msg.startsWith("SKETCH_STATUS:")) {
                    try {
                        const json = msg.substring("SKETCH_STATUS:".length);
                        const data = JSON.parse(json) as SolveResult;
                        console.log("Got solve status: DOF=", data.dof, "converged=", data.converged);
                        setSolveResult(data);
                    } catch (e) {
                        console.error("Failed to parse sketch status", e);
                    }
                } else if (msg.startsWith("REGIONS_UPDATE:")) {
                    try {
                        const json = msg.substring("REGIONS_UPDATE:".length);
                        const data = JSON.parse(json);
                        console.log("Got backend regions:", data.length, "regions");
                        console.log("First backend region:", JSON.stringify(data[0]));
                        setBackendRegions(data);
                    } catch (e) {
                        console.error("Failed to parse regions update", e);
                    }
                } else if (msg.startsWith("SELECTION_GROUPS_UPDATE:")) {
                    try {
                        const json = msg.substring("SELECTION_GROUPS_UPDATE:".length);
                        const data: [string, number][] = JSON.parse(json);
                        // Convert from [name, count][] to SelectionGroup[]
                        const groups: SelectionGroup[] = data.map(([name, count]) => ({ name, count }));
                        console.log("Got selection groups update:", groups.length, "groups");
                        setSelectionGroups(groups);
                    } catch (e) {
                        console.error("Failed to parse selection groups update", e);
                    }
                } else if (msg.startsWith("ERROR_UPDATE:")) {
                    try {
                        const json = msg.substring("ERROR_UPDATE:".length);
                        const data = JSON.parse(json);
                        const error: KernelError = {
                            code: data.code || 'UNKNOWN',
                            message: data.message || 'Unknown error',
                            severity: data.severity || 'error',
                            context: data.context,
                            timestamp: Date.now()
                        };
                        console.error("Kernel error:", error);
                        // Add to errors list, keeping only MAX_ERRORS most recent
                        setKernelErrors(prev => [...prev, error].slice(-MAX_ERRORS));
                    } catch (e) {
                        console.error("Failed to parse error update", e);
                    }
                } else {
                    console.log("Msg:", msg);
                }
            }
        };

        socket.onclose = () => {
            setStatus("Disconnected");
        };

        socket.onerror = (error) => {
            console.error("WebSocket Error:", error);
            setStatus("Error");
        };
    });

    onCleanup(() => {
        socket?.close();
    });

    const send = (msg: string) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(msg);
        }
    };

    // Error management functions
    const clearErrors = () => setKernelErrors([]);
    const dismissError = (timestamp: number) => {
        setKernelErrors(prev => prev.filter(e => e.timestamp !== timestamp));
    };

    return {
        status,
        graph,
        lastTessellation,
        selection,
        zombies,
        solveResult,
        selectedFeature,
        setSelectedFeature,
        send,
        setGraph, // Needed if App wants to manually update graph? Probably not.
        setSelection, // App handleSelect clears selection locally? Yes.
        backendRegions,
        setBackendRegions,
        selectionGroups,
        kernelErrors,
        clearErrors,
        dismissError
    };
}
