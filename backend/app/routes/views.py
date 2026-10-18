from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <html>
      <head>
        <title>Croprithm MVP</title>
        <style>
          body { background: linear-gradient(135deg, #f8fafc 0%, #c7d2fe 100%); min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: Inter, sans-serif; margin: 0; }
          h1 { font-size: 3rem; color: #3730a3; margin-bottom: 1rem; letter-spacing: 2px; }
          h2 { font-size: 1.5rem; color: #6366f1; margin-bottom: 2rem; }
          .soon { font-size: 1.2rem; color: #64748b; background: #fff; padding: 0.75rem 2rem; border-radius: 2rem; box-shadow: 0 2px 12px rgba(100,116,139,0.08); }
        </style>
      </head>
      <body>
        <h1>Croprithm MVP</h1>
        <h2>AI-powered Route & Logistics Optimizer</h2>
        <div class="soon">Coming Soon 🚀</div>
      </body>
    </html>
    """
