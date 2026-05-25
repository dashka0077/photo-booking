const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

app.get('/db-test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');

        res.json({
            message: 'PostgreSQL подключен ✅',
            time: result.rows[0].now
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: 'Ошибка подключения к PostgreSQL ❌',
            error: error.message
        });
    }
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Файл слишком большой. Выберите изображение поменьше.' });
    }

    console.error(error);
    return res.status(500).json({ message: error.message || 'Ошибка сервера' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
