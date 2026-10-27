"""Bajaj Finance loan linking (MOBILE_OTP master data) and the lender-API path via a test-only fake lender."""

from tests.conftest import auth, link_bajaj, link_loan, register, use_fake_lender


def _start(c, token, **ids):
    return c.post('/v1/loans/link/start', json={'provider_code': 'BAJAJ_FINANCE', 'identifiers': ids}, headers=auth(token))


def test_bajaj_comes_from_master_data(app, sent_otps):
    c, token = register(app, sent_otps)
    body = c.get('/v1/loans/providers', headers=auth(token)).json['response']
    assert body['configured'] is True
    bajaj = body['providers'][0]
    assert bajaj['code'] == 'BAJAJ_FINANCE' and bajaj['verification_method'] == 'MOBILE_OTP'
    assert [i['key'] for i in bajaj['required_identifiers']] == ['loan_account_number', 'customer_id']


def test_bajaj_requires_loan_number_and_customer_id(app, sent_otps):
    c, token = register(app, sent_otps)
    r = _start(c, token, loan_account_number='BFL4482019')
    assert r.status_code == 400 and 'customer_id' in r.json['response']['errors']
    r = _start(c, token, loan_account_number='12', customer_id='CUST55120')
    assert 'loan_account_number' in r.json['response']['errors']


def test_bajaj_link_with_otp(app, sent_otps):
    c, token = register(app, sent_otps)
    loan = link_bajaj(c, token, sent_otps)
    assert loan['provider_name'] == 'Bajaj Finance' and loan['masked_number'] == '•••• 2019'
    assert loan['outstanding_balance'] is None and loan['emi_amount'] is None       # nothing invented
    assert loan['can_refresh'] is False
    assert 'BFL4482019' not in str(loan) and 'CUST55120' not in str(loan)
    status = c.get('/v1/onboarding/status', headers=auth(token)).json['response']
    assert status['steps']['loan'] == 'DONE' and status['next_step'] == 'card'


def test_bajaj_wrong_otp_and_lockout(app, sent_otps):
    c, token = register(app, sent_otps)
    attempt = _start(c, token, loan_account_number='BFL4482019', customer_id='CUST55120').json['response']['attempt_id']
    real = sent_otps['+919876543210']
    wrong = '000000' if real != '000000' else '111111'
    for _ in range(4):
        r = c.post('/v1/loans/link/verify', json={'attempt_id': attempt, 'code': wrong}, headers=auth(token))
        assert r.json['response']['code'] == 'LENDER_OTP_INVALID'
    r = c.post('/v1/loans/link/verify', json={'attempt_id': attempt, 'code': wrong}, headers=auth(token))
    assert r.json['response']['code'] == 'LINK_ATTEMPTS_EXCEEDED'
    assert c.get('/v1/loans', headers=auth(token)).json['response']['loans'] == []


def test_loan_and_customer_id_not_stored_in_clear(app, sent_otps):
    from portal.models.loan_accounts import LoanAccounts
    c, token = register(app, sent_otps)
    link_bajaj(c, token, sent_otps)
    row = LoanAccounts.query.one()
    blob = row.account_ref_encrypted + row.account_ref_hash + (row.customer_ref_encrypted or '')
    assert 'BFL4482019' not in blob and 'CUST55120' not in blob


def test_bajaj_loan_linked_elsewhere(app, sent_otps):
    c1, t1 = register(app, sent_otps)
    link_bajaj(c1, t1, sent_otps)
    c2, t2 = register(app, sent_otps, mobile='9123456780', email='b@example.com')
    r = _start(c2, t2, loan_account_number='BFL4482019', customer_id='CUST99999')
    assert r.json['response']['code'] == 'LINKED_ELSEWHERE'


def test_refresh_not_available_for_otp_verified_loan(app, sent_otps):
    c, token = register(app, sent_otps)
    loan = link_bajaj(c, token, sent_otps)
    r = c.post(f"/v1/loans/{loan['loan_id']}/refresh", headers=auth(token))
    assert r.status_code == 409 and r.json['response']['code'] == 'REFRESH_NOT_AVAILABLE'


def test_lender_api_path_still_works(app, sent_otps):
    use_fake_lender(app)
    c, token = register(app, sent_otps)
    loan = link_loan(c, token)
    assert loan['masked_number'] == '•••• 5678' and loan['outstanding_balance'] == '312450.75'
    assert loan['can_refresh'] is True
