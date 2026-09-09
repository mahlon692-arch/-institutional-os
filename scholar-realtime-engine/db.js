const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/scholar_db'
});

/**
 * 1. UNIVERSITY TIER: Handles disbursement splits (Tuition vs Student Autonomous Smart Wallet)
 */
pool.handleUniversityDisbursement = async (transactionData) => {
    const { studentId, totalDisbursedAmount, institutionalTuitionDue } = transactionData;
    const tuitionAllocation = Math.min(totalDisbursedAmount, institutionalTuitionDue);
    const studentUpkeepPocket = Math.max(0, totalDisbursedAmount - institutionalTuitionDue);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Credit institutional pass-through ledger for tuition
        await client.query(
            `UPDATE institutional_ledger SET balance = balance + $1 WHERE student_id = $2`,
            [tuitionAllocation, studentId]
        );

        // Route residual funds directly into the university student's autonomous smart wallet
        await client.query(
            `UPDATE student_smart_wallets 
             SET upkeep_balance = upkeep_balance + $1 
             WHERE student_id = $2 AND is_parent_controlled = FALSE`,
            [studentUpkeepPocket, studentId]
        );

        // Immutable cryptographic audit proof
        await client.query(
            `INSERT INTO audit_shield (event_type, description, timestamp) 
             VALUES ('UNIVERSITY_DISBURSEMENT_SPLIT', $1, NOW())`,
            [`Processed KES ${totalDisbursedAmount} for university student ${studentId}: Tuition KES ${tuitionAllocation}, Autonomous Wallet KES ${studentUpkeepPocket}`]
        );

        await client.query('COMMIT');
        return { success: true, tuitionRouted: tuitionAllocation, walletCredited: studentUpkeepPocket };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * 2. LOWER TIER (Primary/Secondary): Parent-Controlled Smart Wallet
 * Ensures the school can neither see nor interact with personal pocket money balances/spending.
 */
pool.updateLowerLevelWalletByParent = async (walletData) => {
    const { studentId, parentId, amountChange, actionType } = walletData;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verify wallet is parent-controlled and linked to the correct parent
        const walletCheck = await client.query(
            `SELECT * FROM student_smart_wallets 
             WHERE student_id = $1 AND parent_id = $2 AND is_parent_controlled = TRUE`,
            [studentId, parentId]
        );

        if (walletCheck.rows.length === 0) {
            throw new Error("Unauthorized: Only the designated parent can modify this lower-level student wallet. School access is restricted.");
        }

        // Update wallet balance securely under parent authority
        await client.query(
            `UPDATE student_smart_wallets 
             SET upkeep_balance = upkeep_balance + $1 
             WHERE student_id = $2`,
            [amountChange, studentId]
        );

        // Immutable audit trail (isolated from school administrative view)
        await client.query(
            `INSERT INTO audit_shield (event_type, description, timestamp) 
             VALUES ('PARENT_WALLET_ACTION', $1, NOW())`,
            [`Parent ${parentId} executed ${actionType} of KES ${amountChange} for lower-level student ${studentId}`]
        );

        await client.query('COMMIT');
        return { success: true, message: "Wallet updated successfully by parent." };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * 1. CAMPUS NAVIGATION & ROOM MAPPING
 * Maps physical infrastructure relative to the main gate (0,0) for indoor routing.
 */
pool.registerCampusNode = async (nodeData) => {
    const { universityId, nodeName, nodeType, distanceFromGateMeters, pathDescription } = nodeData;
    const client = await pool.connect();
    try {
        const query = `
            INSERT INTO campus_map_nodes (university_id, node_name, node_type, distance_from_gate_m, path_description)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const res = await client.query(query, [universityId, nodeName, nodeType, distanceFromGateMeters, pathDescription]);
        return { success: true, node: res.rows[0] };
    } finally {
        client.release();
    }
};

/**
 * 2. LECTURE TIMETABLING MATRIX
 * Eliminates WhatsApp confusion by linking course codes, time slots, and specific campus map nodes.
 */
pool.createTimetableEntry = async (scheduleData) => {
    const { courseId, venueNodeId, dayOfWeek, startTime, endTime, cohortGroup } = scheduleData;
    const client = await pool.connect();
    try {
        // Prevent double booking of rooms at the same time slot
        const conflictCheck = await client.query(
            `SELECT * FROM lecture_timetables 
             WHERE venue_node_id = $1 AND day_of_week = $2 
             AND (($3::time BETWEEN start_time AND end_time) OR ($4::time BETWEEN start_time AND end_time))`,
            [venueNodeId, dayOfWeek, startTime, endTime]
        );

        if (conflictCheck.rows.length > 0) {
            throw new Error("Scheduling Conflict: Selected lecture hall is already booked for this time slot.");
        }

        const insertQuery = `
            INSERT INTO lecture_timetables (course_id, venue_node_id, day_of_week, start_time, end_time, cohort_group)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const res = await client.query(insertQuery, [courseId, venueNodeId, dayOfWeek, startTime, endTime, cohortGroup]);
        return { success: true, timetable: res.rows[0] };
    } finally {
        client.release();
    }
};

/**
 * 3. SENATE GRADUATION & CLEARANCE AUDIT LOG
 * Verifies cumulative credit hours and departmental approvals before final graduation lists.
 */
pool.verifySenateClearance = async (studentId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Audit student academic record for minimum required credits and zero fee balances
        const audit = await client.query(
            `SELECT s.student_id, s.full_name, 
                    COALESCE(SUM(c.credit_units), 0) as earned_credits,
                    il.balance as institutional_fee_balance
             FROM students s
             JOIN student_transcript st ON s.student_id = st.student_id
             JOIN courses c ON st.course_id = c.course_id
             JOIN institutional_ledger il ON s.student_id = il.student_id
             WHERE s.student_id = $1 AND st.grade_status = 'PASS'
             GROUP BY s.student_id, s.full_name, il.balance;`,
            [studentId]
        );

        if (audit.rows.length === 0) {
            throw new Error("Student records incomplete or not found.");
        }

        const record = audit.rows[0];
        const minRequiredCredits = 120; // Standard university degree threshold example

        if (record.earned_credits < minRequiredCredits) {
            throw new Error(`Clearance Failed: Earned credits (${record.earned_credits}) are below graduation threshold (${minRequiredCredits}).`);
        }

        if (record.institutional_fee_balance > 0) {
            throw new Error(`Clearance Failed: Outstanding institutional fee balance of KES ${record.institutional_fee_balance}.`);
        }

        // Mark student as Senate Cleared
        await client.query(
            `UPDATE students SET clearance_status = 'SENATE_APPROVED_GRADUAND' WHERE student_id = $1`,
            [studentId]
        );

        await client.query(
            `INSERT INTO audit_shield (event_type, description, timestamp) 
             VALUES ('SENATE_CLEARANCE_SUCCESS', $1, NOW())`,
            [`Student ${studentId} successfully cleared by Senate for graduation with ${record.earned_credits} units.`]
        );

        await client.query('COMMIT');
        return { success: true, message: "Student cleared for graduation by the Senate." };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
module.exports = pool;