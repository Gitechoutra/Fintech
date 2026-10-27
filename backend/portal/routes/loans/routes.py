"""
Loan account linking (e.g. Bajaj Finance).

    GET  /providers    lenders from the loan_providers master data, with the identifiers
                       each one requires (e.g. loan account number + customer ID)
    POST /link/start   provider + identifiers → an OTP is sent
    POST /link/verify  the OTP → loan linked

Verification methods (loan_providers.verification_method):
  MOBILE_OTP — the app sends its own OTP to the user's verified mobile number. The lender
               shares no loan figures this way, so they stay empty ("—"), never estimated.
  LENDER_API — the lender's authorised API confirms ownership and supplies figures
               (adapter in providers/loan_data; none integrated yet).

Loan numbers and customer IDs are kept out of logs, URLs and responses: they are
stored encrypted, the loan number is matched through a keyed blind index, and only
its last 4 digits are ever shown.
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
from portal.helpers.encryption import blind_index, decrypt, encrypt
from portal.helpers.loan_math import paid_in_app_since_snapshot, payable_balance
from portal.helpers.onboarding import mark_complete_if_done
from portal.helpers.responses import fail, ok, server_error
from portal.helpers.sms import send_otp_sms, sms_configured
from portal.helpers.validators import money, normalize_identifier, validate_otp
from portal.models.base import iso, utcnow
from portal.models.loan_accounts import LoanAccounts, LoanLinkStatus
from portal.models.loan_link_attempts import LoanLinkAttempts, LinkAttemptStatus
from portal.models.loan_payments import LoanPayments, PaymentStatus
from portal.models.loan_providers import LoanProviders, LoanVerificationMethod
from portal.providers.loan_data import (
    ChallengeExpired, ChallengeInvalid, InvalidProviderResponse, LoanProviderError, ProviderNotConfigured,
)
from portal.providers.loan_data import registry

from . import ns, logger

MAX_LINK_STARTS_PER_HOUR = 10
VERIFICATION_LABELS = {
    LoanVerificationMethod.MOBILE_OTP: 'Verified with an OTP to your registered mobile number',
    LoanVerificationMethod.LENDER_API: 'Verified by your lender',
}


def _json():
    return request.get_json(silent=True) or {}


def _provider_error(e: LoanProviderError):
    return fail(e.user_message, e.http_status, code=e.code)


def _is_available(p):
    if not p.is_active:
        return False
    if p.verification_method == LoanVerificationMethod.MOBILE_OTP:
        return sms_configured()
    return p.adapter is not None and p.adapter == registry.configured_adapter_name()


def available_providers():
    rows = LoanProviders.query.filter_by(is_active=True).order_by(LoanProviders.sort_order,
                                                                  LoanProviders.display_name).all()
    return [p for p in rows if _is_available(p)]


def serialize_provider(p):
    return {'code': p.code, 'name': p.display_name, 'logo_url': p.logo_url, 'brand_color': p.brand_color,
            'verification_method': p.verification_method, 'required_identifiers': p.required_identifiers}


def _can_refresh(loan):
    p = loan.provider
    return bool(p and p.verification_method == LoanVerificationMethod.LENDER_API and registry.get_adapter(p.adapter))


def serialize_loan(loan):
    open_payment = (LoanPayments.query.filter(LoanPayments.loan_id == loan.loan_id,
                                              LoanPayments.status.in_(PaymentStatus.OPEN))
                    .order_by(LoanPayments.created_at.desc()).first())
    method = loan.provider.verification_method if loan.provider else None
    return {
        'loan_id': loan.public_id,
        'provider_name': loan.provider.display_name if loan.provider else None,
        'provider_code': loan.provider.code if loan.provider else None,
        'masked_number': loan.masked_number,
        'product_name': loan.product_name,
        'loan_status': loan.loan_status,
        'currency': loan.currency,
        'sanctioned_amount': money(loan.sanctioned_amount),
        'outstanding_balance': money(loan.outstanding_balance),
        'emi_amount': money(loan.emi_amount),
        'next_due_date': loan.next_due_date.isoformat() if loan.next_due_date else None,
        'data_as_of': iso(loan.data_as_of),
        'verified_at': iso(loan.verified_at),
        'verification_label': VERIFICATION_LABELS.get(method),
        'can_refresh': _can_refresh(loan),
        'paid_in_app_since_update': money(paid_in_app_since_snapshot(loan)),
        'payable_balance': money(payable_balance(loan)),
        'open_payment_id': open_payment.public_id if open_payment else None,
    }


def _apply_details(loan, d):
    loan.provider_reference = d.provider_reference
    loan.product_name, loan.loan_status, loan.currency = d.product_name, d.loan_status, 'INR'
    loan.sanctioned_amount, loan.outstanding_balance = d.sanctioned_amount, d.outstanding_balance
    loan.emi_amount, loan.next_due_date, loan.data_as_of = d.emi_amount, d.next_due_date, d.as_of


def _validate_identifiers(provider, body):
    """Validate every identifier the provider requires (patterns come from master data).
    Accepts {"identifiers": {...}} or, for older clients, a single "identifier"."""
    raw = body.get('identifiers') if isinstance(body.get('identifiers'), dict) else {}
    if not raw and body.get('identifier') is not None:
        raw = {'loan_account_number': body.get('identifier')}
    values, errors = {}, {}
    for spec in provider.required_identifiers or []:
        v = normalize_identifier(raw.get(spec['key']))
        if not v:
            errors[spec['key']] = f"{spec['label']} is required."
        elif len(v) > 40 or not re.fullmatch(spec['pattern'], v):
            errors[spec['key']] = f"Enter a valid {spec['label'].lower()}."
        else:
            values[spec['key']] = v
    if 'loan_account_number' not in values and 'loan_account_number' not in errors:
        errors['loan_account_number'] = 'Loan account number is required.'
    return values, errors


# ── Providers ───────────────────────────────────────────────────────────────

@ns.route('/providers')
class Providers(Resource):
    @ns.doc(description='Lenders users can link, from the loan_providers master data.')
    @auth_required
    def get(self):
        providers = available_providers()
        return ok({
            'configured': bool(providers),
            'providers': [serialize_provider(p) for p in providers],
            'message': None if providers else ProviderNotConfigured.user_message,
        })


# ── Link: start ─────────────────────────────────────────────────────────────

@ns.route('/link/start')
class LinkStart(Resource):
    @ns.doc(description='Begin loan verification: body provider_code + identifiers {loan_account_number, '
                        'customer_id, …}. Sends an OTP (MOBILE_OTP) or starts the lender check (LENDER_API).')
    @limiter.limit('5 per minute')
    @step_required('account')
    def post(self):
        try:
            user = current_user()
            cfg = current_app.config
            body = _json()
            provider = next((p for p in available_providers()
                             if p.code == str(body.get('provider_code') or '').upper()), None)
            if provider is None:
                if not available_providers():
                    return fail(ProviderNotConfigured.user_message, 503, code=ProviderNotConfigured.code)
                return fail('Select a lender from the list.', 400, code='VALIDATION_ERROR',
                            errors={'provider_code': 'Select a lender from the list.'})
            values, errors = _validate_identifiers(provider, body)
            if errors:
                return fail(next(iter(errors.values())), 400, code='VALIDATION_ERROR', errors=errors)
            identifier = values['loan_account_number']
            customer_id = values.get('customer_id')

            now = utcnow()
            recent = LoanLinkAttempts.query.filter(LoanLinkAttempts.user_id == user.user_id,
                                                   LoanLinkAttempts.created_on >= now - timedelta(hours=1))
            if recent.count() >= MAX_LINK_STARTS_PER_HOUR:
                return fail('Too many verification attempts. Please try again in an hour.', 429,
                            code='LINK_LIMIT')
            last = recent.order_by(LoanLinkAttempts.created_on.desc()).first()
            if (provider.verification_method == LoanVerificationMethod.MOBILE_OTP and last
                    and (now - last.created_on).total_seconds() < cfg['OTP_RESEND_COOLDOWN_SECONDS']):
                wait = cfg['OTP_RESEND_COOLDOWN_SECONDS'] - int((now - last.created_on).total_seconds())
                return fail(f'Please wait {wait}s before requesting another OTP.', 429,
                            code='OTP_COOLDOWN', retry_after=wait)

            ref_hash = blind_index(f'{provider.code}:{identifier}')
            linked = LoanAccounts.query.filter_by(provider_id=provider.provider_id, account_ref_hash=ref_hash,
                                                  status=LoanLinkStatus.VERIFIED).all()
            if any(l.user_id == user.user_id for l in linked):
                return fail('This loan is already linked to your account.', 409, code='ALREADY_LINKED')
            if linked:
                return fail('This loan is already linked to another account. Contact support if this is your loan.',
                            409, code='LINKED_ELSEWHERE')

            # Only one open verification per user.
            LoanLinkAttempts.query.filter(LoanLinkAttempts.user_id == user.user_id,
                                          LoanLinkAttempts.status.in_(LinkAttemptStatus.OPEN)) \
                .update({'status': LinkAttemptStatus.EXPIRED}, synchronize_session=False)

            attempt = LoanLinkAttempts(
                user_id=user.user_id, provider_id=provider.provider_id, account_ref_hash=ref_hash,
                account_ref_encrypted=encrypt(identifier), account_last4=identifier[-4:],
                customer_ref_encrypted=encrypt(customer_id) if customer_id else None,
                max_attempts=cfg['LOAN_LINK_MAX_ATTEMPTS'],
                expires_at=now + timedelta(minutes=cfg['LOAN_LINK_TTL_MINUTES']))
            out = {'masked_number': f'•••• {attempt.account_last4}', 'provider_name': provider.display_name,
                   'verification_method': provider.verification_method}

            if provider.verification_method == LoanVerificationMethod.MOBILE_OTP:
                code = f'{secrets.randbelow(10 ** cfg["OTP_LENGTH"]):0{cfg["OTP_LENGTH"]}d}'
                attempt.otp_hash = generate_password_hash(code)
                attempt.challenge_destination = user.masked_mobile[:40]
                attempt.status = LinkAttemptStatus.CHALLENGE_SENT
                db.session.add(attempt)
                db.session.commit()
                result = send_otp_sms(user.mobile_number, code)
                if not result['success']:
                    attempt.status, attempt.failure_code = LinkAttemptStatus.FAILED, 'OTP_SEND_FAILED'
                    db.session.commit()
                    return fail('Could not send the OTP. Please try again.', 502, code='OTP_SEND_FAILED')
                out['dev_console_otp'] = result['provider'] == 'console'
                # Development only (console SMS provider, refused in PROD): show the code on screen.
                if result['provider'] == 'console' and cfg['APP_ENV'] != 'PROD':
                    out['dev_otp'] = code
                out['resend_after'] = cfg['OTP_RESEND_COOLDOWN_SECONDS']
            else:
                adapter = registry.get_adapter(provider.adapter)
                try:
                    if adapter is None:
                        raise ProviderNotConfigured()
                    challenge = adapter.start_ownership_check(identifier=identifier, verified_mobile=user.mobile_number)
                except LoanProviderError as e:
                    attempt.status, attempt.failure_code = LinkAttemptStatus.FAILED, e.code
                    db.session.add(attempt)
                    db.session.commit()
                    audit('LOAN_LINK_START', user.user_id, 'LOAN_LINK', attempt.public_id, status='FAILED',
                          details={'reason': e.code, 'provider': provider.code})
                    return _provider_error(e)
                attempt.provider_session_ref = (challenge.session_ref or '')[:128] or None
                attempt.provider_state_encrypted = encrypt(challenge.state) if challenge.state else None
                attempt.challenge_destination = (challenge.destination or '')[:40] or None
                attempt.status = (LinkAttemptStatus.PENDING_REVIEW if challenge.status == 'PENDING_REVIEW'
                                  else LinkAttemptStatus.CHALLENGE_SENT)
                db.session.add(attempt)
                db.session.commit()

            audit('LOAN_LINK_START', user.user_id, 'LOAN_LINK', attempt.public_id,
                  details={'status': attempt.status, 'provider': provider.code})
            out.update({'attempt_id': attempt.public_id, 'status': attempt.status})
            if attempt.status == LinkAttemptStatus.PENDING_REVIEW:
                out['message'] = ('The lender will confirm that this loan belongs to you. '
                                  "We'll let you continue once they do — this can take up to 2 working days.")
                return ok(out, 202)
            out.update({'destination': attempt.challenge_destination,
                        'expires_in': cfg['LOAN_LINK_TTL_MINUTES'] * 60})
            return ok(out, 201)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'loans/link/start')


# ── Link: verify ────────────────────────────────────────────────────────────

def _wrong_code(attempt, message, code):
    remaining = attempt.max_attempts - attempt.attempts
    if remaining <= 0:
        attempt.status, attempt.failure_code = LinkAttemptStatus.FAILED, 'TOO_MANY_ATTEMPTS'
    db.session.commit()
    return fail(message if remaining > 0 else 'Too many wrong codes. Start the verification again.',
                400, code=code if remaining > 0 else 'LINK_ATTEMPTS_EXCEEDED', attempts_remaining=max(remaining, 0))


@ns.route('/link/verify')
class LinkVerify(Resource):
    @ns.doc(description='Submit the OTP: body attempt_id + code. On success the loan is linked.')
    @limiter.limit('10 per minute')
    @step_required('account')
    def post(self):
        try:
            user = current_user()
            body = _json()
            code, err = validate_otp(body.get('code'))
            if err:
                return fail('Enter the 6-digit OTP.', 400, code='VALIDATION_ERROR', errors={'code': 'Enter the 6-digit OTP.'})
            attempt = LoanLinkAttempts.query.filter_by(public_id=str(body.get('attempt_id') or '')[:32],
                                                       user_id=user.user_id).first()
            if attempt is None or attempt.status != LinkAttemptStatus.CHALLENGE_SENT:
                return fail('This verification is no longer active. Start again.', 400, code='LINK_NOT_ACTIVE')
            if attempt.expires_at < utcnow():
                attempt.status, attempt.failure_code = LinkAttemptStatus.EXPIRED, 'EXPIRED'
                db.session.commit()
                return fail('The OTP expired. Start the verification again.', 400, code=ChallengeExpired.code)

            provider = attempt.provider
            details = None
            attempt.attempts += 1
            if attempt.otp_hash:                                   # MOBILE_OTP
                if not check_password_hash(attempt.otp_hash, code):
                    return _wrong_code(attempt, 'Incorrect OTP.', 'LENDER_OTP_INVALID')
            else:                                                  # LENDER_API
                adapter = registry.get_adapter(provider.adapter)
                if adapter is None:
                    return fail(ProviderNotConfigured.user_message, 503, code=ProviderNotConfigured.code)
                try:
                    state = decrypt(attempt.provider_state_encrypted) if attempt.provider_state_encrypted else None
                    details = registry.validate_loan_details(adapter.complete_ownership_check(
                        session_ref=attempt.provider_session_ref, state=state, code=code))
                except ChallengeInvalid as e:
                    return _wrong_code(attempt, e.user_message, e.code)
                except InvalidProviderResponse as e:
                    attempt.status, attempt.failure_code = LinkAttemptStatus.FAILED, e.code
                    db.session.commit()
                    logger.error(f'[loans/verify] lender data rejected: {e}')
                    return _provider_error(e)
                except LoanProviderError as e:
                    if isinstance(e, ChallengeExpired):
                        attempt.status, attempt.failure_code = LinkAttemptStatus.EXPIRED, e.code
                    db.session.commit()
                    return _provider_error(e)

            loan = LoanAccounts.query.filter_by(user_id=user.user_id, provider_id=attempt.provider_id,
                                                account_ref_hash=attempt.account_ref_hash).first()
            if loan is None:
                loan = LoanAccounts(user_id=user.user_id, provider_id=attempt.provider_id,
                                    account_ref_hash=attempt.account_ref_hash,
                                    account_ref_encrypted=attempt.account_ref_encrypted,
                                    account_last4=attempt.account_last4)
                db.session.add(loan)
            loan.customer_ref_encrypted = attempt.customer_ref_encrypted
            loan.status, loan.verified_at = LoanLinkStatus.VERIFIED, utcnow()
            if details is not None:
                _apply_details(loan, details)
            else:
                loan.product_name = f'{provider.display_name} Loan'[:80]
            attempt.status = LinkAttemptStatus.VERIFIED
            attempt.provider_state_encrypted = None
            attempt.otp_hash = None
            db.session.flush()
            mark_complete_if_done(user)
            db.session.commit()
            audit('LOAN_LINKED', user.user_id, 'LOAN', loan.public_id, details={'provider': provider.code})
            return ok({'loan': serialize_loan(loan)}, 201)
        except Exception:
            db.session.rollback()
            return server_error(logger, 'loans/link/verify')


# ── Linked loans ────────────────────────────────────────────────────────────

@ns.route('')
class Loans(Resource):
    @ns.doc(description="The user's verified loans.")
    @auth_required
    def get(self):
        loans = (LoanAccounts.query.filter_by(user_id=current_user().user_id, status=LoanLinkStatus.VERIFIED)
                 .order_by(LoanAccounts.verified_at.asc()).all())
        return ok({'loans': [serialize_loan(l) for l in loans]})


@ns.route('/<string:loan_id>/refresh')
class LoanRefresh(Resource):
    @ns.doc(description='Fetch current figures for a linked loan from the lender (LENDER_API lenders only).')
    @limiter.limit('6 per minute')
    @auth_required
    def post(self, loan_id):
        try:
            loan = LoanAccounts.query.filter_by(public_id=loan_id[:32], user_id=current_user().user_id,
                                                status=LoanLinkStatus.VERIFIED).first()
            if loan is None:
                return fail('Loan not found.', 404, code='NOT_FOUND')
            if not _can_refresh(loan):
                return fail(f'{loan.provider.display_name} does not share loan details through this verification.',
                            409, code='REFRESH_NOT_AVAILABLE')
            adapter = registry.get_adapter(loan.provider.adapter)
            try:
                details = registry.validate_loan_details(adapter.fetch_loan(provider_reference=loan.provider_reference))
            except LoanProviderError as e:
                return _provider_error(e)
            _apply_details(loan, details)
            db.session.commit()
            return ok({'loan': serialize_loan(loan)})
        except Exception:
            db.session.rollback()
            return server_error(logger, 'loans/refresh')
