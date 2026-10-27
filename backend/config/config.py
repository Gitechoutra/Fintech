"""
config/config.py
================
Environment-driven configuration. Every secret comes from the environment
(.env in development, a secret manager in production) — never from source.

APP_ENV selects the class: DEV (default), TEST or PROD.
"""

import os
from datetime import timedelta


def _bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


class BaseConfig:
    APP_NAME = os.getenv('APP_NAME', 'LendEase')
    APP_ENV = 'DEV'
    DEBUG = False
    TESTING = False

    SECRET_KEY = os.getenv('APP_SECRET_KEY', '')
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000').rstrip('/')

    # ── Database ───────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', '')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True, 'pool_recycle': 1800}

    # ── JWT (short-lived access token; refresh token is an opaque httpOnly cookie) ──
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', '')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES_MINUTES', 15)))
    JWT_TOKEN_LOCATION = ['headers']
    JWT_ALGORITHM = 'HS256'

    # ── Sessions / app lock ────────────────────────────────────────────────
    SESSION_ABSOLUTE_DAYS = int(os.getenv('SESSION_ABSOLUTE_DAYS', 30))
    SESSION_IDLE_LOCK_MINUTES = int(os.getenv('SESSION_IDLE_LOCK_MINUTES', 15))
    REFRESH_COOKIE_NAME = 'le_refresh'
    REFRESH_COOKIE_SECURE = _bool('REFRESH_COOKIE_SECURE', False)

    # ── MPIN ──────────────────────────────────────────────────────────────
    # A 4-digit MPIN has only 10,000 values, so a slow hash alone would not stop an
    # offline guess after a database leak. The MPIN is first keyed with this server-side
    # pepper (HMAC-SHA256) and then scrypt-hashed; the pepper never touches the database.
    MPIN_PEPPER = os.getenv('MPIN_PEPPER', '')
    MPIN_MAX_ATTEMPTS = int(os.getenv('MPIN_MAX_ATTEMPTS', 5))

    # ── OTP / SMS ──────────────────────────────────────────────────────────
    # SMS_PROVIDER: msg91 | fast2sms | console (console = DEV only, prints to server log)
    SMS_PROVIDER = os.getenv('SMS_PROVIDER', '').strip().lower()
    OTP_LENGTH = 6
    OTP_TTL_SECONDS = int(os.getenv('OTP_TTL_SECONDS', 300))
    OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv('OTP_RESEND_COOLDOWN_SECONDS', 30))
    OTP_MAX_PER_HOUR = int(os.getenv('OTP_MAX_PER_HOUR', 5))                    # unused codes / hour / number
    OTP_ABSOLUTE_MAX_PER_HOUR = int(os.getenv('OTP_ABSOLUTE_MAX_PER_HOUR', 20))  # all codes / hour / number
    OTP_MAX_ATTEMPTS = 5

    # ── Email verification ────────────────────────────────────────────────
    # EMAIL_PROVIDER: smtp | console (console = DEV only, prints the code to the server log)
    EMAIL_PROVIDER = os.getenv('EMAIL_PROVIDER', '').strip().lower()
    SMTP_HOST = os.getenv('SMTP_HOST', '')
    SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
    SMTP_USERNAME = os.getenv('SMTP_USERNAME', '')
    SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')
    SMTP_USE_TLS = _bool('SMTP_USE_TLS', True)
    MAIL_FROM = os.getenv('MAIL_FROM', '')

    # ── Card linking (OTP to the user's verified mobile for the chosen bank) ──
    CARD_LINK_OTP_TTL_SECONDS = int(os.getenv('CARD_LINK_OTP_TTL_SECONDS', 300))
    CARD_LINK_MAX_STARTS_PER_HOUR = int(os.getenv('CARD_LINK_MAX_STARTS_PER_HOUR', 10))

    # ── WebAuthn (fingerprint / Face ID) ──────────────────────────────────
    WEBAUTHN_RP_ID = os.getenv('WEBAUTHN_RP_ID', 'localhost')
    WEBAUTHN_RP_NAME = os.getenv('WEBAUTHN_RP_NAME', 'LendEase')
    WEBAUTHN_ORIGIN = os.getenv('WEBAUTHN_ORIGIN', 'http://localhost:3000')

    # ── Field encryption (provider references / tokens) ───────────────────
    DATA_ENCRYPTION_KEY = os.getenv('DATA_ENCRYPTION_KEY', '')

    # ── Rate limiting ─────────────────────────────────────────────────────
    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URI = os.getenv('RATELIMIT_STORAGE_URI', 'memory://')
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '300 per minute')
    RATELIMIT_HEADERS_ENABLED = True

    # ── CORS ──────────────────────────────────────────────────────────────
    CORS_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',') if o.strip()]

    # ── Loan data provider (lender integration) ───────────────────────────
    # Empty = not configured (no lender is integrated yet). See portal/providers/loan_data/README.md.
    LOAN_DATA_PROVIDER = os.getenv('LOAN_DATA_PROVIDER', '').strip().lower()
    LOAN_LINK_TTL_MINUTES = int(os.getenv('LOAN_LINK_TTL_MINUTES', 10))
    LOAN_LINK_MAX_ATTEMPTS = 5

    # ── Payments (Razorpay) ───────────────────────────────────────────────
    RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', '')
    RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', '')
    RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET', '')
    RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'
    # Crediting the collected EMI to the lender needs a settlement partner (e.g. BBPS
    # loan-repayment biller). Until one is configured, live-mode payments are refused.
    LOAN_SETTLEMENT_PROVIDER = os.getenv('LOAN_SETTLEMENT_PROVIDER', '').strip().lower()
    PAYMENT_CONVENIENCE_FEE_INR = os.getenv('PAYMENT_CONVENIENCE_FEE_INR', '0.00')
    MIN_EMI_PAYMENT_INR = os.getenv('MIN_EMI_PAYMENT_INR', '1.00')
    MAX_EMI_PAYMENT_INR = os.getenv('MAX_EMI_PAYMENT_INR', '500000')


class DevelopmentConfig(BaseConfig):
    APP_ENV = 'DEV'
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL', 'mysql+pymysql://root:password@localhost:3306/Fintech'
    )


class TestingConfig(BaseConfig):
    APP_ENV = 'TEST'
    TESTING = True
    SECRET_KEY = 'test-secret'
    JWT_SECRET_KEY = 'test-jwt-secret-that-is-long-enough-for-hs256'
    MPIN_PEPPER = 'test-mpin-pepper-that-is-long-enough-000'
    SQLALCHEMY_DATABASE_URI = os.getenv('TEST_DATABASE_URL', 'sqlite:///:memory:')
    SQLALCHEMY_ENGINE_OPTIONS = {}
    RATELIMIT_ENABLED = False
    SMS_PROVIDER = 'console'
    EMAIL_PROVIDER = 'console'
    LOAN_DATA_PROVIDER = ''
    RAZORPAY_KEY_ID = 'rzp_test_dummy'
    RAZORPAY_KEY_SECRET = 'test_secret'
    RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret'
    PAYMENT_CONVENIENCE_FEE_INR = '0.00'
    DATA_ENCRYPTION_KEY = 'mW1eJ7cRk6yQx2Yp0w5S3qQyQ9pM8aV1hB4nD6fG2jA='


class ProductionConfig(BaseConfig):
    APP_ENV = 'PROD'
    REFRESH_COOKIE_SECURE = True
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 1800,
        'pool_size': int(os.getenv('DB_POOL_SIZE', 10)),
        'max_overflow': int(os.getenv('DB_MAX_OVERFLOW', 20)),
    }


CONFIGS = {'DEV': DevelopmentConfig, 'TEST': TestingConfig, 'PROD': ProductionConfig}


def get_config(name=None):
    return CONFIGS.get((name or os.getenv('APP_ENV', 'DEV')).upper(), DevelopmentConfig)


def validate_config(app):
    """Fail fast on missing or unsafe secrets instead of running insecurely."""
    c = app.config
    problems = []
    if not c.get('SECRET_KEY'):
        problems.append('APP_SECRET_KEY')
    if len(c.get('JWT_SECRET_KEY') or '') < 32:
        problems.append('JWT_SECRET_KEY (min 32 chars)')
    if len(c.get('MPIN_PEPPER') or '') < 32:
        problems.append('MPIN_PEPPER (min 32 chars)')
    if not c.get('SQLALCHEMY_DATABASE_URI'):
        problems.append('DATABASE_URL')
    if not c.get('DATA_ENCRYPTION_KEY'):
        problems.append('DATA_ENCRYPTION_KEY')
    if c['APP_ENV'] == 'PROD':
        # Development adapters must never serve real users.
        if c.get('SMS_PROVIDER') in ('', 'console'):
            problems.append('SMS_PROVIDER (console is not allowed in PROD)')
        if c.get('EMAIL_PROVIDER') in ('', 'console'):
            problems.append('EMAIL_PROVIDER (console is not allowed in PROD)')
        if any(o == '*' for o in c['CORS_ORIGINS']):
            problems.append('CORS_ORIGINS (wildcard not allowed in PROD)')
    if problems:
        raise RuntimeError('Missing/unsafe configuration: ' + ', '.join(problems))
