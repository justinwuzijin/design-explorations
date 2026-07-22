type DropdownPosition = {
    top: number;
    left: number;
    width: number;
    above: boolean;
};
type DropdownPositionOptions = {
    dropdownHeight?: number;
    gap?: number;
    allowAbove?: boolean;
};
declare function getDropdownPosition(trigger: HTMLElement, portalRoot: HTMLElement, options?: DropdownPositionOptions): DropdownPosition;
declare function getDialKitPortalRoot(trigger: HTMLElement | null | undefined): HTMLElement | null;

export { type DropdownPosition, type DropdownPositionOptions, getDialKitPortalRoot, getDropdownPosition };
