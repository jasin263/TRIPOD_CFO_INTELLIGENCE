import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ComposedChart, ReferenceLine, Area, AreaChart, Scatter, Cell
} from 'recharts';
import { 
  LayoutDashboard, LineChart as LineChartIcon, TrendingUp, SlidersHorizontal, 
  Activity, Calculator, Bot, Sparkles, Send, ArrowUpRight, ArrowDownRight, ArrowRight, Search, Loader2,
  FileText, FileSpreadsheet, Users
} from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import CompetitorAnalysis from './CompetitorAnalysis';

const formatCurrency = (val) => val?.toLocaleString(undefined, {maximumFractionDigits:0});
const formatBillion = (val) => `$${(val / 1000)?.toFixed(1)}B`;

const envUrl = import.meta.env.VITE_API_URL;
const API_BASE_URL = envUrl !== undefined ? envUrl : 'http://localhost:8000';

export default function CFODashboard() {
  const [selectedModule, setSelectedModule] = useState(1);
  const [selectedScenario, setSelectedScenario] = useState('base');
  
  // Dynamic Data State
  const [ticker, setTicker] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [provider, setProvider] = useState('combined');
  
  const [ACTUALS, setActuals] = useState(null);
  const [ALL_FORECASTS, setAllForecasts] = useState(null);
  const [activeModel, setActiveModel] = useState('monte_carlo');
  const [FORECAST, setForecast] = useState(null);
  const [MARKET, setMarket] = useState(null);
  const [DCF, setDcf] = useState(null);
  const [signals, setSignals] = useState([]);
  const [multiTickerData, setMultiTickerData] = useState(null);

  // What-If Simulator State
  const [whatIfInputs, setWhatIfInputs] = useState({
    revenueGrowth: 1.5,
    ebitdaMargin: 34.8,
    capexPct: 2.8,
    taxRate: 17.6,
    wcChange: -1651,
    shareBuyback: 3.5,
  });

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      setActuals(null);
      setMultiTickerData(null);
      try {
        let primaryTicker = ticker;
        let isMulti = ticker.includes(',');

        if (isMulti) {
           primaryTicker = ticker.split(',')[0].trim();
        }

        const fetchPromises = [];

        fetchPromises.push(
            fetch(`${API_BASE_URL}/api/financials/compare?tickers=${encodeURIComponent(ticker)}&provider=${provider}`)
            .then(res => res.json())
            .then(json => {
                if(json.status === 'success') {
                    setMultiTickerData(json.data);
                    if (isMulti) setSelectedModule(8);
                }
            })
            .catch(e => console.error(e))
        );

        const finPromise = fetch(`${API_BASE_URL}/api/financials/${primaryTicker}?provider=${provider}`)
            .then(res => res.json())
            .then(finJson => {
                if(finJson.status !== 'success') throw new Error(finJson.detail || 'Failed to fetch financials');
                return finJson;
            });
        
        fetchPromises.push(finPromise);
        
        const results = await Promise.all(fetchPromises);
        const finJson = results[1];
        const data = finJson.data;
        const toM = (arr) => arr.map(v => v / 1000000);
        
        // Sometimes yfinance years are '2024-09-30', sometimes just '2024'
        const rawYears = data.years.map(y => {
            const yr = parseInt(String(y).substring(0, 4));
            return isNaN(yr) ? 2020 : yr;
        });

        // Ensure we have 4 years max for display logic
        let dRev = toM(data.income_statement.revenue);
        let dCogs = toM(data.income_statement.cogs);
        let dGross = toM(data.income_statement.gross_profit);
        let dEbitda = toM(data.income_statement.ebitda);
        let dEbit = toM(data.income_statement.operating_income);
        let dNet = toM(data.income_statement.net_income);
        let dCfo = toM(data.cash_flow.operating_cash_flow);
        let dCapex = toM(data.cash_flow.capex);
        let dFcf = toM(data.cash_flow.free_cash_flow);
        let dDebt = toM(data.balance_sheet.total_debt);

        const newActuals = {
          years: rawYears,
          revenue: dRev,
          cogs: dCogs,
          grossProfit: dGross,
          ebitda: dEbitda,
          ebit: dEbit,
          netIncome: dNet,
          cfo: dCfo,
          capex: dCapex,
          fcf: dFcf,
          netDebt: dDebt,
          grossMargin: data.ratios.gross_margin.map(v => v * 100),
          ebitdaMargin: data.ratios.ebitda_margin.map(v => v * 100),
          netMargin: data.ratios.net_margin.map(v => v * 100),
          fcfMargin: dFcf.map((fcf, i) => (fcf / (dRev[i] || 1)) * 100),
          dso: data.ratios.dso,
          dpo: data.ratios.dpo,
          ccc: data.ratios.dso.map((v, i) => v + data.ratios.dio[i] - data.ratios.dpo[i])
        };
        
        const lastRev = newActuals.revenue[newActuals.revenue.length - 1] || 1000;
        const lastEbitda = newActuals.ebitda[newActuals.ebitda.length - 1] || 200;
        const lastNi = newActuals.netIncome[newActuals.netIncome.length - 1] || 100;
        const lastFcf = newActuals.fcf[newActuals.fcf.length - 1] || 100;
        const lastEbitdaM = newActuals.ebitdaMargin[newActuals.ebitdaMargin.length - 1] || 20;

        const lastYear = newActuals.years[newActuals.years.length - 1] || new Date().getFullYear() - 1;

        // Parse All Forecasts from backend
        const toMArray = (arr) => arr.map(v => v / 1000000);
        const parseForecast = (mc) => ({
          years: mc.years,
          bear: {
            revenue: toMArray(mc.bear.revenue), ebitda: toMArray(mc.bear.ebitda),
            netIncome: toMArray(mc.bear.netIncome), fcf: toMArray(mc.bear.fcf), ebitdaMargin: mc.bear.ebitdaMargin
          },
          base: {
            revenue: toMArray(mc.base.revenue), ebitda: toMArray(mc.base.ebitda),
            netIncome: toMArray(mc.base.netIncome), fcf: toMArray(mc.base.fcf), ebitdaMargin: mc.base.ebitdaMargin
          },
          bull: {
            revenue: toMArray(mc.bull.revenue), ebitda: toMArray(mc.bull.ebitda),
            netIncome: toMArray(mc.bull.netIncome), fcf: toMArray(mc.bull.fcf), ebitdaMargin: mc.bull.ebitdaMargin
          }
        });
        
        const fcs = data.forecasts || { monte_carlo: data.monte_carlo_forecast, linear_regression: data.monte_carlo_forecast, ema: data.monte_carlo_forecast };
        const parsedForecasts = {
            monte_carlo: parseForecast(fcs.monte_carlo),
            linear_regression: parseForecast(fcs.linear_regression),
            ema: parseForecast(fcs.ema)
        };
        const newForecast = parsedForecasts[activeModel];

        const md = data.market_data;
        const newMarket = {
          currentPrice: md.currentPrice || 100,
          marketCapBn: md.marketCapBn || 100,
          evEbitda: md.evEbitda || 15,
          peRatio: md.peRatio || 20,
          beta: md.beta || 1.0,
          sharesOutstandingM: md.sharesOutstandingM || 1000,
        };

        const wacc = 0.09;
        const tgr = 0.025;
        const netDebtM = newActuals.netDebt[newActuals.netDebt.length - 1] || 0;
        const sharesM = newMarket.sharesOutstandingM || 1;

        // 1. True 3-Stage DCF
        const calcDCF = (scenario) => {
           const fcfs = newForecast[scenario].fcf;
           let pvFcf = 0;
           for(let i=0; i<3; i++) pvFcf += fcfs[i] / Math.pow(1+wacc, i+1);
           const tv = (fcfs[2] * (1+tgr)) / (wacc - tgr);
           const pvTv = tv / Math.pow(1+wacc, 3);
           const ev = pvFcf + pvTv;
           return (ev - netDebtM) / sharesM;
        };

        // 2. EV/EBITDA Multiples
        const evEbitdaMult = newMarket.evEbitda || 15;
        const calcEvEbitda = (scenario) => {
           const ev = newForecast[scenario].ebitda[2] * evEbitdaMult;
           const pvEv = ev / Math.pow(1+wacc, 3);
           return (pvEv - netDebtM) / sharesM;
        };

        // 3. P/E Multiples
        const peMult = newMarket.peRatio || 20;
        const calcPE = (scenario) => {
           const eq = newForecast[scenario].netIncome[2] * peMult;
           const pvEq = eq / Math.pow(1+wacc, 3);
           return pvEq / sharesM;
        };

        // 4. Graham Number
        const eps = lastNi / sharesM;
        const totalEq = newActuals.totalEquity ? newActuals.totalEquity[newActuals.totalEquity.length-1] : 1000;
        const bvps = totalEq / sharesM;
        const grahamNum = (eps > 0 && bvps > 0) ? Math.sqrt(22.5 * eps * bvps) : 0;

        const newValuation = {
           wacc, tgr,
           dcf: { low: calcDCF('bear'), base: calcDCF('base'), high: calcDCF('bull') },
           evEbitda: { low: calcEvEbitda('bear'), base: calcEvEbitda('base'), high: calcEvEbitda('bull') },
           pe: { low: calcPE('bear'), base: calcPE('base'), high: calcPE('bull') },
           graham: grahamNum
        };

        // Reset What-If inputs to match new base data
        setWhatIfInputs({
            revenueGrowth: 5.0, // Base forecast is 5%
            ebitdaMargin: parseFloat(lastEbitdaM.toFixed(1)),
            capexPct: parseFloat(((newActuals.capex[newActuals.capex.length-1] / lastRev)*100).toFixed(1)) || 3.0,
            taxRate: 21.0,
            wcChange: 0,
            shareBuyback: 3.0,
        });

        // Initialize Chat Messages
        setChatMessages([
            { role: 'assistant', content: `Hello! I'm your AI CFO Copilot. I've just loaded data for ${primaryTicker.toUpperCase()} with a current market cap of $${newMarket.marketCapBn.toFixed(1)}B and trailing revenue of $${(lastRev/1000).toFixed(1)}B. How can I assist you with modeling or risks today?` }
        ]);

        setActuals(newActuals);
        setAllForecasts(parsedForecasts);
        setForecast(parsedForecasts[activeModel]);
        setMarket(newMarket);
        setDcf(newValuation);
        
        // Fetch macro
        try {
           const macRes = await fetch(`${API_BASE_URL}/api/macro`);
           const macJson = await macRes.json();
           if(macJson.status === 'success') {
               setSignals(macJson.data);
           }
        } catch(e) { console.error("Macro error", e); }

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [ticker, provider]);

  const handleAddCompetitor = (newTicker) => {
      const currentTickers = ticker.includes(',') ? ticker.split(',').map(t=>t.trim()) : [ticker];
      const newTickers = newTicker.split(',').map(t=>t.trim().toUpperCase()).filter(t => t && !currentTickers.includes(t));
      if (newTickers.length === 0) return;
      const updatedTickersStr = [...currentTickers, ...newTickers].join(', ');
      setTicker(updatedTickersStr);
      setLoading(true);
  };

  const handleSearch = (e) => {
      e.preventDefault();
      if(searchInput.trim()) {
          setTicker(searchInput.toUpperCase());
          setLoading(true);
      }
  };

    useEffect(() => {
        if (ALL_FORECASTS && activeModel) {
            setForecast(ALL_FORECASTS[activeModel]);
        }
    }, [activeModel, ALL_FORECASTS]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || !ACTUALS || isChatLoading) return;
    const msg = chatInput;
    const currentMessages = [...chatMessages, { role: 'user', content: msg }];
    setChatMessages(currentMessages);
    setChatInput('');
    setIsChatLoading(true);
    
    try {
      const financial_context = {
          marketPrice: MARKET.currentPrice,
          marketCapBn: MARKET.marketCapBn,
          revenue: ACTUALS.revenue[ACTUALS.revenue.length - 1],
          ebitda: ACTUALS.ebitda[ACTUALS.ebitda.length - 1],
          ebitdaMargin: ACTUALS.ebitdaMargin[ACTUALS.ebitdaMargin.length - 1],
          fcf: ACTUALS.fcf[ACTUALS.fcf.length - 1],
          fcfMargin: ACTUALS.fcfMargin[ACTUALS.fcfMargin.length - 1],
          dcfPrice: DCF.impliedPrice
      };

      const res = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              ticker: ticker.includes(',') ? ticker.split(',')[0].trim() : ticker,
              messages: currentMessages.map(m => ({role: m.role, content: m.content})),
              financial_context: financial_context
          })
      });
      
      const json = await res.json();
      if(json.status === 'success') {
          setChatMessages(prev => [...prev, { role: 'assistant', content: json.data }]);
      } else {
          setChatMessages(prev => [...prev, { role: 'assistant', content: "Error connecting to AI service." }]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Failed to reach AI backend." }]);
    } finally {
      setIsChatLoading(false);
    }
  };
  const handleDownloadExcel = () => {
    try {
      if (!ACTUALS) {
        alert("No financial data available to export.");
        return;
      }

      const wb = utils.book_new();

      // 1. Historical Actuals Sheet
      const actualsData = ACTUALS.years.map((year, i) => ({
        Year: year,
        Revenue: ACTUALS.revenue[i],
        'Gross Profit': ACTUALS.grossProfit[i],
        EBITDA: ACTUALS.ebitda[i],
        'Net Income': ACTUALS.netIncome[i],
        FCF: ACTUALS.fcf[i],
        'Gross Margin %': ACTUALS.grossMargin[i] !== undefined ? ACTUALS.grossMargin[i] : null,
        'EBITDA Margin %': ACTUALS.ebitdaMargin[i] !== undefined ? ACTUALS.ebitdaMargin[i] : null,
        'Net Margin %': ACTUALS.netMargin[i] !== undefined ? ACTUALS.netMargin[i] : null,
        'FCF Margin %': ACTUALS.fcfMargin[i] !== undefined ? ACTUALS.fcfMargin[i] : null,
        'Net Debt': ACTUALS.netDebt[i],
      }));
      const wsActuals = utils.json_to_sheet(actualsData);
      utils.book_append_sheet(wb, wsActuals, "Historical Financials");

      // 2. Forecasts Sheet (Base Scenario)
      if (FORECAST && FORECAST.base && FORECAST.years) {
        const forecastData = FORECAST.years.map((year, i) => ({
          Year: `FY${String(year).substring(2)} (E)`,
          Revenue: FORECAST.base.revenue[i],
          EBITDA: FORECAST.base.ebitda[i],
          'EBITDA Margin %': FORECAST.base.ebitdaMargin[i],
          'Net Income': FORECAST.base.netIncome[i],
          FCF: FORECAST.base.fcf[i],
          'FCF Margin %': FORECAST.base.fcf[i] && FORECAST.base.revenue[i] ? (FORECAST.base.fcf[i] / FORECAST.base.revenue[i] * 100) : null,
        }));
        const wsForecasts = utils.json_to_sheet(forecastData);
        utils.book_append_sheet(wb, wsForecasts, "Base Forecasts");
      }

      // 3. Market & Valuation Data
      if (MARKET && DCF) {
        const marketData = [
          { Metric: 'Current Price', Value: MARKET.currentPrice },
          { Metric: 'Market Cap ($B)', Value: MARKET.marketCapBn },
          { Metric: 'EV/EBITDA Multiple', Value: MARKET.evEbitda },
          { Metric: 'P/E Ratio', Value: MARKET.peRatio },
          { Metric: 'Beta', Value: MARKET.beta },
          { Metric: 'Shares Outstanding (M)', Value: MARKET.sharesOutstandingM },
          { Metric: 'Implied Price (DCF Base)', Value: DCF.dcf?.base },
          { Metric: 'Implied Price (EV/EBITDA Base)', Value: DCF.evEbitda?.base },
          { Metric: 'Implied Price (P/E Base)', Value: DCF.pe?.base },
          { Metric: 'Graham Number', Value: DCF.graham },
        ];
        const wsMarket = utils.json_to_sheet(marketData);
        utils.book_append_sheet(wb, wsMarket, "Valuation & Market");
      }

      writeFile(wb, `${ticker || 'Company'}_Financial_Report.xlsx`);
    } catch (err) {
      console.error("Excel Export Error:", err);
      alert("Failed to export Excel file. See console for details.");
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('main-content-area');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0F1117'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${ticker}_Dashboard_Report.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
    }
  };


  const navItems = [
    { id: 1, label: 'CFO Cockpit', icon: LayoutDashboard },
    { id: 2, label: 'Financial Overview', icon: LineChartIcon },
    { id: 3, label: 'Forecasts', icon: TrendingUp },
    { id: 4, label: 'What-If Simulator', icon: SlidersHorizontal },
    { id: 5, label: 'Drivers & Signals', icon: Activity },
    { id: 6, label: 'Valuation', icon: Calculator },
    { id: 7, label: 'AI CFO Copilot', icon: Bot },
    { id: 8, label: 'Competitor Analysis', icon: Users },
  ];

  if (!ticker) {
      return (
          <div className="flex h-screen bg-[#0F1117] text-white items-center justify-center flex-col gap-6">
              <div className="w-16 h-16 bg-gradient-to-tr from-[#185FA5] to-[#533AB7] rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(24,95,165,0.3)]">
                  <Activity size={32} className="text-white" />
              </div>
              <div className="text-center">
                  <h1 className="text-3xl font-bold mb-2">TRIPOD CFO Intelligence</h1>
                  <p className="text-gray-400">Search for a company to initialize the live financial model.</p>
              </div>
              <div className="flex flex-col gap-2 w-96 mt-4">
                  <form onSubmit={handleSearch} className="relative w-full">
                      <Search className="absolute left-4 top-4 text-gray-500" size={20} />
                      <input 
                          type="text" 
                          value={searchInput} 
                          onChange={e => setSearchInput(e.target.value)} 
                          placeholder="Enter Ticker (e.g., AAPL, TSLA, RELIANCE.NS)..."
                          className="w-full bg-[#1A1D24] border border-gray-700 rounded-xl pl-12 pr-4 py-4 text-sm text-white outline-none focus:border-[#185FA5] shadow-lg"
                      />
                      <button type="submit" className="absolute right-2 top-2 bottom-2 bg-[#185FA5] px-4 rounded-lg font-bold text-sm hover:bg-[#134980] transition-colors">
                          Analyze
                      </button>
                  </form>
                  <select 
                      value={provider} 
                      onChange={e => setProvider(e.target.value)}
                      className="bg-[#1A1D24] border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-300 outline-none focus:border-[#185FA5] w-full shadow-lg"
                  >
                      <option value="combined">Data Provider: Combined (15+ Years) (CSV + Yahoo)</option>
                      <option value="combined_fmp">Data Provider: Combined (15+ Years) (CSV + FMP)</option>
                      <option value="yfinance">Data Provider: Yahoo Finance (4 Years)</option>
                      <option value="fmp">Data Provider: Financial Modeling Prep (5 Years)</option>
                      <option value="csv">Data Provider: Local CSV Dataset</option>
                  </select>
              </div>
          </div>
      )
  }

  if (loading || (!ACTUALS && !multiTickerData && !error)) {
      return (
          <div className="flex h-screen bg-[#0F1117] text-white items-center justify-center flex-col gap-4">
              <Loader2 className="animate-spin text-[#185FA5]" size={48} />
              <div className="text-xl font-bold">Fetching Live Data for {ticker}...</div>
              <div className="text-sm text-gray-400">Connecting to Financial & Macro APIs</div>
          </div>
      )
  }

  if (error) {
      return (
          <div className="flex h-screen bg-[#0F1117] text-white items-center justify-center flex-col gap-4">
              <div className="text-[#993C1D] text-2xl font-bold">Error loading data</div>
              <div className="text-gray-400">{error}</div>
              <button onClick={() => setTicker('')} className="mt-4 bg-[#185FA5] px-6 py-2 rounded">Go Back</button>
          </div>
      )
  }

  return (
    <div className="flex h-screen bg-[#0F1117] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-[220px] bg-[#1A1D24] flex flex-col shrink-0 border-r border-gray-800">
        <div className="p-5 border-b border-gray-800">
          <div className="flex items-center space-x-2 text-xl font-bold mb-1">
            <div className="w-8 h-8 bg-gradient-to-tr from-[#185FA5] to-[#533AB7] text-white rounded-lg flex items-center justify-center font-bold text-xs">
              {(ticker?.includes(',') ? ticker.split(',')[0].trim() : ticker)?.substring(0,2)}
            </div>
            <span className="truncate" title={ticker}>{ticker?.includes(',') ? ticker.split(',')[0].trim() : ticker}</span>
          </div>
          <div className="text-[10px] text-gray-400">TRIPOD CFO Intelligence</div>
        </div>
        
        <div className="p-3 border-b border-gray-800 space-y-2">
            <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-2 top-2 text-gray-500" size={14} />
                <input 
                    type="text" 
                    value={searchInput} 
                    onChange={e => setSearchInput(e.target.value)} 
                    placeholder="Search Ticker..."
                    className="w-full bg-[#0F1117] border border-gray-700 rounded pl-8 pr-2 py-1.5 text-xs text-white outline-none focus:border-[#185FA5]"
                />
            </form>
            <select 
                value={provider} 
                onChange={e => setProvider(e.target.value)}
                className="w-full bg-[#0F1117] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-400 outline-none focus:border-[#185FA5]"
            >
                <option value="combined">Combined (15+ Yrs) (CSV + Yahoo)</option>
                <option value="combined_fmp">Combined (15+ Yrs) (CSV + FMP)</option>
                <option value="yfinance">yfinance (4 Yrs)</option>
                <option value="fmp">FMP (5 Yrs)</option>
                <option value="csv">Local CSV</option>
            </select>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setSelectedModule(item.id)}
              className={`w-full flex items-center space-x-3 px-5 py-3 text-sm transition-colors
                ${selectedModule === item.id ? 'bg-[#1E2330] border-l-4 border-[#185FA5] text-white' : 'border-l-4 border-transparent text-gray-400 hover:bg-[#1E2330] hover:text-white'}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Download Buttons Area */}
        <div className="p-4 border-t border-gray-800 space-y-2">
            <button 
                onClick={handleDownloadPDF}
                className="w-full flex items-center justify-center space-x-2 bg-[#1A1D24] border border-gray-700 hover:bg-[#1E2330] text-gray-300 px-4 py-2 rounded text-xs transition-colors"
            >
                <FileText size={14} />
                <span>Export PDF</span>
            </button>
            <button 
                onClick={handleDownloadExcel}
                className="w-full flex items-center justify-center space-x-2 bg-[#185FA5] hover:bg-[#134980] text-white px-4 py-2 rounded text-xs font-bold shadow-lg transition-colors"
            >
                <FileSpreadsheet size={14} />
                <span>Export Excel</span>
            </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div id="main-content-area" className="flex-1 overflow-y-auto p-6 bg-[#0F1117]">
        {selectedModule === 1 && ACTUALS && <Module1Cockpit ACTUALS={ACTUALS} FORECAST={FORECAST} />}
        {selectedModule === 2 && ACTUALS && <Module2Overview ACTUALS={ACTUALS} />}
        {selectedModule === 3 && ACTUALS && <Module3Forecasts ACTUALS={ACTUALS} FORECAST={FORECAST} scenario={selectedScenario} setScenario={setSelectedScenario} activeModel={activeModel} setActiveModel={setActiveModel} />}
        {selectedModule === 4 && ACTUALS && <Module4Simulator ACTUALS={ACTUALS} FORECAST={FORECAST} inputs={whatIfInputs} setInputs={setWhatIfInputs} ticker={ticker} />}
        {selectedModule === 5 && <Module5Drivers signals={signals} />}
        {selectedModule === 6 && ACTUALS && <Module6Valuation ACTUALS={ACTUALS} FORECAST={FORECAST} MARKET={MARKET} VALUATION={DCF} />}
        {selectedModule === 7 && ACTUALS && <Module7Copilot ticker={ticker} messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={handleChatSend} isLoading={isChatLoading} />}
        {selectedModule === 8 && multiTickerData && <CompetitorAnalysis data={multiTickerData} tickers={ticker.split(',').map(t=>t.trim())} onAddCompetitor={handleAddCompetitor} />}
        {selectedModule === 8 && !multiTickerData && (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="animate-spin text-[#185FA5]" size={48} />
            </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 1 - CFO COCKPIT
// --------------------------------------------------------------------------------------
function Module1Cockpit({ACTUALS, FORECAST}) {
  const actualsData = ACTUALS.years.map((y, i) => ({
    year: y.toString(),
    Revenue: ACTUALS.revenue[i] / 1000,
    GrossProfit: ACTUALS.grossProfit[i] / 1000,
    EBITDA: ACTUALS.ebitda[i] / 1000,
    NetIncome: ACTUALS.netIncome[i] / 1000,
  }));

  const lastFcf = ACTUALS.fcf[ACTUALS.fcf.length - 1] || 0;
  const cashForecast = Array.from({length: 13}).map((_, i) => {
    const val = lastFcf - (i * (lastFcf*0.05/12)) + (Math.random()*(lastFcf*0.02) - (lastFcf*0.01));
    return {
      week: `W${i+1}`,
      actual: i < 4 ? val : null,
      forecast: i >= 3 ? val : null,
      min: val * 0.96,
      max: val * 1.04
    };
  });

  const lastRev = ACTUALS.revenue[ACTUALS.revenue.length - 1];
  const prevRev = ACTUALS.revenue[ACTUALS.revenue.length - 2] || 1;
  const revGrowth = ((lastRev / prevRev) - 1) * 100;

  const lastEbitda = ACTUALS.ebitda[ACTUALS.ebitda.length - 1];
  const prevEbitda = ACTUALS.ebitda[ACTUALS.ebitda.length - 2] || 1;
  const ebitdaGrowth = ((lastEbitda / prevEbitda) - 1) * 100;

  const lastEbitdaM = ACTUALS.ebitdaMargin[ACTUALS.ebitdaMargin.length - 1];
  const lastNi = ACTUALS.netIncome[ACTUALS.netIncome.length - 1];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold mb-4">CFO Cockpit</h2>
      
      {/* Top Strip */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Revenue TTM" value={`$${formatCurrency(lastRev)}M`} delta={`${revGrowth>0?'+':''}${revGrowth.toFixed(1)}%`} deltaColor={revGrowth>0?"text-[#1D9E75]":"text-[#993C1D]"} borderColor="border-[#185FA5]" />
        <MetricCard label="EBITDA" value={`$${formatCurrency(lastEbitda)}M`} delta={`${ebitdaGrowth>0?'+':''}${ebitdaGrowth.toFixed(1)}%`} deltaColor={ebitdaGrowth>0?"text-[#1D9E75]":"text-[#993C1D]"} borderColor="border-[#1D9E75]" />
        <MetricCard label="EBITDA Margin" value={`${lastEbitdaM.toFixed(1)}%`} delta="vs PY" deltaColor="text-gray-400" borderColor="border-[#1D9E75]" />
        <MetricCard label="FCF" value={`$${formatCurrency(lastFcf)}M`} delta="vs PY" deltaColor="text-gray-400" borderColor="border-[#993C1D]" />
        <MetricCard label="Net Debt/EBITDA" value={`${(ACTUALS.netDebt[ACTUALS.netDebt.length-1] / (lastEbitda||1)).toFixed(2)}x`} delta="Current" deltaColor="text-gray-400" borderColor="border-[#1D9E75]" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Financial Performance */}
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">Financial Performance ($B)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={actualsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
                <XAxis dataKey="year" stroke="#8892b0" fontSize={12} tickLine={false} />
                <YAxis stroke="#8892b0" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="Revenue" fill="#185FA5" radius={[2,2,0,0]} />
                <Bar dataKey="GrossProfit" fill="#533AB7" radius={[2,2,0,0]} />
                <Bar dataKey="EBITDA" fill="#1D9E75" radius={[2,2,0,0]} />
                <Bar dataKey="NetIncome" fill="#BA7517" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 13-Week Cash */}
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800 flex flex-col">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">13-Week Cash Forecast Base Trend</h3>
          <div className="h-64 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashForecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
                <XAxis dataKey="week" stroke="#8892b0" fontSize={12} tickLine={false} />
                <YAxis domain={['auto', 'auto']} stroke="#8892b0" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
                <Area type="monotone" dataKey="max" fill="#2a2e39" stroke="none" fillOpacity={0.4} />
                <Area type="monotone" dataKey="min" fill="#0F1117" stroke="none" fillOpacity={1} />
                <Line type="monotone" dataKey="actual" stroke="#1D9E75" strokeWidth={3} dot={{r:4}} />
                <Line type="monotone" dataKey="forecast" stroke="#185FA5" strokeWidth={2} strokeDasharray="5 5" dot={{r:3}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Scenario Snapshot */}
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">Scenario Snapshot ({FORECAST.years[0]})</h3>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="pb-2 font-medium">Scenario</th>
                <th className="pb-2 font-medium">Revenue</th>
                <th className="pb-2 font-medium">EBITDA</th>
                <th className="pb-2 font-medium">FCF</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-800">
                <td className="py-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#BA7517]"></div>Bear</td>
                <td>${formatCurrency(FORECAST.bear.revenue[0])}M</td><td>${formatCurrency(FORECAST.bear.ebitda[0])}M</td><td className="text-[#993C1D]">${formatCurrency(FORECAST.bear.fcf[0])}M</td>
              </tr>
              <tr className="border-b border-gray-800 bg-[#1E2330]">
                <td className="py-3 flex items-center gap-2 px-1"><div className="w-2 h-2 rounded-full bg-[#185FA5]"></div>Base</td>
                <td>${formatCurrency(FORECAST.base.revenue[0])}M</td><td>${formatCurrency(FORECAST.base.ebitda[0])}M</td><td className="text-[#1D9E75]">${formatCurrency(FORECAST.base.fcf[0])}M</td>
              </tr>
              <tr>
                <td className="py-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#1D9E75]"></div>Bull</td>
                <td>${formatCurrency(FORECAST.bull.revenue[0])}M</td><td>${formatCurrency(FORECAST.bull.ebitda[0])}M</td><td className="text-[#1D9E75]">${formatCurrency(FORECAST.bull.fcf[0])}M</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Risk Monitor */}
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-4 text-gray-300">Risk Monitor</h3>
          <div className="space-y-4">
            <RiskBar label="FCF Compression Risk" level="MEDIUM" color="bg-[#BA7517]" desc={`FCF margin is ${ACTUALS.fcfMargin[ACTUALS.fcfMargin.length-1]?.toFixed(1)}%`} />
            <RiskBar label="Valuation Risk" level="HIGH" color="bg-[#993C1D]" desc="DCF disconnect from market multiples" />
            <RiskBar label="Working Capital Risk" level="LOW" color="bg-[#1D9E75]" desc={`CCC stable at ${ACTUALS.ccc[ACTUALS.ccc.length-1]?.toFixed(1)} days`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({label, value, delta, deltaColor, borderColor}) {
  return (
    <div className={`bg-[#1A1D24] p-4 rounded-xl border-t-4 ${borderColor} border-l border-r border-b border-gray-800 flex flex-col justify-between`}>
      <div className="text-gray-400 text-xs font-medium">{label}</div>
      <div className="text-xl lg:text-2xl font-bold mt-1 mb-1">{value}</div>
      <div className={`text-xs font-semibold ${deltaColor}`}>{delta}</div>
    </div>
  );
}

function RiskBar({label, level, color, desc}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className={`text-xs px-2 py-0.5 rounded font-bold ${color} text-white`}>{level}</span>
      </div>
      <div className="w-full bg-[#0F1117] h-2 rounded-full mb-1">
        <div className={`h-full rounded-full ${color}`} style={{width: level==='HIGH'?'85%':level==='MEDIUM'?'50%':'15%'}}></div>
      </div>
      <div className="text-xs text-gray-500">{desc}</div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 2 - FINANCIAL OVERVIEW
// --------------------------------------------------------------------------------------
function Module2Overview({ACTUALS}) {
  const pnlData = ACTUALS.years.map((y, i) => {
      return {
        year: y,
        revenue: ACTUALS.revenue[i],
        gross: ACTUALS.grossProfit[i],
        ebitda: ACTUALS.ebitda[i],
        netIncome: ACTUALS.netIncome[i],
        fcf: ACTUALS.fcf[i],
        gm: ACTUALS.grossMargin[i],
        ebitdaM: ACTUALS.ebitdaMargin[i],
        netM: ACTUALS.netMargin[i],
        fcfM: ACTUALS.fcfMargin[i],
        netDebt: ACTUALS.netDebt[i],
      }
  });

  const getMarginColor = (val) => {
    if(val >= 30) return 'bg-[#1D9E75]/20 text-[#1D9E75]';
    if(val >= 20) return 'bg-[#BA7517]/20 text-[#BA7517]';
    return 'bg-[#993C1D]/20 text-[#993C1D]';
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold mb-4">Financial Overview (Historical)</h2>
      
      <div className="bg-[#1A1D24] rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-xs text-right whitespace-nowrap">
          <thead className="bg-[#0F1117]">
            <tr>
              <th className="p-3 text-left border-r border-gray-800 sticky left-0 bg-[#0F1117] z-10 text-gray-400">Metric ($M)</th>
              {ACTUALS.years.map(y => (
                <th key={y} className={`p-3 font-medium text-gray-400`}>{y} (A)</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {['Revenue', 'Gross Profit', 'EBITDA', 'Net Income', 'FCF'].map(metric => {
              const keyMap = { 'Revenue':'revenue', 'Gross Profit':'gross', 'EBITDA':'ebitda', 'Net Income':'netIncome', 'FCF':'fcf' };
              return (
                <tr key={metric} className="hover:bg-[#1E2330] transition-colors">
                  <td className="p-3 text-left border-r border-gray-800 sticky left-0 bg-[#1A1D24] font-semibold">{metric}</td>
                  {pnlData.map(d => (
                    <td key={d.year} className="p-3">{d[keyMap[metric]]?.toLocaleString('en-US', {maximumFractionDigits:0})}</td>
                  ))}
                </tr>
              )
            })}
            <tr className="bg-[#0F1117]"><td colSpan={ACTUALS.years.length + 1} className="h-2 p-0"></td></tr>
            {['Gross Margin %', 'EBITDA Margin %', 'Net Margin %', 'FCF Margin %'].map(metric => {
              const keyMap = { 'Gross Margin %':'gm', 'EBITDA Margin %':'ebitdaM', 'Net Margin %':'netM', 'FCF Margin %':'fcfM' };
              return (
                <tr key={metric} className="hover:bg-[#1E2330] transition-colors">
                  <td className="p-3 text-left border-r border-gray-800 sticky left-0 bg-[#1A1D24] text-gray-400">{metric}</td>
                  {pnlData.map(d => {
                    const val = d[keyMap[metric]];
                    return (
                      <td key={d.year} className="p-2 text-center">
                        <span className={`px-2 py-1 rounded font-bold ${getMarginColor(val)}`}>
                          {val?.toFixed(1)}%
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-6 h-64">
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-xs font-semibold mb-2 text-gray-400 text-center">Margin Trends</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" />
              <XAxis dataKey="year" stroke="#8892b0" fontSize={10} tickLine={false} />
              <YAxis stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} domain={['auto','auto']} />
              <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333', fontSize: '12px'}} />
              <Line type="monotone" dataKey="gm" stroke="#533AB7" dot={false} strokeWidth={2} name="Gross %" />
              <Line type="monotone" dataKey="ebitdaM" stroke="#1D9E75" dot={false} strokeWidth={2} name="EBITDA %" />
              <Line type="monotone" dataKey="netM" stroke="#BA7517" dot={false} strokeWidth={2} name="Net %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-xs font-semibold mb-2 text-gray-400 text-center">FCF vs Net Income</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" />
              <XAxis dataKey="year" stroke="#8892b0" fontSize={10} tickLine={false} />
              <YAxis stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333', fontSize: '12px'}} />
              <Bar dataKey="fcf" fill="#185FA5" name="FCF" />
              <Bar dataKey="netIncome" fill="#BA7517" name="Net Inc" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-xs font-semibold mb-2 text-gray-400 text-center">Net Debt Trend ($M)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" />
              <XAxis dataKey="year" stroke="#8892b0" fontSize={10} tickLine={false} />
              <YAxis stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333', fontSize: '12px'}} />
              <Line type="monotone" dataKey="netDebt" stroke="#993C1D" strokeWidth={3} dot={{r:4}} name="Net Debt" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 3 - FORECASTS
// --------------------------------------------------------------------------------------
function Module3Forecasts({ACTUALS, FORECAST, scenario, setScenario, activeModel, setActiveModel}) {
  const revData = [
    ...ACTUALS.years.map((y,i) => ({ year: y.toString(), act: ACTUALS.revenue[i] })),
    ...FORECAST.years.map((y,i) => ({ 
      year: y.toString(), 
      proj: FORECAST[scenario].revenue[i],
      p10: FORECAST.bear.revenue[i],
      p90: FORECAST.bull.revenue[i] 
    }))
  ];

  const baseFY26Rev = FORECAST.base.revenue[0];
  const wData = [
    { name: 'EBITDA', val: FORECAST.base.ebitda[0], fill: '#1D9E75' },
    { name: 'Taxes/WC/CapEx', val: FORECAST.base.fcf[0] - FORECAST.base.ebitda[0], fill: '#993C1D' },
    { name: 'FCF', val: FORECAST.base.fcf[0], fill: '#533AB7' },
  ];
  let current = 0;
  const waterfallData = wData.map((d, i) => {
    if (i === 0 || i === wData.length - 1) {
      return { name: d.name, start: 0, end: d.val, fill: d.fill };
    }
    const start = current;
    current += d.val;
    return { name: d.name, start, end: current, fill: d.fill };
  });

  const marginData = [
    ...ACTUALS.years.map((y,i) => ({ year: y.toString(), act: ACTUALS.ebitdaMargin[i] })),
    ...FORECAST.years.map((y,i) => ({ 
      year: y.toString(), 
      bear: FORECAST.bear.ebitdaMargin[i],
      base: FORECAST.base.ebitdaMargin[i],
      bull: FORECAST.bull.ebitdaMargin[i]
    }))
  ];

  const getColor = (s) => s==='bear' ? '#BA7517' : s==='base' ? '#185FA5' : '#1D9E75';

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">Financial Forecasts</h2>
            <select 
                value={activeModel} 
                onChange={(e) => setActiveModel(e.target.value)}
                className="bg-[#1A1D24] border border-gray-800 text-gray-300 text-sm rounded-lg focus:ring-[#185FA5] focus:border-[#185FA5] block p-2 outline-none"
            >
                <option value="monte_carlo">Monte Carlo Simulation</option>
                <option value="linear_regression">Linear Regression Trend</option>
                <option value="ema">Exponential Moving Average</option>
            </select>
        </div>
        <div className="bg-[#1A1D24] p-1 rounded-lg border border-gray-800 flex">
          {['bear', 'base', 'bull'].map(s => (
            <button key={s} onClick={() => setScenario(s)} 
              className={`px-6 py-1.5 rounded-md text-sm font-bold uppercase transition-colors ${scenario === s ? `bg-[#1E2330] text-[${getColor(s)}] border border-gray-700 shadow-sm` : 'text-gray-500 hover:text-gray-300'}`}
              style={scenario === s ? {color: getColor(s)} : {}}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 h-72">
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-2 text-center text-gray-300">Revenue Forecast ($M)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={revData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false}/>
              <XAxis dataKey="year" stroke="#8892b0" fontSize={11} tickLine={false} />
              <YAxis stroke="#8892b0" fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
              <Area type="monotone" dataKey="p90" stroke="none" fill="#185FA5" fillOpacity={0.1} />
              <Area type="monotone" dataKey="p10" stroke="none" fill="#0F1117" fillOpacity={1} />
              <Bar dataKey="act" fill="#4a5568" radius={[2,2,0,0]} barSize={20} />
              <Bar dataKey="proj" fill={getColor(scenario)} radius={[2,2,0,0]} barSize={20} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-2 text-center text-gray-300">FCF Bridge (FY{String(FORECAST.years[0]).substring(2)} Base)</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false}/>
              <XAxis dataKey="name" stroke="#8892b0" fontSize={10} tickLine={false} interval={0} />
              <YAxis stroke="#8892b0" fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
              <Bar dataKey="start" stackId="a" fill="transparent" />
              <Bar dataKey="end" stackId="a" radius={2}>
                {waterfallData.map((entry, index) => (
                  <cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
          <h3 className="text-sm font-semibold mb-2 text-center text-gray-300">EBITDA Margin Trajectory</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={marginData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false}/>
              <XAxis dataKey="year" stroke="#8892b0" fontSize={11} tickLine={false} />
              <YAxis stroke="#8892b0" fontSize={11} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
              <Line type="monotone" dataKey="act" stroke="#4a5568" strokeWidth={3} dot={{r:3}} />
              <Line type="monotone" dataKey="bear" stroke="#BA7517" strokeWidth={2} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="base" stroke="#185FA5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bull" stroke="#1D9E75" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800 mt-6">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">Forecast Summary ({scenario.toUpperCase()})</h3>
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400">
              <th className="pb-2 text-left">Metric</th>
              <th className="pb-2">FY{ACTUALS.years[ACTUALS.years.length-1]} (A)</th>
              <th className="pb-2">FY{FORECAST.years[0]} (E)</th>
              <th className="pb-2">FY{FORECAST.years[1]} (E)</th>
              <th className="pb-2">FY{FORECAST.years[2]} (E)</th>
              <th className="pb-2 text-[#185FA5]">3Y CAGR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {['Revenue', 'EBITDA', 'NetIncome', 'FCF'].map((m, i) => {
              const keyMap = { 'Revenue': 'revenue', 'EBITDA': 'ebitda', 'NetIncome': 'netIncome', 'FCF': 'fcf' };
              const acts = ACTUALS[keyMap[m]];
              const projs = FORECAST[scenario][keyMap[m]];
              const startVal = acts[acts.length-1] || 1;
              const cagr = (Math.pow(projs[2] / startVal, 1/3) - 1) * 100;
              return (
                <tr key={m} className="hover:bg-[#1E2330]">
                  <td className="py-3 text-left font-medium text-gray-300">{m === 'NetIncome' ? 'Net Income' : m}</td>
                  <td className="py-3">${formatCurrency(startVal)}M</td>
                  <td className="py-3 text-white">${formatCurrency(projs[0])}M</td>
                  <td className="py-3 text-white">${formatCurrency(projs[1])}M</td>
                  <td className="py-3 text-white">${formatCurrency(projs[2])}M</td>
                  <td className="py-3 font-bold text-[#185FA5]">{cagr.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 4 - WHAT-IF SIMULATOR
// --------------------------------------------------------------------------------------
function Module4Simulator({ACTUALS, FORECAST, inputs, setInputs, ticker}) {
  const handleChange = (e) => setInputs({...inputs, [e.target.name]: parseFloat(e.target.value)});

  const baseRev = ACTUALS.revenue[ACTUALS.revenue.length-1] || 1;
  const baseFY26Rev = FORECAST.base.revenue[0];
  const baseEBITDA = FORECAST.base.ebitda[0];
  const baseFCF = FORECAST.base.fcf[0];

  const projRev = baseRev * (1 + inputs.revenueGrowth/100);
  const projEBITDA = projRev * (inputs.ebitdaMargin/100);
  const projDA = projRev * 0.03;
  const projEBIT = projEBITDA - projDA;
  const projTax = projEBIT * (inputs.taxRate/100);
  const projNOPAT = projEBIT - projTax;
  const projCapex = projRev * (inputs.capexPct/100);
  const projFCF = projNOPAT + projDA - inputs.wcChange - projCapex;

  const revDelta = projRev - baseFY26Rev;
  const ebitdaDelta = projEBITDA - baseEBITDA;
  const fcfDelta = projFCF - baseFCF;

  const plData = [
    { year: `FY${String(FORECAST.years[0]).substring(2)}`, RevBase: baseFY26Rev, RevWhatIf: projRev, EbitBase: baseEBITDA, EbitWhatIf: projEBITDA, FcfBase: baseFCF, FcfWhatIf: projFCF },
    { year: `FY${String(FORECAST.years[1]).substring(2)}`, RevBase: FORECAST.base.revenue[1], RevWhatIf: projRev*1.02, EbitBase: FORECAST.base.ebitda[1], EbitWhatIf: projEBITDA*1.02, FcfBase: FORECAST.base.fcf[1], FcfWhatIf: projFCF*1.03 },
    { year: `FY${String(FORECAST.years[2]).substring(2)}`, RevBase: FORECAST.base.revenue[2], RevWhatIf: projRev*1.04, EbitBase: FORECAST.base.ebitda[2], EbitWhatIf: projEBITDA*1.04, FcfBase: FORECAST.base.fcf[2], FcfWhatIf: projFCF*1.06 },
  ];

  const drvData = [
    { name: 'Revenue', val: revDelta * (inputs.ebitdaMargin/100) },
    { name: 'Margin', val: projRev * ((inputs.ebitdaMargin - ACTUALS.ebitdaMargin[ACTUALS.ebitdaMargin.length-1])/100) },
    { name: 'CapEx', val: (ACTUALS.capex[ACTUALS.capex.length-1]/baseRev*100 - inputs.capexPct)*100 * (projRev/100) },
    { name: 'WC', val: (-inputs.wcChange) },
  ].sort((a,b) => Math.abs(b.val) - Math.abs(a.val));

  return (
    <div className="flex gap-6 h-[calc(100vh-80px)] animate-in fade-in duration-300">
      <div className="w-[30%] bg-[#1A1D24] p-6 rounded-xl border border-gray-800 flex flex-col">
        <h2 className="text-xl font-bold">Adjust Drivers</h2>
        <p className="text-sm text-gray-400 mb-6">Model the impact on {ticker} financials</p>
        
        <div className="space-y-5 flex-1 overflow-y-auto pr-2">
          <SliderInput label="Revenue Growth Rate" name="revenueGrowth" val={inputs.revenueGrowth} min={-10} max={30} step={0.5} unit="%" onChange={handleChange} />
          <SliderInput label="EBITDA Margin" name="ebitdaMargin" val={inputs.ebitdaMargin} min={0} max={60} step={0.5} unit="%" onChange={handleChange} />
          <SliderInput label="CapEx (% of Rev)" name="capexPct" val={inputs.capexPct} min={0} max={20} step={0.2} unit="%" onChange={handleChange} />
          <SliderInput label="Tax Rate" name="taxRate" val={inputs.taxRate} min={0} max={35} step={0.5} unit="%" onChange={handleChange} />
          <SliderInput label="WC Change ($M)" name="wcChange" val={inputs.wcChange} min={-5000} max={5000} step={500} unit="" onChange={handleChange} />
          <SliderInput label="Share Buyback" name="shareBuyback" val={inputs.shareBuyback} min={0} max={10} step={0.5} unit="%" onChange={handleChange} />
        </div>

        <div className="mt-4 pt-4 border-t border-gray-800">
          <input type="text" placeholder="Scenario Name (e.g. Aggressive Expansion)" className="w-full bg-[#0F1117] border border-gray-700 rounded p-2 text-sm mb-3" />
          <button className="w-full bg-[#185FA5] hover:bg-[#134980] text-white font-bold py-3 rounded transition-colors shadow-lg">Save Simulation</button>
        </div>
      </div>

      <div className="w-[70%] flex flex-col gap-6">
        <div className="grid grid-cols-6 gap-3">
          <WhatIfCard label="Revenue" val={projRev} delta={revDelta} isPct={false} />
          <WhatIfCard label="EBITDA" val={projEBITDA} delta={ebitdaDelta} isPct={false} />
          <WhatIfCard label="EBITDA Margin" val={inputs.ebitdaMargin} delta={inputs.ebitdaMargin - ACTUALS.ebitdaMargin[ACTUALS.ebitdaMargin.length-1]} isPct={true} />
          <WhatIfCard label="Net Income" val={projNOPAT} delta={projNOPAT - FORECAST.base.netIncome[0]} isPct={false} />
          <WhatIfCard label="FCF" val={projFCF} delta={fcfDelta} isPct={false} />
          <WhatIfCard label="FCF Margin" val={(projFCF/projRev)*100} delta={((projFCF/projRev)*100) - ((baseFCF/baseFY26Rev)*100)} isPct={true} />
        </div>

        <div className="grid grid-cols-2 gap-4 h-56">
          <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800 flex flex-col">
            <h3 className="text-xs font-semibold mb-2 text-gray-400">P&L Impact ($M)</h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={plData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false}/>
                  <XAxis dataKey="year" stroke="#8892b0" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} hide />
                  <Tooltip contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333', fontSize:'12px'}} />
                  <Line type="monotone" dataKey="RevBase" stroke="#4a5568" strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="RevWhatIf" stroke="#185FA5" strokeWidth={2} dot={{r:3}} />
                  <Line type="monotone" dataKey="FcfBase" stroke="#4a5568" strokeDasharray="3 3" dot={false} />
                  <Line type="monotone" dataKey="FcfWhatIf" stroke="#1D9E75" strokeWidth={2} dot={{r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800 flex flex-col">
            <h3 className="text-xs font-semibold mb-2 text-gray-400">Driver Impact on EBITDA/FCF ($M)</h3>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={drvData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" horizontal={false}/>
                  <XAxis type="number" stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} hide/>
                  <YAxis type="category" dataKey="name" stroke="#8892b0" fontSize={10} tickLine={false} axisLine={false} width={60} />
                  <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333', fontSize:'12px'}} />
                  <Bar dataKey="val" radius={2}>
                    {drvData.map((e, i) => <Cell key={i} fill={e.val >= 0 ? '#1D9E75' : '#993C1D'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 flex-1">
          <div className="bg-[#1A1D24] p-4 rounded-xl border border-gray-800">
            <h3 className="text-xs font-semibold mb-3 text-gray-400">Key Ratios Impact</h3>
            <table className="w-full text-sm text-right">
              <thead className="text-gray-500 border-b border-gray-800">
                <tr><th className="pb-1 text-left">Ratio</th><th className="pb-1">Base</th><th className="pb-1">What-If</th><th className="pb-1">Change</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr>
                  <td className="py-3 text-left">Net Debt/EBITDA</td><td>{(ACTUALS.netDebt[ACTUALS.netDebt.length-1]/baseEBITDA).toFixed(2)}x</td><td className="text-white">{(ACTUALS.netDebt[ACTUALS.netDebt.length-1]/projEBITDA).toFixed(2)}x</td>
                  <td className={projEBITDA>baseEBITDA?'text-[#1D9E75]':'text-[#993C1D]'}>{((ACTUALS.netDebt[ACTUALS.netDebt.length-1]/projEBITDA)-(ACTUALS.netDebt[ACTUALS.netDebt.length-1]/baseEBITDA)).toFixed(2)}x</td>
                </tr>
                <tr>
                  <td className="py-3 text-left">FCF Margin</td><td>{((baseFCF/baseFY26Rev)*100).toFixed(1)}%</td><td className="text-white">{((projFCF/projRev)*100).toFixed(1)}%</td>
                  <td className={projFCF>baseFCF?'text-[#1D9E75]':'text-[#993C1D]'}>{(((projFCF/projRev)*100)-((baseFCF/baseFY26Rev)*100)).toFixed(1)}pp</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bg-[#185FA5]/10 border border-[#185FA5]/30 p-5 rounded-xl relative overflow-hidden flex flex-col justify-center">
            <Sparkles className="absolute top-4 right-4 text-[#185FA5] opacity-20" size={80} />
            <h3 className="text-sm font-bold mb-2 text-[#185FA5] flex items-center gap-2"><Bot size={16}/> Scenario Narrative</h3>
            <p className="text-sm text-gray-300 leading-relaxed z-10 relative">
              This scenario assumes revenue growth of <strong>{inputs.revenueGrowth}%</strong> and EBITDA margin adjustment to <strong>{inputs.ebitdaMargin}%</strong>. 
              Under these conditions, FCF is projected at <strong>${formatBillion(projFCF)}</strong> for FY{String(FORECAST.years[0]).substring(2)}, representing a <strong>{fcfDelta > 0 ? '+' : ''}{(fcfDelta/baseFCF*100).toFixed(1)}%</strong> vs the base case. 
              The primary driver of this delta is the <strong>{Math.abs(ebitdaDelta) > Math.abs(fcfDelta-ebitdaDelta) ? 'margin/growth shifts' : 'working capital/capex profile'}</strong>. 
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderInput({label, name, val, min, max, step, unit, onChange}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="font-bold text-[#185FA5]">{val}{unit}</span>
      </div>
      <input type="range" name={name} value={val} min={min} max={max} step={step} 
        onChange={onChange} 
        className="w-full accent-[#185FA5] h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
    </div>
  );
}

function WhatIfCard({label, val, delta, isPct}) {
  const isPos = delta >= 0;
  const col = isPos ? 'text-[#1D9E75]' : 'text-[#993C1D]';
  return (
    <div className="bg-[#1A1D24] border border-gray-800 p-3 rounded-lg text-center flex flex-col justify-center">
      <div className="text-[10px] text-gray-400 mb-1 leading-tight">{label}</div>
      <div className="font-bold text-sm mb-1">{isPct ? val.toFixed(1)+'%' : formatBillion(val)}</div>
      <div className={`text-[10px] font-semibold ${col}`}>{isPos?'+':''}{isPct ? delta.toFixed(1)+'pp' : formatBillion(delta)}</div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 5 - DRIVERS & SIGNALS
// --------------------------------------------------------------------------------------
function Module5Drivers({signals}) {
  const drivers = [
    { name: 'Revenue Growth', wt: 35, c: false, dir: 'up' },
    { name: 'EBITDA Margin', wt: 28, c: true, dir: 'up' },
    { name: 'CapEx Intensity', wt: 12, c: true, dir: 'flat' },
    { name: 'Tax Rate', wt: 10, c: false, dir: 'flat' },
    { name: 'Working Capital', wt: 8, c: true, dir: 'up' },
    { name: 'Share Buyback', wt: 7, c: true, dir: 'up' },
  ];

  const DirIcon = ({dir}) => {
    if(dir==='up') return <ArrowUpRight size={14} className="text-[#1D9E75]" />;
    if(dir==='down') return <ArrowDownRight size={14} className="text-[#993C1D]" />;
    return <ArrowRight size={14} className="text-[#BA7517]" />;
  };

  return (
    <div className="flex gap-6 animate-in fade-in duration-300 h-full">
      <div className="w-1/3 flex flex-col gap-6">
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800 flex-1">
          <h2 className="text-lg font-bold mb-6">Driver Tree</h2>
          <div className="flex flex-col items-center">
            <div className="bg-[#185FA5] px-6 py-2 rounded-lg font-bold text-white shadow-lg z-10">Revenue (Target)</div>
            <div className="w-0.5 h-6 bg-gray-700"></div>
            <div className="w-full h-0.5 bg-gray-700"></div>
            <div className="w-full flex flex-col gap-3 mt-4 relative">
              {drivers.map(d => (
                <div key={d.name} className="bg-[#0F1117] border border-gray-800 p-3 rounded flex justify-between items-center ml-4 relative">
                  <div className="absolute -left-4 top-1/2 w-4 h-0.5 bg-gray-700"></div>
                  <div className="absolute -left-4 bottom-1/2 w-0.5 h-full bg-gray-700"></div>
                  <div>
                    <div className="text-sm font-semibold">{d.name}</div>
                    <div className="text-[10px] text-gray-500 mt-1">Weight: {d.wt}%</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.c ? 'bg-[#1D9E75]/20 text-[#1D9E75]':'bg-gray-800 text-gray-400'}`}>{d.c ? 'CTRL' : 'EXT'}</span>
                    <DirIcon dir={d.dir} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="w-2/3 flex flex-col gap-6">
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
          <h2 className="text-lg font-bold mb-4 flex items-center justify-between">
              External Signal Monitor
              <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded font-normal flex items-center gap-1"><Activity size={10}/> LIVE FRED DATA</span>
          </h2>
          <table className="w-full text-sm text-left">
            <thead className="text-gray-500 border-b border-gray-800">
              <tr><th className="pb-2">Signal</th><th className="pb-2">Class</th><th className="pb-2">Current</th><th className="pb-2">30D Δ</th><th className="pb-2">Impact</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {signals && signals.length > 0 ? signals.map(s => (
                <tr key={s.s} className="hover:bg-[#1E2330]">
                  <td className="py-2.5 font-medium">{s.s}</td>
                  <td className="py-2.5"><span className="text-[10px] bg-gray-800 px-2 py-0.5 rounded">{s.c}</span></td>
                  <td className="py-2.5">{s.v}</td>
                  <td className="py-2.5">{s.d}</td>
                  <td className={`py-2.5 font-semibold text-xs ${s.i==='up'?'text-[#1D9E75]':s.i==='down'?'text-[#993C1D]':'text-[#BA7517]'}`}>{s.text}</td>
                </tr>
              )) : <tr><td colSpan={5} className="py-4 text-center text-gray-500"><Loader2 className="animate-spin inline mr-2" size={14}/> Fetching Live Macro Data...</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800 flex-1">
          <h2 className="text-lg font-bold mb-4">Model Override Log</h2>
          <table className="w-full text-xs text-left">
            <thead className="text-gray-500 border-b border-gray-800">
              <tr><th className="pb-2">Date</th><th className="pb-2">Field</th><th className="pb-2">Orig</th><th className="pb-2">Over</th><th className="pb-2">Reason</th><th className="pb-2">FVA</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr className="hover:bg-[#1E2330]">
                <td className="py-3 text-gray-400">2025-12-01</td><td className="font-semibold text-[#185FA5]">Rev Growth</td><td>1.5%</td><td className="text-white font-bold">2.8%</td>
                <td className="text-gray-400 italic">"Segment accelerating per call"</td><td className="text-[#1D9E75]">+0.4pp</td>
              </tr>
              <tr className="hover:bg-[#1E2330]">
                <td className="py-3 text-gray-400">2026-01-15</td><td className="font-semibold text-[#185FA5]">EBITDA Mar</td><td>34.8%</td><td className="text-white font-bold">35.5%</td>
                <td className="text-gray-400 italic">"Cost optimization program"</td><td className="text-[#BA7517]">Pending</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 6 - VALUATION
// --------------------------------------------------------------------------------------
function Module6Valuation({MARKET, VALUATION}) {
  const fbData = [
    { name: '3-Stage DCF', low: VALUATION.dcf.low, base: VALUATION.dcf.base, high: VALUATION.dcf.high, range: [VALUATION.dcf.low, VALUATION.dcf.high] },
    { name: 'EV/EBITDA', low: VALUATION.evEbitda.low, base: VALUATION.evEbitda.base, high: VALUATION.evEbitda.high, range: [VALUATION.evEbitda.low, VALUATION.evEbitda.high] },
    { name: 'P/E Multiple', low: VALUATION.pe.low, base: VALUATION.pe.base, high: VALUATION.pe.high, range: [VALUATION.pe.low, VALUATION.pe.high] },
    { name: 'Graham Number', low: VALUATION.graham * 0.9, base: VALUATION.graham, high: VALUATION.graham * 1.1, range: [VALUATION.graham * 0.9, VALUATION.graham * 1.1] }
  ];

  // Filter out invalid/negative values for the chart
  const validFbData = fbData.filter(d => d.base > 0 && !isNaN(d.base));

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold mb-4">Multi-Model Valuation Framework</h2>
      
      <div className="grid grid-cols-3 gap-6">
        
        {/* Panel 1: Valuation Matrix */}
        <div className="bg-[#1A1D24] p-6 rounded-xl border border-gray-800 col-span-1 flex flex-col">
          <h3 className="text-lg font-bold mb-4">Valuation Matrix</h3>
          <p className="text-sm text-gray-400 mb-4">Comparing Base Case implied prices across methodologies.</p>
          <div className="flex-1 space-y-3">
            {validFbData.map((d, i) => (
              <div key={i} className="bg-[#0F1117] p-4 rounded-lg border border-gray-800">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{d.name}</div>
                <div className="flex justify-between items-end">
                  <div className="text-2xl font-bold text-white">${d.base.toFixed(2)}</div>
                  <div className={`text-xs font-bold ${d.base > MARKET.currentPrice ? 'text-[#1D9E75]' : 'text-[#993C1D]'}`}>
                    {d.base > MARKET.currentPrice ? 'UNDERVALUED' : 'OVERVALUED'}
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-[#185FA5]/10 border border-[#185FA5]/30 p-4 rounded-lg mt-4">
               <div className="text-xs text-[#185FA5] uppercase tracking-wider mb-1 font-bold">Current Market Price</div>
               <div className="text-2xl font-bold text-white">${MARKET.currentPrice?.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Panel 2: Football Field */}
        <div className="bg-[#1A1D24] p-6 rounded-xl border border-[#185FA5]/50 shadow-[0_0_15px_rgba(24,95,165,0.1)] col-span-2">
          <h3 className="text-lg font-bold mb-1">"Football Field" Valuation Ranges</h3>
          <p className="text-sm text-gray-400 mb-6">Visualizing the 10th (Bear) to 90th (Bull) percentile Monte Carlo implied prices.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={validFbData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" horizontal={true} vertical={false}/>
                <XAxis type="number" stroke="#8892b0" fontSize={11} tickLine={false} domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={(v) => `$${v}`} />
                <YAxis dataKey="name" type="category" stroke="#8892b0" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip 
                   cursor={{fill: '#2a2e39'}} 
                   contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} 
                   formatter={(v) => Array.isArray(v) ? `$${v[0].toFixed(2)} - $${v[1].toFixed(2)}` : `$${v.toFixed(2)}`} 
                />
                <ReferenceLine x={MARKET.currentPrice} stroke="#1D9E75" strokeWidth={2} strokeDasharray="3 3" label={{position: 'top', value: `Market: $${MARKET.currentPrice?.toFixed(2)}`, fill: '#1D9E75', fontSize: 12, fontWeight: 'bold'}} />
                <Bar dataKey="range" fill="#185FA5" radius={4} barSize={30}>
                   {validFbData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.base > MARKET.currentPrice ? '#185FA5' : '#4a5568'} />
                   ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------
// MODULE 7 - AI CFO COPILOT
// --------------------------------------------------------------------------------------
function Module7Copilot({ticker, messages, input, setInput, onSend, isLoading}) {
  const prompts = [
    "What's the current revenue trend?",
    "Show me the FCF bridge",
    "Explain the valuation disconnect",
    "What are our key risks right now?"
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] max-w-[900px] mx-auto border border-gray-800 rounded-xl overflow-hidden bg-[#1A1D24] animate-in fade-in duration-300 shadow-2xl">
      <div className="bg-[#1E2330] p-4 border-b border-gray-800 flex items-center gap-3">
        <div className="bg-gradient-to-br from-[#185FA5] to-[#533AB7] p-2 rounded-lg">
          <Sparkles className="text-white" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold">AI CFO Copilot</h2>
          <div className="text-xs text-gray-400">Context: <b>{ticker}</b> Live Data | Powered by TRIPOD</div>
        </div>
      </div>

      <div className="flex gap-2 p-3 overflow-x-auto border-b border-gray-800 bg-[#0F1117]/50 scrollbar-hide">
        {prompts.map(p => (
          <button key={p} onClick={() => setInput(p)} className="whitespace-nowrap px-3 py-1.5 bg-[#1E2330] hover:bg-[#185FA5]/20 border border-gray-700 hover:border-[#185FA5] rounded-full text-xs text-gray-300 transition-colors">
            {p}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#0F1117]">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-4 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center font-bold text-sm ${m.role === 'user' ? 'bg-[#533AB7] text-white' : 'bg-white text-[#185FA5]'}`}>
              {m.role === 'user' ? 'U' : 'AI'}
            </div>
            <div className={`p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#533AB7] text-white' : 'bg-[#1E2330] border border-gray-800 text-gray-200 shadow-lg'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 max-w-[85%]">
            <div className="w-8 h-8 rounded-full flex shrink-0 items-center justify-center font-bold text-sm bg-white text-[#185FA5]">
              AI
            </div>
            <div className="p-4 rounded-xl text-sm bg-[#1E2330] border border-gray-800 text-gray-200 shadow-lg flex items-center gap-2">
              <Loader2 className="animate-spin text-[#185FA5]" size={16} /> Thinking...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-[#1A1D24] border-t border-gray-800">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={input} 
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSend()}
            disabled={isLoading}
            placeholder={isLoading ? "AI is typing..." : `Ask about ${ticker} financials, assumptions, or risks...`}
            className="w-full bg-[#0F1117] border border-gray-700 rounded-xl pl-4 pr-12 py-4 text-sm focus:outline-none focus:border-[#185FA5] shadow-inner disabled:opacity-50"
          />
          <button onClick={onSend} disabled={isLoading} className="absolute right-2 p-2 bg-[#185FA5] hover:bg-[#134980] rounded-lg text-white transition-colors disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
