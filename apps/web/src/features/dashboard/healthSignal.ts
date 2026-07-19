import { METRICS, type MetricDelta, type MetricId, type RuleId } from '@plainsight/calc-engine';

/**
 * Which cards a fired rule implicates (dashboard design plan §4.2, pinned
 * with stage 2 of the finance-look gap plan). Dilution names no card: no card
 * shows share count, so its banner alone carries it.
 */
export const RULE_CARDS: Readonly<Partial<Record<RuleId, readonly MetricId[]>>> = {
  earningsQuality: ['fcfConversion'],
  erodingMoat: ['grossMargin', 'operatingMargin'],
  leverageFlatteredReturns: ['debtToEquity', 'roe'],
  fragility: ['interestCoverage'],
  manufacturedReturns: ['roe', 'debtToEquity'],
  capitalIntensityCreep: ['fcf']
};

export type CardHealth = 'healthy' | 'investigate';

/**
 * One health signal per card, feeding the dot and the sparkline colour
 * (dashboard design plan §4.2): a fired rule wins outright; otherwise the
 * five-year delta read against the pinned health direction. A metric with no
 * pinned direction, no delta, or a flat delta carries no signal: absence of
 * signal, not absence of data.
 */
export function cardHealth(
  id: MetricId,
  delta: MetricDelta | null,
  firedRuleIds: readonly RuleId[]
): CardHealth | undefined {
  if (firedRuleIds.some((ruleId) => RULE_CARDS[ruleId]?.includes(id) === true)) {
    return 'investigate';
  }
  const direction = METRICS[id].healthDirection;
  if (direction === undefined || delta === null || delta.direction === 'flat') return undefined;
  return delta.direction === direction ? 'healthy' : 'investigate';
}
