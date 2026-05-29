"""add total_minutes and total_hours_decimal to shifts

Revision ID: 003
Revises: 002
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('shifts',
        sa.Column('total_minutes', sa.Integer(), nullable=True))
    op.add_column('shifts',
        sa.Column('total_hours_decimal', sa.Numeric(8, 4), nullable=True))

    # Backfill from existing closed shifts
    op.execute("""
        UPDATE shifts
        SET
            total_minutes = FLOOR(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60),
            total_hours_decimal = EXTRACT(EPOCH FROM (closed_at - opened_at)) / 3600
        WHERE closed_at IS NOT NULL AND opened_at IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('shifts', 'total_hours_decimal')
    op.drop_column('shifts', 'total_minutes')
