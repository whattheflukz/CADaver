import type { Component } from 'solid-js';
import ToolButton from './ToolButton';
import { COMMAND_DEFINITIONS } from '../commandRegistry';

/**
 * ModelingToolbar - Toolbar displayed when in 3D Modeling Mode
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Mode-aware toolbar system
 *            plan.md Phase 0 → UI Infrastructure → Hover tooltips with descriptions
 */

interface ModelingToolbarProps {
    onExtrude: () => void;
    onRevolve: () => void;
    onFillet: () => void;
    onChamfer: () => void;
    onPlane?: () => void;
    onPoint?: () => void;
    onBoolean?: () => void;
}

// Helper to look up command info from registry
const getCommandInfo = (actionId: string) => {
    const cmd = COMMAND_DEFINITIONS.find(c => c.id === `action:${actionId}`);
    return {
        description: cmd?.description,
        shortcut: cmd?.shortcut
    };
};

const ModelingToolbar: Component<ModelingToolbarProps> = (props) => {
    return (
        <div style={{
            position: "absolute",
            top: "50px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#444",
            padding: "5px 10px",
            "border-radius": "8px",
            display: "flex",
            gap: "8px",
            "z-index": 1000,
            color: "white",
            border: "1px solid #666",
            "align-items": "center"
        }}>
            {/* Extrude Button */}
            <ToolButton
                icon="⬆️"
                label="Extrude"
                isActive={false}
                onClick={props.onExtrude}
                {...getCommandInfo("extrude")}
                minWidth="60px"
            />

            {/* Placeholder for Revolve */}
            <ToolButton
                icon="🔄"
                label="Revolve"
                isActive={false}
                disabled={true}
                onClick={() => { }}
                description="Coming soon: Revolve sketch around an axis"
                minWidth="60px"
            />

            <div style={{ width: "1px", height: "24px", background: "#666" }} />

            {/* Boolean - single button, operation selected in modal */}
            <ToolButton
                icon="🔗"
                label="Boolean"
                isActive={false}
                onClick={() => props.onBoolean?.()}
                description="Combine, intersect, or subtract bodies"
                minWidth="60px"
            />

            <div style={{ width: "1px", height: "24px", background: "#666" }} />

            {/* Fillet Button */}
            <ToolButton
                icon="⚪"
                label="Fillet"
                isActive={false}
                onClick={props.onFillet}
                description="Round sharp edges"
                minWidth="60px"
            />

            {/* Chamfer Button */}
            <ToolButton
                icon="📐"
                label="Chamfer"
                isActive={false}
                onClick={props.onChamfer}
                description="Bevel sharp edges"
                minWidth="60px"
            />

            <div style={{ width: "1px", height: "24px", background: "#666" }} />

            {/* Plane Button */}
            <ToolButton
                icon="◻️"
                label="Plane"
                isActive={false}
                onClick={() => props.onPlane?.()}
                description="Create a construction plane for sketching"
                minWidth="60px"
            />

            {/* Point Button */}
            <ToolButton
                icon="📍"
                label="Point"
                isActive={false}
                onClick={() => props.onPoint?.()}
                description="Create a reference point"
                minWidth="60px"
            />
        </div>
    );
};

export default ModelingToolbar;

