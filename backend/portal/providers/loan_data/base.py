"""
Loan-data provider interface.

These are INTERNAL adapter methods, not endpoints of any lender. A concrete adapter
implements them against one authorised lender's (or aggregator's) official API.
Ownership is never inferred from a well-formed loan number: the lender must confirm
it — typically by sending an OTP to the mobile number registered with the loan.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


# ── Errors ──────────────────────────────────────────────────────────────────

class LoanProviderError(Exception):
    code = 'PROVIDER_ERROR'
    http_status = 502
    user_message = 'The lender could not be reached. Please try again in a few minutes.'


class ProviderNotConfigured(LoanProviderError):
    code = 'INTEGRATION_NOT_CONFIGURED'
    http_status = 503
    user_message = 'Loan linking is not available yet: no lender integration is configured.'


class ProviderUnavailable(LoanProviderError):
    code = 'PROVIDER_UNAVAILABLE'
    http_status = 503
    user_message = "The lender's service is unavailable right now. Please try again later."


class AccountNotFound(LoanProviderError):
    code = 'LOAN_NOT_FOUND'
    http_status = 404
    user_message = 'The lender could not find a loan with that number. Check it and try again.'


class OwnershipMismatch(LoanProviderError):
    code = 'OWNERSHIP_NOT_VERIFIED'
    http_status = 403
    user_message = ('This loan is not registered to your verified mobile number, so it cannot be linked. '
                    'Contact the lender to update your registered mobile number.')


class ChallengeInvalid(LoanProviderError):
    code = 'LENDER_OTP_INVALID'
    http_status = 400
    user_message = 'Incorrect verification code.'


class ChallengeExpired(LoanProviderError):
    code = 'LENDER_OTP_EXPIRED'
    http_status = 400
    user_message = 'The verification code expired. Start the verification again.'


class InvalidProviderResponse(LoanProviderError):
    code = 'INVALID_PROVIDER_RESPONSE'
    user_message = 'The lender returned data we could not verify, so nothing was saved.'


# ── Data contracts ──────────────────────────────────────────────────────────

@dataclass
class OwnershipChallenge:
    status: str                              # 'CHALLENGE_SENT' | 'PENDING_REVIEW'
    session_ref: Optional[str] = None        # lender's reference for this verification
    state: Optional[str] = None              # opaque adapter state (encrypted at rest by the caller)
    destination: Optional[str] = None        # masked destination, e.g. '+91 ••••• 3210'


@dataclass
class LoanDetails:
    provider_reference: str                  # lender's opaque account reference
    as_of: datetime
    product_name: Optional[str] = None
    loan_status: Optional[str] = None
    currency: str = 'INR'
    # Every figure is Optional — None means "the lender did not supply it".
    sanctioned_amount: Optional[Decimal] = None
    outstanding_balance: Optional[Decimal] = None
    emi_amount: Optional[Decimal] = None
    next_due_date: Optional[date] = None


# ── Interface ───────────────────────────────────────────────────────────────

class LoanDataProvider(ABC):
    name = 'base'

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def start_ownership_check(self, *, identifier: str, verified_mobile: str) -> OwnershipChallenge:
        """Look the loan up and begin the lender's ownership check for the holder of
        `verified_mobile`. Raises AccountNotFound / OwnershipMismatch / ProviderUnavailable."""

    @abstractmethod
    def complete_ownership_check(self, *, session_ref: str, state: Optional[str], code: str) -> LoanDetails:
        """Submit the code the lender sent. Raises ChallengeInvalid / ChallengeExpired."""

    @abstractmethod
    def fetch_loan(self, *, provider_reference: str) -> LoanDetails:
        """Current figures for a linked loan."""
