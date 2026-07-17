import { ladderFor, REGISTRY, type RegistryEntry } from '@plainsight/extraction-core';

/**
 * A key-owning provider: the unit the providers screen shows one row for
 * (frontend spec §3). Registry entries are model rungs; rungs sharing a
 * credential share a provider (the two Claude rungs ride one Anthropic key),
 * and the credential parameter's tail is the stable provider id the
 * device-local key table uses.
 */
export interface KeyedProvider {
  readonly id: string;
  readonly name: string;
  /** The pinned plain-words data-policy line (frontend spec §3). */
  readonly policyWords: string;
  readonly rungs: readonly RegistryEntry[];
}

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  groq: 'Groq'
};

/** '/app/prod/extraction/anthropic-api-key' → 'anthropic'. */
export function providerIdFor(entry: RegistryEntry): string {
  const tail = entry.credentialParameter.split('/').at(-1) ?? entry.credentialParameter;
  return tail.replace(/-api-key$/u, '');
}

const policyWordsFor = (entry: RegistryEntry): string =>
  entry.dataPolicy.trainsOnInputs
    ? 'May train on inputs; public documents only.'
    : 'No-training endpoint.';

/** The registry grouped by credential, in first-appearance order. */
export function keyedProviders(): KeyedProvider[] {
  const byId = new Map<string, RegistryEntry[]>();
  for (const entry of REGISTRY) {
    const id = providerIdFor(entry);
    const group = byId.get(id);
    if (group === undefined) {
      byId.set(id, [entry]);
    } else {
      group.push(entry);
    }
  }
  return [...byId.entries()].map(([id, rungs]) => {
    const head = rungs[0] as RegistryEntry;
    return {
      id,
      name: PROVIDER_NAMES[id] ?? head.label,
      policyWords: policyWordsFor(head),
      rungs
    };
  });
}

/**
 * The escalation order the walk uses today, cheapest first: provisional
 * until the bake-off pins it from measured accuracy (the registry owns that
 * caveat; this just displays it read-only, frontend spec §3).
 */
export function provisionalLadder(): string[] {
  return ladderFor({ needsVision: false, confidential: false }).map((entry) => entry.label);
}
