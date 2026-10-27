"""
Razorpay integration using the documented REST API (https://razorpay.com/docs/api/):
  POST /v1/orders                 — create an order
  GET  /v1/payments/{id}          — fetch a payment (server-side confirmation)
  GET  /v1/orders/{id}/payments   — reconcile all attempts on an order
  POST /v1/customers              — customer that owns saved (tokenised) cards
  GET  /v1/customers/{id}/tokens  — the customer's saved cards (last4/network only)
  DELETE /v1/customers/{id}/tokens/{token} — forget a saved card
Checkout signature:  HMAC_SHA256(order_id + "|" + payment_id, key_secret)
Webhook signature:   HMAC_SHA256(raw_body, webhook_secret) in X-Razorpay-Signature

Keys are read from config (.env) only; the key *secret* never leaves the server.
"""

import hashlib
import hmac
import logging

import requests
from flask import current_app

logger = logging.getLogger('lendease.razorpay')
TIMEOUT = 15


class RazorpayError(Exception):
    pass


def payment_config():
    cfg = current_app.config
    key_id, secret = cfg.get('RAZORPAY_KEY_ID') or '', cfg.get('RAZORPAY_KEY_SECRET') or ''
    configured = bool(key_id and secret)
    mode = 'live' if key_id.startswith('rzp_live_') else 'test'
    settlement = cfg.get('LOAN_SETTLEMENT_PROVIDER') or ''
    # Live money must not be collected for an EMI we cannot remit to the lender.
    live_blocked = configured and mode == 'live' and not settlement
    return {
        'configured': configured and not live_blocked,
        'provider': 'RAZORPAY' if configured else None,
        'mode': mode if configured else None,
        'key_id': key_id if configured else None,     # publishable id — safe for the browser
        'settlement_configured': bool(settlement),
        'message': (
            'The payment provider (Razorpay) has not been configured for this app, so EMIs cannot be collected.'
            if not configured else
            'Live payments are disabled until a lender settlement partner is configured.' if live_blocked else
            'Test mode — no real money moves and the lender is not credited.' if mode == 'test' else
            None
        ),
    }


def _request(method, path, **kwargs):
    cfg = current_app.config
    url = cfg['RAZORPAY_API_BASE'] + path
    try:
        resp = requests.request(method, url, auth=(cfg['RAZORPAY_KEY_ID'], cfg['RAZORPAY_KEY_SECRET']),
                                timeout=TIMEOUT, **kwargs)
    except requests.RequestException as e:
        logger.error(f'Razorpay {method} {path} network error: {e.__class__.__name__}')
        raise RazorpayError('Payment provider unreachable. Please try again.') from e
    if resp.status_code >= 400:
        try:
            desc = resp.json().get('error', {}).get('description', '')
        except ValueError:
            desc = ''
        logger.error(f'Razorpay {method} {path} -> HTTP {resp.status_code} {desc[:120]}')
        raise RazorpayError('Payment provider rejected the request.')
    return resp.json()


def create_order(amount_paise, receipt, notes):
    return _request('POST', '/orders', json={
        'amount': amount_paise, 'currency': 'INR', 'receipt': receipt, 'notes': notes,
    })


def fetch_payment(payment_id):
    return _request('GET', f'/payments/{payment_id}')


def fetch_order_payments(order_id):
    return _request('GET', f'/orders/{order_id}/payments').get('items', [])


def create_customer(name, contact, email):
    """Returns the Razorpay customer id; fail_existing=0 returns the existing one for the same contact/email."""
    body = {'fail_existing': '0', 'contact': contact}
    if name:
        body['name'] = name[:50]
    if email:
        body['email'] = email
    return _request('POST', '/customers', json=body)['id']


def fetch_tokens(customer_id):
    return _request('GET', f'/customers/{customer_id}/tokens').get('items', [])


def delete_token(customer_id, token_id):
    return _request('DELETE', f'/customers/{customer_id}/tokens/{token_id}')


def verify_checkout_signature(order_id, payment_id, signature):
    secret = current_app.config.get('RAZORPAY_KEY_SECRET') or ''
    if not (secret and order_id and payment_id and signature):
        return False
    expected = hmac.new(secret.encode(), f'{order_id}|{payment_id}'.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(signature))


def verify_webhook_signature(raw_body, signature):
    # An unconfigured secret REJECTS webhooks.
    secret = current_app.config.get('RAZORPAY_WEBHOOK_SECRET') or ''
    if not (secret and signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(signature))
