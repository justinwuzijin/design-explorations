import type { DialValue } from 'dialkit/store';
import type { TimelineClipMeta } from 'dialkit/timeline';
import type { DialTheme } from '../DialRoot.svelte';
export type PopoverState = {
    clip: TimelineClipMeta;
    stepKey?: string;
    anchor: {
        left: number;
        top: number;
        right: number;
        bottom: number;
        width: number;
        height: number;
    };
};
type $$ComponentProps = {
    panelId: string;
    popover: PopoverState;
    values: Record<string, DialValue>;
    theme: DialTheme;
    onClose: () => void;
};
declare const ClipPopover: import("svelte").Component<$$ComponentProps, {}, "">;
type ClipPopover = ReturnType<typeof ClipPopover>;
export default ClipPopover;
//# sourceMappingURL=ClipPopover.svelte.d.ts.map