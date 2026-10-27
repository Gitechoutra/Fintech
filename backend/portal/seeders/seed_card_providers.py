"""Master data: banks and NBFCs whose credit cards users can link.

This file is the source of truth for the `card_providers` table — the app reads
the list, logos, status and required identifiers from the table, never from
frontend constants. Re-running is idempotent: missing rows are inserted and
existing rows are kept in sync with this file.

logo_url points at files served by the frontend (frontend/public/banks/). A
provider without a logo is shown with a badge in its brand colour.
"""

from portal import db
from portal.models.card_providers import CardProviders, ProviderStatus, ProviderType, VerificationMethod

LAST4 = {'key': 'last4', 'label': 'Last 4 digits of your card', 'pattern': r'\d{4}',
         'hint': 'Printed on the front of your card. Never share your full card number or CVV.'}
BAJAJ_LAST4 = {'key': 'last4', 'label': 'Last 4 digits of your Insta EMI Card', 'pattern': r'\d{4}',
               'hint': 'Shown on your Insta EMI Card and in the Bajaj Finserv app.'}

#   code         name                              short           logo            colour     popular sort
BANKS = [
    ('SBI',       'SBI Card',                       'SBI Card',     'sbi.png',      '#1A4F9C', True,  1),
    ('HDFC',      'HDFC Bank',                      'HDFC',         'hdfc.png',     '#0F3D7A', True,  2),
    ('ICICI',     'ICICI Bank',                     'ICICI',        'icici.png',    '#A3361F', True,  3),
    ('AXIS',      'Axis Bank',                      'Axis',         'axis.png',     '#97144D', True,  4),
    ('KOTAK',     'Kotak Mahindra Bank',            'Kotak',        'kotak.png',    '#C8102E', True,  5),
    ('AMEX',      'American Express',               'Amex',         'amex.png',     '#2E77BB', True,  6),
    ('IDFC',      'IDFC FIRST Bank',                'IDFC FIRST',   'idfc.png',     '#9C1D26', True,  7),
    ('INDUSIND',  'IndusInd Bank',                  'IndusInd',     'indusind.png', '#7A2E2E', True,  8),
    ('YES',       'YES Bank',                       'YES Bank',     'yes.png',      '#00518F', False, 20),
    ('AU',        'AU Small Finance Bank',          'AU Bank',      'au.png',       '#6B2C91', False, 21),
    ('RBL',       'RBL Bank',                       'RBL',          'rbl.png',      '#21409A', False, 22),
    ('HSBC',      'HSBC India',                     'HSBC',         'hsbc.png',     '#B5121B', False, 23),
    ('SC',        'Standard Chartered',             'StanChart',    'sc.png',       '#0072AA', False, 24),
    ('BOB',       'BOBCARD (Bank of Baroda)',       'BOBCARD',      'bob.png',      '#E35205', False, 25),
    ('FEDERAL',   'Federal Bank',                   'Federal',      None,           '#1C3F94', False, 26),
    ('UNION',     'Union Bank of India',            'Union Bank',   'union.png',    '#D71920', False, 100),
    ('CANARA',    'Canara Bank',                    'Canara',       None,           '#00A0E3', False, 100),
    ('PNB',       'Punjab National Bank',           'PNB',          'pnb.png',      '#A2123B', False, 100),
    ('BOI',       'Bank of India',                  'Bank of India', None,          '#F47920', False, 100),
    ('INDIAN',    'Indian Bank',                    'Indian Bank',  None,           '#0B3B8C', False, 100),
    ('CENTRAL',   'Central Bank of India',          'Central Bank', None,           '#C8102E', False, 100),
    ('IOB',       'Indian Overseas Bank',           'IOB',          'iob.png',      '#0B3B8C', False, 100),
    ('BOM',       'Bank of Maharashtra',            'Bank of Maharashtra', 'bom.png', '#0B5AA6', False, 100),
    ('IDBI',      'IDBI Bank',                      'IDBI',         'idbi.png',     '#00836C', False, 100),
    ('SIB',       'South Indian Bank',              'South Indian', None,           '#B5121B', False, 100),
    ('KVB',       'Karur Vysya Bank',               'KVB',          'kvb.png',      '#0E7A3C', False, 100),
    ('CUB',       'City Union Bank',                'City Union',   None,           '#B5121B', False, 100),
    ('KTK',       'Karnataka Bank',                 'Karnataka Bank', 'ktk.png',    '#6B2C91', False, 100),
    ('DCB',       'DCB Bank',                       'DCB',          None,           '#00A0E3', False, 100),
    ('CSB',       'CSB Bank',                       'CSB',          'csb.png',      '#0B3B8C', False, 100),
    ('SBM',       'SBM Bank India',                 'SBM',          'sbm.png',      '#0B3B8C', False, 100),
    ('BANDHAN',   'Bandhan Bank',                   'Bandhan',      'bandhan.png',  '#E1251B', False, 100),
]


def _rows():
    rows = [dict(code=code, name=name, short_name=short, provider_type=ProviderType.BANK,
                 logo_url=f'/banks/{logo}' if logo else None, brand_color=color,
                 offers_credit_card=True, card_product_name=None, status=ProviderStatus.ACTIVE,
                 verification_method=VerificationMethod.MOBILE_OTP, required_identifiers=[LAST4],
                 is_popular=popular, sort_order=sort)
            for code, name, short, logo, color, popular, sort in BANKS]
    rows.append(dict(
        code='BAJAJ', name='Bajaj Finance', short_name='Bajaj Finserv', provider_type=ProviderType.NBFC,
        logo_url=None, brand_color='#0072BC', offers_credit_card=True,
        card_product_name='Bajaj Finserv Insta EMI Card', status=ProviderStatus.ACTIVE,
        verification_method=VerificationMethod.MOBILE_OTP, required_identifiers=[BAJAJ_LAST4],
        is_popular=True, sort_order=9))
    return rows


def seed_card_providers():
    added = 0
    for row in _rows():
        p = CardProviders.query.filter_by(code=row['code']).first()
        if p is None:
            db.session.add(CardProviders(**row))
            added += 1
        else:
            for k, v in row.items():
                setattr(p, k, v)
    db.session.commit()
    return added
