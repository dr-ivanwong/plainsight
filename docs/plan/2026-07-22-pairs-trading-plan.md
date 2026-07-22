# Pairs Trading Strategy: Proof-of-Concept Plan
## Bootstrap Quant Fund | $100K POC Capital | 1 Engineer

---

## Executive Summary

**Goal:** Prove the pairs trading edge exists via 16-week proof-of-concept before scaling to $500K-$1M.

**Two-Stage Approach:**

**Stage 1: Validation (Weeks 1-8, FREE)**
- Weeks 1-2: Identify 5-10 cointegrated pairs
- Weeks 3-4: Validate pairs via backtesting
- Weeks 5-8: Paper trading (live system, simulated capital)

**Stage 2: POC (Weeks 9-20, $100K capital)**
- Weeks 9-12: Live trading, 2 pairs, $60K deployed
- Weeks 13-20: Monitor + scale to 3 pairs, $80-100K deployed
- Week 20: Go/no-go decision on scaling to $500K

**Capital Allocation:**
- Research/backtest: FREE (using EOD data + EODHD free tier)
- Paper trading: FREE (IB sim account)
- Live POC: $100K across 2-3 pairs
- Monthly costs: AUD $50 (EODHD if paid tier) or FREE (limited free tier)

**Success Criteria for POC:**
- **Live Sharpe > 1.4** (≥77% of backtest Sharpe)
- Maximum drawdown: < 12%
- Win rate: > 45%
- Consistency: In-sample vs. out-of-sample ≈ live (no surprise degradation)

**Outcome at Week 20:**
- If POC succeeds: **Scale to $500K-$1M AUM**
- If POC fails: **Pivot to Strategy #2 or iterate on pairs selection**
- Cost of learning if wrong: $100K (acceptable risk cost)

---

## PHASE 1: RESEARCH (Weeks 1–2)
### Find Cointegrated Pairs

### Week 1: Data Collection & Cointegration Testing

#### Objectives
- Download 5 years of daily EOD data for top 50 ASX stocks
- Test all pairs for statistical cointegration
- Identify 10-20 candidate pairs with p-value < 0.05

#### Detailed Steps

##### Step 1.1: Set Up Environment
```bash
# Create project directory
mkdir pairs_trading_system
cd pairs_trading_system

# Create Python environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install pandas numpy scipy statsmodels matplotlib scikit-learn
```

##### Step 1.2: Download Data
Use one of these sources (pick ONE):

**Option A: EODHD (Easiest)**
```python
# Free tier: 20 API calls/day, data > 15 min old
# Paid tier: $50-100/month for commercial use

from eodhdc import EODHDClient
import pandas as pd

client = EODHDClient("requests", key="YOUR_API_KEY")

# Top 50 ASX stocks by market cap
candidates = [
    'CBA', 'NAB', 'ANZ', 'WBC', 'BOQ',                    # Banks (5)
    'BHP', 'RIO', 'FMG', 'GLD', 'S32',                    # Miners (5)
    'CSL', 'WES', 'COL', 'SHL', 'AZJ',                    # Healthcare/Diversified (5)
    'TLS', 'VAS', 'TCL', 'APA', 'STO',                    # Utilities/Energy (5)
    'MQG', 'ALL', 'QBE', 'NHF', 'MGR',                    # Financials/Services (5)
    'AGL', 'ASX', 'IAG', 'AWC', 'GMG',                    # Energy/Materials (5)
    'SEK', 'JHG', 'SKI', 'CDA', 'WHC',                    # Diversified (5)
    'DXN', 'REA', 'ORI', 'SCG', 'ASR',                    # Real Estate/Services (5)
    'EVN', 'LLC', 'URW', 'WOW', 'CWY',                    # Retail/Energy (5)
    'APT', 'WTC', 'SGP', 'EQT', 'XRO',                    # Growth/Tech (5)
]

data = {}
for ticker in candidates:
    try:
        df = client.market.historical(
            f'{ticker}.AU',
            start='2019-01-01',
            end='2024-01-01',
            fmt='json'
        )
        df_pd = pd.DataFrame(df)
        df_pd['date'] = pd.to_datetime(df_pd['date'])
        data[ticker] = df_pd.set_index('date')['close']
        print(f"✓ {ticker}: {len(df_pd)} days")
    except Exception as e:
        print(f"✗ {ticker}: {e}")

# Save to CSV for backup
for ticker, series in data.items():
    series.to_csv(f'data/{ticker}_2019_2024.csv')
```

**Option B: Interactive Brokers**
```python
# More complex but more data sources
# Requires TWS running, minimum $500 account

from ib_insync import IB, Stock
import pandas as pd
import asyncio

async def get_historical(ticker):
    ib = IB()
    await ib.connectAsync('127.0.0.1', 7497)
    
    contract = Stock(ticker, 'ASX', 'AUD')
    bars = await ib.reqHistoricalDataAsync(
        contract,
        endDateTime='',
        durationStr='5 Y',
        barSizeSetting='1 day',
        whatToShow='TRADES',
        useRTH=True
    )
    
    df = pd.DataFrame([(b.date, b.close) for b in bars], 
                      columns=['date', 'close'])
    df.set_index('date', inplace=True)
    
    await ib.disconnectAsync()
    return df['close']

# Download all tickers
for ticker in candidates:
    data[ticker] = asyncio.run(get_historical(ticker))
```

**Deliverable:** 
- Data files: `data/{TICKER}_2019_2024.csv` (50 files)
- All files have same date range and no NaN values
- Check: `len(data['CBA']) == len(data['BHP'])` (should be True)

---

##### Step 1.3: Test All Pairs for Cointegration

```python
import pandas as pd
import numpy as np
from statsmodels.tsa.stattools import coint
import itertools
import os

# Load data
data = {}
for fname in os.listdir('data'):
    ticker = fname.split('_')[0]
    data[ticker] = pd.read_csv(f'data/{fname}', index_col='date', parse_dates=True)['close']

print(f"Loaded {len(data)} tickers\n")

# Test cointegration for ALL pairs
# Expected: ~C(50,2) = 1,225 pairs
print("Testing pairs for cointegration...")
results = []
pair_count = 0

for ticker1, ticker2 in itertools.combinations(sorted(data.keys()), 2):
    pair_count += 1
    
    price1 = data[ticker1].values
    price2 = data[ticker2].values
    
    # Engle-Granger cointegration test
    # H0: NOT cointegrated
    # If p < 0.05, reject H0 → they ARE cointegrated
    try:
        score, pvalue, _ = coint(price1, price2)
    except:
        continue
    
    if pvalue < 0.05:  # Only keep significant pairs
        # Calculate hedge ratio (OLS regression)
        # price1 = alpha + beta * price2 + error
        X = np.column_stack([price2, np.ones(len(price2))])
        coeffs = np.linalg.lstsq(X, price1, rcond=None)[0]
        beta = coeffs[0]
        
        results.append({
            'ticker1': ticker1,
            'ticker2': ticker2,
            'pvalue': pvalue,
            'beta': beta,
            'correlation': np.corrcoef(price1, price2)[0, 1],
        })
    
    # Print progress
    if pair_count % 200 == 0:
        print(f"  Tested {pair_count} pairs, found {len(results)} cointegrated")

results_df = pd.DataFrame(results)
results_df = results_df.sort_values('pvalue')

print(f"\n✅ COINTEGRATION TEST COMPLETE")
print(f"Total pairs tested: {pair_count}")
print(f"Cointegrated pairs (p < 0.05): {len(results_df)}")
print(f"\nTop 20 by p-value (strongest):\n")
print(results_df.head(20).to_string(index=False))

# Save results
results_df.to_csv('week1_cointegrated_pairs.csv', index=False)
```

**Acceptance Criteria:**
- [ ] Minimum 20 cointegrated pairs found (p < 0.05)
- [ ] All beta values are positive (same-direction relationship)
- [ ] Results saved to `week1_cointegrated_pairs.csv`

**Deliverable:**
```
week1_cointegrated_pairs.csv

ticker1 ticker2  pvalue    beta  correlation
BHP     RIO      0.00009  1.2345  0.945
NAB     ANZ      0.00023  0.8765  0.932
CBA     NAB      0.00051  0.9123  0.928
...
```

---

### Week 2: Metric Calculation & Pair Selection

#### Objectives
- Calculate half-life (how fast spread reverts)
- Calculate Sharpe ratio (historical return per risk)
- Select final 5-10 pairs for backtesting

#### Detailed Steps

##### Step 2.1: Calculate Half-Life

**Concept:** How many days does the spread take to revert halfway back to its mean?

**Formula:**
```
spread_t = spread_0 * exp(-lambda * t)
half_life = -ln(2) / lambda
where lambda is the decay coefficient
```

**Code:**
```python
import pandas as pd
import numpy as np
from scipy import stats

def calculate_half_life(ticker1, ticker2, beta, data, lookback=60):
    """
    Calculate half-life of mean reversion for a spread.
    
    Returns:
        half_life (float): Days to mean revert 50%
        half_life_valid (bool): Is half-life realistic?
    """
    price1 = data[ticker1].values
    price2 = data[ticker2].values
    
    # Calculate spread
    spread = price1 - beta * price2
    
    # Normalize for regression
    spread_normalized = (spread - np.mean(spread)) / np.std(spread)
    
    # Regression: spread_t+1 = alpha + lambda * spread_t + error
    # We want: d(spread) = lambda * spread
    spread_diffs = np.diff(spread_normalized)
    spread_lag = spread_normalized[:-1]
    
    # OLS regression
    slope, intercept, r_value, p_value, std_err = stats.linregress(spread_lag, spread_diffs)
    
    # Half-life calculation
    if slope < 0:
        half_life = -np.log(2) / slope
    else:
        # Not mean-reverting (slope >= 0)
        return np.inf, False
    
    # Sanity checks
    valid = (
        0 < half_life < 120 and      # Between 0 and 120 days
        p_value < 0.05 and            # Statistically significant
        abs(r_value) > 0.1             # Some explanatory power
    )
    
    return half_life, valid

# Load cointegrated pairs
pairs_df = pd.read_csv('week1_cointegrated_pairs.csv')

print("Calculating half-life for all cointegrated pairs...\n")
metrics = []

for idx, row in pairs_df.iterrows():
    ticker1 = row['ticker1']
    ticker2 = row['ticker2']
    beta = row['beta']
    
    try:
        half_life, is_valid = calculate_half_life(ticker1, ticker2, beta, data)
        metrics.append({
            'ticker1': ticker1,
            'ticker2': ticker2,
            'pvalue': row['pvalue'],
            'beta': beta,
            'half_life': half_life,
            'half_life_valid': is_valid,
        })
    except Exception as e:
        print(f"Error for {ticker1}-{ticker2}: {e}")

metrics_df = pd.DataFrame(metrics)
print(f"Half-life calculations complete: {len(metrics_df)} pairs\n")
print(metrics_df.sort_values('half_life').head(15).to_string(index=False))

metrics_df.to_csv('week2_metrics_halflife.csv', index=False)
```

**Expected Output:**
```
ticker1 ticker2  pvalue    beta  half_life  half_life_valid
BHP     RIO      0.00009  1.2345      12.3            True
NAB     ANZ      0.00023  0.8765      15.2            True
CBA     NAB      0.00051  0.9123      18.1            True
```

**Interpretation:**
- half_life < 15 days: Excellent (fast reversion = good for trading)
- half_life 15-30 days: Good (acceptable)
- half_life > 30 days: Marginal (too slow, capital idle)
- half_life > 120 days or inf: Bad (not mean-reverting)

---

##### Step 2.2: Calculate Sharpe Ratio

```python
def calculate_sharpe(ticker1, ticker2, beta, data, lookback=60, entry_zscore=2.0):
    """
    Calculate annualized Sharpe ratio of the spread trading signal.
    
    Assumes we go long the spread when z < -2.0 and short when z > 2.0
    """
    price1 = data[ticker1].values
    price2 = data[ticker2].values
    
    # Calculate spread
    spread = price1 - beta * price2
    
    # Rolling mean and std
    df = pd.DataFrame({'spread': spread})
    df['mean'] = df['spread'].rolling(lookback).mean()
    df['std'] = df['spread'].rolling(lookback).std()
    
    # Z-score
    df['z_score'] = (df['spread'] - df['mean']) / df['std']
    
    # Simple trading rule for estimation:
    # Long spread when z < -2, short when z > 2, exit when |z| < 0.5
    df['signal'] = 0
    df.loc[df['z_score'] < -entry_zscore, 'signal'] = 1
    df.loc[df['z_score'] > entry_zscore, 'signal'] = -1
    
    # P&L
    df['spread_return'] = df['spread'].pct_change()
    df['pnl'] = df['signal'].shift(1) * df['spread_return']
    
    # Remove NaN (warm-up period)
    df = df.iloc[lookback:]
    
    # Calculate Sharpe
    if len(df) > 0 and df['pnl'].std() > 0:
        daily_sharpe = df['pnl'].mean() / df['pnl'].std()
        annual_sharpe = daily_sharpe * np.sqrt(252)
    else:
        annual_sharpe = 0
    
    return annual_sharpe

# Calculate Sharpe for all pairs
print("Calculating Sharpe ratio for all pairs...\n")

sharpe_results = []
for idx, row in metrics_df.iterrows():
    ticker1 = row['ticker1']
    ticker2 = row['ticker2']
    beta = row['beta']
    
    try:
        sharpe = calculate_sharpe(ticker1, ticker2, beta, data)
        sharpe_results.append({
            'ticker1': ticker1,
            'ticker2': ticker2,
            'sharpe': sharpe,
            'half_life': row['half_life'],
            'pvalue': row['pvalue'],
            'beta': beta,
        })
    except:
        pass

sharpe_df = pd.DataFrame(sharpe_results)
sharpe_df = sharpe_df.sort_values('sharpe', ascending=False)

print(f"Sharpe calculations complete: {len(sharpe_df)} pairs\n")
print("Top 15 by Sharpe ratio:\n")
print(sharpe_df.head(15).to_string(index=False))

sharpe_df.to_csv('week2_metrics_sharpe.csv', index=False)
```

**Expected Output:**
```
ticker1 ticker2  sharpe  half_life  pvalue    beta
BHP     RIO       2.145       12.3  0.00009  1.2345
NAB     ANZ       1.873       15.2  0.00023  0.8765
CBA     NAB       1.652       18.1  0.00051  0.9123
```

---

##### Step 2.3: Final Pair Selection

```python
# Load all metrics
sharpe_df = pd.read_csv('week2_metrics_sharpe.csv')

# Filter for "good" pairs
# Criteria: Sharpe > 1.5, half-life < 30 days, p-value < 0.05
final_pairs = sharpe_df[
    (sharpe_df['sharpe'] > 1.5) &
    (sharpe_df['half_life'] < 30) &
    (sharpe_df['pvalue'] < 0.01)
].copy()

final_pairs = final_pairs.sort_values('sharpe', ascending=False)

print(f"\n{'='*70}")
print(f"FINAL PAIRS SELECTED FOR BACKTESTING")
print(f"{'='*70}\n")
print(final_pairs.head(10).to_string(index=False))
print(f"\n{len(final_pairs)} pairs passed all filters\n")

# Detailed summary
print("\nSelection Criteria:")
print("  ✓ Sharpe > 1.5 (profitable)")
print("  ✓ Half-life < 30 days (fast reversion)")
print("  ✓ p-value < 0.01 (highly significant)\n")

final_pairs.to_csv('week2_final_pairs_for_backtest.csv', index=False)

print(f"✅ Saved to: week2_final_pairs_for_backtest.csv")
```

**Acceptance Criteria:**
- [ ] Minimum 5 pairs selected
- [ ] All pairs have Sharpe > 1.5
- [ ] All pairs have half-life < 30 days
- [ ] File saved: `week2_final_pairs_for_backtest.csv`

**Deliverable:**
```
week2_final_pairs_for_backtest.csv

ticker1 ticker2  sharpe  half_life  pvalue    beta
BHP     RIO       2.145       12.3  0.00009  1.2345
NAB     ANZ       1.873       15.2  0.00023  0.8765
CBA     NAB       1.652       18.1  0.00051  0.9123
WPL     STO       1.423       22.1  0.00078  1.1234
CSL     WES       1.312       25.3  0.00145  0.7654
```

---

## PHASE 2: BACKTEST (Weeks 3–4)
### Validate Pairs via Simulated Trading

### Week 3: Full Period Backtest

#### Objectives
- Simulate trading each pair over 5 years of historical data
- Measure: Sharpe, drawdown, win rate, # of trades
- Select top 5 pairs for deployment

#### Detailed Steps

##### Step 3.1: Build Backtest Engine

```python
import pandas as pd
import numpy as np

def backtest_pair(ticker1, ticker2, beta, data,
                  entry_zscore=2.0, exit_zscore=0.5,
                  lookback=60):
    """
    Backtest a single pair trading strategy.
    
    Strategy:
    - When spread z-score > 2.0: SHORT spread (short ticker1, long ticker2)
    - When spread z-score < -2.0: LONG spread (long ticker1, short ticker2)
    - When |z-score| < 0.5: EXIT position
    
    Returns:
        dict with backtest metrics
    """
    price1 = data[ticker1].values
    price2 = data[ticker2].values
    dates = data[ticker1].index
    
    # Calculate spread
    spread = price1 - beta * price2
    
    # Create DataFrame
    df = pd.DataFrame({
        'date': dates,
        'price1': price1,
        'price2': price2,
        'spread': spread,
    })
    df.set_index('date', inplace=True)
    
    # Rolling statistics (60-day window)
    df['spread_mean'] = df['spread'].rolling(lookback).mean()
    df['spread_std'] = df['spread'].rolling(lookback).std()
    
    # Z-score
    df['z_score'] = (df['spread'] - df['spread_mean']) / df['spread_std']
    
    # Trading signals
    df['signal'] = 0
    df.loc[df['z_score'] > entry_zscore, 'signal'] = -1   # Short spread
    df.loc[df['z_score'] < -entry_zscore, 'signal'] = 1   # Long spread
    df.loc[np.abs(df['z_score']) < exit_zscore, 'signal'] = 0  # Exit
    
    # Forward-fill signal (hold until exit)
    df['signal'] = df['signal'].fillna(method='ffill').fillna(0)
    
    # Daily spread returns
    df['spread_return'] = df['spread'].pct_change()
    
    # P&L
    df['pnl'] = df['signal'].shift(1) * df['spread_return']
    
    # Remove warm-up period
    df = df.iloc[lookback:]
    
    # Calculate metrics
    cumulative_pnl = (1 + df['pnl']).cumprod()
    
    total_return = (cumulative_pnl.iloc[-1] - 1) * 100  # %
    total_return_annualized = total_return * 252 / len(df)  # Annualized
    
    # Sharpe ratio
    daily_sharpe = df['pnl'].mean() / df['pnl'].std() if df['pnl'].std() > 0 else 0
    annual_sharpe = daily_sharpe * np.sqrt(252)
    
    # Maximum drawdown
    running_max = cumulative_pnl.expanding().max()
    drawdown = (cumulative_pnl - running_max) / running_max
    max_drawdown = drawdown.min() * 100  # %
    
    # Trade statistics
    trades = (df['signal'].diff() != 0).sum()
    winning_trades = (df['pnl'] > 0).sum()
    losing_trades = (df['pnl'] < 0).sum()
    win_rate = winning_trades / (winning_trades + losing_trades) * 100 if (winning_trades + losing_trades) > 0 else 0
    
    # Profit factor
    gross_profit = df[df['pnl'] > 0]['pnl'].sum()
    gross_loss = abs(df[df['pnl'] < 0]['pnl'].sum())
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
    
    return {
        'ticker1': ticker1,
        'ticker2': ticker2,
        'pair': f'{ticker1}-{ticker2}',
        'beta': beta,
        'total_return': total_return,
        'annual_sharpe': annual_sharpe,
        'max_drawdown': max_drawdown,
        'num_trades': trades,
        'win_rate': win_rate,
        'profit_factor': profit_factor,
        'pnl_series': df['pnl'],
        'cumulative_pnl': cumulative_pnl,
    }

# Load pairs to backtest
pairs_to_test = pd.read_csv('week2_final_pairs_for_backtest.csv')

print("=" * 70)
print("BACKTESTING PAIRS")
print("=" * 70 + "\n")

backtest_results = []

for idx, row in pairs_to_test.iterrows():
    ticker1 = row['ticker1']
    ticker2 = row['ticker2']
    beta = row['beta']
    
    print(f"Testing {ticker1}-{ticker2}...", end=' ')
    
    try:
        result = backtest_pair(ticker1, ticker2, beta, data)
        backtest_results.append(result)
        
        print(f"Sharpe: {result['annual_sharpe']:>6.2f}  DD: {result['max_drawdown']:>7.1f}%  Trades: {result['num_trades']:>4.0f}")
    except Exception as e:
        print(f"FAILED: {e}")

# Summary DataFrame
results_df = pd.DataFrame([
    {k: v for k, v in r.items() if k not in ['pnl_series', 'cumulative_pnl']}
    for r in backtest_results
])

results_df = results_df.sort_values('annual_sharpe', ascending=False)

print(f"\n{'='*70}")
print(f"BACKTEST RESULTS")
print(f"{'='*70}\n")
print(results_df.to_string(index=False))

# Save results
results_df.to_csv('week3_backtest_results.csv', index=False)

print(f"\n✅ Saved to: week3_backtest_results.csv")
```

**Acceptance Criteria:**
- [ ] All 5+ pairs backtested successfully
- [ ] Results saved to `week3_backtest_results.csv`
- [ ] At least 3 pairs have Sharpe > 1.5 and DD < -15%

**Deliverable:**
```
week3_backtest_results.csv

pair      beta  total_return  annual_sharpe  max_drawdown  num_trades  win_rate  profit_factor
BHP-RIO   1.23        185.4           2.15          -8.3         284      47.2         2.34
NAB-ANZ   0.88        142.3           1.87         -10.1         301      46.8         2.01
CBA-NAB   0.91        128.5           1.65         -11.9         318      45.3         1.78
WPL-STO   1.12         98.7           1.42         -13.2         356      44.1         1.54
CSL-WES   0.77         76.4           1.31         -14.8         389      43.2         1.35
```

---

##### Step 3.2: Analyze Results & Select Live Candidates

```python
# Load backtest results
results_df = pd.read_csv('week3_backtest_results.csv')

# Filter for "live-able" pairs
# Criteria: Sharpe > 1.5, max DD > -15%, win rate > 45%
live_candidates = results_df[
    (results_df['annual_sharpe'] > 1.5) &
    (results_df['max_drawdown'] > -0.15) &
    (results_df['win_rate'] > 0.45)
].copy()

live_candidates = live_candidates.sort_values('annual_sharpe', ascending=False)

print("\n" + "="*70)
print("PAIRS PASSING BACKTEST FILTERS")
print("="*70 + "\n")

print(f"Filter 1: Sharpe > 1.5 (profitable)")
print(f"Filter 2: Max DD > -15% (manageable risk)")
print(f"Filter 3: Win rate > 45% (adequate frequency)\n")

print(live_candidates.to_string(index=False))
print(f"\n{len(live_candidates)} pairs qualified for deployment\n")

live_candidates.to_csv('week3_live_candidates.csv', index=False)
```

---

### Week 4: Out-of-Sample Validation

#### Objectives
- Test each pair on completely separate ("unseen") data
- Ensure strategy isn't overfit to historical period
- Final go/no-go decision

#### Detailed Steps

##### Step 4.1: Train/Test Split Backtest

```python
def backtest_train_test_split(ticker1, ticker2, beta, data,
                               train_pct=0.8,
                               entry_zscore=2.0, exit_zscore=0.5,
                               lookback=60):
    """
    Backtest with temporal train/test split.
    
    Train: First 80% of data (2019-2022)
    Test: Last 20% of data (2023-2024, unseen by model)
    
    This prevents overfitting to a specific historical period.
    """
    price1 = data[ticker1].values
    price2 = data[ticker2].values
    dates = data[ticker1].index
    
    # Split point
    split_idx = int(len(price1) * train_pct)
    split_date = dates[split_idx]
    
    print(f"  Train: {dates[0].date()} - {dates[split_idx-1].date()}")
    print(f"  Test:  {dates[split_idx].date()} - {dates[-1].date()}")
    
    # TRAIN period: calculate rolling statistics
    train_spread = price1[:split_idx] - beta * price2[:split_idx]
    
    # For each point in test set, use TRAIN period stats
    test_price1 = price1[split_idx:]
    test_price2 = price2[split_idx:]
    test_spread = test_price1 - beta * test_price2
    
    # Use TRAIN mean/std (don't look-ahead)
    train_mean = np.mean(train_spread)
    train_std = np.std(train_spread)
    
    # Z-score on test set using train statistics
    test_z = (test_spread - train_mean) / train_std
    
    # Signals on test set only
    signals = np.zeros(len(test_z))
    signals[test_z > entry_zscore] = -1
    signals[test_z < -entry_zscore] = 1
    signals[np.abs(test_z) < exit_zscore] = 0
    
    # P&L on test set
    test_returns = np.diff(test_spread) / np.abs(test_spread[:-1])
    pnl = signals[:-1] * test_returns
    
    # Metrics
    cumulative = np.cumprod(1 + pnl)
    total_return = (cumulative[-1] - 1) * 100
    
    sharpe = (np.mean(pnl) / np.std(pnl) * np.sqrt(252)) if np.std(pnl) > 0 else 0
    
    max_dd = ((cumulative / np.maximum.accumulate(cumulative)) - 1).min() * 100
    win_rate = (pnl > 0).mean() * 100
    
    return {
        'pair': f'{ticker1}-{ticker2}',
        'train_period': f'{dates[0].date()}-{dates[split_idx-1].date()}',
        'test_period': f'{dates[split_idx].date()}-{dates[-1].date()}',
        'oos_return': total_return,
        'oos_sharpe': sharpe,
        'oos_max_dd': max_dd,
        'oos_win_rate': win_rate,
    }

# Load candidates
candidates = pd.read_csv('week3_live_candidates.csv')

print("\n" + "="*70)
print("OUT-OF-SAMPLE VALIDATION (Train/Test Split)")
print("="*70 + "\n")

oos_results = []

for idx, row in candidates.iterrows():
    ticker1 = row['ticker1']
    ticker2 = row['ticker2']
    beta = row['beta']
    
    print(f"\n{ticker1}-{ticker2}:")
    
    try:
        result = backtest_train_test_split(ticker1, ticker2, beta, data)
        oos_results.append(result)
        
        print(f"  OOS Sharpe: {result['oos_sharpe']:>6.2f}")
        print(f"  OOS DD: {result['oos_max_dd']:>7.1f}%")
    except Exception as e:
        print(f"  FAILED: {e}")

oos_df = pd.DataFrame(oos_results)
oos_df = oos_df.sort_values('oos_sharpe', ascending=False)

print(f"\n{'='*70}")
print(f"OUT-OF-SAMPLE RESULTS")
print(f"{'='*70}\n")
print(oos_df.to_string(index=False))

oos_df.to_csv('week4_oos_validation.csv', index=False)
```

**Acceptance Criteria:**
- [ ] OOS Sharpe within 80% of in-sample Sharpe (not overfit)
- [ ] Minimum 3 pairs pass OOS validation
- [ ] Results saved to `week4_oos_validation.csv`

**Example:**
```
In-sample Sharpe: 2.15
OOS Sharpe: 1.87  (87% of in-sample ✓)
→ Good validation, not overfit
```

vs.

```
In-sample Sharpe: 2.15
OOS Sharpe: 0.81  (38% of in-sample ✗)
→ Significant degradation, likely overfit
```

---

##### Step 4.2: Final Deployment Decision

```python
# Load OOS results
oos_df = pd.read_csv('week4_oos_validation.csv')

# Final filter: OOS Sharpe > 1.2
final_live_pairs = oos_df[
    oos_df['oos_sharpe'] > 1.2
].sort_values('oos_sharpe', ascending=False)

print("\n" + "="*70)
print("FINAL PAIRS APPROVED FOR LIVE DEPLOYMENT")
print("="*70 + "\n")

for idx, row in final_live_pairs.iterrows():
    print(f"✅ {row['pair']:<10} OOS Sharpe: {row['oos_sharpe']:>6.2f}")

print(f"\nTotal pairs ready: {len(final_live_pairs)}")
print(f"\n✨ READY FOR WEEK 5 DEPLOYMENT\n")

final_live_pairs.to_csv('week4_final_live_pairs.csv', index=False)
```

**Deliverable:**
```
week4_final_live_pairs.csv

pair      train_period           test_period             oos_return  oos_sharpe  oos_max_dd  oos_win_rate
BHP-RIO   2019-01-02-2022-05-16  2022-05-17-2024-01-01       142.3        1.87       -11.2        46.1
NAB-ANZ   2019-01-02-2022-05-16  2022-05-17-2024-01-01       118.4        1.73       -12.8        45.3
CBA-NAB   2019-01-02-2022-05-16  2022-05-17-2024-01-01       104.2        1.54       -13.5        44.2
```

---

## PHASE 3: PAPER TRADING (Weeks 5–8)
### Risk-Free Live System Validation

### Objectives
- Run complete live system against IB paper trading account
- Verify signals execute without errors
- Test data feeds, monitoring dashboard, risk controls
- Confirm system latency/infrastructure ready for real capital
- **Zero real capital at risk**

### Week 5-8: Paper Trading Setup & Execution

#### Step 5.1: Interactive Brokers Paper Account

**Setup (30 min):**
1. Log into IB account (already created for real trading)
2. Enable TWS Paper Trading mode
3. Set paper account starting balance: $100K
4. Deploy same 2 pairs as planned for live

**Run system identically to live:**
```python
# Same code as weeks 9+, but against paper account
# Only change: clientId=2 (for paper) instead of clientId=1 (for live)

async def main():
    pairs_config = [
        {'ticker1': 'BHP', 'ticker2': 'RIO', 'beta': 1.2345, 'capital': 50000},
        {'ticker1': 'NAB', 'ticker2': 'ANZ', 'beta': 0.8765, 'capital': 50000},
    ]
    
    trader = PairsTrader(pairs_config)
    await trader.connect('127.0.0.1', 7497, clientId=2)  # Paper trading
    await trader.daily_rebalance()
    await trader.disconnect()
```

**Run for 4 weeks (20 trading days).**

#### Step 5.2: Paper Trading Acceptance Criteria

- [ ] System runs daily without manual intervention (cron job)
- [ ] All signals execute correctly (no stuck orders)
- [ ] Dashboard updates with real-time data
- [ ] Logs record every trade, slippage, cost
- [ ] Risk controls trigger appropriately (no false alarms)
- [ ] 60-80 trades executed across both pairs
- [ ] Paper account P&L tracks expected backtest (+/- 10%)

#### Step 5.3: Paper Trading Metrics

Compare paper trading results vs. backtest:

```
BHP-RIO Pair:
  Backtest Sharpe: 2.15
  Paper Trading Sharpe: 1.98  (92% consistency ✓)
  
NAB-ANZ Pair:
  Backtest Sharpe: 1.87
  Paper Trading Sharpe: 1.76  (94% consistency ✓)
  
Portfolio (2 pairs):
  Expected Sharpe: ~1.9
  Paper Sharpe: 1.87
  
✅ READY FOR LIVE DEPLOYMENT
```

**If paper trading undershoots by >20%:**
- Investigate: Data feed delays? Execution slippage worse than modeled?
- Adjust thresholds (e.g., entry z-score 2.0 → 2.2)
- Run another 2 weeks of paper trading
- Do NOT deploy live until paper matches backtest

---

## PHASE 4: LIVE POC (Weeks 9–20)
### Proof-of-Concept with Real Capital

### Objectives
- Deploy $100K across 2-3 pairs
- Accumulate 80-120 real trades over 12 weeks
- Measure empirical Sharpe vs. backtest (target: ≥1.4)
- Confirm edge is real, not backtest artifact
- Collect track record for backer reporting

### Week 9: Setup & Initial Deployment

#### Step 9.1: Capital Deployment Setup

**Interactive Brokers Account Status:**
- Account opened in Week 1 for backtesting
- Paper trading validated in Weeks 5-8
- **Now fund with $100K real capital**

**Capital Allocation ($100K total):**
```
Account Balance: $100,000
├─ Pair 1 (BHP-RIO):     $30,000  (30% AUM)
├─ Pair 2 (NAB-ANZ):     $30,000  (30% AUM)
├─ Pair 3 (CBA-NAB):     $20,000  (20% AUM, optional)
├─ Margin buffer:        $15,000  (15% AUM, for drawdown tolerance)
└─ Emergency reserve:     $5,000   (5% AUM, for unexpected issues)
```

**Position Sizing per Pair:**
```
BHP-RIO ($30K allocation):
├─ ~1,000 shares BHP @ $40/share = ~$40K (on 1.5x leverage)
├─ ~600 shares RIO @ $120/share = ~$72K (on 1.5x leverage, hedged)
└─ Net long/short exposure: Market neutral, $30K notional risk

Total portfolio margin: $100K supporting ~$140K gross exposure
Leverage ratio: 1.4x (conservative, well within IB limits)
```

**Critical: Start with $60K deployed across 2 pairs (Week 9), not $100K.**
- Pair 1 (BHP-RIO): $30K
- Pair 2 (NAB-ANZ): $30K
- Reserve $40K for weeks 13+ scaling

This gives you buffer for margin calls/slippage in first month.

**Python API Setup (Already Done, But Verify):**
```bash
# Install IB client library (if not done)
pip install ib-insync

# Test connection to LIVE (not paper)
python
>>> from ib_insync import IB
>>> ib = IB()
>>> ib.connect('127.0.0.1', 7497, clientId=1)  # clientId=1 for LIVE
>>> print(ib.accountSummary())  # Should show real capital
```

---

#### Step 9.2: Build Live Trading System (Updated)

```python
"""
PAIRS TRADING LIVE SYSTEM
Rebalances daily at 10:05 AM AEST (market open + 5 min)
"""

import asyncio
from ib_insync import IB, Stock
import pandas as pd
import numpy as np
from datetime import datetime, time
import logging
import json

# Setup logging
logging.basicConfig(
    filename='live_trading.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

class PairsTrader:
    def __init__(self, pairs_config):
        """
        pairs_config = [
            {'ticker1': 'BHP', 'ticker2': 'RIO', 'beta': 1.2345, 'capital': 150000},
            {'ticker1': 'NAB', 'ticker2': 'ANZ', 'beta': 0.8765, 'capital': 150000},
        ]
        """
        self.pairs = pairs_config
        self.ib = IB()
        self.positions = {}  # Track open positions
        self.metrics = {}    # Track metrics
        
    async def connect(self):
        """Connect to IB"""
        await self.ib.connectAsync('127.0.0.1', 7497, clientId=1)
        logging.info("Connected to IB")
        
    async def get_current_price(self, ticker):
        """Get latest price for a ticker"""
        contract = Stock(ticker, 'ASX', 'AUD')
        self.ib.qualifyContracts(contract)
        
        ticker_data = self.ib.reqMktData(contract)
        await asyncio.sleep(0.5)  # Wait for data
        
        return ticker_data.bid, ticker_data.ask, ticker_data.last
    
    async def rebalance_pair(self, pair_config):
        """Rebalance a single pair"""
        ticker1 = pair_config['ticker1']
        ticker2 = pair_config['ticker2']
        beta = pair_config['beta']
        capital = pair_config['capital']
        
        logging.info(f"Rebalancing {ticker1}-{ticker2}...")
        
        # Get prices
        bid1, ask1, last1 = await self.get_current_price(ticker1)
        bid2, ask2, last2 = await self.get_current_price(ticker2)
        
        # Calculate spread
        mid1 = (bid1 + ask1) / 2
        mid2 = (bid2 + ask2) / 2
        spread = mid1 - beta * mid2
        
        # Get rolling statistics (from EOD data)
        # In production: maintain rolling window of last 60 closes
        # For now: use pre-calculated historical stats
        spread_mean = 100.0  # Replace with actual rolling mean
        spread_std = 10.0    # Replace with actual rolling std
        
        z_score = (spread - spread_mean) / spread_std
        
        # Determine signal
        entry_threshold = 2.0
        exit_threshold = 0.5
        
        if z_score > entry_threshold:
            signal = "SHORT_SPREAD"  # Short ticker1, long ticker2
        elif z_score < -entry_threshold:
            signal = "LONG_SPREAD"   # Long ticker1, short ticker2
        elif abs(z_score) < exit_threshold:
            signal = "EXIT"
        else:
            signal = "HOLD"
        
        # Calculate position sizes (equal dollar risk)
        size1 = int(capital / mid1 * 0.5)  # 50% of capital in ticker1
        size2 = int((beta * capital) / mid2 * 0.5)  # 50% in ticker2 (scaled by beta)
        
        # Place orders
        try:
            if signal == "SHORT_SPREAD":
                logging.info(f"  SHORT {ticker1} ({size1}), LONG {ticker2} ({size2})")
                # Place sell order for ticker1
                contract1 = Stock(ticker1, 'ASX', 'AUD')
                order1 = self.ib.createMarketOrder('SELL', size1)
                trade1 = self.ib.placeOrder(contract1, order1)
                
                # Place buy order for ticker2
                contract2 = Stock(ticker2, 'ASX', 'AUD')
                order2 = self.ib.createMarketOrder('BUY', size2)
                trade2 = self.ib.placeOrder(contract2, order2)
                
            elif signal == "LONG_SPREAD":
                logging.info(f"  LONG {ticker1} ({size1}), SHORT {ticker2} ({size2})")
                # Place buy order for ticker1
                contract1 = Stock(ticker1, 'ASX', 'AUD')
                order1 = self.ib.createMarketOrder('BUY', size1)
                trade1 = self.ib.placeOrder(contract1, order1)
                
                # Place sell order for ticker2
                contract2 = Stock(ticker2, 'ASX', 'AUD')
                order2 = self.ib.createMarketOrder('SELL', size2)
                trade2 = self.ib.placeOrder(contract2, order2)
                
            elif signal == "EXIT":
                logging.info(f"  EXIT positions")
                # Close all positions (in production)
                pass
            
            # Log metrics
            self.metrics[f"{ticker1}-{ticker2}"] = {
                'timestamp': datetime.now().isoformat(),
                'spread': spread,
                'z_score': z_score,
                'signal': signal,
                'price1': mid1,
                'price2': mid2,
            }
            
        except Exception as e:
            logging.error(f"  ERROR: {e}")
    
    async def daily_rebalance(self):
        """Rebalance all pairs daily at market open"""
        for pair in self.pairs:
            await self.rebalance_pair(pair)
        
        # Log daily summary
        logging.info(f"Daily rebalance complete at {datetime.now()}")
        logging.info(json.dumps(self.metrics, indent=2))
    
    async def disconnect(self):
        """Disconnect from IB"""
        await self.ib.disconnectAsync()
        logging.info("Disconnected from IB")

# Run as cron job (10:05 AM AEST every business day)
async def main():
    pairs_config = [
        {'ticker1': 'BHP', 'ticker2': 'RIO', 'beta': 1.2345, 'capital': 150000},
        {'ticker1': 'NAB', 'ticker2': 'ANZ', 'beta': 0.8765, 'capital': 150000},
    ]
    
    trader = PairsTrader(pairs_config)
    await trader.connect()
    await trader.daily_rebalance()
    await trader.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
```

**Deploy as cron job:**
```bash
# Edit crontab
crontab -e

# Add this line (runs at 10:05 AM daily, Monday-Friday)
5 10 * * 1-5 /usr/bin/python3 /home/user/pairs_trading_live.py

# Check cron is running
ps aux | grep cron
```

---

#### Step 5.3: Create Monitoring Dashboard

**Simple HTML Dashboard:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>Pairs Trading Dashboard</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        .metric { font-size: 24px; font-weight: bold; margin: 10px; }
        .good { color: green; }
        .bad { color: red; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
    </style>
</head>
<body>
    <h1>🎯 Pairs Trading Live Dashboard</h1>
    
    <h2>Portfolio Summary</h2>
    <div class="metric" id="daily_pnl">Daily P&L: --</div>
    <div class="metric" id="ytd_return">YTD Return: --</div>
    <div class="metric" id="sharpe">Sharpe: --</div>
    <div class="metric" id="max_dd">Max Drawdown: --</div>
    
    <h2>Live Positions</h2>
    <table id="positions_table">
        <tr>
            <th>Pair</th>
            <th>Signal</th>
            <th>Z-Score</th>
            <th>Position</th>
            <th>P&L</th>
            <th>Last Update</th>
        </tr>
    </table>
    
    <script>
        // Load data from log file every 30 seconds
        setInterval(() => {
            fetch('/live_trading.log')
                .then(r => r.text())
                .then(text => {
                    // Parse latest metrics
                    const lines = text.split('\n');
                    const latest = lines[lines.length - 2];
                    const data = JSON.parse(latest);
                    
                    // Update dashboard
                    document.getElementById('daily_pnl').textContent = `Daily P&L: $${data.daily_pnl}`;
                    document.getElementById('ytd_return').textContent = `YTD Return: ${data.ytd_return}%`;
                    
                    // Update positions table
                    for (let pair in data.metrics) {
                        let row = document.getElementById(pair);
                        if (!row) {
                            row = document.createElement('tr');
                            row.id = pair;
                            document.getElementById('positions_table').appendChild(row);
                        }
                        
                        row.innerHTML = `
                            <td>${pair}</td>
                            <td>${data.metrics[pair].signal}</td>
                            <td>${data.metrics[pair].z_score.toFixed(2)}</td>
                            <td>--</td>
                            <td>--</td>
                            <td>${data.metrics[pair].timestamp}</td>
                        `;
                    }
                });
        }, 30000);
    </script>
</body>
</html>
```

**Serve via Python:**
```bash
python3 -m http.server 8000
# Open: http://localhost:8000/dashboard.html
```

---

#### Step 5.4: Risk Controls

```python
"""
RISK MANAGEMENT RULES
Applied before every order
"""

def apply_risk_controls(order, account_info, pair_config):
    """Check if order passes risk filters"""
    
    # 1. Daily loss limit
    if account_info['daily_pnl'] < -account_info['initial_capital'] * 0.01:
        logging.warning("⚠️  Daily loss limit (-1%) breached. TRADING HALTED.")
        return False
    
    # 2. Position size limit (no single pair > 30% of AUM)
    position_value = order['size'] * order['price']
    if position_value > account_info['initial_capital'] * 0.30:
        logging.warning(f"⚠️  Position size too large ({position_value}). REJECTED.")
        return False
    
    # 3. Leverage limit (net exposure < 1.5x)
    if account_info['gross_exposure'] > account_info['initial_capital'] * 1.50:
        logging.warning("⚠️  Leverage too high. REJECTED.")
        return False
    
    # 4. Drawdown circuit breaker (> 15% drawdown = stop trading)
    drawdown_pct = account_info['max_drawdown'] / account_info['initial_capital']
    if drawdown_pct > 0.15:
        logging.warning("⚠️  Drawdown > 15%. TRADING PAUSED.")
        return False
    
    return True  # Order approved
```

---

### Acceptance Criteria for Week 5
- [ ] IB account funded and connected
- [ ] Live trading system deployed and tested in paper mode
- [ ] First live trade executed successfully
- [ ] Dashboard accessible and updating
- [ ] Logs recording all trades and decisions
- [ ] First week: $30-50K deployed (test phase)

---

## PHASE 5: MONITOR & SCALE (Weeks 13–20)
### Scale to 3 Pairs, Prove Edge, Prepare for Larger Deployment

### Week 13-14: Monitor & Verify Signals (First Month Live)

**Daily Tasks (5-10 min):**
- Check dashboard for errors
- Verify P&L matches expected from signal
- Monitor data feed quality (no stale prices)
- Review IB order logs for execution issues

**Weekly Tasks (30 min):**
- Recalculate rolling statistics (mean/std of spreads)
- Review all trades: entry/exit logic correct?
- Check cointegration hasn't broken (re-run Engle-Granger test)
- Update monitoring spreadsheet

```python
"""
WEEKLY MONITORING CHECKLIST
"""

def weekly_monitoring():
    # 1. Recalculate rolling statistics
    for pair in live_pairs:
        ticker1, ticker2, beta = pair['ticker1'], pair['ticker2'], pair['beta']
        
        # Get last 60 closes
        hist1 = get_last_n_closes(ticker1, 60)
        hist2 = get_last_n_closes(ticker2, 60)
        
        spread = hist1 - beta * hist2
        spread_mean = np.mean(spread)
        spread_std = np.std(spread)
        
        print(f"{ticker1}-{ticker2}")
        print(f"  Mean: {spread_mean:.2f}, Std: {spread_std:.2f}")
    
    # 2. Verify cointegration hasn't degraded
    # (re-run Engle-Granger test on last 2 years)
    score, pvalue, _ = coint(hist1, hist2)
    if pvalue > 0.05:
        logging.warning(f"⚠️  {ticker1}-{ticker2} cointegration broken (p={pvalue})")
        # Consider dropping this pair
    
    # 3. Check P&L vs expectations
    expected_pnl = calculate_expected_pnl_this_week()
    actual_pnl = get_actual_pnl_this_week()
    
    if actual_pnl < expected_pnl * 0.5:
        logging.warning(f"⚠️  Actual P&L {actual_pnl} much lower than expected {expected_pnl}")
        # Investigate: wrong beta? Market changed? Data error?
```

---

### Week 15-16: Add Optional 3rd Pair

**Only if:**
- Pairs 1-2 are tracking backtest (Sharpe > 1.3)
- No cointegration breakdowns
- No data feed issues

**Deployment:**
- Capital: Add third pair with remaining $20-40K
- Same process: deploy at 10:05 AM, same daily rebalancing
- Monitor correlation matrix (all pairs < 0.3 correlated)

**If 3rd pair breaks cointegration:** Don't deploy, save capital for next iteration.

---

### Week 17-20: Prepare for Scaling Decision

**Week 17:**
- Calculate final empirical Sharpe (12 weeks of live data across 2-3 pairs)
- Compare vs. backtest Sharpe (acceptance criterion: ≥77% of backtest)
- Document max drawdown, win rate, profitability
- Identify any regime changes or cointegration degradation

**Week 18-19:**
- Prepare POC report for backer (see "Week 20 Backer Report" section below)
- Write up: What worked, what didn't, why edge is real or why it failed
- If successful: Detailed plan for scaling to $500K-$1M

**Week 20: Go/No-Go Decision**

**If POC succeeds (Sharpe 1.4+):**
```
Next step: Scale to $500K-$1M AUM
Timeline: 4-8 weeks to full deployment
Expected returns: $75-100K+ annually (18-20% on $500K)

Action items:
├─ Secure $500K from backer
├─ Deploy 5 pairs across $500K capital
├─ Maintain same daily rebalancing infrastructure
└─ Report monthly to backer
```

**If POC fails (Sharpe < 1.0):**
```
Outcome: Strategy doesn't work in practice
Cost of learning: $100K (acceptable)

Options:
├─ Pivot to Strategy #2 (daily momentum)
├─ Iterate: Different pair selection, different entry/exit thresholds
├─ Investigate: Was cointegration sample-dependent? Did regime break?
└─ Wind down: Maintain $100K, return to PE/portfolio manager work
```

**If POC is in-between (Sharpe 1.0-1.3):**
```
Outcome: Edge exists but smaller than expected

Options:
├─ Run another 4 weeks to gather more data
├─ Optimize thresholds (increase entry z-score from 2.0 to 2.2)
├─ Add more pairs to diversify
└─ Scale to $200-300K (modest, not full $1M)
```

---

## End-of-Phase Metrics & Reporting

### POC Progress Tracking (Weeks 9-20)

**Track these metrics weekly:**

| Week | Capital Deployed | Pairs Live | Trades YTD | Sharpe (12w roll) | DD | Status |
|------|------------------|-----------|-----------|-------------------|-----|--------|
| 9 | $60K | 2 | 0 | -- | 0% | 🟡 Starting |
| 12 | $60K | 2 | 45 | 1.89 | -6% | 🟢 On track |
| 15 | $80-100K | 2-3 | 80 | 1.76 | -8% | 🟢 Validating |
| 20 | $100K | 3 | 120 | 1.62 | -9% | 🟢 Proven |

**Acceptance Criteria at Week 20:**
- [ ] Live Sharpe ≥ 1.40 (≥77% of backtest)
- [ ] Max drawdown ≤ 12%
- [ ] Win rate ≥ 45%
- [ ] ≥100 real trades executed
- [ ] In-sample vs. OOS vs. live Sharpe all ≈ consistent

---

### Week 20 Backer Report (POC Success Scenario)

```markdown
# Pairs Trading POC: Final Report

## Executive Summary
**Status: ✅ EDGE CONFIRMED**

### Key Metrics (12-Week Live Period)
| Metric | Backtest | POC Live | Variance |
|--------|----------|----------|----------|
| Sharpe Ratio | 1.80 | 1.68 | -6.7% ✅ |
| Max Drawdown | -9.2% | -8.5% | +0.7% ✅ |
| Win Rate | 47.3% | 46.1% | -1.2% ✅ |
| Total Trades | -- | 142 | -- |
| Total Return | -- | +$18,450 | +18.5% |
| Annualized Return | 18% | 18.5% | +0.5% ✅ |

### Capital Deployment
- POC Capital: $100,000
- Deployed Pairs: 3 (BHP-RIO, NAB-ANZ, CBA-NAB)
- Average Utilization: 85% (margin buffer maintained)
- Monthly Avg Cost: AUD $55 (commissions + slippage)

### Risk Management Compliance
- Daily loss limit (-1% AUM): ✅ Never breached
- Position size limit (30% AUM): ✅ All < 30%
- Leverage limit (1.5x): ✅ Maintained at 1.3-1.4x
- Drawdown circuit breaker (15%): ✅ Only hit -8.5%

### Consistency Validation
```
Backtest Sharpe vs. POC Live Sharpe:

BHP-RIO:
  Backtest: 2.15 | Paper: 1.98 | Live: 2.01 → ✅ Consistent

NAB-ANZ:
  Backtest: 1.87 | Paper: 1.76 | Live: 1.72 → ✅ Consistent

CBA-NAB:
  Backtest: 1.65 | Paper: 1.54 | Live: 1.49 → ✅ Consistent

Portfolio (3 pairs):
  Backtest: 1.80 | Live: 1.68 → 93% of expected ✅
```

### Cointegration Status (Re-tested Week 20)
All pairs maintain statistically significant cointegration:
```
BHP-RIO: p-value = 0.0001 (cointegrated ✅)
NAB-ANZ: p-value = 0.0003 (cointegrated ✅)
CBA-NAB: p-value = 0.0012 (cointegrated ✅)
```

Half-lives still < 30 days (mean reversion stable).

### Operational Performance
- System uptime: 99.8% (1 day TWS restart)
- Data feed quality: Excellent (no gaps > 1 hour)
- Execution slippage: 4.2 bps avg (modeled 5 bps ✅)
- Commission cost: AUD $42/month avg (expected ✅)

### Why This Edge Is Real

1. **Out-of-Sample Consistency**: Backtest → Paper → Live Sharpe all within 6% of each other. Not a lucky run.

2. **Cointegration Stability**: All 3 pairs maintain statistical cointegration over 12 months (not sample-dependent).

3. **Mechanical Logic**: Mean reversion to spread is provable mathematically (no black-box ML).

4. **Scalability**: Position sizing scales linearly; no execution degradation observed at $100K scale.

5. **Market Neutral**: Correlation to ASX-200 = 0.04 (uncorrelated, proves not buying market).

### Recommendation: Scale to $500K-$1M

#### Deployment Plan
```
Timeline: 8-12 weeks
Capital: $500K initial, can scale to $1M

Pair Allocation:
├─ BHP-RIO (best performer): $150K
├─ NAB-ANZ (stable): $150K
├─ CBA-NAB (lowest vol): $100K
├─ 2 New pairs (validated): $100K
└─ Margin buffer: $50K

Expected Year 1 Returns: $90-120K (18-24% on $500K)
```

#### Infrastructure Changes Needed
```
Minimal. Current system scales linearly:
├─ 1 cron job (10:05 AM daily)
├─ 1 IB account (can handle $1M+ positions)
├─ Same monitoring dashboard
└─ Same risk controls
```

### Financial Forecast (18-Month Outlook)

**Conservative Case (1.5x Sharpe = 13% annual):**
```
Year 1: $500K → $565K (+13%)
Year 2: $565K → $639K (+13%)
3-Year AUM: $639K
```

**Base Case (1.65x Sharpe = 18% annual):**
```
Year 1: $500K → $590K (+18%)
Year 2: $590K → $696K (+18%)
3-Year AUM: $696K
```

**Optimistic Case (1.8x Sharpe = 22% annual):**
```
Year 1: $500K → $610K (+22%)
Year 2: $610K → $745K (+22%)
3-Year AUM: $745K
```

### Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| ASX pair availability | Pairs run out of opportunities | Monitor for new cointegrated pairs; geographic expansion |
| Cointegration breakdown | Edge disappears | Weekly test; drop pairs with p > 0.05 |
| Market regime change | Correlations change | Leverage cap at 1.5x; daily DD limit |
| Execution issues | Slippage increases | 2x position size; wider entry z-scores |
| Competitive entry | Edge degrades | Already invisible to competitors; small ASX market |

### Backer Next Steps

1. **Approve $500K deployment** (can start with $200K, add more if successful)
2. **Monthly reporting**: Sharpe, DD, Sharpe consistency vs. backtest
3. **Annual review**: ROI, strategy evolution, competitive landscape
4. **Optional**: Add 2nd strategy (daily momentum) in parallel for diversification

---

## Conclusion

We've successfully proven that pairs trading works on the ASX with:
- ✅ Mathematically cointegrated pairs
- ✅ Consistent Sharpe ratio across backtest / paper / live
- ✅ Capital-efficient deployment (1.3-1.4x leverage)
- ✅ Market-neutral risk profile
- ✅ Fully automated, low-touch operation

**Recommendation: Proceed to $500K deployment. Edge is real.**

---

**Prepared by:** [Engineer Name]
**Date:** [Week 20 Date]
**Approved by:** [Backer Name]
```

---

### Monthly Report Template (During Weeks 9-20)

```markdown
# Monthly POC Report: [MONTH] (Week [X])

## Portfolio Summary
- **Deployed Capital:** $[X]K
- **Pairs Active:** [X]
- **Monthly Return:** [+X]% (actual)
- **YTD Return (live):** [+X]%
- **Sharpe (12-week rolling):** [X.XX]

## Pair Status
| Pair | Status | Monthly P&L | Sharpe | Cointegration | Notes |
|------|--------|-------------|--------|---------------|-------|
| BHP-RIO | LIVE | +$[X] | [X.XX] | ✅ p=0.0001 | On track |
| NAB-ANZ | LIVE | +$[X] | [X.XX] | ✅ p=0.0003 | On track |
| CBA-NAB | [LIVE/PENDING] | +$[X] | [X.XX] | ✅ p=0.0012 | [Status] |

## Risk Metrics
- Max drawdown (month): [X]%
- Max drawdown (YTD): [X]%
- Largest single trade loss: -$[X]
- VaR 95%: -$[X]
- Leverage ratio: [X.X]x

## Operational
- System uptime: [X]%
- Execution slippage: [X] bps avg
- Commission cost: AUD $[X]
- Data issues: [None / [details]]

## Variance to Expectations
- Expected monthly Sharpe: [X.XX]
- Actual monthly Sharpe: [X.XX]
- Variance: [+/-X]% ✅/⚠️

## Next Month
- [ ] Continue monitoring for cointegration breakdown
- [ ] [Optional: Add 3rd pair / Scale capital / etc.]
- [ ] Prepare for Week 20 go/no-go decision

## Backer Update (1 sentence)
"POC tracking as expected. 12-week live Sharpe [X.XX] vs. backtest [X.XX]. Edge remains consistent."
```

---

## Slippage & Commission Analysis ($100K POC)

### Why This Matters

At $100K capital, transaction costs are **highest as a % of returns**. This is the main risk to POC success.

### Cost Breakdown

**Per Round-Trip Trade ($30K pair position):**
```
Commissions (ASX):
  ├─ Buy 1,000 BHP: AUD $10-15
  ├─ Sell 600 RIO: AUD $8-12
  └─ Total per round-trip: AUD $36-54 (let's say $45)

Slippage (bid-ask spread):
  ├─ BHP mid: $40, spread: $0.03 (0.075%)
  ├─ 1,000 shares × $0.015 avg slippage: $15
  ├─ RIO mid: $120, spread: $0.05 (0.042%)
  ├─ 600 shares × $0.025 avg slippage: $15
  └─ Total slippage per round-trip: $30

Total cost per round-trip: $45 + $30 = $75
Cost as % of $30K position: 0.25%
Cost per 12-week period (120 trades): $75 × 120 = $9,000
Impact on $100K AUM: 9% drag
```

### Impact on Sharpe

```
Without slippage: Sharpe 1.8 → Expected annual return: 18%
With $9K slippage: Effective return: 18% - 9% = 9%
Effective Sharpe: 1.8 × (9/18) = 0.9

⚠️ This is CRITICAL. You might fail POC due to slippage alone.
```

### Mitigation Strategies

**1. Optimize Position Sizing (Execute Larger Blocks)**
```
Instead of:  1,000 BHP @ 1 share/sec = 1,000 sec = high market impact
Try:         1,000 BHP @ 10 shares/sec = 100 sec = lower impact

Use IB's VWAP algorithm to split order over 5-10 minutes
Estimated slippage reduction: 30-50%
```

**2. Trade Less Frequently (Widen Entry/Exit Thresholds)**
```
Current:  Entry z > 2.0 → ~200 trades/year
Optimize: Entry z > 2.2 → ~140 trades/year

Reduces trades by 30% → reduces slippage cost by 30%
Sharpe might drop 5-10%, but more achievable
```

**3. Increase Position Size (Justify larger capital)**
```
With $100K: position is $30K → 0.25% slippage cost/round-trip
With $200K: position is $60K → same $75 cost, 0.125% slippage
Slippage drag cut in half.

→ Ask backer for $150K instead of $100K if possible
```

### Conservative POC Assumption

**For planning purposes, assume:**
```
Backtest Sharpe: 1.80
Less slippage (0.6%): -0.18 Sharpe
Empirical POC Sharpe: 1.62

This is still > 1.4 threshold ✅
But leaves no margin for error
```

### Early Warning Sign

**If by Week 12 (1 month live), empirical Sharpe < 1.2:**
- Don't continue to Week 20
- Investigate: Is slippage worse than expected? Are commissions higher? Did edge disappear?
- Decision point: Abort POC or optimize thresholds and restart

---

## Contingency Plans

### If Pair Cointegration Breaks

**Scenario:** Engle-Granger test p-value > 0.05

**Action:**
1. Remove pair from live trading immediately
2. Pull capital from broken pair
3. Identify replacement pair from research backup list
4. Backtest replacement pair (2-3 days)
5. Deploy replacement

**Impact:** ~1 week delay, -$150K capital temporarily, portfolio Sharpe drops 10-15%

---

### If Backer Gets Nervous (Market Crash)

**Scenario:** ASX down 10%, portfolio DD hits -12%, backer calls asking if system is broken

**Response:**
- "Pairs trading is market-neutral. We're short the broad market on BHP-RIO correlation. Our -12% DD is normal for this strategy."
- Show: Correlation to ASX-200 = 0.02 (uncorrelated)
- Show: Same pairs profited during COVID crash in 2020
- Show: Rebalancing daily prevents large losses

---

### If One Engineer Gets Sick

**Scenario:** Engineer unavailable for 1-2 weeks

**Preparation:**
1. Cron job runs automatically (no manual intervention needed)
2. Document every signal, every order, every metric
3. Dashboard updates daily automatically
4. Backup: Hire contract developer as on-call (cost: $500-1000/week if needed)

---

## Success Criteria by Week (POC Timeline)

| Week | Milestone | Acceptance | Status |
|------|-----------|-----------|--------|
| 2 | 5+ cointegrated pairs identified | p < 0.05 for all | 🟢 Must have |
| 4 | 5 pairs backtested, 3+ pass OOS validation | Sharpe > 1.5 in-sample, > 1.3 OOS | 🟢 Must have |
| 8 | Paper trading complete, system validated | Sharpe 80%+ of backtest on paper | 🟢 Must have |
| 12 | 2 pairs live (1 month), 45+ trades | No critical errors, on-track Sharpe | 🟢 Must have |
| 16 | 2-3 pairs live (2 months), 80+ trades | Sharpe 1.3+, no cointegration breaks | 🟡 Should have |
| 20 | POC complete, 120+ trades, Sharpe verified | Sharpe ≥ 1.4 (≥77% of backtest) | 🟢 **GO/NO-GO DECISION** |

---

## Financial Projections

### POC Phase (Weeks 9-20, $100K deployed)

#### Conservative Case (Sharpe 1.4)
- Expected monthly return: 1.0% (12% annual)
- Week 20 P&L: +$12,000 (12% return on $100K)
- Slippage/commission impact: -$600 (6% drag)
- Net: +$11,400 → **11.4% POC return**

#### Base Case (Sharpe 1.65)
- Expected monthly return: 1.3% (15.6% annual)
- Week 20 P&L: +$15,600 (15.6% return on $100K)
- Slippage/commission impact: -$600
- Net: +$15,000 → **15% POC return**

#### Optimistic Case (Sharpe 1.8)
- Expected monthly return: 1.5% (18% annual)
- Week 20 P&L: +$18,000 (18% return on $100K)
- Slippage/commission impact: -$600
- Net: +$17,400 → **17.4% POC return**

### Post-POC Phase (After Week 20, Scaling to $500K)

**If POC succeeds (Sharpe ≥ 1.4), scale to $500K:**

| Scenario | Sharpe | Annual % | Year 1 Return | Year 2 Return | 3-Year AUM |
|----------|--------|----------|---------------|---------------|-----------|
| Conservative (1.4) | 1.4 | 13% | $65K | $73K | $639K |
| Base (1.65) | 1.65 | 18% | $90K | $106K | $696K |
| Optimistic (1.8) | 1.8 | 22% | $110K | $134K | $745K |

**Note on Slippage at $500K Scale:**
```
At $100K: Slippage impact = 0.6% (significant)
At $500K: Slippage impact = 0.12% (minimal)

This means your effective Sharpe IMPROVES as you scale
(less drag relative to returns)
```

---

## Key Files & Deliverables

### Phase 1: Research (Weeks 1-2)
- `week1_cointegrated_pairs.csv` — All cointegrated pairs
- `week2_final_pairs_for_backtest.csv` — Top candidates

### Phase 2: Backtest (Weeks 3-4)
- `week3_backtest_results.csv` — Full period backtest metrics
- `week4_oos_validation.csv` — Out-of-sample validation
- `week4_final_live_pairs.csv` — Approved for deployment

### Phase 3: Paper Trading (Weeks 5-8)
- `paper_trading.log` — Simulated trades, daily P&L
- `paper_trading_results.csv` — Paper Sharpe, drawdown, consistency check
- `paper_vs_backtest_comparison.csv` — Validation metrics

### Phase 4: Live POC (Weeks 9-20)
- `live_trading.py` — Live trading system code
- `live_trading.log` — Real trades, daily P&L, risk metrics
- `dashboard.html` — Monitoring dashboard (updated daily)
- `daily_report.csv` — Daily position sizes, signals, P&L
- `weekly_monitoring.csv` — Cointegration tests, rolling Sharpe
- `week20_poc_report.md` — Final go/no-go decision document

### Backer Materials
- `poc_pitch_deck.pdf` — Initial $100K POC pitch
- `month1_report.md` — Weeks 9-12 results
- `month2_report.md` — Weeks 13-16 results
- `final_scaling_proposal.md` — $500K deployment plan (if POC succeeds)

---

## References & Resources

**Cointegration & Pairs Trading:**
- Engle & Granger (1987): "Co-integration and Error Correction" (foundational paper)
- Vidyamurthy, G. (2004): "Pairs Trading" (practical guide)

**Open Source Libraries:**
- statsmodels: Engle-Granger test
- ib_insync: Interactive Brokers API
- eodhdc: End-of-day historical data

**Alternative Data Providers:**
- EODHD (AUD $50-100/month)
- Interactive Brokers (AUD $40+/month for data subscriptions)
- Polygon.io (limited free tier)

---

## Overall Timeline Comparison

### Original Plan (Full Deployment, Week 5 Go-Live)
```
Week 1-2: Research (FREE)
Week 3-4: Backtest (FREE)
Week 5-12: Live trading ($1M deployed)
Result: Prove strategy works or lose $1M

Risk: High (all capital deployed immediately)
Timeline: 12 weeks total
```

### Revised POC Plan (De-Risked, Week 9 Go-Live)
```
Week 1-2: Research (FREE)
Week 3-4: Backtest (FREE)
Week 5-8: Paper trading (FREE)
Week 9-20: Live POC ($100K deployed)
Result: Prove strategy works on $100K, then scale

Risk: Low (only $100K at risk, $15-40K expected ROI)
Timeline: 20 weeks total, but weeks 1-8 are free validation
Full deployment: After Week 20 go/no-go decision
```

### Why This is Better

| Factor | Original | Revised |
|--------|----------|---------|
| Capital at risk | $1M | $100K |
| Free validation | 4 weeks | 8 weeks |
| Time to prove edge | 12 weeks | 12 weeks (but paper-validated) |
| Backer confidence | "Trust me" | "12 weeks paper + 12 weeks live data" |
| Total timeline to scale | 12 weeks | 20 weeks (but $15K+ learned, not lost) |
| Expected profit if right | +$50-80K | +$12-18K (then $500K scale) |
| Expected loss if wrong | -$1M | -$100K |

**The revised plan is ~10x better risk/reward.**

---

## Sign-Off

**Engineer:** [Your Name]
**Backer:** [Backer Name]
**Start Date:** [Week 1 Date]
**POC Completion:** [Week 20 Date]
**Scaling Decision:** [Week 20 Date]

### Commitment

This POC plan is executable within the 20-week window by 1 engineer with $100K capital and consistent daily 5-10 minute monitoring. 

**Weeks 1-8 are completely free** (no capital deployed). If at Week 8 you want to abort, you've invested only your time and learned whether the edge is real via paper trading.

**Week 20 go/no-go decision** is binary:
- **GO:** Scale to $500K-$1M (full deployment happens then, not before)
- **NO-GO:** Close strategy, learn for $100K, pivot to Strategy #2

This structure protects both engineer and backer from catastrophic loss while proving the strategy works.
