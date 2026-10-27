"""APIs behind the dashboard sections: Settings (preferences, sessions), Cards (primary),
Scanner (QR history), History (status filter) and email alerts."""

import pytest

from tests.conftest import H, auth, link_card, onboarded, register


@pytest.fixture
def mails(monkeypatch):
    box = []
    monkeypatch.setattr('portal.helpers.notify.send_email', lambda to, subject, body: box.append((to, subject)) or True)
    return box


def test_notification_preferences(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    me = c.get('/v1/authentication/me', headers=auth(token)).json['response']
    assert me['notifications']['payment_alerts'] is True and me['notifications']['login_alerts'] is True
    r = c.patch('/v1/authentication/preferences', json={'payment_alerts': False}, headers=auth(token))
    assert r.json['response']['notifications']['payment_alerts'] is False
    assert r.json['response']['notifications']['login_alerts'] is True
    r = c.patch('/v1/authentication/preferences', json={'login_alerts': 'yes'}, headers=auth(token))
    assert r.status_code == 400


def test_login_alert_respects_preference(app, sent_otps, mails):
    c, token = onboarded(app, sent_otps)
    from portal import db
    from portal.models.otp_verifications import OTPVerifications

    def sign_in():
        OTPVerifications.query.delete(); db.session.commit()
        c2 = app.test_client()
        c2.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
        c2.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210',
                                                       'otp_code': sent_otps['+919876543210']})
    sign_in()
    assert mails and mails[-1][0] == 'asha@example.com' and 'sign-in' in mails[-1][1]
    c.patch('/v1/authentication/preferences', json={'login_alerts': False}, headers=auth(token))
    n = len(mails)
    sign_in()
    assert len(mails) == n


def test_sessions_list_and_revoke_others(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    from portal import db
    from portal.models.otp_verifications import OTPVerifications
    OTPVerifications.query.delete(); db.session.commit()
    other = app.test_client()
    other.post('/v1/authentication/otp/send', json={'mobile_number': '9876543210'})
    other.post('/v1/authentication/otp/verify', json={'mobile_number': '9876543210', 'otp_code': sent_otps['+919876543210']})
    sessions = c.get('/v1/security/settings', headers=auth(token)).json['response']['sessions']
    assert len(sessions) == 2 and sum(s['current'] for s in sessions) == 1
    r = c.post('/v1/security/sessions/revoke-others', headers=auth(token))
    assert r.json['response']['revoked'] == 1
    assert other.post('/v1/authentication/unlock', json={'mpin': '4826'}, headers=H).status_code == 401
    assert c.get('/v1/authentication/me', headers=auth(token)).status_code == 200


def test_make_card_primary(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    from portal import db
    from portal.models.card_link_attempts import CardLinkAttempts
    CardLinkAttempts.query.delete(); db.session.commit()      # skip resend cooldown
    second = link_card(c, token, sent_otps, provider='AXIS', last4='1111')
    assert second['is_primary'] is False
    r = c.post(f"/v1/cards/{second['card_id']}/primary", headers=auth(token))
    assert r.json['response']['card']['is_primary'] is True
    cards = c.get('/v1/cards', headers=auth(token)).json['response']['cards']
    assert [x['is_primary'] for x in cards].count(True) == 1 and cards[0]['card_id'] == second['card_id']


def test_scanner_history(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    r = c.post('/v1/scan/payments', json={'payee_vpa': 'shop@okaxis', 'payee_name': 'Corner Shop', 'amount': '120.50',
                                          'merchant_code': '5411'}, headers=auth(token))
    assert r.status_code == 201 and r.json['response']['payment']['status'] == 'HANDED_OFF'
    for bad in ({'payee_vpa': 'not a vpa'}, {'payee_vpa': 'a@b', 'amount': '-1'}, {'payee_vpa': 'shop@okaxis', 'amount': '1.234'}):
        assert c.post('/v1/scan/payments', json=bad, headers=auth(token)).status_code == 400
    rows = c.get('/v1/scan/payments', headers=auth(token)).json['response']['payments']
    assert len(rows) == 1 and rows[0]['payee_name'] == 'Corner Shop' and rows[0]['is_merchant'] is True


def test_scanner_requires_completed_registration(app, sent_otps):
    c, token = register(app, sent_otps)
    assert c.get('/v1/scan/payments', headers=auth(token)).status_code == 403


def test_profile_name_change_keeps_verified_email(app, sent_otps):
    c, token = onboarded(app, sent_otps)
    r = c.patch('/v1/authentication/me', json={'full_name': 'Asha R Rao'}, headers=auth(token))
    body = r.json['response']
    assert r.status_code == 200 and body['full_name'] == 'Asha R Rao' and body['email_verified'] is True
    assert body['onboarding']['complete'] is True
