import logging

from portal.api import api

ns = api.namespace(
    'authentication',
    description="Mobile OTP registration/login, sessions and app unlock"
)

logger = logging.getLogger('lendease.authentication')

from .routes import *  # noqa: E402,F401,F403
