INSERT INTO curriculum_adapters (institution_id, adapter_name, grading_type, rubric_definition, is_active)
VALUES (
    'a0000000-0000-0000-0000-000000000001', 
    'CBC_PRIMARY_2026', 
    'CBC_RUBRIC', 
    '{"tiers": ["EXCEEDING", "MEETING", "APPROACHING", "BELOW"]}'::jsonb, 
    TRUE
)
ON CONFLICT DO NOTHING;
