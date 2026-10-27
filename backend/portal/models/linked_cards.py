from portal import db
from .base import CrudMixin, utcnow, new_public_id


class LinkedCardStatus:
    LINKED = 'LINKED'
    REMOVED = 'REMOVED'


class LinkedCards(CrudMixin, db.Model):
    """A credit card the user linked after the OTP check. Only display-safe
    identifiers (e.g. last 4 digits) are stored — never a full card number or CVV."""
    __tablename__ = 'linked_cards'

    card_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey('card_providers.provider_id'), nullable=False, index=True)

    last4 = db.Column(db.String(4), nullable=False)
    identifiers = db.Column(db.JSON, nullable=True)                   # other declared identifiers (non-sensitive)
    verification_method = db.Column(db.String(20), nullable=False)

    status = db.Column(db.String(20), nullable=False, default=LinkedCardStatus.LINKED, index=True)
    is_primary = db.Column(db.Boolean, nullable=False, default=False)
    verified_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship('Users', back_populates='cards')
    provider = db.relationship('CardProviders')
