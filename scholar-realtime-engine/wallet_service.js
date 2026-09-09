const pool = require('./db');

/**
 * Processes a student upkeep withdrawal from the pooled master account 
 * to the student's registered mobile money number.
 * @param {string} studentId - The student's unique ID
 * @param {number} amount - The amount to withdraw
 * @param {string} phoneNumber - The student's M-Pesa phone number
 */
const processStudentWalletWithdrawal = async (studentId, amount, phoneNumber) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check current wallet balance from the internal ledger
        const walletRes = await client.query(
            `SELECT wallet_id, upkeep_balance FROM student_smart_wallets WHERE student_id = $1 FOR UPDATE`,
            [studentId]
        );

        if (walletRes.rows.length === 0) {
            throw new Error('Student smart wallet not found.');
        }

        const wallet = walletRes.rows[0];
        const currentBalance = parseFloat(wallet.upkeep_balance);

        if (currentBalance < amount) {
            throw new Error('Insufficient wallet balance for this withdrawal.');
        }

        // 2. Deduct amount from student's internal ledger balance
        const newBalance = currentBalance - amount;
        await client.query(
            `UPDATE student_smart_wallets SET upkeep_balance = $1, updated_at = NOW() WHERE student_id = $2`,
            [newBalance, studentId]
        );

        // 3. Log transaction in ledger audit trail
        const txQuery = `
            INSERT INTO wallet_transactions (student_id, transaction_type, amount, balance_after, phone_number, status)
            VALUES ($1, 'WITHDRAWAL', $2, $3, $4, 'PENDING_DISBURSEMENT')
            RETURNING transaction_id;
        `;
        const txRes = await client.query(txQuery, [studentId, amount, newBalance, phoneNumber]);
        const transactionId = txRes.rows[0].transaction_id;

        // 4. (Optional API integration trigger) 
        // Call Partner Bank / M-Pesa B2C API here to push cash to `phoneNumber` from the Master Pool Account.
        // If API succeeds, update status to 'COMPLETED'.

        await client.query(
            `INSERT INTO audit_shield (event_type, description, timestamp) 
             VALUES ('WALLET_WITHDRAWAL', $1, NOW())`,
            [`Student ${studentId} withdrew KES ${amount} to phone ${phoneNumber}. New balance: KES ${newBalance}`]
        );

        await client.query('COMMIT');
        return { success: true, transactionId, newBalance };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { processStudentWalletWithdrawal };