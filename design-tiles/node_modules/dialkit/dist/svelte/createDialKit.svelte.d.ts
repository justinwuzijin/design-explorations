import type { DialConfig, DialKitPersistOptions, DialKitValueUpdates, DialValue, ResolvedValues, ShortcutConfig } from 'dialkit/store';
export interface CreateDialOptions {
    id?: string;
    persist?: DialKitPersistOptions;
    onAction?: (action: string) => void;
    shortcuts?: Record<string, ShortcutConfig>;
}
export type DialKitValues<T> = T;
export interface DialKitController<T extends DialConfig> {
    values: DialKitValues<ResolvedValues<T>>;
    setValue: (path: string, value: DialValue) => void;
    setValues: (values: DialKitValueUpdates<T>) => void;
    resetValues: () => void;
    getValues: () => ResolvedValues<T>;
}
export declare function createDialKit<T extends DialConfig>(name: string, config: T, options?: CreateDialOptions): DialKitValues<ResolvedValues<T>>;
export declare function createDialKitController<T extends DialConfig>(name: string, config: T, options?: CreateDialOptions): DialKitController<T>;
//# sourceMappingURL=createDialKit.svelte.d.ts.map