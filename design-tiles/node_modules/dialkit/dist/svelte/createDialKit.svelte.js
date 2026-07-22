import { DialStore, flattenDialValueUpdates, resolveDialValues } from 'dialkit/store';
let dialKitInstance = 0;
export function createDialKit(name, config, options) {
    return createDialKitController(name, config, options).values;
}
export function createDialKitController(name, config, options) {
    const hasStableId = options?.id !== undefined;
    const panelId = options?.id ?? `${name}-${++dialKitInstance}`;
    const resolve = () => resolveDialValues(config, DialStore.getValues(panelId));
    let values = $state(resolve());
    $effect(() => {
        DialStore.registerPanel(panelId, name, config, options?.shortcuts, {
            retainOnUnmount: hasStableId,
            persist: options?.persist,
        });
        values = resolve();
        const unsubValues = DialStore.subscribe(panelId, () => {
            values = resolve();
        });
        const unsubActions = options?.onAction
            ? DialStore.subscribeActions(panelId, options.onAction)
            : undefined;
        return () => {
            unsubValues();
            unsubActions?.();
            DialStore.unregisterPanel(panelId);
        };
    });
    return {
        values: buildReactiveValues(config, () => values, ''),
        setValue(path, value) {
            DialStore.updateValue(panelId, path, value);
        },
        setValues(nextValues) {
            DialStore.updateValues(panelId, flattenDialValueUpdates(config, nextValues));
        },
        resetValues() {
            DialStore.resetValues(panelId);
        },
        getValues() {
            return resolve();
        },
    };
}
function buildReactiveValues(config, getValues, prefix) {
    const result = {};
    for (const [key, configValue] of Object.entries(config)) {
        if (key === '_collapsed')
            continue;
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof configValue === 'object' && configValue !== null && !isLeafConfigValue(configValue)) {
            const nested = buildReactiveValues(configValue, getValues, path);
            Object.defineProperty(result, key, {
                enumerable: true,
                get() {
                    return nested;
                },
            });
            continue;
        }
        Object.defineProperty(result, key, {
            enumerable: true,
            get() {
                return getPathValue(getValues(), path);
            },
        });
    }
    return result;
}
function getPathValue(source, path) {
    return path.split('.').reduce((value, segment) => {
        if (typeof value !== 'object' || value === null)
            return undefined;
        return value[segment];
    }, source);
}
function isLeafConfigValue(value) {
    return ((Array.isArray(value) && value.length <= 4 && typeof value[0] === 'number') ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'string' ||
        isSpringConfig(value) ||
        isEasingConfig(value) ||
        isActionConfig(value) ||
        isSelectConfig(value) ||
        isColorConfig(value) ||
        isTextConfig(value));
}
function hasType(value, type) {
    return typeof value === 'object' && value !== null && 'type' in value && value.type === type;
}
function isSpringConfig(value) {
    return hasType(value, 'spring');
}
function isEasingConfig(value) {
    return hasType(value, 'easing');
}
function isActionConfig(value) {
    return hasType(value, 'action');
}
function isSelectConfig(value) {
    return hasType(value, 'select') && 'options' in value && Array.isArray(value.options);
}
function isColorConfig(value) {
    return hasType(value, 'color');
}
function isTextConfig(value) {
    return hasType(value, 'text');
}
