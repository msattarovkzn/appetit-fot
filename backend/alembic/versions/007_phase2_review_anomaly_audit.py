"""Phase 2: cashier_sessions, daily_branch_review, audit_log + shift/employee fields

Revision ID: 007
Revises: 006
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── shifts: новые поля (всё nullable / с default) ─────────────────────────
    op.add_column('shifts', sa.Column('is_extra_shift', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('shifts', sa.Column('extra_shift_reason', sa.String(500), nullable=True))
    op.add_column('shifts', sa.Column('approved_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('shifts', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('shifts', sa.Column('anomaly_flag', sa.String(20), nullable=True))   # warning | critical
    op.add_column('shifts', sa.Column('anomaly_resolved_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('shifts', sa.Column('anomaly_resolved_at', sa.DateTime(timezone=True), nullable=True))

    # ── employees: новые поля ─────────────────────────────────────────────────
    op.add_column('employees', sa.Column('employee_login', sa.String(100), nullable=True))
    op.add_column('employees', sa.Column('phone', sa.String(20), nullable=True))
    op.create_unique_constraint('uq_employees_employee_login', 'employees', ['employee_login'])

    # ── cashier_sessions ─────────────────────────────────────────────────────
    op.create_table(
        'cashier_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('cashier_employee_id', sa.Integer(), sa.ForeignKey('employees.id', ondelete='SET NULL'), nullable=True),
        sa.Column('shift_start', sa.Time(), nullable=True),
        sa.Column('shift_end', sa.Time(), nullable=True),
        sa.Column('revenue', sa.Numeric(12, 2), nullable=False, server_default='0'),
        sa.Column('orders_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('takeaway_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bonus_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('closed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_cashier_sessions_branch_date', 'cashier_sessions', ['branch_id', 'date'])

    # ── daily_branch_review ───────────────────────────────────────────────────
    op.create_table(
        'daily_branch_review',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(10), nullable=False, server_default='red'),
        sa.Column('issues', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('issues_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('reviewed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('branch_id', 'date', name='uq_daily_branch_review_branch_date'),
    )
    op.create_index('ix_daily_branch_review_date', 'daily_branch_review', ['date'])

    # ── audit_log ─────────────────────────────────────────────────────────────
    op.create_table(
        'audit_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_name', sa.String(200), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=True),
        sa.Column('work_date', sa.Date(), nullable=True),
        sa.Column('old_value', postgresql.JSONB(), nullable=True),
        sa.Column('new_value', postgresql.JSONB(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_audit_log_branch_date', 'audit_log', ['branch_id', 'work_date'])
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_table('audit_log')
    op.drop_table('daily_branch_review')
    op.drop_table('cashier_sessions')
    op.drop_constraint('uq_employees_employee_login', 'employees', type_='unique')
    op.drop_column('employees', 'phone')
    op.drop_column('employees', 'employee_login')
    op.drop_column('shifts', 'anomaly_resolved_at')
    op.drop_column('shifts', 'anomaly_resolved_by')
    op.drop_column('shifts', 'anomaly_flag')
    op.drop_column('shifts', 'approved_at')
    op.drop_column('shifts', 'approved_by')
    op.drop_column('shifts', 'extra_shift_reason')
    op.drop_column('shifts', 'is_extra_shift')
