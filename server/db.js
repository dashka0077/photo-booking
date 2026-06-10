require('dotenv').config();

const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';
const shouldUseSsl = process.env.DB_SSL === 'true'
    || (databaseUrl && !/localhost|127\.0\.0\.1/i.test(databaseUrl));

const pool = new Pool({
    connectionString: databaseUrl,
    ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {})
});

module.exports = pool;
