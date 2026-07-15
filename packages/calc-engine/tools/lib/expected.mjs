/**
 * The independent expected-value computation behind every golden fixture:
 * floats over dollars, deliberately NOT the engine (integer minor units), so
 * a formula bug must be made twice, in two codebases, to slip through the
 * golden tests. Shared by the EDGAR fixture generator and the ASX fixture
 * builder; this module never imports from ../src.
 */

export const MINUS = '−';

export function fixed(value, dp) {
  let text = value.toFixed(dp);
  if (Number(text) === 0) text = (0).toFixed(dp);
  return text.startsWith('-') ? MINUS + text.slice(1) : text;
}
export const pct = (fraction) => `${fixed(fraction * 100, 1)}%`;
export const ratio = (value) => fixed(value, 2);
export const coverage = (value) => `${fixed(value, 1)}×`;

export function moneyCompact(minor, symbol = '$') {
  const major = minor / 100;
  const abs = Math.abs(major);
  if (abs === 0) return `${symbol}0`;
  const sign = major < 0 ? MINUS : '';
  const rounded = Number(abs.toPrecision(3));
  const parts = [
    [1e12, 't'],
    [1e9, 'b'],
    [1e6, 'm'],
    [1e3, 'k']
  ];
  let scaled = rounded;
  let suffix = '';
  for (const [divisor, s] of parts) {
    if (rounded >= divisor) {
      scaled = rounded / divisor;
      suffix = s;
      break;
    }
  }
  if (scaled >= 1000) return `${sign}${symbol}${Math.round(scaled)}t`;
  return `${sign}${symbol}${scaled.toPrecision(3)}${suffix}`;
}

export const okDisplay = (display, basis) =>
  basis ? { status: 'ok', display, basis } : { status: 'ok', display };
export const nm = (reason) => ({ status: 'not_meaningful', reason });
export const insufficient = (missing) => ({ status: 'insufficient_data', missing });

/** Resolved major-units value of an item, honouring the not-reported-zero state. */
export const V = (year, id) => {
  const entry = year.values[id];
  if (entry === undefined) return undefined;
  return entry.kind === 'not_reported_zero' ? 0 : entry.amountMinor / 100;
};
export const has = (year, id) => year.values[id] !== undefined;

export const BALANCE_CORE = [
  'cashAndEquivalents',
  'currentAssets',
  'totalAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'totalLiabilities',
  'totalEquity'
];
export const INCOME_CORE = [
  'revenue',
  'costOfRevenue',
  'operatingIncome',
  'interestExpense',
  'pretaxIncome',
  'taxExpense',
  'netIncome',
  'dilutedShares'
];
export const CASHFLOW_CORE = ['operatingCashFlow', 'capex'];

export const balanceComplete = (year) => BALANCE_CORE.every((id) => has(year, id));
export const fullComplete = (year) =>
  [...INCOME_CORE, ...BALANCE_CORE, ...CASHFLOW_CORE].every((id) => has(year, id));

export const REQUIREMENTS = {
  operatingMargin: ['revenue', 'operatingIncome'],
  netMargin: ['revenue', 'netIncome'],
  roe: ['netIncome', 'totalEquity'],
  roic: ['operatingIncome', 'taxExpense', 'pretaxIncome', 'shortTermDebt', 'longTermDebt', 'totalEquity', 'cashAndEquivalents'],
  debtToEquity: ['shortTermDebt', 'longTermDebt', 'totalEquity'],
  currentRatio: ['currentAssets', 'currentLiabilities'],
  interestCoverage: ['operatingIncome', 'interestExpense'],
  fcf: ['operatingCashFlow', 'capex'],
  fcfMargin: ['operatingCashFlow', 'capex', 'revenue'],
  fcfConversion: ['operatingCashFlow', 'capex', 'netIncome'],
  pe: ['netIncome', 'dilutedShares'],
  earningsYield: ['netIncome', 'dilutedShares'],
  fcfYield: ['operatingCashFlow', 'capex', 'dilutedShares']
};

export function missingFor(metric, year) {
  if (metric === 'grossMargin') {
    const missing = [];
    if (!has(year, 'revenue')) missing.push('revenue');
    if (!has(year, 'grossProfit') && !has(year, 'costOfRevenue')) missing.push('costOfRevenue');
    return missing;
  }
  return REQUIREMENTS[metric].filter((id) => !has(year, id));
}

export function investedCapital(year) {
  return V(year, 'shortTermDebt') + V(year, 'longTermDebt') + V(year, 'totalEquity') - V(year, 'cashAndEquivalents');
}

/**
 * Expected value for one metric in one year; mirrors the pinned dictionary
 * independently. The currency guard (data-model amendment of 2026-07-15)
 * never fires in fixtures by construction: fixture prices are set in the
 * statements' currency so the valuation metrics stay exercised.
 */
export function expectedMetric(metric, year, prior, priceMinor) {
  if (metric === 'pe' || metric === 'earningsYield' || metric === 'fcfYield') {
    if (priceMinor === undefined) return nm('no_price');
  }
  const missing = missingFor(metric, year);
  if (missing.length > 0) return insufficient(missing);

  const priceUsd = priceMinor === undefined ? undefined : priceMinor / 100;
  switch (metric) {
    case 'grossMargin': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      const gp = has(year, 'grossProfit') ? V(year, 'grossProfit') : V(year, 'revenue') - V(year, 'costOfRevenue');
      return okDisplay(pct(gp / revenue));
    }
    case 'operatingMargin': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct(V(year, 'operatingIncome') / revenue));
    }
    case 'netMargin': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct(V(year, 'netIncome') / revenue));
    }
    case 'roe': {
      const average = prior !== undefined && balanceComplete(prior);
      const denom = average ? (V(year, 'totalEquity') + V(prior, 'totalEquity')) / 2 : V(year, 'totalEquity');
      if (denom <= 0) return nm('negative_equity');
      return okDisplay(pct(V(year, 'netIncome') / denom), average ? 'average' : 'ending');
    }
    case 'roic': {
      const pretax = V(year, 'pretaxIncome');
      const rate = pretax <= 0 ? 0 : Math.min(Math.max(V(year, 'taxExpense') / pretax, 0), 0.45);
      const nopat = V(year, 'operatingIncome') * (1 - rate);
      const average = prior !== undefined && balanceComplete(prior);
      const denom = average ? (investedCapital(year) + investedCapital(prior)) / 2 : investedCapital(year);
      if (denom <= 0) return nm('negative_invested_capital');
      return okDisplay(pct(nopat / denom), average ? 'average' : 'ending');
    }
    case 'debtToEquity': {
      const equity = V(year, 'totalEquity');
      if (equity <= 0) return nm('negative_equity');
      return okDisplay(ratio((V(year, 'shortTermDebt') + V(year, 'longTermDebt')) / equity));
    }
    case 'currentRatio': {
      const cl = V(year, 'currentLiabilities');
      if (cl === 0) return nm('zero_denominator');
      return okDisplay(ratio(V(year, 'currentAssets') / cl));
    }
    case 'interestCoverage': {
      const interest = V(year, 'interestExpense');
      if (interest === 0) return nm('no_interest_expense');
      return okDisplay(coverage(V(year, 'operatingIncome') / interest));
    }
    case 'fcf': {
      const fcfUsd = V(year, 'operatingCashFlow') - V(year, 'capex');
      return okDisplay(moneyCompact(Math.round(fcfUsd * 100)));
    }
    case 'fcfMargin': {
      const revenue = V(year, 'revenue');
      if (revenue === 0) return nm('zero_revenue');
      return okDisplay(pct((V(year, 'operatingCashFlow') - V(year, 'capex')) / revenue));
    }
    case 'fcfConversion': {
      const ni = V(year, 'netIncome');
      if (ni <= 0) return nm('negative_earnings');
      return okDisplay(pct((V(year, 'operatingCashFlow') - V(year, 'capex')) / ni));
    }
    case 'pe': {
      const shares = V(year, 'dilutedShares') * 100; // V() divides by 100; shares are counts
      if (shares === 0) return nm('zero_denominator');
      const epsUsd = V(year, 'netIncome') / shares; // dollars per share
      if (epsUsd <= 0) return nm('negative_earnings');
      return okDisplay(ratio(priceUsd / epsUsd));
    }
    case 'earningsYield': {
      const shares = V(year, 'dilutedShares') * 100;
      if (shares === 0 || priceUsd === 0) return nm('zero_denominator');
      const epsUsd = V(year, 'netIncome') / shares;
      if (epsUsd <= 0) return nm('negative_earnings');
      return okDisplay(pct(epsUsd / priceUsd));
    }
    case 'fcfYield': {
      const shares = V(year, 'dilutedShares') * 100;
      const marketCapUsd = priceUsd * shares;
      if (marketCapUsd === 0) return nm('zero_denominator');
      const fcfUsd = V(year, 'operatingCashFlow') - V(year, 'capex');
      return okDisplay(pct(fcfUsd / marketCapUsd));
    }
    default:
      throw new Error(`unknown metric ${metric}`);
  }
}

// Independent rule evaluation; same interpretation notes as the engine docs.
export function expectedFlags(years) {
  const flags = [];
  const byYear = new Map(years.map((y) => [Number(y.fy.slice(2)), y]));
  const latest = years.at(-1);
  if (latest === undefined) return flags;
  const latestY = Number(latest.fy.slice(2));

  const win = (count) => {
    const out = [];
    for (let y = latestY - count + 1; y <= latestY; y += 1) {
      const yr = byYear.get(y);
      if (yr === undefined) return null;
      out.push(yr);
    }
    return out;
  };
  const vals = (window, id) => {
    const out = [];
    for (const yr of window) {
      const v = V(yr, id);
      if (v === undefined) return null;
      out.push(v);
    }
    return out;
  };
  const labels = (window) => window.map((y) => y.fy);
  const EPS = 1e-9;

  // Earnings quality
  {
    const window = win(3);
    if (window) {
      const ocf = vals(window, 'operatingCashFlow');
      const ni = vals(window, 'netIncome');
      if (ocf && ni && ocf.every((v, i) => v < ni[i])) {
        const cumOcf = ocf.reduce((a, b) => a + b, 0);
        const cumNi = ni.reduce((a, b) => a + b, 0);
        if (cumNi > 0 && cumOcf / cumNi < 0.9 - EPS) {
          flags.push({ ruleId: 'earningsQuality', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // Eroding moat: margins from raw values.
  {
    const marginOf = (yr, kind) => {
      const revenue = V(yr, 'revenue');
      if (revenue === undefined || revenue === 0) return null;
      if (kind === 'gross') {
        const gp = has(yr, 'grossProfit')
          ? V(yr, 'grossProfit')
          : has(yr, 'costOfRevenue')
            ? revenue - V(yr, 'costOfRevenue')
            : null;
        return gp === null ? null : gp / revenue;
      }
      const oi = V(yr, 'operatingIncome');
      return oi === undefined ? null : oi / revenue;
    };
    const streaks = [];
    for (const kind of ['gross', 'operating']) {
      let steps = 0;
      let cursor = latestY;
      let firstLabelYear = latestY;
      for (;;) {
        const current = byYear.get(cursor);
        const prior = byYear.get(cursor - 1);
        if (!current || !prior) break;
        const cv = marginOf(current, kind);
        const pv = marginOf(prior, kind);
        if (cv === null || pv === null) break;
        if (!(cv < pv - EPS)) break;
        steps += 1;
        firstLabelYear = cursor - 1;
        cursor -= 1;
      }
      if (steps > 0) {
        const from = marginOf(byYear.get(firstLabelYear), kind);
        const to = marginOf(latest, kind);
        if (steps >= 3 && from - to >= 0.02 - EPS) {
          streaks.push({ steps, firstLabelYear });
        }
      }
    }
    if (streaks.length > 0) {
      streaks.sort((a, b) => b.steps - a.steps);
      const worst = streaks[0];
      const window = [];
      for (let y = worst.firstLabelYear; y <= latestY; y += 1) window.push(byYear.get(y).fy);
      flags.push({ ruleId: 'erodingMoat', severity: worst.steps >= 5 ? 'red' : 'orange', window });
    }
  }

  // Ratio helpers over raw values for the remaining rules.
  const deOf = (yr) => {
    const equity = V(yr, 'totalEquity');
    const std = V(yr, 'shortTermDebt');
    const ltd = V(yr, 'longTermDebt');
    if (equity === undefined || std === undefined || ltd === undefined || equity <= 0) return null;
    return (std + ltd) / equity;
  };
  const roeOf = (yr, prior) => {
    const ni = V(yr, 'netIncome');
    const equity = V(yr, 'totalEquity');
    if (ni === undefined || equity === undefined) return null;
    const average = prior !== undefined && balanceComplete(prior);
    const denom = average ? (equity + V(prior, 'totalEquity')) / 2 : equity;
    return denom <= 0 ? null : ni / denom;
  };

  // Leverage-flattered returns
  {
    const window = win(4);
    if (window) {
      const [first, , , last] = window;
      const firstPrior = byYear.get(Number(first.fy.slice(2)) - 1);
      const lastPrior = byYear.get(latestY - 1);
      const deStart = deOf(first);
      const deEnd = deOf(last);
      const roeStart = roeOf(first, firstPrior);
      const roeEnd = roeOf(last, lastPrior);
      if (deStart !== null && deEnd !== null && roeStart !== null && roeEnd !== null) {
        if (deEnd - deStart >= 0.3 - EPS && roeEnd - roeStart <= 0.01 + EPS) {
          flags.push({ ruleId: 'leverageFlatteredReturns', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // Fragility
  {
    const interest = V(latest, 'interestExpense');
    const oi = V(latest, 'operatingIncome');
    if (interest !== undefined && interest !== 0 && oi !== undefined) {
      const cov = oi / interest;
      if (cov < 3.0 - EPS) {
        flags.push({ ruleId: 'fragility', severity: cov < 1.5 - EPS ? 'red' : 'orange', window: [latest.fy] });
      }
    }
  }

  // Dilution
  {
    const window = win(4);
    if (window) {
      const shares = vals(window, 'dilutedShares');
      const revenue = vals(window, 'revenue');
      if (shares && revenue && shares[0] > 0 && shares.at(-1) > 0 && revenue[0] > 0 && revenue.at(-1) > 0) {
        const shareCagr = (shares.at(-1) / shares[0]) ** (1 / 3) - 1;
        const revenueCagr = (revenue.at(-1) / revenue[0]) ** (1 / 3) - 1;
        if (shareCagr > 0.02 + EPS && revenueCagr < 2 * shareCagr - EPS) {
          flags.push({ ruleId: 'dilution', severity: 'orange', window: labels(window) });
        }
      }
    }
  }

  // Manufactured returns
  {
    const prior = byYear.get(latestY - 1);
    const roe = roeOf(latest, prior);
    const de = deOf(latest);
    if (roe !== null && de !== null && roe > 0.25 + EPS && de > 2.0 + EPS) {
      flags.push({ ruleId: 'manufacturedReturns', severity: 'orange', window: [latest.fy] });
    }
  }

  // Capital-intensity creep
  {
    const window = win(3);
    if (window) {
      const revenue = vals(window, 'revenue');
      const ocf = vals(window, 'operatingCashFlow');
      const capex = vals(window, 'capex');
      if (revenue && ocf && capex) {
        const fcf = ocf.map((v, i) => v - capex[i]);
        let fires = true;
        for (let i = 1; i < window.length; i += 1) {
          if (!(revenue[i] > revenue[i - 1] && fcf[i] < fcf[i - 1])) fires = false;
        }
        if (fires) flags.push({ ruleId: 'capitalIntensityCreep', severity: 'orange', window: labels(window) });
      }
    }
  }

  return flags;
}

export const METRIC_IDS = [
  'grossMargin',
  'operatingMargin',
  'netMargin',
  'roe',
  'roic',
  'debtToEquity',
  'currentRatio',
  'interestCoverage',
  'fcf',
  'fcfMargin',
  'fcfConversion',
  'pe',
  'earningsYield',
  'fcfYield'
];

/** Expected metrics for a whole fixture: per metric, per labelled year, prior only when consecutive. */
export function expectedMetricsFor(years, priceMinor) {
  const expectedMetrics = {};
  for (const metric of METRIC_IDS) {
    expectedMetrics[metric] = {};
    for (let i = 0; i < years.length; i += 1) {
      const prior =
        i > 0 && Number(years[i].fy.slice(2)) - Number(years[i - 1].fy.slice(2)) === 1
          ? years[i - 1]
          : undefined;
      expectedMetrics[metric][years[i].fy] = expectedMetric(metric, years[i], prior, priceMinor);
    }
  }
  return expectedMetrics;
}
