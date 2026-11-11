// Shared declarations for type checking (tsc --noEmit). Not part of the extension.
// common.js sets the read-only global __upins with defineProperty, which tsc can't infer.
declare const __upins: typeof import('../extension/common.js');
/** chat id -> pin time (ms) */
type UpPins = Record<string, number>;
// common.js also exports its API under Node for the unit tests.
declare var module: any;
