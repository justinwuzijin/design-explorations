type PanelDragOffset = {
    x: number;
    y: number;
};
type PanelDragStart = {
    pointerX: number;
    pointerY: number;
    elX: number;
    elY: number;
};
type PanelDragOriginX = 'left' | 'right';
declare function getPanelDragHandle(target: EventTarget | null, panel: HTMLElement | null): HTMLElement | null;
declare function getPanelDragStart(pointerX: number, pointerY: number, panel: HTMLElement): PanelDragStart;
declare function getPanelDragOffset(start: PanelDragStart, pointerX: number, pointerY: number): PanelDragOffset;
declare function hasPanelDragMoved(start: PanelDragStart, pointerX: number, pointerY: number): boolean;
declare function getPanelOriginX(position: string, offset: PanelDragOffset | null, viewportWidth?: number | undefined): PanelDragOriginX;
declare function blockPanelDragClick(handle: HTMLElement): void;

export { type PanelDragOffset, type PanelDragOriginX, type PanelDragStart, blockPanelDragClick, getPanelDragHandle, getPanelDragOffset, getPanelDragStart, getPanelOriginX, hasPanelDragMoved };
