import type { Component } from 'solid-js';

interface ModelingToolbarProps {
    onExtrude: () => void;
}

const ModelingToolbar: Component<ModelingToolbarProps> = (props) => {
    return (
        <div class="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-800 rounded-lg shadow-lg flex items-center p-1 gap-1 z-10 border border-gray-700">

            {/* Extrude Button */}
            <button
                class="p-2 rounded hover:bg-gray-700 text-gray-300 flex flex-col items-center gap-1 min-w-[60px] relative group"
                onClick={props.onExtrude}
                title="Extrude Sketch"
            >
                <div class="text-xl">⬆️</div>
                <span class="text-[10px] font-medium">Extrude</span>

                {/* Tooltip */}
                <div class="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50 border border-gray-700">
                    Create 3D solid from sketch
                </div>
            </button>

            {/* Placeholder for Revolve */}
            <button
                class="p-2 rounded hover:bg-gray-700 text-gray-500 flex flex-col items-center gap-1 min-w-[60px] cursor-not-allowed"
                title="Revolve (Coming Soon)"
                disabled
            >
                <div class="text-xl">🔄</div>
                <span class="text-[10px] font-medium">Revolve</span>
            </button>

            <div class="w-px h-8 bg-gray-700 mx-1"></div>

            {/* Placeholder for Fillet */}
            <button
                class="p-2 rounded hover:bg-gray-700 text-gray-500 flex flex-col items-center gap-1 min-w-[60px] cursor-not-allowed"
                title="Fillet (Coming Soon)"
                disabled
            >
                <div class="text-xl">⚪</div>
                <span class="text-[10px] font-medium">Fillet</span>
            </button>


        </div>
    );
};

export default ModelingToolbar;
