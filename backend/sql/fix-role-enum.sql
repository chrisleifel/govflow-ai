-- =====================================================
-- Fix Users.role ENUM Type Issue
-- =====================================================
-- This script fixes the enum_Users_role type mismatch
-- Run this on production database before deployment

-- Step 1: Check if Users table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables
               WHERE table_name = 'Users') THEN
        RAISE NOTICE 'Users table exists';
    ELSE
        RAISE NOTICE 'Users table does not exist yet';
    END IF;
END $$;

-- Step 2: Convert role column to VARCHAR temporarily (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns
               WHERE table_name = 'Users' AND column_name = 'role') THEN

        -- Change column type to VARCHAR to disconnect from enum
        ALTER TABLE "Users"
        ALTER COLUMN "role" TYPE VARCHAR(50)
        USING "role"::VARCHAR;

        RAISE NOTICE 'Converted role column to VARCHAR';
    ELSE
        RAISE NOTICE 'Role column does not exist yet';
    END IF;
END $$;

-- Step 3: Drop the old enum type (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') THEN
        DROP TYPE "enum_Users_role" CASCADE;
        RAISE NOTICE 'Dropped old enum_Users_role type';
    ELSE
        RAISE NOTICE 'enum_Users_role type does not exist';
    END IF;
END $$;

-- Step 4: Create the correct enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Users_role') THEN
        CREATE TYPE "enum_Users_role" AS ENUM ('citizen', 'staff', 'admin', 'inspector');
        RAISE NOTICE 'Created new enum_Users_role type';
    ELSE
        RAISE NOTICE 'enum_Users_role type already exists';
    END IF;
END $$;

-- Step 5: Convert role column back to ENUM (if it's still VARCHAR)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns
               WHERE table_name = 'Users'
               AND column_name = 'role'
               AND data_type = 'character varying') THEN

        -- Convert back to enum with validation
        ALTER TABLE "Users"
        ALTER COLUMN "role" TYPE "enum_Users_role"
        USING "role"::"enum_Users_role";

        -- Set default value
        ALTER TABLE "Users"
        ALTER COLUMN "role" SET DEFAULT 'citizen';

        -- Set not null
        ALTER TABLE "Users"
        ALTER COLUMN "role" SET NOT NULL;

        RAISE NOTICE 'Converted role column back to enum_Users_role';
    ELSE
        RAISE NOTICE 'Role column is already correct type or does not exist';
    END IF;
END $$;

-- Step 6: Verify the fix
DO $$
DECLARE
    role_type TEXT;
BEGIN
    SELECT data_type INTO role_type
    FROM information_schema.columns
    WHERE table_name = 'Users' AND column_name = 'role';

    IF role_type IS NOT NULL THEN
        RAISE NOTICE 'Current role column type: %', role_type;
    ELSE
        RAISE NOTICE 'Role column does not exist yet';
    END IF;
END $$;

-- List all enum values
SELECT enumlabel as allowed_values
FROM pg_enum
WHERE enumtypid = 'enum_Users_role'::regtype
ORDER BY enumsortorder;
