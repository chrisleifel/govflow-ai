-- ========================================
-- GOVLI-AI-V2 Production Schema Fix
-- ========================================
-- Purpose: Add missing 'status' column to Users table
-- Database: Render PostgreSQL (dpg-d4d1vgfdiees73cbfhn0-a)
-- Created: 2025-11-18
-- ========================================

-- Step 1: Check current schema
SELECT
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'Users'
ORDER BY ordinal_position;

-- Step 2: Create ENUM type for status (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_status') THEN
        CREATE TYPE "enum_Users_status" AS ENUM('active', 'inactive', 'suspended', 'pending');
        RAISE NOTICE 'Created enum_Users_status type';
    ELSE
        RAISE NOTICE 'enum_Users_status type already exists';
    END IF;
END $$;

-- Step 3: Add status column (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Users' AND column_name = 'status'
    ) THEN
        ALTER TABLE "Users"
        ADD COLUMN status "enum_Users_status" DEFAULT 'active' NOT NULL;
        RAISE NOTICE 'Added status column to Users table';
    ELSE
        RAISE NOTICE 'status column already exists';
    END IF;
END $$;

-- Step 4: Update existing users to have 'active' status (safety measure)
UPDATE "Users"
SET status = 'active'
WHERE status IS NULL;

-- Step 5: Verify the fix
SELECT
    COUNT(*) as total_users,
    COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
    COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
    COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended_users,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_users
FROM "Users";

-- ========================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ========================================
-- CAUTION: Only run this if you need to undo the changes
--
-- ALTER TABLE "Users" DROP COLUMN IF EXISTS status;
-- DROP TYPE IF EXISTS "enum_Users_status";
-- ========================================

-- ========================================
-- EXECUTION INSTRUCTIONS
-- ========================================
-- 1. Connect to Render PostgreSQL:
--    - Go to https://dashboard.render.com
--    - Select your database: dpg-d4d1vgfdiees73cbfhn0-a
--    - Click "Connect" > "External Connection"
--    - Use psql or any PostgreSQL client
--
-- 2. Execute this script:
--    psql -h <hostname> -U <user> -d <database> -f fix-production-schema.sql
--
-- 3. Or copy/paste into Render's SQL console
--
-- 4. Verify results in the output
-- ========================================
