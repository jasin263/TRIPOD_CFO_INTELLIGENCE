import os
from groq import Groq

# Groq API Key
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)

def generate_copilot_response(ticker: str, messages: list, financial_context: dict):
    """
    Generates a response from the Groq API acting as an AI CFO Copilot.
    """
    
    # Construct a dynamic system prompt based on the live financial context
    sys_prompt = f"""You are the AI CFO Copilot for {ticker.upper()}. 
You provide expert financial analysis, modeling insights, and risk assessments based strictly on the current live data context provided.
Keep your answers concise, analytical, and professional. Do NOT invent numbers. If you don't know, say so.

Current Financial Context for {ticker.upper()}:
- Current Price: ${financial_context.get('marketPrice', 'N/A')}
- Market Cap: ${financial_context.get('marketCapBn', 'N/A')} Billion
- TTM Revenue: ${financial_context.get('revenue', 'N/A')} Million
- TTM EBITDA: ${financial_context.get('ebitda', 'N/A')} Million
- EBITDA Margin: {financial_context.get('ebitdaMargin', 'N/A')}%
- TTM FCF: ${financial_context.get('fcf', 'N/A')} Million
- FCF Margin: {financial_context.get('fcfMargin', 'N/A')}%
- DCF Implied Price: ${financial_context.get('dcfPrice', 'N/A')}
"""

    # Format messages for Groq API
    api_messages = [{"role": "system", "content": sys_prompt}]
    
    for msg in messages:
        api_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
        
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=api_messages,
            temperature=0.3,
            max_tokens=1024,
            top_p=1,
            stream=False,
            stop=None,
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Groq API Error: {e}")
        return "I apologize, but I am currently unable to process your request due to an API connectivity issue. Please try again later."
