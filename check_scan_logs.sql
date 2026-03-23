-- Check what types of data are in scan_logs
SELECT 
  stress_type,
  COUNT(*) as scan_count,
  AVG(confidence_score) as avg_confidence
FROM scan_logs
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY stress_type
ORDER BY scan_count DESC;

-- Check disease/pest scans specifically
SELECT 
  stress_type,
  diagnosis,
  COUNT(*) as occurrences
FROM scan_logs
WHERE stress_type IN ('Biotic_Disease', 'Biotic_Pest')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY stress_type, diagnosis
ORDER BY occurrences DESC;
