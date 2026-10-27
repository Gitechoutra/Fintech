"""Master data: lenders whose loans users can link.

Bajaj Finance is verified with an OTP to the user's verified mobile number
(MOBILE_OTP) — there is no Bajaj Finance API integration, so the lender does not
share loan figures. A lender with an authorised API uses LENDER_API plus an adapter
(see providers/loan_data/README.md)."""

from portal import db
from portal.models.loan_providers import LoanProviders, LoanVerificationMethod

LOAN_PROVIDERS = [
    {
        'code': 'BAJAJ_FINANCE',
        'display_name': 'Bajaj Finance',
        'adapter': None,
        'verification_method': LoanVerificationMethod.MOBILE_OTP,
        'logo_url': None,
        'brand_color': '#0072BC',
        'required_identifiers': [
            {'key': 'loan_account_number', 'label': 'Loan account number', 'pattern': r'[A-Z0-9]{6,20}',
             'hint': 'As shown on your loan agreement or in the Bajaj Finserv app.'},
            {'key': 'customer_id', 'label': 'Customer ID', 'pattern': r'[A-Z0-9]{4,20}',
             'hint': 'Your Bajaj Finance customer ID.'},
        ],
        'sort_order': 1,
    },
]


def seed_loan_providers():
    """Idempotent: inserts missing lenders, keeps existing rows in sync with this file and
    deactivates lenders that are no longer listed."""
    added = 0
    codes = {row['code'] for row in LOAN_PROVIDERS}
    for row in LOAN_PROVIDERS:
        p = LoanProviders.query.filter_by(code=row['code']).first()
        if p is None:
            db.session.add(LoanProviders(is_active=True, **row))
            added += 1
        else:
            for k, v in row.items():
                setattr(p, k, v)
    for p in LoanProviders.query.filter(LoanProviders.is_active.is_(True)).all():
        if p.code not in codes:
            p.is_active = False
    db.session.commit()
    return added
