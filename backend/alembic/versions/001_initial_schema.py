"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'branches',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('city', sa.String(100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
    )

    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('username', sa.String(100), unique=True, nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(200), nullable=False),
        sa.Column('role', sa.Enum('employee', 'cashier', 'manager', 'accountant', 'owner', name='userrole'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'positions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('category', sa.Enum('admin', 'kitchen', 'tech', 'courier', 'reserve', name='positioncategory'), nullable=False),
        sa.Column('payment_type', sa.Enum('hourly', 'fixed_daily', name='paymenttype'), nullable=False),
    )

    op.create_table(
        'employees',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('full_name', sa.String(200), nullable=False),
        sa.Column('pin_hash', sa.String(255), nullable=False),
        sa.Column('position_id', sa.Integer(), sa.ForeignKey('positions.id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'employee_rates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('rate', sa.Numeric(10, 2), nullable=False),
        sa.Column('fixed_daily_rate', sa.Numeric(10, 2), nullable=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'shifts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_hours', sa.Numeric(5, 2), nullable=True),
        sa.Column('status', sa.Enum('open', 'closed', 'approved', name='shiftstatus'), nullable=False, server_default='open'),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_index('ix_shifts_branch_date', 'shifts', ['branch_id', 'date'])
    op.create_index('ix_shifts_employee_date', 'shifts', ['employee_id', 'date'])

    op.create_table(
        'branch_daily_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('revenue', sa.Numeric(12, 2), nullable=False),
        sa.Column('orders_count', sa.Integer(), nullable=False),
        sa.Column('takeaway_count', sa.Integer(), nullable=False),
        sa.Column('closed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('status', sa.Enum('draft', 'closed', 'approved', name='reportstatus'), nullable=False, server_default='closed'),
    )
    op.create_unique_constraint('uq_branch_daily_report', 'branch_daily_reports', ['branch_id', 'date'])

    op.create_table(
        'payroll_entries',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('shift_id', sa.Integer(), sa.ForeignKey('shifts.id'), nullable=True),
        sa.Column('hours_worked', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.Column('approved_hours', sa.Numeric(5, 2), nullable=False, server_default='0'),
        sa.Column('rate', sa.Numeric(10, 2), nullable=False),
        sa.Column('base_pay', sa.Numeric(10, 2), nullable=False),
        sa.Column('bonus', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('total_pay', sa.Numeric(10, 2), nullable=False),
        sa.Column('payment_type', sa.String(20), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_corrected', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('corrected_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('corrected_at', sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'fot_summary',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('daily_report_id', sa.Integer(), sa.ForeignKey('branch_daily_reports.id'), nullable=True),
        sa.Column('revenue', sa.Numeric(12, 2), nullable=False),
        sa.Column('total_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('kitchen_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('admin_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('tech_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('courier_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('reserve_fot', sa.Numeric(10, 2), nullable=False),
        sa.Column('total_fot_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('kitchen_fot_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('status_total', sa.Enum('green', 'yellow', 'red', name='fotstatus'), nullable=False),
        sa.Column('status_kitchen', sa.Enum('green', 'yellow', 'red', name='fotstatus'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('branches.id'), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('sent_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('status', sa.Enum('sent', 'failed', name='notificationstatus'), nullable=False),
        sa.Column('error_msg', sa.String(500), nullable=True),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('old_value', sa.JSON(), nullable=True),
        sa.Column('new_value', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed data
    op.execute("""
        INSERT INTO branches (name, city) VALUES
        ('Челябинск', 'Челябинск'),
        ('Казань Ямашева', 'Казань'),
        ('Казань Глушко', 'Казань'),
        ('Казань Хади Такташ', 'Казань'),
        ('Казань Шакирова', 'Казань')
    """)

    op.execute("""
        INSERT INTO positions (name, category, payment_type) VALUES
        ('Администратор-логист', 'admin', 'hourly'),
        ('Старший администратор', 'admin', 'hourly'),
        ('Бригадир', 'kitchen', 'hourly'),
        ('Заведующий производством', 'kitchen', 'fixed_daily'),
        ('Повар 1 категории', 'kitchen', 'hourly'),
        ('Повар 2 категории', 'kitchen', 'hourly'),
        ('Повар 3 категории', 'kitchen', 'hourly'),
        ('Повар-стажер', 'kitchen', 'hourly'),
        ('Су-шеф', 'kitchen', 'fixed_daily'),
        ('Кухонный работник', 'tech', 'hourly'),
        ('Технический персонал', 'tech', 'hourly'),
        ('Курьер', 'courier', 'hourly'),
        ('Логист', 'courier', 'hourly'),
        ('Резерв', 'reserve', 'hourly')
    """)


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('notifications')
    op.drop_table('fot_summary')
    op.drop_table('payroll_entries')
    op.drop_table('branch_daily_reports')
    op.drop_table('shifts')
    op.drop_table('employee_rates')
    op.drop_table('employees')
    op.drop_table('positions')
    op.drop_table('users')
    op.drop_table('branches')
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("DROP TYPE IF EXISTS positioncategory")
    op.execute("DROP TYPE IF EXISTS paymenttype")
    op.execute("DROP TYPE IF EXISTS shiftstatus")
    op.execute("DROP TYPE IF EXISTS reportstatus")
    op.execute("DROP TYPE IF EXISTS fotstatus")
    op.execute("DROP TYPE IF EXISTS notificationstatus")
