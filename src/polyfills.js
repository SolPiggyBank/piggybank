import { Buffer } from 'buffer';

if (!globalThis.Buffer) globalThis.Buffer = Buffer;
if (!globalThis.process) globalThis.process = { env: {}, browser: true, version: '', nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)) };
