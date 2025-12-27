
import { BaseTool } from "./BaseTool";
import type { SketchConstraint, SketchEntity } from "../types";
import { wrapConstraint } from "../types";

// Types derived from useSketching logic
type ConstraintType = "Horizontal" | "Vertical" | "Coincident" | "Parallel" | "Perpendicular" | "Equal" | "Fix";

// Helper Interface for Constraint Points (copied from hooks)
interface ConstraintPoint {
    id: string;
    index: number;
}

export class ConstraintTool extends BaseTool {
    id: string;
    private type: ConstraintType;

    constructor(context: any, type: ConstraintType) {
        super(context);
        this.type = type;
        this.id = `constraint_${type.toLowerCase()}`;
    }

    onMouseDown(u: number, v: number, ___e?: MouseEvent): void {
        const pt = [u, v];

        switch (this.type) {
            case "Horizontal":
            case "Vertical":
                this.handleSingleLineConstraint(pt, this.type);
                break;
            case "Coincident":
                this.handleCoincident(pt);
                break;
            case "Parallel":
            case "Perpendicular":
                this.handleTwoLineConstraint(pt, this.type);
                break;
            case "Equal":
                this.handleEqual(pt);
                break;
            case "Fix":
                this.handleFix(pt);
                break;
        }
    }

    private handleSingleLineConstraint(pt: number[], type: "Horizontal" | "Vertical") {
        const line = this.findClosestLine(pt[0], pt[1]);
        if (line && line.geometry.Line) {
            const constraint: SketchConstraint = type === "Horizontal"
                ? { Horizontal: { entity: line.id } }
                : { Vertical: { entity: line.id } };

            this.applyConstraint(constraint);
            console.log(`Added ${type} constraint to:`, line.id);
            this.finish();
        }
    }

    private handleTwoLineConstraint(pt: number[], type: "Parallel" | "Perpendicular") {
        const line = this.findClosestLine(pt[0], pt[1]);
        if (line && line.geometry.Line) {
            const current = this.context.constraintSelection || [];

            if (current.length === 0) {
                // First selection
                this.context.setConstraintSelection?.([{ id: line.id, index: 0 }]);
                console.log(`${type}: First line selected:`, line.id);
            } else if (current.length === 1 && current[0].id !== line.id) {
                // Second selection
                const constraint: SketchConstraint = type === "Parallel"
                    ? { Parallel: { lines: [current[0].id, line.id] } }
                    : { Perpendicular: { lines: [current[0].id, line.id] } };

                this.applyConstraint(constraint);
                console.log(`Added ${type} constraint:`, current[0].id, line.id);
                this.finish();
            }
        }
    }

    private handleCoincident(pt: number[]) {
        const point = this.findClosestPoint(pt[0], pt[1]);
        if (point) {
            const current = this.context.constraintSelection || [];

            if (current.length === 0) {
                this.context.setConstraintSelection?.([point]);
                console.log("Coincident: First point selected:", point);
            } else if (current.length === 1) {
                // validate different point
                if (current[0].id !== point.id || current[0].index !== point.index) {
                    const constraint: SketchConstraint = {
                        Coincident: { points: [current[0], point] }
                    };
                    this.applyConstraint(constraint);
                    console.log("Added Coincident constraint:", current[0], point);
                    this.finish();
                }
            }
        }
    }

    private handleEqual(pt: number[]) {
        const line = this.findClosestLine(pt[0], pt[1]);
        // TODO: Circle/Arc support
        if (line) {
            const current = this.context.constraintSelection || [];
            if (current.length === 0) {
                this.context.setConstraintSelection?.([{ id: line.id, index: 0 }]);
                console.log("Equal: First entity selected:", line.id);
            } else if (current.length === 1 && current[0].id !== line.id) {
                const constraint: SketchConstraint = {
                    Equal: { entities: [current[0].id, line.id] }
                };
                this.applyConstraint(constraint);
                console.log("Added Equal constraint");
                this.finish();
            }
        }
    }

    private handleFix(pt: number[]) {
        const point = this.findClosestPoint(pt[0], pt[1]);
        if (point) {
            const pos = this.getPointPosition(point);
            if (pos) {
                const constraint: SketchConstraint = {
                    Fix: { point, position: pos }
                };
                this.applyConstraint(constraint);
                console.log("Added Fix constraint");
                this.finish();
            }
        }
    }

    private applyConstraint(constraint: SketchConstraint) {
        const sketch = { ...this.context.sketch };
        sketch.constraints = [...(sketch.constraints || []), wrapConstraint(constraint)];
        sketch.history = [...(sketch.history || []), { AddConstraint: { constraint } }];
        this.context.setSketch(sketch);
        this.context.sendUpdate(sketch);
    }

    private finish() {
        this.context.setConstraintSelection?.([]);
        this.context.setTool?.("select");
    }

    // Helpers copied from useSketching.ts (should be centralized ideally)
    private findClosestLine(px: number, py: number): SketchEntity | null {
        const sketch = this.context.sketch;
        let closest: SketchEntity | null = null;
        let minDist = Infinity;

        for (const entity of sketch.entities) {
            if (entity.id.startsWith("preview_")) continue;
            if (entity.geometry.Line) {
                const { start, end } = entity.geometry.Line;
                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const len2 = dx * dx + dy * dy;
                let t = len2 > 0 ? ((px - start[0]) * dx + (py - start[1]) * dy) / len2 : 0;
                t = Math.max(0, Math.min(1, t));
                const closestX = start[0] + t * dx;
                const closestY = start[1] + t * dy;
                const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = entity;
                }
            }
        }
        return minDist < 2.0 ? closest : null;
    }

    private findClosestPoint(px: number, py: number): ConstraintPoint | null {
        const sketch = this.context.sketch;
        let closest: ConstraintPoint | null = null;
        let minDist = Infinity;

        for (const entity of sketch.entities) {
            if (entity.id.startsWith("preview_")) continue;
            const points: { pos: [number, number], index: number }[] = [];

            if (entity.geometry.Line) {
                points.push({ pos: entity.geometry.Line.start, index: 0 });
                points.push({ pos: entity.geometry.Line.end, index: 1 });
            } else if (entity.geometry.Circle) {
                points.push({ pos: entity.geometry.Circle.center, index: 0 });
            } else if (entity.geometry.Arc) {
                const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
                points.push({ pos: center, index: 0 });
                points.push({ pos: [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)], index: 1 });
                points.push({ pos: [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)], index: 2 });
            } else if (entity.geometry.Point) {
                points.push({ pos: entity.geometry.Point.pos, index: 0 }); // Correct index for point? usually 0
            }

            for (const { pos, index } of points) {
                const dist = Math.sqrt((px - pos[0]) ** 2 + (py - pos[1]) ** 2);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { id: entity.id, index };
                }
            }
        }
        return minDist < 1.5 ? closest : null;
    }

    private getPointPosition(cp: ConstraintPoint): [number, number] | null {
        const sketch = this.context.sketch;
        const entity = sketch.entities.find(e => e.id === cp.id);
        if (!entity) return null;

        if (entity.geometry.Line) {
            return cp.index === 0 ? entity.geometry.Line.start : entity.geometry.Line.end;
        } else if (entity.geometry.Circle) {
            return entity.geometry.Circle.center;
        } else if (entity.geometry.Arc) {
            const { center, radius, start_angle, end_angle } = entity.geometry.Arc;
            if (cp.index === 0) return center;
            if (cp.index === 1) return [center[0] + radius * Math.cos(start_angle), center[1] + radius * Math.sin(start_angle)];
            if (cp.index === 2) return [center[0] + radius * Math.cos(end_angle), center[1] + radius * Math.sin(end_angle)];
        } else if (entity.geometry.Point) {
            return entity.geometry.Point.pos;
        }
        return null;
    }
}
