from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.auth import get_current_user, require_role
from app.models.user import User
from app.schemas.billing import (
    BillingOverviewResponse,
    BillResponse,
    BillUpdateStatusRequest,
)
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["Billing & Invoicing"])


@router.get(
    "/overview",
    response_model=BillingOverviewResponse,
    summary="Admin views clinic billing overview, running totals, and invoices",
    dependencies=[Depends(require_role("admin"))],
)
async def get_billing_overview(
    status: Optional[str] = Query(None, description="Filter by bill status: paid, pending, partial"),
    db: AsyncSession = Depends(get_db),
):
    return await BillingService.get_billing_overview(db=db, status_filter=status)


@router.put(
    "/{bill_id}/status",
    response_model=BillResponse,
    summary="Admin updates bill payment status (paid/pending/partial) and payment date",
    dependencies=[Depends(require_role("admin"))],
)
async def update_bill_status(
    bill_id: str,
    payload: BillUpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await BillingService.update_bill_status(
        db=db,
        bill_id=bill_id,
        current_user=current_user,
        payload=payload,
    )
