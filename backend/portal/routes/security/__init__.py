import logging

from portal.api import api

ns = api.namespace(
    'security',
    description="MPIN and biometric (WebAuthn) setup"
)

logger = logging.getLogger('lendease.security')

from .routes import *  # noqa: E402,F401,F403
