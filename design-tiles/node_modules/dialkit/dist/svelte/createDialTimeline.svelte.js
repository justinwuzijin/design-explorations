import { DialStore } from 'dialkit/store';
import { TimelineStore, buildTimelineMeta, buildTimelineValues, computeStaticTimeline, parseTimelineConfig, resolveTimelineLoop, } from 'dialkit/timeline';
let timelineInstance = 0;
export function createDialTimeline(name, config, options) {
    const hasStableId = options?.id !== undefined;
    const panelId = options?.id ?? `${name}-${++timelineInstance}`;
    const parsed = $derived(parseTimelineConfig(config));
    let flatValues = $state(DialStore.getValues(panelId));
    let transport = $state(TimelineStore.getTransport(panelId));
    const staticTimeline = $derived(computeStaticTimeline(parsed, flatValues));
    const actions = {
        play: () => TimelineStore.play(panelId),
        pause: () => TimelineStore.pause(panelId),
        replay: () => TimelineStore.replay(panelId),
        seek: (time) => TimelineStore.seek(panelId, time),
    };
    const resolved = $derived(buildTimelineValues(staticTimeline.clips, transport, staticTimeline.duration, resolveTimelineLoop(options?.loop).start, actions));
    $effect(() => {
        const currentParsed = parsed;
        DialStore.registerPanel(panelId, name, currentParsed.dialConfig, undefined, {
            retainOnUnmount: hasStableId,
            persist: options?.persist,
            kind: 'timeline',
        });
        flatValues = DialStore.getValues(panelId);
        const initialStatic = computeStaticTimeline(currentParsed, flatValues);
        TimelineStore.register(buildTimelineMeta(panelId, name, initialStatic.duration, currentParsed, options?.loop), { autoplay: options?.autoplay ?? true });
        transport = TimelineStore.getTransport(panelId);
        const unsubscribeValues = DialStore.subscribe(panelId, () => {
            flatValues = DialStore.getValues(panelId);
        });
        const unsubscribeTransport = TimelineStore.subscribe(panelId, () => {
            transport = TimelineStore.getTransport(panelId);
        });
        return () => {
            unsubscribeValues();
            unsubscribeTransport();
            TimelineStore.unregister(panelId);
            DialStore.unregisterPanel(panelId);
        };
    });
    $effect(() => {
        TimelineStore.update(buildTimelineMeta(panelId, name, staticTimeline.duration, parsed, options?.loop));
    });
    return reactiveProxy(() => resolved);
}
function reactiveProxy(read, path = []) {
    const nested = new Map();
    return new Proxy({}, {
        get(_target, key) {
            const value = readPath(read(), [...path, key]);
            if (typeof value !== 'object' || value === null)
                return value;
            if (!nested.has(key))
                nested.set(key, reactiveProxy(read, [...path, key]));
            return nested.get(key);
        },
        ownKeys() {
            const value = readPath(read(), path);
            return typeof value === 'object' && value !== null ? Reflect.ownKeys(value) : [];
        },
        getOwnPropertyDescriptor() {
            return { enumerable: true, configurable: true };
        },
    });
}
function readPath(source, path) {
    return path.reduce((value, key) => {
        if (typeof value !== 'object' || value === null)
            return undefined;
        return Reflect.get(value, key);
    }, source);
}
