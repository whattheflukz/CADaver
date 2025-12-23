import { type Component } from "solid-js";
import type { SolveResult } from "../types";

interface SketchStatusBarProps {
    solveResult: SolveResult | null;
}

/**
 * Compact status bar showing sketch constraint status
 * - Green: Fully constrained (DOF = 0)
 * - Yellow/Orange: Under-constrained (DOF > 0)  
 * - Red: Over-constrained or solver failure
 */
const SketchStatusBar: Component<SketchStatusBarProps> = (props) => {
    const getStatusColor = () => {
        if (!props.solveResult) return "#666"; // Gray when no data
        const { dof, converged } = props.solveResult;
        if (!converged) return "#ff4444"; // Red for solver failure
        if (dof < 0) return "#ff4444"; // Red for over-constrained
        if (dof === 0) return "#44cc44"; // Green for fully constrained
        return "#ffaa00"; // Orange for under-constrained
    };

    const getStatusText = () => {
        if (!props.solveResult) return "Analyzing...";
        const { dof, converged, status_message } = props.solveResult;
        if (!converged) return `⚠ ${status_message}`;
        if (dof === 0) return "✓ Fully Constrained";
        if (dof > 0) return `${dof} DOF remaining`;
        return `Over-constrained by ${-dof}`;
    };

    const containerStyle = () => ({
        display: "flex",
        "align-items": "center",
        gap: "12px",
        padding: "6px 12px",
        background: "#2a2a2a",
        "border-radius": "4px",
        "font-size": "12px",
        "font-family": "system-ui, -apple-system, sans-serif",
        color: "#ddd",
        "border-left": `4px solid ${getStatusColor()}`,
        "min-width": "200px"
    });

    const statStyle = {
        display: "flex",
        "flex-direction": "column" as const,
        "align-items": "center",
        padding: "0 8px",
        "border-right": "1px solid #444"
    };

    const statValueStyle = {
        "font-weight": "bold",
        "font-size": "14px",
        color: "#fff"
    };

    const statLabelStyle = {
        "font-size": "10px",
        color: "#888",
        "text-transform": "uppercase" as const
    };

    return (
        <div style={containerStyle()}>
            {props.solveResult && (
                <>
                    <div style={statStyle}>
                        <span style={{ ...statValueStyle, color: getStatusColor() }}>
                            {props.solveResult.dof}
                        </span>
                        <span style={statLabelStyle}>DOF</span>
                    </div>
                    <div style={statStyle}>
                        <span style={statValueStyle}>{props.solveResult.entity_count}</span>
                        <span style={statLabelStyle}>Entities</span>
                    </div>
                    <div style={{ ...statStyle, "border-right": "none" }}>
                        <span style={statValueStyle}>{props.solveResult.constraint_count}</span>
                        <span style={statLabelStyle}>Constraints</span>
                    </div>
                </>
            )}
            <div style={{ "flex-grow": "1", "text-align": "right", color: getStatusColor() }}>
                {getStatusText()}
            </div>
        </div>
    );
};

export default SketchStatusBar;
