from portal import db
from .base import CrudMixin, utcnow, new_public_id


class LinkAttemptStatus:
    CHALLENGE_SENT = 'CHALLENGE_SENT'    # lender sent an OTP to the mobile registered with the loan
    VERIFIED = 'VERIFIED'
    PENDING_REVIEW = 'PENDING_REVIEW'    # lender will confirm ownership later
    FAILED = 'FAILED'
    EXPIRED = 'EXPIRED'

    OPEN = [CHALLENGE_SENT]


class LoanLinkAttempts(CrudMixin, db.Model):
    """One ownership-verification attempt. A loan number alone proves nothing:
    the lender must confirm ownership (e.g. an OTP to the mobile registered with
    the loan) before a LoanAccounts row is created."""
    __tablename__ = 'loan_link_attempts'

    attempt_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey('loan_providers.provider_id'), nullable=False)

    account_ref_hash = db.Column(db.String(64), nullable=False, index=True)
    account_ref_encrypted = db.Column(db.Text, nullable=False)
    account_last4 = db.Column(db.String(4), nullable=False)
    customer_ref_encrypted = db.Column(db.Text, nullable=True)
    otp_hash = db.Column(db.String(255), nullable=True)               # MOBILE_OTP verification only

    # Opaque state the lender adapter needs to finish the challenge (encrypted).
    provider_session_ref = db.Column(db.String(128), nullable=True)
    provider_state_encrypted = db.Column(db.Text, nullable=True)
    challenge_destination = db.Column(db.String(40), nullable=True)   # masked, e.g. "+91 ••••• 3210"

    status = db.Column(db.String(20), nullable=False, default=LinkAttemptStatus.CHALLENGE_SENT, index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    max_attempts = db.Column(db.Integer, nullable=False, default=5)
    failure_code = db.Column(db.String(40), nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    provider = db.relationship('LoanProviders')
