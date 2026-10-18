import os
from fastapi import FastAPI
import uvicorn
from app.core.config import setup_cors
from app.routes import route, views, user, produce, requests, delivery, webhooks, analytics, menurithm, fulfillment

app = FastAPI(
    title="Croprithm API",
    description="AI-powered Route & Logistics Optimizer with Produce Management",
    version="1.0.0",
    redirect_slashes=False  # Prevent 307 redirects that break CORS
)

# Add CORS, middleware, etc
setup_cors(app)

# Register routers
app.include_router(views.router)
app.include_router(route.router)
app.include_router(user.router, prefix="/api")
app.include_router(produce.router)
app.include_router(requests.router)
app.include_router(delivery.router)
app.include_router(webhooks.router)
app.include_router(analytics.router)
app.include_router(menurithm.router)
app.include_router(fulfillment.router)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
