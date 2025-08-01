-- Fix existing products with multiline names to keep only the first line
-- This addresses products that were created before the multiline fix was implemented

UPDATE products 
SET name = SPLIT_PART(name, E'\n', 1)
WHERE name LIKE '%' || E'\n' || '%'
  AND LENGTH(name) > LENGTH(SPLIT_PART(name, E'\n', 1));

-- Specifically fix the product with barcode 4036117010522 if it exists
UPDATE products 
SET name = '1000g'
WHERE barcode = '4036117010522' 
  AND name != '1000g';