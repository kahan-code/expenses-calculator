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
3. Run the SQL in [`supabase/schema.sql`](./supabase/schema.sql) inside your Supabase SQL editor.
4. Install packages with `npm install`.
5. Start the app with `npm run dev`.

## Notes

- If env keys are missing, the app runs in demo mode with sample expenses.
- All expenses are stored in the `expenses` table in Supabase.
- If you already created the old Firebase-based schema, remove the `firebase_uid` column or recreate the table using the latest `supabase/schema.sql`.
"# expenses-calculator" 
