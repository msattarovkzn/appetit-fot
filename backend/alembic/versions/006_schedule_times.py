"""schedule_plans: add start_time, end_time, break_minutes

Revision ID: 006
Revises: 005
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # start_time / end_time — время начала и конца смены (NULL = не задано)
    op.add_column('schedule_plans', sa.Column('start_time', sa.Time(), nullable=True))
    op.add_column('schedule_plans', sa.Column('end_time', sa.Time(), nullable=True))
    # break_minutes — перерыв (обед и т.д.), вычитается из planned_hours
    op.add_column('schedule_plans', sa.Column(
        'break_minutes', sa.SmallInteger(), nullable=False, server_default='0',
    ))


def downgrade() -> None:
    op.drop_column('schedule_plans', 'break_minutes')
    op.drop_column('schedule_plans', 'end_time')
    op.drop_column('schedule_plans', 'start_time')
