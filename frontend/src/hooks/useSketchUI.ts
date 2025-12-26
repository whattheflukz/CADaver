import { createSignal } from 'solid-js';
import { type SketchToolType } from '../types';
import { type SketchEntity } from '../types'; // Keeping type imports is fine, but splitting to be safe

export function useSketchUI() {
    // Sketch State
    const [sketchMode, setSketchMode] = createSignal(false);
    const [activeSketchId, setActiveSketchId] = createSignal<string | null>(null);
    const [sketchTool, setSketchTool] = createSignal<SketchToolType>("select");
    const [constructionMode, setConstructionMode] = createSignal(false);

    // Sketch Setup Mode State
    const [sketchSetupMode, setSketchSetupMode] = createSignal(false);
    const [pendingSketchId, setPendingSketchId] = createSignal<string | null>(null);

    // Offset State
    const [offsetState, setOffsetState] = createSignal<{
        isPanelOpen: boolean;
        distance: number;
        flip: boolean;
        selection: string[];
        previewGeometry: SketchEntity[];
    }>({
        isPanelOpen: false,
        distance: 0.5,
        flip: false,
        selection: [],
        previewGeometry: []
    });

    // Linear Pattern State
    const [linearPatternState, setLinearPatternState] = createSignal<{
        direction: string | null;
        entities: string[];
        count: number;
        spacing: number;
        activeField: 'direction' | 'entities';
        flipDirection: boolean;
        previewGeometry: SketchEntity[];
    }>({
        direction: null,
        entities: [],
        count: 3,
        spacing: 2.0,
        activeField: 'direction',
        flipDirection: false,
        previewGeometry: []
    });

    // Circular Pattern State
    const [circularPatternState, setCircularPatternState] = createSignal<{
        centerType: 'origin' | 'point' | null;
        centerId: string | null;
        entities: string[];
        count: number;
        totalAngle: number;
        activeField: 'center' | 'entities';
        flipDirection: boolean;
        previewGeometry: SketchEntity[];
    }>({
        centerType: null,
        centerId: null,
        entities: [],
        count: 6,
        totalAngle: 360,
        activeField: 'center',
        flipDirection: false,
        previewGeometry: []
    });

    // Mirror State
    const [mirrorState, setMirrorState] = createSignal<{
        axis: string | null;
        entities: string[];
        activeField: 'axis' | 'entities';
        previewGeometry: SketchEntity[];
    }>({
        axis: null,
        entities: [],
        activeField: 'axis',
        previewGeometry: []
    });

    // Dimension Editing State
    const [editingDimension, setEditingDimension] = createSignal<{
        constraintIndex: number;
        type: 'Distance' | 'Angle' | 'Radius';
        currentValue: number;
        expression?: string;
        isNew?: boolean;
    } | null>(null);

    return {
        sketchMode, setSketchMode,
        activeSketchId, setActiveSketchId,
        sketchTool, setSketchTool,
        constructionMode, setConstructionMode,
        sketchSetupMode, setSketchSetupMode,
        pendingSketchId, setPendingSketchId,
        offsetState, setOffsetState,
        linearPatternState, setLinearPatternState,
        circularPatternState, setCircularPatternState,
        mirrorState, setMirrorState,
        editingDimension, setEditingDimension
    };
}
