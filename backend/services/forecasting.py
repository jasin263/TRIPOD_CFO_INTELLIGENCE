import numpy as np

def generate_monte_carlo_forecast(pipeline, iterations=5000, proj_years=3):
    """
    Runs a Monte Carlo simulation over historical financial data.
    """
    
    # 1. Extract Historicals
    years = pipeline.aligned_data.get("years", [])
    rev_hist = pipeline.processed_data.get("revenue", [])
    ebitda_margin_hist = pipeline.normalized_data.get("ratios", {}).get("ebitda_margin", [])
    
    if not rev_hist or len(rev_hist) < 2:
        return _fallback_deterministic_forecast(rev_hist, ebitda_margin_hist, years, proj_years)
        
    # Calculate historical YoY revenue growth
    rev_growth = []
    for i in range(1, len(rev_hist)):
        if rev_hist[i-1] != 0:
            rev_growth.append((rev_hist[i] / rev_hist[i-1]) - 1)
        else:
            rev_growth.append(0.05)
            
    # Calculate Mean and StdDev for Revenue Growth
    if len(rev_growth) > 0:
        mu_rev = np.mean(rev_growth)
        std_rev = np.std(rev_growth)
        if std_rev == 0 or np.isnan(std_rev): std_rev = 0.05
    else:
        mu_rev, std_rev = 0.05, 0.05
        
    # Cap insane historical growth rates so the model doesn't explode
    mu_rev = max(min(mu_rev, 0.40), -0.20)
    std_rev = min(std_rev, 0.30)
        
    # Calculate Mean and StdDev for EBITDA Margin
    if len(ebitda_margin_hist) > 0:
        mu_margin = np.mean(ebitda_margin_hist)
        std_margin = np.std(ebitda_margin_hist)
        if std_margin == 0 or np.isnan(std_margin): std_margin = 0.02
    else:
        mu_margin, std_margin = 0.20, 0.02
        
    # 2. Run Simulations
    last_rev = rev_hist[-1]
    
    # Pre-allocate arrays for results: shape = (iterations, proj_years)
    sim_rev = np.zeros((iterations, proj_years))
    sim_ebitda = np.zeros((iterations, proj_years))
    sim_net_income = np.zeros((iterations, proj_years))
    sim_fcf = np.zeros((iterations, proj_years))
    
    for i in range(iterations):
        current_rev = last_rev
        for y in range(proj_years):
            # Sample growth from normal distribution
            g = np.random.normal(mu_rev, std_rev)
            current_rev = current_rev * (1 + g)
            sim_rev[i, y] = current_rev
            
            # Sample margin from normal distribution
            m = np.random.normal(mu_margin, std_margin)
            ebitda = current_rev * m
            sim_ebitda[i, y] = ebitda
            
            # Simplified assumptions for the rest of P&L based on EBITDA
            sim_net_income[i, y] = ebitda * 0.60 # Rough proxy for D&A/Taxes
            sim_fcf[i, y] = ebitda * 0.70 # Rough proxy for FCF conversion
            
    # 3. Extract Percentiles (Bear = 10th, Base = 50th, Bull = 90th)
    def get_percentiles(sim_array):
        p10 = np.percentile(sim_array, 10, axis=0)
        p50 = np.percentile(sim_array, 50, axis=0)
        p90 = np.percentile(sim_array, 90, axis=0)
        return {
            "bear": p10.tolist(),
            "base": p50.tolist(),
            "bull": p90.tolist()
        }
        
    if years:
        try:
            last_year = int(years[-1])
        except:
            last_year = 2023
    else:
        last_year = 2023
        
    forecast_years = [str(last_year + i + 1) for i in range(proj_years)]
    
    rev_percentiles = get_percentiles(sim_rev)
    ebitda_percentiles = get_percentiles(sim_ebitda)
    ni_percentiles = get_percentiles(sim_net_income)
    fcf_percentiles = get_percentiles(sim_fcf)
    
    # Also extract margin percentiles for frontend UI (derived from EBITDA/Rev)
    ebitda_margin_bear = [e / r if r != 0 else 0 for e, r in zip(ebitda_percentiles["bear"], rev_percentiles["bear"])]
    ebitda_margin_base = [e / r if r != 0 else 0 for e, r in zip(ebitda_percentiles["base"], rev_percentiles["base"])]
    ebitda_margin_bull = [e / r if r != 0 else 0 for e, r in zip(ebitda_percentiles["bull"], rev_percentiles["bull"])]

    return {
        "years": forecast_years,
        "bear": {
            "revenue": rev_percentiles["bear"],
            "ebitda": ebitda_percentiles["bear"],
            "netIncome": ni_percentiles["bear"],
            "fcf": fcf_percentiles["bear"],
            "ebitdaMargin": [m * 100 for m in ebitda_margin_bear]
        },
        "base": {
            "revenue": rev_percentiles["base"],
            "ebitda": ebitda_percentiles["base"],
            "netIncome": ni_percentiles["base"],
            "fcf": fcf_percentiles["base"],
            "ebitdaMargin": [m * 100 for m in ebitda_margin_base]
        },
        "bull": {
            "revenue": rev_percentiles["bull"],
            "ebitda": ebitda_percentiles["bull"],
            "netIncome": ni_percentiles["bull"],
            "fcf": fcf_percentiles["bull"],
            "ebitdaMargin": [m * 100 for m in ebitda_margin_bull]
        }
    }

def _fallback_deterministic_forecast(rev_hist, ebitda_margin_hist, years, proj_years):
    """Fallback if historical data is strictly 1 year or less."""
    last_rev = rev_hist[-1] if rev_hist else 1000
    last_margin = ebitda_margin_hist[-1] if ebitda_margin_hist else 0.20
    
    last_year = 2023
    if years:
        try:
            last_year = int(years[-1])
        except:
            pass
            
    forecast_years = [str(last_year + i + 1) for i in range(proj_years)]
    
    def _build_scenario(g, m_delta):
        revs, ebitdas, fcf = [], [], []
        curr = last_rev
        curr_m = last_margin + m_delta
        for _ in range(proj_years):
            curr = curr * (1 + g)
            revs.append(curr)
            e = curr * curr_m
            ebitdas.append(e)
            fcf.append(e * 0.7)
        return {
            "years": forecast_years,
            "bear": { "revenue": revs, "ebitda": ebitdas, "netIncome": fcf, "fcf": fcf, "ebitdaMargin": [curr_m*100]*proj_years },
            "base": { "revenue": revs, "ebitda": ebitdas, "netIncome": fcf, "fcf": fcf, "ebitdaMargin": [curr_m*100]*proj_years },
            "bull": { "revenue": revs, "ebitda": ebitdas, "netIncome": fcf, "fcf": fcf, "ebitdaMargin": [curr_m*100]*proj_years }
        }
        
    return _build_scenario(0.05, 0.0)

def _generate_linear_regression(pipeline, proj_years=3):
    years = pipeline.aligned_data.get("years", [])
    rev_hist = pipeline.processed_data.get("revenue", [])
    ebitda_margin_hist = pipeline.normalized_data.get("ratios", {}).get("ebitda_margin", [])
    
    if not rev_hist or len(rev_hist) < 2:
        return _fallback_deterministic_forecast(rev_hist, ebitda_margin_hist, years, proj_years)
        
    x = np.arange(len(rev_hist))
    y = np.array(rev_hist)
    slope, intercept = np.polyfit(x, y, 1)
    
    # Standard Error for Bear/Bull
    y_pred = slope * x + intercept
    residuals = y - y_pred
    std_err = np.std(residuals) if len(residuals) > 1 else y[-1] * 0.05
    
    base_m = np.mean(ebitda_margin_hist) if len(ebitda_margin_hist) > 0 else 0.20
    std_m = np.std(ebitda_margin_hist) if len(ebitda_margin_hist) > 1 else 0.02

    last_year = 2023
    if years:
        try: last_year = int(years[-1])
        except: pass
    forecast_years = [str(last_year + i + 1) for i in range(proj_years)]
    
    res = {"years": forecast_years, "bear": {}, "base": {}, "bull": {}}
    
    for sc, rev_mult, m_add in [("bear", -1, -std_m), ("base", 0, 0), ("bull", 1, std_m)]:
        r, e, n, f, m = [], [], [], [], []
        for i in range(proj_years):
            x_val = len(rev_hist) + i
            # Cap the floor at 0 for revenue
            pred_rev = max((slope * x_val + intercept) + (std_err * rev_mult), y[-1] * 0.5)
            r.append(pred_rev)
            
            curr_m = max(base_m + m_add, 0.01)
            ebitda = pred_rev * curr_m
            e.append(ebitda)
            n.append(ebitda * 0.60)
            f.append(ebitda * 0.70)
            m.append(curr_m * 100)
            
        res[sc] = {"revenue": r, "ebitda": e, "netIncome": n, "fcf": f, "ebitdaMargin": m}
        
    return res

def _generate_ema(pipeline, proj_years=3):
    years = pipeline.aligned_data.get("years", [])
    rev_hist = pipeline.processed_data.get("revenue", [])
    ebitda_margin_hist = pipeline.normalized_data.get("ratios", {}).get("ebitda_margin", [])
    
    if not rev_hist or len(rev_hist) < 2:
        return _fallback_deterministic_forecast(rev_hist, ebitda_margin_hist, years, proj_years)
        
    rev_growth = [(rev_hist[i]/rev_hist[i-1])-1 if rev_hist[i-1] != 0 else 0.05 for i in range(1, len(rev_hist))]
    
    # EMA Calculation
    alpha = 0.5
    ema_g = rev_growth[0]
    for g in rev_growth[1:]:
        ema_g = alpha * g + (1 - alpha) * ema_g
        
    ema_g = max(min(ema_g, 0.40), -0.20) # Cap
    std_g = np.std(rev_growth) if len(rev_growth) > 1 else 0.05
    
    base_m = ebitda_margin_hist[-1] if len(ebitda_margin_hist) > 0 else 0.20
    std_m = np.std(ebitda_margin_hist) if len(ebitda_margin_hist) > 1 else 0.02
    
    last_year = 2023
    if years:
        try: last_year = int(years[-1])
        except: pass
    forecast_years = [str(last_year + i + 1) for i in range(proj_years)]
    
    res = {"years": forecast_years, "bear": {}, "base": {}, "bull": {}}
    
    for sc, g_add, m_add in [("bear", -std_g, -std_m), ("base", 0, 0), ("bull", std_g, std_m)]:
        r, e, n, f, m = [], [], [], [], []
        curr_rev = rev_hist[-1]
        for i in range(proj_years):
            curr_rev = curr_rev * (1 + ema_g + g_add)
            r.append(curr_rev)
            
            curr_m = max(base_m + m_add, 0.01)
            ebitda = curr_rev * curr_m
            e.append(ebitda)
            n.append(ebitda * 0.60)
            f.append(ebitda * 0.70)
            m.append(curr_m * 100)
            
        res[sc] = {"revenue": r, "ebitda": e, "netIncome": n, "fcf": f, "ebitdaMargin": m}
        
    return res

def generate_all_forecasts(pipeline, iterations=5000, proj_years=3):
    return {
        "monte_carlo": generate_monte_carlo_forecast(pipeline, iterations, proj_years),
        "linear_regression": _generate_linear_regression(pipeline, proj_years),
        "ema": _generate_ema(pipeline, proj_years)
    }

def generate_forecast(historical_data, assumptions):
    """Legacy endpoint wrapper if needed."""
    return {}
