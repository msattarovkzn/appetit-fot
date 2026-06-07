const BASE = '/proxy'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Ошибка сервера' }))
    throw new Error(err.detail || 'Ошибка')
  }
  return res.json()
}

export const api = {
  login: (username: string, password: string) =>
    request<{ access_token: string; role: string; full_name: string; branch_id: number | null }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ username, password }) }
    ),

  changePassword: (old_password: string, new_password: string) =>
    request<{ ok: boolean }>('/auth/me/password', {
      method: 'PATCH', body: JSON.stringify({ old_password, new_password }),
    }),

  verifyPin: (pin: string, branch_id: number) =>
    request<{ id: number; full_name: string }>(
      '/auth/pin-verify',
      { method: 'POST', body: JSON.stringify({ pin, branch_id }) }
    ),

  checkShiftStatus: (pin: string, branch_id: number) =>
    request<{
      employee_id: number; employee_name: string;
      has_open_shift: boolean; shift_id: number | null;
      opened_at: string | null; hours_so_far: number | null;
    }>('/shifts/status', { method: 'POST', body: JSON.stringify({ pin, branch_id }) }),

  openShift: (pin: string, branch_id: number) =>
    request<{ id: number; employee_id: number; status: string; employee_name: string }>(
      '/shifts/open',
      { method: 'POST', body: JSON.stringify({ pin, branch_id }) }
    ),

  closeShift: (pin: string, branch_id: number) =>
    request<{ id: number; status: string; employee_name: string; approved_hours: number | null }>(
      '/shifts/close',
      { method: 'POST', body: JSON.stringify({ pin, branch_id }) }
    ),

  getShifts: (branch_id: number, date?: string) => {
    const params = new URLSearchParams({ branch_id: String(branch_id) })
    if (date) params.append('shift_date', date)
    return request<Array<{ id: number; employee_name: string; status: string; opened_at: string; closed_at: string | null }>>(`/shifts/?${params}`)
  },

  closeDay: (data: { branch_id: number; date: string; revenue: number; orders_count: number; takeaway_count: number }) =>
    request('/cashier/close-day', { method: 'POST', body: JSON.stringify(data) }),

  cashierCheckPin: (pin: string, branch_id: number) =>
    request<{
      employee_id: number; employee_name: string;
      has_open_shift: boolean; opened_at: string | null; hours_so_far: number | null;
    }>('/cashier/check-pin', { method: 'POST', body: JSON.stringify({ pin, branch_id }) }),

  cashierCloseByPin: (data: {
    pin: string; branch_id: number; date: string;
    revenue: number; orders_count: number; takeaway_count: number; comment?: string
  }) =>
    request<{
      employee_name: string; branch_name: string; date: string;
      unclosed_count: number; unclosed_names: string[]; bot_message: string;
    }>(
      '/cashier/close-day-by-pin',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getBranches: () =>
    request<Array<{ id: number; name: string; city: string }>>('/branches/'),

  getDashboard: (params: { from_date?: string; to_date?: string; branch_id?: number }) => {
    const p = new URLSearchParams()
    if (params.from_date) p.append('from_date', params.from_date)
    if (params.to_date) p.append('to_date', params.to_date)
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    return request<Array<{
      date: string; branch_id: number; branch_name: string;
      revenue: number | null; orders_count: number | null;
      total_fot: number | null; kitchen_fot: number | null;
      total_fot_pct: number | null; kitchen_fot_pct: number | null;
      status_total: string | null; status_kitchen: string | null;
      open_shifts: number;
    }>>(`/dashboard/?${p}`)
  },

  getEmployees: (branch_id?: number) => {
    const p = branch_id ? `?branch_id=${branch_id}` : ''
    return request<Array<{
      id: number; full_name: string; is_active: boolean; is_cashier: boolean;
      branch_id: number;
      position: { name: string; category: string; payment_type: string } | null;
    }>>(`/employees/${p}`)
  },

  getEmployeeRates: (employee_id: number) =>
    request<Array<{ id: number; rate: number; fixed_daily_rate: number | null; effective_from: string }>>(
      `/employees/${employee_id}/rates`
    ),

  getReports: (branch_id: number, from_date: string, to_date: string) => {
    const p = new URLSearchParams({ branch_id: String(branch_id), from_date, to_date })
    return request<Array<{
      id: number; branch_id: number; date: string;
      revenue: number; orders_count: number; takeaway_count: number;
      closed_at: string; status: string;
    }>>(`/cashier/reports?${p}`)
  },

  getFotSummary: (branch_id: number, from_date: string, to_date: string) => {
    const p = new URLSearchParams({ branch_id: String(branch_id), from_date, to_date })
    return request<Array<{
      id: number; date: string; revenue: number;
      total_fot: number; kitchen_fot: number; admin_fot: number;
      tech_fot: number; courier_fot: number;
      total_fot_pct: number; kitchen_fot_pct: number;
      status_total: string; status_kitchen: string;
    }>>(`/payroll/fot-summary?${p}`)
  },

  getFotBranches: (from_date: string, to_date: string) => {
    const p = new URLSearchParams({ from_date, to_date })
    return request<Array<{
      branch_id: number; branch_name: string;
      revenue: number; orders_count: number;
      total_fot: number; kitchen_fot: number;
      total_fot_pct: number | null; kitchen_fot_pct: number | null;
      status_total: string | null; status_kitchen: string | null;
      days_closed: number;
    }>>(`/dashboard/branches?${p}`)
  },

  getFotBranchDetail: (branch_id: number, from_date: string, to_date: string) => {
    const p = new URLSearchParams({ from_date, to_date })
    return request<{
      branch_id: number; branch_name: string;
      from_date: string; to_date: string;
      revenue: number; orders_count: number;
      total_fot: number; kitchen_fot: number;
      admin_fot: number; tech_fot: number; courier_fot: number; reserve_fot: number;
      total_fot_pct: number; kitchen_fot_pct: number;
      status_total: string; status_kitchen: string;
      plan_total: number; plan_kitchen: number;
      deviation_total: number; deviation_kitchen: number;
      entries: Array<{
        employee_id: number; employee_name: string;
        category: string; payment_type: string;
        approved_hours: number; rate: number;
        base_pay: number; bonus: number; total_pay: number;
      }>;
    }>(`/dashboard/branch/${branch_id}?${p}`)
  },

  getFotNetwork: (from_date: string, to_date: string) => {
    const p = new URLSearchParams({ from_date, to_date })
    return request<{
      from_date: string; to_date: string;
      total_revenue: number; total_fot: number; total_fot_pct: number | null;
      branches: Array<{
        branch_id: number; branch_name: string;
        revenue: number; orders_count: number;
        total_fot: number; kitchen_fot: number;
        total_fot_pct: number | null; kitchen_fot_pct: number | null;
        status_total: string | null; status_kitchen: string | null;
        days_closed: number;
      }>;
    }>(`/dashboard/network?${p}`)
  },

  // ── Test mode (development only, branch_id=1 Chelyabinsk) ──────────────────
  testPing: () =>
    request<{ test_mode: boolean; test_branch_id: number }>('/test/ping'),

  testShiftStatus: (pin: string, branch_id: number, date: string) =>
    request<{
      employee_id: number; employee_name: string;
      has_open_shift: boolean; shift_id: number | null; opened_at: string | null;
    }>('/test/shift-status', { method: 'POST', body: JSON.stringify({ pin, branch_id, date }) }),

  testOpenShift: (pin: string, branch_id: number, date: string) =>
    request<{
      id: number; employee_name: string; date: string;
      opened_at: string; status: string; already_existed: boolean;
    }>('/test/open-shift', { method: 'POST', body: JSON.stringify({ pin, branch_id, date }) }),

  testCloseShift: (pin: string, branch_id: number, date: string, hours: number) =>
    request<{
      id: number; employee_name: string; date: string;
      opened_at: string; closed_at: string;
      total_minutes: number; approved_hours: number; status: string;
    }>('/test/close-shift', { method: 'POST', body: JSON.stringify({ pin, branch_id, date, hours }) }),

  testResetDay: (branch_id: number, date: string) =>
    request<{
      reset: boolean; branch_id: number; date: string;
      deleted: { fot_summary: number; payroll_entries: number; notifications: number; branch_daily_reports: number };
    }>('/test/reset-day', { method: 'POST', body: JSON.stringify({ branch_id, date }) }),
  // ────────────────────────────────────────────────────────────────────────────

  // ── Schedule planning ────────────────────────────────────────────────────────
  getScheduleWeek: (branch_id: number, week_start: string) => {
    const p = new URLSearchParams({ branch_id: String(branch_id), week_start })
    return request<{
      week_start: string; week_end: string;
      branch_id: number; branch_name: string;
      days: string[];
      employees: Array<{
        employee_id: number; employee_name: string;
        category: string; payment_type: string;
        rate: number; fixed_daily_rate: number | null;
        plans: Record<string, {
          plan_id: number; planned_hours: number; comment: string;
          start_time: string | null; end_time: string | null; break_minutes: number;
        } | null>;
        actuals: Record<string, {
          approved_hours: number; shift_count: number;
          first_opened: string | null; last_closed: string | null;
        } | null>;
        debug_shifts: Array<{
          id: number; date: string; opened_at: string | null; closed_at: string | null;
          total_minutes: number | null; approved_hours: number | null; computed_hours: number;
        }>;
      }>;
    }>(`/schedule/week?${p}`)
  },

  saveSchedule: (branch_id: number, entries: Array<{
    employee_id: number; date: string;
    planned_hours: number;
    start_time?: string; end_time?: string; break_minutes?: number;
    comment: string;
  }>) =>
    request<{ saved: number; deleted: number }>(
      '/schedule/save',
      { method: 'POST', body: JSON.stringify({ branch_id, entries }) }
    ),

  deleteScheduleEntry: (plan_id: number) =>
    request<void>(`/schedule/entry/${plan_id}`, { method: 'DELETE' }),
  // ────────────────────────────────────────────────────────────────────────────

  getPayrollEntries: (branch_id: number, from_date: string, to_date: string) => {
    const p = new URLSearchParams({ branch_id: String(branch_id), from_date, to_date })
    return request<Array<{
      id: number; employee_id: number; date: string;
      hours_worked: number; approved_hours: number; rate: number;
      base_pay: number; bonus: number; total_pay: number;
      payment_type: string; is_corrected: boolean;
    }>>(`/payroll/entries?${p}`)
  },

  // ── Admin: employees ─────────────────────────────────────────────────────
  adminListEmployees: (params: { branch_id?: number; status?: string; category?: string; search?: string }) => {
    const p = new URLSearchParams()
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    if (params.status) p.append('status', params.status)
    if (params.category) p.append('category', params.category)
    if (params.search) p.append('search', params.search)
    return request<Array<{
      id: number; full_name: string; branch_id: number
      is_cashier: boolean; is_active: boolean; comment: string | null
      position_id: number; position_name: string | null
      category: string | null; payment_type: string | null
      current_rate: number | null; current_fixed_daily_rate: number | null
    }>>(`/admin/employees?${p}`)
  },

  adminGetEmployee: (id: number) =>
    request<{
      id: number; full_name: string; branch_id: number
      is_cashier: boolean; is_active: boolean; comment: string | null
      position_id: number; position_name: string | null
      category: string | null; payment_type: string | null
      current_rate: number | null; current_fixed_daily_rate: number | null
      created_at: string
      rates: Array<{
        id: number; rate: number; fixed_daily_rate: number | null
        effective_from: string; date_to: string | null
        created_by: number; created_by_name: string | null; created_at: string
      }>
    }>(`/admin/employees/${id}`),

  adminCreateEmployee: (data: {
    full_name: string; pin: string; branch_id: number; position_id: number
    is_cashier: boolean; comment?: string
    rate: number; fixed_daily_rate?: number; effective_from: string
  }) =>
    request<{ id: number; full_name: string }>('/admin/employees', {
      method: 'POST', body: JSON.stringify(data),
    }),

  adminUpdateEmployee: (id: number, data: {
    full_name?: string; pin?: string; position_id?: number
    is_cashier?: boolean; comment?: string; employee_login?: string | null
  }) =>
    request<{ id: number; full_name: string }>(`/admin/employees/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  adminDismissEmployee: (id: number) =>
    request<{ id: number; is_active: boolean }>(`/admin/employees/${id}/dismiss`, { method: 'POST' }),

  adminActivateEmployee: (id: number) =>
    request<{ id: number; is_active: boolean }>(`/admin/employees/${id}/activate`, { method: 'POST' }),

  adminAddRate: (employee_id: number, data: {
    rate: number; fixed_daily_rate?: number; effective_from: string
  }) =>
    request<{ id: number; rate: number; effective_from: string }>(
      `/admin/employees/${employee_id}/rates`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // ── Admin: positions ─────────────────────────────────────────────────────
  adminListPositions: (include_inactive = false) => {
    const p = include_inactive ? '?include_inactive=true' : ''
    return request<Array<{
      id: number; name: string; category: string
      payment_type: string; is_active: boolean; employee_count: number
    }>>(`/admin/positions${p}`)
  },

  adminCreatePosition: (data: { name: string; category: string; payment_type: string }) =>
    request<{ id: number; name: string; category: string; payment_type: string; is_active: boolean; employee_count: number }>(
      '/admin/positions', { method: 'POST', body: JSON.stringify(data) }
    ),

  adminUpdatePosition: (id: number, data: {
    name?: string; category?: string; payment_type?: string; is_active?: boolean
  }) =>
    request<{ id: number; name: string; is_active: boolean; employee_count: number }>(
      `/admin/positions/${id}`, { method: 'PUT', body: JSON.stringify(data) }
    ),

  // ── Admin: shifts (correction, manual close) ─────────────────────────────
  adminGetShifts: (params: { from_date: string; to_date: string; branch_id?: number; employee_id?: number; status?: string }) => {
    const p = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    if (params.employee_id) p.append('employee_id', String(params.employee_id))
    if (params.status) p.append('status', params.status)
    return request<Array<{
      id: number; employee_id: number; employee_name: string
      branch_id: number; branch_name: string
      date: string; opened_at: string | null; closed_at: string | null
      approved_hours: number | null; status: string
      is_corrected: boolean; note: string | null
    }>>(`/admin/shifts?${p}`)
  },

  adminCorrectShift: (shift_id: number, approved_hours: number, note?: string) =>
    request<{ ok: boolean; shift_id: number; approved_hours: number }>(
      `/admin/shifts/${shift_id}`,
      { method: 'PATCH', body: JSON.stringify({ approved_hours, note }) }
    ),

  // ── Admin: monthly report ────────────────────────────────────────────────
  adminMonthlyReport: (year: number, month: number, branch_id?: number) => {
    const p = new URLSearchParams({ year: String(year), month: String(month) })
    if (branch_id) p.append('branch_id', String(branch_id))
    return request<{
      year: number; month: number; branch_id: number | null
      rows: Array<{
        employee_id: number; employee_name: string
        position: string; category: string
        payment_type: string; rate: number
        days_worked: number; total_hours: number
        base_pay: number; bonus: number; total_pay: number
        has_corrections: boolean
      }>
      total_hours: number; total_pay: number
    }>(`/admin/monthly-report?${p}`)
  },

  // ── Admin: corrections log ───────────────────────────────────────────────
  adminCorrectionsLog: (params: { from_date: string; to_date: string; branch_id?: number }) => {
    const p = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    return request<Array<{
      id: number; date: string; employee_name: string
      approved_hours: number; total_pay: number
      notes: string | null; corrected_by: string; corrected_at: string | null
    }>>(`/admin/corrections-log?${p}`)
  },

  // ── Admin: plan vs fact ───────────────────────────────────────────────────
  adminPlanVsFact: (week_start: string, branch_id: number) =>
    request<{
      week_start: string; week_end: string; branch_id: number
      rows: Array<{
        employee_id: number; employee_name: string
        planned_hours: number; actual_hours: number; diff: number
      }>
    }>(`/admin/plan-vs-fact?week_start=${week_start}&branch_id=${branch_id}`),

  // ── Admin: violations ─────────────────────────────────────────────────────
  adminViolations: (params: { from_date: string; to_date: string; branch_id?: number }) => {
    const p = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    return request<Array<{
      employee_id: number; employee_name: string; branch_name: string
      unclosed: number; manual_closed: number; total: number; last_incident: string
    }>>(`/admin/violations?${p}`)
  },

  // ── Review: статусы филиалов (Блок 3) ────────────────────────────────────
  reviewList: (review_date?: string) => {
    const p = review_date ? `?review_date=${review_date}` : ''
    return request<{
      date: string
      branches: Array<{
        branch_id: number; branch_name: string; date: string
        status: string; emoji: string
        issues_count: number; issues: string[]; issues_labels: string[]
        reviewed_by: string | null; reviewed_at: string | null
      }>
    }>(`/review${p}`)
  },

  reviewDetail: (branch_id: number, review_date: string) =>
    request<{
      branch_id: number; date: string
      status: string; emoji: string
      issues_count: number; issues: string[]; issues_labels: string[]
      reviewed_by: string | null; reviewed_at: string | null; notes: string | null
      daily_report: { revenue: number | null; orders_count: number | null; takeaway_count: number | null; avg_check: number | null }
      fot: { total_fot: number | null; kitchen_fot: number | null; total_fot_pct: number | null; kitchen_fot_pct: number | null; status_total: string | null; status_kitchen: string | null }
      plan_fact: { plan_hours: number; fact_hours: number; plan_fot: number; fact_fot: number | null }
      verdict: string
      shifts: Array<{
        id: number; employee_id: number; employee_name: string
        position_name: string; category: string; payment_type: string; comment: string | null
        status: string; is_extra_shift: boolean; extra_shift_reason: string | null
        opened_at: string | null; closed_at: string | null; hours: number | null
        anomaly_flag: string | null; anomaly_resolved: boolean
        is_corrected: boolean; is_annulled: boolean; note: string | null
        rate: number | null; fixed_daily_rate: number | null
        approved_hours: number | null; base_pay: number | null; bonus: number; total_pay: number | null
        plan_hours: number | null; plan_start: string | null; plan_end: string | null
      }>
    }>(`/review/${branch_id}/${review_date}`),

  reviewCorrectShift: (shift_id: number, body: {
    opened_at?: string; closed_at?: string
    approved_hours?: number; rate_override?: number
    annul?: boolean; note?: string
  }) =>
    request<{ ok: boolean; shift_id: number; approved_hours: number | null; total_pay: number; annulled: boolean }>(
      `/review/shifts/${shift_id}/correct`,
      { method: 'PATCH', body: JSON.stringify(body) }
    ),

  reviewVerify: (branch_id: number, review_date: string, notes?: string) =>
    request<{ ok: boolean; status: string; reviewed_by: string; reviewed_at: string }>(
      `/review/${branch_id}/${review_date}/verify`,
      { method: 'POST', body: JSON.stringify({ notes: notes ?? null }) }
    ),

  reviewReopen: (branch_id: number, review_date: string) =>
    request<{ ok: boolean; status: string }>(
      `/review/${branch_id}/${review_date}/reopen`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  reviewResolveAnomaly: (shift_id: number, approved_hours?: number, comment?: string) =>
    request<{ ok: boolean; shift_id: number; resolved_by: string }>(
      `/review/shifts/${shift_id}/resolve`,
      { method: 'POST', body: JSON.stringify({ approved_hours: approved_hours ?? null, comment: comment ?? null }) }
    ),

  reviewAuditLog: (params: { from_date: string; to_date: string; branch_id?: number; entity_type?: string }) => {
    const p = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    if (params.entity_type) p.append('entity_type', params.entity_type)
    return request<Array<{
      id: number; entity_type: string; entity_id: number | null; action: string
      user_name: string | null; branch_id: number | null; work_date: string | null
      old_value: any; new_value: any; comment: string | null; created_at: string
    }>>(`/review/audit-log?${p}`)
  },
  // ── Cashier: extra shifts + sessions (Блок 1, 2) ─────────────────────────
  cashierOpenExtraShift: (data: {
    pin: string; branch_id: number; employee_id: number
    start_time?: string; reason?: string
  }) =>
    request<{ ok: boolean; shift_id: number; employee_name: string; opened_at: string; opened_by: string }>(
      '/cashier/extra-shift/open',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  cashierCloseExtraShift: (data: { pin: string; branch_id: number; shift_id: number }) =>
    request<{ ok: boolean; shift_id: number; employee_name: string; approved_hours: number; closed_by: string }>(
      '/cashier/extra-shift/close',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  cashierSessions: (branch_id: number, session_date: string) => {
    const p = new URLSearchParams({ branch_id: String(branch_id), session_date })
    return request<Array<{
      id: number; cashier_name: string
      shift_start: string | null; shift_end: string | null
      revenue: number; orders_count: number; takeaway_count: number
      bonus_amount: number; closed_at: string | null
    }>>(`/cashier/sessions?${p}`)
  },
  // ── Analytics (Блок 8) ───────────────────────────────────────────────────
  analyticsOverview: (params: { from_date: string; to_date: string; branch_id?: number }) => {
    const p = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    return request<{
      period: { from_date: string; to_date: string; days: number }
      totals: {
        revenue: number; orders: number; takeaways: number
        avg_revenue_per_day: number; avg_orders_per_day: number; avg_check: number | null
        total_fot: number; kitchen_fot: number
        total_fot_pct: number | null; kitchen_fot_pct: number | null
      }
      vs_prev_period: {
        revenue_diff_pct: number | null; revenue_diff_abs: number | null
        avg_check_diff_pct: number | null; orders_diff_pct: number | null
        prev_revenue: number; prev_orders: number; prev_avg_check: number | null
      }
      trend: Array<{
        date: string; weekday: string
        revenue: number; orders: number; takeaways: number; avg_check: number | null
        total_fot: number; kitchen_fot: number
        total_fot_pct: number | null; kitchen_fot_pct: number | null
      }>
      weekday_stats: Array<{ weekday: string; avg_revenue: number; samples: number }>
      best_weekday: string | null; worst_weekday: string | null
      branch_stats: Array<{
        branch_id: number; branch_name: string
        revenue: number; orders: number; days: number; avg_revenue: number
      }>
      best_branch: any; worst_branch: any
      month_forecast: {
        month_revenue_so_far: number; days_elapsed: number; days_in_month: number
        projected_month_revenue: number | null
      }
    }>(`/analytics/overview?${p}`)
  },

  analyticsCompare: (params: { period: string; branch_id?: number }) => {
    const p = new URLSearchParams({ period: params.period })
    if (params.branch_id) p.append('branch_id', String(params.branch_id))
    return request<{
      period: string
      current: { from: string; to: string; revenue: number; orders: number; avg_check: number | null; avg_revenue: number | null; days: number }
      previous: { from: string; to: string; revenue: number; orders: number; avg_check: number | null; avg_revenue: number | null; days: number }
      diff: { revenue_abs: number | null; revenue_pct: number | null; orders_pct: number | null; avg_check_pct: number | null }
    }>(`/analytics/compare?${p}`)
  },
  // ── Employee cabinet (Блок 9) ─────────────────────────────────────────────
  employeeLogin: (login: string, pin: string) =>
    request<{
      access_token: string; employee_id: number; full_name: string
      position: string; branch: string; rate: number | null; payment_type: string | null
    }>('/employee/login', { method: 'POST', body: JSON.stringify({ login, pin }) }),

  employeeProfile: (token: string) =>
    fetch(`${BASE}/employee/me`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Ошибка' })); throw new Error(e.detail) }
      return r.json() as Promise<{
        id: number; full_name: string; position: string; category: string
        payment_type: string; branch: string; is_cashier: boolean
        rate: number | null; fixed_daily_rate: number | null; rate_since: string | null
      }>
    }),

  employeePayroll: (token: string, year: number, month: number) =>
    fetch(`${BASE}/employee/me/payroll?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Ошибка' })); throw new Error(e.detail) }
      return r.json() as Promise<{
        year: number; month: number; days_worked: number; total_hours: number; total_pay: number
        projected_pay: number | null; days_elapsed: number; days_in_month: number
        entries: Array<{ date: string; hours: number; base_pay: number; bonus: number; total_pay: number; is_corrected: boolean }>
      }>
    }),

  employeeShifts: (token: string, year: number, month: number) =>
    fetch(`${BASE}/employee/me/shifts?year=${year}&month=${month}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Ошибка' })); throw new Error(e.detail) }
      return r.json() as Promise<{
        year: number; month: number
        shifts: Array<{ id: number; date: string; status: string; is_extra_shift: boolean; opened_at: string | null; closed_at: string | null; hours: number | null; total_pay: number | null; is_corrected: boolean; anomaly_flag: string | null; note: string | null }>
      }>
    }),

  employeeSchedule: (token: string, week_start?: string) => {
    const qs = week_start ? `?week_start=${week_start}` : ''
    return fetch(`${BASE}/employee/me/schedule${qs}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: 'Ошибка' })); throw new Error(e.detail) }
      return r.json() as Promise<{
        week_start: string; week_end: string; employee_name: string
        days: Array<{ date: string; weekday: string; is_today: boolean; is_past: boolean; plan_hours: number | null; plan_start: string | null; plan_end: string | null; actual_hours: number | null; has_open_shift: boolean; shifts_count: number }>
      }>
    })
  },
  // ─────────────────────────────────────────────────────────────────────────
}
