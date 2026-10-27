def init_app(app):
    with app.app_context():
        from .users import Users, UserStatus                          # noqa: F401
        from .user_sessions import UserSessions, SessionStatus        # noqa: F401
        from .otp_verifications import OTPVerifications               # noqa: F401
        from .email_verifications import EmailVerifications           # noqa: F401
        from .webauthn_credentials import WebAuthnCredentials         # noqa: F401
        from .audit_logs import AuditLogs                             # noqa: F401
        from .card_providers import CardProviders                     # noqa: F401
        from .linked_cards import LinkedCards                         # noqa: F401
        from .card_link_attempts import CardLinkAttempts              # noqa: F401
        from .loan_providers import LoanProviders                     # noqa: F401
        from .loan_accounts import LoanAccounts                       # noqa: F401
        from .loan_link_attempts import LoanLinkAttempts              # noqa: F401
        from .loan_payments import LoanPayments                       # noqa: F401
        from .qr_payments import QrPayments                           # noqa: F401

    app.logger.info('Initialized models')
