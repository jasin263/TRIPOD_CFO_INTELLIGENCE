import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus } from 'lucide-react';

const COLORS = ['#185FA5', '#1D9E75', '#BA7517', '#533AB7', '#993C1D', '#D94E34', '#3E8E41', '#6A4C9C'];

export default function CompetitorAnalysis({ data, tickers, onAddCompetitor }) {
  const [newCompetitor, setNewCompetitor] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (newCompetitor.trim()) {
      onAddCompetitor(newCompetitor);
      setNewCompetitor('');
    }
  };
  // Extract latest year for comparison
  const latestYearMetrics = tickers.map(t => {
      const d = data[t];
      if(!d || d.error) return { ticker: t, error: true, errorMsg: d?.error };
      
      const revs = d.income_statement.revenue;
      const ebitdas = d.income_statement.ebitda;
      const fcf = d.cash_flow.free_cash_flow;
      
      const lastRev = revs[revs.length - 1];
      const lastEbitda = ebitdas[ebitdas.length - 1];
      const lastFcf = fcf[fcf.length - 1];
      
      const market = d.market_data;
      
      return {
          ticker: t,
          revenue: lastRev / 1000000,
          ebitda: lastEbitda / 1000000,
          fcf: lastFcf / 1000000,
          grossMargin: d.ratios.gross_margin[d.ratios.gross_margin.length-1] * 100,
          ebitdaMargin: d.ratios.ebitda_margin[d.ratios.ebitda_margin.length-1] * 100,
          peRatio: market.peRatio,
          evEbitda: market.evEbitda,
          marketCapBn: market.marketCapBn
      };
  }).filter(d => !d.error);

  const errors = tickers.map(t => data[t]?.error ? { ticker: t, msg: data[t].error } : null).filter(Boolean);

  const validTicker = tickers.find(t => data[t] && !data[t].error);
  let timeSeriesData = [];
  if (validTicker) {
      const years = data[validTicker].years;
      timeSeriesData = years.map((y, i) => {
          const row = { year: String(y).substring(0,4) };
          tickers.forEach(t => {
              if (data[t] && !data[t].error && data[t].income_statement.revenue[i]) {
                  row[t] = data[t].income_statement.revenue[i] / 1000000;
              }
          });
          return row;
      });
  }
  
  let marginSeriesData = [];
  if (validTicker) {
      const years = data[validTicker].years;
      marginSeriesData = years.map((y, i) => {
          const row = { year: String(y).substring(0,4) };
          tickers.forEach(t => {
              if (data[t] && !data[t].error && data[t].ratios.ebitda_margin[i]) {
                  row[t] = data[t].ratios.ebitda_margin[i] * 100;
              }
          });
          return row;
      });
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-in fade-in duration-300">
      <div className="flex justify-between items-end mb-4">
        <div>
          <h2 className="text-2xl font-bold">Competitor Analysis</h2>
          <p className="text-gray-400 text-sm mt-1">Comparing: {tickers.join(', ')}</p>
        </div>
        <form onSubmit={handleAdd} className="relative flex items-center">
            <input 
                type="text" 
                value={newCompetitor} 
                onChange={e => setNewCompetitor(e.target.value)} 
                placeholder="Add Competitor (e.g. MSFT)..."
                className="bg-[#1A1D24] border border-gray-700 rounded-l-lg pl-3 pr-4 py-2 text-sm text-white outline-none focus:border-[#185FA5]"
            />
            <button type="submit" className="bg-[#185FA5] px-4 py-2 rounded-r-lg font-bold text-sm hover:bg-[#134980] transition-colors border border-[#185FA5]">
                <Plus size={20} />
            </button>
        </form>
      </div>

      {errors.length > 0 && (
          <div className="bg-[#993C1D]/20 border border-[#993C1D] text-white p-4 rounded-xl">
             <h4 className="font-bold text-sm mb-2">Errors loading some tickers:</h4>
             <ul className="text-xs list-disc pl-5">
                {errors.map(e => <li key={e.ticker}>{e.ticker}: {e.msg}</li>)}
             </ul>
          </div>
      )}
      
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {latestYearMetrics.map((m, i) => (
           <div key={m.ticker} className="bg-[#1A1D24] p-4 rounded-xl border-t-4 border-l border-r border-b border-gray-800" style={{borderTopColor: COLORS[i%COLORS.length]}}>
              <div className="text-gray-400 text-xs font-medium">{m.ticker}</div>
              <div className="text-xl font-bold mt-1">${(m.marketCapBn || 0).toFixed(1)}B</div>
              <div className="text-xs font-semibold text-gray-500">Market Cap</div>
           </div>
        ))}
      </div>
      
      <div className="bg-[#1A1D24] rounded-xl border border-gray-800 overflow-x-auto p-4">
        <h3 className="text-sm font-semibold mb-4 text-gray-300">Key Metrics Comparison (TTM)</h3>
        <table className="w-full text-sm text-right">
            <thead className="bg-[#0F1117]">
                <tr>
                    <th className="p-3 text-left border-r border-gray-800 text-gray-400">Metric</th>
                    {latestYearMetrics.map(m => <th key={m.ticker} className="p-3 text-gray-400">{m.ticker}</th>)}
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">Revenue ($M)</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">${(m.revenue||0).toLocaleString(undefined, {maximumFractionDigits:0})}</td>)}
                </tr>
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">EBITDA ($M)</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">${(m.ebitda||0).toLocaleString(undefined, {maximumFractionDigits:0})}</td>)}
                </tr>
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">EBITDA Margin (%)</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">{(m.ebitdaMargin||0).toFixed(1)}%</td>)}
                </tr>
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">FCF ($M)</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">${(m.fcf||0).toLocaleString(undefined, {maximumFractionDigits:0})}</td>)}
                </tr>
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">EV/EBITDA</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">{m.evEbitda ? m.evEbitda.toFixed(1) + 'x' : 'N/A'}</td>)}
                </tr>
                <tr className="hover:bg-[#1E2330]">
                    <td className="p-3 text-left border-r border-gray-800 font-semibold">P/E Ratio</td>
                    {latestYearMetrics.map(m => <td key={m.ticker} className="p-3">{m.peRatio ? m.peRatio.toFixed(1) + 'x' : 'N/A'}</td>)}
                </tr>
            </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
           <h3 className="text-sm font-semibold mb-4 text-gray-300">Revenue Trend ($M)</h3>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
                    <XAxis dataKey="year" stroke="#8892b0" fontSize={12} tickLine={false} />
                    <YAxis stroke="#8892b0" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
                    <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                    {tickers.filter(t => data[t] && !data[t].error).map((t, i) => (
                        <Bar key={t} dataKey={t} fill={COLORS[i%COLORS.length]} radius={[2,2,0,0]} />
                    ))}
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-[#1A1D24] p-5 rounded-xl border border-gray-800">
           <h3 className="text-sm font-semibold mb-4 text-gray-300">EBITDA Margin Trend (%)</h3>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={marginSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" vertical={false} />
                    <XAxis dataKey="year" stroke="#8892b0" fontSize={12} tickLine={false} />
                    <YAxis stroke="#8892b0" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: '#2a2e39'}} contentStyle={{backgroundColor: '#1A1D24', borderColor: '#333'}} />
                    <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                    {tickers.filter(t => data[t] && !data[t].error).map((t, i) => (
                        <Line key={t} type="monotone" dataKey={t} stroke={COLORS[i%COLORS.length]} strokeWidth={3} dot={{r:4}} />
                    ))}
                 </LineChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
}
