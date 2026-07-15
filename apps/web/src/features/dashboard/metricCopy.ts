/**
 * The detail sheet's education copy (frontend spec §3): a plain-language
 * explanation per metric, and the Owner's-lens paragraph shown while the
 * education layer is on. Items to understand, never advice; the app never
 * says buy or sell (main plan §15 posture).
 */
import type { MetricId, NotMeaningfulReason } from '@plainsight/calc-engine';

export interface MetricCopy {
  plain: string;
  ownersLens: string;
}

export const METRIC_COPY: Readonly<Record<MetricId, MetricCopy>> = {
  grossMargin: {
    plain:
      'What is left of each dollar of revenue after the direct cost of producing what was ' +
      'sold. It is the raw pricing power of the product itself, before the costs of running ' +
      'the business.',
    ownersLens:
      'A stable or widening gross margin over a decade suggests the product commands its ' +
      'price; a narrowing one suggests competition or input costs are winning. Compare it ' +
      'only within an industry, and read it beside revenue growth: margin given away to buy ' +
      'growth shows up here first.'
  },
  operatingMargin: {
    plain:
      'Operating income as a share of revenue: what the whole business keeps from each ' +
      'dollar after the costs of running it, before financing and tax.',
    ownersLens:
      'This is the margin management actually manages. Watch its trend against gross ' +
      'margin: a steady gross margin with a sliding operating margin means the cost of ' +
      'running the business is growing faster than the business itself.'
  },
  netMargin: {
    plain:
      'The share of revenue that survives everything: operating costs, interest and tax. ' +
      'The bottom line as a fraction of the top.',
    ownersLens:
      'Net margin is the noisiest margin, because one-off items, tax outcomes and interest ' +
      'all land here. Treat a sudden improvement with the same curiosity as a sudden ' +
      'decline, and trace either back through the operating line.'
  },
  roe: {
    plain:
      "Net income as a return on shareholders' equity: how hard the owners' capital worked " +
      'this year.',
    ownersLens:
      'A high return on equity can mean a wonderful business or a thin sliver of equity ' +
      'under a pile of debt; the debt-to-equity figure says which. Years of quietly high ' +
      'ROE on modest leverage is one of the most durable patterns a set of statements can ' +
      'show.'
  },
  roic: {
    plain:
      'After-tax operating profit as a return on all the capital invested in operations, ' +
      'debt and equity alike, net of cash. It asks whether the business earns well on the ' +
      'money it employs, however that money was raised.',
    ownersLens:
      'ROIC strips away the flattery of leverage that can inflate ROE. A business that can ' +
      'reinvest at a high ROIC compounds; one that cannot has to hand the cash back for the ' +
      'reinvestment case to make sense. The construction here is deliberately simple: no ' +
      'lease capitalisation, no goodwill adjustments.'
  },
  debtToEquity: {
    plain:
      "Total borrowings relative to shareholders' equity: how much of the business is " +
      'financed by lenders rather than owners.',
    ownersLens:
      'Leverage magnifies everything, returns on the way up and losses on the way down. ' +
      'The level a business can carry depends on how steady its earnings are; a grocer can ' +
      'live with what would sink a miner. Watch the trend more closely than the level.'
  },
  currentRatio: {
    plain:
      'Current assets against current liabilities: what is due to arrive within a year, ' +
      'measured against what is due to be paid within one.',
    ownersLens:
      'Below one is not automatically alarming; businesses that collect cash before they ' +
      'pay suppliers run lean current ratios by design. What deserves attention is a drift ' +
      'downward over several years without a stated reason.'
  },
  interestCoverage: {
    plain:
      "How many times operating income covers the year's interest expense: the headroom " +
      'between earnings and the cost of the debt.',
    ownersLens:
      'Coverage is the difference between a bad year and a dangerous one. Once it falls ' +
      'below about three times, an ordinary downturn starts to press on the dividend, the ' +
      'capital plan, or both; the debt notes show the maturities and covenants that decide ' +
      'how much time there is.'
  },
  fcf: {
    plain:
      'Operating cash flow less capital expenditure: the cash the business generated after ' +
      'maintaining and growing its asset base.',
    ownersLens:
      'Profits are an opinion; cash is a fact. A decade of free cash flow tracking reported ' +
      'earnings is the strongest evidence the earnings are real. This definition ignores ' +
      'share-based pay, because operating cash flow adds it back; the dilution flag watches ' +
      'that door instead.'
  },
  fcfMargin: {
    plain:
      'Free cash flow as a share of revenue: how many cents of each dollar of sales became ' +
      'spendable cash.',
    ownersLens:
      'Read it beside the operating margin. A wide gap between the two, sustained for ' +
      'years, means earnings and cash disagree, and the notes will say why: working ' +
      'capital, heavy capital spending, or accruals.'
  },
  fcfConversion: {
    plain:
      'Free cash flow relative to net income: how much of the reported profit turned into ' +
      'cash.',
    ownersLens:
      'Conversion near or above one, year after year, is the mark of earnings that can be ' +
      'trusted. Persistent conversion well below one asks where the profit went; growing ' +
      'receivables and capital spending are the usual answers.'
  },
  pe: {
    plain:
      'The share price relative to earnings per share: how many dollars the market asks ' +
      "for each dollar of this year's profit.",
    ownersLens:
      'A price-to-earnings ratio is shorthand, not a verdict. It embeds an expectation of ' +
      'growth, so a low multiple on falling earnings can cost more in the end than a high ' +
      'multiple on compounding ones. It reads best beside the decade of numbers behind it.'
  },
  earningsYield: {
    plain:
      'Earnings per share relative to the share price: the price-to-earnings ratio turned ' +
      'upside down and expressed as a yield.',
    ownersLens:
      'The yield form makes comparison natural: it reads like an interest rate on the ' +
      'price paid. Set it beside what long bonds pay, remembering that earnings can grow ' +
      'and coupons cannot.'
  },
  fcfYield: {
    plain:
      "Free cash flow relative to the company's market value: the cash return the whole " +
      "business generated on today's price.",
    ownersLens:
      'Of the valuation measures this is the hardest to dress up, because it starts from ' +
      'cash. A durable business owned at a healthy cash yield leaves room to be wrong ' +
      'about nearly everything else.'
  }
};

/** One sentence beside an n/m value, explaining why the number has no meaning this year. */
export const REASON_EXPLAINERS: Readonly<Record<NotMeaningfulReason, string>> = {
  negative_equity:
    'Liabilities exceed assets this year, so there is no positive equity base to measure a return on.',
  negative_earnings:
    'The company reported a loss this year, so a ratio built on earnings has nothing meaningful to divide.',
  negative_invested_capital:
    'Cash on hand exceeds the operating capital employed, so a return on invested capital has no meaningful base.',
  no_interest_expense:
    'There is no interest burden to cover this year; for coverage, that is a strength rather than a gap.',
  zero_revenue: 'With no revenue in the year, a margin has nothing to measure against.',
  zero_denominator: 'The denominator is zero this year, so the ratio is undefined.',
  no_price: "Valuation needs a share price; enter today's price from the dashboard.",
  currency_mismatch:
    'The entered price is in a different currency from the statements, and the app never ' +
    'converts; re-enter the price in the reporting currency to value against these figures.'
};
