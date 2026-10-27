"""Resolves the configured loan-data adapter and validates what it returns before
it can touch the database."""

import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from flask import current_app

from portal.models.base import utcnow

from .base import InvalidProviderResponse, LoanDetails

_ADAPTERS = {}
_override = None          # tests only — see set_test_provider()


def register(cls):
    _ADAPTERS[cls.name] = cls
    return cls


def _load_builtin():
    """Register real lender adapters here (see README.md). None are integrated yet,
    so LOAN_DATA_PROVIDER has nothing to select and loan linking reports
    'not configured'."""


def configured_adapter_name():
    """The adapter enabled by LOAN_DATA_PROVIDER, or None."""
    if _override is not None:
        return _override.name
    name = current_app.config.get('LOAN_DATA_PROVIDER') or ''
    return name if get_adapter(name) is not None else None


def get_adapter(name):
    if _override is not None and _override.name == name:
        return _override
    _load_builtin()
    if name != (current_app.config.get('LOAN_DATA_PROVIDER') or ''):
        return None                       # only the configured adapter may serve requests
    cls = _ADAPTERS.get(name)
    if cls is None:
        return None
    inst = cls()
    return inst if inst.is_configured() else None


def set_test_provider(provider):
    """Inject a fake adapter. Refuses outside TESTING so mock data can never reach users."""
    global _override
    if provider is not None and not current_app.config.get('TESTING'):
        raise RuntimeError('Test providers are only allowed when TESTING is enabled.')
    _override = provider


# ── Response validation ─────────────────────────────────────────────────────

_MAX = Decimal('9999999999.99')


def _money(v, label):
    if v is None:
        return None
    try:
        d = Decimal(str(v))
    except InvalidOperation:
        raise InvalidProviderResponse(f'{label} not numeric')
    if not d.is_finite() or d < 0 or d > _MAX or d != d.quantize(Decimal('0.01')):
        raise InvalidProviderResponse(f'{label} out of range / precision')
    return d


def validate_loan_details(item: LoanDetails) -> LoanDetails:
    if not isinstance(item, LoanDetails):
        raise InvalidProviderResponse('unexpected type')
    if not item.provider_reference or len(item.provider_reference) > 128:
        raise InvalidProviderResponse('bad provider_reference')
    if (item.currency or '').upper() != 'INR':
        raise InvalidProviderResponse('unsupported currency')
    if not isinstance(item.as_of, datetime) or item.as_of > utcnow() + timedelta(minutes=5):
        raise InvalidProviderResponse('bad as_of timestamp')
    if item.next_due_date is not None and not isinstance(item.next_due_date, date):
        raise InvalidProviderResponse('bad due date')
    if item.loan_status is not None and not re.fullmatch(r'[A-Z_]{2,30}', item.loan_status):
        raise InvalidProviderResponse('bad loan status')
    item.sanctioned_amount = _money(item.sanctioned_amount, 'sanctioned_amount')
    item.outstanding_balance = _money(item.outstanding_balance, 'outstanding_balance')
    item.emi_amount = _money(item.emi_amount, 'emi_amount')
    item.product_name = (item.product_name or '')[:80] or None
    return item
