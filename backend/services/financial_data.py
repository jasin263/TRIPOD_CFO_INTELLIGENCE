import yfinance as yf
import pandas as pd
import numpy as np
import requests
import os
from services.forecasting import generate_all_forecasts

class DataValidationError(Exception):
    """Exception raised for errors in the financial data pipeline validation step."""
    pass

class FinancialDataPipeline:
    def __init__(self, ticker_symbol: str):
        self.ticker_symbol = ticker_symbol
        self.raw_data = {}
        self.aligned_data = {}
        self.processed_data = {}
        self.normalized_data = {}
        
    def _safe_get(self, df, index_name, default=0):
        try:
            val = df.loc[index_name]
            if isinstance(val, pd.DataFrame):
                val = val.iloc[0]
            return val.fillna(0).tolist()
        except KeyError:
            return [default] * len(self.aligned_data.get("years", []))

    def ingest(self):
        """1. Data Ingestion: Fetch raw data from the external source."""
        ticker = yf.Ticker(self.ticker_symbol)
        
        self.raw_data["income_stmt"] = ticker.financials
        self.raw_data["balance_sheet"] = ticker.balance_sheet
        self.raw_data["cash_flow"] = ticker.cashflow
        
        info = ticker.info
        self.raw_data["market_info"] = {
            "currentPrice": info.get("currentPrice", info.get("previousClose", 0)),
            "marketCapBn": info.get("marketCap", 0) / 1e9,
            "evEbitda": info.get("enterpriseToEbitda", 0),
            "peRatio": info.get("trailingPE", 0),
            "beta": info.get("beta", 1.0),
            "sharesOutstandingM": info.get("sharesOutstanding", 0) / 1e6
        }
        
        if self.raw_data["income_stmt"] is None or self.raw_data["income_stmt"].empty:
            raise DataValidationError(f"No financial data found for {self.ticker_symbol} during ingestion.")
            
        return self

    def time_series_alignment(self):
        """2. Time Series & Alignment: Chronological ordering and year extraction."""
        # Reverse to chronological order (oldest to newest)
        inc_stmt = self.raw_data["income_stmt"].iloc[:, ::-1]
        bal_sheet = self.raw_data["balance_sheet"].iloc[:, ::-1]
        csh_flow = self.raw_data["cash_flow"].iloc[:, ::-1]
        
        # Extract years from income statement as the master timeline
        years = [str(col)[:4] for col in inc_stmt.columns]
        
        self.aligned_data = {
            "years": years,
            "income_stmt": inc_stmt,
            "balance_sheet": bal_sheet,
            "cash_flow": csh_flow
        }
        return self

    def preprocess(self):
        """3. Data Preprocessing: Safe extraction of specific rows and NaN handling."""
        inc = self.aligned_data["income_stmt"]
        bal = self.aligned_data["balance_sheet"]
        cf = self.aligned_data["cash_flow"]
        
        # Income Statement
        self.processed_data["revenue"] = self._safe_get(inc, 'Total Revenue')
        self.processed_data["cogs"] = self._safe_get(inc, 'Cost Of Revenue')
        self.processed_data["gross_profit"] = self._safe_get(inc, 'Gross Profit')
        self.processed_data["operating_income"] = self._safe_get(inc, 'Operating Income')
        self.processed_data["net_income"] = self._safe_get(inc, 'Net Income')
        
        # Balance Sheet
        self.processed_data["total_assets"] = self._safe_get(bal, 'Total Assets')
        self.processed_data["total_liabilities"] = self._safe_get(bal, 'Total Liabilities Net Minority Interest')
        self.processed_data["total_debt"] = self._safe_get(bal, 'Total Debt')
        
        eq = self._safe_get(bal, 'Stockholders Equity', default=0)
        if sum(eq) == 0:
            eq = self._safe_get(bal, 'Total Equity Gross Minority Interest', default=0)
        self.processed_data["total_equity"] = eq
        
        self.processed_data["current_assets"] = self._safe_get(bal, 'Current Assets', default=0)
        self.processed_data["current_liabilities"] = self._safe_get(bal, 'Current Liabilities', default=0)
        self.processed_data["cash"] = self._safe_get(bal, 'Cash And Cash Equivalents')
        self.processed_data["accounts_receivable"] = self._safe_get(bal, 'Accounts Receivable', default=0)
        self.processed_data["inventory"] = self._safe_get(bal, 'Inventory', default=0)
        self.processed_data["accounts_payable"] = self._safe_get(bal, 'Accounts Payable', default=0)
        
        # Cash Flow
        self.processed_data["operating_cash_flow"] = self._safe_get(cf, 'Operating Cash Flow')
        self.processed_data["raw_capex"] = self._safe_get(cf, 'Capital Expenditure')
        self.processed_data["free_cash_flow"] = self._safe_get(cf, 'Free Cash Flow')
        
        # D&A extraction logic
        da = self._safe_get(cf, 'Depreciation And Amortization', default=0)
        if sum(da) == 0:
             da = self._safe_get(cf, 'Depreciation', default=0)
        self.processed_data["da"] = da
        
        return self

    def normalize_and_standardize(self):
        """4. Normalization & Standardization: Standardized formatting and derived metrics."""
        pd_data = self.processed_data
        
        def calc_margin(num, den):
            return [n/d if d != 0 else 0 for n, d in zip(num, den)]
            
        # Calculate standard EBITDA
        ebitda = [oi + d for oi, d in zip(pd_data["operating_income"], pd_data["da"])]
        
        # Absolute CapEx standard
        capex = [abs(c) for c in pd_data["raw_capex"]]
        
        # Margins & Ratios
        gross_margin = calc_margin(pd_data["gross_profit"], pd_data["revenue"])
        ebitda_margin = calc_margin(ebitda, pd_data["revenue"])
        net_margin = calc_margin(pd_data["net_income"], pd_data["revenue"])
        current_ratio = calc_margin(pd_data["current_assets"], pd_data["current_liabilities"])
        debt_equity = calc_margin(pd_data["total_debt"], pd_data["total_equity"])
        roe = calc_margin(pd_data["net_income"], pd_data["total_equity"])
        roa = calc_margin(pd_data["net_income"], pd_data["total_assets"])
        
        dso = [ar/r * 365 if r != 0 else 0 for ar, r in zip(pd_data["accounts_receivable"], pd_data["revenue"])]
        dpo = [ap/c * 365 if c != 0 else 0 for ap, c in zip(pd_data["accounts_payable"], pd_data["cogs"])]
        dio = [i/c * 365 if c != 0 else 0 for i, c in zip(pd_data["inventory"], pd_data["cogs"])]
        
        self.normalized_data = {
            "ebitda": ebitda,
            "capex": capex,
            "ratios": {
                "gross_margin": gross_margin,
                "ebitda_margin": ebitda_margin,
                "net_margin": net_margin,
                "current_ratio": current_ratio,
                "debt_equity": debt_equity,
                "roe": roe,
                "roa": roa,
                "dso": dso,
                "dpo": dpo,
                "dio": dio
            }
        }
        return self

    def validate(self):
        """5. Quality Checks & Validation: Ensuring the dataset is viable for the dashboard."""
        rev = self.processed_data["revenue"]
        assets = self.processed_data["total_assets"]
        
        if not rev or sum(rev) == 0:
            raise DataValidationError(f"Validation Failed: Revenue array is empty or zero for {self.ticker_symbol}.")
            
        if not assets or sum(assets) == 0:
            raise DataValidationError(f"Validation Failed: Total Assets are zero or missing for {self.ticker_symbol}.")
            
        if len(self.aligned_data["years"]) < 2:
            raise DataValidationError(f"Validation Failed: Insufficient historical years (< 2) for {self.ticker_symbol}.")
            
        return self

    def execute(self):
        """Run the full ETL pipeline and return structured JSON output."""
        self.ingest() \
            .time_series_alignment() \
            .preprocess() \
            .normalize_and_standardize() \
            .validate()
            
        forecasts = generate_all_forecasts(self)
            
        return {
            "ticker": self.ticker_symbol,
            "years": self.aligned_data["years"],
            "income_statement": {
                "revenue": self.processed_data["revenue"],
                "cogs": self.processed_data["cogs"],
                "gross_profit": self.processed_data["gross_profit"],
                "operating_income": self.processed_data["operating_income"],
                "ebitda": self.normalized_data["ebitda"],
                "net_income": self.processed_data["net_income"]
            },
            "balance_sheet": {
                "total_assets": self.processed_data["total_assets"],
                "total_liabilities": self.processed_data["total_liabilities"],
                "total_debt": self.processed_data["total_debt"],
                "total_equity": self.processed_data["total_equity"],
                "current_assets": self.processed_data["current_assets"],
                "current_liabilities": self.processed_data["current_liabilities"],
                "cash": self.processed_data["cash"],
                "accounts_receivable": self.processed_data["accounts_receivable"],
                "inventory": self.processed_data["inventory"],
                "accounts_payable": self.processed_data["accounts_payable"]
            },
            "cash_flow": {
                "operating_cash_flow": self.processed_data["operating_cash_flow"],
                "capex": self.normalized_data["capex"],
                "free_cash_flow": self.processed_data["free_cash_flow"]
            },
            "ratios": self.normalized_data["ratios"],
            "market_data": self.raw_data["market_info"],
            "monte_carlo_forecast": forecasts["monte_carlo"],
            "forecasts": forecasts
        }


class FMPPipeline(FinancialDataPipeline):
    def ingest(self):
        FMP_API_KEY = "ylWNZ4FRUovgs57G2bwyLpPBo6Z8Jcbz"
        limit = 5
        base_url = "https://financialmodelingprep.com/stable"
        
        inc_data = requests.get(f"{base_url}/income-statement?symbol={self.ticker_symbol}&limit={limit}&apikey={FMP_API_KEY}").json()
        bal_data = requests.get(f"{base_url}/balance-sheet-statement?symbol={self.ticker_symbol}&limit={limit}&apikey={FMP_API_KEY}").json()
        cf_data = requests.get(f"{base_url}/cash-flow-statement?symbol={self.ticker_symbol}&limit={limit}&apikey={FMP_API_KEY}").json()
        quote_data = requests.get(f"{base_url}/quote?symbol={self.ticker_symbol}&apikey={FMP_API_KEY}").json()
        metrics_data = requests.get(f"{base_url}/key-metrics?symbol={self.ticker_symbol}&limit=1&apikey={FMP_API_KEY}").json()
        
        self.raw_data["income_stmt"] = inc_data.get("value", []) if isinstance(inc_data, dict) else inc_data
        self.raw_data["balance_sheet"] = bal_data.get("value", []) if isinstance(bal_data, dict) else bal_data
        self.raw_data["cash_flow"] = cf_data.get("value", []) if isinstance(cf_data, dict) else cf_data
        
        q_val = quote_data.get("value", [{}])[0] if isinstance(quote_data, dict) else (quote_data[0] if quote_data else {})
        m_val = metrics_data.get("value", [{}])[0] if isinstance(metrics_data, dict) else (metrics_data[0] if metrics_data else {})
        
        self.raw_data["market_info"] = {
            "currentPrice": q_val.get("price", 0),
            "marketCapBn": q_val.get("marketCap", 0) / 1e9,
            "evEbitda": m_val.get("evToEBITDA", 0),
            "peRatio": m_val.get("peRatio", 0),
            "beta": q_val.get("beta", 1.0),
            "sharesOutstandingM": (q_val.get("marketCap", 0) / q_val.get("price", 1)) / 1e6 if q_val.get("price") else 0
        }
        
        if not self.raw_data["income_stmt"]:
            raise DataValidationError(f"No financial data found for {self.ticker_symbol} from FMP.")
        return self

    def time_series_alignment(self):
        inc = self.raw_data["income_stmt"][::-1]
        bal = self.raw_data["balance_sheet"][::-1]
        cf = self.raw_data["cash_flow"][::-1]
        years = [str(item.get("date", item.get("calendarYear", "")))[:4] for item in inc]
        
        self.aligned_data = {
            "years": years,
            "income_stmt": inc,
            "balance_sheet": bal,
            "cash_flow": cf
        }
        return self

    def preprocess(self):
        inc = self.aligned_data["income_stmt"]
        bal = self.aligned_data["balance_sheet"]
        cf = self.aligned_data["cash_flow"]
        
        def extract(arr, key, default=0):
            return [item.get(key, default) or default for item in arr]
            
        self.processed_data["revenue"] = extract(inc, "revenue")
        self.processed_data["cogs"] = extract(inc, "costOfRevenue")
        self.processed_data["gross_profit"] = extract(inc, "grossProfit")
        self.processed_data["operating_income"] = extract(inc, "operatingIncome")
        self.processed_data["net_income"] = extract(inc, "netIncome")
        
        self.processed_data["total_assets"] = extract(bal, "totalAssets")
        self.processed_data["total_liabilities"] = extract(bal, "totalLiabilities")
        self.processed_data["total_debt"] = extract(bal, "totalDebt")
        self.processed_data["total_equity"] = extract(bal, "totalEquity")
        self.processed_data["current_assets"] = extract(bal, "totalCurrentAssets")
        self.processed_data["current_liabilities"] = extract(bal, "totalCurrentLiabilities")
        self.processed_data["cash"] = extract(bal, "cashAndCashEquivalents")
        self.processed_data["accounts_receivable"] = extract(bal, "netReceivables")
        self.processed_data["inventory"] = extract(bal, "inventory")
        self.processed_data["accounts_payable"] = extract(bal, "accountPayables")
        
        self.processed_data["operating_cash_flow"] = extract(cf, "operatingCashFlow")
        self.processed_data["raw_capex"] = extract(cf, "capitalExpenditure")
        self.processed_data["free_cash_flow"] = extract(cf, "freeCashFlow")
        self.processed_data["da"] = extract(cf, "depreciationAndAmortization")
        
        return self

class CSVPipeline(FinancialDataPipeline):
    def ingest(self):
        csv_path = os.path.join(os.path.dirname(__file__), "..", "historical_data.csv")
        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            raise DataValidationError(f"Could not read historical_data.csv: {e}")
            
        df.columns = df.columns.str.strip()
        
        df_company = df[df["Company"].astype(str).str.strip().str.upper() == self.ticker_symbol.upper()]
        if df_company.empty:
            raise DataValidationError(f"No financial data found for {self.ticker_symbol} in CSV.")
            
        df_company = df_company.sort_values(by="Year")
        self.raw_data["csv_df"] = df_company
        
        last_row = df_company.iloc[-1]
        
        self.raw_data["market_info"] = {
            "currentPrice": float(last_row.get("Share Price", 0)),
            "marketCapBn": float(last_row.get("Market Cap(in B USD)", 0)),
            "evEbitda": 0,
            "peRatio": 0, 
            "beta": 1.0,
            "sharesOutstandingM": 0
        }
        
        eps = float(last_row.get("Earning Per Share", 0))
        price = float(last_row.get("Share Price", 0))
        if eps > 0:
            self.raw_data["market_info"]["peRatio"] = price / eps
            
        mcap_b = float(last_row.get("Market Cap(in B USD)", 0))
        if price > 0:
            self.raw_data["market_info"]["sharesOutstandingM"] = (mcap_b * 1000) / price
            
        return self

    def time_series_alignment(self):
        df = self.raw_data["csv_df"]
        years = df["Year"].astype(str).tolist()
        
        self.aligned_data = {
            "years": years,
            "csv_df": df
        }
        return self

    def preprocess(self):
        df = self.aligned_data["csv_df"]
        
        def extract(col, scale=1.0):
            if col in df.columns:
                return (pd.to_numeric(df[col], errors='coerce').fillna(0) * scale).tolist()
            return [0] * len(df)
            
        SCALE = 1_000_000
        
        self.processed_data["revenue"] = extract("Revenue", SCALE)
        self.processed_data["cogs"] = [(rev - gp) for rev, gp in zip(extract("Revenue", SCALE), extract("Gross Profit", SCALE))]
        self.processed_data["gross_profit"] = extract("Gross Profit", SCALE)
        self.processed_data["operating_income"] = extract("EBITDA", SCALE)
        self.processed_data["net_income"] = extract("Net Income", SCALE)
        
        equity = extract("Share Holder Equity", SCALE)
        de_ratio = extract("Debt/Equity Ratio", 1.0)
        debt = [e * de for e, de in zip(equity, de_ratio)]
        
        self.processed_data["total_assets"] = [0] * len(df)
        self.processed_data["total_liabilities"] = [0] * len(df)
        self.processed_data["total_debt"] = debt
        self.processed_data["total_equity"] = equity
        self.processed_data["current_assets"] = [0] * len(df)
        self.processed_data["current_liabilities"] = [0] * len(df)
        self.processed_data["cash"] = [0] * len(df)
        self.processed_data["accounts_receivable"] = [0] * len(df)
        self.processed_data["inventory"] = [0] * len(df)
        self.processed_data["accounts_payable"] = [0] * len(df)
        
        self.processed_data["operating_cash_flow"] = extract("Cash Flow from Operating", SCALE)
        self.processed_data["raw_capex"] = extract("Cash Flow from Investing", SCALE) 
        
        cfo = self.processed_data["operating_cash_flow"]
        cfi = self.processed_data["raw_capex"]
        self.processed_data["free_cash_flow"] = [o + i for o, i in zip(cfo, cfi)]
        self.processed_data["da"] = [0] * len(df)
        
        return self

    def validate(self):
        """Override validate since CSV lacks complete balance sheet data like Total Assets."""
        rev = self.processed_data["revenue"]
        
        if not rev or sum(rev) == 0:
            raise DataValidationError(f"Validation Failed: Revenue array is empty or zero for {self.ticker_symbol}.")
            
        if len(self.aligned_data["years"]) < 2:
            raise DataValidationError(f"Validation Failed: Insufficient historical years (< 2) for {self.ticker_symbol}.")
            
        return self

class CombinedPipeline(FinancialDataPipeline):
    def __init__(self, ticker_symbol: str, live_pipeline_cls=FinancialDataPipeline):
        super().__init__(ticker_symbol)
        self.live_pipeline_cls = live_pipeline_cls

    def ingest(self):
        self.csv_pipeline = CSVPipeline(self.ticker_symbol)
        self.yf_pipeline = self.live_pipeline_cls(self.ticker_symbol)
        
        csv_success = True
        yf_success = True
        try:
            self.csv_pipeline.ingest().time_series_alignment().preprocess().normalize_and_standardize()
        except Exception as e:
            csv_success = False
            
        try:
            self.yf_pipeline.ingest().time_series_alignment().preprocess().normalize_and_standardize()
        except Exception as e:
            yf_success = False
            
        if not csv_success and not yf_success:
            raise DataValidationError(f"Could not load data from CSV or YFinance for {self.ticker_symbol}")
            
        self.csv_success = csv_success
        self.yf_success = yf_success
        
        if yf_success:
            self.raw_data["market_info"] = self.yf_pipeline.raw_data.get("market_info", {})
        elif csv_success:
            self.raw_data["market_info"] = self.csv_pipeline.raw_data.get("market_info", {})
            
        return self

    def time_series_alignment(self):
        return self

    def preprocess(self):
        if self.csv_success and not self.yf_success:
            self.aligned_data = self.csv_pipeline.aligned_data
            self.processed_data = self.csv_pipeline.processed_data
            self.normalized_data = self.csv_pipeline.normalized_data
            return self
            
        if self.yf_success and not self.csv_success:
            self.aligned_data = self.yf_pipeline.aligned_data
            self.processed_data = self.yf_pipeline.processed_data
            self.normalized_data = self.yf_pipeline.normalized_data
            return self
            
        csv_years = self.csv_pipeline.aligned_data["years"]
        yf_years = self.yf_pipeline.aligned_data["years"]
        
        def get_year_int(y_str):
            try: return int(str(y_str)[:4])
            except: return 0
            
        csv_yr_ints = [get_year_int(y) for y in csv_years]
        yf_yr_ints = [get_year_int(y) for y in yf_years]
        
        min_yf_year = min(yf_yr_ints) if yf_yr_ints else 9999
        csv_indices = [i for i, y in enumerate(csv_yr_ints) if y < min_yf_year]
        
        self.aligned_data = {
            "years": [csv_years[i] for i in csv_indices] + yf_years
        }
        
        for key in self.csv_pipeline.processed_data:
            csv_vals = self.csv_pipeline.processed_data[key]
            yf_vals = self.yf_pipeline.processed_data.get(key, [0]*len(yf_years))
            self.processed_data[key] = [csv_vals[i] for i in csv_indices] + yf_vals
            
        return self

    def normalize_and_standardize(self):
        if self.csv_success and self.yf_success:
            csv_years = self.csv_pipeline.aligned_data["years"]
            yf_years = self.yf_pipeline.aligned_data["years"]
            
            def get_year_int(y_str):
                try: return int(str(y_str)[:4])
                except: return 0
            
            csv_yr_ints = [get_year_int(y) for y in csv_years]
            yf_yr_ints = [get_year_int(y) for y in yf_years]
            min_yf_year = min(yf_yr_ints) if yf_yr_ints else 9999
            csv_indices = [i for i, y in enumerate(csv_yr_ints) if y < min_yf_year]
            
            for key in self.csv_pipeline.normalized_data:
                if key == "ratios":
                    self.normalized_data["ratios"] = {}
                    for r_key in self.csv_pipeline.normalized_data["ratios"]:
                        csv_vals = self.csv_pipeline.normalized_data["ratios"][r_key]
                        yf_vals = self.yf_pipeline.normalized_data["ratios"].get(r_key, [0]*len(yf_years))
                        self.normalized_data["ratios"][r_key] = [csv_vals[i] for i in csv_indices] + yf_vals
                else:
                    csv_vals = self.csv_pipeline.normalized_data[key]
                    yf_vals = self.yf_pipeline.normalized_data.get(key, [0]*len(yf_years))
                    self.normalized_data[key] = [csv_vals[i] for i in csv_indices] + yf_vals
        return self

    def validate(self):
        rev = self.processed_data.get("revenue", [])
        if not rev or sum(rev) == 0:
            raise DataValidationError(f"Validation Failed: Revenue array is empty or zero for {self.ticker_symbol}.")
        if len(self.aligned_data.get("years", [])) < 2:
            raise DataValidationError(f"Validation Failed: Insufficient historical years (< 2) for {self.ticker_symbol}.")
        return self

def get_historical_data(ticker_symbol: str, provider: str = "yfinance"):
    """Facade wrapper to execute the pipeline."""
    if provider.lower() == "fmp":
        pipeline = FMPPipeline(ticker_symbol)
    elif provider.lower() == "csv":
        pipeline = CSVPipeline(ticker_symbol)
    elif provider.lower() == "combined":
        pipeline = CombinedPipeline(ticker_symbol, FinancialDataPipeline)
    elif provider.lower() == "combined_fmp":
        pipeline = CombinedPipeline(ticker_symbol, FMPPipeline)
    else:
        pipeline = FinancialDataPipeline(ticker_symbol)
    return pipeline.execute()
