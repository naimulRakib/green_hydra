-- RUN THIS IN SUPABASE SQL EDITOR TO TEST THE HEAVY METAL SYSTEM

-- 1. Grab any random farmer land you have in your database
-- We will run the heavy metal detection manually on this land
DO $$
DECLARE
    v_test_land_id UUID;
    v_result JSONB;
BEGIN
    -- Find a land_id to test with
    SELECT land_id INTO v_test_land_id FROM public.farmer_lands LIMIT 1;
    
    IF v_test_land_id IS NOT NULL THEN
        -- Run the detection!
        v_result := public.detect_and_save_metal_risk(v_test_land_id);
        
        -- Print the result to the console so you can see the math
        RAISE NOTICE 'Detection Result: %', v_result;
    ELSE
        RAISE NOTICE 'No lands found in the database to test with!';
    END IF;
END $$;
