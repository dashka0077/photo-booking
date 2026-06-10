require('dotenv').config();
const pool = require('./db');

const upload = (name) => `/uploads/${name}`;

const serviceImages = [
    ['Индивидуальная фотосессия', 'Портрет', upload('1778799149452-photo1.jpg')],
    ['Love Story', 'Пара', upload('1778763414224-2.jpg')],
    ['Фотосессия с животными', 'Семья', upload('1778844236797-1.jpg')],
    ['Фотосессия на природе', 'Портрет', upload('1778844249609-2.jpg')],
    ['Семейная фотосессия', 'Семья', upload('1778782727876-gallery1.jpg')]
];

const portfolioItems = [
    ['Портрет в студии', 'Портрет', upload('1778763330192-photo2.jpg'), 10],
    ['Женский портрет', 'Портрет', upload('1778799100676-photo2.jpg'), 11],
    ['Портрет Дарьи', 'Портрет', upload('darya.jpg'), 12],
    ['Love Story в закате', 'Love Story', upload('1778782893918-port3.jpg'), 20],
    ['История двоих', 'Love Story', upload('1778782975344-service2.jpg'), 21],
    ['Семейное утро', 'Семья', upload('1778782931927-gallery1.jpg'), 30],
    ['Семейная прогулка', 'Семья', upload('1778782911304-5.jpg'), 31],
    ['Беременность', 'Беременность', upload('1778782944395-about-hero.jpg'), 40],
    ['Студийная съемка', 'Студийные', upload('1778783054730-1778119470_index.jpg'), 50],
    ['Коммерческий кадр', 'Коммерческие', upload('1778844269816-4.jpg'), 60],
    ['Минималистичный портрет', 'Портрет', upload('1778799074489-image-10.png'), 70],
    ['Светлая серия', 'Студийные', upload('1778844179962-image.jpg'), 80],
    ['Теплая серия', 'Студийные', upload('1778844214485-image.jpg'), 81],
    ['Черно-белая серия', 'Коммерческие', upload('1778776146290-6.jpg'), 90]
];

const legacyPortfolioImages = [
    [1, upload('1778782893918-port3.jpg')],
    [2, upload('1778763414224-2.jpg')],
    [3, upload('1778782975344-service2.jpg')],
    [4, upload('1778844249609-2.jpg')],
    [5, upload('1778844236797-1.jpg')],
    [6, upload('1778782931927-gallery1.jpg')],
    [7, upload('1778782727876-gallery1.jpg')]
];

const extraAddons = [
    ['Срочная обработка', 'Приоритетная обработка и отдача готовых фотографий в ускоренные сроки.', 2500, upload('1778844179962-image.jpg')],
    ['Дополнительный час съемки', 'Продление фотосессии на один час с сохранением выбранного стиля и локации.', 3500, upload('1778783054765-1778119470_index.jpg')],
    ['Стилист на съемку', 'Подбор образа, помощь с одеждой, аксессуарами и общим настроением съемки.', 3000, upload('1778844269816-4.jpg')],
    ['Видеоролик backstage', 'Короткое вертикальное видео о процессе съемки для соцсетей.', 4000, upload('1778799074489-image-10.png')],
    ['Дополнительная ретушь', 'Профессиональная ретушь дополнительных кадров сверх выбранного пакета.', 700, upload('1778782835314-service1_4.jpg')],
    ['Аренда фотозоны', 'Подготовленная фотозона с реквизитом и светом под тему съемки.', 2500, upload('1778782944395-about-hero.jpg')]
];

async function seedUploads() {
    for (const [title, category, imageUrl] of serviceImages) {
        await pool.query(`
            UPDATE services
            SET category = $2,
                image_url = $3
            WHERE title = $1
        `, [title, category, imageUrl]);
    }

    for (const [title, category, imageUrl, sortOrder] of portfolioItems) {
        await pool.query(`
            INSERT INTO portfolio (title, category, image_url, sort_order)
            SELECT $1::varchar, $2::varchar, $3::text, $4::integer
            WHERE NOT EXISTS (
                SELECT 1 FROM portfolio WHERE title = $1 AND image_url = $3
            )
        `, [title, category, imageUrl, sortOrder]);
    }

    for (const [id, imageUrl] of legacyPortfolioImages) {
        await pool.query(`
            UPDATE portfolio
            SET image_url = $2::text
            WHERE id = $1::integer
                AND (
                    image_url LIKE '/uploads/177971%'
                    OR image_url LIKE '/uploads/178098%'
                )
        `, [id, imageUrl]);
    }

    for (const [title, description, price, imageUrl] of extraAddons) {
        await pool.query(`
            INSERT INTO additional_services (title, description, price, image_url, is_active)
            SELECT $1::varchar, $2::text, $3::integer, $4::text, true
            WHERE NOT EXISTS (
                SELECT 1 FROM additional_services WHERE title = $1::varchar
            )
        `, [title, description, price, imageUrl]);
    }

    console.log(`Upload images seeded: ${serviceImages.length} services, ${portfolioItems.length} portfolio items, ${extraAddons.length} addons`);
}

seedUploads()
    .then(() => pool.end())
    .catch((error) => {
        console.error(error);
        pool.end().finally(() => process.exit(1));
    });
