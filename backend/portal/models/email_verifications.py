from portal import db
from .base import CrudMixin, utcnow


class EmailVerificationStatus:
    PENDING = 'PENDING'
    VERIFIED = 'VERIFIED'
    EXPIRED = 'EXPIRED'
    FAILED = 'FAILED'
    SUPERSEDED = 'SUPERSEDED'


class EmailVerifications(CrudMixin, db.Model):
    """Email OTPs: random per request, hashed at rest and single-use."""
    __tablename__ = 'email_verifications'

    verification_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    email = db.Column(db.String(254), nullable=False)
    otp_hash = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=EmailVerificationStatus.PENDING)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    max_attempts = db.Column(db.Integer, nullable=False, default=5)
    expires_at = db.Column(db.DateTime, nullable=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
