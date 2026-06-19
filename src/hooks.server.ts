import type { Handle } from '@sveltejs/kit';
// This single static import is the whole trigger.
//
// `$env/dynamic/private` is bundled into the same shared server chunk as the
// adapter handler's top-level `await server.init(...)`. server.init() then
// dynamically imports THIS hooks module — but this module statically imports
// back into the chunk that is currently suspended on that top-level await.
//
// 5.5.4: handler lives in build/handler.js (separate) -> no cycle -> boots.
// 5.5.5: handler is merged into build/server/chunks/CEnvyx7R-*.js (shared) ->
//        top-level-await import cycle -> module evaluation deadlocks ->
//        Node exits 13 "Detected unsettled top-level await" before any code runs.
//
// Removing this import (a hooks file with no imports) boots fine on 5.5.5.
// Adding an `init`/`ServerInit` hook is NOT required to reproduce.
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	void env.SOME_VAR;
	return resolve(event);
};
