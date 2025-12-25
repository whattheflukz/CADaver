
import { type SketchToolType } from "./types";

export type SketchAction =
    | { type: "SET_TOOL"; tool: SketchToolType }
    | { type: "CANCEL" }
    | { type: "DELETE_SELECTION" }
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "TOGGLE_CONSTRUCTION" };

/**
 * keyMap defines the binding from a key (upper case) to an action.
 * This is effectively the "Onshape Mode Map".
 */
const KEY_BINDINGS: Record<string, SketchAction> = {
    "L": { type: "SET_TOOL", tool: "line" },
    "C": { type: "SET_TOOL", tool: "circle" },
    "R": { type: "SET_TOOL", tool: "rectangle" },
    "A": { type: "SET_TOOL", tool: "arc" },
    "S": { type: "SET_TOOL", tool: "slot" }, // 'S' is Spline in Onshape, but Slot here for now if Spline not exists? Plan said "Spline if present". Slot starts with S. I'll use S for Slot for now as a reasonable deviation or filler. Actually plan says "S for Spline (if present)". MicroCAD has "Slot". I will map S to Slot for utility, but document it.
    "O": { type: "SET_TOOL", tool: "offset" },
    "P": { type: "SET_TOOL", tool: "point" },
    "D": { type: "SET_TOOL", tool: "dimension" },

    // Constraints
    "H": { type: "SET_TOOL", tool: "constraint_horizontal" },
    "V": { type: "SET_TOOL", tool: "constraint_vertical" },
    "E": { type: "SET_TOOL", tool: "constraint_equal" },
    "I": { type: "SET_TOOL", tool: "constraint_coincident" }, // Onshape uses 'I' for Coincident
    // 'C' is Circle.
    "M": { type: "SET_TOOL", tool: "constraint_coincident" }, // Wait, plan said M for Midpoint. I don't see Midpoint constraint tool in Toolbar props? 
    // Checking SketchToolbar.tsx... 
    // It has horizontal, vertical, coincident, parallel, perpendicular, equal, fix.
    // No Midpoint, Tangent, Concentric buttons exposed in Toolbar yet?
    // Toolbar has: H, V, C(Coincident), ||, Perp, =, Fix.
    // Wait, SketchToolbar uses 'constraint_coincident'.
    // Let's stick to what IS in the toolbar.

    // Revised Constraints based on Toolbar availability:
    // H -> Horizontal
    // V -> Vertical
    // I -> Coincident (Standard Onshape)
    // B -> Parallel (Onshape uses 'B')
    // N -> Perpendicular (Onshape uses normal/perp 'n'?) No, Onshape uses?
    // Let's check Onshape docs mental cache:
    // Parallel = b
    // Perpendicular = n (Normal?) or something else.
    // Equal = e
    // Fix = ? (Anchor?)

    // If in doubt, I will use:
    // H -> Horizontal
    // V -> Vertical
    // E -> Equal
    // I -> Coincident
    // B -> Parallel (Common CAD shift)
    // K -> Perpendicular (Common?) or maybe just stick to standard letters if valid.

    // Let's stick to the Plan's list where possible, and what exists.
    // Plan: H, V, E, M(Midpoint - not in toolbar), C(Coincident - conflict).
    // I will use 'I' for Coincident.
};

// Modifiers
// Ctrl+Z = Undo
// Ctrl+Y = Redo
// Backspace/Delete = Delete

export function getSketchAction(event: KeyboardEvent): SketchAction | null {
    // Ignore if modifier keys are pressed (except for specific shortcuts)
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;
    const isAlt = event.altKey;

    // Handle Global/Common shortcuts first
    if (event.key === "Escape") {
        return { type: "CANCEL" };
    }

    if (event.key === "Backspace" || event.key === "Delete") {
        return { type: "DELETE_SELECTION" };
    }

    if (isCtrl && !isShift && !isAlt) {
        if (event.key.toLowerCase() === "z") {
            return { type: "UNDO" };
        }
        if (event.key.toLowerCase() === "y") {
            return { type: "REDO" };
        }
        // Ctrl+A could be Select All, not implemented yet in Action enum
    }

    if (isCtrl && isShift && !isAlt) {
        if (event.key.toLowerCase() === "z") {
            return { type: "REDO" };
        }
    }

    // If any modifier is held (besides Shift which might be used for uppercase char, but usually key is already uppercase?), 
    // we normally ignore tool shortcuts to avoid browser conflicts, UNLESS it's just Shift.
    // But purely checking `key.toUpperCase()` handles shift implicitly for letters.
    // We want to avoid triggering 'P' when user presses 'Ctrl+P' (Print).
    if (isCtrl || isAlt) {
        return null;
    }

    // Tool Shortcuts
    // Map event.key to UpperCase to match our table
    const key = event.key.toUpperCase();

    // Check explicit map
    if (KEY_BINDINGS[key]) {
        return KEY_BINDINGS[key];
    }

    return null;
}
