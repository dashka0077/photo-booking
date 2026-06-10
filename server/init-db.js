const bcrypt = require('bcrypt');
const pool = require('./db');

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(30),
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                description TEXT,
                price INTEGER NOT NULL,
                duration_hours INTEGER DEFAULT 1,
                category VARCHAR(60) DEFAULT 'Фотосессия',
                image_url TEXT,
                is_popular BOOLEAN DEFAULT false,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS additional_services (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                description TEXT,
                price INTEGER NOT NULL DEFAULT 0,
                image_url TEXT,
                is_active BOOLEAN DEFAULT true
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
                package_id INTEGER,
                package_title VARCHAR(100),
                package_price INTEGER,
                booking_date DATE NOT NULL,
                start_time TIME NOT NULL,
                hours INTEGER DEFAULT 1,
                status VARCHAR(20) DEFAULT 'pending',
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS booking_addons (
                booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
                addon_id INTEGER REFERENCES additional_services(id) ON DELETE CASCADE,
                PRIMARY KEY (booking_id, addon_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS portfolio (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                category VARCHAR(60),
                image_url TEXT NOT NULL,
                sort_order INTEGER DEFAULT 0
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificates (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                buyer_name VARCHAR(100) NOT NULL,
                buyer_email VARCHAR(100) NOT NULL,
                amount INTEGER NOT NULL,
                recipient_name VARCHAR(100),
                message TEXT,
                status VARCHAR(20) DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificate_products (
                id SERIAL PRIMARY KEY,
                title VARCHAR(120) NOT NULL,
                description TEXT,
                amount INTEGER NOT NULL,
                type VARCHAR(30) DEFAULT 'amount',
                is_active BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificate_designs (
                id SERIAL PRIMARY KEY,
                title VARCHAR(120) NOT NULL,
                code VARCHAR(80) UNIQUE,
                image_url TEXT,
                theme VARCHAR(40) DEFAULT 'dark',
                is_active BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS certificate_delivery_options (
                id SERIAL PRIMARY KEY,
                title VARCHAR(120) NOT NULL,
                description TEXT,
                icon VARCHAR(20) DEFAULT '□',
                is_active BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS working_hours (
                day_of_week INTEGER PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
                is_working BOOLEAN DEFAULT true,
                start_time TIME DEFAULT '10:00',
                end_time TIME DEFAULT '19:00'
            );
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS site_settings (
                key VARCHAR(80) PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        await ensureColumns();
        await seedData();

        console.log('Таблицы успешно созданы и наполнены');
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

async function ensureColumns() {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT 1;');
    await pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS category VARCHAR(60) DEFAULT 'Фотосессия';");
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false;');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_duration_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS photo_delivery_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS photo_count_text VARCHAR(80);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_location VARCHAR(120);');
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS service_recommendations TEXT;');
    await pool.query('ALTER TABLE additional_services ADD COLUMN IF NOT EXISTS description TEXT;');
    await pool.query('ALTER TABLE additional_services ADD COLUMN IF NOT EXISTS image_url TEXT;');
    await pool.query('ALTER TABLE additional_services ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';");
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS comment TEXT;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_id INTEGER;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_title VARCHAR(100);');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS package_price INTEGER;');
    await pool.query('ALTER TABLE certificates ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;');
    await pool.query('CREATE TABLE IF NOT EXISTS service_packages (id SERIAL PRIMARY KEY, service_id INTEGER REFERENCES services(id) ON DELETE CASCADE, title VARCHAR(100) NOT NULL, price INTEGER NOT NULL, hours NUMERIC(4, 1) DEFAULT 1, photo_count VARCHAR(80), retouch_count VARCHAR(80), is_active BOOLEAN DEFAULT true, sort_order INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);');
    await pool.query('ALTER TABLE certificate_products ADD COLUMN IF NOT EXISTS description TEXT;');
    await pool.query("ALTER TABLE certificate_products ADD COLUMN IF NOT EXISTS type VARCHAR(30) DEFAULT 'amount';");
    await pool.query('ALTER TABLE certificate_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    await pool.query('ALTER TABLE certificate_products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;');
    await pool.query('ALTER TABLE certificate_designs ADD COLUMN IF NOT EXISTS image_url TEXT;');
    await pool.query("ALTER TABLE certificate_designs ADD COLUMN IF NOT EXISTS theme VARCHAR(40) DEFAULT 'dark';");
    await pool.query('ALTER TABLE certificate_designs ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    await pool.query('ALTER TABLE certificate_designs ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;');
    await pool.query('ALTER TABLE certificate_delivery_options ADD COLUMN IF NOT EXISTS description TEXT;');
    await pool.query("ALTER TABLE certificate_delivery_options ADD COLUMN IF NOT EXISTS icon VARCHAR(20) DEFAULT '□';");
    await pool.query('ALTER TABLE certificate_delivery_options ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;');
    await pool.query('ALTER TABLE certificate_delivery_options ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;');
}

async function seedData() {
    const adminPassword = await bcrypt.hash('admin12345', 10);

    await pool.query(`
        INSERT INTO users (name, email, password, phone, role)
        VALUES ('Администратор', 'admin@photostudio.local', $1, '+7 999 000-00-00', 'admin')
        ON CONFLICT (email) DO NOTHING;
    `, [adminPassword]);

    await seedServices();
    await seedServicePackages();
    await seedAddons();
    await seedPortfolio();
    await seedCertificateCatalog();
    await seedWorkingHours();
    await seedSettings();
    await cleanupDuplicateSeedRows();
}

async function seedServicePackages() {
    const services = await pool.query('SELECT id, price FROM services');
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
                WHERE NOT EXISTS (
                    SELECT 1 FROM service_packages WHERE service_id = $1::integer AND title = $2::varchar
                )
            `, [service.id, ...item]);
        }
    }
}

async function seedServices() {
    const upload = (fileName) => `/uploads/${fileName}`;
    const services = [
        ['Индивидуальная фотосессия', 'Портретная съемка в студии, городе или на природе.', 5000, 1, 'Портрет', upload('1778782835314-service1_4.jpg'), true, '1 час', '7-10 дней', 'от 50 фото', 'Студия / Улица', 'Помощь в позировании и подборе образа'],
        ['Love Story', 'Романтическая фотосессия для пары в красивых локациях.', 6000, 1, 'Пара', upload('1778782975344-service2.jpg'), true, '1-1,5 часа', '7-10 дней', 'от 70 фото', 'Студия / прогулка', 'Подберем маршрут и настроение съемки'],
        ['Семейная фотосессия', 'Теплые и живые семейные кадры с естественными эмоциями.', 7000, 1, 'Семья', upload('1778782931927-gallery1.jpg'), true, '1-1,5 часа', '7-12 дней', 'от 80 фото', 'Студия / дом / улица', 'Поможем с образами для всей семьи'],
        ['Фотосессия беременности', 'Нежные и красивые кадры в ожидании чуда.', 6000, 1, 'Беременность', upload('1778799100676-photo2.jpg'), false, '1 час', '7-10 дней', 'от 50 фото', 'Студия / природа', 'Спокойная съемка с мягким позированием'],
        ['Контент-съемка', 'Фото для социальных сетей, сайта, личного бренда и экспертного блога.', 8000, 2, 'Контент', upload('1781037357299-photo1.jpg'), true, '2 часа', '5-7 дней', 'от 100 фото', 'Студия / рабочая локация', 'Составим план кадров под ваши задачи'],
        ['Бизнес-портрет', 'Деловые портреты для резюме, сайта, команды и профессиональных профилей.', 6500, 1, 'Бизнес', upload('1778844214485-image.jpg'), false, '1 час', '5-7 дней', 'от 40 фото', 'Студия / офис', 'Подберем свет, фон и строгий образ'],
        ['Свадебная съемка', 'Репортаж и постановочные кадры церемонии, прогулки и важных деталей дня.', 18000, 4, 'Свадьба', upload('1778844269816-4.jpg'), true, 'от 4 часов', '14-21 день', 'от 250 фото', 'Выездная съемка', 'Поможем с таймингом и локациями'],
        ['Детская фотосессия', 'Легкая и живая съемка детей с играми, движением и настоящими эмоциями.', 5500, 1, 'Дети', upload('1778763414224-2.jpg'), false, '1 час', '7-10 дней', 'от 50 фото', 'Студия / улица', 'Съемка проходит в комфортном темпе для ребенка'],
        ['Репортажная съемка', 'Фотографии мероприятий, праздников, мастер-классов и камерных событий.', 9000, 2, 'Репортаж', upload('1778844249609-2.jpg'), false, 'от 2 часов', '5-10 дней', 'от 120 фото', 'Выездная съемка', 'Сохраним атмосферу события без лишней постановки'],
        ['Предметная съемка', 'Аккуратные кадры товаров, декора, handmade-изделий и каталожных позиций.', 7000, 2, 'Предметы', upload('1778844179962-image.jpg'), false, '2 часа', '5-7 дней', 'от 60 фото', 'Студия', 'Подберем фон, свет и композицию под продукт']
    ];

    for (const service of services) {
        await pool.query(`
            INSERT INTO services (title, description, price, duration_hours, category, image_url, is_popular)
            SELECT $1::varchar, $2::text, $3::integer, $4::integer, $5::varchar, $6::text, $7::boolean
            WHERE NOT EXISTS (SELECT 1 FROM services WHERE title = $1);
        `, service.slice(0, 7));
        await pool.query(`
            UPDATE services
            SET description = $2::text,
                price = $3::integer,
                duration_hours = $4::integer,
                category = $5::varchar,
                image_url = $6::text,
                is_popular = $7::boolean,
                service_duration_text = $8::varchar,
                photo_delivery_text = $9::varchar,
                photo_count_text = $10::varchar,
                service_location = $11::varchar,
                service_recommendations = $12::text,
                is_active = true
            WHERE title = $1::varchar;
        `, service);
    }
}

async function seedAddons() {
    const addons = [
        ['Ретушь фотографий', 'Профессиональная ретушь портретов, цветокоррекция, устранение недостатков и художественная обработка.', 500, 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=900&q=80'],
        ['Печать фотографий', 'Печать ваших лучших кадров на профессиональной фотобумаге в разных форматах.', 100, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80'],
        ['Фотокниги', 'Дизайн и изготовление фотокниг премиум-качества с вашими лучшими моментами.', 2000, 'https://images.unsplash.com/photo-1519682337058-a94d519337bc?auto=format&fit=crop&w=900&q=80'],
        ['Подарочный сертификат', 'Отличный подарок для близких на любую фотосессию в нашей студии.', 3000, 'https://images.unsplash.com/photo-1607344645866-009c320b63e0?auto=format&fit=crop&w=900&q=80'],
        ['Визажист', 'Профессиональный макияж для фотосессии от опытного визажиста.', 2000, 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80'],
        ['Аренда одежды', 'Стильная одежда и аксессуары для вашей фотосессии в нашей студии.', 1000, 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80'],
        ['Аренда студии', 'Почасовая аренда фотостудии с профессиональным светом и оборудованием.', 1500, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=900&q=80'],
        ['Аэросъемка', 'Профессиональная съемка с дрона для мероприятий, рекламы, видео и фото.', 5000, 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=900&q=80']
    ];

    for (const addon of addons) {
        await pool.query(`
            INSERT INTO additional_services (title, description, price, image_url)
            SELECT $1::varchar, $2::text, $3::integer, $4::text
            WHERE NOT EXISTS (SELECT 1 FROM additional_services WHERE title = $1);
        `, addon);
        await pool.query(`
            UPDATE additional_services
            SET description = $2::text,
                price = $3::integer,
                image_url = COALESCE(image_url, $4::text)
            WHERE title = $1::varchar;
        `, addon);
    }
}

async function seedPortfolio() {
    const upload = (fileName) => `/uploads/${fileName}`;
    const items = [
        ['Осенний портрет', 'Портрет', upload('1778782835314-service1_4.jpg'), 1],
        ['История двоих', 'Love Story', upload('1778782975344-service2.jpg'), 2],
        ['Семейное утро', 'Семья', upload('1778782931927-gallery1.jpg'), 3],
        ['В ожидании', 'Беременность', upload('1778799100676-photo2.jpg'), 4],
        ['Личный бренд', 'Контент', upload('1781037357299-photo1.jpg'), 5],
        ['Деловой портрет', 'Бизнес', upload('1778844214485-image.jpg'), 6],
        ['Свадебный день', 'Свадьба', upload('1778844269816-4.jpg'), 7],
        ['Детская история', 'Дети', upload('1778763414224-2.jpg'), 8],
        ['Событие в кадре', 'Репортаж', upload('1778844249609-2.jpg'), 9],
        ['Детали продукта', 'Предметы', upload('1778844179962-image.jpg'), 10]
    ];

    for (const item of items) {
        await pool.query(`
            INSERT INTO portfolio (title, category, image_url, sort_order)
            SELECT $1::varchar, $2::varchar, $3::text, $4::integer
            WHERE NOT EXISTS (SELECT 1 FROM portfolio WHERE title = $1);
        `, item);
        await pool.query(`
            UPDATE portfolio
            SET category = $2::varchar,
                image_url = $3::text,
                sort_order = $4::integer
            WHERE title = $1::varchar;
        `, item);
    }
}

async function seedCertificateCatalog() {
    const products = [
        ['Сертификат 3 000 ₽', 'Универсальный сертификат на фотосессию или дополнительные услуги.', 3000, 'amount', 1],
        ['Сертификат 5 000 ₽', 'Популярный номинал для портретной или семейной съемки.', 5000, 'amount', 2],
        ['Сертификат 10 000 ₽', 'Оптимальный подарок на полноценную фотосессию.', 10000, 'amount', 3],
        ['Сертификат 15 000 ₽', 'Расширенный сертификат для съемки и дополнительных услуг.', 15000, 'amount', 4],
        ['Сертификат 20 000 ₽', 'Премиальный сертификат для большого пакета услуг.', 20000, 'amount', 5]
    ];

    for (const product of products) {
        await pool.query(`
            INSERT INTO certificate_products (title, description, amount, type, sort_order)
            SELECT $1::varchar, $2::text, $3::integer, $4::varchar, $5::integer
            WHERE NOT EXISTS (SELECT 1 FROM certificate_products WHERE amount = $3);
        `, product);
    }

    const designs = [
        ['Классический черный', 'classic', null, 'dark', 1],
        ['Минимализм', 'minimal', null, 'light', 2],
        ['Черное золото', 'gold', null, 'dark', 3],
        ['Нежность', 'tender', null, 'light', 4],
        ['Ботаника', 'botanic', null, 'dark', 5],
        ['Крафт', 'craft', null, 'warm', 6]
    ];

    for (const design of designs) {
        await pool.query(`
            INSERT INTO certificate_designs (title, code, image_url, theme, sort_order)
            SELECT $1::varchar, $2::varchar, $3::text, $4::varchar, $5::integer
            WHERE NOT EXISTS (SELECT 1 FROM certificate_designs WHERE code = $2);
        `, design);
    }

    const deliveryOptions = [
        ['Электронный', 'Файл сертификата придет на e-mail', '✉', 1],
        ['Печатный', 'Заберу в студии или с доставкой', '▤', 2],
        ['Доставка курьером', 'Доставка по Москве в удобное время', '⌁', 3]
    ];

    for (const option of deliveryOptions) {
        await pool.query(`
            INSERT INTO certificate_delivery_options (title, description, icon, sort_order)
            SELECT $1::varchar, $2::text, $3::varchar, $4::integer
            WHERE NOT EXISTS (SELECT 1 FROM certificate_delivery_options WHERE title = $1);
        `, option);
    }
}

async function seedWorkingHours() {
    for (let day = 0; day <= 6; day += 1) {
        await pool.query(`
            INSERT INTO working_hours (day_of_week, is_working, start_time, end_time)
            VALUES ($1, $2, '10:00', '19:00')
            ON CONFLICT (day_of_week) DO NOTHING;
        `, [day, day !== 0]);
    }
}

async function seedSettings() {
    const settings = {
        studio_name: 'PHOTO STUDIO',
        short_tagline: 'Запечатлеваем важные моменты',
        tagline: 'Живые фотосессии с вниманием к деталям',
        hero_eyebrow: '',
        hero_title: 'Профессиональные фотосессии',
        hero_text: 'Подберем идеальный образ, локацию и атмосферу для ваших незабываемых фотографий',
        hero_image_url: '/uploads/1778782944395-about-hero.jpg',
        about_title: 'Фотограф Дарья',
        about_intro: 'Привет! Меня зовут Дарья. Я фотограф, который помогает людям чувствовать себя спокойно перед камерой и сохранять живые, теплые моменты без лишней постановки.',
        about_text: 'Мой путь в фотографии начался с простого желания замечать красоту в обычных моментах: в мягком свете, искреннем взгляде, движении рук и улыбке между фразами.\n\nСегодня для меня съемка — это не только красивые кадры, но и бережный процесс. Я заранее помогаю продумать образ, выбрать локацию и настроение, а во время съемки мягко направляю, чтобы вам не приходилось думать, куда деть руки или как встать.\n\nЯ снимаю портреты, love story, семейные истории и важные личные события. Моя цель — сделать фотографии, в которых вы узнаете себя настоящими и к которым захотите возвращаться снова.',
        about_hero_image_url: '/uploads/darya.jpg',
        about_image_url: '/uploads/darya.jpg',
        about_years_value: '7+',
        about_years_label: 'лет опыта',
        about_clients_value: '1000+',
        about_clients_label: 'довольных клиентов',
        about_stat_1_label: 'Фотосессий проведено',
        about_stat_1_value: '350+',
        about_stat_2_label: 'Лет в фотографии',
        about_stat_2_value: '7+',
        about_stat_3_label: 'Довольных клиентов',
        about_stat_3_value: '1000+',
        about_stat_4_label: 'Город съемки',
        about_stat_4_value: 'Чебоксары',
        equipment_cameras: 'Canon R5, Canon 6D Mark II',
        equipment_lenses: 'Светосильные фикс-объективы и зум-объективы L-серии',
        equipment_light: 'Профессиональные студийные вспышки и постоянный свет',
        equipment_extra: 'Реквизит и аксессуары для съемок',
        certificate_text: 'Подарите близким фотосессию: выберите сумму сертификата, оставьте контакты, и администратор свяжется для оформления.',
        contact_phone: '+7 (999) 123-45-67',
        contact_email: 'nikitinadara43@gmail.com',
        contact_address: 'г. Чебоксары',
        working_text: 'Пн - Пт: 10:00 - 20:00\nСб - Вс: 10:00 - 18:00',
        service_duration: '1-1,5 часа',
        service_delivery: '7-10 дней',
        service_photo_count: 'от 50 штук',
        service_location: 'Студия / Улица',
        service_recommendations: 'Помощь в позировании и подборе образа'
    };

    for (const [key, value] of Object.entries(settings)) {
        await pool.query(`
            INSERT INTO site_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
        `, [key, value]);
    }
}

async function cleanupDuplicateSeedRows() {
    await pool.query(`
        UPDATE services
        SET is_active = false
        WHERE title = 'Индивидуальная съемка';
    `);

    await pool.query(`
        UPDATE additional_services
        SET is_active = false
        WHERE title IN ('Ретушь 10 фото', 'Макияж и укладка', 'Срочная отдача');
    `);

    await pool.query(`
        DELETE FROM services current
        USING services duplicate
        WHERE current.title = duplicate.title
            AND current.id > duplicate.id;
    `);

    await pool.query(`
        DELETE FROM additional_services current
        USING additional_services duplicate
        WHERE current.title = duplicate.title
            AND current.id > duplicate.id;
    `);

    await pool.query(`
        DELETE FROM portfolio current
        USING portfolio duplicate
        WHERE current.title = duplicate.title
            AND current.id > duplicate.id;
    `);
}

initDB();
