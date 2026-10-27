from portal import db
from .base import CrudMixin, utcnow, new_public_id


class UserStatus:
    ACTIVE = 'ACTIVE'
    SUSPENDED = 'SUSPENDED'

    CHOICES = [ACTIVE, SUSPENDED]


class Users(CrudMixin, db.Model):
    __tablename__ = 'users'

    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)

    # E.164, e.g. +919876543210 — verified by SMS OTP at registration/login.
    mobile_number = db.Column(db.String(16), unique=True, nullable=False, index=True)
    full_name = db.Column(db.String(100), nullable=True)
    email = db.Column(db.String(254), unique=True, nullable=True)
    email_verified_at = db.Column(db.DateTime, nullable=True)          # set by the email OTP check
    status = db.Column(db.String(20), nullable=False, default=UserStatus.ACTIVE)

    # MPIN — only a peppered scrypt hash is stored (see helpers/mpin.py).
    mpin_hash = db.Column(db.String(255), nullable=True)
    mpin_set_at = db.Column(db.DateTime, nullable=True)
    mpin_failed_attempts = db.Column(db.Integer, nullable=False, default=0)

    # Onboarding fact that is not derivable from other tables.
    onboarded_at = db.Column(db.DateTime, nullable=True)

    last_login = db.Column(db.DateTime, nullable=True)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    sessions = db.relationship('UserSessions', back_populates='user', lazy='dynamic')
    webauthn_credentials = db.relationship('WebAuthnCredentials', back_populates='user', lazy='dynamic')
    loans = db.relationship('LoanAccounts', back_populates='user', lazy='dynamic')
    cards = db.relationship('LinkedCards', back_populates='user', lazy='dynamic')

    @property
    def masked_mobile(self):
        m = self.mobile_number or ''
        return f'{m[:3]} ••••• {m[-4:]}' if len(m) >= 8 else m

    @property
    def masked_email(self):
        e = self.email or ''
        if '@' not in e:
            return None
        local, domain = e.split('@', 1)
        return f'{local[:2]}•••@{domain}'

    def __repr__(self):
        return f'<User {self.user_id}>'
