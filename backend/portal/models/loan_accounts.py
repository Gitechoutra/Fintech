from portal import db
from .base import CrudMixin, utcnow, new_public_id


class LoanLinkStatus:
    VERIFIED = 'VERIFIED'      # lender confirmed the account belongs to this user
    UNLINKED = 'UNLINKED'      # user removed it

    CHOICES = [VERIFIED, UNLINKED]


class LoanAccounts(CrudMixin, db.Model):
    """A loan whose ownership the lender has confirmed for this user.

    The loan number is sensitive: it is stored encrypted (for display of the last
    digits and lender calls) plus a keyed hash used only to detect duplicates.
    Financial figures are copied from the lender's response; NULL means the lender
    did not supply that value — nothing is estimated."""
    __tablename__ = 'loan_accounts'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'provider_id', 'account_ref_hash', name='uq_loan_user_account'),
    )

    loan_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey('loan_providers.provider_id'), nullable=False, index=True)

    account_ref_hash = db.Column(db.String(64), nullable=False, index=True)
    account_ref_encrypted = db.Column(db.Text, nullable=False)
    account_last4 = db.Column(db.String(4), nullable=False)
    customer_ref_encrypted = db.Column(db.Text, nullable=True)        # lender customer ID (encrypted)
    provider_reference = db.Column(db.String(128), nullable=True)     # lender's opaque account reference

    status = db.Column(db.String(20), nullable=False, default=LoanLinkStatus.VERIFIED, index=True)

    # Lender-supplied details (all optional).
    product_name = db.Column(db.String(80), nullable=True)
    loan_status = db.Column(db.String(30), nullable=True)            # ACTIVE | OVERDUE | CLOSED ...
    currency = db.Column(db.String(3), nullable=False, default='INR')
    sanctioned_amount = db.Column(db.Numeric(14, 2), nullable=True)
    outstanding_balance = db.Column(db.Numeric(14, 2), nullable=True)
    emi_amount = db.Column(db.Numeric(14, 2), nullable=True)
    next_due_date = db.Column(db.Date, nullable=True)
    data_as_of = db.Column(db.DateTime, nullable=True)

    verified_at = db.Column(db.DateTime, nullable=True)
    created_on = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_on = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship('Users', back_populates='loans')
    provider = db.relationship('LoanProviders')

    @property
    def masked_number(self):
        return f'•••• {self.account_last4}'
