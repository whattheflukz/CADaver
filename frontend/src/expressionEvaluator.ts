import type { VariableStore, VariableUnit } from './types';

/**
 * Convert a value to base units (mm for Length, radians for Angle).
 * This mirrors the backend's Unit::to_base() logic.
 */
function toBaseUnits(value: number, unit: VariableUnit): number {
    if (unit === 'Dimensionless') return value;
    if (typeof unit === 'object' && 'Length' in unit) {
        switch (unit.Length) {
            case 'Millimeter': return value;
            case 'Centimeter': return value * 10;
            case 'Meter': return value * 1000;
            case 'Inch': return value * 25.4;
            case 'Foot': return value * 304.8;
        }
    }
    if (typeof unit === 'object' && 'Angle' in unit) {
        switch (unit.Angle) {
            case 'Radians': return value;
            case 'Degrees': return value * Math.PI / 180;
        }
    }
    return value;
}

/**
 * Simple frontend expression evaluator for variable references.
 * Supports:
 * - Numeric literals: 10, 3.14
 * - Variable references: @variable_name
 * - Basic operators: +, -, *, /
 * 
 * For complex expressions, the backend evaluator should be used.
 */

export function evaluateExpression(
    expression: string,
    variables: VariableStore
): { value: number | null; error: string | null } {
    try {
        const trimmed = expression.trim();

        // Empty expression
        if (!trimmed) {
            return { value: null, error: 'Empty expression' };
        }

        // Pure number
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            return { value: parseFloat(trimmed), error: null };
        }

        // Single variable reference
        if (/^@[\w\s]+$/.test(trimmed)) {
            const varName = trimmed.substring(1).trim();
            const variable = Object.values(variables.variables).find(
                v => v.name === varName
            );

            if (!variable) {
                return { value: null, error: `Variable '${varName}' not found` };
            }

            if (variable.cached_value === undefined || variable.cached_value === null) {
                return { value: null, error: `Variable '${varName}' has no value` };
            }

            // Convert to base units (mm for length, radians for angle)
            const baseValue = toBaseUnits(variable.cached_value, variable.unit);
            return { value: baseValue, error: null };
        }

        // Simple expression with operators: resolve variables first, then evaluate
        let resolved = trimmed;

        // Find all @variable references (including those with spaces)
        const varPattern = /@([\w\s]+?)(?=\s*[+\-*/()]|$)/g;
        let match;
        const replacements: Array<{ from: string; to: string }> = [];

        while ((match = varPattern.exec(trimmed)) !== null) {
            const fullMatch = match[0];
            const varName = match[1].trim();

            const variable = Object.values(variables.variables).find(
                v => v.name === varName
            );

            if (!variable) {
                return { value: null, error: `Variable '${varName}' not found` };
            }

            if (variable.cached_value === undefined || variable.cached_value === null) {
                return { value: null, error: `Variable '${varName}' has no value` };
            }

            // Convert to base units (mm for length, radians for angle)
            const baseValue = toBaseUnits(variable.cached_value, variable.unit);
            replacements.push({ from: fullMatch, to: String(baseValue) });
        }

        // Apply replacements (longest first to avoid partial replacements)
        replacements.sort((a, b) => b.from.length - a.from.length);
        for (const { from, to } of replacements) {
            resolved = resolved.replace(from, to);
        }

        // Safety check: only allow numbers and basic operators
        if (!/^[\d\s.+\-*/()]+$/.test(resolved)) {
            return { value: null, error: 'Invalid characters in expression' };
        }

        // Evaluate using Function (safer than eval, but still sandboxed)
        try {
            // eslint-disable-next-line no-new-func
            const result = Function(`"use strict"; return (${resolved})`)();
            if (typeof result !== 'number' || isNaN(result)) {
                return { value: null, error: 'Expression did not evaluate to a number' };
            }
            return { value: result, error: null };
        } catch (e) {
            return { value: null, error: 'Failed to evaluate expression' };
        }

    } catch (e) {
        return { value: null, error: 'Unknown error' };
    }
}

/**
 * Quick helper to get a numeric value from either a number or expression
 */
export function parseValueOrExpression(
    input: string,
    variables: VariableStore
): number | null {
    // Try plain number first
    const num = parseFloat(input);
    if (!isNaN(num) && !input.includes('@')) {
        return num;
    }

    // Try expression evaluation
    const result = evaluateExpression(input, variables);
    return result.value;
}
