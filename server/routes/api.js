const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs/promises');
const path = require('path');
const pool = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');

const router = express.Router();

async function ensureUserProfileColumns() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
    await pool.query('ALTER TABLE certificates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            message TEXT NOT NULL,
            read_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS service_reviews (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS favorite_services (
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, service_id)
        );
    `);
}

async function ensureServiceTimeSlots() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS service_time_slots (
            id SERIAL PRIMARY KEY,
            service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
            day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

async function ensureBookingPackageColumns() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS service_packages (
            id SERIAL PRIMARY KEY,
            service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
            title VARCHAR(100) NOT NULL,
            price INTEGER NOT NULL,
            hours NUMERIC(4, 1) DEFAULT 1,
            photo_count VARCHAR(80),
            retouch_count VARCHAR(80),
            is_active BOOLEAN DEFAULT true,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_id INTEGER;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_title VARCHAR(100);');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_price INTEGER;');
}

async function ensureDefaultServicePackages(serviceId = null) {
    await ensureBookingPackageColumns();
    const params = serviceId ? [serviceId] : [];
    const services = await pool.query(`SELECT id, price FROM services${serviceId ? ' WHERE id = $1' : ''}`, params);
    for (const service of services.rows) {
        const basePrice = Number(service.price || 0);
        const packages = [
            ['Стандарт', basePrice, 1, 'от 50 фото', '10 фото в ретуши', 1],
            ['Оптимальный', basePrice + 2000, 1.5, 'от 80 фото', '20 фото в ретуши', 2],
            ['Премиум', basePrice + 5000, 2, 'от 120 фото', '30 фото в ретуши', 3]
        ];

        for (const item of packages) {
            await pool.query(`
                INSERT INTO service_packages (service_id, title, price, hours, photo_count, retouch_count, sort_order)
                SELECT $1::integer, $2::varchar, $3::integer, $4::numeric, $5::varchar, $6::varchar, $7::integer
                WHERE NOT EXISTS (SELECT 1 FROM service_packages WHERE service_id = $1::integer AND title = $2::varchar)
            `, [service.id, ...item]);
        }
    }
}

router.get('/settings', async (req, res) => {
    const result = await pool.query('SELECT key, value FROM site_settings ORDER BY key');
    res.json(result.rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {}));
});

router.get('/services', async (req, res) => {
    const result = await pool.query(`
        SELECT * FROM services
        WHERE is_active = true
        ORDER BY is_popular DESC, id ASC
    `);
    res.json(result.rows);
});

router.get('/addons', async (req, res) => {
    const result = await pool.query(`
        SELECT * FROM additional_services
        WHERE is_active = true
        ORDER BY
            CASE title
                WHEN 'Ретушь фотографий' THEN 1
                WHEN 'Печать фотографий' THEN 2
                WHEN 'Фотокниги' THEN 3
                WHEN 'Подарочный сертификат' THEN 4
                WHEN 'Визажист' THEN 5
                WHEN 'Аренда одежды' THEN 6
                WHEN 'Аренда студии' THEN 7
                WHEN 'Аэросъемка' THEN 8
                ELSE 100
            END,
            id ASC
    `);
    res.json(result.rows);
});

router.get('/service-packages', async (req, res) => {
    const serviceId = Number(req.query.serviceId || 0);
    if (!serviceId) return res.json([]);
    await ensureDefaultServicePackages(serviceId);
    const result = await pool.query(`
        SELECT *
        FROM service_packages
        WHERE service_id = $1 AND is_active = true
        ORDER BY sort_order ASC, id ASC
    `, [serviceId]);
    res.json(result.rows);
});

router.get('/portfolio', async (req, res) => {
    const result = await pool.query('SELECT * FROM portfolio ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
});

router.get('/certificate-products', async (req, res) => {
    const result = await pool.query(`
        SELECT *
        FROM certificate_products
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
    `);
    res.json(result.rows);
});

router.get('/certificate-designs', async (req, res) => {
    const result = await pool.query(`
        SELECT *
        FROM certificate_designs
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
    `);
    res.json(result.rows);
});

router.get('/certificate-delivery-options', async (req, res) => {
    const result = await pool.query(`
        SELECT *
        FROM certificate_delivery_options
        WHERE is_active = true
        ORDER BY sort_order ASC, id ASC
    `);
    res.json(result.rows);
});

router.get('/working-hours', async (req, res) => {
    const result = await pool.query('SELECT * FROM working_hours ORDER BY day_of_week ASC');
    res.json(result.rows);
});

router.get('/availability', async (req, res) => {
    await ensureServiceTimeSlots();
    const hours = Math.max(1, Math.min(Number(req.query.hours) || 1, 8));
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 90));
    const serviceId = Number(req.query.serviceId || 0);
    const requestedDate = req.query.date ? String(req.query.date) : '';
    const scheduleResult = await pool.query('SELECT * FROM working_hours ORDER BY day_of_week ASC');
    const schedule = new Map(scheduleResult.rows.map((row) => [Number(row.day_of_week), row]));
    const serviceSlotsResult = serviceId ? await pool.query(`
        SELECT *
        FROM service_time_slots
        WHERE service_id = $1 AND is_active = true
        ORDER BY day_of_week ASC, start_time ASC
    `, [serviceId]) : { rows: [] };
    const slots = [];
    let closed = false;
    const today = requestedDate ? new Date(`${requestedDate}T00:00:00`) : new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = 0; offset < days; offset += 1) {
        const date = new Date(today);
        date.setDate(today.getDate() + offset);
        const dateValue = date.toISOString().slice(0, 10);
        const day = date.getDay();
        const daySchedule = schedule.get(day);
        const serviceWindows = serviceSlotsResult.rows.filter((slot) => Number(slot.day_of_week) === day);
        const windows = serviceWindows.length
            ? serviceWindows
            : daySchedule && daySchedule.is_working
                ? [daySchedule]
                : [];

        if (!windows.length) {
            if (requestedDate) closed = true;
            continue;
        }

        const busy = await pool.query(`
            SELECT start_time, hours
            FROM bookings
            WHERE booking_date = $1 AND status <> 'cancelled'
        `, [dateValue]);

        for (const window of windows) {
            for (let hour = parseInt(window.start_time, 10); hour + hours <= parseInt(window.end_time, 10); hour += 1) {
                const slotStart = hour;
                const slotEnd = hour + hours;
                const isBusy = busy.rows.some((booking) => {
                    const bookingStart = parseInt(booking.start_time, 10);
                    const bookingEnd = bookingStart + Number(booking.hours);
                    return slotStart < bookingEnd && slotEnd > bookingStart;
                });

                if (!isBusy) {
                    slots.push({ date: dateValue, time: `${String(hour).padStart(2, '0')}:00` });
                }
            }
        }
    }

    if (requestedDate) {
        return res.json({ closed, slots });
    }

    res.json(slots);
});

router.post('/certificates', async (req, res) => {
    await ensureUserProfileColumns();
    const { buyerName, buyerEmail, amount, recipientName, message } = req.body;

    if (!buyerName || !buyerEmail || !amount) {
        return res.status(400).json({ message: 'Заполните имя, email и сумму сертификата' });
    }

    const userResult = await pool.query(
        'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
        [buyerEmail]
    );
    const userId = userResult.rows[0]?.id || null;

    const result = await pool.query(`
        INSERT INTO certificates (buyer_name, buyer_email, amount, recipient_name, message, user_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [buyerName, buyerEmail, Number(amount), recipientName || null, message || null, userId]);

    res.status(201).json(result.rows[0]);
});

router.get('/me', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const result = await pool.query(
        'SELECT id, name, email, phone, role, avatar_url, created_at FROM users WHERE id = $1',
        [req.user.id]
    );
    res.json(result.rows[0]);
});

router.put('/me', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const { name, phone, email } = req.body;
    const result = await pool.query(`
        UPDATE users
        SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email)
        WHERE id = $4
        RETURNING id, name, email, phone, role, avatar_url
    `, [name || null, phone || null, email || null, req.user.id]);
    res.json(result.rows[0]);
});

router.post('/me/avatar', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const { fileName, dataUrl } = req.body || {};
    const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');

    if (!fileName || !match) {
        return res.status(400).json({ message: 'Выберите изображение PNG, JPG, WEBP или GIF' });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const safeName = path.basename(fileName)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'avatar';
    const finalName = `${Date.now()}-${safeName}.${ext}`;
    const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
    const targetPath = path.join(uploadsDir, finalName);

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(match[2], 'base64'));

    const url = `/uploads/${finalName}`;
    const result = await pool.query(`
        UPDATE users
        SET avatar_url = $1
        WHERE id = $2
        RETURNING id, name, email, phone, role, avatar_url
    `, [url, req.user.id]);

    res.status(201).json(result.rows[0]);
});

router.put('/me/password', authRequired, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: 'Пароль должен быть не короче 6 символов' });
    }

    const user = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, user.rows[0].password);

    if (!valid) {
        return res.status(400).json({ message: 'Текущий пароль указан неверно' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Пароль изменен' });
});

router.get('/me/bookings', authRequired, async (req, res) => {
    const result = await pool.query(`
        SELECT
            b.id,
            b.booking_date,
            b.start_time,
            b.hours,
            b.package_id,
            b.package_title,
            b.package_price,
            b.status,
            b.comment,
            b.created_at,
            s.title AS service_title,
            s.price AS service_price,
            COALESCE(
                json_agg(json_build_object('id', a.id, 'title', a.title, 'price', a.price))
                FILTER (WHERE a.id IS NOT NULL),
                '[]'
            ) AS addons
        FROM bookings b
        JOIN services s ON s.id = b.service_id
        LEFT JOIN booking_addons ba ON ba.booking_id = b.id
        LEFT JOIN additional_services a ON a.id = ba.addon_id
        WHERE b.user_id = $1
        GROUP BY b.id, s.id
        ORDER BY b.booking_date DESC, b.start_time DESC
    `, [req.user.id]);
    res.json(result.rows);
});

router.get('/me/certificates', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const result = await pool.query(`
        SELECT c.*
        FROM certificates c
        LEFT JOIN users u ON u.id = $1
        WHERE c.user_id = $1 OR lower(c.buyer_email) = lower(u.email)
        ORDER BY c.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
});

router.get('/reviews', async (req, res) => {
    await ensureUserProfileColumns();
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;

    if (req.query.serviceId && (!Number.isInteger(serviceId) || serviceId <= 0)) {
        return res.status(400).json({ message: 'Выберите услугу' });
    }

    const result = await pool.query(`
        SELECT r.*, u.name AS user_name, u.avatar_url, s.title AS service_title
        FROM service_reviews r
        JOIN users u ON u.id = r.user_id
        JOIN services s ON s.id = r.service_id
        WHERE ($1::int IS NULL OR r.service_id = $1)
        ORDER BY r.created_at DESC
    `, [serviceId]);
    res.json(result.rows);
});

router.get('/me/reviews', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const result = await pool.query(`
        SELECT r.*, s.title AS service_title
        FROM service_reviews r
        JOIN services s ON s.id = r.service_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
});

router.post('/reviews', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const serviceId = Number(req.body?.serviceId);
    const rating = Number(req.body?.rating || 5);
    const text = String(req.body?.text || '').trim();

    if (!Number.isInteger(serviceId) || serviceId <= 0) {
        return res.status(400).json({ message: 'Выберите услугу' });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Поставьте оценку от 1 до 5' });
    }

    if (text.length < 3) {
        return res.status(400).json({ message: 'Напишите отзыв' });
    }

    const service = await pool.query('SELECT id FROM services WHERE id = $1', [serviceId]);
    if (!service.rows[0]) {
        return res.status(404).json({ message: 'Услуга не найдена' });
    }

    const result = await pool.query(`
        INSERT INTO service_reviews (user_id, service_id, rating, text)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [req.user.id, serviceId, rating, text]);
    res.status(201).json(result.rows[0]);
});

router.get('/me/favorites', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const result = await pool.query(`
        SELECT s.*, f.created_at AS favorited_at
        FROM favorite_services f
        JOIN services s ON s.id = f.service_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
});

router.post('/me/favorites/:serviceId', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const serviceId = Number(req.params.serviceId);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
        return res.status(400).json({ message: 'Выберите услугу' });
    }

    const result = await pool.query(`
        INSERT INTO favorite_services (user_id, service_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, service_id) DO NOTHING
        RETURNING *
    `, [req.user.id, serviceId]);
    res.status(result.rows[0] ? 201 : 200).json({ serviceId, favorite: true });
});

router.delete('/me/favorites/:serviceId', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const serviceId = Number(req.params.serviceId);
    await pool.query('DELETE FROM favorite_services WHERE user_id = $1 AND service_id = $2', [req.user.id, serviceId]);
    res.json({ serviceId, favorite: false });
});

router.get('/messages', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const recipientId = req.query.recipientId ? Number(req.query.recipientId) : null;
    const isAdmin = req.user.role === 'admin';

    if (req.query.recipientId && (!Number.isInteger(recipientId) || recipientId <= 0)) {
        return res.status(400).json({ message: 'Выберите клиента' });
    }

    if (isAdmin && !recipientId) {
        return res.json([]);
    }

    const result = await pool.query(`
        SELECT m.*, s.name AS sender_name, r.name AS recipient_name
        FROM chat_messages m
        JOIN users s ON s.id = m.sender_id
        LEFT JOIN users r ON r.id = m.recipient_id
        WHERE (
            ($2::boolean AND $3::int IS NOT NULL AND (
                (m.sender_id = $1 AND m.recipient_id = $3)
                OR (m.sender_id = $3 AND m.recipient_id = $1)
            ))
            OR (NOT $2::boolean AND (m.sender_id = $1 OR m.recipient_id = $1))
        )
        ORDER BY m.created_at ASC
    `, [req.user.id, isAdmin, recipientId]);

    if (result.rows.length) {
        if (isAdmin && recipientId) {
            await pool.query(`
                UPDATE chat_messages
                SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL
            `, [recipientId, req.user.id]);
        }

        if (!isAdmin) {
            await pool.query(`
                UPDATE chat_messages
                SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                WHERE recipient_id = $1 AND read_at IS NULL
            `, [req.user.id]);
        }
    }

    res.json(result.rows);
});

router.post('/messages', authRequired, async (req, res) => {
    await ensureUserProfileColumns();
    const { message, recipientId } = req.body || {};

    if (!message || !message.trim()) {
        return res.status(400).json({ message: 'Введите сообщение' });
    }

    let recipientResult;
    if (req.user.role === 'admin') {
        const parsedRecipientId = Number(recipientId);
        if (!Number.isInteger(parsedRecipientId) || parsedRecipientId <= 0) {
            return res.status(400).json({ message: 'Выберите клиента для ответа' });
        }

        recipientResult = await pool.query("SELECT id FROM users WHERE id = $1 AND role <> 'admin'", [parsedRecipientId]);
    } else {
        recipientResult = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    }
    const recipient = recipientResult.rows[0]?.id || null;

    if (!recipient) {
        return res.status(404).json({ message: 'Получатель не найден' });
    }

    const result = await pool.query(`
        INSERT INTO chat_messages (sender_id, recipient_id, message)
        VALUES ($1, $2, $3)
        RETURNING *
    `, [req.user.id, recipient, message.trim()]);

    res.status(201).json(result.rows[0]);
});

router.use('/admin', authRequired, adminRequired);

router.get('/admin/chat-clients', async (req, res) => {
    await ensureUserProfileColumns();
    const result = await pool.query(`
        SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            u.avatar_url,
            MAX(m.created_at) AS last_message_at,
            (array_agg(m.message ORDER BY m.created_at DESC) FILTER (WHERE m.id IS NOT NULL))[1] AS last_message,
            (array_agg(s.name ORDER BY m.created_at DESC) FILTER (WHERE m.id IS NOT NULL))[1] AS last_sender_name,
            COUNT(m.id) FILTER (WHERE m.sender_id = u.id AND m.read_at IS NULL) AS unread_count
        FROM users u
        LEFT JOIN chat_messages m ON (
            (m.sender_id = u.id AND m.recipient_id = $1)
            OR (m.sender_id = $1 AND m.recipient_id = u.id)
        )
        LEFT JOIN users s ON s.id = m.sender_id
        WHERE u.role <> 'admin'
        GROUP BY u.id
        ORDER BY MAX(m.created_at) DESC NULLS LAST, u.name ASC, u.email ASC
    `, [req.user.id]);
    res.json(result.rows);
});

router.post('/bookings', authRequired, async (req, res) => {
    await ensureBookingPackageColumns();
    const { serviceId, packageId, packageTitle, packagePrice, addonIds = [], date, time, hours = 1, comment } = req.body;
    let selectedPackage = null;
    if (packageId && Number.isFinite(Number(packageId))) {
        const packageResult = await pool.query(`
            SELECT *
            FROM service_packages
            WHERE id = $1 AND service_id = $2 AND is_active = true
        `, [packageId, serviceId]);
        selectedPackage = packageResult.rows[0] || null;
    } else if (packageTitle && packagePrice) {
        selectedPackage = {
            id: null,
            title: packageTitle,
            price: Number(packagePrice),
            hours: Number(hours) || 1
        };
    }
    const duration = Math.max(1, Math.min(Number(selectedPackage?.hours || hours) || 1, 8));

    if (!serviceId || !date || !time) {
        return res.status(400).json({ message: 'Выберите услугу, дату и время' });
    }

    const available = await isSlotAvailable(date, time, duration, serviceId);
    if (!available.ok) {
        return res.status(400).json({ message: available.message });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const booking = await client.query(`
            INSERT INTO bookings (user_id, service_id, package_id, package_title, package_price, booking_date, start_time, hours, comment)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            req.user.id,
            serviceId,
            selectedPackage?.id || null,
            selectedPackage?.title || null,
            selectedPackage?.price || null,
            date,
            time,
            duration,
            comment || null
        ]);

        for (const addonId of addonIds) {
            await client.query(
                'INSERT INTO booking_addons (booking_id, addon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [booking.rows[0].id, addonId]
            );
        }

        await client.query('COMMIT');
        res.status(201).json(booking.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
    }
});

router.patch('/bookings/:id/cancel', authRequired, async (req, res) => {
    const result = await pool.query(`
        UPDATE bookings
        SET status = 'cancelled'
        WHERE id = $1 AND user_id = $2
        RETURNING *
    `, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Запись не найдена' });
    }

    res.json(result.rows[0]);
});

router.use('/admin', authRequired, adminRequired);

router.post('/admin/upload', async (req, res) => {
    const { fileName, dataUrl } = req.body || {};
    const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');

    if (!fileName || !match) {
        return res.status(400).json({ message: 'Выберите изображение PNG, JPG, WEBP или GIF' });
    }

    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const safeName = path.basename(fileName)
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';
    const finalName = `${Date.now()}-${safeName}.${ext}`;
    const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
    const targetPath = path.join(uploadsDir, finalName);

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(match[2], 'base64'));

    res.status(201).json({ url: `/uploads/${finalName}` });
});

router.get('/admin/bookings', async (req, res) => {
    const result = await pool.query(`
        SELECT b.*, u.name AS user_name, u.email AS user_email, s.title AS service_title
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        JOIN services s ON s.id = b.service_id
        ORDER BY b.booking_date DESC, b.start_time DESC
    `);
    res.json(result.rows);
});

router.patch('/admin/bookings/:id', async (req, res) => {
    const { status, date, time, hours, serviceId } = req.body;
    const result = await pool.query(`
        UPDATE bookings
        SET status = COALESCE($1, status),
            booking_date = COALESCE($2, booking_date),
            start_time = COALESCE($3, start_time),
            hours = COALESCE($4, hours),
            service_id = COALESCE($5, service_id)
        WHERE id = $6
        RETURNING *
    `, [status || null, date || null, time || null, hours || null, serviceId || null, req.params.id]);
    res.json(result.rows[0]);
});

router.get('/admin/services', async (req, res) => {
    const result = await pool.query('SELECT * FROM services ORDER BY id ASC');
    res.json(result.rows);
});

router.post('/admin/services', async (req, res) => {
    const service = await upsertService(req.body);
    res.status(201).json(service);
});

router.put('/admin/services/:id', async (req, res) => {
    const service = await upsertService({ ...req.body, id: req.params.id });
    res.json(service);
});

router.delete('/admin/services/:id', async (req, res) => {
    await pool.query('UPDATE services SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Услуга скрыта' });
});

router.get('/admin/addons', async (req, res) => {
    const result = await pool.query('SELECT * FROM additional_services ORDER BY id ASC');
    res.json(result.rows);
});

router.post('/admin/addons', async (req, res) => {
    const { title, description, price, imageUrl } = req.body;
    const result = await pool.query(`
        INSERT INTO additional_services (title, description, price, image_url)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [title, description || null, Number(price) || 0, imageUrl || null]);
    res.status(201).json(result.rows[0]);
});

router.put('/admin/addons/:id', async (req, res) => {
    const { title, description, price, imageUrl, isActive } = req.body;
    const result = await pool.query(`
        UPDATE additional_services
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            price = COALESCE($3, price),
            image_url = COALESCE($4, image_url),
            is_active = COALESCE($5, is_active)
        WHERE id = $6
        RETURNING *
    `, [title || null, description || null, price ?? null, imageUrl || null, isActive ?? null, req.params.id]);
    res.json(result.rows[0]);
});

router.delete('/admin/addons/:id', async (req, res) => {
    await pool.query('UPDATE additional_services SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Доп. услуга скрыта' });
});

router.get('/admin/portfolio', async (req, res) => {
    const result = await pool.query('SELECT * FROM portfolio ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
});

router.post('/admin/portfolio', async (req, res) => {
    const item = await upsertPortfolio(req.body);
    res.status(201).json(item);
});

router.put('/admin/portfolio/:id', async (req, res) => {
    const item = await upsertPortfolio({ ...req.body, id: req.params.id });
    res.json(item);
});

router.delete('/admin/portfolio/:id', async (req, res) => {
    await pool.query('DELETE FROM portfolio WHERE id = $1', [req.params.id]);
    res.json({ message: 'Работа удалена из портфолио' });
});

router.put('/admin/working-hours/:day', async (req, res) => {
    const { isWorking, startTime, endTime } = req.body;
    const result = await pool.query(`
        INSERT INTO working_hours (day_of_week, is_working, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (day_of_week)
        DO UPDATE SET is_working = EXCLUDED.is_working, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time
        RETURNING *
    `, [req.params.day, isWorking === true || isWorking === 'true', startTime || '10:00', endTime || '19:00']);
    res.json(result.rows[0]);
});

router.get('/admin/service-time-slots', async (req, res) => {
    await ensureServiceTimeSlots();
    const result = await pool.query(`
        SELECT sts.*, s.title AS service_title
        FROM service_time_slots sts
        JOIN services s ON s.id = sts.service_id
        WHERE sts.is_active = true
        ORDER BY s.title ASC, sts.day_of_week ASC, sts.start_time ASC
    `);
    res.json(result.rows);
});

router.post('/admin/service-time-slots', async (req, res) => {
    await ensureServiceTimeSlots();
    const { serviceId, dayOfWeek, startTime, endTime } = req.body;

    if (!serviceId || dayOfWeek === undefined || !startTime || !endTime) {
        return res.status(400).json({ message: 'Выберите услугу, день и время' });
    }

    const result = await pool.query(`
        INSERT INTO service_time_slots (service_id, day_of_week, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [serviceId, dayOfWeek, startTime, endTime]);
    res.status(201).json(result.rows[0]);
});

router.delete('/admin/service-time-slots/:id', async (req, res) => {
    await ensureServiceTimeSlots();
    await pool.query('UPDATE service_time_slots SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Окно времени удалено' });
});

router.put('/admin/settings', async (req, res) => {
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
        await pool.query(`
            INSERT INTO site_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [key, String(value)]);
    }
    res.json({ message: 'Настройки сохранены' });
});

router.get('/admin/certificates', async (req, res) => {
    const result = await pool.query('SELECT * FROM certificates ORDER BY created_at DESC');
    res.json(result.rows);
});

router.get('/admin/certificate-products', async (req, res) => {
    const result = await pool.query('SELECT * FROM certificate_products ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
});

router.post('/admin/certificate-products', async (req, res) => {
    const product = await upsertCertificateProduct(req.body);
    res.status(201).json(product);
});

router.put('/admin/certificate-products/:id', async (req, res) => {
    const product = await upsertCertificateProduct({ ...req.body, id: req.params.id });
    res.json(product);
});

router.delete('/admin/certificate-products/:id', async (req, res) => {
    await pool.query('UPDATE certificate_products SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Сертификат скрыт' });
});

router.get('/admin/certificate-designs', async (req, res) => {
    const result = await pool.query('SELECT * FROM certificate_designs ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
});

router.post('/admin/certificate-designs', async (req, res) => {
    const design = await upsertCertificateDesign(req.body);
    res.status(201).json(design);
});

router.put('/admin/certificate-designs/:id', async (req, res) => {
    const design = await upsertCertificateDesign({ ...req.body, id: req.params.id });
    res.json(design);
});

router.delete('/admin/certificate-designs/:id', async (req, res) => {
    await pool.query('DELETE FROM certificate_designs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Дизайн удален' });
});

router.get('/admin/certificate-delivery-options', async (req, res) => {
    const result = await pool.query('SELECT * FROM certificate_delivery_options ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
});

router.post('/admin/certificate-delivery-options', async (req, res) => {
    const option = await upsertCertificateDeliveryOption(req.body);
    res.status(201).json(option);
});

router.put('/admin/certificate-delivery-options/:id', async (req, res) => {
    const option = await upsertCertificateDeliveryOption({ ...req.body, id: req.params.id });
    res.json(option);
});

router.delete('/admin/certificate-delivery-options/:id', async (req, res) => {
    await pool.query('UPDATE certificate_delivery_options SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Способ получения скрыт' });
});

router.post('/admin/certificates', async (req, res) => {
    try {
        const certificate = await upsertCertificate(req.body);
        res.status(201).json(certificate);
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

router.patch('/admin/certificates/:id', async (req, res) => {
    const certificate = await upsertCertificate({ ...req.body, id: req.params.id });
    res.json(certificate);
});

async function isSlotAvailable(date, time, hours, serviceId = null) {
    await ensureServiceTimeSlots();
    const day = new Date(`${date}T00:00:00`).getDay();
    const schedule = await pool.query('SELECT * FROM working_hours WHERE day_of_week = $1', [day]);
    const serviceSlots = serviceId ? await pool.query(`
        SELECT *
        FROM service_time_slots
        WHERE service_id = $1 AND day_of_week = $2 AND is_active = true
        ORDER BY start_time ASC
    `, [serviceId, day]) : { rows: [] };

    if (!serviceSlots.rows.length && (schedule.rows.length === 0 || !schedule.rows[0].is_working)) {
        return { ok: false, message: 'В этот день фотограф не работает' };
    }

    const startHour = parseInt(time, 10);
    const windows = serviceSlots.rows.length ? serviceSlots.rows : schedule.rows;
    const insideWindow = windows.some((window) => {
        const workStart = parseInt(window.start_time, 10);
        const workEnd = parseInt(window.end_time, 10);
        return startHour >= workStart && startHour + hours <= workEnd;
    });

    if (!insideWindow) {
        return { ok: false, message: 'Выбранное время вне рабочего графика' };
    }
    const conflicts = await pool.query(`
        SELECT id
        FROM bookings
        WHERE booking_date = $1
            AND status <> 'cancelled'
            AND $2::int < (EXTRACT(HOUR FROM start_time)::int + hours)
            AND ($2::int + $3::int) > EXTRACT(HOUR FROM start_time)::int
        LIMIT 1
    `, [date, startHour, hours]);

    if (conflicts.rows.length > 0) {
        return { ok: false, message: 'Это время уже занято' };
    }

    return { ok: true };
}

async function upsertService(data) {
    const {
        id,
        title,
        description,
        price,
        durationHours,
        category,
        imageUrl,
        serviceDurationText,
        photoDeliveryText,
        photoCountText,
        serviceLocation,
        serviceRecommendations,
        isPopular,
        isActive,
        is_active
    } = data;

    await ensureServiceDetailColumns();
    const activeValue = isActive ?? is_active;

    if (id) {
        const result = await pool.query(`
            UPDATE services
            SET title = COALESCE($1, title),
                description = COALESCE($2, description),
                price = COALESCE($3, price),
                duration_hours = COALESCE($4, duration_hours),
                category = COALESCE($5, category),
                image_url = COALESCE($6, image_url),
                service_duration_text = COALESCE($7, service_duration_text),
                photo_delivery_text = COALESCE($8, photo_delivery_text),
                photo_count_text = COALESCE($9, photo_count_text),
                service_location = COALESCE($10, service_location),
                service_recommendations = COALESCE($11, service_recommendations),
                is_popular = COALESCE($12, is_popular),
                is_active = COALESCE($13, is_active)
            WHERE id = $14
            RETURNING *
        `, [
            title || null,
            description || null,
            price ?? null,
            durationHours ?? null,
            category || null,
            imageUrl || null,
            serviceDurationText || null,
            photoDeliveryText || null,
            photoCountText || null,
            serviceLocation || null,
            serviceRecommendations || null,
            isPopular ?? null,
            activeValue ?? null,
            id
        ]);
        return result.rows[0];
    }

    const result = await pool.query(`
        INSERT INTO services (
            title,
            description,
            price,
            duration_hours,
            category,
            image_url,
            service_duration_text,
            photo_delivery_text,
            photo_count_text,
            service_location,
            service_recommendations,
            is_popular,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
    `, [
        title,
        description || null,
        Number(price) || 0,
        Number(durationHours) || 1,
        category || 'Фотосессия',
        imageUrl || null,
        serviceDurationText || null,
        photoDeliveryText || null,
        photoCountText || null,
        serviceLocation || null,
        serviceRecommendations || null,
        Boolean(isPopular),
        activeValue === undefined ? true : activeValue
    ]);
    return result.rows[0];
}

async function ensureServiceDetailColumns() {
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_duration_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS photo_delivery_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS photo_count_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_location VARCHAR(120);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_recommendations TEXT;');
}

async function upsertPortfolio(data) {
    const {
        id,
        title,
        category,
        imageUrl,
        image_url,
        sortOrder,
        sort_order
    } = data;

    const imageValue = imageUrl || image_url;
    const sortValue = sortOrder ?? sort_order ?? 0;

    if (id) {
        const result = await pool.query(`
            UPDATE portfolio
            SET title = COALESCE($1, title),
                category = COALESCE($2, category),
                image_url = COALESCE($3, image_url),
                sort_order = COALESCE($4, sort_order)
            WHERE id = $5
            RETURNING *
        `, [title || null, category || null, imageValue || null, sortValue ?? null, id]);
        return result.rows[0];
    }

    const result = await pool.query(`
        INSERT INTO portfolio (title, category, image_url, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [title, category || null, imageValue, Number(sortValue) || 0]);
    return result.rows[0];
}

async function upsertCertificateProduct(data) {
    const { id, title, description, amount, type, sortOrder, sort_order, isActive, is_active } = data;
    const sortValue = sortOrder ?? sort_order ?? 0;
    const activeValue = isActive ?? is_active;

    if (id) {
        const result = await pool.query(`
            UPDATE certificate_products
            SET title = COALESCE($1, title),
                description = COALESCE($2, description),
                amount = COALESCE($3, amount),
                type = COALESCE($4, type),
                sort_order = COALESCE($5, sort_order),
                is_active = COALESCE($6, is_active)
            WHERE id = $7
            RETURNING *
        `, [title || null, description || null, amount === undefined ? null : Number(amount), type || null, sortValue ?? null, activeValue ?? null, id]);
        return result.rows[0];
    }

    const result = await pool.query(`
        INSERT INTO certificate_products (title, description, amount, type, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [title, description || null, Number(amount) || 0, type || 'amount', Number(sortValue) || 0]);
    return result.rows[0];
}

async function upsertCertificateDesign(data) {
    const { id, title, code, imageUrl, image_url, theme, sortOrder, sort_order, isActive, is_active } = data;
    const imageValue = imageUrl || image_url;
    const sortValue = sortOrder ?? sort_order ?? 0;
    const activeValue = isActive ?? is_active;

    if (id) {
        const result = await pool.query(`
            UPDATE certificate_designs
            SET title = COALESCE($1, title),
                code = COALESCE($2, code),
                image_url = COALESCE($3, image_url),
                theme = COALESCE($4, theme),
                sort_order = COALESCE($5, sort_order),
                is_active = COALESCE($6, is_active)
            WHERE id = $7
            RETURNING *
        `, [title || null, code || null, imageValue || null, theme || null, sortValue ?? null, activeValue ?? null, id]);
        return result.rows[0];
    }

    const result = await pool.query(`
        INSERT INTO certificate_designs (title, code, image_url, theme, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `, [title, code || `design-${Date.now()}`, imageValue || null, theme || 'dark', Number(sortValue) || 0]);
    return result.rows[0];
}

async function upsertCertificateDeliveryOption(data) {
    const { id, title, description, icon, sortOrder, sort_order, isActive, is_active } = data;
    const sortValue = sortOrder ?? sort_order ?? 0;
    const activeValue = isActive ?? is_active;

    if (id) {
        const result = await pool.query(`
            UPDATE certificate_delivery_options
            SET title = COALESCE($1, title),
                description = COALESCE($2, description),
                icon = COALESCE($3, icon),
                sort_order = COALESCE($4, sort_order),
                is_active = COALESCE($5, is_active)
            WHERE id = $6
            RETURNING *
        `, [title || null, description || null, icon || null, sortValue ?? null, activeValue ?? null, id]);
        return result.rows[0];
    }

    const result = await pool.query(`
        INSERT INTO certificate_delivery_options (title, description, icon, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [title, description || null, icon || '□', Number(sortValue) || 0]);
    return result.rows[0];
}

async function upsertCertificate(data) {
    const {
        id,
        buyerName,
        buyer_name,
        buyerEmail,
        buyer_email,
        amount,
        recipientName,
        recipient_name,
        message,
        status
    } = data;

    const buyerNameValue = buyerName || buyer_name;
    const buyerEmailValue = buyerEmail || buyer_email;
    const recipientNameValue = recipientName || recipient_name || null;
    const amountValue = amount === '' || amount === undefined ? null : Number(amount);

    if (id) {
        const result = await pool.query(`
            UPDATE certificates
            SET buyer_name = COALESCE($1, buyer_name),
                buyer_email = COALESCE($2, buyer_email),
                amount = COALESCE($3, amount),
                recipient_name = $4,
                message = $5,
                status = COALESCE($6, status)
            WHERE id = $7
            RETURNING *
        `, [
            buyerNameValue || null,
            buyerEmailValue || null,
            amountValue,
            recipientNameValue,
            message || null,
            status || null,
            id
        ]);
        return result.rows[0];
    }

    if (!buyerNameValue || !buyerEmailValue || !amountValue) {
        const error = new Error('Заполните имя, email и сумму сертификата');
        error.status = 400;
        throw error;
    }

    const result = await pool.query(`
        INSERT INTO certificates (buyer_name, buyer_email, amount, recipient_name, message, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [
        buyerNameValue,
        buyerEmailValue,
        amountValue,
        recipientNameValue,
        message || null,
        status || 'new'
    ]);
    return result.rows[0];
}

module.exports = router;

