import { For, onCleanup, createEffect } from 'solid-js';
import type { KernelError } from '../types';

interface ErrorToastProps {
    errors: () => KernelError[];
    onDismiss: (timestamp: number) => void;
    autoDismissMs?: number;
}

/**
 * Toast notification component for displaying kernel errors.
 * Errors auto-dismiss after the specified timeout.
 */
export function ErrorToast(props: ErrorToastProps) {
    const autoDismiss = () => props.autoDismissMs ?? 5000;

    // Auto-dismiss errors after timeout
    createEffect(() => {
        const errors = props.errors();
        for (const error of errors) {
            const elapsed = Date.now() - error.timestamp;
            const remaining = autoDismiss() - elapsed;

            if (remaining > 0) {
                const timer = setTimeout(() => {
                    props.onDismiss(error.timestamp);
                }, remaining);

                onCleanup(() => clearTimeout(timer));
            }
        }
    });

    return (
        <div class="error-toast-container">
            <For each={props.errors()}>
                {(error) => (
                    <div
                        class={`error-toast ${error.severity}`}
                        role="alert"
                    >
                        <div class="error-toast-content">
                            <span class="error-toast-icon">
                                {error.severity === 'error' ? '✕' : '⚠'}
                            </span>
                            <div class="error-toast-message">
                                <span class="error-toast-code">{error.code}</span>
                                <span class="error-toast-text">{error.message}</span>
                            </div>
                        </div>
                        <button
                            class="error-toast-dismiss"
                            onClick={() => props.onDismiss(error.timestamp)}
                            aria-label="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                )}
            </For>
        </div>
    );
}

export default ErrorToast;
