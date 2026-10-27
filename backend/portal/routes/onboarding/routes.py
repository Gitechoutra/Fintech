"""Onboarding progress. Every step's state is computed from server-side facts
(helpers/onboarding.py) — the browser cannot declare a step done."""

from flask_restx import Resource

from portal import db
from portal.helpers.audit import audit
from portal.helpers.auth import auth_required, current_user
from portal.helpers.onboarding import mark_complete_if_done, status_for
from portal.helpers.responses import ok, server_error

from . import ns, logger


@ns.route('/status')
class OnboardingStatus(Resource):
    @ns.doc(description='Step states (DONE | CURRENT | PENDING) for account → card → security, and the next step.')
    @auth_required
    def get(self):
        try:
            user = current_user()
            if mark_complete_if_done(user):
                db.session.commit()
                audit('ONBOARDING_COMPLETED', user.user_id)
            return ok(status_for(user))
        except Exception:
            db.session.rollback()
            return server_error(logger, 'onboarding/status')
