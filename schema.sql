-- =========================================================================
-- PHASE 1: POLYMORPHIC CORE & BASE INSTITUTIONAL MVP (IDEMPOTENT)
-- Target Environment: Local PostgreSQL (WSL)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS pass_through_ledgers CASCADE;
DROP TABLE IF EXISTS grade_history CASCADE;
DROP TABLE IF EXISTS academic_cycles CASCADE;
DROP TABLE IF EXISTS student_profiles CASCADE;
DROP TABLE IF EXISTS education_stages CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;

DROP FUNCTION IF EXISTS prevent_audit_tampering CASCADE;

CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    tier VARCHAR(50) NOT NULL CHECK (tier IN ('EARLY_CHILDHOOD', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'UNIVERSITY')),
    configuration JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_institutions_tier ON institutions(tier);
CREATE INDEX idx_institutions_code ON institutions(code);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'COMPLIANCE', 'SPONSOR')),
    profile_metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_institution ON users(institution_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_phone ON users(phone_number);

CREATE TABLE education_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    stage_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sequence_order INT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_education_stages_institution ON education_stages(institution_id);

CREATE TABLE student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    admission_number VARCHAR(100) NOT NULL,
    current_stage_id UUID REFERENCES education_stages(id) ON DELETE SET NULL,
    current_stream VARCHAR(50),
    admission_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'GRADUATED', 'SUSPENDED', 'TRANSFERRED', 'DROPPED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_admission_per_institution UNIQUE (institution_id, admission_number)
);

CREATE INDEX idx_student_profiles_user ON student_profiles(user_id);
CREATE INDEX idx_student_profiles_stage ON student_profiles(current_stage_id);

CREATE TABLE academic_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    cycle_type VARCHAR(50) NOT NULL CHECK (cycle_type IN ('TERM', 'SEMESTER', 'TRIMESTER', 'YEAR')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_cycle_dates CHECK (end_date > start_date)
);

CREATE INDEX idx_academic_cycles_institution ON academic_cycles(institution_id);

CREATE TABLE grade_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
    academic_cycle_id UUID REFERENCES academic_cycles(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES education_stages(id) ON DELETE SET NULL,
    stream VARCHAR(50),
    status VARCHAR(50) NOT NULL CHECK (status IN ('PROMOTED', 'REPEATED', 'GRADUATED', 'TRANSFERRED', 'ACTIVE')),
    remarks TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_grade_history_student ON grade_history(student_id);
CREATE INDEX idx_grade_history_cycle ON grade_history(academic_cycle_id);

CREATE TABLE pass_through_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES student_profiles(id) ON DELETE SET NULL,
    transaction_reference VARCHAR(150) UNIQUE NOT NULL,
    payment_channel VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    account_number VARCHAR(100) NOT NULL,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    reconciled_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_ledger_institution ON pass_through_ledgers(institution_id);
CREATE INDEX idx_financial_ledger_student ON pass_through_ledgers(student_id);
CREATE INDEX idx_financial_ledger_ref ON pass_through_ledgers(transaction_reference);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    target_id UUID,
    payload JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are strictly immutable. UPDATE and DELETE operations are prohibited.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_audit_immutability
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_tampering();

CREATE INDEX idx_audit_logs_institution ON audit_logs(institution_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
