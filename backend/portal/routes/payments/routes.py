"""
EMI payments (Razorpay).

A payment's status is changed ONLY by data fetched from Razorpay server-to-server
(after the checkout signature verifies), by a signature-verified webhook, or by
reconciliation against the order's attempts. The browser can never mark a payment
successful.

Duplicates: every session carries an idempotency key (unique per user), and a new
payment for a loan is refused while an earlier one for that loan is unresolved.

Collection vs settlement: Razorpay collects the money into the merchant account.
Crediting the lender requires a settlement partner; until one is configured,
settlement_status is NOT_CONFIGURED and live mode is refused (razorpay_helper).
"""

import secrets
from datetime import timedelta
from decimal import Decimal

from flask import current_app, request
from flask_restx import Resource
from sqlalchemy.exc import IntegrityError

from portal import db
from portal.extensions import limiter
from portal.helpers import razorpay_helper as rzp
from portal.helpers.audit import audit
from portal.helpers.auth import auth_required, current_user, step_required
from portal.helpers.loan_math import payable_balance
from portal.helpers.notify import payment_status_alert
from portal.helpers.onboarding import STEPS
from portal.helpers.responses import fail, ok, server_error
from portal.helpers.validators import Validator, money, validate_amount, validate_choice, validate_idempotency_key
from portal.models.base import iso, utcnow
from portal.models.linked_cards import LinkedCards, LinkedCardStatus
from portal.models.loan_accounts import LoanAccounts, LoanLinkStatus
from portal.models.loan_payments import LoanPayments, PaymentStatus, PaymentType, SettlementStatus

from . import ns, logger

RECONCILE_INTERVAL = timedelta(seconds=10)
RESUME_WINDOW = timedelta(minutes=15)       # an untouched checkout blocks a new one for this long
PAYABLE_LOAN_STATUSES = (None, 'ACTIVE', 'OVERDUE')
NON_CARD_METHODS = ('upi', 'netbanking', 'wallet', 'emi', 'cardless_emi', 'paylater')


def _json():
    return request.get_json(silent=True) or {}


def _fee():
    return Decimal(current_app.config['PAYMENT_CONVENIENCE_FEE_INR']).quantize(Decimal('0.01'))


def _card_label(card):
    return f'{card.provider.short_name} card {"•••• " + card.last4}' if card else None


def serialize_payment(p):
    loan = p.loan
    return {
        'card_id': p.card.public_id if p.card else None,
        'card_label': _card_label(p.card),
        'payment_id': p.public_id,
        'loan_id': loan.public_id if loan else None,
        'loan_label': f'{loan.product_name or "Loan"} {loan.masked_number}' if loan else None,
        'provider_name': loan.provider.display_name if loan and loan.provider else None,
        'payment_type': p.payment_type,
        'amount': money(p.amount), 'fee': money(p.fee), 'total': money(p.total),
        'currency': p.currency,
        'status': p.status,
        'settlement_status': p.settlement_status,
        'provider': p.provider,
        'provider_mode': p.provider_mode,
        'provider_order_id': p.provider_order_id if not p.provider_order_id.startswith('pending-') else None,
        'provider_payment_id': p.provider_payment_id,
        'payment_method': p.payment_method,
        'receipt_number': p.receipt_number,
        'failure_reason': p.failure_reason,
        'verified_via': p.verified_via,
        'created_at': iso(p.created_at),
        'completed_at': iso(p.completed_at),
    }


# ── Applying gateway truth ──────────────────────────────────────────────────

def apply_gateway_payment(txn, entity, via):
    """Update txn from a Razorpay payment entity obtained server-side, after checking
    it really belongs to this order and amount."""
    if entity.get('order_id') != txn.provider_order_id:
        raise ValueError('order mismatch')
    expected_paise = int((Decimal(txn.total) * 100).to_integral_value())
    if int(entity.get('amount', -1)) != expected_paise or entity.get('currency') != txn.currency:
        raise ValueError('amount mismatch')

    gw_status, pid = entity.get('status'), entity.get('id')
    if txn.status == PaymentStatus.SUCCESS:
        return txn                                          # terminal
    before = txn.status
    if gw_status == 'captured':
        other = LoanPayments.query.filter(LoanPayments.provider_payment_id == pid,
                                          LoanPayments.payment_id != txn.payment_id).first()
        if other:
            raise ValueError('payment id already used')
        txn.status = PaymentStatus.SUCCESS
        txn.provider_payment_id = pid
        txn.payment_method = (entity.get('method') or '')[:30] or None
        txn.completed_at = utcnow()
        txn.failure_reason = None
        txn.settlement_status = (SettlementStatus.PENDING if current_app.config.get('LOAN_SETTLEMENT_PROVIDER')
                                 else SettlementStatus.NOT_CONFIGURED)
    elif gw_status == 'authorized':
        txn.status = PaymentStatus.PENDING
        txn.provider_payment_id = txn.provider_payment_id or pid
        txn.payment_method = (entity.get('method') or '')[:30] or txn.payment_method
    elif gw_status == 'failed' and txn.status in PaymentStatus.OPEN + [PaymentStatus.CANCELLED]:
        txn.status = PaymentStatus.FAILED
        txn.payment_method = (entity.get('method') or '')[:30] or txn.payment_method
        txn.failure_reason = (entity.get('error_description') or 'The payment was declined.')[:255]
    txn.verified_via = via
    txn.last_reconciled_at = utcnow()
    if txn.status != before and txn.status in (PaymentStatus.SUCCESS, PaymentStatus.FAILED):
        payment_status_alert(txn)
    return txn


def reconcile(txn, source='RECONCILE'):
    """Pull the truth for a payment from Razorpay (all attempts on its order).
    Returns True when the gateway had at least one attempt."""
    items = rzp.fetch_order_payments(txn.provider_order_id)
    pick = (next((i for i in items if i.get('status') == 'captured'), None)
            or next((i for i in items if i.get('status') == 'authorized'), None)
            or (items[0] if items else None))
    if pick:
        apply_gateway_payment(txn, pick, source)
    else:
        txn.last_reconciled_at = utcnow()
    return pick is not None


def _resolve_open_payments(loan):
    """Before a new payment: settle earlier open payments for this loan. Returns the
    payment that must be finished first, or None."""
    now = utcnow()
    for p in LoanPayments.query.filter(LoanPayments.loan_id == loan.loan_id,
                                       LoanPayments.status.in_(PaymentStatus.OPEN)).all():
        if p.provider_order_id.startswith('pending-'):
            p.status = PaymentStatus.CANCELLED          # the order was never created at the gateway
            continue
        if p.last_reconciled_at is None or now - p.last_reconciled_at > RECONCILE_INTERVAL:
            try:
                reconcile(p)
            except (rzp.RazorpayError, ValueError) as e:
                logger.warning(f'[payments] reconcile before new session failed: {e.__class__.__name__}')
                return p                                   # cannot prove it is safe to start another
        if p.status == PaymentStatus.PENDING:
            return p
        if p.status == PaymentStatus.CREATED:
            if now - p.created_at < RESUME_WINDOW:
                return p
            p.status = PaymentStatus.CANCELLED
    return None


def _validate_request(user, body):
    """Shared by /quote and /session. Returns (loan, amount, payment_type, error_response)."""
    v = Validator()
    amount, e = validate_amount(body.get('amount'), 'Payment amount', required=True, allow_zero=False)
    v.check('amount', e)
    ptype, e = validate_choice(body.get('payment_type') or PaymentType.EMI, PaymentType.CHOICES, 'Payment type')
    v.check('payment_type', e)
    loan = LoanAccounts.query.filter_by(public_id=str(body.get('loan_id') or '')[:32], user_id=user.user_id,
                                        status=LoanLinkStatus.VERIFIED).first()
    if loan is None:
        return None, None, None, fail('Loan not found.', 404, code='NOT_FOUND')
    if loan.loan_status not in PAYABLE_LOAN_STATUSES:
        return None, None, None, fail('This loan is not accepting payments.', 409, code='LOAN_NOT_PAYABLE')
    if v.ok:
        cfg = current_app.config
        lo, hi = Decimal(cfg['MIN_EMI_PAYMENT_INR']), Decimal(cfg['MAX_EMI_PAYMENT_INR'])
        if amount < lo:
            v.check('amount', f'Minimum payment is ₹{money(lo)}.')
        elif amount > hi:
            v.check('amount', f'Maximum payment is ₹{money(hi)}.')
        else:
            payable = payable_balance(loan)
            if payable is not None and payable <= 0:
                v.check('amount', 'Nothing is due on this loan right now.')
            elif payable is not None and amount > payable:
                v.check('amount', f'Amount cannot exceed the payable balance of ₹{money(payable)}.')
    if not v.ok:
        return None, None, None, v.response()
    return loan, amount, ptype, None


def _payment_card(user, body):
    """The linked credit card to pay with: the one requested, else the primary card."""
    q = LinkedCards.query.filter_by(user_id=user.user_id, status=LinkedCardStatus.LINKED)
    card_id = str(body.get('card_id') or '')[:32]
    if card_id:
        return q.filter_by(public_id=card_id).first()
    return q.order_by(LinkedCards.is_primary.desc(), LinkedCards.created_on.asc()).first()


def _checkout_payload(txn, cfg):
    loan = txn.loan
    return {
        'payment': serialize_payment(txn),
        'checkout': {
            'key': cfg['key_id'], 'order_id': txn.provider_order_id,
            'amount': int(Decimal(txn.total) * 100), 'currency': txn.currency,
            'name': current_app.config['APP_NAME'],
            'description': f'{loan.product_name or "Loan"} {loan.masked_number} — {txn.payment_type.replace("_", " ").title()}',
            # Pay with the linked credit card: every other method is hidden in Razorpay's window.
            'config': {'display': {'hide': [{'method': m} for m in NON_CARD_METHODS],
                                   'preferences': {'show_default_blocks': True}}},
        },
        'card': {'card_id': txn.card.public_id, 'label': _card_label(txn.card), 'last4': txn.card.last4} if txn.card else None,
        'mode': cfg['mode'],
        'notice': cfg['message'],
    }


# ── Config / quote ──────────────────────────────────────────────────────────

@ns.route('/config')
class PaymentConfig(Resource):
    @ns.doc(description='Is the payment provider configured, which mode, and the convenience fee.')
    @auth_required
    def get(self):
        cfg = rzp.payment_config()
        cfg.pop('key_id', None)
        cfg['convenience_fee'] = money(_fee())
        return ok(cfg)


@ns.route('/quote')
class Quote(Resource):
    @ns.doc(description='Validate an amount and return the fee and total that would be charged.')
    @limiter.limit('30 per minute')
    @step_required(*STEPS)
    def post(self):
        loan, amount, ptype, err = _validate_request(current_user(), _json())
        if err:
            return err
        fee = _fee()
        return ok({'loan_id': loan.public_id, 'payment_type': ptype, 'amount': money(amount),
                   'fee': money(fee), 'total': money(amount + fee), 'currency': 'INR'})


# ── Payment session ─────────────────────────────────────────────────────────

@ns.route('/session')
class PaymentSession(Resource):
    @ns.doc(description='Create a Razorpay order for an EMI payment. Idempotent per idempotency_key, '
                        'and refused while an earlier payment for the same loan is unresolved.')
    @limiter.limit('10 per minute')
    @step_required(*STEPS)
    def post(self):
        try:
            user = current_user()
            cfg = rzp.payment_config()
            if not cfg['configured']:
                return fail(cfg['message'], 503, code='PAYMENT_NOT_CONFIGURED')
            body = _json()
            key, e = validate_idempotency_key(body.get('idempotency_key'))
            if e:
                return fail(e, 400, code='VALIDATION_ERROR', errors={'idempotency_key': e})
            loan, amount, ptype, err = _validate_request(user, body)
            if err:
                return err
            card = _payment_card(user, body)
            if card is None:
                return fail('Choose one of your linked credit cards to pay with.', 400, code='VALIDATION_ERROR',
                            errors={'card_id': 'Choose one of your linked credit cards to pay with.'})

            existing = LoanPayments.query.filter_by(user_id=user.user_id, idempotency_key=key).first()
            if existing:
                if existing.loan_id != loan.loan_id or Decimal(existing.amount) != amount:
                    return fail('This request key was already used for a different payment.', 409,
                                code='IDEMPOTENCY_CONFLICT')
                return ok(_checkout_payload(existing, cfg))

            blocking = _resolve_open_payments(loan)
            if blocking is not None:
                db.session.commit()
                return fail('A payment for this loan is still being processed. Wait for it to finish before '
                            'starting another.', 409, code='PAYMENT_IN_PROGRESS', payment_id=blocking.public_id)

            fee = _fee()
            txn = LoanPayments(
                user_id=user.user_id, loan_id=loan.loan_id, linked_card_id=card.card_id,
                payment_type=ptype, amount=amount, fee=fee,
                total=amount + fee, currency='INR', provider='RAZORPAY', provider_mode=cfg['mode'],
                idempotency_key=key, receipt_number=f'LE{utcnow():%y%m%d%H%M%S}{secrets.token_hex(4).upper()}',
                provider_order_id='pending-' + secrets.token_hex(12))
            db.session.add(txn)
            db.session.flush()       # reserve the idempotency key before calling the gateway

            total_paise = int(txn.total * 100)
            try:
                order = rzp.create_order(total_paise, txn.receipt_number,
                                         {'payment_ref': txn.public_id, 'purpose': 'LOAN_EMI'})
            except rzp.RazorpayError as re:
                db.session.rollback()
                return fail(str(re), 502, code='PAYMENT_PROVIDER_ERROR')
            if order.get('amount') != total_paise or not order.get('id'):
                db.session.rollback()
                return fail('Payment provider returned an unexpected order.', 502, code='PAYMENT_PROVIDER_ERROR')

            txn.provider_order_id = order['id']
            db.session.commit()
            audit('PAYMENT_SESSION_CREATED', user.user_id, 'PAYMENT', txn.public_id,
                  details={'amount': str(amount), 'mode': cfg['mode']})
            return ok(_checkout_payload(txn, cfg), 201)
        except IntegrityError:
            db.session.rollback()
            return fail('Duplicate payment request.', 409, code='IDEMPOTENCY_CONFLICT')
        except Exception:
            db.session.rollback()
            return server_error(logger, 'payments/session')


# ── Verification ────────────────────────────────────────────────────────────

@ns.route('/verify')
class PaymentVerify(Resource):
    @ns.doc(description='Called after Razorpay Checkout returns. Verifies the signature, then confirms '
                        'the payment server-to-server before changing its status.')
    @limiter.limit('20 per minute')
    @auth_required
    def post(self):
        try:
            user = current_user()
            body = _json()
            order_id = str(body.get('razorpay_order_id') or '')[:64]
            payment_id = str(body.get('razorpay_payment_id') or '')[:64]
            signature = str(body.get('razorpay_signature') or '')[:128]
            txn = LoanPayments.query.filter_by(provider_order_id=order_id, user_id=user.user_id).first()
            if not txn:
                return fail('Payment not found.', 404, code='NOT_FOUND')
            if txn.status == PaymentStatus.SUCCESS:
                return ok({'payment': serialize_payment(txn)})
            if not rzp.verify_checkout_signature(order_id, payment_id, signature):
                audit('PAYMENT_VERIFY', user.user_id, 'PAYMENT', txn.public_id, status='FAILED',
                      details={'reason': 'bad_signature'})
                return fail('Payment could not be verified.', 400, code='INVALID_SIGNATURE')
            try:
                apply_gateway_payment(txn, rzp.fetch_payment(payment_id), 'API_FETCH')
            except rzp.RazorpayError:
                db.session.rollback()
                # Signature was fine but we could not confirm — keep it pending; webhook/reconcile settle it.
                if txn.status == PaymentStatus.CREATED:
                    txn.status = PaymentStatus.PENDING
                db.session.commit()
                return ok({'payment': serialize_payment(txn),
                           'message': 'Payment received; confirmation is pending with the provider.'}, 202)
            except ValueError as ve:
                db.session.rollback()
                logger.error(f'[payments/verify] gateway data mismatch: {ve}')
                audit('PAYMENT_VERIFY', user.user_id, 'PAYMENT', txn.public_id, status='FAILED',
                      details={'reason': 'mismatch'})
                return fail('Payment details did not match this order.', 400, code='PAYMENT_MISMATCH')
            db.session.commit()
            audit('PAYMENT_VERIFY', user.user_id, 'PAYMENT', txn.public_id, details={'status': txn.status})
            return ok({'payment': serialize_payment(txn)})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'payments/verify')


@ns.route('/webhook')
class RazorpayWebhook(Resource):
    @ns.doc(description='Razorpay webhook (payment.captured / payment.authorized / payment.failed). '
                        'Requires a valid X-Razorpay-Signature.')
    @limiter.limit('300 per minute')
    def post(self):
        raw = request.get_data(cache=True)
        if not rzp.verify_webhook_signature(raw, request.headers.get('X-Razorpay-Signature', '')):
            return fail('Invalid signature.', 401, code='INVALID_SIGNATURE')
        try:
            payload = request.get_json(silent=True) or {}
            event = payload.get('event', '')
            entity = ((payload.get('payload') or {}).get('payment') or {}).get('entity') or {}
            if event in ('payment.captured', 'payment.authorized', 'payment.failed') and entity.get('order_id'):
                txn = LoanPayments.query.filter_by(provider_order_id=entity['order_id']).first()
                if txn:
                    try:
                        apply_gateway_payment(txn, entity, 'WEBHOOK')
                        db.session.commit()
                        audit('PAYMENT_WEBHOOK', txn.user_id, 'PAYMENT', txn.public_id,
                              details={'event': event, 'status': txn.status})
                    except ValueError as ve:
                        db.session.rollback()
                        logger.error(f'[payments/webhook] rejected {event}: {ve}')
            return ok({'received': True})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'payments/webhook')


# ── History / single payment ────────────────────────────────────────────────

@ns.route('')
class Payments(Resource):
    @ns.doc(description='Payment history, newest first.',
            params={'page': 'Page', 'per_page': 'Max 50', 'loan_id': 'Filter by loan',
                    'status': 'SUCCESS | FAILED | PENDING | CREATED | OPEN'})
    @auth_required
    def get(self):
        user = current_user()
        page = max(request.args.get('page', 1, type=int), 1)
        per_page = min(max(request.args.get('per_page', 10, type=int), 1), 50)
        q = LoanPayments.query.filter(LoanPayments.user_id == user.user_id,
                                      LoanPayments.status != PaymentStatus.CANCELLED)
        status = request.args.get('status', '', type=str).upper()
        if status in (PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.PENDING, PaymentStatus.CREATED):
            q = q.filter(LoanPayments.status == status)
        elif status == 'OPEN':
            q = q.filter(LoanPayments.status.in_(PaymentStatus.OPEN))
        loan_id = request.args.get('loan_id', '', type=str)[:32]
        if loan_id:
            q = q.join(LoanAccounts).filter(LoanAccounts.public_id == loan_id)
        p = q.order_by(LoanPayments.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
        return ok({'payments': [serialize_payment(x) for x in p.items],
                   'page': page, 'pages': p.pages, 'total': p.total})


def _owned(payment_id):
    return LoanPayments.query.filter_by(public_id=payment_id[:32], user_id=current_user().user_id).first()


@ns.route('/<string:payment_id>')
class Payment(Resource):
    @ns.doc(description='One payment (owner only). Open payments are reconciled with Razorpay on read.')
    @limiter.limit('60 per minute')
    @auth_required
    def get(self, payment_id):
        try:
            txn = _owned(payment_id)
            if not txn:
                return fail('Payment not found.', 404, code='NOT_FOUND')
            if (txn.status in PaymentStatus.OPEN and not txn.provider_order_id.startswith('pending-')
                    and (txn.last_reconciled_at is None or utcnow() - txn.last_reconciled_at > RECONCILE_INTERVAL)
                    and utcnow() - txn.created_at < timedelta(days=2)):
                try:
                    reconcile(txn)
                    db.session.commit()
                except (rzp.RazorpayError, ValueError) as e:
                    db.session.rollback()
                    logger.warning(f'[payments/get] reconcile skipped: {e.__class__.__name__}')
            return ok({'payment': serialize_payment(txn)})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'payments/get')


@ns.route('/<string:payment_id>/cancel')
class PaymentCancel(Resource):
    @ns.doc(description='Called when the user closes checkout. Cancels the payment only if Razorpay has '
                        'no attempt on the order; otherwise returns the reconciled status.')
    @limiter.limit('20 per minute')
    @auth_required
    def post(self, payment_id):
        try:
            txn = _owned(payment_id)
            if not txn:
                return fail('Payment not found.', 404, code='NOT_FOUND')
            if txn.status == PaymentStatus.CREATED:
                try:
                    had_attempt = (not txn.provider_order_id.startswith('pending-')) and reconcile(txn, 'CANCEL')
                except (rzp.RazorpayError, ValueError):
                    db.session.rollback()
                    return fail('Could not confirm the payment status with the provider. Please check again shortly.',
                                503, code='PAYMENT_PROVIDER_ERROR', payment=serialize_payment(txn))
                if not had_attempt and txn.status == PaymentStatus.CREATED:
                    txn.status = PaymentStatus.CANCELLED
                db.session.commit()
                audit('PAYMENT_CANCEL', txn.user_id, 'PAYMENT', txn.public_id, details={'status': txn.status})
            return ok({'payment': serialize_payment(txn)})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'payments/cancel')
