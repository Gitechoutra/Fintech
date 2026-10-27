"""Saved card tokens: Razorpay customer per user, token per linked card

Revision ID: a3c1f0d2b7e4
Revises: 6e998a5914cb
Create Date: 2026-10-27 18:05:00

"""
from alembic import op
import sqlalchemy as sa


revision = 'a3c1f0d2b7e4'
down_revision = '6e998a5914cb'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users') as t:
        t.add_column(sa.Column('razorpay_customer_id', sa.String(length=40), nullable=True))
    with op.batch_alter_table('linked_cards') as t:
        t.add_column(sa.Column('gateway_token_id', sa.String(length=64), nullable=True))
        t.add_column(sa.Column('gateway_token_saved_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('linked_cards') as t:
        t.drop_column('gateway_token_saved_at')
        t.drop_column('gateway_token_id')
    with op.batch_alter_table('users') as t:
        t.drop_column('razorpay_customer_id')
