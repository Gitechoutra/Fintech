from portal import db
from .base import CrudMixin, utcnow, new_public_id


class PaymentStatus:
    CREATED = 'CREATED'        # order created, user has not paid yet
    PENDING = 'PENDING'        # payment authorised / awaiting capture or confirmation
    SUCCESS = 'SUCCESS'        # captured — confirmed server-to-server with Razorpay
    FAILED = 'FAILED'
    CANCELLED = 'CANCELLED'    # order abandoned with no payment attempt

    OPEN = [CREATED, PENDING]


class PaymentType:
    EMI = 'EMI'
    PART_PAYMENT = 'PART_PAYMENT'

    CHOICES = [EMI, PART_PAYMENT]


class SettlementStatus:
    """Whether the money reached the lender. Separate from collection — a captured
    payment is not yet a repaid EMI."""
    NOT_STARTED = 'NOT_STARTED'
    NOT_CONFIGURED = 'NOT_CONFIGURED'     # no settlement partner — lender not credited (test mode only)
    PENDING = 'PENDING'
    SETTLED = 'SETTLED'
    FAILED = 'FAILED'


class LoanPayments(CrudMixin, db.Model):
    __tablename__ = 'loan_payments'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'idempotency_key', name='uq_loan_payment_idempotency'),
        db.CheckConstraint('amount > 0', name='ck_loan_payment_amount_pos'),
    )

    payment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loan_accounts.loan_id'), nullable=False, index=True)
    linked_card_id = db.Column(db.Integer, db.ForeignKey('linked_cards.card_id'), nullable=True, index=True)

    payment_type = db.Column(db.String(20), nullable=False, default=PaymentType.EMI)
    amount = db.Column(db.Numeric(14, 2), nullable=False)             # credited towards the loan
    fee = db.Column(db.Numeric(14, 2), nullable=False, default=0)     # convenience fee
    total = db.Column(db.Numeric(14, 2), nullable=False)              # amount + fee = charged
    currency = db.Column(db.String(3), nullable=False, default='INR')

    provider = db.Column(db.String(30), nullable=False, default='RAZORPAY')
    provider_mode = db.Column(db.String(10), nullable=False, default='test')   # test | live
    provider_order_id = db.Column(db.String(64), unique=True, nullable=False)
    provider_payment_id = db.Column(db.String(64), unique=True, nullable=True)
    payment_method = db.Column(db.String(30), nullable=True)

    status = db.Column(db.String(20), nullable=False, default=PaymentStatus.CREATED, index=True)
    settlement_status = db.Column(db.String(20), nullable=False, default=SettlementStatus.NOT_STARTED)
    verified_via = db.Column(db.String(30), nullable=True)            # API_FETCH | WEBHOOK | RECONCILE
    failure_reason = db.Column(db.String(255), nullable=True)

    idempotency_key = db.Column(db.String(64), nullable=False)
    receipt_number = db.Column(db.String(40), unique=True, nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    last_reconciled_at = db.Column(db.DateTime, nullable=True)

    loan = db.relationship('LoanAccounts')
    card = db.relationship('LinkedCards')
