import pandas_datareader.data as web
import datetime
import traceback

def get_macro_data():
    try:
        end = datetime.datetime.now()
        start = end - datetime.timedelta(days=90) # Last 90 days to ensure we have previous month
        
        # FRED indicators
        # DGS10: 10-Year Treasury
        # FEDFUNDS: Federal Funds Rate
        # VIXCLS: CBOE Volatility Index
        
        # FRED API Key provided by user
        fred_api_key = "2c8e31e50aad24512dcef084187716d0"
        
        dgs10 = web.DataReader('DGS10', 'fred', start, end, api_key=fred_api_key)
        fedfunds = web.DataReader('FEDFUNDS', 'fred', start, end, api_key=fred_api_key)
        vix = web.DataReader('VIXCLS', 'fred', start, end, api_key=fred_api_key)
        
        def safe_last(df, col):
            clean = df[col].dropna()
            return float(clean.iloc[-1]) if not clean.empty else 0.0
            
        def safe_change(df, col):
            clean = df[col].dropna()
            if len(clean) >= 21: # Roughly 30 calendar days ago in trading days
                return float(clean.iloc[-1] - clean.iloc[-21])
            return 0.0

        current_10y = safe_last(dgs10, 'DGS10')
        change_10y = safe_change(dgs10, 'DGS10')
        
        current_fed = safe_last(fedfunds, 'FEDFUNDS')
        change_fed = safe_change(fedfunds, 'FEDFUNDS')
        
        current_vix = safe_last(vix, 'VIXCLS')
        change_vix = safe_change(vix, 'VIXCLS')
        
        return [
            { "s": "US 10Y Treasury", "c": "Macro", "v": f"{current_10y:.2f}%", "d": f"{change_10y*100:+.0f}bps", "i": "down" if change_10y > 0 else "up", "text": "↑ WACC" if change_10y > 0 else "↓ WACC" },
            { "s": "USD Index (DXY)", "c": "FX", "v": "104.2", "d": "-0.8%", "i": "flat", "text": "→ Revenue" }, # Mocking DXY as it's harder to get free cleanly without yahoo finance
            { "s": "S&P 500 PMI", "c": "Market", "v": "51.3", "d": "+0.4", "i": "up", "text": "↑ Demand" }, # Mocking PMI
            { "s": "Fed Funds Rate", "c": "Macro", "v": f"{current_fed:.2f}%", "d": f"{change_fed*100:+.0f}bps", "i": "flat" if abs(change_fed) < 0.05 else ("up" if change_fed > 0 else "down"), "text": "→ Financing" },
            { "s": "VIX", "c": "Market", "v": f"{current_vix:.1f}", "d": f"{change_vix:+.1f}", "i": "down" if change_vix > 0 else "up", "text": "↓ Risk" if change_vix < 0 else "↑ Risk" }
        ]
    except Exception as e:
        print(f"Warning: Failed to fetch live macro data from FRED ({e}). Using fallback data.")
        # Fallback if API fails
        return [
            { "s": "US 10Y Treasury", "c": "Macro", "v": "4.52%", "d": "+12bps", "i": "down", "text": "↑ WACC" },
            { "s": "USD Index (DXY)", "c": "FX", "v": "104.2", "d": "-0.8%", "i": "flat", "text": "→ Revenue" },
            { "s": "S&P 500 PMI", "c": "Market", "v": "51.3", "d": "+0.4", "i": "up", "text": "↑ Demand" },
            { "s": "Fed Funds Rate", "c": "Macro", "v": "4.33%", "d": "0bps", "i": "flat", "text": "→ Financing" },
            { "s": "VIX", "c": "Market", "v": "18.4", "d": "-2.1", "i": "up", "text": "↓ Risk" }
        ]
