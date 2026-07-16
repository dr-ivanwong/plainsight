/**
 * Bake-off scoring: an extraction result against the hand-typed golden
 * transcription, field for printed field (main plan section 6: measured, not
 * vibed; the accuracy gate reads 99.5% post-validation). Pure, so the
 * scorecard's arithmetic is testable without a model or a PDF.
 */

/** Which fiscal years each source document must yield, from the transcription. */
export function expectedYearsByDocument(transcription) {
  const byDocument = new Map();
  for (const year of transcription.years) {
    const existing = byDocument.get(year.document);
    if (existing === undefined) byDocument.set(year.document, [year]);
    else existing.push(year);
  }
  return byDocument;
}

const CANONICAL_ITEMS = [
  'revenue',
  'costOfRevenue',
  'grossProfit',
  'operatingIncome',
  'interestExpense',
  'pretaxIncome',
  'taxExpense',
  'netIncome',
  'dilutedShares',
  'cashAndEquivalents',
  'currentAssets',
  'totalAssets',
  'currentLiabilities',
  'shortTermDebt',
  'longTermDebt',
  'totalLiabilities',
  'totalEquity',
  'operatingCashFlow',
  'capex',
  'depreciationAmortisation',
  'dividendsPaid',
  'shareRepurchases'
];

const numbersEqual = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

/**
 * The transcription-side identity checks, in printed millions, with the
 * builder's tolerances: what "post-validation" means for the pass rate.
 */
export function gateOutcomes(extractedYear) {
  const value = (id) => {
    const field = extractedYear.fields[id];
    return field === undefined || 'notPrinted' in field ? undefined : field.value;
  };
  const tolerance = (larger) => Math.max(3, 0.001 * Math.abs(larger));
  const outcomes = {};

  const assets = value('totalAssets');
  const liabilities = value('totalLiabilities');
  const equity = value('totalEquity');
  if (assets !== undefined && liabilities !== undefined && equity !== undefined) {
    outcomes.balance = Math.abs(assets - (liabilities + equity)) <= tolerance(Math.max(Math.abs(assets), Math.abs(liabilities + equity)));
  }

  const revenue = value('revenue');
  const costOfRevenue = value('costOfRevenue');
  const grossProfit = value('grossProfit');
  if (revenue !== undefined && costOfRevenue !== undefined && grossProfit !== undefined) {
    const derived = revenue - costOfRevenue;
    outcomes.grossProfit = Math.abs(grossProfit - derived) <= tolerance(Math.max(Math.abs(grossProfit), Math.abs(derived)));
  }

  const netIncome = value('netIncome');
  const shares = value('dilutedShares');
  if (extractedYear.dilutedEps !== undefined && netIncome !== undefined && shares !== undefined && shares > 0) {
    const printed = extractedYear.dilutedEps.value;
    const unitFactor = extractedYear.dilutedEps.unit === 'cents' ? 100 : 1;
    const computed = ((netIncome * 1e6) / shares) * unitFactor;
    const decimals = (String(printed).split('.')[1] ?? '').length;
    outcomes.eps = Math.abs(computed - printed) <= 0.5 * 10 ** -decimals + Math.abs(printed) * 0.005;
  }

  return outcomes;
}

/**
 * One document's extraction against its expected transcription years.
 * A field the transcription prints and the extraction misses, misreads, or
 * wrongly marks not-printed is wrong; an 'nrz' transcription expects the
 * notPrinted state; items the transcription omits are not scored (the model
 * may honestly omit them too, and extras are noted, never penalised).
 */
export function scoreDocument(expectedYears, result, companyCurrency) {
  const returned = new Map((result?.years ?? []).map((year) => [year.fy, year]));
  const score = {
    fieldsExpected: 0,
    fieldsCorrect: 0,
    wrong: [],
    missingYears: [],
    gates: { applicable: 0, passed: 0 },
    extraYears: [...returned.keys()].filter(
      (fy) => !expectedYears.some((year) => year.fy === fy)
    )
  };

  for (const expected of expectedYears) {
    const extracted = returned.get(expected.fy);
    if (extracted === undefined) {
      score.missingYears.push(expected.fy);
      // Every expected field of a missing year counts against accuracy
      // (values, endDate, currency, and the printed EPS where the face
      // carries one): a silently dropped year must never read as clean.
      score.fieldsExpected +=
        Object.keys(expected.values).length + 2 + (expected.eps === undefined ? 0 : 1);
      continue;
    }

    for (const [meta, want, got] of [
      ['endDate', expected.endDate, extracted.endDate],
      ['currency', companyCurrency, extracted.currency]
    ]) {
      score.fieldsExpected += 1;
      if (got === want) score.fieldsCorrect += 1;
      else score.wrong.push({ fy: expected.fy, item: meta, expected: want, got });
    }

    for (const item of CANONICAL_ITEMS) {
      const want = expected.values[item];
      if (want === undefined) continue;
      score.fieldsExpected += 1;
      const field = extracted.fields[item];
      if (want === 'nrz') {
        if (field !== undefined && 'notPrinted' in field) score.fieldsCorrect += 1;
        else score.wrong.push({ fy: expected.fy, item, expected: 'not printed', got: field?.value });
        continue;
      }
      if (field === undefined || 'notPrinted' in field) {
        score.wrong.push({ fy: expected.fy, item, expected: want, got: field === undefined ? 'missing' : 'not printed' });
        continue;
      }
      if (numbersEqual(field.value, want)) score.fieldsCorrect += 1;
      else score.wrong.push({ fy: expected.fy, item, expected: want, got: field.value });
    }

    if (expected.eps !== undefined) {
      score.fieldsExpected += 1;
      if (extracted.dilutedEps !== undefined && numbersEqual(extracted.dilutedEps.value, expected.eps.diluted)) {
        score.fieldsCorrect += 1;
      } else {
        score.wrong.push({
          fy: expected.fy,
          item: 'dilutedEps',
          expected: expected.eps.diluted,
          got: extracted.dilutedEps?.value
        });
      }
    }

    const gates = gateOutcomes(extracted);
    for (const passed of Object.values(gates)) {
      score.gates.applicable += 1;
      if (passed) score.gates.passed += 1;
    }
  }

  return score;
}

/** Fold document scores into the per-rung scorecard row. */
export function aggregateScores(scores) {
  const totals = scores.reduce(
    (sum, entry) => ({
      fieldsExpected: sum.fieldsExpected + entry.score.fieldsExpected,
      fieldsCorrect: sum.fieldsCorrect + entry.score.fieldsCorrect,
      gatesApplicable: sum.gatesApplicable + entry.score.gates.applicable,
      gatesPassed: sum.gatesPassed + entry.score.gates.passed,
      missingYears: sum.missingYears + entry.score.missingYears.length,
      latencyMs: sum.latencyMs + entry.latencyMs,
      documents: sum.documents + 1,
      failures: sum.failures + (entry.failed ? 1 : 0)
    }),
    {
      fieldsExpected: 0,
      fieldsCorrect: 0,
      gatesApplicable: 0,
      gatesPassed: 0,
      missingYears: 0,
      latencyMs: 0,
      documents: 0,
      failures: 0
    }
  );
  return {
    ...totals,
    accuracy: totals.fieldsExpected === 0 ? 0 : totals.fieldsCorrect / totals.fieldsExpected,
    gatePassRate: totals.gatesApplicable === 0 ? 0 : totals.gatesPassed / totals.gatesApplicable,
    meanLatencyMs: totals.documents === 0 ? 0 : totals.latencyMs / totals.documents
  };
}
