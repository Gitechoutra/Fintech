from portal import db
from .base import CrudMixin, utcnow, new_public_id


class CardLinkStatus:
    OTP_SENT = 'OTP_SENT'
    VERIFIED = 'VERIFIED'
    FAILED = 'FAILED'
    EXPIRED = 'EXPIRED'
    SUPERSEDED = 'SUPERSEDED'


class CardLinkAttempts(CrudMixin, db.Model):
    """One card-linking OTP. The code is random, hashed at rest and single-use."""
    __tablename__ = 'card_link_attempts'

    attempt_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey('card_providers.provider_id'), nullable=False)

    last4 = db.Column(db.String(4), nullable=False)
    identifiers = db.Column(db.JSON, nullable=True)
    otp_hash = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default=CardLinkStatus.OTP_SENT, index=True)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    max_attempts = db.Column(db.Integer, nullable=False, default=5)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    provider = db.relationship('CardProviders')
