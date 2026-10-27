"""MPIN and biometric (WebAuthn) enrolment.

The MPIN is required — it is the fallback on every device. Biometric unlock is an
optional extra that can be added only once an MPIN exists. No biometric data ever
reaches the server: the device keeps the private key and the fingerprint/face
check; the server stores a public key and verifies signatures."""

from flask import current_app, g, request
from flask_restx import Resource

from portal import db
from portal.extensions import limiter
from portal.helpers import webauthn_helper
from portal.helpers.audit import audit
from portal.helpers.auth import auth_required, clear_refresh_cookie, current_user, revoke_all_sessions, step_required
from portal.helpers.mpin import check_mpin, hash_mpin
from portal.helpers.onboarding import mark_complete_if_done
from portal.helpers.responses import fail, ok, server_error
from portal.helpers.validators import Validator, clean_text, validate_mpin
from portal.models.base import iso, utcnow
from portal.models.webauthn_credentials import WebAuthnCredentials

from . import ns, logger


def _json():
    return request.get_json(silent=True) or {}


@ns.route('/settings')
class SecuritySettings(Resource):
    @ns.doc(description='MPIN status and enrolled biometric devices.')
    @auth_required
    def get(self):
        user = current_user()
        return ok({
            'has_mpin': bool(user.mpin_hash),
            'mpin_set_at': iso(user.mpin_set_at),
            'idle_lock_minutes': current_app.config['SESSION_IDLE_LOCK_MINUTES'],
            'biometrics': [{'id': c.credential_pk, 'label': c.label or 'This device',
                            'created_on': iso(c.created_on), 'last_used_on': iso(c.last_used_on)}
                           for c in user.webauthn_credentials.all()],
        })


@ns.route('/mpin')
class Mpin(Resource):
    @ns.doc(description='Create the 4-digit MPIN (onboarding: after a card is linked) or change it '
                        '(requires current_mpin). Body: new_mpin, confirm_mpin[, current_mpin].')
    @limiter.limit('10 per minute')
    @step_required('account', 'loan', 'card')
    def post(self):
        try:
            user = current_user()
            body = _json()
            if user.mpin_hash:
                if not check_mpin(user.mpin_hash, str(body.get('current_mpin') or '')[:8]):
                    user.mpin_failed_attempts += 1
                    remaining = current_app.config['MPIN_MAX_ATTEMPTS'] - user.mpin_failed_attempts
                    if remaining <= 0:
                        revoke_all_sessions(user.user_id, 'MPIN_ATTEMPTS_EXCEEDED')
                        user.mpin_failed_attempts = 0
                        db.session.commit()
                        audit('MPIN_LOCKOUT', user.user_id, status='FAILED')
                        resp = fail('Too many wrong MPIN attempts. Please sign in again with OTP.', 401,
                                    code='SESSION_ENDED')
                        clear_refresh_cookie(resp)
                        return resp
                    db.session.commit()
                    audit('MPIN_CHANGE', user.user_id, status='FAILED')
                    return fail('Current MPIN is incorrect.', 400, code='MPIN_INVALID', attempts_remaining=remaining,
                                errors={'current_mpin': 'Current MPIN is incorrect.'})

            v = Validator()
            mpin, e = validate_mpin(body.get('new_mpin'))
            v.check('new_mpin', e)
            if mpin and str(body.get('confirm_mpin') or '') != mpin:
                v.check('confirm_mpin', 'The two MPINs do not match.')
            if mpin and user.mpin_hash and check_mpin(user.mpin_hash, mpin):
                v.check('new_mpin', 'Choose an MPIN different from your current one.')
            if not v.ok:
                return v.response()

            first_time = not user.mpin_hash
            user.mpin_hash = hash_mpin(mpin)
            user.mpin_set_at = utcnow()
            user.mpin_failed_attempts = 0
            mark_complete_if_done(user)
            db.session.commit()
            audit('MPIN_SET' if first_time else 'MPIN_CHANGE', user.user_id)
            return ok({'message': 'MPIN saved.', 'has_mpin': True}, 201 if first_time else 200)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'mpin')


@ns.route('/webauthn/register/options')
class BiometricRegisterOptions(Resource):
    @ns.doc(description='Begin fingerprint / Face ID enrolment on this device (requires an MPIN).')
    @limiter.limit('10 per minute')
    @auth_required
    def post(self):
        try:
            user = current_user()
            if not user.mpin_hash:
                return fail('Create your MPIN before enabling biometrics.', 400, code='MPIN_NOT_SET')
            opts = webauthn_helper.registration_options(user, g.session, user.webauthn_credentials.all())
            db.session.commit()
            return ok({'options': opts})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'webauthn/register/options')


@ns.route('/webauthn/register/verify')
class BiometricRegisterVerify(Resource):
    @ns.doc(description='Finish biometric enrolment with the attestation from the device.')
    @limiter.limit('10 per minute')
    @auth_required
    def post(self):
        try:
            user = current_user()
            if not user.mpin_hash:
                return fail('Create your MPIN before enabling biometrics.', 400, code='MPIN_NOT_SET')
            body = _json()
            try:
                cred_id, pub, count = webauthn_helper.verify_registration(g.session, body.get('credential') or {})
            except Exception as e:
                db.session.commit()          # challenge consumed
                logger.info(f'[webauthn] registration rejected: {e.__class__.__name__}')
                return fail('Biometric setup could not be verified. Please try again.', 400,
                            code='BIOMETRIC_SETUP_FAILED')
            if WebAuthnCredentials.query.filter_by(credential_id=cred_id).first():
                return fail('This device is already enrolled.', 409, code='DUPLICATE')
            label = clean_text(body.get('label'))[:60] or 'This device'
            db.session.add(WebAuthnCredentials(user_id=user.user_id, credential_id=cred_id,
                                               public_key=pub, sign_count=count, label=label))
            db.session.commit()
            audit('BIOMETRIC_ENROLLED', user.user_id)
            return ok({'message': 'Biometric unlock enabled.'}, 201)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'webauthn/register/verify')


@ns.route('/webauthn/<int:credential_pk>')
class BiometricCredential(Resource):
    @ns.doc(description='Remove an enrolled biometric device.')
    @auth_required
    def delete(self, credential_pk):
        user = current_user()
        c = WebAuthnCredentials.query.filter_by(credential_pk=credential_pk, user_id=user.user_id).first()
        if not c:
            return fail('Not found.', 404, code='NOT_FOUND')
        db.session.delete(c)
        db.session.commit()
        audit('BIOMETRIC_REMOVED', user.user_id)
        return ok({'message': 'Biometric device removed.'})
