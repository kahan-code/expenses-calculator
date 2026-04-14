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

function App() {
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState(INITIAL_FORM)
  const [searchText, setSearchText] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')

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

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
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
  }, [])

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const matchesSearch = expense.title
        .toLowerCase()
        .includes(searchText.trim().toLowerCase())

      return matchesSearch && matchesPeriod(expense.spent_at, periodFilter)
    })
  }, [expenses, periodFilter, searchText])

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

    const { data, error } = await supabase
      .from('expenses')
      .insert(nextExpense)
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

    const { data, error } = await supabase
      .from('expenses')
      .update(updates)
      .eq('id', expenseId)
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

    const { error } = await supabase.from('expenses').delete().eq('id', expenseId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId))
    }

    setSaving(false)
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
            <strong>{isSupabaseConfigured ? 'Supabase connected' : 'Demo mode'}</strong>
          </div>
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

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
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
    .reduce((total, expense) => total + Number(expense.amount), 0)
}

export default App
