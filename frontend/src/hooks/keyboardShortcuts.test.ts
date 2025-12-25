/**
 * Keyboard Shortcuts Logic Tests
 * 
 * Run with: npx tsx src/hooks/keyboardShortcuts.test.ts
 * 
 * Tests pure logic functions without DOM dependencies.
 */

import { normalizeShortcut, matchesKeyEvent, formatShortcut } from './useKeyboardShortcuts';

// Simple test harness
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (e) {
        failed++;
        console.log(`✗ ${name}`);
        console.log(`  ${e}`);
    }
}

function expect(actual: unknown) {
    return {
        toBe(expected: unknown) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${actual}`);
            }
        }
    };
}

// ========== normalizeShortcut tests ==========

console.log('\n--- normalizeShortcut tests ---');

test('normalizes simple key', () => {
    expect(normalizeShortcut('L')).toBe('l');
    expect(normalizeShortcut('a')).toBe('a');
});

test('normalizes Ctrl+key', () => {
    expect(normalizeShortcut('Ctrl+K')).toBe('ctrl+k');
    expect(normalizeShortcut('ctrl+k')).toBe('ctrl+k');
    expect(normalizeShortcut('Control+K')).toBe('ctrl+k');
});

test('normalizes Cmd/Meta as meta', () => {
    expect(normalizeShortcut('Cmd+K')).toBe('meta+k');
    expect(normalizeShortcut('Meta+K')).toBe('meta+k');
    expect(normalizeShortcut('⌘+K')).toBe('meta+k');
});

test('normalizes Shift+key', () => {
    expect(normalizeShortcut('Shift+L')).toBe('shift+l');
    expect(normalizeShortcut('Shift+A')).toBe('shift+a');
});

test('normalizes complex combos with sorted modifiers', () => {
    expect(normalizeShortcut('Ctrl+Shift+K')).toBe('ctrl+shift+k');
    expect(normalizeShortcut('Shift+Ctrl+K')).toBe('ctrl+shift+k');
});

test('handles Alt/Option', () => {
    expect(normalizeShortcut('Alt+X')).toBe('alt+x');
    expect(normalizeShortcut('Option+X')).toBe('alt+x');
});

test('handles empty string', () => {
    expect(normalizeShortcut('')).toBe('');
});

// ========== formatShortcut tests ==========

console.log('\n--- formatShortcut tests ---');

test('formats simple key', () => {
    expect(formatShortcut('L')).toBe('L');
});

test('formats Ctrl key', () => {
    // On non-Mac, Ctrl stays Ctrl
    const result = formatShortcut('Ctrl+K');
    // Just check it doesn't throw and returns something reasonable
    expect(result.length > 0).toBe(true);
});

test('formats Escape', () => {
    expect(formatShortcut('Escape')).toBe('Esc');
    expect(formatShortcut('escape')).toBe('Esc');
});

// ========== matchesKeyEvent tests ==========

console.log('\n--- matchesKeyEvent tests ---');

// Mock KeyboardEvent
function mockEvent(key: string, opts: { ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, altKey?: boolean } = {}): KeyboardEvent {
    return {
        key,
        code: key.toLowerCase(),
        ctrlKey: opts.ctrlKey || false,
        metaKey: opts.metaKey || false,
        shiftKey: opts.shiftKey || false,
        altKey: opts.altKey || false,
    } as KeyboardEvent;
}

test('matches simple key', () => {
    expect(matchesKeyEvent('L', mockEvent('l'))).toBe(true);
    expect(matchesKeyEvent('L', mockEvent('L'))).toBe(true);
    expect(matchesKeyEvent('L', mockEvent('k'))).toBe(false);
});

test('matches Ctrl+key', () => {
    expect(matchesKeyEvent('Ctrl+K', mockEvent('k', { ctrlKey: true }))).toBe(true);
    expect(matchesKeyEvent('Ctrl+K', mockEvent('k'))).toBe(false);
    expect(matchesKeyEvent('Ctrl+K', mockEvent('k', { shiftKey: true }))).toBe(false);
});

test('matches Shift+key', () => {
    expect(matchesKeyEvent('Shift+L', mockEvent('l', { shiftKey: true }))).toBe(true);
    expect(matchesKeyEvent('Shift+L', mockEvent('L', { shiftKey: true }))).toBe(true);
    expect(matchesKeyEvent('Shift+L', mockEvent('l'))).toBe(false);
});

test('matches Ctrl+Shift combo', () => {
    expect(matchesKeyEvent('Ctrl+Shift+/', mockEvent('/', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(matchesKeyEvent('Ctrl+Shift+/', mockEvent('/', { ctrlKey: true }))).toBe(false);
});

test('does not match empty shortcut', () => {
    expect(matchesKeyEvent('', mockEvent('k'))).toBe(false);
});

// ========== Summary ==========

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
