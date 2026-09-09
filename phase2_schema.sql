-- =========================================================================
-- PHASE 2: DYNAMIC CURRICULUM & TEACHER OPERATIONS SCHEMA
-- =========================================================================

-- 1. Curriculum Adapters (Decouples grading logic and policy structures)
CREATE TABLE curriculum_adapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    adapter_name VARCHAR(100) NOT NULL, -- e.g., 'CBC_PRIMARY_2026', 'STANDARD_LETTER_GRADE'
    grading_type VARCHAR(50) NOT NULL CHECK (grading_type IN ('LETTER', 'PERCENTAGE', 'CBC_RUBRIC')),
    rubric_definition JSONB NOT NULL DEFAULT '{}'::jsonb, -- Defines scales, thresholds, or CBC tiers dynamically
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_curriculum_adapters_institution ON curriculum_adapters(institution_id);

-- 2. Teacher Assignments (Links teachers to specific streams, stages, and subjects)
CREATE TABLE teacher_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    teacher_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES education_stages(id) ON DELETE CASCADE,
    stream VARCHAR(50) NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teacher_assignments_user ON teacher_assignments(teacher_user_id);
CREATE INDEX idx_teacher_assignments_stage ON teacher_assignments(stage_id);

-- 3. Student Assessments (Supports numeric metrics and CBC multi-level competency rungs)
CREATE TABLE student_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES student_profiles(id) ON DELETE CASCADE,
    teacher_assignment_id UUID REFERENCES teacher_assignments(id) ON DELETE CASCADE,
    academic_cycle_id UUID REFERENCES academic_cycles(id) ON DELETE CASCADE,
    score_value NUMERIC(5, 2), -- Used for percentage or raw numeric scales
    competency_tier VARCHAR(50) CHECK (competency_tier IN ('EXCEEDING', 'MEETING', 'APPROACHING', 'BELOW', NULL)), -- CBC Rubrics
    qualitative_remarks TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_student_assessments_student ON student_assessments(student_id);
CREATE INDEX idx_student_assessments_cycle ON student_assessments(academic_cycle_id);
