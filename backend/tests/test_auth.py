from tests.conftest import H, auth, register, onboarded


def test_otp_send_validates_mobile(app, sent_otps):
    r = app.test_client().post('/v1/authentication/otp/send', json={'mobile_number': '12345'})
    assert r.status_code == 400
    assert r.json['response']['code'] == 'VALIDATION_ERROR'


def test_otp_resend_cooldown(app, sent_otps):
    c = app.test_client()
    assert c.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'}).status_code == 200
    r = c.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
    assert r.status_code == 429 and r.json['response']['code'] == 'OTP_COOLDOWN'


def test_wrong_otp_counts_attempts_and_locks(app, sent_otps):
    c = app.test_client()
    c.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
    real = sent_otps['+919876543210']
    wrong = '000000' if real != '000000' else '111111'
    for i in range(4):
        r = c.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210', 'otp_code': wrong})
        assert r.json['response']['code'] == 'OTP_INVALID'
    r = c.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210', 'otp_code': wrong})
    assert r.json['response']['attempts_remaining'] == 0
    # The real code no longer works once the OTP is burned.
    r = c.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210', 'otp_code': real})
    assert r.status_code == 400 and r.json['response']['code'] == 'OTP_NOT_FOUND'


def test_registration_creates_account_with_profile(app, sent_otps):
    c, token = register(app, sent_otps)
    me = c.get('/v1/authentication/me', headers=auth(token)).json['response']
    assert me['full_name'] == 'Asha Rao'
    assert me['email'] == 'as•••@example.com'          # masked
    assert me['onboarding']['steps']['account'] == 'DONE'
    assert me['onboarding']['next_step'] == 'loan'


def test_registration_rejects_bad_email_before_using_otp(app, sent_otps):
    c = app.test_client()
    c.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
    code = sent_otps['+919876543210']
    r = c.post('/v1/authentication/otp/verify',
               json={'mobile_number': '9876543210', 'otp_code': code, 'full_name': 'Asha', 'email': 'nope'})
    assert r.status_code == 400 and 'email' in r.json['response']['errors']
    # OTP was not consumed by the rejected request.
    r = c.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210', 'otp_code': code,
                                                      'full_name': 'Asha Rao', 'email': 'asha@example.com'})
    assert r.status_code == 200


def test_returning_user_with_mpin_gets_locked_session(app, sent_otps):
    onboarded(app, sent_otps)
    # Second device signs in with OTP: must unlock with MPIN before any API works.
    c2 = app.test_client()
    from portal.models.otp_verifications import OTPVerifications
    from portal import db
    OTPVerifications.query.delete()          # bypass the resend cooldown for this test
    db.session.commit()
    c2.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
    r = c2.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210',
                                                       'otp_code': sent_otps['+919876543210'],
                                                       'full_name': 'Someone Else', 'email': 'x@example.com'})
    body = r.json['response']
    assert body['requires_unlock'] is True and 'access_token' not in body
    assert body['user']['full_name'] == 'Asha Rao'      # sign-in never overwrites the profile

    r = c2.post('/v1/authentication/unlock', json={'mpin': '1111'}, headers=H)
    assert r.status_code == 401 and r.json['response']['code'] == 'MPIN_INVALID'
    r = c2.post('/v1/authentication/unlock', json={'mpin': '4826'}, headers=H)
    assert r.status_code == 200 and r.json['response']['access_token']


def test_mpin_lockout_ends_all_sessions(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    # Lock the session (simulate idle) and then guess wrong MPINs.
    from portal.models.user_sessions import UserSessions
    from portal import db
    from datetime import timedelta
    s = UserSessions.query.first()
    s.last_active_at = s.last_active_at - timedelta(days=1)
    db.session.commit()
    assert c.get('/v1/authentication/me', headers=auth(token)).json['response']['code'] == 'APP_LOCKED'
    for _ in range(4):
        r = c.post('/v1/authentication/unlock', json={'mpin': '9999'}, headers=H)
        assert r.json['response']['code'] == 'MPIN_INVALID'
    r = c.post('/v1/authentication/unlock', json={'mpin': '9999'}, headers=H)
    assert r.json['response']['code'] == 'SESSION_ENDED'
    r = c.post('/v1/authentication/unlock', json={'mpin': '4826'}, headers=H)
    assert r.status_code == 401                          # correct MPIN no longer helps: OTP required


def test_refresh_requires_csrf_header(app, sent_otps):
    c, _ = register(app, sent_otps)
    assert c.post('/v1/authentication/refresh').json['response']['code'] == 'CSRF_CHECK_FAILED'
    assert c.post('/v1/authentication/refresh', headers=H).status_code == 200


def test_logout_revokes_session(app, sent_otps):
    c, token = register(app, sent_otps)
    assert c.post('/v1/authentication/logout', headers=H).status_code == 200
    r = c.get('/v1/authentication/me', headers=auth(token))
    assert r.status_code == 401 and r.json['response']['code'] == 'SESSION_ENDED'


def test_protected_routes_need_auth(app):
    c = app.test_client()
    for path in ('/v1/authentication/me', '/v1/loans', '/v1/payments', '/v1/onboarding/status', '/v1/cards'):
        assert c.get(path).status_code == 401
