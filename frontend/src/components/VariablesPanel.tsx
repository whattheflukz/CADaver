import { type Component, For, createSignal, Show } from 'solid-js';
import type { Variable, VariableStore, VariableUnit } from '../types';
import './VariablesPanel.css';

interface VariablesPanelProps {
    variables: VariableStore;
    onAddVariable: (name: string, expression: string, unit: VariableUnit, description?: string) => void;
    onUpdateVariable: (id: string, updates: { name?: string, expression?: string, unit?: VariableUnit, description?: string }) => void;
    onDeleteVariable: (id: string) => void;
    onReorderVariable?: (id: string, newIndex: number) => void;
    onClose: () => void;
}

const VariablesPanel: Component<VariablesPanelProps> = (props) => {
    const [editingId, setEditingId] = createSignal<string | null>(null);
    const [showAddForm, setShowAddForm] = createSignal(false);

    // Form state for add/edit
    const [formName, setFormName] = createSignal('');
    const [formExpression, setFormExpression] = createSignal('');
    const [formUnit, setFormUnit] = createSignal<VariableUnit>('Dimensionless');
    const [formDescription, setFormDescription] = createSignal('');

    // Get ordered list of variables
    const orderedVariables = () => {
        return props.variables.order
            .map(id => props.variables.variables[id])
            .filter((v): v is Variable => v !== undefined);
    };

    const variableCount = () => Object.keys(props.variables.variables).length;

    const resetForm = () => {
        setFormName('');
        setFormExpression('');
        setFormUnit('Dimensionless');
        setFormDescription('');
    };

    const startAdd = () => {
        resetForm();
        setEditingId(null);
        setShowAddForm(true);
    };

    const startEdit = (variable: Variable) => {
        setFormName(variable.name);
        setFormExpression(variable.expression);
        setFormUnit(variable.unit);
        setFormDescription(variable.description || '');
        setEditingId(variable.id);
        setShowAddForm(false);
    };

    const cancelEdit = () => {
        resetForm();
        setEditingId(null);
        setShowAddForm(false);
    };

    const submitAdd = () => {
        const name = formName().trim();
        const expr = formExpression().trim();

        if (!name || !expr) return;

        props.onAddVariable(name, expr, formUnit(), formDescription().trim() || undefined);
        resetForm();
        setShowAddForm(false);
    };

    const submitEdit = () => {
        const id = editingId();
        if (!id) return;

        const name = formName().trim();
        const expr = formExpression().trim();

        if (!name || !expr) return;

        props.onUpdateVariable(id, {
            name,
            expression: expr,
            unit: formUnit(),
            description: formDescription().trim() || undefined
        });

        resetForm();
        setEditingId(null);
    };

    const formatUnit = (unit: VariableUnit): string => {
        if (unit === 'Dimensionless') return '';
        if (typeof unit === 'object' && 'Length' in unit) {
            const lengthMap: Record<string, string> = {
                Millimeter: 'mm', Centimeter: 'cm', Meter: 'm', Inch: 'in', Foot: 'ft'
            };
            return lengthMap[unit.Length] || unit.Length;
        }
        if (typeof unit === 'object' && 'Angle' in unit) {
            return unit.Angle === 'Degrees' ? '°' : 'rad';
        }
        return '';
    };

    const formatValue = (variable: Variable): string => {
        if (variable.error) return `Error: ${variable.error}`;
        if (variable.cached_value === undefined || variable.cached_value === null) return '...';
        const unitStr = formatUnit(variable.unit);
        return `${variable.cached_value.toFixed(4)}${unitStr ? ' ' + unitStr : ''}`;
    };

    return (
        <div class="variables-panel-overlay" onClick={() => props.onClose()}>
            <div class="variables-panel" onClick={(e) => e.stopPropagation()}>
                <div class="variables-header">
                    <h2>Variables</h2>
                    <button class="close-btn" onClick={() => props.onClose()}>×</button>
                </div>

                <div class="variables-content">
                    {/* Variable List */}
                    <div class="variables-list">
                        <For each={orderedVariables()}>
                            {(variable) => (
                                <div class={`variable-row ${editingId() === variable.id ? 'editing' : ''} ${variable.error ? 'has-error' : ''}`}>
                                    <Show when={editingId() === variable.id} fallback={
                                        <>
                                            <div class="variable-info">
                                                <span class="variable-name">@{variable.name}</span>
                                                <span class="variable-expr">{variable.expression}</span>
                                                <span class={`variable-value ${variable.error ? 'error' : ''}`}>
                                                    = {formatValue(variable)}
                                                </span>
                                            </div>
                                            <div class="variable-actions">
                                                <button class="icon-btn edit" onClick={() => startEdit(variable)} title="Edit">✏️</button>
                                                <button class="icon-btn delete" onClick={() => props.onDeleteVariable(variable.id)} title="Delete">🗑️</button>
                                            </div>
                                        </>
                                    }>
                                        {/* Edit Form Inline */}
                                        <div class="variable-edit-form">
                                            <input
                                                type="text"
                                                class="input-name"
                                                value={formName()}
                                                onInput={(e) => setFormName(e.currentTarget.value)}
                                                placeholder="Variable name"
                                            />
                                            <input
                                                type="text"
                                                class="input-expr"
                                                value={formExpression()}
                                                onInput={(e) => setFormExpression(e.currentTarget.value)}
                                                placeholder="Expression (e.g., 10 or @other * 2)"
                                            />
                                            <select
                                                class="input-unit"
                                                value={JSON.stringify(formUnit())}
                                                onChange={(e) => setFormUnit(JSON.parse(e.currentTarget.value))}
                                            >
                                                <option value='"Dimensionless"'>No unit</option>
                                                <option value='{"Length":"Millimeter"}'>mm</option>
                                                <option value='{"Length":"Centimeter"}'>cm</option>
                                                <option value='{"Length":"Meter"}'>m</option>
                                                <option value='{"Length":"Inch"}'>in</option>
                                                <option value='{"Length":"Foot"}'>ft</option>
                                                <option value='{"Angle":"Degrees"}'>deg</option>
                                                <option value='{"Angle":"Radians"}'>rad</option>
                                            </select>
                                            <div class="form-buttons">
                                                <button class="btn-save" onClick={submitEdit}>Save</button>
                                                <button class="btn-cancel" onClick={cancelEdit}>Cancel</button>
                                            </div>
                                        </div>
                                    </Show>
                                </div>
                            )}
                        </For>

                        {variableCount() === 0 && !showAddForm() && (
                            <div class="no-variables">
                                No variables defined yet
                            </div>
                        )}
                    </div>

                    {/* Add Form */}
                    <Show when={showAddForm()}>
                        <div class="add-form">
                            <div class="form-row">
                                <input
                                    type="text"
                                    class="input-name"
                                    value={formName()}
                                    onInput={(e) => setFormName(e.currentTarget.value)}
                                    placeholder="Variable name"
                                    autofocus
                                />
                            </div>
                            <div class="form-row">
                                <input
                                    type="text"
                                    class="input-expr"
                                    value={formExpression()}
                                    onInput={(e) => setFormExpression(e.currentTarget.value)}
                                    placeholder="Expression (e.g., 10, @other * 2, sqrt(16))"
                                />
                            </div>
                            <div class="form-row">
                                <select
                                    class="input-unit"
                                    value={JSON.stringify(formUnit())}
                                    onChange={(e) => setFormUnit(JSON.parse(e.currentTarget.value))}
                                >
                                    <option value='"Dimensionless"'>No unit</option>
                                    <option value='{"Length":"Millimeter"}'>Millimeters (mm)</option>
                                    <option value='{"Length":"Centimeter"}'>Centimeters (cm)</option>
                                    <option value='{"Length":"Meter"}'>Meters (m)</option>
                                    <option value='{"Length":"Inch"}'>Inches (in)</option>
                                    <option value='{"Length":"Foot"}'>Feet (ft)</option>
                                    <option value='{"Angle":"Degrees"}'>Degrees (°)</option>
                                    <option value='{"Angle":"Radians"}'>Radians (rad)</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <input
                                    type="text"
                                    class="input-desc"
                                    value={formDescription()}
                                    onInput={(e) => setFormDescription(e.currentTarget.value)}
                                    placeholder="Description (optional)"
                                />
                            </div>
                            <div class="form-buttons">
                                <button class="btn-add" onClick={submitAdd} disabled={!formName().trim() || !formExpression().trim()}>
                                    Add Variable
                                </button>
                                <button class="btn-cancel" onClick={cancelEdit}>Cancel</button>
                            </div>
                        </div>
                    </Show>
                </div>

                <div class="variables-footer">
                    <Show when={!showAddForm() && editingId() === null}>
                        <button class="btn-add-new" onClick={startAdd}>
                            + Add Variable
                        </button>
                    </Show>
                    <div class="hint">
                        Reference with <code>@name</code> syntax • Supports <code>PI</code>, <code>sin()</code>, <code>sqrt()</code>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VariablesPanel;
