import logging

from portal.api import api

ns = api.namespace(
    'scan',
    description="Scanner: UPI QR codes handed to the user's UPI app"
)

logger = logging.getLogger('lendease.scan')

from .routes import *  # noqa: E402,F401,F403
