# Recorded companyfacts fixtures

Pruned SEC EDGAR `companyfacts` documents for the five Phase 0 golden companies, recorded by [`tools/record-companyfacts.mjs`](../../../tools/record-companyfacts.mjs). The mapping golden tests run `mapCompanyfacts` over these and require integer equality with the hand-verified calc-engine fixtures' line items, which makes the production mapping answerable to the same corpus the engine is.

**Pruning is exactly the mapping's field of view:** the concepts in the recorder's kept-concepts list (a test pins it as a superset of the mapping's candidates), 10-K and 10-K/A facts only, six fields per fact. Nothing the mapping can see is altered, so equality over the pruned document implies equality over the full one.

**When to re-record:** whenever a mapping candidate list widens (the pinning test fails until the recorder's list and these files catch up), or when the calc-engine fixtures are regenerated to include newer filings. Regenerate with:

```
EDGAR_CONTACT=you@example.com node tools/record-companyfacts.mjs
```

The contact address is required (SEC fair-access policy) and is never hardcoded in the repo. The script makes six requests total, sequentially, under the etiquette ceiling (backend spec section 9).
