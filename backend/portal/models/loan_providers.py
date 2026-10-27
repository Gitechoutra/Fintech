from portal import db
from .base import CrudMixin, utcnow


class LoanVerificationMethod:
    LENDER_API = 'LENDER_API'      # the lender's own API confirms ownership (see providers/loan_data)
    MOBILE_OTP = 'MOBILE_OTP'      # OTP to the user's verified mobile number

    CHOICES = [LENDER_API, MOBILE_OTP]


class LoanProviders(CrudMixin, db.Model):
    """Master data: lenders whose loans users can link (e.g. Bajaj Finance).

    A LENDER_API provider is offered only when the adapter named in `adapter` is
    configured (providers/loan_data/registry.py). A MOBILE_OTP provider is offered
    when SMS delivery is configured."""
    __tablename__ = 'loan_providers'

    provider_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    display_name = db.Column(db.String(100), nullable=False)
    adapter = db.Column(db.String(30), nullable=True)                # loan_data adapter (LENDER_API only)
    verification_method = db.Column(db.String(20), nullable=False, default=LoanVerificationMethod.MOBILE_OTP)

    logo_url = db.Column(db.String(255), nullable=True)
    brand_color = db.Column(db.String(7), nullable=True)

    # What the user must enter and its format (validated server-side), e.g.
    # [{"key": "loan_account_number", "label": "Loan account number", "pattern": "[A-Z0-9]{6,20}", "hint": "…"},
    #  {"key": "customer_id", "label": "Customer ID", "pattern": "[A-Z0-9]{4,20}", "hint": "…"}]
    # `loan_account_number` is always required.
    required_identifiers = db.Column(db.JSON, nullable=False)

    is_active = db.Column(db.Boolean, nullable=False, default=True)
    sort_order = db.Column(db.SmallInteger, nullable=False, default=100)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
