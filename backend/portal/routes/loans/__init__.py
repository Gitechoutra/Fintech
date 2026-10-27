import logging

from portal.api import api

ns = api.namespace(
    'loans',
    description="Lender list, loan ownership verification and linked loans"
)

logger = logging.getLogger('lendease.loans')

from .routes import *  # noqa: E402,F401,F403
