"""Loan figures that combine the lender's snapshot with confirmed in-app payments."""

from decimal import Decimal

from sqlalchemy import func

from portal import db
from portal.models.loan_payments import LoanPayments, PaymentStatus


def paid_in_app_since_snapshot(loan):
    """Sum of payments confirmed by Razorpay after the lender's figures were taken.
    The lender's balance does not reflect these yet."""
    q = db.session.query(func.coalesce(func.sum(LoanPayments.amount), 0)).filter(
        LoanPayments.loan_id == loan.loan_id, LoanPayments.status == PaymentStatus.SUCCESS)
    if loan.data_as_of is not None:
        q = q.filter(LoanPayments.completed_at >= loan.data_as_of)
    return Decimal(q.scalar() or 0).quantize(Decimal('0.01'))


def payable_balance(loan):
    """Upper bound for a new payment, or None when the lender did not report a balance."""
    if loan.outstanding_balance is None:
        return None
    return max(Decimal(loan.outstanding_balance) - paid_in_app_since_snapshot(loan), Decimal('0.00'))
