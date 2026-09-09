const db = require('./db');

async function generateKemisReport(institution_id) {
    const instRes = await db.query(`SELECT * FROM institutions WHERE id = $1;`, [institution_id]);
    const adapterRes = await db.query(`SELECT * FROM curriculum_adapters WHERE institution_id = $1 AND is_active = TRUE;`, [institution_id]);
    
    const enrollmentRes = await db.query(`
        SELECT current_stream, status, COUNT(*) AS student_count
        FROM student_profiles
        WHERE institution_id = $1
        GROUP BY current_stream, status;
    `, [institution_id]);

    const assessmentRes = await db.query(`
        SELECT sa.competency_tier, COUNT(*) AS count
        FROM student_assessments sa
        JOIN student_profiles sp ON sa.student_id = sp.id
        WHERE sp.institution_id = $1
        GROUP BY sa.competency_tier;
    `, [institution_id]);

    return {
        reporting_standard: "KEMIS_STANDARD_V1",
        generated_at: new Date().toISOString(),
        institution: instRes.rows || null,
        active_curriculum: adapterRes.rows || null,
        enrollment_summary: enrollmentRes.rows,
        academic_telemetry: assessmentRes.rows
    };
}

module.exports = { generateKemisReport };
