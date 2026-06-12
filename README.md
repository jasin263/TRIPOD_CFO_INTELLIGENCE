# TRIPOD CFO Intelligence

TRIPOD CFO Intelligence is a comprehensive, live financial intelligence dashboard designed specifically for Chief Financial Officers (CFOs) and financial analysts. It combines real-time financial data, advanced forecasting algorithms, and an AI-powered Copilot to deliver actionable insights, scenario modeling, and valuation metrics in a centralized command center.

## 🚀 Features

- **CFO Cockpit**: High-level KPI monitoring, 13-week cash forecasting, scenario snapshots, and automated risk monitoring (e.g., FCF Compression, Valuation Disconnect).
- **Live Financial Overview**: Detailed historical actuals (Revenue, Margins, FCF, Net Debt) pulled from live APIs.
- **Advanced Forecasting**: Generate Base, Bull, and Bear scenarios using multiple statistical models:
  - Monte Carlo Simulations
  - Linear Regression
  - Exponential Moving Averages (EMA)
- **What-If Simulator**: Interactive tool to tweak key variables (revenue growth, margins, capex, tax rates) and instantly see the bottom-line impact.
- **Valuation Engine**: Real-time modeling including 3-Stage DCF, EV/EBITDA multiples, P/E multiples, and Graham Number based on live market caps.
- **AI CFO Copilot**: An interactive AI chat interface (powered by Groq/LLaMA) that acts as an expert financial assistant, utilizing current live financial data as its context.
- **Competitor Analysis**: Multi-ticker comparison tool for benchmarking against industry peers.
- **Export Capabilities**: Seamlessly export detailed reports to PDF and Excel formats.

## 🛠 Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: TailwindCSS
- **Charting**: Recharts
- **Icons**: Lucide React
- **Export**: `xlsx`, `html2canvas`, `jspdf`

### Backend
- **Framework**: FastAPI (Python 3)
- **Financial Data**: `yfinance`, Financial Modeling Prep (FMP), Local CSVs
- **Data Processing**: `numpy`, `pandas`
- **AI/LLM Integration**: Groq API (LLaMA 3)

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **Python** (3.9 or higher)
- **Git**

## ⚙️ Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/jasin263/TRIPOD_CFO_INTELLIGENCE.git
cd TRIPOD_CFO_INTELLIGENCE
```

### 2. Backend Setup
Navigate to the backend directory and install dependencies:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install fastapi uvicorn numpy groq pydantic
# Install additional dependencies like yfinance/pandas if needed
```

**Environment Variables**
You must set your Groq API key to use the AI Copilot:
```bash
# On Linux/Mac:
export GROQ_API_KEY="your-groq-api-key-here"

# On Windows (PowerShell):
$env:GROQ_API_KEY="your-groq-api-key-here"
```
*(Alternatively, you can use a `.env` file with `python-dotenv` if configured).*

**Run the Backend Server**
```bash
uvicorn main:app --reload --port 8000
```
The backend will be available at `http://localhost:8000`.

### 3. Frontend Setup
Open a new terminal, navigate to the frontend directory, and install dependencies:
```bash
cd frontend
npm install
```

**Run the Frontend Development Server**
```bash
npm run dev
```
The frontend will typically be available at `http://localhost:5173`.

## 📁 Project Structure

```text
TRIPOD_CFO_INTELLIGENCE/
├── backend/                  # FastAPI Backend
│   ├── api/                  # API Routers (routes.py)
│   ├── services/             # Core Business Logic
│   │   ├── ai_copilot.py     # Groq LLM integration
│   │   ├── financial_data.py # Data ingestion & processing
│   │   ├── forecasting.py    # Statistical forecasting models
│   │   └── macro_data.py     # Macro-economic signals
│   └── main.py               # Application entry point
├── frontend/                 # React + Vite Frontend
│   ├── src/                  # React Source Code
│   │   ├── CFODashboard.jsx  # Main Dashboard & UI Modules
│   │   ├── CompetitorAnalysis.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json          # Frontend Dependencies
│   └── vite.config.js        # Vite Configuration
└── README.md                 # Project Documentation
```

## 🔒 Security
Please ensure that you do not commit any sensitive API keys or credentials. Use environment variables for sensitive data.
