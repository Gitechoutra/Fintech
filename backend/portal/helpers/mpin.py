"""
MPIN hashing.

A 4-digit MPIN has 10,000 possible values, so a slow hash on its own does not stop
an attacker who has a copy of the database: they can try every value offline. The
MPIN is therefore keyed with MPIN_PEPPER (HMAC-SHA256) before being scrypt-hashed
with a per-user salt. The pepper lives only in the server environment, so a database
leak alone cannot be brute-forced. Online guessing is limited separately by
MPIN_MAX_ATTEMPTS (see routes/authentication) and request rate limits.
"""

import hashlib
import hmac

from flask import current_app
from werkzeug.security import check_password_hash, generate_password_hash


def _keyed(mpin):
    pepper = current_app.config['MPIN_PEPPER'].encode('utf-8')
    return hmac.new(pepper, str(mpin).encode('utf-8'), hashlib.sha256).hexdigest()


def hash_mpin(mpin):
    return generate_password_hash(_keyed(mpin), method='scrypt')


def check_mpin(mpin_hash, mpin):
    if not mpin_hash:
        return False
    return check_password_hash(mpin_hash, _keyed(mpin))
