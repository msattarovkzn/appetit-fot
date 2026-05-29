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
      revenue: number | null;
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
    is_cashier?: boolean; comment?: string
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
  // ─────────────────────────────────────────────────────────────────────────
}
