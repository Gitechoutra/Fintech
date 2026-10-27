from tests.conftest import auth, link_bajaj, link_card, register as _register


def register(app, sent_otps, **kw):
    """Cards come after the Bajaj loan step, so tests start from a user with a verified loan."""
    c, token = _register(app, sent_otps, **kw)
    link_bajaj(c, token, sent_otps, mobile=kw.get('mobile', '9876543210'),
               loan_no='BFL' + kw.get('mobile', '9876543210')[-7:])
    return c, token


def test_provider_list_comes_from_master_data(app, sent_otps):
    c, token = register(app, sent_otps)
    body = c.get('/v1/cards/providers', headers=auth(token)).json['response']
    codes = [p['code'] for p in body['providers']]
    assert 'BAJAJ' in codes and 'HDFC' in codes and 'SBI' in codes
    bajaj = next(p for p in body['providers'] if p['code'] == 'BAJAJ')
    assert bajaj['provider_type'] == 'NBFC' and bajaj['card_product_name'] == 'Bajaj Finserv Insta EMI Card'
    hdfc = next(p for p in body['providers'] if p['code'] == 'HDFC')
    assert hdfc['logo_url'] == '/banks/hdfc.png' and hdfc['required_identifiers'][0]['key'] == 'last4'
    assert all(p['offers_credit_card'] for p in body['providers'])


def test_master_data_changes_are_reflected(app, sent_otps):
    from portal import db
    from portal.models.card_providers import CardProviders
    c, token = register(app, sent_otps)
    CardProviders.query.filter_by(code='YES').first().status = 'INACTIVE'
    CardProviders.query.filter_by(code='RBL').first().status = 'COMING_SOON'
    db.session.commit()
    providers = c.get('/v1/cards/providers', headers=auth(token)).json['response']['providers']
    codes = {p['code']: p['status'] for p in providers}
    assert 'YES' not in codes and codes['RBL'] == 'COMING_SOON'
    r = c.post('/v1/cards/link/start', json={'provider_code': 'RBL', 'identifiers': {'last4': '1111'}}, headers=auth(token))
    assert r.json['response']['code'] == 'PROVIDER_NOT_AVAILABLE'


def test_link_bajaj_card_with_otp(app, sent_otps):
    c, token = register(app, sent_otps)
    card = link_card(c, token, sent_otps, provider='BAJAJ', last4='9876')
    assert card['provider']['name'] == 'Bajaj Finance' and card['masked_number'] == '•••• 9876'
    assert card['is_primary'] is True and card['verification_method'] == 'MOBILE_OTP'
    assert c.get('/v1/cards', headers=auth(token)).json['response']['cards'][0]['card_id'] == card['card_id']
    status = c.get('/v1/onboarding/status', headers=auth(token)).json['response']
    assert status['steps']['card'] == 'DONE' and status['next_step'] == 'security'


def test_card_requires_bajaj_step(app, sent_otps):
    c, token = _register(app, sent_otps)
    r = c.post('/v1/cards/link/start', json={'provider_code': 'HDFC', 'identifiers': {'last4': '4321'}}, headers=auth(token))
    assert r.status_code == 403 and r.json['response']['missing_steps'] == ['loan']


def test_identifier_validation_and_no_full_card_numbers(app, sent_otps):
    c, token = register(app, sent_otps)
    for bad in ('12', '4111111111111111', 'abcd', ''):
        r = c.post('/v1/cards/link/start', json={'provider_code': 'HDFC', 'identifiers': {'last4': bad}}, headers=auth(token))
        assert r.status_code == 400 and 'last4' in r.json['response']['errors'], bad
    r = c.post('/v1/cards/link/start', json={'provider_code': 'NOPE', 'identifiers': {'last4': '1234'}}, headers=auth(token))
    assert 'provider_code' in r.json['response']['errors']


def test_wrong_otp_then_lockout(app, sent_otps):
    c, token = register(app, sent_otps)
    r = c.post('/v1/cards/link/start', json={'provider_code': 'ICICI', 'identifiers': {'last4': '5555'}}, headers=auth(token))
    attempt = r.json['response']['attempt_id']
    real = sent_otps['+919876543210']
    wrong = '000000' if real != '000000' else '111111'
    for _ in range(4):
        r = c.post('/v1/cards/link/verify', json={'attempt_id': attempt, 'otp': wrong}, headers=auth(token))
        assert r.json['response']['code'] == 'OTP_INVALID'
    r = c.post('/v1/cards/link/verify', json={'attempt_id': attempt, 'otp': wrong}, headers=auth(token))
    assert r.json['response']['code'] == 'LINK_ATTEMPTS_EXCEEDED'
    r = c.post('/v1/cards/link/verify', json={'attempt_id': attempt, 'otp': real}, headers=auth(token))
    assert r.json['response']['code'] == 'LINK_NOT_ACTIVE'
    assert c.get('/v1/cards', headers=auth(token)).json['response']['cards'] == []


def test_duplicate_card_and_remove(app, sent_otps):
    from portal.models.card_link_attempts import CardLinkAttempts
    from portal import db
    c, token = register(app, sent_otps)
    card = link_card(c, token, sent_otps)
    CardLinkAttempts.query.delete(); db.session.commit()          # skip the resend cooldown
    r = c.post('/v1/cards/link/start', json={'provider_code': 'HDFC', 'identifiers': {'last4': '4321'}}, headers=auth(token))
    assert r.json['response']['code'] == 'ALREADY_LINKED'
    assert c.delete(f"/v1/cards/{card['card_id']}", headers=auth(token)).status_code == 200
    assert c.get('/v1/cards', headers=auth(token)).json['response']['cards'] == []


def test_other_users_cards_are_invisible(app, sent_otps):
    c1, t1 = register(app, sent_otps)
    card = link_card(c1, t1, sent_otps)
    c2, t2 = register(app, sent_otps, mobile='9123456780', email='b@example.com')
    assert c2.delete(f"/v1/cards/{card['card_id']}", headers=auth(t2)).status_code == 404
    assert c2.get('/v1/cards', headers=auth(t2)).json['response']['cards'] == []
