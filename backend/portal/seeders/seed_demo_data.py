"""Development-only demo data: loans, EMIs, extra cards and payment history for one
user, so the dashboard can be seen with realistic figures.

Never run automatically and refused outside DEV. Every row it writes is tagged so it
can be removed again without touching real data:
    loan_accounts.provider_reference = DEMO_TAG
    linked_cards.identifiers         = {"demo": true}
    loan_payments.receipt_number     starts with "DEMO"

    flask --app app seed-demo                       # most recently created user
    flask --app app seed-demo --mobile +919xxxxxxxxx
    flask --app app seed-demo --clear               # remove the demo rows only
"""

import secrets
from datetime import date, timedelta
from decimal import Decimal

from flask import current_app

from portal import db
from portal.helpers.encryption import blind_index, encrypt
from portal.models.base import utcnow
from portal.models.card_providers import CardProviders
from portal.models.linked_cards import LinkedCards, LinkedCardStatus
from portal.models.loan_accounts import LoanAccounts, LoanLinkStatus
from portal.models.loan_payments import LoanPayments, PaymentStatus, PaymentType, SettlementStatus
from portal.models.loan_providers import LoanProviders
from portal.models.users import Users

DEMO_TAG = 'DEMO-SEED'

#   account no.       product                   status     sanctioned   outstanding  emi       due in (days)  EMIs paid
LOANS = [
    ('DEMOPL00004821', 'Personal Loan',          'ACTIVE',  '500000.00', '312450.00', '12850.00',   4, 6),
    ('DEMOHL00007730', 'Home Loan',              'ACTIVE', '3500000.00', '2864200.00', '31240.00', 18, 5),
    ('DEMOTW00002296', 'Two-Wheeler Loan',       'OVERDUE', '120000.00',  '38900.00',  '4620.00',  -3, 4),
    ('DEMOCD00005517', 'Consumer Durable Loan',  'ACTIVE',   '60000.00',  '15000.00',  '5000.00',   9, 3),
    ('DEMOEL00006402', 'Education Loan',         'CLOSED',  '200000.00',      '0.00',      None, None, 3),
    ('DEMOMP00003318', 'Mobile Phone EMI',       'ACTIVE',   '45000.00',  '22500.00',  '3750.00',  12, 6),
    ('DEMOLC00001945', 'Laptop & Computer EMI',  'ACTIVE',   '72000.00',  '54000.00',  '6000.00',   2, 3),
    ('DEMOGL00008840', 'Gold Loan',              'ACTIVE',  '150000.00', '150000.00',  '2400.00',  21, 0),
]

#   card provider code  last4
CARDS = [('HDFC', '4417'), ('AXIS', '9021')]


def _months_ago(d, n):
    m = d.month - 1 - n
    return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=min(d.day, 28))


def clear_demo_data(user):
    demo_loans = [l.loan_id for l in LoanAccounts.query.filter_by(user_id=user.user_id, provider_reference=DEMO_TAG)]
    removed = LoanPayments.query.filter(LoanPayments.user_id == user.user_id,
                                        LoanPayments.receipt_number.like('DEMO%')).delete(synchronize_session=False)
    if demo_loans:
        LoanAccounts.query.filter(LoanAccounts.loan_id.in_(demo_loans)).delete(synchronize_session=False)
    cards = [c for c in LinkedCards.query.filter_by(user_id=user.user_id) if (c.identifiers or {}).get('demo')]
    for c in cards:
        db.session.delete(c)
    db.session.commit()
    return {'loans': len(demo_loans), 'cards': len(cards), 'payments': removed}


def _payment(user, loan, card, amount, status, when, n):
    fee = Decimal(current_app.config.get('PAYMENT_CONVENIENCE_FEE_INR') or '0').quantize(Decimal('0.01'))
    amount = Decimal(amount)
    tok = secrets.token_hex(6).upper()
    p = LoanPayments(
        user_id=user.user_id, loan_id=loan.loan_id, linked_card_id=card.card_id if card else None,
        payment_type=PaymentType.EMI, amount=amount, fee=fee, total=amount + fee, currency='INR',
        provider='RAZORPAY', provider_mode='test', provider_order_id=f'order_DEMO{tok}',
        payment_method='card', status=status, idempotency_key=f'demo-{tok}',
        receipt_number=f'DEMO{when:%y%m%d}{tok}{n}', created_at=when, updated_at=when,
    )
    if status == PaymentStatus.SUCCESS:
        p.provider_payment_id = f'pay_DEMO{tok}'
        p.verified_via = 'API_FETCH'
        p.settlement_status = SettlementStatus.NOT_CONFIGURED
        p.completed_at = when + timedelta(seconds=40)
    elif status == PaymentStatus.FAILED:
        p.provider_payment_id = f'pay_DEMO{tok}'
        p.verified_via = 'API_FETCH'
        p.failure_reason = 'Payment declined by the card issuer.'
        p.completed_at = when + timedelta(seconds=25)
    db.session.add(p)


def seed_demo_data(mobile=None):
    if current_app.config['APP_ENV'] != 'DEV':
        raise RuntimeError('Demo data can only be seeded with APP_ENV=DEV.')
    user = (Users.query.filter_by(mobile_number=mobile).first() if mobile
            else Users.query.order_by(Users.created_on.desc()).first())
    if user is None:
        raise RuntimeError('No user found — sign up in the app first, then seed.')
    provider = LoanProviders.query.filter_by(code='BAJAJ_FINANCE').first()
    if provider is None:
        raise RuntimeError('Loan providers are not seeded — start the app once first.')

    clear_demo_data(user)
    now = utcnow()
    today = date.today()
    snapshot = now - timedelta(days=1)       # lender figures "as of" yesterday

    cards = []
    for code, last4 in CARDS:
        cp = CardProviders.query.filter_by(code=code).first()
        if cp:
            cards.append(LinkedCards(user_id=user.user_id, provider_id=cp.provider_id, last4=last4,
                                     identifiers={'demo': True}, verification_method='MOBILE_OTP',
                                     status=LinkedCardStatus.LINKED, is_primary=False,
                                     verified_at=now - timedelta(days=40)))
    db.session.add_all(cards)
    primary = (LinkedCards.query.filter_by(user_id=user.user_id, status=LinkedCardStatus.LINKED, is_primary=True).first()
               or (cards[0] if cards else None))
    pay_cards = [c for c in [primary, *cards] if c]

    loans = []
    for acct, product, status, sanctioned, outstanding, emi, due_in, paid in LOANS:
        loan = LoanAccounts(
            user_id=user.user_id, provider_id=provider.provider_id,
            account_ref_hash=blind_index(f'{provider.code}:{acct}'), account_ref_encrypted=encrypt(acct),
            account_last4=acct[-4:], provider_reference=DEMO_TAG, status=LoanLinkStatus.VERIFIED,
            product_name=product, loan_status=status, currency='INR',
            sanctioned_amount=Decimal(sanctioned), outstanding_balance=Decimal(outstanding),
            emi_amount=Decimal(emi) if emi else None,
            next_due_date=today + timedelta(days=due_in) if due_in is not None else None,
            data_as_of=snapshot, verified_at=now - timedelta(days=60),
        )
        db.session.add(loan)
        loans.append((loan, emi, paid))
    db.session.flush()

    n = 0
    for i, (loan, emi, paid) in enumerate(loans):
        amount = emi or '6500.00'
        # Monthly EMIs paid before the lender's snapshot (already reflected in its balance).
        for m in range(paid, 0, -1):
            n += 1
            when = _months_ago(now, m).replace(hour=10 + (n % 8), minute=(n * 7) % 60)
            _payment(user, loan, pay_cards[n % len(pay_cards)], amount, PaymentStatus.SUCCESS, when, n)
        if i == 0:      # a declined attempt and an abandoned checkout
            n += 1
            _payment(user, loan, pay_cards[0], amount, PaymentStatus.FAILED, now - timedelta(days=9, hours=3), n)
            n += 1
            _payment(user, loan, pay_cards[0], amount, PaymentStatus.CANCELLED, now - timedelta(days=9, hours=2), n)
        if i == 3:      # paid in the app after the snapshot → shows as "Paid"
            n += 1
            _payment(user, loan, pay_cards[0], amount, PaymentStatus.SUCCESS, now - timedelta(hours=3), n)
    db.session.commit()
    return {'user': user.full_name or user.masked_mobile, 'loans': len(loans), 'cards': len(cards), 'payments': n}
