from portal import db
from .base import CrudMixin, utcnow


class ProviderType:
    BANK = 'BANK'
    NBFC = 'NBFC'           # e.g. Bajaj Finance

    CHOICES = [BANK, NBFC]


class ProviderStatus:
    ACTIVE = 'ACTIVE'              # offered for linking
    COMING_SOON = 'COMING_SOON'    # listed, but linking not open yet
    INACTIVE = 'INACTIVE'          # hidden

    CHOICES = [ACTIVE, COMING_SOON, INACTIVE]


class VerificationMethod:
    MOBILE_OTP = 'MOBILE_OTP'      # OTP to the user's verified mobile number

    CHOICES = [MOBILE_OTP]


class CardProviders(CrudMixin, db.Model):
    """Master data: banks / NBFCs whose credit cards users can link. The app reads
    the provider list, logos and required identifiers from this table only."""
    __tablename__ = 'card_providers'

    provider_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    short_name = db.Column(db.String(40), nullable=False)
    provider_type = db.Column(db.String(10), nullable=False, default=ProviderType.BANK)

    logo_url = db.Column(db.String(255), nullable=True)               # served by the frontend (/banks/…)
    brand_color = db.Column(db.String(7), nullable=True)              # fallback badge when no logo

    offers_credit_card = db.Column(db.Boolean, nullable=False, default=True)
    card_product_name = db.Column(db.String(100), nullable=True)      # e.g. "Bajaj Finserv Insta EMI Card"

    status = db.Column(db.String(20), nullable=False, default=ProviderStatus.ACTIVE, index=True)
    verification_method = db.Column(db.String(20), nullable=False, default=VerificationMethod.MOBILE_OTP)
    # [{"key": "last4", "label": "Last 4 digits of your card", "pattern": "\\d{4}", "hint": "…"}]
    required_identifiers = db.Column(db.JSON, nullable=False)

    is_popular = db.Column(db.Boolean, nullable=False, default=False)
    sort_order = db.Column(db.SmallInteger, nullable=False, default=100)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
