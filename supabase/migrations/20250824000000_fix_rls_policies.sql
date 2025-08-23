-- Fix broken RLS policies that are causing permission denied errors
-- The original policy for stores was incomplete and causing cascading RLS issues

-- First, drop the broken policy if it exists
DROP POLICY IF EXISTS "Authenticated users can modify stores" ON stores;

-- Create the correct policy for stores
CREATE POLICY "Authenticated users can modify stores" ON stores
    FOR ALL USING (auth.role() = 'authenticated');

-- Ensure the update_inventory_skip_movements function has proper permissions
-- by making it SECURITY DEFINER with proper ownership
ALTER FUNCTION update_inventory_skip_movements OWNER TO postgres;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_inventory_skip_movements TO authenticated;

-- Ensure the function can bypass RLS by running as the function owner (postgres)
-- This is already set with SECURITY DEFINER but let's be explicit
ALTER FUNCTION update_inventory_skip_movements SECURITY DEFINER;

-- Add a specific policy for the function to insert/update current_inventory
-- This ensures the function can always update inventory regardless of RLS
CREATE POLICY "System functions can modify inventory" ON current_inventory
    FOR ALL TO postgres USING (true) WITH CHECK (true);
