import logging

from portal.api import api

ns = api.namespace(
    'onboarding',
    description="Server-derived onboarding progress (account → loan → security → card)"
)

logger = logging.getLogger('lendease.onboarding')

from .routes import *  # noqa: E402,F401,F403
