/**
 * Command Registry - Central registry for all commands accessible via Command Palette
 * 
 * Reference: plan.md Phase 0 → UI Infrastructure → Command palette infrastructure
 */

import { type SketchToolType } from "./types";

/** Application modes for command filtering */
export type AppMode = 'sketch' | 'modeling' | 'all';

/** Command definition */
export interface Command {
    /** Unique identifier */
    id: string;
    /** Display name for fuzzy search */
    name: string;
    /** Short description of what the command does */
    description: string;
    /** Keyboard shortcut (display only, not bound here) */
    shortcut?: string;
    /** Which modes this command is available in */
    modes: AppMode[];
    /** Category for grouping in command palette */
    category: 'geometry' | 'constraint' | 'edit' | 'dimension' | 'action' | 'modeling';
}

/** Static command definitions (actions bound at runtime) */
export const COMMAND_DEFINITIONS: Command[] = [
    // === GEOMETRY TOOLS (Sketch Mode) ===
    {
        id: "tool:line",
        name: "Line",
        description: "Draw a line between two points",
        shortcut: "L",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:circle",
        name: "Circle",
        description: "Draw a circle by center and radius",
        shortcut: "C",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:arc",
        name: "Arc",
        description: "Draw an arc through three points",
        shortcut: "A",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:rectangle",
        name: "Rectangle",
        description: "Draw a rectangle by two corners",
        shortcut: "R",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:slot",
        name: "Slot",
        description: "Draw a slot (rounded rectangle)",
        shortcut: "S",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:polygon",
        name: "Polygon",
        description: "Draw a regular polygon",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:point",
        name: "Point",
        description: "Place a construction point",
        shortcut: "P",
        modes: ["sketch"],
        category: "geometry",
    },
    {
        id: "tool:ellipse",
        name: "Ellipse",
        description: "Draw an ellipse by center and axes",
        modes: ["sketch"],
        category: "geometry",
    },

    // === EDITING TOOLS (Sketch Mode) ===
    {
        id: "tool:trim",
        name: "Trim",
        description: "Trim sketch geometry at intersections",
        modes: ["sketch"],
        category: "edit",
    },
    {
        id: "tool:mirror",
        name: "Mirror",
        description: "Mirror sketch geometry across an axis",
        modes: ["sketch"],
        category: "edit",
    },
    {
        id: "tool:offset",
        name: "Offset / Reference",
        description: "Create offset copy of geometry",
        shortcut: "O",
        modes: ["sketch"],
        category: "edit",
    },
    {
        id: "tool:linear_pattern",
        name: "Linear Pattern",
        description: "Create linear array of geometry",
        modes: ["sketch"],
        category: "edit",
    },
    {
        id: "tool:circular_pattern",
        name: "Circular Pattern",
        description: "Create circular array of geometry",
        modes: ["sketch"],
        category: "edit",
    },
    {
        id: "tool:project",
        name: "Project / Use",
        description: "Project 3D geometry into sketch",
        shortcut: "U",
        modes: ["sketch"],
        category: "edit",
    },

    // === CONSTRAINT TOOLS (Sketch Mode) ===
    {
        id: "tool:constraint_horizontal",
        name: "Horizontal Constraint",
        description: "Constrain a line to be horizontal",
        shortcut: "H",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_vertical",
        name: "Vertical Constraint",
        description: "Constrain a line to be vertical",
        shortcut: "V",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_coincident",
        name: "Coincident Constraint",
        description: "Make two points coincide",
        shortcut: "I",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_parallel",
        name: "Parallel Constraint",
        description: "Make two lines parallel",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_perpendicular",
        name: "Perpendicular Constraint",
        description: "Make two lines perpendicular",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_equal",
        name: "Equal Constraint",
        description: "Make two entities equal length/radius",
        shortcut: "E",
        modes: ["sketch"],
        category: "constraint",
    },
    {
        id: "tool:constraint_fix",
        name: "Fix Constraint",
        description: "Lock a point in place",
        modes: ["sketch"],
        category: "constraint",
    },

    // === DIMENSION TOOLS (Sketch Mode) ===
    {
        id: "tool:dimension",
        name: "Dimension",
        description: "Add driving or driven dimension",
        shortcut: "D",
        modes: ["sketch"],
        category: "dimension",
    },
    {
        id: "tool:measure",
        name: "Measure",
        description: "Measure distances and angles (temporary, non-constraining)",
        shortcut: "M",
        modes: ["sketch"],
        category: "dimension",
    },

    // === SKETCH ACTIONS ===
    {
        id: "action:finish_sketch",
        name: "Finish Sketch",
        description: "Exit sketch mode and save changes",
        modes: ["sketch"],
        category: "action",
    },
    {
        id: "action:cancel_sketch",
        name: "Cancel Sketch",
        description: "Exit sketch mode and discard changes",
        // No shortcut - too destructive for single key
        modes: ["sketch"],
        category: "action",
    },
    {
        id: "action:deselect_sketch",
        name: "Deselect / Reset Tool",
        description: "Reset current tool or clear selection",
        shortcut: "Escape",
        modes: ["sketch"],
        category: "action",
    },
    {
        id: "action:toggle_construction",
        name: "Toggle Construction Mode",
        description: "Toggle construction geometry mode",
        modes: ["sketch"],
        category: "action",
    },
    {
        id: "action:select",
        name: "Select Tool",
        description: "Switch to selection mode",
        modes: ["sketch"],
        category: "action",
    },

    // === 3D MODELING (Modeling Mode) ===
    {
        id: "action:extrude",
        name: "Extrude",
        description: "Extrude a sketch profile into 3D",
        modes: ["modeling"],
        category: "modeling",
    },
    {
        id: "action:deselect_all",
        name: "Deselect All",
        description: "Clear all selected entities",
        shortcut: "Escape",
        modes: ["modeling"],
        category: "action",
    },
    {
        id: "action:new_sketch",
        name: "New Sketch",
        description: "Create a new sketch on a plane or face",
        shortcut: "S",
        modes: ["modeling"],
        category: "modeling",
    },

    // === GLOBAL COMMANDS (All Modes) ===
    {
        id: "action:command_palette",
        name: "Command Palette",
        description: "Open the command palette",
        shortcut: "Ctrl+K",
        modes: ["all"],
        category: "action",
    },
    {
        id: "action:keyboard_shortcuts",
        name: "Keyboard Shortcuts",
        description: "View and customize keyboard shortcuts",
        shortcut: "Ctrl+,",
        modes: ["all"],
        category: "action",
    },
    {
        id: "action:save_selection_group",
        name: "Save Selection as Group",
        description: "Save current selection as a named group",
        shortcut: "Ctrl+G",
        modes: ["modeling"],
        category: "action",
    },
    {
        id: "action:manage_selection_groups",
        name: "Manage Selection Groups",
        description: "View and restore saved selection groups",
        modes: ["modeling"],
        category: "action",
    },
];

/**
 * Extract SketchToolType from a command ID like "tool:line" -> "line"
 */
export function commandIdToSketchTool(id: string): SketchToolType | null {
    if (id.startsWith("tool:")) {
        return id.substring(5) as SketchToolType;
    }
    return null;
}

/**
 * Filter commands by mode
 */
export function getCommandsForMode(mode: AppMode): Command[] {
    return COMMAND_DEFINITIONS.filter(
        (cmd) => cmd.modes.includes(mode) || cmd.modes.includes("all")
    );
}

/**
 * Simple fuzzy search - matches if all characters of query appear in order in target
 */
export function fuzzyMatch(query: string, target: string): boolean {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    const lowerTarget = target.toLowerCase();

    // Simple substring match for now
    return lowerTarget.includes(lowerQuery);
}

/**
 * Filter and sort commands by search query
 */
export function filterCommands(commands: Command[], query: string): Command[] {
    if (!query.trim()) return commands;

    return commands.filter((cmd) =>
        fuzzyMatch(query, cmd.name) || fuzzyMatch(query, cmd.description)
    );
}
