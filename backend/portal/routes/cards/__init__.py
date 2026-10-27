import logging

from portal.api import api

ns = api.namespace(
    'cards',
    description="Card providers (master data) and credit-card linking with OTP"
)

logger = logging.getLogger('lendease.cards')

from .routes import *  # noqa: E402,F401,F403
