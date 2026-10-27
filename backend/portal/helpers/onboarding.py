"""
Onboarding state, derived from server-side facts only — never from anything the
browser says about itself.

    account   → verified mobile (implicit: the user exists) + full name + verified email
    loan      → a Bajaj Finance (or other lender) loan verified with OTP
    card      → at least one credit card linked after the card OTP check
    security  → MPIN set (biometrics are an optional extra on top of the MPIN)
    dashboard → all of the above

The MPIN is mandatory because it is the fallback for every device: biometrics
are not available on all browsers and can be removed at any time.
"""

from portal.models.base import iso, utcnow
from portal.models.linked_cards import LinkedCards, LinkedCardStatus
from portal.models.loan_accounts import LoanAccounts, LoanLinkStatus

STEPS = ['account', 'loan', 'card', 'security']
DONE, CURRENT, PENDING = 'DONE', 'CURRENT', 'PENDING'


def _facts(user):
    has_card = LinkedCards.query.filter_by(user_id=user.user_id, status=LinkedCardStatus.LINKED).count() > 0
    return {
        'account': bool(user.full_name and user.email and user.email_verified_at),
        'loan': LoanAccounts.query.filter_by(user_id=user.user_id, status=LoanLinkStatus.VERIFIED).count() > 0,
        # Once onboarded, removing the last card does not reopen the card step.
        'card': has_card or user.onboarded_at is not None,
        'security': bool(user.mpin_hash),
    }


def missing_steps(user, steps):
    f = _facts(user)
    return [s for s in steps if not f[s]]


def status_for(user):
    f = _facts(user)
    steps, current = {}, None
    for s in STEPS:
        if f[s]:
            steps[s] = DONE
        elif current is None:
            current = s
            steps[s] = CURRENT
        else:
            steps[s] = PENDING
    return {
        'steps': steps,
        'next_step': current or 'dashboard',
        'complete': current is None,
        'email_verified': user.email_verified_at is not None,
        'biometric_enabled': user.webauthn_credentials.count() > 0,
        'onboarded_at': iso(user.onboarded_at),
    }


def mark_complete_if_done(user):
    """Stamp onboarded_at the first time every step is satisfied (caller commits)."""
    if user.onboarded_at is None and not missing_steps(user, STEPS):
        user.onboarded_at = utcnow()
        return True
    return False
