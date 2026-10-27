"""
Email verification codes.

EMAIL_PROVIDER:
  smtp    — needs SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD and MAIL_FROM
  console — DEVELOPMENT ONLY: writes the code to the backend console. Refused when APP_ENV=PROD.
  (empty) — not configured: email verification is unavailable and the API says so.
"""

import logging
import smtplib
from email.message import EmailMessage

from flask import current_app

logger = logging.getLogger('lendease.email')


def email_configured():
    c = current_app.config
    p = c.get('EMAIL_PROVIDER')
    if p == 'console':
        return c['APP_ENV'] != 'PROD'
    if p == 'smtp':
        return bool(c.get('SMTP_HOST') and c.get('SMTP_USERNAME') and c.get('SMTP_PASSWORD') and c.get('MAIL_FROM'))
    return False


def send_verification_email(to_email, code):
    """Returns {'success': bool, 'provider': str}. Never logs the code except in console (dev) mode."""
    c = current_app.config
    provider = c.get('EMAIL_PROVIDER')
    if not email_configured():
        return {'success': False, 'provider': provider or 'none'}
    if provider == 'console':
        current_app.logger.warning(f'[DEV EMAIL] verification code for {to_email}: {code}  (console provider — not for production)')
        return {'success': True, 'provider': 'console'}

    msg = EmailMessage()
    msg['Subject'] = f"{c['APP_NAME']} email verification code"
    msg['From'] = c['MAIL_FROM']
    msg['To'] = to_email
    minutes = c['OTP_TTL_SECONDS'] // 60
    msg.set_content(f"Your {c['APP_NAME']} verification code is {code}.\n\n"
                    f"It expires in {minutes} minutes. If you didn't request it, you can ignore this email.")
    try:
        with smtplib.SMTP(c['SMTP_HOST'], c['SMTP_PORT'], timeout=15) as s:
            if c['SMTP_USE_TLS']:
                s.starttls()
            s.login(c['SMTP_USERNAME'], c['SMTP_PASSWORD'])
            s.send_message(msg)
        return {'success': True, 'provider': 'smtp'}
    except (smtplib.SMTPException, OSError) as e:
        logger.error(f'SMTP send failed: {e.__class__.__name__}')
        return {'success': False, 'provider': 'smtp'}
