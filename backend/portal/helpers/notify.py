"""Email alerts controlled by the user's notification preferences (Settings → Notifications).
Sent only to a verified email address; failures are logged and never break the request."""

from flask import current_app

from portal.helpers.email import send_email
from portal.helpers.validators import money


def _deliver(user, subject, body):
    if not (user and user.email and user.email_verified_at):
        return False
    try:
        return send_email(user.email, f"{current_app.config['APP_NAME']}: {subject}", body)
    except Exception:
        current_app.logger.warning('[notify] email alert failed')
        return False


def payment_status_alert(txn):
    """Called when a payment reaches SUCCESS or FAILED."""
    user = txn.loan.user if txn.loan else None
    if not user or not user.payment_alerts:
        return False
    label = f'{txn.loan.product_name or "loan"} {txn.loan.masked_number}'
    if txn.status == 'SUCCESS':
        return _deliver(user, 'Payment successful',
                        f'Your payment of INR {money(txn.total)} towards {label} was confirmed. '
                        f'Reference: {txn.receipt_number}.')
    return _deliver(user, 'Payment failed',
                    f'Your payment of INR {money(txn.total)} towards {label} did not go through. '
                    f'{txn.failure_reason or ""} Reference: {txn.receipt_number}.')


def login_alert(user, user_agent):
    if not user.login_alerts:
        return False
    return _deliver(user, 'New sign-in to your account',
                    f'Your account was signed in to from: {(user_agent or "an unknown device")[:120]}. '
                    "If this wasn't you, sign out other devices in Settings → Security and contact support.")
