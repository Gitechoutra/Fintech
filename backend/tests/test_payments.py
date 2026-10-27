"""EMI payments with an in-process fake of the Razorpay REST API."""

import hashlib
import hmac
import json

import pytest

from tests.conftest import auth, idem, link_loan, onboarded, use_fake_lender


def ready(app, sent_otps):
    """Onboarded user with one loan from the test-only fake lender."""
    use_fake_lender(app)
    c, token = onboarded(app, sent_otps)
    return c, token, link_loan(c, token)


class FakeRazorpay:
    def __init__(self):
        self.orders, self.payments, self.n = {}, {}, 0

    def create_order(self, amount_paise, receipt, notes):
        self.n += 1
        oid = f'order_{self.n:06d}'
        self.orders[oid] = {'id': oid, 'amount': amount_paise, 'currency': 'INR'}
        return self.orders[oid]

    def pay(self, order_id, status='captured', method='upi'):
        self.n += 1
        pid = f'pay_{self.n:06d}'
        o = self.orders[order_id]
        self.payments[pid] = {'id': pid, 'order_id': order_id, 'amount': o['amount'], 'currency': 'INR',
                              'status': status, 'method': method, 'error_description': 'Declined by bank'}
        return pid

    def fetch_payment(self, pid):
        return self.payments[pid]

    def fetch_order_payments(self, oid):
        return [p for p in self.payments.values() if p['order_id'] == oid]


@pytest.fixture
def rzp(monkeypatch):
    fake = FakeRazorpay()
    for name in ('create_order', 'fetch_payment', 'fetch_order_payments'):
        monkeypatch.setattr(f'portal.helpers.razorpay_helper.{name}', getattr(fake, name))
    return fake


def _sig(order_id, payment_id, secret='test_secret'):
    return hmac.new(secret.encode(), f'{order_id}|{payment_id}'.encode(), hashlib.sha256).hexdigest()


def _session(c, token, loan, amount='15240.00', key=None):
    return c.post('/v1/payments/session', json={'loan_id': loan['loan_id'], 'amount': amount,
                                                'idempotency_key': key or idem()}, headers=auth(token))


def test_quote_shows_fee_and_total(app, sent_otps):
    c, token, loan = ready(app, sent_otps)
    app.config['PAYMENT_CONVENIENCE_FEE_INR'] = '5.00'
    try:
        q = c.post('/v1/payments/quote', json={'loan_id': loan['loan_id'], 'amount': '100'}, headers=auth(token))
        body = q.json['response']
        assert (body['amount'], body['fee'], body['total']) == ('100.00', '5.00', '105.00')
    finally:
        app.config['PAYMENT_CONVENIENCE_FEE_INR'] = '0.00'


def test_amount_validation(app, sent_otps):
    c, token, loan = ready(app, sent_otps)
    for bad in ('0', '-5', '1e5', '10.123', '999999999'):
        r = c.post('/v1/payments/quote', json={'loan_id': loan['loan_id'], 'amount': bad}, headers=auth(token))
        assert r.status_code == 400, bad


def test_full_payment_flow_success(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    r = _session(c, token, loan)
    assert r.status_code == 201, r.json
    s = r.json['response']
    assert s['payment']['status'] == 'CREATED' and s['checkout']['amount'] == 1524000
    assert 'test_secret' not in json.dumps(s)

    oid = s['checkout']['order_id']
    pid = rzp.pay(oid)
    r = c.post('/v1/payments/verify', json={'razorpay_order_id': oid, 'razorpay_payment_id': pid,
                                            'razorpay_signature': _sig(oid, pid)}, headers=auth(token))
    p = r.json['response']['payment']
    assert p['status'] == 'SUCCESS' and p['payment_method'] == 'upi' and p['settlement_status'] == 'NOT_CONFIGURED'

    hist = c.get('/v1/payments', headers=auth(token)).json['response']
    assert hist['total'] == 1 and hist['payments'][0]['receipt_number'].startswith('LE')
    # The in-app payment reduces what can be paid until the lender's figures catch up.
    l2 = next(l for l in c.get('/v1/loans', headers=auth(token)).json['response']['loans'] if l['loan_id'] == loan['loan_id'])
    assert l2['paid_in_app_since_update'] == '15240.00'
    assert l2['payable_balance'] == '297210.75'


def test_forged_signature_cannot_mark_success(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    oid = _session(c, token, loan).json['response']['checkout']['order_id']
    pid = rzp.pay(oid)
    r = c.post('/v1/payments/verify', json={'razorpay_order_id': oid, 'razorpay_payment_id': pid,
                                            'razorpay_signature': 'f' * 64}, headers=auth(token))
    assert r.json['response']['code'] == 'INVALID_SIGNATURE'
    from portal.models.loan_payments import LoanPayments
    assert LoanPayments.query.one().status == 'CREATED'


def test_failed_payment_reported(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    oid = _session(c, token, loan).json['response']['checkout']['order_id']
    pid = rzp.pay(oid, status='failed')
    r = c.post('/v1/payments/verify', json={'razorpay_order_id': oid, 'razorpay_payment_id': pid,
                                            'razorpay_signature': _sig(oid, pid)}, headers=auth(token))
    p = r.json['response']['payment']
    assert p['status'] == 'FAILED' and p['failure_reason'] == 'Declined by bank'


def test_idempotent_session_and_conflict(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    key = idem()
    a = _session(c, token, loan, key=key).json['response']
    b = _session(c, token, loan, key=key).json['response']
    assert a['payment']['payment_id'] == b['payment']['payment_id'] and len(rzp.orders) == 1
    assert _session(c, token, loan, amount='100.00', key=key).json['response']['code'] == 'IDEMPOTENCY_CONFLICT'


def test_no_second_payment_while_one_is_open(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    first = _session(c, token, loan).json['response']
    r = _session(c, token, loan, amount='100.00')
    assert r.status_code == 409 and r.json['response']['code'] == 'PAYMENT_IN_PROGRESS'
    # Closing checkout without paying cancels the order and frees the loan.
    pid = first['payment']['payment_id']
    assert c.post(f'/v1/payments/{pid}/cancel', headers=auth(token)).json['response']['payment']['status'] == 'CANCELLED'
    assert _session(c, token, loan, amount='100.00').status_code == 201


def test_cancel_does_not_hide_a_real_attempt(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    s = _session(c, token, loan).json['response']
    rzp.pay(s['checkout']['order_id'], status='authorized')
    r = c.post(f"/v1/payments/{s['payment']['payment_id']}/cancel", headers=auth(token))
    assert r.json['response']['payment']['status'] == 'PENDING'
    assert _session(c, token, loan, amount='100.00').json['response']['code'] == 'PAYMENT_IN_PROGRESS'


def test_webhook_requires_signature_and_applies(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    s = _session(c, token, loan).json['response']
    oid = s['checkout']['order_id']
    pid = rzp.pay(oid)
    body = json.dumps({'event': 'payment.captured', 'payload': {'payment': {'entity': rzp.payments[pid]}}}).encode()
    assert c.post('/v1/payments/webhook', data=body, content_type='application/json',
                  headers={'X-Razorpay-Signature': 'bad'}).status_code == 401
    sig = hmac.new(b'test_webhook_secret', body, hashlib.sha256).hexdigest()
    assert c.post('/v1/payments/webhook', data=body, content_type='application/json',
                  headers={'X-Razorpay-Signature': sig}).status_code == 200
    p = c.get(f"/v1/payments/{s['payment']['payment_id']}", headers=auth(token)).json['response']['payment']
    assert p['status'] == 'SUCCESS' and p['verified_via'] == 'WEBHOOK'


def test_tampered_amount_rejected(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    oid = _session(c, token, loan).json['response']['checkout']['order_id']
    pid = rzp.pay(oid)
    rzp.payments[pid]['amount'] = 100          # gateway says ₹1 was paid for a ₹15,240 order
    r = c.post('/v1/payments/verify', json={'razorpay_order_id': oid, 'razorpay_payment_id': pid,
                                            'razorpay_signature': _sig(oid, pid)}, headers=auth(token))
    assert r.json['response']['code'] == 'PAYMENT_MISMATCH'


def test_payments_not_configured(app, sent_otps):
    c, token, loan = ready(app, sent_otps)
    app.config['RAZORPAY_KEY_ID'] = ''
    try:
        r = _session(c, token, loan)
        assert r.status_code == 503 and r.json['response']['code'] == 'PAYMENT_NOT_CONFIGURED'
    finally:
        app.config['RAZORPAY_KEY_ID'] = 'rzp_test_dummy'


def test_other_users_payment_is_invisible(app, sent_otps, rzp):
    c1, t1, loan = ready(app, sent_otps)
    s = _session(c1, t1, loan).json['response']
    from tests.conftest import register
    c2, t2 = register(app, sent_otps, mobile='9123456780', email='b@example.com')
    assert c2.get(f"/v1/payments/{s['payment']['payment_id']}", headers=auth(t2)).status_code == 404


def test_payment_uses_linked_card(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    s = _session(c, token, loan).json['response']
    hidden = {h['method'] for h in s['checkout']['config']['display']['hide']}
    assert 'card' not in hidden and {'upi', 'netbanking', 'wallet'} <= hidden
    assert s['card']['last4'] == '4321' and s['payment']['card_label'] == 'HDFC card •••• 4321'


def test_payment_rejects_unknown_card(app, sent_otps, rzp):
    c, token, loan = ready(app, sent_otps)
    r = c.post('/v1/payments/session', json={'loan_id': loan['loan_id'], 'amount': '100.00', 'card_id': 'nope',
                                             'idempotency_key': idem()}, headers=auth(token))
    assert r.status_code == 400 and 'card_id' in r.json['response']['errors']


def test_bajaj_loan_payment_without_lender_figures(app, sent_otps, rzp):
    """A Bajaj loan verified by OTP has no lender figures: any amount within the configured limits is allowed."""
    from tests.conftest import onboarded
    c, token = onboarded(app, sent_otps)
    bajaj = c.get('/v1/loans', headers=auth(token)).json['response']['loans'][0]
    assert bajaj['payable_balance'] is None
    r = _session(c, token, bajaj, amount='5000.00')
    assert r.status_code == 201 and r.json['response']['payment']['loan_label'].startswith('Bajaj Finance Loan')
