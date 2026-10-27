"""Test fixtures. Uses APP_ENV=TEST (SQLite in memory). SMS / email senders, the
lender adapter and the Razorpay HTTP calls are replaced with in-process fakes —
no network is touched and nothing here ships with the app."""

import os
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
os.environ['APP_ENV'] = 'TEST'

from portal import InitApp, db  # noqa: E402

H = {'X-Requested-With': 'lendease'}


@pytest.fixture(scope='session')
def app():
    return InitApp().app('TEST')


@pytest.fixture(autouse=True)
def _db(app):
    with app.app_context():
        db.drop_all()
        db.create_all()
        from portal.seeders import run_all_seeders
        run_all_seeders()
        yield
        db.session.remove()
        from portal.providers.loan_data import registry
        registry._override = None
        app.config['LOAN_DATA_PROVIDER'] = ''


@pytest.fixture
def sent_otps(monkeypatch):
    """Captures every code instead of sending it: box[mobile] for SMS (login and card
    linking), box['email:' + address] for email."""
    box = {}

    def fake_sms(mobile, otp):
        box[mobile] = otp
        return {'success': True, 'provider': 'test', 'message': 'ok'}

    def fake_email(to_email, code):
        box['email:' + to_email] = code
        return {'success': True, 'provider': 'test'}

    monkeypatch.setattr('portal.routes.authentication.routes.send_otp_sms', fake_sms)
    monkeypatch.setattr('portal.routes.cards.routes.send_otp_sms', fake_sms)
    monkeypatch.setattr('portal.routes.loans.routes.send_otp_sms', fake_sms)
    monkeypatch.setattr('portal.routes.authentication.routes.send_verification_email', fake_email)
    return box


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def register(app, sent_otps, mobile='9876543210', name='Asha Rao', email='asha@example.com', verify_email=True):
    """Phone OTP registration (+ email verification). Returns (client, access_token)."""
    c = app.test_client()
    r = c.post('/v1/authentication/otp/send', json={'mobile_number': mobile})
    assert r.status_code == 200, r.json
    code = sent_otps['+91' + mobile[-10:]]
    r = c.post('/v1/authentication/otp/verify',
               json={'mobile_number': mobile, 'otp_code': code, 'full_name': name, 'email': email})
    assert r.status_code == 200, r.json
    token = r.json['response']['access_token']
    if verify_email:
        assert c.post('/v1/authentication/email/send', headers=auth(token)).status_code == 200
        r = c.post('/v1/authentication/email/verify', json={'otp': sent_otps['email:' + email]}, headers=auth(token))
        assert r.status_code == 200, r.json
    return c, token


def link_bajaj(c, token, sent_otps, mobile='9876543210', loan_no='BFL4482019', customer_id='CUST55120'):
    r = c.post('/v1/loans/link/start', json={'provider_code': 'BAJAJ_FINANCE', 'identifiers': {
        'loan_account_number': loan_no, 'customer_id': customer_id}}, headers=auth(token))
    assert r.status_code == 201, r.json
    r = c.post('/v1/loans/link/verify', json={'attempt_id': r.json['response']['attempt_id'],
                                              'code': sent_otps['+91' + mobile[-10:]]}, headers=auth(token))
    assert r.status_code == 201, r.json
    return r.json['response']['loan']


def link_card(c, token, sent_otps, mobile='9876543210', provider='HDFC', last4='4321'):
    r = c.post('/v1/cards/link/start', json={'provider_code': provider, 'identifiers': {'last4': last4}},
               headers=auth(token))
    assert r.status_code == 201, r.json
    r = c.post('/v1/cards/link/verify', json={'attempt_id': r.json['response']['attempt_id'],
                                              'otp': sent_otps['+91' + mobile[-10:]]}, headers=auth(token))
    assert r.status_code == 201, r.json
    return r.json['response']['card']


def set_mpin(c, token, mpin='4826'):
    r = c.post('/v1/security/mpin', json={'new_mpin': mpin, 'confirm_mpin': mpin}, headers=auth(token))
    assert r.status_code == 201, r.json


def onboarded(app, sent_otps, mobile='9876543210', email='asha@example.com'):
    """Registered + email verified + Bajaj loan + card linked + MPIN. Returns (client, token)."""
    c, token = register(app, sent_otps, mobile=mobile, email=email)
    link_bajaj(c, token, sent_otps, mobile=mobile)
    link_card(c, token, sent_otps, mobile=mobile)
    set_mpin(c, token)
    return c, token


# ── Fake lender (tests only) ────────────────────────────────────────────────

class FakeLender:
    """Stands in for a real lender adapter so the loan and payment code paths can be tested."""
    name = 'fake'

    def is_configured(self):
        return True

    def start_ownership_check(self, *, identifier, verified_mobile):
        from portal.providers.loan_data import AccountNotFound, OwnershipChallenge
        if identifier != 'LN12345678':
            raise AccountNotFound()
        return OwnershipChallenge(status='CHALLENGE_SENT', session_ref='fake-1', state='{}',
                                  destination=verified_mobile[:3] + ' ••••• ' + verified_mobile[-4:])

    def complete_ownership_check(self, *, session_ref, state, code):
        from portal.providers.loan_data import ChallengeInvalid
        if code != '246810':
            raise ChallengeInvalid()
        return self.fetch_loan(provider_reference='fake:LN12345678')

    def fetch_loan(self, *, provider_reference):
        from portal.models.base import utcnow
        from portal.providers.loan_data import LoanDetails
        return LoanDetails(provider_reference=provider_reference, as_of=utcnow(), product_name='Personal Loan',
                           loan_status='ACTIVE', sanctioned_amount=Decimal('500000.00'),
                           outstanding_balance=Decimal('312450.75'), emi_amount=Decimal('15240.00'),
                           next_due_date=date.today() + timedelta(days=10))


def use_fake_lender(app):
    from portal.models.loan_providers import LoanProviders
    from portal.providers.loan_data import registry
    app.config['LOAN_DATA_PROVIDER'] = 'fake'
    registry.set_test_provider(FakeLender())
    db.session.add(LoanProviders(code='FAKE', display_name='Fake Lender', adapter='fake', verification_method='LENDER_API',
                                 required_identifiers=[{'key': 'loan_account_number', 'label': 'Loan account number',
                                                        'pattern': r'LN\d{8}'}]))
    db.session.commit()


def link_loan(c, token):
    r = c.post('/v1/loans/link/start', json={'provider_code': 'FAKE', 'identifier': 'LN12345678'}, headers=auth(token))
    assert r.status_code == 201, r.json
    r = c.post('/v1/loans/link/verify', json={'attempt_id': r.json['response']['attempt_id'], 'code': '246810'},
               headers=auth(token))
    assert r.status_code == 201, r.json
    return r.json['response']['loan']


def idem():
    return uuid.uuid4().hex
