# Installation Guide

This guide walks you through setting up SenteLoans for local development or production using **PostgreSQL** and **NextAuth** (no Supabase required).

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/)) (includes npm)
- **Git** ([Download](https://git-scm.com/))
- **PostgreSQL** 14 or higher ([Download](https://www.postgresql.org/download/)) — local or hosted (e.g. [Neon](https://neon.tech), [Supabase Postgres](https://supabase.com), [Railway](https://railway.app), [AWS RDS](https://aws.amazon.com/rds/))

## 🚀 Quick Start (Local Development)

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/senteloans.git
cd senteloans
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up PostgreSQL

#### Option A: Local PostgreSQL

1. Install PostgreSQL 14+ and create a database:

   ```bash
   # macOS (Homebrew)
   brew install postgresql@14
   brew services start postgresql@14
   createdb nyuki

   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   sudo -u postgres createdb senteloans
   ```

2. Your connection string will look like:
   ```text
   postgresql://YOUR_USERNAME@localhost:5432/senteloans
   ```
   If you use a password: `postgresql://user:password@localhost:5432/senteloans`

#### Option B: Hosted PostgreSQL

Use a hosted service and copy the connection string (e.g. Neon, Supabase “Direct connection”, Railway). Ensure it uses the **direct Postgres connection string**, not the REST or pooler URL unless your provider documents it for server-side use.

### 4. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your favorite editor
nano .env.local   # or: code .env.local
```

Required variables:

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/senteloans

# NextAuth (generate secret: openssl rand -base64 32)
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

Optional (email and file storage):

```env
# Mailgun (for notifications)
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-mailgun-domain.mailgun.org
CONTACT_EMAIL=info@senteloans.com

# Vercel Blob (for KYC document uploads)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxx
```

### 5. Run Database Migrations

Migrations run in numerical order and create the schema, RLS policies, and seed data.

```bash
npm run db:migrate
```

This runs all `scripts/NN-*.sql` files (e.g. `00-postgres-auth.sql`, `01-create-schema.sql`, `02-*.sql`, …). Ensure `DATABASE_URL` is set in `.env.local` (or the shell) before running.

#### Client self-service loan applications (optional)

**Plain Postgres (this setup):** You can skip this step. Client self-service loan applications are enforced by the API (`/api/client/loans`); no extra SQL is required.

**If you use Supabase** and want RLS to allow clients to insert their own rows into `senteloans_loans`, run this once after migrations (and after `senteloans_loans` exists):

```bash
psql "$DATABASE_URL" -f scripts/02z-member-loan-insert.sql
```

The script is safe to run on plain Postgres: it will no-op (client inserts remain enforced by the API). If you see "relation senteloans_loans does not exist", run the main migrations first (`npm run db:migrate`).

### 6. Seed Auth Users (Link existing users to login)

Existing rows in `senteloans_users` and `senteloans_clients` need corresponding rows in `app_auth_users` to sign in. The seed script creates or updates `app_auth_users` and links them.

```bash
npm run db:seed-auth
```

Default password for seeded accounts is `changeme`. Override with:

```bash
SEED_DEFAULT_PASSWORD=YourSecurePassword npm run db:seed-auth
```

### 7. Verify Database Connection (Optional)

```bash
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/06-test-database-connection.ts
```

You should see a success message listing core tables.

### 8. Run the Development Server

```bash
npm run dev
```

The application will be at [http://localhost:3000](http://localhost:3000).

### 9. Access the Application

| Entry point           | URL                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| **Landing**           | [http://localhost:3000](http://localhost:3000)                           |
| **Institution login** | [http://localhost:3000/login](http://localhost:3000/login)               |
| **System admin**      | [http://localhost:3000/admin-login](http://localhost:3000/admin-login)   |
| **Client portal**     | [http://localhost:3000/client-login](http://localhost:3000/client-login) |

### 10. First Admin / Client Logins

- **Institution staff**: Use an email/password that exists in `senteloans_users` and has been linked by `npm run db:seed-auth` (or create `app_auth_users` and link manually).
- **System admin**: Use a user with `role = 'system_admin'` in `senteloans_users`, linked in `app_auth_users`.
- **Clients**: Use a client account linked via `senteloans_clients.supabase_user_id` → `app_auth_users.id` (seed script links existing clients when they have auth users).

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## 📦 Production Deployment

### Deploy to Vercel (Recommended)

#### 1. Production PostgreSQL

Use a dedicated production database (e.g. Neon, Supabase Postgres, Railway, RDS):

1. Create a new database (do not reuse development).
2. Run migrations against it:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:migrate
   ```
3. Seed auth users if you have pre-seeded institutions/users:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:seed-auth
   ```

#### 2. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel
```

Or in the [Vercel Dashboard](https://vercel.com): New Project → Import your repo → set environment variables → Deploy.

#### 3. Environment Variables in Vercel

In the project → **Settings** → **Environment Variables**, add:

| Variable                      | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `DATABASE_URL`                | Production Postgres connection string             |
| `NEXTAUTH_SECRET`             | Strong secret (e.g. `openssl rand -base64 32`)    |
| `NEXTAUTH_URL`                | Full app URL (e.g. `https://your-app.vercel.app`) |
| `NEXT_PUBLIC_APP_URL`         | Same as `NEXTAUTH_URL` for callbacks/emails       |
| `NODE_ENV`                    | `production`                                      |
| `BLOB_READ_WRITE_TOKEN`       | Optional; for KYC uploads (Vercel Blob)           |
| `MAILGUN_*` / `CONTACT_EMAIL` | Optional; for email                               |

#### 4. Custom Domain (Optional)

In Vercel → **Settings** → **Domains**, add your domain and update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` accordingly.

### Other Platforms

SenteLoans can run anywhere that supports Next.js and has a Postgres connection:

- **Netlify**, **Railway**, **DigitalOcean App Platform**, **AWS Amplify**: Set `DATABASE_URL`, `NEXTAUTH_*`, and other env vars; run migrations and seed-auth from a one-off job or locally against the production DB.
- **Self-hosted**: Use Docker or PM2; ensure Node can reach PostgreSQL and env vars are set.

## 🔧 Configuration

### Database

- All application tables use the `senteloans_` prefix.
- **Auth**: `app_auth_users` (in `scripts/00-postgres-auth.sql`) replaces Supabase Auth; `senteloans_users` and `senteloans_clients` link via `supabase_user_id` → `app_auth_users(id)`.
- **Row Level Security (RLS)** is enabled; the app sets `app.current_user_id` (and uses `auth.uid()` in SQL) so RLS policies apply correctly.
- **Migrations**: `npm run db:migrate` runs `scripts/00-*.sql` through `12-*.sql` in order.

### Email (Mailgun)

1. Sign up at [mailgun.com](https://www.mailgun.com) and verify your domain (or use sandbox).
2. Create an API key and set:
   ```env
   MAILGUN_API_KEY=your-key
   MAILGUN_DOMAIN=your-domain.mailgun.org
   CONTACT_EMAIL=info@senteloans.com
   ```

### File Storage (Vercel Blob)

KYC documents (passport photo, national ID front/back) are stored in Vercel Blob and their URLs are saved in PostgreSQL.

1. In [Vercel](https://vercel.com): **Storage** → **Create** → **Blob**.
2. Copy the **Read/Write Token** and set:
   ```env
   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxxxxx
   ```
3. Uploads go through `/api/vercel_blob/upload`; the app updates `senteloans_clients` or `senteloans_client_kyc_docs` with the blob URL.

For production, review [Vercel Blob usage and pricing](https://vercel.com/docs/storage/vercel-blob/usage-and-pricing).

## 🌍 African Market Considerations

- **Low bandwidth**: Next.js Image and minimal assets; consider a CDN and Vercel’s edge network.
- **Mobile money / USSD**: Placeholders exist in env example; implement via provider APIs and webhooks when ready.

## 🐛 Troubleshooting

### "Unauthorized" or session errors

- Ensure `NEXTAUTH_SECRET` and `NEXTAUTH_URL` are set (and in production match the real URL).
- Clear site cookies and try again.

### "Permission denied" or RLS errors

- Confirm migrations and RLS scripts ran successfully.
- Ensure the user has the correct role in `senteloans_users` and is linked in `app_auth_users` (e.g. run `npm run db:seed-auth`).

### Database connection errors

- Check `DATABASE_URL` (correct host, port, user, password, database name).
- For hosted Postgres, ensure SSL or “direct” connection string if required.
- Verify the database exists and the user has sufficient privileges.

### Build or runtime errors

```bash
rm -rf .next node_modules package-lock.json
npm install
npm run build
```

### Migrations fail

- Run migrations in order; fix any failing script before continuing.
- For a fresh DB, run from `00-postgres-auth.sql` through the numbered `NN-*.sql` files.

## 📚 Next Steps

1. **Security**: Read [SECURITY.md](./SECURITY.md).
2. **Contributing**: See [CONTRIBUTING.md](./CONTRIBUTING.md) if applicable.
3. **Explore**: Use seeded data to test institution admin, system admin, and client flows.
4. **Deploy**: Use the production steps above and keep `NEXTAUTH_SECRET` and `DATABASE_URL` secure.

## 🔄 Updating SenteLoans

```bash
git fetch origin main
git merge origin/main
npm install
npm run db:migrate   # run any new migrations
```

## 📞 Support

- **Docs**: This repo’s docs and README.
- **GitHub Issues**: Bugs and feature requests.
- **Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md) if present.

---

**Happy coding! 🚀**

Auth seeding finished. All listed staff users are linked to app_auth_users and can sign in.
You can start the app and log in:
Start the dev server (if it’s not already running):
npm run dev
System admin
URL: http://localhost:3000
Email: admin@senteloans.com
Password: changeme
Institution staff (e.g. Kampala Central SACCO)
URL: http://localhost:3000 (or your main login page)
Email: admin@kampalacentralsacco.ug (or another staff email from the seed output)
Password: changeme
Client portal
Use a client that has been given portal access (linked in senteloans_clients and seeded in app_auth_users). If the seed script only showed staff, client accounts may be created when you use “Enable login” for a client in the institution UI.
Change any default password after first login.

SACCO Member: sarah.nakamya@email.com

MFI Client: grace.namugga@email.com

Money Lender Borrower: moses.kiprotich@email.com

npm run dev
npm run socket
npm run workers
