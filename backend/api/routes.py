from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.financial_data import get_historical_data, DataValidationError
from services.forecasting import generate_forecast
from services.macro_data import get_macro_data
from services.ai_copilot import generate_copilot_response

router = APIRouter()

class ForecastRequest(BaseModel):
    ticker: str
    revenue_growth: float = 0.05
    ebitda_margin: float = 0.25
    tax_rate: float = 0.21
    capex_pct: float = 0.05
    wacc: float = 0.08
    terminal_growth: float = 0.02
    years: int = 5
    provider: str = "yfinance"

class ChatRequest(BaseModel):
    ticker: str
    messages: list
    financial_context: dict

@router.get("/financials/compare")
def compare_financials(tickers: str, provider: str = "yfinance"):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    results = {}
    for t in ticker_list:
        try:
            results[t] = get_historical_data(t, provider)
        except Exception as e:
            results[t] = {"error": str(e)}
    return {"status": "success", "data": results}

@router.get("/financials/{ticker}")
def get_financials(ticker: str, provider: str = "yfinance"):
    ticker = ticker.strip().upper()
    try:
        data = get_historical_data(ticker, provider)
        return {"status": "success", "data": data}
    except DataValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/forecast")
def create_forecast(req: ForecastRequest):
    ticker = req.ticker.strip().upper()
    try:
        data = get_historical_data(ticker, req.provider)
        forecast = generate_forecast(data, req)
        return {"status": "success", "data": forecast}
    except DataValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/macro")
def get_macro():
    try:
        data = get_macro_data()
        return {"status": "success", "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
def chat_with_copilot(req: ChatRequest):
    try:
        response = generate_copilot_response(req.ticker, req.messages, req.financial_context)
        return {"status": "success", "data": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
