/**
 * The provider registry (main plan section 6, multi-provider extraction
 * layer): everything provider-specific is configuration here, never code.
 * One interface, three adapters; adding a provider or a model rung is a new
 * entry, plus the ops changes the plan names (SSM parameter, CSP allowlist).
 *
 * The bake-off set is the owner-approved four: Anthropic, Gemini, DeepSeek,
 * and Groq. Keys are never committed anywhere: server-side rungs name an SSM
 * SecureString parameter; BYOK keys live in the device-local table only.
 */

export const ADAPTER_KINDS = ['anthropic', 'gemini', 'openai-compatible'] as const;
export type AdapterKind = (typeof ADAPTER_KINDS)[number];

export type CostTier = 'free' | 'budget' | 'frontier';

/** Browser CORS support churns per provider; 'unverified' routes via the proxy. */
export type BrowserCors = 'yes' | 'no' | 'unverified';

export interface DataPolicy {
  /** Whether the provider may train on request inputs at this rung's tier. */
  readonly trainsOnInputs: boolean;
  /** Where requests are processed, as declared by the provider. */
  readonly region: string;
  readonly note?: string;
}

export interface RegistryEntry {
  /** Stable rung id; recorded into extraction provenance. */
  readonly id: string;
  readonly label: string;
  readonly adapter: AdapterKind;
  readonly baseUrl: string;
  readonly model: string;
  /** Vision rungs accept page images; text rungs need a text layer. */
  readonly vision: boolean;
  readonly costTier: CostTier;
  readonly browserCors: BrowserCors;
  readonly dataPolicy: DataPolicy;
  /** SSM SecureString parameter NAME for the canonical pipeline's key. */
  readonly credentialParameter: string;
}

/**
 * Registry data. Model ids and policies are point-in-time facts that churn;
 * correcting them is a config edit reviewed like any other, not a redesign.
 */
export const REGISTRY: readonly RegistryEntry[] = [
  {
    id: 'groq-llama-3.3-70b',
    label: 'Groq Llama 3.3 70B',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    vision: false,
    costTier: 'free',
    browserCors: 'yes',
    dataPolicy: {
      trainsOnInputs: false,
      region: 'us',
      note: 'Inference-only host; free-tier rate limits are fine for one filing at a time.'
    },
    credentialParameter: '/app/prod/extraction/groq-api-key'
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    adapter: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    vision: false,
    costTier: 'budget',
    browserCors: 'unverified',
    dataPolicy: {
      trainsOnInputs: true,
      region: 'cn',
      note: 'Terms reserve service-improvement use of inputs; public filings only.'
    },
    credentialParameter: '/app/prod/extraction/deepseek-api-key'
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    adapter: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    vision: true,
    costTier: 'budget',
    browserCors: 'yes',
    dataPolicy: {
      trainsOnInputs: false,
      region: 'us',
      note: 'Paid tier; the free tier reserves training rights and is not this rung.'
    },
    credentialParameter: '/app/prod/extraction/gemini-api-key'
  },
  {
    id: 'anthropic-haiku-4.5',
    label: 'Claude Haiku 4.5',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-haiku-4-5-20251001',
    vision: true,
    costTier: 'budget',
    browserCors: 'yes',
    dataPolicy: { trainsOnInputs: false, region: 'us' },
    credentialParameter: '/app/prod/extraction/anthropic-api-key'
  },
  {
    id: 'anthropic-sonnet-5',
    label: 'Claude Sonnet 5',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5',
    vision: true,
    costTier: 'frontier',
    browserCors: 'yes',
    dataPolicy: { trainsOnInputs: false, region: 'us' },
    credentialParameter: '/app/prod/extraction/anthropic-api-key'
  }
];

export interface LadderOptions {
  /** The document needs page images read (scanned PDF, complex tables). */
  readonly needsVision: boolean;
  /** User-marked confidential: paid, no-training rungs only (sensitivity routing). */
  readonly confidential: boolean;
}

const TIER_ORDER: Readonly<Record<CostTier, number>> = { free: 0, budget: 1, frontier: 2 };

/**
 * The cheap-first escalation ladder: free, then budget, then frontier, with
 * registry order breaking ties. PROVISIONAL until the bake-off pins the
 * default ladder from measured accuracy (main plan section 6: measured, not
 * vibed); the shape of this function is the contract, the order is not yet.
 */
export function ladderFor(options: LadderOptions): RegistryEntry[] {
  return REGISTRY.filter((entry) => {
    if (options.needsVision && !entry.vision) return false;
    if (options.confidential && (entry.costTier === 'free' || entry.dataPolicy.trainsOnInputs)) {
      return false;
    }
    return true;
  }).sort((a, b) => TIER_ORDER[a.costTier] - TIER_ORDER[b.costTier]);
}
