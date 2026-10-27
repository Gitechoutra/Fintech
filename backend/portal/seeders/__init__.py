import logging

logger = logging.getLogger('lendease.seeders')


def run_all_seeders():
    from .seed_card_providers import seed_card_providers
    from .seed_loan_providers import seed_loan_providers

    logger.info(f'[seed] card_providers: {seed_card_providers()} added')
    logger.info(f'[seed] loan_providers: {seed_loan_providers()} added')
