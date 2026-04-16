import { useEffect, useMemo, useState } from 'react'
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const INITIAL_FORM = {
  amount: '',
  title: '',
  returnAmount: '',
  returnPerson: '',
  returnReceived: false,
  spentAt: new Date().toISOString().slice(0, 10),
}

const SEARCH_FILTERS = [
  { value: 'all', label: 'All time' },
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
]

const SORT_OPTIONS = [
  { value: 'spent_at_desc', label: 'Newest first' },
  { value: 'spent_at_asc', label: 'Oldest first' },
  { value: 'amount_desc', label: 'Amount: high to low' },
  { value: 'amount_asc', label: 'Amount: low to high' },
  { value: 'return_desc', label: 'Return: high to low' },
  { value: 'return_asc', label: 'Return: low to high' },
]

const DEMO_EXPENSES = [
  {
    id: 'demo-1',
    amount: 560,
    title: 'Groceries',
    return_amount: 0,
    return_person: '',
    return_received: false,
    spent_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    amount: 120,
    title: 'Taxi',
    return_amount: 50,
    return_person: 'Alex',
    return_received: false,
    spent_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-3',
    amount: 1499,
    title: 'Internet bill',
    return_amount: 0,
    return_person: '',
    return_received: false,
    spent_at: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
]

const INITIAL_AUTH_FORM = {
  email: '',
  password: '',
}

function App() {
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [searchText, setSearchText] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [sortBy, setSortBy] = useState('spent_at_desc')
  const [showPendingReturns, setShowPendingReturns] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [authForm, setAuthForm] = useState(INITIAL_AUTH_FORM)
  const [authMode, setAuthMode] = useState('signin')
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [session, setSession] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false)
      return
    }

    let mounted = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (error) {
        setAuthError(error.message)
      }

      setSession(data.session ?? null)
      setAuthLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthError('')
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    async function loadExpenses() {
      setLoading(true)
      setErrorMessage('')

      if (!isSupabaseConfigured || !supabase) {
        setExpenses(DEMO_EXPENSES)
        setInfoMessage('Demo mode is active. Add your Supabase keys in .env to save real data.')
        setLoading(false)
        return
      }

      if (!session?.user?.id) {
        setExpenses([])
        setInfoMessage('Sign in to securely manage your own expenses.')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('spent_at', { ascending: false })

      if (error) {
        setExpenses([])
        setErrorMessage(error.message)
      } else {
        setExpenses(data ?? [])
        setInfoMessage('')
      }

      setLoading(false)
    }

    loadExpenses()
  }, [session])

  const filteredExpenses = useMemo(() => {
    const filtered = expenses.filter((expense) => {
      const matchesSearch = expense.title
        .toLowerCase()
        .includes(searchText.trim().toLowerCase())

      const matchesReturn =
        !showPendingReturns ||
        (Number(expense.return_amount || 0) > 0 && !expense.return_received)

      return matchesSearch && matchesPeriod(expense.spent_at, periodFilter) && matchesReturn
    })

    return sortExpenses(filtered, sortBy)
  }, [expenses, periodFilter, searchText, showPendingReturns, sortBy])

  const totals = useMemo(() => {
    return {
      day: sumByPeriod(expenses, 'day'),
      week: sumByPeriod(expenses, 'week'),
      month: sumByPeriod(expenses, 'month'),
      year: sumByPeriod(expenses, 'year'),
    }
  }, [expenses])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setErrorMessage('')

    const nextExpense = {
      amount: Number(form.amount),
      title: form.title.trim(),
      return_amount: parseOptionalNumber(form.returnAmount),
      return_person: form.returnPerson.trim() || null,
      return_received: Boolean(form.returnReceived),
      spent_at: new Date(form.spentAt).toISOString(),
    }

    if (!nextExpense.amount || !nextExpense.title) {
      setErrorMessage('Please enter both an amount and what the money was spent on.')
      setSaving(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setExpenses((current) => [
        { id: crypto.randomUUID(), ...nextExpense },
        ...current,
      ])
      setForm(INITIAL_FORM)
      setSaving(false)
      return
    }

    if (!session?.user?.id) {
      setErrorMessage('Please sign in before adding expenses.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...nextExpense, user_id: session.user.id })
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setExpenses((current) => [data, ...current])
      setForm(INITIAL_FORM)
    }

    setSaving(false)
  }

  function startEdit(expense) {
    setEditingId(expense.id)
    setEditDraft({
      amount: String(expense.amount),
      title: expense.title,
      returnAmount:
        expense.return_amount === null || expense.return_amount === undefined
          ? ''
          : String(expense.return_amount),
      returnPerson: expense.return_person ?? '',
      returnReceived: Boolean(expense.return_received),
      spentAt: expense.spent_at.slice(0, 10),
    })
  }

  async function saveEdit(expenseId) {
    setSaving(true)
    setErrorMessage('')

    const updates = {
      amount: Number(editDraft.amount),
      title: editDraft.title.trim(),
      return_amount: parseOptionalNumber(editDraft.returnAmount),
      return_person: editDraft.returnPerson.trim() || null,
      return_received: Boolean(editDraft.returnReceived),
      spent_at: new Date(editDraft.spentAt).toISOString(),
    }

    if (!updates.amount || !updates.title) {
      setErrorMessage('Edited entries still need an amount and a label.')
      setSaving(false)
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setExpenses((current) =>
        current.map((expense) =>
          expense.id === expenseId ? { ...expense, ...updates } : expense,
        ),
      )
      setEditingId(null)
      setSaving(false)
      return
    }

    if (!session?.user?.id) {
      setErrorMessage('Please sign in before updating expenses.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
      .eq('user_id', session.user.id)
      .select()
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setExpenses((current) =>
        current.map((expense) => (expense.id === expenseId ? data : expense)),
      )
      setEditingId(null)
    }

    setSaving(false)
  }

  async function deleteExpense(expenseId) {
    setSaving(true)
    setErrorMessage('')

    if (!isSupabaseConfigured || !supabase) {
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId))
      setSaving(false)
      return
    }

    if (!session?.user?.id) {
      setErrorMessage('Please sign in before deleting expenses.')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('user_id', session.user.id)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId))
    }

    setSaving(false)
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    setAuthSubmitting(true)
    setAuthError('')
    setInfoMessage('')

    const email = authForm.email.trim().toLowerCase()
    const password = authForm.password

    if (!email || !password) {
      setAuthError('Email and password are both required.')
      setAuthSubmitting(false)
      return
    }

    let response

    if (authMode === 'signup') {
      response = await supabase.auth.signUp({ email, password })
    } else {
      response = await supabase.auth.signInWithPassword({ email, password })
    }

    const { data, error } = response

    if (error) {
      setAuthError(error.message)
    } else {
      setAuthForm(INITIAL_AUTH_FORM)

      if (authMode === 'signup' && !data.session) {
        setInfoMessage(
          'Account created. If email confirmation is enabled in Supabase, verify your email to continue.',
        )
      } else {
        setInfoMessage('Signed in successfully.')
      }
    }

    setAuthSubmitting(false)
  }

  async function handleSignOut() {
    if (!supabase) {
      return
    }

    setSaving(true)
    setErrorMessage('')

    const { error } = await supabase.auth.signOut()

    if (error) {
      setErrorMessage(error.message)
    } else {
      setExpenses([])
      setEditingId(null)
      setInfoMessage('Signed out successfully.')
    }

    setSaving(false)
  }

  if (isSupabaseConfigured && authLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="section-tag">Authentication</p>
          <h1>Checking your session...</h1>
        </section>
      </main>
    )
  }

  if (isSupabaseConfigured && !session) {
    const modeLabel = authMode === 'signup' ? 'Create account' : 'Sign in'

    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleAuthSubmit}>
          <p className="section-tag">Secure access</p>
          <h1>{modeLabel}</h1>
          <p className="hero-copy">
            This uses email and password authentication, so you are not blocked by low
            one-time email link limits.
          </p>

          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              onChange={handleFormChange(setAuthForm)}
              placeholder="you@example.com"
              type="email"
              value={authForm.email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              minLength="6"
              name="password"
              onChange={handleFormChange(setAuthForm)}
              placeholder="At least 6 characters"
              type="password"
              value={authForm.password}
            />
          </label>

          {authError ? <p className="message error">{authError}</p> : null}
          {infoMessage ? <p className="message info">{infoMessage}</p> : null}

          <button className="primary-button" disabled={authSubmitting} type="submit">
            {authSubmitting ? 'Please wait...' : modeLabel}
          </button>

          <button
            className="secondary-button"
            onClick={() => {
              setAuthMode((current) => (current === 'signup' ? 'signin' : 'signup'))
              setAuthError('')
            }}
            type="button"
          >
            {authMode === 'signup' ? 'I already have an account' : 'Create a new account'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Expense command center</p>
          <h1>Track every rupee, dollar, and bill in one clean place.</h1>
          <p className="hero-copy">
            Add expenses, search instantly, edit rows in place, and keep an eye
            on your daily, weekly, monthly, and yearly totals.
          </p>
        </div>
        <div className="hero-actions">
          <div className="status-card">
            <span className="status-label">Storage</span>
            <strong>
              {isSupabaseConfigured
                ? `Signed in as ${session?.user?.email || 'authenticated user'}`
                : 'Demo mode'}
            </strong>
          </div>
          {isSupabaseConfigured ? (
            <button className="secondary-button" disabled={saving} onClick={handleSignOut} type="button">
              Sign out
            </button>
          ) : null}
        </div>
      </section>

      <section className="summary-grid">
        <SummaryCard label="Today" amount={totals.day} accent="sun" />
        <SummaryCard label="This week" amount={totals.week} accent="ocean" />
        <SummaryCard label="This month" amount={totals.month} accent="gold" />
        <SummaryCard label="This year" amount={totals.year} accent="forest" />
      </section>

      <section className="content-grid">
        <form className="entry-card" onSubmit={handleSubmit}>
          <div className="card-header">
            <div>
              <p className="section-tag">New expense</p>
              <h2>Add a purchase</h2>
            </div>
          </div>

          <label>
            Amount
            <input
              min="0"
              name="amount"
              onChange={handleFormChange(setForm)}
              placeholder="500"
              step="0.01"
              type="number"
              value={form.amount}
            />
          </label>

          <label>
            Spent on
            <input
              name="title"
              onChange={handleFormChange(setForm)}
              placeholder="Groceries, internet bill, fuel..."
              type="text"
              value={form.title}
            />
          </label>

          <label>
            Return amount
            <input
              min="0"
              name="returnAmount"
              onChange={handleFormChange(setForm)}
              placeholder="0"
              step="0.01"
              type="number"
              value={form.returnAmount}
            />
          </label>

          <label>
            Return by
            <input
              name="returnPerson"
              onChange={handleFormChange(setForm)}
              placeholder="Name of person"
              type="text"
              value={form.returnPerson}
            />
          </label>

          <label className="checkbox-line">
            <input
              checked={form.returnReceived}
              name="returnReceived"
              onChange={handleCheckboxChange(setForm)}
              type="checkbox"
            />
            Mark return as received
          </label>

          <label>
            Date
            <input
              name="spentAt"
              onChange={handleFormChange(setForm)}
              type="date"
              value={form.spentAt}
            />
          </label>

          <button className="primary-button" disabled={saving} type="submit">
            {saving ? 'Saving...' : 'Add expense'}
          </button>
        </form>

        <section className="table-card">
          <div className="table-toolbar">
            <div>
              <p className="section-tag">Expense history</p>
              <h2>Search and edit your entries</h2>
            </div>

            <div className="toolbar-controls">
              <input
                className="search-input"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search what it was spent on"
                type="search"
                value={searchText}
              />

              <select
                className="period-select"
                onChange={(event) => setPeriodFilter(event.target.value)}
                value={periodFilter}
              >
                {SEARCH_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>

              <select
                className="period-select"
                onChange={(event) => setSortBy(event.target.value)}
                value={sortBy}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <label className="checkbox-line inline">
                <input
                  checked={showPendingReturns}
                  onChange={(event) => setShowPendingReturns(event.target.checked)}
                  type="checkbox"
                />
                Pending returns
              </label>
            </div>
          </div>

          {errorMessage ? <p className="message error">{errorMessage}</p> : null}
          {infoMessage ? <p className="message info">{infoMessage}</p> : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Spent on</th>
                  <th>Amount</th>
                  <th>Return</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredExpenses.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan="5">
                      No expenses match your current search and filter.
                    </td>
                  </tr>
                ) : null}

                {filteredExpenses.map((expense) => {
                  const isEditing = editingId === expense.id

                  return (
                    <tr key={expense.id}>
                      <td>
                        {isEditing ? (
                          <input
                            name="title"
                            onChange={handleFormChange(setEditDraft)}
                            type="text"
                            value={editDraft.title}
                          />
                        ) : (
                          expense.title
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            min="0"
                            name="amount"
                            onChange={handleFormChange(setEditDraft)}
                            step="0.01"
                            type="number"
                            value={editDraft.amount}
                          />
                        ) : (
                          formatMoney(expense.amount)
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="return-edit">
                            <input
                              min="0"
                              name="returnAmount"
                              onChange={handleFormChange(setEditDraft)}
                              placeholder="0"
                              step="0.01"
                              type="number"
                              value={editDraft.returnAmount}
                            />
                            <input
                              name="returnPerson"
                              onChange={handleFormChange(setEditDraft)}
                              placeholder="Name"
                              type="text"
                              value={editDraft.returnPerson}
                            />
                            <label className="checkbox-line">
                              <input
                                checked={editDraft.returnReceived}
                                name="returnReceived"
                                onChange={handleCheckboxChange(setEditDraft)}
                                type="checkbox"
                              />
                              Received
                            </label>
                          </div>
                        ) : expense.return_amount ? (
                          <>
                            <div>{formatMoney(expense.return_amount)}</div>
                            <div className="muted">
                              {expense.return_person || 'No name'}
                              {expense.return_received ? ' · Received' : ''}
                            </div>
                          </>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            name="spentAt"
                            onChange={handleFormChange(setEditDraft)}
                            type="date"
                            value={editDraft.spentAt}
                          />
                        ) : (
                          format(parseISO(expense.spent_at), 'dd MMM yyyy')
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="row-actions">
                            <button
                              className="table-button save"
                              onClick={() => saveEdit(expense.id)}
                              type="button"
                            >
                              Save
                            </button>
                            <button
                              className="table-button ghost"
                              onClick={() => setEditingId(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="table-button edit"
                            onClick={() => startEdit(expense)}
                            type="button"
                          >
                            Edit
                          </button>
                        )}
                        {!isEditing ? (
                          <button
                            className="table-button ghost"
                            onClick={() => deleteExpense(expense.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  )
}

function SummaryCard({ label, amount, accent }) {
  return (
    <article className={`summary-card ${accent}`}>
      <p>{label}</p>
      <strong>{formatMoney(amount)}</strong>
    </article>
  )
}

function handleFormChange(setter) {
  return (event) => {
    const { name, value } = event.target
    setter((current) => ({ ...current, [name]: value }))
  }
}

function handleCheckboxChange(setter) {
  return (event) => {
    const { name, checked } = event.target
    setter((current) => ({ ...current, [name]: checked }))
  }
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function sortExpenses(list, sortBy) {
  const sorted = [...list]

  const getReturn = (expense) => Number(expense.return_amount || 0)

  switch (sortBy) {
    case 'spent_at_asc':
      sorted.sort((a, b) => new Date(a.spent_at) - new Date(b.spent_at))
      break
    case 'amount_desc':
      sorted.sort((a, b) => Number(b.amount) - Number(a.amount))
      break
    case 'amount_asc':
      sorted.sort((a, b) => Number(a.amount) - Number(b.amount))
      break
    case 'return_desc':
      sorted.sort((a, b) => getReturn(b) - getReturn(a))
      break
    case 'return_asc':
      sorted.sort((a, b) => getReturn(a) - getReturn(b))
      break
    case 'spent_at_desc':
    default:
      sorted.sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at))
      break
  }

  return sorted
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function getNetExpenseAmount(expense) {
  const amount = Number(expense.amount || 0)
  const receivedReturn = expense.return_received ? Number(expense.return_amount || 0) : 0

  return amount - receivedReturn
}

function matchesPeriod(dateValue, period) {
  if (period === 'all') {
    return true
  }

  const now = new Date()
  const targetDate = parseISO(dateValue)

  const intervals = {
    day: { start: startOfDay(now), end: endOfDay(now) },
    week: { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) },
    month: { start: startOfMonth(now), end: endOfMonth(now) },
    year: { start: startOfYear(now), end: endOfYear(now) },
  }

  return isWithinInterval(targetDate, intervals[period])
}

function sumByPeriod(expenses, period) {
  return expenses
    .filter((expense) => matchesPeriod(expense.spent_at, period))
    .reduce((total, expense) => total + getNetExpenseAmount(expense), 0)
}

export default App
