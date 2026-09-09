const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'institutional_os',
    password: 'm@hlon#692',
    port: 5432,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
