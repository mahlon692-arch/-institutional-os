const express = require('express');
const db = require('./db');
const { evaluateAssessment } = require('./curriculum');
const { generateKemisReport } = require('./compliance');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(express.json());

// Request logger to track incoming browser traffic
app.use((req, res, next) => {
    console.log(`[INCOMING REQUEST] ${req.method} ${req.url}`);
    next();
});

app.get('/', (req, res) => {
    res.send('Institutional OS Core Running');
});

app.get('/portal/:admission_number', async (req, res) => {
    try {
        const { admission_number } = req.params;
        const query = `
            SELECT sp.*, u.phone_number, i.name as institution_name, 
                   COALESCE(sfs.total_paid, 0.00) AS total_paid
            FROM student_profiles sp
            JOIN users u ON sp.user_id = u.id
            JOIN institutions i ON sp.institution_id = i.id
            LEFT JOIN student_financial_summary sfs ON sp.id = sfs.student_id
            WHERE sp.admission_number = $1;
        `;
        const result = await db.query(query, [admission_number]);
        if (result.rows.length === 0) {
            return res.status(404).send("Student record not found.");
        }
        res.render('parent_dashboard', { student: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send(`Database Error: ${err.message}`);
    }
});

app.post('/api/ledger/ingest', async (req, res) => {
    try {
        const { institution_id, admission_number, transaction_reference, payment_channel, amount, account_number, source_metadata } = req.body;
        const studentRes = await db.query(`SELECT id FROM student_profiles WHERE admission_number = $1;`, [admission_number]);
        if (studentRes.rows.length === 0) {
            return res.status(404).json({ error: "Student admission number not found." });
        }
        const student_id = studentRes.rows[0].id;
        const ledgerQuery = `
            INSERT INTO pass_through_ledgers (institution_id, student_id, transaction_reference, payment_channel, amount, account_number, source_metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;
        await db.query(ledgerQuery, [
            institution_id, student_id, transaction_reference, 
            payment_channel || 'BANK_DIRECT', amount, account_number, 
            JSON.stringify(source_metadata || {})
        ]);
        res.status(200).json({ status: "SUCCESS", message: "Inflow recorded successfully across ledger." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ledger ingestion failed." });
    }
});

app.post('/api/teacher/assess', async (req, res) => {
    try {
        const { institution_id, student_id, teacher_assignment_id, academic_cycle_id, score_value, competency_tier } = req.body;
        const adapterRes = await db.query(
            `SELECT * FROM curriculum_adapters WHERE institution_id = $1 AND is_active = TRUE LIMIT 1;`,
            [institution_id]
        );
        if (adapterRes.rows.length === 0) {
            return res.status(400).json({ error: "No active curriculum adapter configured for this institution." });
        }
        const adapter = adapterRes.rows[0];
        const evaluationResult = evaluateAssessment(adapter, score_value, competency_tier);
        const insertQuery = `
            INSERT INTO student_assessments (student_id, teacher_assignment_id, academic_cycle_id, score_value, competency_tier, qualitative_remarks)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        await db.query(insertQuery, [
            student_id, teacher_assignment_id, academic_cycle_id,
            score_value || null, competency_tier || null,
            evaluationResult.passed ? 'Satisfactory achievement' : 'Requires academic intervention'
        ]);
        res.status(200).json({ status: "SUCCESS", evaluation: evaluationResult });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/compliance/kemis/:institution_id', async (req, res) => {
    try {
        const { institution_id } = req.params;
        const report = await generateKemisReport(institution_id);
        res.status(200).json(report);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to generate compliance telemetry report." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Institutional OS running on port ${PORT}`);
});
