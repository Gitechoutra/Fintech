"""
Mobile-number registration/login with SMS OTP, session refresh, app unlock
(MPIN or biometric) and logout.

Flow:  /otp/send → /otp/verify (creates the account on first login with the name
and email from the registration form, starts a session, sets the refresh cookie).
A returning user who has an MPIN gets a LOCKED session from /otp/verify and must
/unlock (MPIN) or /webauthn/verify (biometric) — OTP proves the phone, the MPIN
proves the person. On every app open the SPA calls /session, then unlocks.
"""

import secrets
from datetime import timedelta

from flask import current_app, request
from flask_restx import Resource
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from portal import db
from portal.extensions import limiter
from portal.helpers import webauthn_helper
from portal.helpers.audit import audit
from portal.helpers.auth import (
    auth_required, clear_refresh_cookie, create_session, current_user, is_locked,
    issue_access_token, revoke_all_sessions, revoke_session, rotate_refresh, session_from_cookie,
    set_refresh_cookie,
)
from portal.helpers.email import email_configured, send_verification_email
from portal.helpers.mpin import check_mpin
from portal.helpers.onboarding import mark_complete_if_done, status_for
from portal.helpers.responses import fail, ok, server_error
from portal.helpers.sms import send_otp_sms, sms_configured
from portal.helpers.validators import Validator, normalize_mobile, validate_email, validate_name, validate_otp
from portal.models.base import iso, utcnow
from portal.models.email_verifications import EmailVerifications, EmailVerificationStatus
from portal.models.otp_verifications import OTPVerifications, OTPPurpose, OTPStatus
from portal.models.users import Users, UserStatus
from portal.models.webauthn_credentials import WebAuthnCredentials

from . import ns, logger


def _json():
    return request.get_json(silent=True) or {}


def user_payload(user):
    return {
        'user_id': user.public_id,
        'full_name': user.full_name,
        'email': user.masked_email,
        'email_verified': user.email_verified_at is not None,
        'mobile_number': user.masked_mobile,
        'has_mpin': bool(user.mpin_hash),
        'biometric_enabled': user.webauthn_credentials.count() > 0,
        'created_on': iso(user.created_on),
        'onboarding': status_for(user),
    }


def _lock_payload(user):
    """What the lock screen may show before the user has proved who they are."""
    return {'full_name': user.full_name, 'mobile_number': user.masked_mobile,
            'has_mpin': bool(user.mpin_hash), 'biometric_enabled': user.webauthn_credentials.count() > 0}


def _session_response(user, session, raw_refresh, extra=None, status=200):
    body = {'access_token': issue_access_token(user, session),
            'expires_in': int(current_app.config['JWT_ACCESS_TOKEN_EXPIRES'].total_seconds()),
            'user': user_payload(user)}
    body.update(extra or {})
    resp = ok(body, status)
    set_refresh_cookie(resp, raw_refresh)
    return resp


# ── OTP: send ───────────────────────────────────────────────────────────────

@ns.route('/otp/send')
class SendOTP(Resource):
    @ns.doc(description='Send a 6-digit registration/login OTP to an Indian mobile number.')
    @limiter.limit('5 per minute')
    def post(self):
        try:
            mobile, err = normalize_mobile(_json().get('mobile_number'))
            if err:
                return fail(err, 400, code='VALIDATION_ERROR', errors={'mobile_number': err})
            if not sms_configured():
                return fail('OTP sign-in is not available: no SMS provider is configured.', 503,
                            code='OTP_PROVIDER_NOT_CONFIGURED')

            cfg = current_app.config
            now = utcnow()
            last = (OTPVerifications.query.filter_by(mobile_number=mobile)
                    .order_by(OTPVerifications.created_on.desc()).first())
            if last and (now - last.created_on).total_seconds() < cfg['OTP_RESEND_COOLDOWN_SECONDS']:
                wait = cfg['OTP_RESEND_COOLDOWN_SECONDS'] - int((now - last.created_on).total_seconds())
                return fail(f'Please wait {wait}s before requesting another OTP.', 429,
                            code='OTP_COOLDOWN', retry_after=wait)
            # Hourly limit: only codes that were requested but never used count, plus an absolute ceiling.
            hour_ago = now - timedelta(hours=1)
            recent = OTPVerifications.query.filter(OTPVerifications.mobile_number == mobile,
                                                   OTPVerifications.created_on >= hour_ago)
            unused = recent.filter(OTPVerifications.status != OTPStatus.VERIFIED)
            if unused.count() >= cfg['OTP_MAX_PER_HOUR'] or recent.count() >= cfg['OTP_ABSOLUTE_MAX_PER_HOUR']:
                oldest = (unused.order_by(OTPVerifications.created_on.asc()).first()
                          or recent.order_by(OTPVerifications.created_on.asc()).first())
                mins = max(1, int((oldest.created_on + timedelta(hours=1) - now).total_seconds() // 60) + 1)
                return fail(f'Too many OTP requests for this number. Try again in {mins} minute(s).', 429,
                            code='OTP_LIMIT', retry_after=mins * 60)

            OTPVerifications.query.filter_by(mobile_number=mobile, status=OTPStatus.PENDING) \
                .update({'status': OTPStatus.SUPERSEDED})
            code = f'{secrets.randbelow(10 ** cfg["OTP_LENGTH"]):0{cfg["OTP_LENGTH"]}d}'
            otp = OTPVerifications(
                mobile_number=mobile, otp_hash=generate_password_hash(code), purpose=OTPPurpose.LOGIN,
                max_attempts=cfg['OTP_MAX_ATTEMPTS'], expires_at=now + timedelta(seconds=cfg['OTP_TTL_SECONDS']),
                ip_address=(request.remote_addr or '')[:64])
            db.session.add(otp)
            db.session.commit()

            result = send_otp_sms(mobile, code)
            if not result['success']:
                otp.status = OTPStatus.FAILED
                db.session.commit()
                return fail('Could not send the OTP. Please try again.', 502, code='OTP_SEND_FAILED')

            body = {'message': 'OTP sent.', 'mobile_number': mobile[:3] + ' ••••• ' + mobile[-4:],
                    'expires_in': cfg['OTP_TTL_SECONDS'],
                    'resend_after': cfg['OTP_RESEND_COOLDOWN_SECONDS'],
                    'dev_console_otp': result['provider'] == 'console'}
            # Development only: with the console SMS provider (refused when APP_ENV=PROD) the OTP is
            # returned so the screen can show it. With a real SMS provider it is NEVER returned.
            if result['provider'] == 'console' and cfg['APP_ENV'] != 'PROD':
                body['dev_otp'] = code
            return ok(body)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'otp/send')


# ── OTP: verify → register / login ──────────────────────────────────────────

@ns.route('/otp/verify')
class VerifyOTP(Resource):
    @ns.doc(description='Verify the OTP. Creates the account on first login (optional full_name / email '
                        'from the registration form), starts a session (refresh token in an httpOnly '
                        'cookie) and returns an access token — or a locked session when an MPIN is set.')
    @limiter.limit('10 per minute')
    def post(self):
        try:
            body = _json()
            v = Validator()
            mobile, e = normalize_mobile(body.get('mobile_number'))
            v.check('mobile_number', e)
            code, e = validate_otp(body.get('otp_code'))
            v.check('otp_code', e)
            name, e = validate_name(body.get('full_name'))
            v.check('full_name', e)
            email, e = validate_email(body.get('email'))
            v.check('email', e)
            if not v.ok:
                return v.response()

            otp = (OTPVerifications.query.filter_by(mobile_number=mobile, status=OTPStatus.PENDING)
                   .order_by(OTPVerifications.created_on.desc()).first())
            if not otp:
                return fail('No active OTP. Please request a new one.', 400, code='OTP_NOT_FOUND')
            if utcnow() > otp.expires_at:
                otp.status = OTPStatus.EXPIRED
                db.session.commit()
                return fail('OTP expired. Please request a new one.', 400, code='OTP_EXPIRED')

            otp.attempts += 1
            if not check_password_hash(otp.otp_hash, code):
                remaining = otp.max_attempts - otp.attempts
                if remaining <= 0:
                    otp.status = OTPStatus.FAILED
                db.session.commit()
                return fail('Incorrect OTP.' if remaining > 0 else 'Too many wrong attempts. Request a new OTP.',
                            400, code='OTP_INVALID', attempts_remaining=max(remaining, 0))

            otp.status = OTPStatus.VERIFIED
            otp.verified_at = utcnow()

            user = Users.query.filter_by(mobile_number=mobile).first()
            is_new = user is None
            if is_new:
                # Details from the registration form are applied only when creating the account —
                # a sign-in never overwrites an existing profile.
                email_taken = bool(email and Users.query.filter_by(email=email).first())
                user = Users(mobile_number=mobile, status=UserStatus.ACTIVE, full_name=name,
                             email=None if email_taken else email)
                db.session.add(user)
                db.session.flush()
            elif user.status != UserStatus.ACTIVE:
                db.session.commit()
                return fail('This account is suspended. Contact support.', 403, code='ACCOUNT_INACTIVE')

            user.last_login = utcnow()
            session, raw = create_session(user)
            requires_unlock = bool(user.mpin_hash)
            if requires_unlock:
                # The session stays locked (refused by every API) until MPIN / biometric unlock.
                session.last_active_at = utcnow() - timedelta(days=1)
            db.session.commit()
            audit('USER_REGISTERED' if is_new else 'USER_LOGIN', user.user_id, 'SESSION', session.public_id)

            if requires_unlock:
                resp = ok({'requires_unlock': True, 'is_new_user': False, 'user': _lock_payload(user)})
                set_refresh_cookie(resp, raw)
                return resp
            return _session_response(user, session, raw, {'is_new_user': is_new, 'requires_unlock': False})
        except IntegrityError:
            db.session.rollback()
            return fail('This mobile number was just registered. Please try again.', 409, code='CONFLICT')
        except Exception:
            db.session.rollback()
            return server_error(logger, 'otp/verify')


# ── Session on this device ──────────────────────────────────────────────────

@ns.route('/session')
class DeviceSession(Resource):
    @ns.doc(description='Is there a signed-in session on this device (refresh cookie)? '
                        'Used on app open to decide between the lock screen and sign-in.')
    def get(self):
        session, err = session_from_cookie()
        if err:
            return ok({'has_session': False})
        return ok({'has_session': True, 'idle_locked': is_locked(session), 'user': _lock_payload(session.user)})


@ns.route('/refresh')
class Refresh(Resource):
    @ns.doc(description='Silently renew the access token while the app is in use. '
                        'Refused once the session is idle-locked.')
    @limiter.limit('30 per minute')
    def post(self):
        try:
            session, err = session_from_cookie()
            if err:
                return err
            if is_locked(session):
                if not session.user.mpin_hash:
                    revoke_session(session, 'IDLE_NO_MPIN')
                    db.session.commit()
                    return fail('Session ended. Please sign in again.', 401, code='SESSION_ENDED')
                return fail('App locked. Unlock with your MPIN.', 401, code='APP_LOCKED')
            raw = rotate_refresh(session)
            session.last_active_at = utcnow()
            db.session.commit()
            return _session_response(session.user, session, raw)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'refresh')


def _unlock_success(session, method):
    user = session.user
    user.mpin_failed_attempts = 0
    session.last_active_at = utcnow()
    raw = rotate_refresh(session)
    db.session.commit()
    audit('APP_UNLOCK', user.user_id, 'SESSION', session.public_id, details={'method': method})
    return _session_response(user, session, raw)


@ns.route('/unlock')
class UnlockWithMpin(Resource):
    @ns.doc(description='Unlock the app on this device with the 4-digit MPIN. Too many wrong MPINs '
                        'sign out every device; the user must then verify by OTP again.')
    @limiter.limit('10 per minute')
    def post(self):
        try:
            session, err = session_from_cookie()
            if err:
                return err
            user = session.user
            if not user.mpin_hash:
                return fail('No MPIN set. Please sign in with OTP.', 400, code='MPIN_NOT_SET')
            if check_mpin(user.mpin_hash, str(_json().get('mpin') or '')[:8]):
                return _unlock_success(session, 'MPIN')

            user.mpin_failed_attempts += 1
            remaining = current_app.config['MPIN_MAX_ATTEMPTS'] - user.mpin_failed_attempts
            if remaining <= 0:
                revoke_all_sessions(user.user_id, 'MPIN_ATTEMPTS_EXCEEDED')
                user.mpin_failed_attempts = 0
                db.session.commit()
                audit('MPIN_LOCKOUT', user.user_id, status='FAILED')
                resp = fail('Too many wrong MPIN attempts. For your security, please sign in again with OTP.',
                            401, code='SESSION_ENDED')
                clear_refresh_cookie(resp)
                return resp
            db.session.commit()
            return fail('Incorrect MPIN.', 401, code='MPIN_INVALID', attempts_remaining=remaining)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'unlock')


@ns.route('/webauthn/options')
class BiometricUnlockOptions(Resource):
    @ns.doc(description='Get a WebAuthn challenge to unlock with fingerprint / Face ID.')
    @limiter.limit('20 per minute')
    def post(self):
        try:
            session, err = session_from_cookie()
            if err:
                return err
            creds = session.user.webauthn_credentials.all()
            if not creds:
                return fail('Biometric unlock is not set up on this account.', 400, code='BIOMETRIC_NOT_SET')
            opts = webauthn_helper.authentication_options(session, creds)
            db.session.commit()
            return ok({'options': opts})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'webauthn/options')


@ns.route('/webauthn/verify')
class BiometricUnlockVerify(Resource):
    @ns.doc(description='Verify the WebAuthn assertion and unlock.')
    @limiter.limit('20 per minute')
    def post(self):
        try:
            session, err = session_from_cookie()
            if err:
                return err
            credential = _json().get('credential') or {}
            stored = WebAuthnCredentials.query.filter_by(
                user_id=session.user_id, credential_id=str(credential.get('id', ''))[:512]).first()
            if not stored:
                webauthn_helper._pop_challenge(session)
                db.session.commit()
                return fail('This device key is not registered.', 401, code='BIOMETRIC_FAILED')
            try:
                stored.sign_count = webauthn_helper.verify_authentication(session, credential, stored)
            except Exception as e:
                db.session.commit()          # challenge already consumed
                logger.info(f'[webauthn] assertion rejected: {e.__class__.__name__}')
                return fail('Biometric verification failed. Use your MPIN.', 401, code='BIOMETRIC_FAILED')
            stored.last_used_on = utcnow()
            return _unlock_success(session, 'BIOMETRIC')
        except Exception:
            db.session.rollback()
            return server_error(logger, 'webauthn/verify')


@ns.route('/logout')
class Logout(Resource):
    @ns.doc(description='Sign out on this device: revokes the session and clears the cookie.')
    def post(self):
        try:
            session, err = session_from_cookie()
            if session:
                revoke_session(session, 'LOGOUT')
                db.session.commit()
                audit('USER_LOGOUT', session.user_id, 'SESSION', session.public_id)
            resp = ok({'message': 'Signed out.'})
            clear_refresh_cookie(resp)
            return resp
        except Exception:
            db.session.rollback()
            return server_error(logger, 'logout')


# ── Profile ─────────────────────────────────────────────────────────────────

@ns.route('/me')
class Me(Resource):
    @ns.doc(description='Current user profile and onboarding state.')
    @auth_required
    def get(self):
        return ok(user_payload(current_user()))

    @ns.doc(description='Complete or update the account details (full name, email).')
    @limiter.limit('20 per minute')
    @auth_required
    def patch(self):
        try:
            body = _json()
            user = current_user()
            v = Validator()
            name, e = validate_name(body.get('full_name'), required=True)
            v.check('full_name', e)
            email, e = validate_email(body.get('email'), required=True)
            v.check('email', e)
            if not v.ok:
                return v.response()
            other = Users.query.filter(Users.email == email, Users.user_id != user.user_id).first()
            if other:
                return fail('This email address is already used by another account.', 409, code='EMAIL_IN_USE',
                            errors={'email': 'This email address is already used by another account.'})
            if email != user.email:
                user.email_verified_at = None          # a new address must be verified again
            user.full_name, user.email = name, email
            db.session.commit()
            audit('PROFILE_UPDATED', user.user_id)
            return ok(user_payload(user))
        except IntegrityError:
            db.session.rollback()
            return fail('This email address is already used by another account.', 409, code='EMAIL_IN_USE',
                        errors={'email': 'This email address is already used by another account.'})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'me/patch')


# ── Email verification ──────────────────────────────────────────────────────

@ns.route('/email/send')
class SendEmailOTP(Resource):
    @ns.doc(description="Send a 6-digit code to the user's email address.")
    @limiter.limit('5 per minute')
    @auth_required
    def post(self):
        try:
            user = current_user()
            cfg = current_app.config
            if not user.email:
                return fail('Add your email address first.', 400, code='EMAIL_MISSING')
            if user.email_verified_at:
                return fail('Your email address is already verified.', 409, code='ALREADY_VERIFIED')
            if not email_configured():
                return fail('Email verification is not available: no email provider is configured.', 503,
                            code='EMAIL_PROVIDER_NOT_CONFIGURED')
            now = utcnow()
            q = EmailVerifications.query.filter_by(user_id=user.user_id)
            last = q.order_by(EmailVerifications.created_on.desc()).first()
            if last and (now - last.created_on).total_seconds() < cfg['OTP_RESEND_COOLDOWN_SECONDS']:
                wait = cfg['OTP_RESEND_COOLDOWN_SECONDS'] - int((now - last.created_on).total_seconds())
                return fail(f'Please wait {wait}s before requesting another code.', 429,
                            code='OTP_COOLDOWN', retry_after=wait)
            if q.filter(EmailVerifications.created_on >= now - timedelta(hours=1)).count() >= cfg['OTP_MAX_PER_HOUR']:
                return fail('Too many codes requested. Please try again later.', 429, code='OTP_LIMIT')

            EmailVerifications.query.filter_by(user_id=user.user_id, status=EmailVerificationStatus.PENDING)                 .update({'status': EmailVerificationStatus.SUPERSEDED})
            code = f'{secrets.randbelow(10 ** cfg["OTP_LENGTH"]):0{cfg["OTP_LENGTH"]}d}'
            ev = EmailVerifications(user_id=user.user_id, email=user.email, otp_hash=generate_password_hash(code),
                                    max_attempts=cfg['OTP_MAX_ATTEMPTS'],
                                    expires_at=now + timedelta(seconds=cfg['OTP_TTL_SECONDS']))
            db.session.add(ev)
            db.session.commit()

            result = send_verification_email(user.email, code)
            if not result['success']:
                ev.status = EmailVerificationStatus.FAILED
                db.session.commit()
                return fail('Could not send the email. Please try again.', 502, code='EMAIL_SEND_FAILED')
            body = {'message': 'Code sent.', 'email': user.masked_email, 'expires_in': cfg['OTP_TTL_SECONDS'],
                    'resend_after': cfg['OTP_RESEND_COOLDOWN_SECONDS'],
                    'dev_console_otp': result['provider'] == 'console'}
            # Development only (console email provider, refused in PROD): show the code on screen.
            if result['provider'] == 'console' and cfg['APP_ENV'] != 'PROD':
                body['dev_otp'] = code
            return ok(body)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'email/send')


@ns.route('/email/verify')
class VerifyEmailOTP(Resource):
    @ns.doc(description='Verify the email code. Body: otp.')
    @limiter.limit('10 per minute')
    @auth_required
    def post(self):
        try:
            user = current_user()
            code, err = validate_otp(_json().get('otp'))
            if err:
                return fail(err, 400, code='VALIDATION_ERROR', errors={'otp': err})
            ev = (EmailVerifications.query.filter_by(user_id=user.user_id, email=user.email,
                                                     status=EmailVerificationStatus.PENDING)
                  .order_by(EmailVerifications.created_on.desc()).first())
            if not ev:
                return fail('No active code. Please request a new one.', 400, code='OTP_NOT_FOUND')
            if utcnow() > ev.expires_at:
                ev.status = EmailVerificationStatus.EXPIRED
                db.session.commit()
                return fail('Code expired. Please request a new one.', 400, code='OTP_EXPIRED')
            ev.attempts += 1
            if not check_password_hash(ev.otp_hash, code):
                remaining = ev.max_attempts - ev.attempts
                if remaining <= 0:
                    ev.status = EmailVerificationStatus.FAILED
                db.session.commit()
                return fail('Incorrect code.' if remaining > 0 else 'Too many wrong attempts. Request a new code.',
                            400, code='OTP_INVALID', attempts_remaining=max(remaining, 0))
            ev.status, ev.verified_at = EmailVerificationStatus.VERIFIED, utcnow()
            user.email_verified_at = utcnow()
            mark_complete_if_done(user)
            db.session.commit()
            audit('EMAIL_VERIFIED', user.user_id)
            return ok(user_payload(user))
        except Exception:
            db.session.rollback()
            return server_error(logger, 'email/verify')
