-- Enable pg_cron extension (Supabase SQL editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deactivate_expired_sprays') THEN
    PERFORM cron.schedule(
      'deactivate_expired_sprays',
      '0 * * * *',
      $cron$
        UPDATE spray_events
        SET is_active = FALSE
        WHERE is_active = TRUE
          AND expires_at < NOW();
      $cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_water_pollution_events') THEN
    PERFORM cron.schedule(
      'expire_water_pollution_events',
      '30 2 * * *',
      $cron$
        UPDATE water_pollution_events
        SET is_active = FALSE,
            resolved_at = NOW()
        WHERE is_active = TRUE
          AND COALESCE(reported_at, created_at, NOW()) < NOW() - INTERVAL '30 days';
      $cron$
    );
  END IF;
END $$;
