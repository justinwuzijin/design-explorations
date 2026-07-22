import type { TransitionConfig } from 'dialkit/store';
export type TransitionDurationControl = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
};
type $$ComponentProps = {
    panelId: string;
    path: string;
    label: string;
    value: TransitionConfig;
    onChange: (value: TransitionConfig) => void;
    hideDuration?: boolean;
    durationControl?: TransitionDurationControl;
};
declare const TransitionControl: import("svelte").Component<$$ComponentProps, {}, "">;
type TransitionControl = ReturnType<typeof TransitionControl>;
export default TransitionControl;
//# sourceMappingURL=TransitionControl.svelte.d.ts.map