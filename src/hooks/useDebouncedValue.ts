import { useEffect, useState } from 'react';

/**
 * Returns a value that lags behind `value` by `delayMs` milliseconds.
 * Every change to `value` restarts the timer; only the final value
 * after the user has stopped changing it actually propagates.
 *
 * Used to avoid re-rendering the map on every intermediate slider
 * position while the user is still dragging. A 200 ms delay means
 * the map regenerates once the slider has been idle for 200 ms.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const handle = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(handle);
    }, [value, delayMs]);

    return debounced;
}
