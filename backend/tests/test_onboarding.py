from tests.conftest import auth, link_bajaj, link_card, register, set_mpin


def test_email_must_be_verified_before_card_step(app, sent_otps):
    c, token = register(app, sent_otps, verify_email=False)
    status = c.get('/v1/onboarding/status', headers=auth(token)).json['response']
    assert status['next_step'] == 'account' and status['email_verified'] is False
    r = c.post('/v1/cards/link/start', json={'provider_code': 'HDFC', 'identifiers': {'last4': '4321'}},
               headers=auth(token))
    assert r.status_code == 403 and r.json['response']['missing_steps'] == ['account', 'loan']


def test_email_otp_wrong_then_right(app, sent_otps):
    c, token = register(app, sent_otps, verify_email=False)
    assert c.post('/v1/authentication/email/send', headers=auth(token)).status_code == 200
    real = sent_otps['email:asha@example.com']
    wrong = '000000' if real != '000000' else '111111'
    r = c.post('/v1/authentication/email/verify', json={'otp': wrong}, headers=auth(token))
    assert r.json['response']['code'] == 'OTP_INVALID'
    r = c.post('/v1/authentication/email/verify', json={'otp': real}, headers=auth(token))
    assert r.status_code == 200 and r.json['response']['email_verified'] is True
    assert r.json['response']['onboarding']['next_step'] == 'loan'


def test_email_resend_cooldown_and_already_verified(app, sent_otps):
    c, token = register(app, sent_otps, verify_email=False)
    c.post('/v1/authentication/email/send', headers=auth(token))
    assert c.post('/v1/authentication/email/send', headers=auth(token)).json['response']['code'] == 'OTP_COOLDOWN'
    c2, t2 = register(app, sent_otps, mobile='9123456780', email='b@example.com')
    assert c2.post('/v1/authentication/email/send', headers=auth(t2)).json['response']['code'] == 'ALREADY_VERIFIED'


def test_changing_email_requires_verification_again(app, sent_otps):
    c, token = register(app, sent_otps)
    r = c.patch('/v1/authentication/me', json={'full_name': 'Asha Rao', 'email': 'new@example.com'}, headers=auth(token))
    assert r.json['response']['email_verified'] is False
    assert r.json['response']['onboarding']['next_step'] == 'account'


def test_journey_order_enforced_by_server(app, sent_otps):
    c, token = register(app, sent_otps)
    # MPIN before the Bajaj loan and a card → refused.
    r = c.post('/v1/security/mpin', json={'new_mpin': '4826', 'confirm_mpin': '4826'}, headers=auth(token))
    assert r.status_code == 403 and r.json['response']['missing_steps'] == ['loan', 'card']
    # Payments before registration is complete → refused.
    r = c.post('/v1/payments/quote', json={'loan_id': 'x', 'amount': '10'}, headers=auth(token))
    assert r.status_code == 403
    link_bajaj(c, token, sent_otps)
    link_card(c, token, sent_otps)
    set_mpin(c, token)
    status = c.get('/v1/onboarding/status', headers=auth(token)).json['response']
    assert status['complete'] is True
    assert status['steps'] == {'account': 'DONE', 'loan': 'DONE', 'card': 'DONE', 'security': 'DONE'}


def test_no_sandbox_left(app):
    from portal.models.loan_providers import LoanProviders
    assert [p.code for p in LoanProviders.query.all()] == ['BAJAJ_FINANCE']
    assert 'CARD_VAULT_PROVIDER' not in app.config
    import importlib.util
    assert importlib.util.find_spec('portal.providers.loan_data.sandbox') is None
    assert importlib.util.find_spec('portal.providers.card_vault') is None
