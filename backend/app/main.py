from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, branches, employees, shifts, cashier, payroll, dashboard, test_mode, schedule, admin, review, analytics

app = FastAPI(title="Аппетит ФОТ API", version="1.0.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(employees.router)
app.include_router(shifts.router)
app.include_router(cashier.router)
app.include_router(payroll.router)
app.include_router(dashboard.router)
app.include_router(test_mode.router)
app.include_router(schedule.router)
app.include_router(admin.router)
app.include_router(review.router)
app.include_router(analytics.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
