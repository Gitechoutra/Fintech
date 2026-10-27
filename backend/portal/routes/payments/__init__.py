import logging

from portal.api import api

ns = api.namespace(
    'payments',
    description="EMI payments through Razorpay — quote, checkout, server-side verification, history"
)

logger = logging.getLogger('lendease.payments')

from .routes import *  # noqa: E402,F401,F403
