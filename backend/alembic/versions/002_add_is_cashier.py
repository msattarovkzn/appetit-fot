"""add is_cashier to employees

Revision ID: 002
Revises: 001
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'employees',
        sa.Column('is_cashier', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('employees', 'is_cashier')
