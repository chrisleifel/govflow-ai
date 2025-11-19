# Database Fix Scripts

This directory contains SQL scripts for fixing database schema issues in production.

## fix-role-enum.sql

Fixes the `enum_Users_role` type mismatch issue by:
1. Converting the role column to VARCHAR temporarily
2. Dropping the old enum type
3. Creating the correct enum type with values: 'citizen', 'staff', 'admin', 'inspector'
4. Converting the role column back to the enum type
5. Setting proper defaults and constraints

### How to Run on Render

**Option 1: Using Render Dashboard (Recommended)**

1. Go to your Render dashboard: https://dashboard.render.com
2. Navigate to your PostgreSQL database (dpg-d4d1vgfdiees73cbfhn0-a)
3. Click on "Connect" → "PSQL Command"
4. Copy the connection command and run it in your terminal
5. Once connected, copy and paste the entire content of `fix-role-enum.sql`
6. Press Enter to execute

**Option 2: Using Local psql Command**

```bash
# From Render dashboard, get your DATABASE_URL
# Then run:
psql "postgresql://user:password@host/database" -f backend/sql/fix-role-enum.sql
```

**Option 3: Using Sequelize Migration (Recommended)**

The same fix is available as a Sequelize migration. To use it:

1. Enable the migration in `package.json`:
   ```json
   "scripts": {
     "migrate": "sequelize-cli db:migrate",
     "prestart": "npm run migrate"
   }
   ```

2. Push to GitHub - Render will automatically run migrations on deployment

3. Or manually run on Render:
   ```bash
   npm run migrate
   ```

## fix-production-schema.sql

Adds the missing `status` column to the Users table.

**Note:** This is now handled automatically by `sequelize.sync({ alter: true })` in server.js, but the script is kept for reference or manual intervention if needed.

### When to Use These Scripts

- **Before first deployment**: If setting up a fresh database
- **After schema changes**: When model definitions have changed
- **Fixing type mismatches**: When you see enum-related errors in logs
- **Emergency fixes**: When auto-sync fails and manual intervention is needed

### Safety Notes

- Always backup your database before running SQL scripts
- Test scripts on a development/staging database first
- These scripts are idempotent (safe to run multiple times)
- All operations are wrapped in transactions where possible
