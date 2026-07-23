# Candidate Management System

A serverless web application for managing candidate profiles, designed for HR teams. This project demonstrates modern frontend development with **React** and leverages the **Supabase** ecosystem as a Backend-as-a-Service (BaaS), including Authentication, PostgreSQL, Storage, Realtime, and Edge Functions.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, SCSS (CSS Modules), Mobile-First Responsive Design
- **Backend & Database:** Supabase (PostgreSQL, Authentication, Storage, Realtime, Edge Functions)
- **Version Control:** Git (Conventional Commits)

## Key Features

### Authentication & Authorization (Auth + RLS)

- Secure HR account registration and login.
- Row-Level Security (RLS) ensures users can only view, create, update, and delete candidates they own.

### Real-time Synchronization

- Candidate lists automatically update across all connected clients whenever data is created, updated, or deleted.
- Powered by Supabase Realtime without requiring page refreshes.

### Secure File Storage

- Upload and manage candidate resumes (PDF).
- Files are organized securely using the following structure:

```text
user_id/candidate_id/resume.pdf
```

### Serverless Business Logic (Edge Functions)

#### `add-candidate`

- Handles candidate creation entirely on the server.
- Performs validation before writing data into the database.

#### `analytics`

Generates dashboard statistics, including:

- Total candidates
- Candidate status distribution
- Top 3 most applied positions
- New candidates within the last 7 days

### User Experience

- Advanced filtering with multiple criteria.
- Full-text search.
- Server-side Cursor-based Pagination for better performance and stable pagination when new records are added.

---

# Getting Started

## 1. Prerequisites

- Node.js 20+
- A Supabase project
- Supabase CLI

## 2. Configure Supabase

1. Create a new project on Supabase.
2. Open **SQL Editor**.
3. Execute the SQL migration files located in:

```text
supabase/migrations/
```

These migrations will:

- Create the `candidates` table
- Configure the `resumes` storage bucket
- Enable Row-Level Security (RLS)
- Enable Realtime functionality

## 3. Deploy Edge Functions

Run the following commands from the project root:

```bash
# Login to Supabase
npx supabase login

# Link your local project
npx supabase link --project-ref <project-ref>

# Deploy Edge Functions
npx supabase functions deploy add-candidate
npx supabase functions deploy analytics
```

## 4. Configure Environment Variables

Create a `.env` file in the project root and add the following variables from your **Supabase Dashboard** (`Settings → API`):

```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-anon-key>
```

## 5. Install Dependencies

```bash
npm install
```

## 6. Start the Development Server

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

(or another port assigned by Vite)

---

# Project Structure

```text
.
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/             # Application pages
│   ├── hooks/             # Custom React Hooks
│   ├── services/          # Supabase services & API logic
│   ├── types/             # TypeScript definitions
│   └── styles/            # Global styles
│
├── supabase/
│   ├── functions/         # Edge Functions
│   └── migrations/        # SQL migrations
│
├── public/
└── package.json
```