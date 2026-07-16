/** See use-dist.mjs: workspace TS-source specifiers map to built output. */
const DIST = {
  '@plainsight/calc-engine': new URL('../../../calc-engine/dist/index.js', import.meta.url).href
};

export function resolve(specifier, context, nextResolve) {
  const mapped = DIST[specifier];
  if (mapped !== undefined) return { url: mapped, shortCircuit: true };
  return nextResolve(specifier, context);
}
