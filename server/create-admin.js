require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function createAdmin() {
    try {
        const passwordHash = await bcrypt.hash('admin123', 10);

        await pool.query(
            `INSERT INTO users (name, email, password, role)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email)
             DO UPDATE SET role = 'admin', password = EXCLUDED.password`,
            ['Admin', 'admin@mail.com', passwordHash, 'admin']
        );

        console.log('Admin created');
        process.exit();
    } catch (err) {
        console.error(err);
    }
}

createAdmin();