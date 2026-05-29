"""add schedule_plans table

Revision ID: 004
Revises: 003
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'schedule_plans',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('planned_hours', sa.Numeric(5, 2), nullable=False),
        sa.Column('comment', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('employee_id', 'date', name='uq_schedule_employee_date'),
    )
    op.create_index('ix_schedule_plans_branch_date', 'schedule_plans', ['branch_id', 'date'])


def downgrade() -> None:
    op.drop_index('ix_schedule_plans_branch_date', table_name='schedule_plans')
    op.drop_table('schedule_plans')
