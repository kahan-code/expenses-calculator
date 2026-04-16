# Expense Tracker

A React expenses website with:

- Supabase for expense storage
- add expense form
- search and period filters
- inline row editing
- daily, weekly, monthly, and yearly totals

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in your Supabase keys.
3. In Supabase, enable Email/Password auth in **Authentication -> Providers -> Email**.
4. Optional but recommended for easier testing: disable **Confirm email** in **Authentication -> Providers -> Email** so signup logs in immediately without waiting for email links.
5. Run the SQL in [`supabase/schema.sql`](./supabase/schema.sql) inside your Supabase SQL editor.
6. Install packages with `npm install`.
7. Start the app with `npm run dev`.

## Notes

- If env keys are missing, the app runs in demo mode with sample expenses.
- When Supabase is configured, users sign in with email+password and only see their own data.
- All expenses are stored in the `expenses` table in Supabase.
- If you already created the old Firebase-based schema, remove the `firebase_uid` column or recreate the table using the latest `supabase/schema.sql`.
"# expenses-calculator" 
