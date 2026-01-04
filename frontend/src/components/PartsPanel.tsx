import { type Component, For, Show, createSignal } from 'solid-js';
import { type FeatureGraphState, type Feature } from '../types';
import './PartsPanel.css';

interface PartBody {
    id: string;
    name: string;
    featureType: string;
    isConsumed: boolean;
    isToolBody: boolean;
    isModifiedByBoolean: boolean; // Target body that was modified by a Boolean
    visible: boolean;
    // For visibility toggling, we may need to track the actual tessellation feature
    // For target bodies modified by Boolean, the tessellation comes from the Boolean feature
    tessellationFeatureId: string;
}

interface PartsPanelProps {
    graph: FeatureGraphState;
    hiddenBodies?: Set<string>;
    onToggleVisibility?: (id: string) => void;
    onSelect?: (id: string) => void;
    selectedId?: string | null;
}

const PartsPanel: Component<PartsPanelProps> = (props) => {
    const [expanded, setExpanded] = createSignal(true);

    // Extract all bodies from the feature graph
    // Key insight: Boolean operations MODIFY the target body, they don't create new bodies
    // - Target body (e.g., Extrude 1) = now represents the Boolean result
    // - Tool body (e.g., Extrude 2) = consumed, optionally visible
    // - Boolean feature = NOT shown as a separate body
    const getBodies = (): PartBody[] => {
        const bodies: PartBody[] = [];
        const toolBodies = new Set<string>();
        const targetBodies = new Map<string, string>(); // target_id -> boolean_id

        // First pass: identify target and tool bodies from Boolean features
        for (const id of props.graph.sort_order) {
            const feature = props.graph.nodes[id];
            if (!feature || feature.suppressed) continue;

            if (feature.feature_type === 'Boolean') {
                const params = feature.parameters || {};

                // Check if keep_tool_body is set (default false = tool is consumed)
                const keepToolParam = params.keep_tool_body;
                const keepToolBody = keepToolParam && typeof keepToolParam === 'object' && 'Bool' in keepToolParam
                    ? (keepToolParam as any).Bool
                    : false;

                // Extract target feature reference - this body will be "modified"
                // The parameter is 'target_feature', wrapped in { String: "..." }
                const targetParam = params.target_feature || params.target_body;
                if (targetParam) {
                    // Unwrap the String wrapper if present
                    const rawRef = targetParam.Reference || targetParam;
                    const ref = typeof rawRef === 'object' && rawRef.String ? rawRef.String : rawRef;
                    if (typeof ref === 'string') {
                        targetBodies.set(ref, id); // Map target to the Boolean that modifies it
                    }
                }

                // Extract tool feature reference
                // Only mark as consumed (toolBodies) if keep_tool_body is false
                const toolParam = params.tool_feature || params.tool_body;
                if (toolParam && !keepToolBody) {
                    // Unwrap the String wrapper if present
                    const rawRef = toolParam.Reference || toolParam;
                    const ref = typeof rawRef === 'object' && rawRef.String ? rawRef.String : rawRef;
                    if (typeof ref === 'string') {
                        toolBodies.add(ref);
                    }
                }
            }
        }

        // Second pass: collect bodies
        // - Skip Boolean features (they modify target, don't create bodies)
        // - Mark target bodies as "modified by Boolean"
        // - Mark tool bodies as "tool body"
        for (const id of props.graph.sort_order) {
            const feature = props.graph.nodes[id];
            if (!feature || feature.suppressed) continue;

            // Skip Boolean - it modifies target body, not a separate body
            if (feature.feature_type === 'Boolean') {
                continue;
            }

            // Start LinearPattern consumption logic
            if (feature.feature_type === 'LinearPattern' || feature.feature_type === 'CircularPattern') {
                const deps = feature.dependencies || [];
                deps.forEach(depId => toolBodies.add(depId));
            }

            // Check if this feature produces a solid body
            const producesSolid = ['Extrude', 'Revolve', 'LinearPattern', 'CircularPattern'].includes(feature.feature_type);

            if (producesSolid) {
                const isToolBody = toolBodies.has(id);
                // LinearPattern/CircularPattern specific logic: Expand to multiple parts if count > 1
                if ((feature.feature_type === 'LinearPattern' || feature.feature_type === 'CircularPattern') && !isToolBody) {
                    const params = feature.parameters || {};
                    let count = 1;
                    // Extract count
                    if (params.count) {
                        count = typeof params.count === 'object' && 'Float' in params.count
                            ? params.count.Float
                            : Number(params.count);
                    }

                    // If count is invalid or < 1, default to 1
                    if (!count || count < 1) count = 1;

                    for (let i = 0; i < count; i++) {
                        bodies.push({
                            id: `${id}_${i}`, // Virtual ID for the part
                            name: `${feature.name} (Part ${i + 1})`,
                            featureType: feature.feature_type,
                            isConsumed: false,
                            isToolBody: false,
                            isModifiedByBoolean: false,
                            visible: !props.hiddenBodies?.has(id), // Tied to feature visibility
                            tessellationFeatureId: id, // All share the same tessellation
                        });
                    }
                } else {
                    // Standard single-body feature (Extrude, Revolve, or consumed Pattern)
                    const booleanId = targetBodies.get(id);
                    const isModifiedByBoolean = !!booleanId;
                    const tessellationFeatureId = isModifiedByBoolean ? booleanId! : id;

                    bodies.push({
                        id,
                        name: feature.name,
                        featureType: feature.feature_type,
                        isConsumed: isToolBody,
                        isToolBody,
                        isModifiedByBoolean,
                        visible: !props.hiddenBodies?.has(tessellationFeatureId),
                        tessellationFeatureId,
                    });
                }
            }
        }

        return bodies;
    };

    const bodies = () => getBodies();
    const bodyCount = () => bodies().length;

    const getBodyIcon = (body: PartBody): string => {
        if (body.isToolBody) return '🔧';
        if (body.isModifiedByBoolean) return '🔗'; // Modified by boolean
        return '🧊';
    };

    const getBodyClass = (body: PartBody): string => {
        let cls = 'part-item';
        if (body.isConsumed) cls += ' consumed';
        if (body.isToolBody) cls += ' tool-body';
        if (!body.visible) cls += ' hidden-body';
        if (props.selectedId === body.id) cls += ' selected';
        return cls;
    };

    return (
        <div class="parts-panel">
            <div
                class="parts-header"
                onClick={() => setExpanded(!expanded())}
            >
                <span class="parts-title">Parts</span>
                <Show when={bodyCount() > 0}>
                    <span class="parts-count">({bodyCount()})</span>
                </Show>
                <span class="parts-expander">
                    {expanded() ? '▼' : '▶'}
                </span>
            </div>
            <Show when={expanded()}>
                <div class="parts-list">
                    <Show when={bodyCount() === 0}>
                        <div class="parts-empty">No solid bodies</div>
                    </Show>
                    <For each={bodies()}>
                        {(body) => (
                            <div
                                class={getBodyClass(body)}
                                onClick={() => props.onSelect?.(body.id)}
                                title={body.isToolBody
                                    ? `Tool body (consumed by Boolean)`
                                    : body.isModifiedByBoolean
                                        ? `Modified by Boolean operation`
                                        : `Click to select ${body.name}`}
                            >
                                <span class="part-icon">{getBodyIcon(body)}</span>
                                <span class="part-name">{body.name}</span>
                                <Show when={body.isToolBody}>
                                    <span class="part-badge tool">tool</span>
                                </Show>
                                <Show when={body.isModifiedByBoolean && !body.isToolBody}>
                                    <span class="part-badge modified">modified</span>
                                </Show>
                                <span
                                    class={`part-visibility ${!body.visible ? 'hidden' : ''}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        console.log('[PartsPanel] Visibility toggle for:', body.tessellationFeatureId, body.name);
                                        if (props.onToggleVisibility) {
                                            // Use tessellationFeatureId for visibility toggling
                                            // This is the feature that actually produces the tessellation
                                            props.onToggleVisibility(body.tessellationFeatureId);
                                        } else {
                                            console.warn('[PartsPanel] onToggleVisibility not defined');
                                        }
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    title={body.visible ? "Hide body" : "Show body"}
                                >
                                    {body.visible ? '👁️' : '👁️‍🗨️'}
                                </span>
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
};

export default PartsPanel;
