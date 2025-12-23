import { type Component } from "solid-js";
import { type SketchToolType } from "../types";

interface SketchToolbarProps {
    onToolSelect: (tool: SketchToolType) => void;
    activeTool: SketchToolType;
    onFinishSketch: () => void;
    onCancelSketch: () => void;
    onDeleteSketch: () => void;
    constructionMode: boolean;
    onToggleConstruction: () => void;
}

const SketchToolbar: Component<SketchToolbarProps> = (props) => {
    const buttonStyle = (isActive: boolean, isConstraint: boolean = false) => ({
        background: isActive ? "#007bff" : (isConstraint ? "#5a5a5a" : "#666"),
        color: "white",
        border: isConstraint ? "1px solid #888" : "none",
        padding: "5px 10px",
        "border-radius": "4px",
        cursor: "pointer",
        "font-size": "12px",
    });

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
            <button onClick={() => props.onToolSelect("select")} style={buttonStyle(props.activeTool === "select")}>
                Select
            </button>
            <button onClick={() => props.onToolSelect("line")} style={buttonStyle(props.activeTool === "line")}>
                Line
            </button>
            <button onClick={() => props.onToolSelect("circle")} style={buttonStyle(props.activeTool === "circle")}>
                Circle
            </button>
            <button onClick={() => props.onToolSelect("ellipse")} style={buttonStyle(props.activeTool === "ellipse")} title="Ellipse (E)">
                Ellipse
            </button>
            <button onClick={() => props.onToolSelect("arc")} style={buttonStyle(props.activeTool === "arc")}>
                Arc
            </button>
            <button onClick={() => props.onToolSelect("rectangle")} style={buttonStyle(props.activeTool === "rectangle")}>
                Rect
            </button>
            <button onClick={() => props.onToolSelect("slot")} style={buttonStyle(props.activeTool === "slot")}>
                Slot
            </button>
            <button onClick={() => props.onToolSelect("polygon")} style={buttonStyle(props.activeTool === "polygon")}>
                Poly
            </button>
            <button onClick={() => props.onToolSelect("point")} style={buttonStyle(props.activeTool === "point")}>
                Point
            </button>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Editing Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Edit:</span>
            <button
                onClick={() => props.onToolSelect("trim")}
                style={buttonStyle(props.activeTool === "trim")}
                title="Trim - Click on segment to remove"
            >
                ✂ Trim
            </button>
            <button
                onClick={() => props.onToolSelect("mirror")}
                style={buttonStyle(props.activeTool === "mirror")}
                title="Mirror - Reflect entities across a line"
            >
                🪞 Mirror
            </button>
            <button
                onClick={() => props.onToolSelect("offset")}
                style={buttonStyle(props.activeTool === "offset")}
                title="Offset - Create parallel copy at a distance"
            >
                Reference
            </button>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Constraint Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Constraints:</span>
            <button
                onClick={() => props.onToolSelect("constraint_horizontal")}
                style={buttonStyle(props.activeTool === "constraint_horizontal", true)}
                title="Horizontal Constraint - Select a line"
            >
                H
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_vertical")}
                style={buttonStyle(props.activeTool === "constraint_vertical", true)}
                title="Vertical Constraint - Select a line"
            >
                V
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_coincident")}
                style={buttonStyle(props.activeTool === "constraint_coincident", true)}
                title="Coincident Constraint - Select two points"
            >
                C
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_parallel")}
                style={buttonStyle(props.activeTool === "constraint_parallel", true)}
                title="Parallel Constraint - Select two lines"
            >
                ||
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_perpendicular")}
                style={buttonStyle(props.activeTool === "constraint_perpendicular", true)}
                title="Perpendicular Constraint - Select two lines"
            >
                ⊥
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_equal")}
                style={buttonStyle(props.activeTool === "constraint_equal", true)}
                title="Equal Constraint - Select two entities"
            >
                =
            </button>
            <button
                onClick={() => props.onToolSelect("constraint_fix")}
                style={buttonStyle(props.activeTool === "constraint_fix", true)}
                title="Fix/Lock Constraint - Select a point"
            >
                ⚓
            </button>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Dimension Tools */}
            <span style={{ "font-size": "11px", color: "#aaa", "align-self": "center" }}>Dims:</span>
            <button
                onClick={() => props.onToolSelect("dimension")}
                style={buttonStyle(props.activeTool === "dimension", true)}
                title="Dimension - Select entities to dimension"
            >
                📏 Dim
            </button>

            {/* Separator */}
            <div style={{ width: "1px", height: "24px", background: "#888" }} />

            {/* Finish Button */}
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
                    background: "#dc3545", // Red
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
                onClick={props.onDeleteSketch} // Needs to be added to props interface!
                style={{
                    background: "#8b0000", // Dark Red
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
