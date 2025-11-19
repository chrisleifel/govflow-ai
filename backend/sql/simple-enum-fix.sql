-- Simple Role Enum Fix
-- Run this script manually via Render dashboard

-- Step 1: Remove default constraint
ALTER TABLE "Users" ALTER COLUMN "role" DROP DEFAULT;

-- Step 2: Convert column to VARCHAR
ALTER TABLE "Users" ALTER COLUMN "role" TYPE VARCHAR(50);

-- Step 3: Drop the problematic enum type
DROP TYPE IF EXISTS "enum_Users_role" CASCADE;

-- Step 4: Verify the change
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'Users' AND column_name = 'role';

-- Step 5: Check if enum type exists
SELECT typname FROM pg_type WHERE typname = 'enum_Users_role';
