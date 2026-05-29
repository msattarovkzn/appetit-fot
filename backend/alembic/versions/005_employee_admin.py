"""employee admin: pin_check, comment, position.is_active, rate.date_to

Revision ID: 005
Revises: 004
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── employees: add pin_check and comment ─────────────────────────────────
    op.add_column('employees', sa.Column('pin_check', sa.String(64), nullable=True))
    op.add_column('employees', sa.Column('comment', sa.Text(), nullable=True))

    # Unique constraint: same PIN within same branch is forbidden
    op.create_unique_constraint(
        'uq_employee_pin_branch',
        'employees',
        ['pin_check', 'branch_id'],
    )

    # ── positions: add is_active ──────────────────────────────────────────────
    op.add_column('positions', sa.Column(
        'is_active', sa.Boolean(), nullable=False, server_default='true',
    ))

    # ── employee_rates: add date_to ───────────────────────────────────────────
    op.add_column('employee_rates', sa.Column('date_to', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('employee_rates', 'date_to')
    op.drop_column('positions', 'is_active')
    op.drop_constraint('uq_employee_pin_branch', 'employees', type_='unique')
    op.drop_column('employees', 'comment')
    op.drop_column('employees', 'pin_check')
