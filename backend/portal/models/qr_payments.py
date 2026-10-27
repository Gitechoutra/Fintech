from portal import db
from .base import CrudMixin, utcnow, new_public_id


class QrPaymentStatus:
    HANDED_OFF = 'HANDED_OFF'      # opened in the user's UPI app — the outcome is not known to this app


class QrPayments(CrudMixin, db.Model):
    """A UPI QR the user scanned and handed to their UPI app (Scanner). The app does
    not move UPI money, so it records the hand-off, never a payment result."""
    __tablename__ = 'qr_payments'

    qr_payment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    public_id = db.Column(db.String(32), unique=True, nullable=False, default=new_public_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.user_id'), nullable=False, index=True)
    payee_vpa = db.Column(db.String(320), nullable=False)
    payee_name = db.Column(db.String(80), nullable=True)
    merchant_code = db.Column(db.String(10), nullable=True)
    amount = db.Column(db.Numeric(12, 2), nullable=True)
    note = db.Column(db.String(80), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=QrPaymentStatus.HANDED_OFF)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)
