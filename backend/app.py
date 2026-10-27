import os

import click
from dotenv import load_dotenv

# In development, .env must win over values inherited from the reloader's parent process.
# In PROD the real environment / secret manager stays authoritative.
load_dotenv(override=os.environ.get('APP_ENV', '').upper() not in ('PROD', 'TEST'))

from portal import InitApp, db  # noqa: E402

app = InitApp().app()


def _bootstrap():
    """Schema is owned by Flask-Migrate (`flask db upgrade`). AUTO_CREATE_TABLES=true
    is a development shortcut that creates missing tables only — it never alters or
    drops anything."""
    from sqlalchemy import inspect

    if os.getenv('AUTO_CREATE_TABLES', 'false').lower() == 'true' and app.config['APP_ENV'] != 'PROD':
        db.create_all()

    if not inspect(db.engine).has_table('card_providers'):
        app.logger.warning('Tables not found — run:  flask db upgrade')
        return

    from portal.seeders import run_all_seeders
    try:
        run_all_seeders()
        app.logger.info('All seeders executed successfully.')
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Seeder execution failed: {e}')


with app.app_context():
    try:
        _bootstrap()
    except Exception as e:   # DB down / not created yet — `flask db` commands must still work
        app.logger.warning(f'Database bootstrap skipped: {e.__class__.__name__}. '
                           'Is MySQL running and does the database exist?')


@app.cli.command('seed-demo')
@click.option('--mobile', help='E.164 mobile of the user to seed (default: most recent user).')
@click.option('--clear', is_flag=True, help='Remove the demo rows only.')
def seed_demo(mobile, clear):
    """DEV only: add demo loans, EMIs, cards and payments for one user."""
    from portal.models.users import Users
    from portal.seeders.seed_demo_data import clear_demo_data, seed_demo_data
    if clear:
        user = (Users.query.filter_by(mobile_number=mobile).first() if mobile
                else Users.query.order_by(Users.created_on.desc()).first())
        click.echo(f'Removed: {clear_demo_data(user)}' if user else 'No user found.')
        return
    click.echo(f'Seeded: {seed_demo_data(mobile)}')


if __name__ == '__main__':
    # Reload on .env edits too (keys, feature flags) — the reloader only watches .py files.
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', 5050)), debug=app.config['DEBUG'],
            extra_files=[os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')])
