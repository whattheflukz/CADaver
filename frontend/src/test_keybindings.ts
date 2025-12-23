
import { getSketchAction } from './sketchInputManager';

console.log("Running Sketch Keybinding Tests...");

let failures = 0;

function assertAction(key: string, expectedType: string, expectedTool?: string, modifiers: { ctrl?: boolean, shift?: boolean, alt?: boolean } = {}) {
    const mockEvent = {
        key: key,
        ctrlKey: !!modifiers.ctrl,
        shiftKey: !!modifiers.shift,
        altKey: !!modifiers.alt,
        metaKey: false // Assume mac cmd is same as ctrl for our logic or handled
    } as KeyboardEvent;

    const action = getSketchAction(mockEvent);

    if (!action) {
        if (expectedType === "NULL") {
            console.log(`[PASS] Key '${key}' -> NULL`);
            return;
        }
        console.error(`[FAIL] Key '${key}' -> Expected ${expectedType}, got NULL`);
        failures++;
        return;
    }

    if (action.type !== expectedType) {
        console.error(`[FAIL] Key '${key}' -> Expected type ${expectedType}, got ${action.type}`);
        failures++;
        return;
    }

    if (expectedType === "SET_TOOL" && 'tool' in action && action.tool !== expectedTool) {
        console.error(`[FAIL] Key '${key}' -> Expected tool ${expectedTool}, got ${action.tool}`);
        failures++;
        return;
    }

    console.log(`[PASS] Key '${key}' -> ${action.type} ${expectedTool ? `(${expectedTool})` : ''}`);
}

// Tests
assertAction('L', 'SET_TOOL', 'line');
assertAction('l', 'SET_TOOL', 'line'); // Lowercase should work via toUpperCase()
assertAction('C', 'SET_TOOL', 'circle');
assertAction('R', 'SET_TOOL', 'rectangle');
assertAction('A', 'SET_TOOL', 'arc');
assertAction('s', 'SET_TOOL', 'slot');
assertAction('P', 'SET_TOOL', 'polygon');
assertAction('Escape', 'CANCEL');
assertAction('Backspace', 'DELETE_SELECTION');
assertAction('Delete', 'DELETE_SELECTION');
assertAction('z', 'UNDO', undefined, { ctrl: true });
assertAction('y', 'REDO', undefined, { ctrl: true });
assertAction('z', 'REDO', undefined, { ctrl: true, shift: true });

// Constraints
assertAction('H', 'SET_TOOL', 'constraint_horizontal');
assertAction('I', 'SET_TOOL', 'constraint_coincident');
assertAction('E', 'SET_TOOL', 'constraint_equal');

// Negative tests / Isolation
assertAction('K', 'NULL'); // Random key
assertAction('L', 'NULL', undefined, { ctrl: true }); // Ctrl+L should be ignored

if (failures === 0) {
    console.log("\nALL TESTS PASSED");
} else {
    console.error(`\n${failures} TESTS FAILED`);
    // process.exit(1);
    throw new Error(`${failures} TESTS FAILED`);
}
