import { type Component } from "solid-js";
import { type SketchToolType } from "../types";
import ToolButton from "./ToolButton";
import { COMMAND_DEFINITIONS } from "../commandRegistry";

/**
 * SketchToolbar - Toolbar displayed when in Sketch Mode
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Mode-aware toolbar system
 *            plan.md Phase 0 → UI Infrastructure → Hover tooltips with descriptions
 */

interface SketchToolbarProps {
    onToolSelect: (tool: SketchToolType) => void;
    activeTool: SketchToolType;
    onFinishSketch: () => void;
    onCancelSketch: () => void;
    onDeleteSketch: () => void;
    constructionMode: boolean;
    onToggleConstruction: () => void;
}

// Helper to look up command info from registry
const getCommandInfo = (toolId: string) => {
    const cmd = COMMAND_DEFINITIONS.find(c => c.id === `tool:${toolId}`);
    return {
        description: cmd?.description,
        shortcut: cmd?.shortcut
    };
};

const SketchToolbar: Component<SketchToolbarProps> = (props) => {
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
            gap: "6px",
            "z-index": 1000,
            color: "white",
            border: "2px solid #007bff",
            "flex-wrap": "wrap",
            "max-width": "90vw",
            "align-items": "center"
        }}>
            <span style={{ "font-weight": "bold", "align-self": "center" }}>SKETCH MODE</span>

            {/* Construction Mode Toggle */}
            <button
                onClick={props.onToggleConstruction}
                style={{
                    background: props.constructionMode ? "#ffc107" : "#666",
                    color: props.constructionMode ? "black" : "white",
                    border: "none",
                    padding: "5px 10px",
                    "border-radius": "4px",
                    cursor: "pointer",
                    "font-weight": "bold",
                }}
            >
                Const. {props.constructionMode ? "ON" : "OFF"}
            </button>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Geometry Tools */}
            <ToolButton
                label="Select"
                isActive={props.activeTool === "select"}
                onClick={() => props.onToolSelect("select")}
            />
            <ToolButton
                label="Line"
                isActive={props.activeTool === "line"}
                onClick={() => props.onToolSelect("line")}
                {...getCommandInfo("line")}
            />
            <ToolButton
                label="Circle"
                isActive={props.activeTool === "circle"}
                onClick={() => props.onToolSelect("circle")}
                {...getCommandInfo("circle")}
            />
            <ToolButton
                label="Ellipse"
                isActive={props.activeTool === "ellipse"}
                onClick={() => props.onToolSelect("ellipse")}
                {...getCommandInfo("ellipse")}
            />
            <ToolButton
                label="Arc"
                isActive={props.activeTool === "arc"}
                onClick={() => props.onToolSelect("arc")}
                {...getCommandInfo("arc")}
            />
            <ToolButton
                label="Rect"
                isActive={props.activeTool === "rectangle"}
                onClick={() => props.onToolSelect("rectangle")}
                {...getCommandInfo("rectangle")}
            />
            <ToolButton
                label="Slot"
                isActive={props.activeTool === "slot"}
                onClick={() => props.onToolSelect("slot")}
                {...getCommandInfo("slot")}
            />
            <ToolButton
                label="Poly"
                isActive={props.activeTool === "polygon"}
                onClick={() => props.onToolSelect("polygon")}
                {...getCommandInfo("polygon")}
            />
            <ToolButton
                label="Point"
                isActive={props.activeTool === "point"}
                onClick={() => props.onToolSelect("point")}
                {...getCommandInfo("point")}
            />

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Editing Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Edit:</span>
            <ToolButton
                icon="✂"
                label="Trim"
                isActive={props.activeTool === "trim"}
                onClick={() => props.onToolSelect("trim")}
                {...getCommandInfo("trim")}
            />
            <ToolButton
                icon="🪞"
                label="Mirror"
                isActive={props.activeTool === "mirror"}
                onClick={() => props.onToolSelect("mirror")}
                {...getCommandInfo("mirror")}
            />
            <ToolButton
                label="Reference"
                isActive={props.activeTool === "offset"}
                onClick={() => props.onToolSelect("offset")}
                {...getCommandInfo("offset")}
            />
            <ToolButton
                icon="📐"
                label="LinPat"
                isActive={props.activeTool === "linear_pattern"}
                onClick={() => props.onToolSelect("linear_pattern")}
                {...getCommandInfo("linear_pattern")}
            />
            <ToolButton
                icon="🔄"
                label="CircPat"
                isActive={props.activeTool === "circular_pattern"}
                onClick={() => props.onToolSelect("circular_pattern")}
                {...getCommandInfo("circular_pattern")}
            />

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Constraint Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Constraints:</span>
            <ToolButton
                label="H"
                isActive={props.activeTool === "constraint_horizontal"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_horizontal")}
                {...getCommandInfo("constraint_horizontal")}
            />
            <ToolButton
                label="V"
                isActive={props.activeTool === "constraint_vertical"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_vertical")}
                {...getCommandInfo("constraint_vertical")}
            />
            <ToolButton
                label="C"
                isActive={props.activeTool === "constraint_coincident"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_coincident")}
                {...getCommandInfo("constraint_coincident")}
            />
            <ToolButton
                label="||"
                isActive={props.activeTool === "constraint_parallel"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_parallel")}
                {...getCommandInfo("constraint_parallel")}
            />
            <ToolButton
                label="⊥"
                isActive={props.activeTool === "constraint_perpendicular"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_perpendicular")}
                {...getCommandInfo("constraint_perpendicular")}
            />
            <ToolButton
                label="="
                isActive={props.activeTool === "constraint_equal"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_equal")}
                {...getCommandInfo("constraint_equal")}
            />
            <ToolButton
                label="⚓"
                isActive={props.activeTool === "constraint_fix"}
                isConstraint={true}
                onClick={() => props.onToolSelect("constraint_fix")}
                {...getCommandInfo("constraint_fix")}
            />

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Dimension Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Dims:</span>
            <ToolButton
                icon="📏"
                label="Dim"
                isActive={props.activeTool === "dimension"}
                isConstraint={true}
                onClick={() => props.onToolSelect("dimension")}
                {...getCommandInfo("dimension")}
            />

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Action Buttons */}
            <button
                onClick={props.onFinishSketch}
                style={{
                    background: "#28a745",
                    color: "white",
                    border: "none",
                    padding: "5px 10px",
                    "border-radius": "4px",
                    cursor: "pointer",
                }}
            >
                Finish
            </button>
            <button
                onClick={props.onCancelSketch}
                style={{
                    background: "#dc3545",
                    color: "white",
                    border: "none",
                    padding: "5px 10px",
                    "border-radius": "4px",
                    cursor: "pointer",
                    "margin-left": "4px"
                }}
                title="Discard changes and exit"
            >
                Cancel
            </button>
            <button
                onClick={props.onDeleteSketch}
                style={{
                    background: "#8b0000",
                    color: "white",
                    border: "none",
                    padding: "5px 10px",
                    "border-radius": "4px",
                    cursor: "pointer",
                    "margin-left": "4px"
                }}
                title="Delete this sketch entirely"
            >
                Delete
            </button>
        </div>
    );
};

export default SketchToolbar;
