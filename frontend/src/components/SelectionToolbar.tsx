import { type Component, createSignal } from "solid-js";

interface SelectionToolbarProps {
    onSetFilter: (filter: string) => void;
    activeFilter?: string;
}

const SelectionToolbar: Component<SelectionToolbarProps> = (props) => {
    const filters = ["Any", "Face", "Edge", "Vertex", "Body"];
    const [active, setActive] = createSignal(props.activeFilter || "Any");

    const handleFilterClick = (f: string) => {
        setActive(f);
        props.onSetFilter(f);
    };

    return (
        <div style={{
            position: "absolute",
            top: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2d2d2d",
            padding: "5px 10px",
            "border-radius": "8px",
            display: "flex",
            gap: "5px",
            "z-index": 1000,
            "box-shadow": "0 2px 10px rgba(0,0,0,0.3)"
        }}>
            {filters.map(f => (
                <button
                    onClick={() => handleFilterClick(f)}
                    style={{
                        background: active() === f ? "#007bff" : "transparent",
                        color: "white",
                        border: "none",
                        padding: "5px 10px",
                        "border-radius": "4px",
                        cursor: "pointer",
                        "font-size": "12px"
                    }}
                >
                    {f}
                </button>
            ))}
        </div>
    );
};

export default SelectionToolbar;
