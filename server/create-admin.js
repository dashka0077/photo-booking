require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function createAdmin() {
    try {
        const passwordHash = await bcrypt.hash('admin123', 10);

        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            ['admin@mail.com']
        );

        if (existing.rows.length > 0) {
            await pool.query(
                'UPDATE users SET name = $1, password = $2, role = $3 WHERE email = $4',
                ['Admin', passwordHash, 'admin', 'admin@mail.com']
            );
        } else {
            await pool.query(
                'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
                ['Admin', 'admin@mail.com', passwordHash, 'admin']
            );
        }

        console.log('Admin created: admin@mail.com / admin123');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

createAdmin();