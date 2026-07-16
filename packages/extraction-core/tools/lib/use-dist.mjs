/**
 * Node resolver hook for the tools scripts: the workspace export of
 * calc-engine points at TypeScript source (right for bundlers and vitest),
 * so plain node runs resolve it to the built dist instead. Registered via
 * --import; the bake-off re-execs itself with it so the documented command
 * stays `node tools/bakeoff.mjs`.
 */
import { register } from 'node:module';

register(new URL('./dist-resolver.mjs', import.meta.url));
