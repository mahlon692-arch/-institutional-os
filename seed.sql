-- Insert a test institution
INSERT INTO institutions (id, name, code, tier, configuration) 
VALUES ('a0000000-0000-0000-0000-000000000001', 'Nairobi Central Academy', 'NCA-001', 'PRIMARY', '{"curriculum": "CBC"}')
ON CONFLICT (code) DO NOTHING;

-- Insert a test user (Parent/Guardian or Student)
INSERT INTO users (id, institution_id, email, phone_number, password_hash, role) 
VALUES ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'parent@nca.edu', '+254712345678', 'hashed_dummy_pw', 'PARENT')
ON CONFLICT (phone_number) DO NOTHING;

-- Insert a test student profile linked to that user and institution
INSERT INTO student_profiles (id, user_id, institution_id, admission_number, current_stream, admission_date, status) 
VALUES ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ADM001', 'East', '2026-01-15', 'ACTIVE')
ON CONFLICT (institution_id, admission_number) DO NOTHING;
