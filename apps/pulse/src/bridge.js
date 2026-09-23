import { invoke as nativeInvoke } from '@tauri-apps/api/core';
import { listen as nativeListen } from '@tauri-apps/api/event';
let api = { invoke: nativeInvoke, listen: nativeListen };
// Fixtures are development-only and tree-shaken out of packaged applications.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) api = await import('./preview.js');
export const invoke = (...args) => api.invoke(...args);
export const listen = (...args) => api.listen(...args);
