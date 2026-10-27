"""Pay with a linked card without re-entering it, via Razorpay saved cards (tokens).

The app never stores a card number. On the first payment with a linked card the user
enters it once in Razorpay Checkout and consents to save it; Razorpay keeps a token
under the user's Razorpay customer. That token is matched to the linked card (by last 4
digits) and later payments use it — the user only completes the bank's OTP (3-D Secure).

Test mode: Razorpay only accepts its test card numbers, whose last 4 digits never match a
real linked card, so the newest saved token is attached to the card the user chose.
"""

import logging

from portal import db
from portal.helpers import razorpay_helper as rzp
from portal.models.base import utcnow
from portal.models.linked_cards import LinkedCards, LinkedCardStatus

logger = logging.getLogger('lendease.saved_cards')
INACTIVE = {'deactivated', 'deleted', 'expired', 'suspended'}


def ensure_customer(user):
    if not user.razorpay_customer_id:
        user.razorpay_customer_id = rzp.create_customer(user.full_name, user.mobile_number, user.email)
    return user.razorpay_customer_id


def _active_tokens(customer_id):
    items = [t for t in rzp.fetch_tokens(customer_id)
             if t.get('method') == 'card' and (t.get('status') or 'active') not in INACTIVE]
    return sorted(items, key=lambda t: t.get('created_at') or 0, reverse=True)


def sync_card_token(user, card, mode):
    """Make card.gateway_token_id reflect Razorpay: keep it if still active, otherwise
    attach a matching saved token (or clear it). Never raises — on gateway errors the
    card simply pays through full Checkout."""
    if not user.razorpay_customer_id or card is None:
        return card
    try:
        tokens = _active_tokens(user.razorpay_customer_id)
    except rzp.RazorpayError:
        return card
    ids = {t['id'] for t in tokens}
    if card.gateway_token_id in ids:
        return card
    taken = {c.gateway_token_id for c in LinkedCards.query.filter(
        LinkedCards.user_id == user.user_id, LinkedCards.status == LinkedCardStatus.LINKED,
        LinkedCards.card_id != card.card_id, LinkedCards.gateway_token_id.isnot(None))}
    free = [t for t in tokens if t['id'] not in taken]
    match = next((t for t in free if (t.get('card') or {}).get('last4') == card.last4), None)
    if match is None and mode == 'test':
        match = free[0] if free else None
    card.gateway_token_id = match['id'] if match else None
    card.gateway_token_saved_at = utcnow() if match else None
    return card


def forget_card_token(user, card):
    if card.gateway_token_id and user.razorpay_customer_id:
        try:
            rzp.delete_token(user.razorpay_customer_id, card.gateway_token_id)
        except rzp.RazorpayError:
            logger.warning('could not delete saved card token at Razorpay')
    card.gateway_token_id = card.gateway_token_saved_at = None
