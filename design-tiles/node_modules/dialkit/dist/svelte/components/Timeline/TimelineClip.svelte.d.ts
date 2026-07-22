import type { TimelineClipLoop, TimelineClipMeta, TimelineStepStatic } from 'dialkit/timeline';
type $$ComponentProps = {
    timelineId: string;
    clip: TimelineClipMeta;
    at: number;
    duration: number;
    loop: TimelineClipLoop;
    steps?: TimelineStepStatic[];
    fixedDuration: boolean;
    composite?: boolean;
    baseAt?: number;
    delayMode?: boolean;
    pxPerSecond: number;
    viewStart: number;
    timelineDuration: number;
    selected: boolean;
    selectedStepKey?: string;
    onClick: (clip: TimelineClipMeta, rect: DOMRect, stepKey?: string) => void;
    onDrag: () => void;
};
declare const TimelineClip: import("svelte").Component<$$ComponentProps, {}, "">;
type TimelineClip = ReturnType<typeof TimelineClip>;
export default TimelineClip;
//# sourceMappingURL=TimelineClip.svelte.d.ts.map