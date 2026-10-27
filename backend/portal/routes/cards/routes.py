"""
Credit-card linking.

    GET  /providers    banks / NBFCs from the card_providers master data
    POST /link/start   chosen provider + required identifiers (e.g. last 4 digits)
                       → an OTP is sent to the user's verified mobile number
    POST /link/verify  the OTP → the card is linked

Verification is an OTP to the mobile number the user already verified, so the
linked card is labelled "verified by mobile OTP" — it is not a confirmation from
the bank. Only display-safe identifiers are accepted and stored: never a full
card number or CVV.
"""

import re
import secrets
from datetime import timedelta

from flask import current_app, request
from flask_restx import Resource
from werkzeug.security import check_password_hash, generate_password_hash

from portal import db
from portal.extensions import limiter
from portal.helpers.audit import audit
from portal.helpers.auth import auth_required, current_user, step_required
from portal.helpers.onboarding import mark_complete_if_done
from portal.helpers.responses import fail, ok, server_error
from portal.helpers.saved_cards import forget_card_token
from portal.helpers.sms import send_otp_sms, sms_configured
from portal.helpers.validators import validate_otp
from portal.models.base import iso, utcnow
from portal.models.card_link_attempts import CardLinkAttempts, CardLinkStatus
from portal.models.card_providers import CardProviders, ProviderStatus
from portal.models.linked_cards import LinkedCards, LinkedCardStatus

from . import ns, logger

VERIFICATION_LABELS = {'MOBILE_OTP': 'Verified with an OTP to your registered mobile number'}


def _json():
    return request.get_json(silent=True) or {}


def serialize_provider(p):
    return {
        'code': p.code, 'name': p.name, 'short_name': p.short_name, 'provider_type': p.provider_type,
        'logo_url': p.logo_url, 'brand_color': p.brand_color, 'offers_credit_card': p.offers_credit_card,
        'card_product_name': p.card_product_name, 'status': p.status, 'is_popular': p.is_popular,
        'verification_method': p.verification_method, 'required_identifiers': p.required_identifiers,
    }


def serialize_card(c):
    p = c.provider
    return {
        'card_id': c.public_id,
        'provider': {'code': p.code, 'name': p.name, 'short_name': p.short_name, 'logo_url': p.logo_url,
                     'brand_color': p.brand_color, 'card_product_name': p.card_product_name},
        'last4': c.last4, 'masked_number': f'•••• {c.last4}',
        'verification_method': c.verification_method,
        'verification_label': VERIFICATION_LABELS.get(c.verification_method, c.verification_method),
        'is_primary': c.is_primary, 'status': c.status, 'verified_at': iso(c.verified_at),
        'saved_for_payments': bool(c.gateway_token_id),
    }


def _validate_identifiers(provider, raw):
    """Check every identifier the provider requires against its pattern (from master data)."""
    raw = raw if isinstance(raw, dict) else {}
    values, errors = {}, {}
    for spec in provider.required_identifiers or []:
        v = re.sub(r'\s', '', str(raw.get(spec['key']) or ''))
        if not v:
            errors[spec['key']] = f"{spec['label']} is required."
        elif len(v) > 40 or not re.fullmatch(spec['pattern'], v):
            errors[spec['key']] = f"Enter a valid value for: {spec['label'].lower()}."
        else:
            values[spec['key']] = v
    if 'last4' not in values and 'last4' not in errors:
        errors['last4'] = 'Last 4 digits of your card are required.'
    return values, errors


# ── Providers (master data) ─────────────────────────────────────────────────

@ns.route('/providers')
class Providers(Resource):
    @ns.doc(description='Banks and card providers users can link, read from the card_providers master data.')
    @auth_required
    def get(self):
        rows = (CardProviders.query
                .filter(CardProviders.offers_credit_card.is_(True),
                        CardProviders.status.in_([ProviderStatus.ACTIVE, ProviderStatus.COMING_SOON]))
                .order_by(CardProviders.sort_order, CardProviders.name).all())
        return ok({'providers': [serialize_provider(p) for p in rows], 'otp_available': sms_configured()})


# ── Link: start ─────────────────────────────────────────────────────────────

@ns.route('/link/start')
class LinkStart(Resource):
    @ns.doc(description='Start linking a card: body provider_code + identifiers {last4, …}. Sends an OTP '
                        "to the user's verified mobile number.")
    @limiter.limit('5 per minute')
    @step_required('account', 'loan')
    def post(self):
        try:
            user = current_user()
            cfg = current_app.config
            body = _json()
            provider = CardProviders.query.filter_by(code=str(body.get('provider_code') or '').upper()[:30]).first()
            if provider is None or not provider.offers_credit_card or provider.status == ProviderStatus.INACTIVE:
                return fail('Select your bank or card provider.', 400, code='VALIDATION_ERROR',
                            errors={'provider_code': 'Select your bank or card provider.'})
            if provider.status != ProviderStatus.ACTIVE:
                return fail(f'Linking {provider.name} cards is not available yet.', 409, code='PROVIDER_NOT_AVAILABLE')
            values, errors = _validate_identifiers(provider, body.get('identifiers'))
            if errors:
                return fail(next(iter(errors.values())), 400, code='VALIDATION_ERROR', errors=errors)
            if not sms_configured():
                return fail('OTP verification is not available: no SMS provider is configured.', 503,
                            code='OTP_PROVIDER_NOT_CONFIGURED')

            if LinkedCards.query.filter_by(user_id=user.user_id, provider_id=provider.provider_id,
                                           last4=values['last4'], status=LinkedCardStatus.LINKED).first():
                return fail('This card is already linked to your account.', 409, code='ALREADY_LINKED')

            now = utcnow()
            last = (CardLinkAttempts.query.filter_by(user_id=user.user_id)
                    .order_by(CardLinkAttempts.created_on.desc()).first())
            if last and (now - last.created_on).total_seconds() < cfg['OTP_RESEND_COOLDOWN_SECONDS']:
                wait = cfg['OTP_RESEND_COOLDOWN_SECONDS'] - int((now - last.created_on).total_seconds())
                return fail(f'Please wait {wait}s before requesting another OTP.', 429,
                            code='OTP_COOLDOWN', retry_after=wait)
            if CardLinkAttempts.query.filter(CardLinkAttempts.user_id == user.user_id,
                                             CardLinkAttempts.created_on >= now - timedelta(hours=1)
                                             ).count() >= cfg['CARD_LINK_MAX_STARTS_PER_HOUR']:
                return fail('Too many card-linking attempts. Please try again in an hour.', 429, code='LINK_LIMIT')

            CardLinkAttempts.query.filter_by(user_id=user.user_id, status=CardLinkStatus.OTP_SENT) \
                .update({'status': CardLinkStatus.SUPERSEDED})
            code = f'{secrets.randbelow(10 ** cfg["OTP_LENGTH"]):0{cfg["OTP_LENGTH"]}d}'
            extra = {k: v for k, v in values.items() if k != 'last4'}
            attempt = CardLinkAttempts(
                user_id=user.user_id, provider_id=provider.provider_id, last4=values['last4'],
                identifiers=extra or None, otp_hash=generate_password_hash(code), max_attempts=cfg['OTP_MAX_ATTEMPTS'],
                expires_at=now + timedelta(seconds=cfg['CARD_LINK_OTP_TTL_SECONDS']))
            db.session.add(attempt)
            db.session.commit()

            result = send_otp_sms(user.mobile_number, code)
            if not result['success']:
                attempt.status = CardLinkStatus.FAILED
                db.session.commit()
                return fail('Could not send the OTP. Please try again.', 502, code='OTP_SEND_FAILED')
            audit('CARD_LINK_START', user.user_id, 'CARD_LINK', attempt.public_id, details={'provider': provider.code})

            out = {'attempt_id': attempt.public_id, 'provider': serialize_provider(provider),
                   'masked_number': f'•••• {attempt.last4}', 'destination': user.masked_mobile,
                   'expires_in': cfg['CARD_LINK_OTP_TTL_SECONDS'], 'resend_after': cfg['OTP_RESEND_COOLDOWN_SECONDS'],
                   'dev_console_otp': result['provider'] == 'console'}
            # Development only (console SMS provider, refused in PROD): show the code on screen.
            if result['provider'] == 'console' and cfg['APP_ENV'] != 'PROD':
                out['dev_otp'] = code
            return ok(out, 201)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'cards/link/start')


# ── Link: verify ────────────────────────────────────────────────────────────

@ns.route('/link/verify')
class LinkVerify(Resource):
    @ns.doc(description='Submit the OTP: body attempt_id + otp. On success the card is linked.')
    @limiter.limit('10 per minute')
    @step_required('account', 'loan')
    def post(self):
        try:
            user = current_user()
            body = _json()
            otp, err = validate_otp(body.get('otp'))
            if err:
                return fail(err, 400, code='VALIDATION_ERROR', errors={'otp': err})
            attempt = CardLinkAttempts.query.filter_by(public_id=str(body.get('attempt_id') or '')[:32],
                                                       user_id=user.user_id).first()
            if attempt is None or attempt.status != CardLinkStatus.OTP_SENT:
                return fail('This verification is no longer active. Please start again.', 400, code='LINK_NOT_ACTIVE')
            if utcnow() > attempt.expires_at:
                attempt.status = CardLinkStatus.EXPIRED
                db.session.commit()
                return fail('The OTP expired. Please request a new one.', 400, code='OTP_EXPIRED')

            attempt.attempts += 1
            if not check_password_hash(attempt.otp_hash, otp):
                remaining = attempt.max_attempts - attempt.attempts
                if remaining <= 0:
                    attempt.status = CardLinkStatus.FAILED
                db.session.commit()
                return fail('Incorrect OTP.' if remaining > 0 else 'Too many wrong attempts. Please start again.',
                            400, code='OTP_INVALID' if remaining > 0 else 'LINK_ATTEMPTS_EXCEEDED',
                            attempts_remaining=max(remaining, 0))

            attempt.status = CardLinkStatus.VERIFIED
            first = LinkedCards.query.filter_by(user_id=user.user_id, status=LinkedCardStatus.LINKED).count() == 0
            card = LinkedCards(user_id=user.user_id, provider_id=attempt.provider_id, last4=attempt.last4,
                               identifiers=attempt.identifiers, verification_method=attempt.provider.verification_method,
                               status=LinkedCardStatus.LINKED, is_primary=first, verified_at=utcnow())
            db.session.add(card)
            db.session.flush()
            mark_complete_if_done(user)
            db.session.commit()
            audit('CARD_LINKED', user.user_id, 'CARD', card.public_id, details={'provider': attempt.provider.code})
            return ok({'card': serialize_card(card)}, 201)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'cards/link/verify')


# ── Linked cards ────────────────────────────────────────────────────────────

@ns.route('')
class Cards(Resource):
    @ns.doc(description="The user's linked credit cards.")
    @auth_required
    def get(self):
        cards = (LinkedCards.query.filter_by(user_id=current_user().user_id, status=LinkedCardStatus.LINKED)
                 .order_by(LinkedCards.is_primary.desc(), LinkedCards.created_on.asc()).all())
        return ok({'cards': [serialize_card(c) for c in cards]})


@ns.route('/<string:card_id>')
class Card(Resource):
    @ns.doc(description='Remove a linked card.')
    @auth_required
    def delete(self, card_id):
        try:
            user = current_user()
            card = LinkedCards.query.filter_by(public_id=card_id[:32], user_id=user.user_id,
                                               status=LinkedCardStatus.LINKED).first()
            if card is None:
                return fail('Card not found.', 404, code='NOT_FOUND')
            was_primary = card.is_primary
            forget_card_token(user, card)
            card.status, card.is_primary = LinkedCardStatus.REMOVED, False
            if was_primary:
                nxt = (LinkedCards.query.filter(LinkedCards.user_id == user.user_id,
                                                LinkedCards.status == LinkedCardStatus.LINKED,
                                                LinkedCards.card_id != card.card_id)
                       .order_by(LinkedCards.created_on.asc()).first())
                if nxt:
                    nxt.is_primary = True
            db.session.commit()
            audit('CARD_REMOVED', user.user_id, 'CARD', card.public_id)
            return ok({'message': 'Card removed.'})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'cards/delete')


@ns.route('/<string:card_id>/primary')
class CardPrimary(Resource):
    @ns.doc(description='Make a linked card the primary card (preselected for payments).')
    @auth_required
    def post(self, card_id):
        try:
            user = current_user()
            card = LinkedCards.query.filter_by(public_id=card_id[:32], user_id=user.user_id,
                                               status=LinkedCardStatus.LINKED).first()
            if card is None:
                return fail('Card not found.', 404, code='NOT_FOUND')
            LinkedCards.query.filter_by(user_id=user.user_id, status=LinkedCardStatus.LINKED)                 .update({'is_primary': False})
            card.is_primary = True
            db.session.commit()
            audit('CARD_PRIMARY_SET', user.user_id, 'CARD', card.public_id)
            return ok({'card': serialize_card(card)})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'cards/primary')
