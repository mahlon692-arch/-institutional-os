const pool = require('./db');

/**
 * Processes a marketplace purchase, atomically deducting from the student's smart wallet,
 * updating the vendor ledger, and recording an immutable audit entry.
 * @param {Object} orderData - Contains studentId, vendorId, items, and totalAmount
 * @param {Object} io - Socket.io instance for real-time WebSocket broadcast
 */
const processMarketplaceOrder = async (orderData, io) => {
    const { studentId, vendorId, items, totalAmount } = orderData;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Lock and check student wallet balance
        const walletRes = await client.query(
            `SELECT upkeep_balance FROM student_smart_wallets WHERE student_id = $1 FOR UPDATE`,
            [studentId]
        );

        if (walletRes.rows.length === 0) {
            throw new Error('Student smart wallet not found.');
        }

        const currentBalance = parseFloat(walletRes.rows.length > 0 ? walletRes.rows[0].upkeep_balance : 0);
        if (currentBalance < totalAmount) {
            throw new Error(`Insufficient wallet balance (Available: KES ${currentBalance}, Required: KES ${totalAmount}).`);
        }

        // 2. Deduct amount from student smart wallet
        const newBalance = currentBalance - totalAmount;
        await client.query(
            `UPDATE student_smart_wallets SET upkeep_balance = $1, updated_at = NOW() WHERE student_id = $2`,
            [newBalance, studentId]
        );

        // 3. Record order in marketplace transactions ledger
        const orderQuery = `
            INSERT INTO marketplace_orders (student_id, vendor_id, items_json, total_amount, status, created_at)
            VALUES ($1, $2, $3, $4, 'COMPLETED', NOW())
            RETURNING order_id, created_at;
        `;
        const orderRes = await client.query(orderQuery, [studentId, vendorId, JSON.stringify(items), totalAmount]);
        const orderId = orderRes.rows[0].order_id;

        // 4. Log immutable audit trail
        await client.query(
            `INSERT INTO audit_shield (event_type, description, timestamp) 
             VALUES ('MARKETPLACE_PURCHASE', $1, NOW())`,
            [`Student ${studentId} purchased items worth KES ${totalAmount} from Vendor ${vendorId}. Order ID: ${orderId}`]
        );

        await client.query('COMMIT');

        // 5. Broadcast live real-time update via WebSockets to Bursary & Vendor dashboards
        if (io) {
            io.emit('live_marketplace_order', {
                orderId,
                studentId,
                vendorId,
                totalAmount,
                items,
                timestamp: new Date().toISOString()
            });
        }

        return { success: true, orderId, newBalance };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { processMarketplaceOrder };