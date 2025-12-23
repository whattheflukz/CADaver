import { type Component } from "solid-js";
import { type SketchPlane } from "../types";

interface PlaneSelectionOverlayProps {
    onSelectPlane: (plane: SketchPlane) => void;
    onCancel: () => void;
}

const PlaneSelectionOverlay: Component<PlaneSelectionOverlayProps> = (props) => {
    const planes = [
        {
            name: "XY Plane (Top)",
            plane: {
                origin: [0, 0, 0],
                normal: [0, 0, 1],
                x_axis: [1, 0, 0],
                y_axis: [0, 1, 0]
            } as SketchPlane
        },
        {
            name: "XZ Plane (Front)",
            plane: {
                origin: [0, 0, 0],
                normal: [0, 1, 0],
                x_axis: [1, 0, 0],
                y_axis: [0, 0, -1]
            } as SketchPlane
        },
        {
            name: "YZ Plane (Right)",
            plane: {
                origin: [0, 0, 0],
                normal: [1, 0, 0],
                x_axis: [0, 1, 0], // Y -> X
                y_axis: [0, 0, 1]  // Z -> Y
            } as SketchPlane
        }
    ];

    return (
        <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            "justify-content": "center",
            "align-items": "center",
            "z-index": 2000
        }}>
            <div style={{
                background: "#333",
                padding: "20px",
                "border-radius": "8px",
                "box-shadow": "0 4px 6px rgba(0,0,0,0.3)",
                color: "white",
                "text-align": "center",
                "border": "1px solid #444"
            }}>
                <h2 style={{ "margin-top": 0 }}>Select Sketch Plane</h2>
                <p style={{ color: "#aaa", "margin-bottom": "20px" }}>
                    Select a default plane or click a face in the viewport.
                </p>

                <div style={{ display: "flex", gap: "10px", "margin-bottom": "20px", "justify-content": "center" }}>
                    {planes.map(p => (
                        <button
                            onClick={() => props.onSelectPlane(p.plane)}
                            style={{
                                padding: "10px 20px",
                                background: "#007bff",
                                color: "white",
                                border: "none",
                                "border-radius": "4px",
                                cursor: "pointer",
                                "font-weight": "bold"
                            }}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>

                <button
                    onClick={props.onCancel}
                    style={{
                        padding: "8px 16px",
                        background: "transparent",
                        color: "#aaa",
                        border: "1px solid #666",
                        "border-radius": "4px",
                        cursor: "pointer"
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default PlaneSelectionOverlay;
