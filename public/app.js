const state = {
    services: [],
    addons: [],
    portfolio: [],
    certificateProducts: [],
    certificateDesigns: [],
    certificateDeliveryOptions: [],
    servicePackages: {},
    reviews: [],
    favoriteServices: [],
    adminServices: [],
    adminAddons: [],
    settings: {},
    user: JSON.parse(localStorage.getItem('photoUser') || 'null'),
    token: localStorage.getItem('photoToken')
};

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const authModal = document.querySelector('#authModal');
const bookingModal = document.querySelector('#bookingModal');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mainNav = document.querySelector('#mainNav');

const money = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
}[char]));
const asArray = (value) => Array.isArray(value) ? value : [];

let statusWatcherStarted = false;
let statusWatcherId = null;

function clearSession() {
    localStorage.removeItem('photoToken');
    localStorage.removeItem('photoUser');
    localStorage.removeItem('photoStatusMap');
    state.token = null;
    state.user = null;
    state.favoriteServices = [];
    statusWatcherStarted = false;
    if (statusWatcherId) {
        clearInterval(statusWatcherId);
        statusWatcherId = null;
    }
    syncHeader();
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
            ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
        }
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : { message: await response.text().catch(() => '') };

    if (response.ok && path.startsWith('/api/') && !contentType.includes('application/json')) {
        throw new Error('Сервер нужно перезапустить, чтобы применились новые API');
    }

    if (!response.ok) {
        const error = new Error(data.message || 'Что-то пошло не так');
        error.status = response.status;
        if (response.status === 401 && !path.startsWith('/auth/')) {
            clearSession();
            error.message = 'Сессия истекла. Войдите снова';
        }
        throw error;
    }

    return data;
}

function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    setTimeout(() => {
        toast.hidden = true;
    }, 3200);
}

function closeAdminEditorModal() {
    const modal = document.querySelector('#adminEditorModal');
    if (modal) modal.hidden = true;
}

function openAdminEditorModal(title, content) {
    let modal = document.querySelector('#adminEditorModal');
    if (!modal) {
        modal = document.createElement('section');
        modal.className = 'modal admin-editor-modal';
        modal.id = 'adminEditorModal';
        modal.hidden = true;
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-panel admin-editor-modal-panel">
            <button class="modal-close" type="button" data-close-modal aria-label="Закрыть">×</button>
            <div class="admin-editor-modal-head">
                <div>
                    <p class="eyebrow">Администрирование</p>
                    <h2>${esc(title)}</h2>
                    <span>Все изменения сразу отразятся на сайте.</span>
                </div>
                <a class="btn ghost" href="#services" data-close-modal>На сайт</a>
            </div>
            ${content}
        </div>
    `;
    modal.hidden = false;
}

function closeMobileMenu() {
    document.body.classList.remove('nav-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
}

function toggleMobileMenu() {
    const open = !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    if (menuToggle) menuToggle.setAttribute('aria-expanded', String(open));
}

function scrollChatToBottom() {
    requestAnimationFrame(() => {
        document.querySelectorAll('.chat-messages').forEach((chat) => {
            chat.scrollTop = chat.scrollHeight;
        });
    });
}

function setSession(data) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('photoToken', data.token);
    localStorage.setItem('photoUser', JSON.stringify(data.user));
    syncHeader();
    startStatusWatcher();
    const pendingRoute = sessionStorage.getItem('photoPendingRoute');
    if (pendingRoute) {
        sessionStorage.removeItem('photoPendingRoute');
        location.hash = pendingRoute;
    }
    loadPersonalData().then(renderCurrentRoute).catch(handleRenderError);
}

function syncHeader() {
    document.querySelectorAll('[data-open-auth]').forEach((button) => {
        button.hidden = Boolean(state.user);
    });
    const logoutButton = document.querySelector('[data-logout]');
    if (logoutButton) logoutButton.hidden = !state.user;
    document.querySelectorAll('[data-auth-link]').forEach((link) => {
        link.hidden = !state.user;
    });
    document.querySelectorAll('[data-admin-link]').forEach((link) => {
        link.hidden = state.user?.role !== 'admin';
    });

    const studioName = state.settings.studio_name || 'PHOTO STUDIO';
    const tagline = state.settings.short_tagline || state.settings.tagline || 'Запечатлеваем важные моменты';
    const phone = state.settings.contact_phone || '+7 (999) 123-45-67';
    const brandName = document.querySelector('[data-brand-name]');
    const brandTagline = document.querySelector('[data-brand-tagline]');
    const phoneLink = document.querySelector('[data-phone-link]');
    if (brandName) brandName.textContent = studioName;
    if (brandTagline) brandTagline.textContent = tagline;
    if (phoneLink) {
        phoneLink.innerHTML = `<span>${esc(phone)}</span><small>Ежедневно 9:00 - 21:00</small>`;
        phoneLink.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
    }
}

async function boot() {
    const [settings, services, addons, portfolio, certificateProducts, certificateDesigns, certificateDeliveryOptions, reviews] = await Promise.all([
        api('/api/settings').catch(() => ({})),
        api('/api/services').catch(() => []),
        api('/api/addons').catch(() => []),
        api('/api/portfolio').catch(() => []),
        api('/api/certificate-products').catch(() => []),
        api('/api/certificate-designs').catch(() => []),
        api('/api/certificate-delivery-options').catch(() => []),
        api('/api/reviews').catch(() => [])
    ]);

    state.settings = settings;
    state.services = services;
    state.addons = addons;
    state.portfolio = portfolio;
    state.certificateProducts = certificateProducts;
    state.certificateDesigns = certificateDesigns;
    state.certificateDeliveryOptions = certificateDeliveryOptions;
    state.reviews = asArray(reviews);
    state.servicePackages = Object.fromEntries(await Promise.all(
        services.map(async (service) => [service.id, await api(`/api/service-packages?serviceId=${service.id}`).catch(() => [])])
    ));
    if (state.token) {
        const me = await api('/api/me').catch(() => null);
        if (me) {
            state.user = me;
            localStorage.setItem('photoUser', JSON.stringify(me));
        }
    }
    await loadPersonalData();
    syncHeader();
    await renderCurrentRoute();
    startStatusWatcher();
}

async function loadPersonalData() {
    if (!state.user || !state.token) {
        state.favoriteServices = [];
        return;
    }
    state.favoriteServices = asArray(await api('/api/me/favorites').catch(() => []));
}

function startStatusWatcher() {
    if (statusWatcherStarted || !state.user) return;
    statusWatcherStarted = true;
    checkStatusNotifications(false).catch(() => {});
    statusWatcherId = setInterval(() => checkStatusNotifications(true).catch(() => {}), 30000);
}

function handleRenderError(error) {
    showToast(error.message || 'Не удалось загрузить страницу');
    if (error.status === 401) {
        openAuth('login');
        location.hash = 'home';
    }
}

async function renderCurrentRoute() {
    try {
        await render();
    } catch (error) {
        handleRenderError(error);
    }
}

async function checkStatusNotifications(announce = true) {
    if (!state.user) return;
    const [bookings, certificates] = await Promise.all([
        api('/api/me/bookings').catch(() => []),
        api('/api/me/certificates').catch(() => [])
    ]);
    const current = {};
    bookings.forEach((item) => { current[`booking-${item.id}`] = item.status; });
    certificates.forEach((item) => { current[`certificate-${item.id}`] = item.status; });
    const previous = JSON.parse(localStorage.getItem('photoStatusMap') || '{}');

    if (announce) {
        Object.entries(current).forEach(([key, status]) => {
            if (previous[key] && previous[key] !== status) {
                const isBooking = key.startsWith('booking-');
                showToast(`${isBooking ? 'Статус записи' : 'Статус сертификата'} изменен: ${statusLabel(status)}`);
            }
        });
    }

    localStorage.setItem('photoStatusMap', JSON.stringify(current));
}

function render() {
    const route = (location.hash.replace('#', '') || 'home').split('?')[0];
    const serviceMatch = route.match(/^service-(\d+)$/);
    const adminMatch = route.match(/^admin(?:-(.+))?$/);

    document.querySelectorAll('.nav a').forEach((link) => {
        const href = link.getAttribute('href');
        link.classList.toggle('active', href === `#${route}` || (serviceMatch && href === '#services'));
    });

    if (adminMatch) return renderAdminPage(adminMatch[1] || 'overview');
    if (serviceMatch) return renderServiceDetail(Number(serviceMatch[1]));
    if (route === 'services') return renderServicesPage();
    if (route === 'addons') return renderAddonsPage();
    if (route === 'portfolio') return renderPortfolioPage();
    if (route === 'about') return renderAboutPage();
    if (route === 'booking') return renderBookingPage();
    if (route === 'certificate' || route === 'certificateForm') return renderCertificatePage();
    if (route === 'profile') return renderProfilePage();
    if (route === 'favorites') return renderFavoritesPage();
    if (route === 'admin') return renderAdminPage();
    return renderHomePage();
}

function serviceCard(service) {
    const favorite = isFavorite(service.id);
    const summary = reviewSummary(service.id);
    return `
        <article class="card" data-public-card data-title="${esc(`${service.title || ''} ${service.description || ''}`).toLowerCase()}" data-category="${esc(service.category || '')}">
            <a href="#service-${service.id}" class="card-image-link">
                <img src="${esc(service.image_url || fallbackImage())}" alt="${esc(service.title)}">
            </a>
            <div class="card-body">
                ${service.is_popular ? '<span class="badge">Популярно</span>' : ''}
                <h3>${esc(service.title)}</h3>
                <p>${esc(service.description || '')}</p>
                <p class="muted">${service.duration_hours || 1} час · ${esc(service.category || 'Фотосессия')}</p>
                <p class="service-rating">★ ${summary.count ? `${summary.avg.toFixed(1)} · ${summary.count} отзывов` : 'Пока нет отзывов'}</p>
                <div class="price-row">
                    <strong>от ${money(service.price)}</strong>
                    <button class="btn ghost" type="button" data-toggle-favorite="${service.id}">${favorite ? 'В избранном' : 'В избранное'}</button>
                    <a class="btn ghost" href="#service-${service.id}">Подробнее</a>
                </div>
            </div>
        </article>
    `;
}

function isFavorite(serviceId) {
    return asArray(state.favoriteServices).some((item) => Number(item.id || item.service_id) === Number(serviceId));
}

function reviewSummary(serviceId) {
    const items = asArray(state.reviews).filter((review) => Number(review.service_id) === Number(serviceId));
    const avg = items.length ? items.reduce((total, item) => total + Number(item.rating || 0), 0) / items.length : 0;
    return { count: items.length, avg };
}

function fallbackPackages(service) {
    const basePrice = Number(service?.price || 0);
    return [
        { id: `fallback-${service.id}-standard`, title: 'Стандарт', price: basePrice, hours: 1, photo_count: 'от 50 фото', retouch_count: '10 фото в ретуши' },
        { id: `fallback-${service.id}-optimal`, title: 'Оптимальный', price: basePrice + 2000, hours: 1.5, photo_count: 'от 80 фото', retouch_count: '20 фото в ретуши' },
        { id: `fallback-${service.id}-premium`, title: 'Премиум', price: basePrice + 5000, hours: 2, photo_count: 'от 120 фото', retouch_count: '30 фото в ретуши' }
    ];
}

function addonCard(addon) {
    return `
        <article class="card addon-card" data-public-card data-title="${esc(`${addon.title || ''} ${addon.description || ''}`).toLowerCase()}" data-category="Доп. услуги">
            <img src="${esc(addon.image_url || fallbackImage())}" alt="${esc(addon.title)}">
            <div class="card-body">
                <h3>${esc(addon.title)}</h3>
                <p>${esc(addon.description || '')}</p>
                <div class="price-row">
                    <strong>от ${money(addon.price)}${addon.title.toLowerCase().includes('печать') || addon.title.toLowerCase().includes('ретуш') ? ' / фото' : ''}</strong>
                </div>
            </div>
        </article>
    `;
}

function renderHomePage() {
    const heroImage = state.settings.hero_image_url || state.portfolio[0]?.image_url || fallbackImage();
    app.innerHTML = `
        <section class="hero" style="--hero-image: url('${esc(heroImage)}')">
            <div class="hero-inner">
                <h1>${esc(state.settings.hero_title || 'Профессиональные фотосессии')}</h1>
                <p>${esc(state.settings.hero_text || 'Подберем идеальный образ, локацию и атмосферу для ваших незабываемых фотографий')}</p>
                <div class="hero-actions">
                    <button class="btn accent" data-open-booking>Выбрать фотосессию</button>
                    <a class="play-link" href="#portfolio"><span>▶</span> Смотреть портфолио</a>
                </div>
            </div>
        </section>

        <section class="page compact">
            <div class="section-head">
                <h2>Популярные услуги</h2>
                <span class="section-mark"></span>
            </div>
            <div class="grid">${state.services.slice(0, 4).map(serviceCard).join('')}</div>
        </section>

        ${renderBenefits('Почему выбирают нас')}
        ${renderCta('Готовы к съемке?', 'Забронируйте удобное время и получите незабываемые фотографии')}
        ${renderFooter()}
    `;
}

function renderBenefits(title = 'Почему выбирают нас') {
    return `
        <section class="benefits">
            <div class="section-head">
                <h2>${esc(title)}</h2>
                <span class="section-mark"></span>
            </div>
            <div class="benefit-grid">
                ${benefit('▣', 'Профессионализм', state.settings.benefit_1 || 'Более 5 лет опыта в фотографии и сотни довольных клиентов.')}
                ${benefit('☑', 'Качественная обработка', state.settings.benefit_2 || 'Профессиональная ретушь всех лучших фотографий.')}
                ${benefit('□', 'Удобство', state.settings.benefit_3 || 'Онлайн запись и помощь в подборе времени и локации.')}
                ${benefit('♡', 'Индивидуальный подход', state.settings.benefit_4 || 'Создаем комфортную атмосферу и помогаем в позировании.')}
            </div>
        </section>
    `;
}

function benefit(icon, title, text) {
    return `
        <article class="benefit">
            <span class="benefit-icon">${icon}</span>
            <h3>${esc(title)}</h3>
            <p class="muted">${esc(text)}</p>
        </article>
    `;
}

function renderServicesPage() {
    app.innerHTML = `
        <section class="page">
            ${pageBreadcrumb('Услуги')}
            <div class="section-head between">
                <div>
                    <h1 class="page-title">Услуги</h1>
                    <p class="lead">Выберите формат съемки и посмотрите подробности по каждой услуге.</p>
                </div>
                <button class="btn accent" data-open-booking>Записаться онлайн</button>
            </div>
            ${renderPublicFilters('services', state.services.map((item) => item.category))}
            <div class="grid">${state.services.map(serviceCard).join('')}</div>
        </section>
        ${renderFooter()}
    `;
}

function renderServiceDetail(serviceId) {
    const service = state.services.find((item) => Number(item.id) === serviceId);

    if (!service) {
        app.innerHTML = '<section class="page"><p class="lead">Услуга не найдена.</p></section>';
        return;
    }

    const relatedPortfolio = state.portfolio
        .filter((item) => normalize(item.category) === normalize(service.category) || normalize(item.title).includes(normalize(service.title)))
        .slice(0, 5);
    const gallery = relatedPortfolio.length ? relatedPortfolio : state.portfolio.slice(0, 5);
    const mainImage = service.image_url || gallery[0]?.image_url || fallbackImage();
    const packages = (state.servicePackages[service.id] || []).length
        ? state.servicePackages[service.id]
        : fallbackPackages(service);
    const reviews = asArray(state.reviews).filter((review) => Number(review.service_id) === Number(service.id));
    const summary = reviewSummary(service.id);

    app.innerHTML = `
        <section class="service-detail">
            <div class="breadcrumbs">
                <a href="#home">Главная</a><span>›</span><a href="#services">Услуги</a><span>›</span><strong>${esc(service.title)}</strong>
            </div>
            <div class="service-hero">
                <div>
                    <img class="service-main-image" src="${esc(mainImage)}" alt="${esc(service.title)}">
                    <div class="service-thumbs">
                        ${gallery.map((item, index) => `<img class="${index === 0 ? 'active' : ''}" src="${esc(item.image_url)}" alt="${esc(item.title)}">`).join('')}
                    </div>
                </div>
                <div class="service-info">
                    <p class="service-category">♙ ${esc(service.category || 'Фотосессия')}</p>
                    <h1>${esc(service.title)}</h1>
                    <p>${esc(service.description || 'Фотосессия с вниманием к вашему образу, настроению и деталям.')}</p>
                    <div class="service-facts">
                        ${fact('◷', 'Длительность', service.service_duration_text || state.settings.service_duration || `${service.duration_hours || 1}-1,5 часа`)}
                        ${fact('▤', 'Готовность фото', service.photo_delivery_text || state.settings.service_delivery || '7-10 дней')}
                        ${fact('▣', 'Количество фото', service.photo_count_text || state.settings.service_photo_count || 'от 50 штук')}
                        ${fact('⌖', 'Локация', service.service_location || state.settings.service_location || 'Студия / Улица')}
                        ${fact('◇', 'Рекомендации', service.service_recommendations || state.settings.service_recommendations || 'Помощь в позировании и подборе образа')}
                    </div>
                    <div class="service-actions">
                        <button class="btn accent" data-open-booking data-service="${service.id}">Записаться на съемку</button>
                        <button class="btn ghost" type="button" data-toggle-favorite="${service.id}">${isFavorite(service.id) ? 'Убрать из избранного' : 'В избранное'}</button>
                        <a class="btn ghost" href="#portfolio">Смотреть портфолио</a>
                    </div>
                </div>
            </div>

            <div class="service-benefits">
                ${serviceMini('◇', 'Помощь в позировании', 'Подскажу лучшие ракурсы и позы для естественных кадров')}
                ${serviceMini('♙', 'Подбор образа', 'Помогу с выбором одежды и аксессуаров')}
                ${serviceMini('◇', 'Профессиональная обработка', 'Ретушь всех лучших фотографий включена в стоимость')}
                ${serviceMini('◇', 'Комфортная атмосфера', 'Легкая и дружеская атмосфера на съемке')}
            </div>

            <div class="service-columns">
                <section class="panel">
                    <h2>Что входит в съемку</h2>
                    <ul class="check-items">
                        <li>Консультация и помощь в подборе образа</li>
                        <li>Фотосъемка в студии или на выбранной локации</li>
                        <li>Помощь в позировании на протяжении всей съемки</li>
                        <li>Отбор и цветокоррекция всех удачных кадров</li>
                        <li>Профессиональная ретушь выбранных фото</li>
                        <li>Передача фото в высоком разрешении через облако</li>
                    </ul>
                    <div class="bonus"><strong>Бонус</strong><br>10 фото в ретуши при бронировании от 2-х часов съемки</div>
                </section>
                <section class="panel">
                    <h2>Стоимость и пакеты</h2>
                    <div class="package-grid">
                        ${packages.map((item, index) => packageCard(item, service.id, index === 0)).join('')}
                    </div>
                    <p class="muted">* Возможен индивидуальный пакет под ваш запрос</p>
                </section>
            </div>

            <section class="panel service-reviews">
                <div class="section-head between">
                    <div>
                        <h2>Отзывы клиентов</h2>
                        <p class="muted">★ ${summary.count ? `${summary.avg.toFixed(1)} из 5 · ${summary.count} отзывов` : 'Пока отзывов нет'}</p>
                    </div>
                </div>
                <div class="review-grid">
                    ${reviews.length ? reviews.map(reviewCard).join('') : '<p class="muted">Станьте первым клиентом, который оставит отзыв об этой услуге.</p>'}
                </div>
                ${state.user ? `
                    <form class="review-form" id="reviewForm">
                        <input type="hidden" name="serviceId" value="${service.id}">
                        <div class="review-form-head">
                            <strong>Оставить отзыв</strong>
                            <span>Поделитесь впечатлением о съемке</span>
                        </div>
                        <label>Оценка<select name="rating">
                            <option value="5">5 · Отлично</option>
                            <option value="4">4 · Хорошо</option>
                            <option value="3">3 · Нормально</option>
                            <option value="2">2 · Не понравилось</option>
                            <option value="1">1 · Плохо</option>
                        </select></label>
                        <label>Ваш отзыв<textarea name="text" rows="3" placeholder="Расскажите, что понравилось" required></textarea></label>
                        <button class="btn accent" type="submit">Опубликовать отзыв</button>
                    </form>
                ` : '<p class="muted">Чтобы оставить отзыв, войдите в профиль.</p>'}
            </section>

            ${renderCta('Готовы к фотосессии?', 'Забронируйте удобное время, и мы создадим для вас незабываемые кадры')}
        </section>
        ${renderFooter()}
    `;
}

function reviewCard(review) {
    return `
        <article class="review-card">
            <div>
                <img src="${esc(review.avatar_url || fallbackImage())}" alt="${esc(review.user_name || 'Клиент')}">
                <span><strong>${esc(review.user_name || 'Клиент')}</strong><small>${new Date(review.created_at).toLocaleDateString('ru-RU')}</small></span>
            </div>
            <b>${'★'.repeat(Number(review.rating || 5))}</b>
            <p>${esc(review.text)}</p>
        </article>
    `;
}

function renderPublicFilters(scope, categories = []) {
    const uniqueCategories = [...new Set(categories.filter(Boolean))];
    return `
        <div class="public-toolbar" data-public-toolbar="${esc(scope)}">
            <label class="public-search">
                <span>⌕</span>
                <input type="search" placeholder="Поиск..." data-public-search>
            </label>
            ${uniqueCategories.length ? `
                <select data-public-category>
                    <option value="">Все категории</option>
                    ${uniqueCategories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}
                </select>
            ` : ''}
        </div>
    `;
}

function pageBreadcrumb(current) {
    return `
        <div class="breadcrumbs page-breadcrumb">
            <a href="#home">Главная</a><span>›</span><strong>${esc(current)}</strong>
        </div>
    `;
}

function fact(icon, label, value) {
    return `
        <div class="service-fact">
            <span>${icon}</span>
            <p>${esc(label)}</p>
            <strong>${esc(value)}</strong>
        </div>
    `;
}

function serviceMini(icon, title, text) {
    return `
        <article>
            <span>${icon}</span>
            <div>
                <h3>${esc(title)}</h3>
                <p>${esc(text)}</p>
            </div>
        </article>
    `;
}

function packageCard(item, serviceId, active = false) {
    const details = [
        `${String(item.hours || 1).replace('.', ',')} час${Number(item.hours) > 1 ? 'а' : ''} съемки`,
        item.photo_count,
        item.retouch_count
    ].filter(Boolean);
    return `
        <article class="package-card ${active ? 'active' : ''}" data-package-id="${item.id}" data-service="${serviceId}">
            <h3>${esc(item.title)}</h3>
            <strong>${money(item.price)}</strong>
            ${details.map((detail) => `<p>✓ ${esc(detail)}</p>`).join('')}
            <button class="btn ghost" type="button" data-open-booking data-service="${serviceId}" data-package="${item.id}">Выбрать пакет</button>
        </article>
    `;
}

function renderSubHero(title, parent = 'Главная', section = '', current = title) {
    return `
        <section class="sub-hero">
            <div class="sub-hero-inner">
                <h1>${esc(title)}</h1>
                <div class="breadcrumbs dark">
                    <a href="#home">${esc(parent)}</a>
                    ${section ? `<span>›</span><a href="#services">${esc(section)}</a>` : ''}
                    <span>›</span><strong>${esc(current)}</strong>
                </div>
            </div>
        </section>
    `;
}

function renderAddonsPage() {
    app.innerHTML = `
        ${renderSubHero('Дополнительные услуги', 'Главная', 'Услуги', 'Доп. услуги')}
        <section class="page compact">
            ${renderPublicFilters('addons', [])}
            <div class="addon-feature-row">
                ${serviceMini('♧', 'Индивидуальный подход', 'Учитываем ваши пожелания и создаем уникальные решения')}
                ${serviceMini('□', 'Качество', 'Используем профессиональное оборудование и материалы')}
                ${serviceMini('◇', 'Опыт', 'Более 5 лет опыта работы и сотни довольных клиентов')}
                ${serviceMini('☑', 'Удобство', 'Онлайн-запись и консультации на всех этапах')}
            </div>
            <div class="grid">${state.addons.map(addonCard).join('')}</div>
            <div class="package-banner">
                <span>□</span>
                <div>
                    <h3>Комплексные пакеты услуг</h3>
                    <p>Сэкономьте с нашими пакетными предложениями! Подберем оптимальный набор услуг под ваши задачи и бюджет.</p>
                </div>
                <button class="btn ghost" type="button" data-open-chat>Обсудить пакет</button>
            </div>
        </section>
        ${renderCta('Нужна помощь с выбором?', 'Свяжитесь с нами, и мы подберем лучшее решение для вашей съемки')}
        ${renderFooter()}
    `;
}

function renderPortfolioPage() {
    app.innerHTML = `
        <section class="page">
            ${pageBreadcrumb('Портфолио')}
            <div class="section-head">
                <h1 class="page-title">Портфолио</h1>
                <span class="section-mark"></span>
                <p class="lead">Посмотрите примеры съемок и выберите настроение для своей фотосессии.</p>
            </div>
            ${renderPublicFilters('portfolio', state.portfolio.map((item) => item.category))}
            <div class="portfolio-grid">
                ${state.portfolio.map((item) => `
                    <figure class="portfolio-item" data-public-card data-title="${esc(`${item.title || ''} ${item.category || ''}`).toLowerCase()}" data-category="${esc(item.category || '')}">
                        <img src="${esc(item.image_url)}" alt="${esc(item.title)}">
                        <figcaption>${esc(item.title)}</figcaption>
                    </figure>
                `).join('')}
            </div>
        </section>
        ${renderBenefits('Почему выбирают нас')}
        ${renderFooter()}
    `;
}

function renderAboutPage() {
    const aboutImage = state.settings.about_image_url || state.portfolio[0]?.image_url || fallbackImage();
    const aboutHeroImage = state.settings.about_hero_image_url || aboutImage;

    app.innerHTML = `
        <section class="about-hero" style="--about-hero-image: url('${esc(aboutHeroImage)}')">
            <div class="about-hero-inner">
                <p class="eyebrow">Обо мне</p>
                <h1>${esc(state.settings.about_title || 'Фотограф Дарья')}</h1>
                <p>${esc(state.settings.about_intro || 'Привет! Меня зовут Дарья. Я фотограф, который помогает людям чувствовать себя спокойно перед камерой и сохранять живые, теплые моменты без лишней постановки.')}</p>
                <button class="btn accent" data-open-booking>Записаться на съемку</button>
            </div>
        </section>

        <section class="page about-section">
            <div class="about-story">
                <div>
                    <p class="eyebrow">Мой путь</p>
                    <h2>Опыт, внимание и живые истории</h2>
                    <span class="section-mark"></span>
                    <p>${esc(state.settings.about_text || aboutDefaultText())}</p>
                    <div class="about-inline-stats">
                        ${aboutSmallStat(state.settings.about_years_value || '7+', state.settings.about_years_label || 'лет опыта')}
                        ${aboutSmallStat(state.settings.about_clients_value || '1000+', state.settings.about_clients_label || 'довольных клиентов')}
                    </div>
                </div>
                <div>
                    <h2>Обо мне в цифрах</h2>
                    <span class="section-mark"></span>
                    <div class="about-stats-card">
                        ${aboutNumber('▣', state.settings.about_stat_1_label || 'Фотосессий проведено', state.settings.about_stat_1_value || '350+')}
                        ${aboutNumber('□', state.settings.about_stat_2_label || 'Лет в фотографии', state.settings.about_stat_2_value || '7+')}
                        ${aboutNumber('☺', state.settings.about_stat_3_label || 'Довольных клиентов', state.settings.about_stat_3_value || '1000+')}
                        ${aboutNumber('⌖', state.settings.about_stat_4_label || 'Город съемки', state.settings.about_stat_4_value || 'Чебоксары')}
                    </div>
                </div>
            </div>
        </section>

        <section class="page compact">
            <div class="section-head">
                <h2>Почему выбирают меня</h2>
                <span class="section-mark"></span>
            </div>
            <div class="benefit-grid">
                ${benefit('♡', 'Индивидуальный подход', 'Учитываю вашу идею и создаю комфортную атмосферу на съемке.')}
                ${benefit('ϟ', 'Живые эмоции', 'Помогаю раскрыться и ловлю настоящие эмоции в каждом кадре.')}
                ${benefit('☑', 'Качество', 'Профессиональное оборудование и тщательная обработка каждого снимка.')}
                ${benefit('☑', 'Ответственность', 'Соблюдаю сроки и передаю лучший результат.')}
            </div>
        </section>

        <section class="page compact">
            <div class="section-head">
                <h2>Мое оборудование</h2>
                <span class="section-mark"></span>
            </div>
            <div class="equipment-grid">
                ${equipment('▣', 'Камеры', state.settings.equipment_cameras || 'Canon R5, Canon 6D Mark II')}
                ${equipment('◉', 'Объективы', state.settings.equipment_lenses || 'Светосильные фикс-объективы и зум-объективы L-серии')}
                ${equipment('◇', 'Свет', state.settings.equipment_light || 'Профессиональные студийные вспышки и постоянный свет')}
                ${equipment('⌁', 'Дополнительно', state.settings.equipment_extra || 'Реквизит и аксессуары для съемок')}
            </div>
        </section>

        ${renderCta('Давайте создадим ваши лучшие кадры!', 'Запишитесь на фотосессию и сохраним важные моменты вместе')}
        ${renderFooter()}
    `;
}

function aboutDefaultText() {
    return 'Фотография для меня началась с желания замечать детали: свет на лице, улыбку между фразами, спокойствие в жестах. Со временем это стало профессией, в которой я соединяю подготовку, внимательность и мягкое ведение человека в кадре. На съемке я подсказываю позы, помогаю с образом и создаю пространство, где можно быть собой. Моя цель — фотографии, к которым хочется возвращаться снова и снова.';
}

function aboutSmallStat(value, label) {
    return `
        <div>
            <strong>${esc(value)}</strong>
            <span>${esc(label)}</span>
        </div>
    `;
}

function aboutNumber(icon, label, value) {
    return `
        <div class="about-number">
            <span>${icon}</span>
            <p>${esc(label)}</p>
            <strong>${esc(value)}</strong>
        </div>
    `;
}

function equipment(icon, title, text) {
    return `
        <article class="equipment-card">
            <span>${icon}</span>
            <h3>${esc(title)}</h3>
            <p>${esc(text)}</p>
        </article>
    `;
}

function renderBookingPage() {
    app.innerHTML = `
        ${renderSubHero('Запись на фотосессию', 'Главная', '', 'Запись')}
        <section class="page booking-page">
            <form class="booking-page-form panel" id="bookingPageForm">
                <h2>Заполните форму</h2>
                <span class="section-mark"></span>
                <p>Мы свяжемся с вами для подтверждения записи и уточнения всех деталей.</p>

                <div class="form-row">
                    <label><span>♙</span><input name="name" placeholder="Ваше имя" value="${esc(state.user?.name || '')}" required></label>
                    <label><span>☎</span><input name="phone" placeholder="Телефон" value="${esc(state.user?.phone || '')}"></label>
                </div>
                <label><span>✉</span><input type="email" name="email" placeholder="E-mail" value="${esc(state.user?.email || '')}" required></label>
                <label><span>▣</span><select name="serviceId" required>
                    <option value="">Выберите услугу</option>
                    ${state.services.map((service) => `<option value="${service.id}">${esc(service.title)} · от ${money(service.price)}</option>`).join('')}
                </select></label>
                <input type="hidden" name="packageId">
                <div>
                    <p class="field-title">Пакет</p>
                    <div class="package-choice-list" data-booking-packages></div>
                </div>
                <div class="form-row">
                    <label><span>□</span><input type="date" name="date" required></label>
                    <input type="hidden" name="time" required>
                </div>
                <div>
                    <p class="field-title">Свободные окошки</p>
                    <div class="slot-list" data-slot-list></div>
                </div>
                <label><span>⌖</span><select name="location">
                    <option value="">Выберите локацию</option>
                    <option>Студия</option>
                    <option>Улица</option>
                    <option>Дом</option>
                    <option>Обсудить с фотографом</option>
                </select></label>
                <label><span>▱</span><textarea name="comment" rows="5" placeholder="Комментарий (необязательно)"></textarea></label>

                <section class="booking-addon-panel">
                    <h3>Дополнительные услуги</h3>
                    <p>Выберите дополнительные услуги при необходимости.</p>
                    <div class="booking-addon-grid">
                    ${state.addons.map((addon) => `
                        <label>
                            <input type="checkbox" name="addonIds" value="${addon.id}">
                            <span>${esc(addon.title)}<strong>от ${money(addon.price)}</strong></span>
                        </label>
                    `).join('')}
                    </div>
                    <label class="agree-line"><input type="checkbox" required> Я согласен(на) с политикой конфиденциальности</label>
                    <button class="btn accent wide" type="submit">Отправить заявку</button>
                    <p class="muted secure-note">▣ Ваши данные надежно защищены и не передаются третьим лицам.</p>
                </section>
            </form>

            <aside class="booking-side">
                <img src="${esc(state.settings.booking_image_url || state.settings.hero_image_url || fallbackImage())}" alt="Фотоаппарат">
                <div class="panel">
                    <h2>Что дальше?</h2>
                    <span class="section-mark"></span>
                    ${nextStep('◷', 'Мы свяжемся с вами', 'Менеджер свяжется с вами для подтверждения записи.')}
                    ${nextStep('□', 'Обсудим детали', 'Уточним пожелания, образ, локацию и другие важные детали съемки.')}
                    ${nextStep('▣', 'Готовьтесь к съемке', 'Поможем с подготовкой, подскажем по образу и настроим на отличный результат.')}
                    ${nextStep('▤', 'Получите лучшие кадры', 'Проведем съемку и отправим готовые фото в согласованные сроки.')}
                </div>
            </aside>
        </section>
        ${renderCta('Остались вопросы?', 'Свяжитесь с нами любым удобным способом')}
        ${renderFooter()}
    `;
    const form = document.querySelector('#bookingPageForm');
    if (form) {
        renderBookingPackages(form);
        renderAvailableSlots(form).catch((error) => showToast(error.message));
    }
}

function nextStep(icon, title, text) {
    return `
        <article class="next-step">
            <span>${icon}</span>
            <div>
                <h3>${esc(title)}</h3>
                <p>${esc(text)}</p>
            </div>
        </article>
    `;
}

function renderCertificatePage() {
    const activeCertificateProducts = state.certificateProducts
        .filter((product) => product.is_active !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const products = activeCertificateProducts.length
        ? activeCertificateProducts
        : [3000, 5000, 10000, 15000, 20000].map((amount, index) => ({ id: index + 1, title: money(amount), amount }));
    const serviceCertificateProducts = products.some((item) => item.type === 'service')
        ? products
        : [
            ...products,
            ...state.services.map((service) => ({
                id: `service-${service.id}`,
                title: service.title,
                amount: service.price,
                type: 'service'
            }))
        ];
    const defaultProduct = products.find((item) => Number(item.amount) === 10000) || products[0] || { amount: 10000 };
    const defaultAmount = Number(defaultProduct.amount || 10000);
    const designs = state.certificateDesigns.length
        ? state.certificateDesigns
        : [
            { id: 1, title: 'Классический черный', code: 'classic' },
            { id: 2, title: 'Минимализм', code: 'minimal' },
            { id: 3, title: 'Черное золото', code: 'gold' }
        ];
    const deliveries = state.certificateDeliveryOptions.length
        ? state.certificateDeliveryOptions
        : [{ id: 1, icon: '✉', title: 'Электронный', description: 'Файл сертификата придет на e-mail' }];
    const displayCards = [
        { title: '3 000 ₽', amount: 3000, tone: 'light', text: 'Подарочный сертификат на любую услугу фотостудии' },
        { title: '6 000 ₽', amount: 6000, tone: 'dark', text: 'Подарочный сертификат на любую услугу фотостудии' },
        { title: '10 000 ₽', amount: 10000, tone: 'warm', text: 'Подарочный сертификат на любую услугу фотостудии' },
        { title: 'Свободный номинал', amount: defaultAmount, tone: 'black', text: 'Укажите любую сумму, а мы сделаем все остальное' }
    ];

    app.innerHTML = `
        <section class="certificate-showcase">
            <div class="certificate-showcase-hero">
                <div class="certificate-showcase-copy">
                    <h1>Подарочные сертификаты</h1>
                    <p>Идеальный подарок для ваших близких.<br>Выберите подходящий сертификат и подарите яркие эмоции!</p>
                    <div class="certificate-showcase-actions">
                        <button class="btn accent" type="button" data-scroll-certificate-form>Выбрать сертификат</button>
                        <span class="delivery-note"><b>□</b> Доставка на e-mail<br><small>или в подарочной упаковке</small></span>
                    </div>
                </div>
                <div class="certificate-hero-card">
                    <span>PHOTO STUDIO</span>
                    <strong>Подарочный<br>сертификат</strong>
                    <small>для особенного момента</small>
                </div>
            </div>
            <div class="certificate-showcase-benefits">
                ${serviceMini('□', 'Любая сумма', 'Выберите номинал на свой вкус')}
                ${serviceMini('◷', 'Действует 6 месяцев', 'Достаточно времени, чтобы выбрать дату')}
                ${serviceMini('◇', 'Персональное поздравление', 'Добавьте теплые слова для получателя')}
                ${serviceMini('ϟ', 'Быстро и удобно', 'Электронный сертификат придет за пару минут')}
            </div>
            <div class="certificate-pick-head">
                <h2>Выберите сертификат</h2>
                <div class="certificate-tabs mini">
                    <button type="button" class="active" data-cert-tab="amount">Сертификаты на сумму</button>
                    <button type="button" data-cert-tab="service">Сертификаты на услуги</button>
                </div>
            </div>
            <div class="certificate-card-grid">
                ${displayCards.map((card) => `
                    <article class="certificate-product-card ${esc(card.tone)}">
                        <div class="certificate-product-art">
                            <span>Подарочный<br>сертификат</span>
                        </div>
                        <div>
                            <h3>${esc(card.title)}</h3>
                            <p>${esc(card.text)}</p>
                            <button class="btn ghost" type="button" data-cert-amount="${card.amount}" data-cert-title-value="${esc(card.title)}" data-cert-type="amount">Выбрать</button>
                        </div>
                    </article>
                `).join('')}
            </div>
        </section>
        <section class="modal certificate-purchase-modal" id="certificatePurchaseModal" hidden>
            <div class="modal-panel certificate-purchase-panel">
                <button class="modal-close" type="button" data-close-modal aria-label="Закрыть">×</button>
                <div class="certificate-purchase-head">
                    <span>Покупка сертификата</span>
                    <h2>Оформите подарок за пару минут</h2>
                    <p>Выберите номинал, дизайн и оставьте пожелание для получателя.</p>
                </div>
                <div class="certificate-page">
                    <form class="certificate-form panel" id="certificateForm">
                <div class="certificate-tabs">
                    <button type="button" class="active" data-cert-tab="amount">На сумму</button>
                    <button type="button" data-cert-tab="service">На услугу</button>
                </div>
                <h2>Сертификат на сумму</h2>
                <p>Универсальный сертификат на любую фотосессию или дополнительные услуги в нашей студии.</p>
                <input type="hidden" name="amount" value="${defaultAmount}" data-certificate-amount>
                <input type="hidden" name="buyerName" value="${esc(state.user?.name || 'Заявка с сайта')}">
                <input type="hidden" name="buyerEmail" value="${esc(state.user?.email || 'site-request@photostudio.local')}">
                <div class="amount-grid">
                    ${serviceCertificateProducts.map((product) => {
                        const amount = Number(product.amount || 0);
                        return `<button type="button" class="${amount === defaultAmount && product.type !== 'service' ? 'active' : ''}" data-cert-type="${esc(product.type || 'amount')}" data-cert-title-value="${esc(product.title || money(amount))}" data-cert-amount="${amount}">${esc(product.title || money(amount))}</button>`;
                    }).join('')}
                    <label><input type="number" name="customAmount" placeholder="Другая сумма" min="1000"></label>
                </div>
                <h3>Выберите дизайн</h3>
                <div class="design-grid">
                    ${designs.map((design, index) => certificateDesign(design.title, design.code || `design-${design.id}`, index === 0, design.image_url)).join('')}
                </div>
                <h3>Как получить сертификат?</h3>
                <div class="delivery-grid">
                    ${deliveries.map((option, index) => deliveryOption(option.icon || '□', option.title, option.description || '', index === 0)).join('')}
                </div>
                <h3>Получатель <span class="muted">(необязательно)</span></h3>
                <div class="form-row">
                    <label><input name="recipientName" placeholder="Имя получателя"></label>
                    <label><textarea name="message" rows="2" placeholder="Поздравление или пожелание"></textarea></label>
                </div>
                <div class="certificate-total">
                    <div>
                        <span>Количество</span>
                        <strong>1</strong>
                    </div>
                    <div>
                        <span>Итого</span>
                        <strong data-cert-total>${money(defaultAmount)}</strong>
                    </div>
                    <button class="btn accent" type="submit">Добавить в корзину</button>
                </div>
                    </form>
                    <aside class="certificate-preview panel">
                <h2>Предпросмотр</h2>
                <div class="certificate-card-preview">
                    <span>PHOTO STUDIO</span>
                    <strong>ПОДАРОЧНЫЙ<br>СЕРТИФИКАТ</strong>
                    <b data-cert-preview>${money(defaultAmount)}</b>
                </div>
                <h2>Сертификат на сумму<br><span data-cert-title>${money(defaultAmount)}</span></h2>
                <h3>Действует</h3>
                <p>6 месяцев с момента покупки</p>
                <h3>Можно использовать</h3>
                <ul class="check-items">
                    <li>На любые фотосессии</li>
                    <li>На дополнительные услуги</li>
                    <li>На аренду студии и оборудования</li>
                </ul>
                <div class="bonus"><strong>Хотите сделать сюрприз?</strong><br>Оставьте поле получателя пустым, и мы отправим сертификат вам.</div>
                    </aside>
                </div>
            </div>
        </section>
        ${renderCta('Нужна помощь с выбором?', 'Мы поможем подобрать идеальный сертификат для вашего случая')}
        ${renderFooter()}
    `;
    applyCertificateMode('amount');
}

function certificateDesign(title, key, active = false, imageUrl = '') {
    return `
        <label class="design-card ${active ? 'active' : ''}">
            <input type="radio" name="design" value="${key}" ${active ? 'checked' : ''}>
            ${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(title)}">` : ''}
            <span>${esc(title)}</span>
        </label>
    `;
}

function deliveryOption(icon, title, text, active = false) {
    return `
        <label class="delivery-card ${active ? 'active' : ''}">
            <input type="radio" name="delivery" value="${esc(title)}" ${active ? 'checked' : ''}>
            <span>${icon}</span>
            <strong>${esc(title)}</strong>
            <small>${esc(text)}</small>
        </label>
    `;
}

function applyCertificateMode(mode) {
    const form = document.querySelector('#certificateForm');
    if (!form) return;
    document.querySelectorAll('[data-cert-tab]').forEach((button) => {
        button.classList.toggle('active', button.dataset.certTab === mode);
    });
    document.querySelectorAll('[data-cert-amount]').forEach((button) => {
        const visible = (button.dataset.certType || 'amount') === mode;
        button.hidden = !visible;
        if (!visible) button.classList.remove('active');
    });
    const first = document.querySelector(`[data-cert-amount]:not([hidden])`);
    if (first) setCertificateSelection(first);
    const title = mode === 'service' ? 'Сертификат на услугу' : 'Сертификат на сумму';
    form.querySelector('h2').textContent = title;
    const customAmount = form.querySelector('[name="customAmount"]')?.closest('label');
    if (customAmount) customAmount.hidden = mode === 'service';
}

function setCertificateSelection(button, openModal = false) {
    if (!button) return;
    const amount = Number(button.dataset.certAmount);
    const type = button.dataset.certType || 'amount';
    const label = type === 'service' ? button.dataset.certTitleValue : (button.dataset.certTitleValue || money(amount));
    document.querySelectorAll('[data-cert-amount]').forEach((item) => item.classList.toggle('active', item === button));
    const amountInput = document.querySelector('[data-certificate-amount]');
    const total = document.querySelector('[data-cert-total]');
    const preview = document.querySelector('[data-cert-preview]');
    const title = document.querySelector('[data-cert-title]');
    const previewTitle = document.querySelector('.certificate-preview h2');
    const formTitle = document.querySelector('#certificateForm h2');
    if (amountInput) amountInput.value = amount;
    if (total) total.textContent = money(amount);
    if (preview) preview.textContent = label;
    if (title) title.textContent = label;
    if (previewTitle) previewTitle.innerHTML = `${type === 'service' ? 'Сертификат на услугу' : 'Сертификат на сумму'}<br><span data-cert-title>${esc(label)}</span>`;
    if (formTitle) formTitle.textContent = type === 'service' ? 'Сертификат на услугу' : 'Сертификат на сумму';
    if (openModal) openCertificatePurchaseModal();
}

function setCertificateCustomAmount(input) {
    const amount = Number(input.value || 0);
    if (!amount || amount < 1000) return;
    document.querySelectorAll('[data-cert-amount]').forEach((item) => item.classList.remove('active'));
    const amountInput = document.querySelector('[data-certificate-amount]');
    const total = document.querySelector('[data-cert-total]');
    const preview = document.querySelector('[data-cert-preview]');
    const title = document.querySelector('[data-cert-title]');
    const label = money(amount);
    if (amountInput) amountInput.value = amount;
    if (total) total.textContent = label;
    if (preview) preview.textContent = label;
    if (title) title.textContent = label;
}

function openCertificatePurchaseModal() {
    const modal = document.querySelector('#certificatePurchaseModal');
    if (!modal) return;
    modal.hidden = false;
    modal.querySelector('#certificateForm button, #certificateForm input:not([type="hidden"]), #certificateForm textarea')?.focus({ preventScroll: true });
}

async function renderProfilePage() {
    if (!state.user) {
        openAuth('login');
        location.hash = 'home';
        return;
    }

    const profileParams = new URLSearchParams(location.hash.split('?')[1] || '');
    const requestedProfileSection = profileParams.get('section') || 'info';
    const profileSection = ['info', 'bookings', 'certificates', 'favorites', 'reviews', 'chat'].includes(requestedProfileSection)
        ? requestedProfileSection
        : 'info';
    const profileActive = (section) => section === profileSection ? 'active' : '';
    app.innerHTML = '<section class="page"><p class="lead">Загружаю профиль...</p></section>';
    const [me, bookings, certificates, messages, myReviews, favorites] = await Promise.all([
        api('/api/me'),
        api('/api/me/bookings'),
        api('/api/me/certificates'),
        state.user?.role === 'admin' ? Promise.resolve([]) : api('/api/messages'),
        api('/api/me/reviews').catch(() => []),
        api('/api/me/favorites').catch(() => [])
    ]);
    state.user = me;
    const safeReviews = asArray(myReviews);
    const safeFavorites = asArray(favorites);
    let profileMessages = asArray(messages);
    let profileChatBody = `
        <div class="chat-head">
            <div>
                <h2>Чат с фотографом</h2>
                <p class="muted">Задайте вопрос по образу, локации, животным или подготовке к съемке.</p>
            </div>
            <span>Обычно отвечаю в течение дня</span>
        </div>
        <div class="chat-messages">
            ${profileMessages.length ? profileMessages.map((item) => `
                <article class="${Number(item.sender_id) === Number(me.id) ? 'mine' : ''}">
                    <strong>${esc(Number(item.sender_id) === Number(me.id) ? 'Вы' : (item.sender_name || 'Фотограф'))}</strong>
                    <p>${esc(item.message)}</p>
                    <small>${new Date(item.created_at).toLocaleString('ru-RU')}</small>
                </article>
            `).join('') : '<div class="chat-empty"><strong>Сообщений пока нет</strong><p>Напишите первый вопрос, и он появится здесь.</p></div>'}
        </div>
        <form class="chat-form" id="chatForm">
            <textarea name="message" rows="2" placeholder="Напишите сообщение фотографу" required></textarea>
            <button class="btn accent" type="submit">Отправить</button>
        </form>
    `;

    if (me.role === 'admin') {
        const chatClients = asArray(await api('/api/admin/chat-clients').catch(() => []));
        const selectedClientId = Number(profileParams.get('client')) || chatClients[0]?.id || null;
        profileMessages = selectedClientId ? asArray(await api(`/api/messages?recipientId=${selectedClientId}`).catch(() => [])) : [];
        profileChatBody = `
            <h2>Чат с клиентами</h2>
            ${renderAdminChat(chatClients, profileMessages, selectedClientId, 'profile?section=chat')}
        `;
    }
    state.favoriteServices = safeFavorites;
    localStorage.setItem('photoUser', JSON.stringify(me));
    const unreadCount = profileMessages.filter((item) => Number(item.sender_id) !== Number(me.id) && !item.read_at).length;
    const upcomingCount = asArray(bookings).filter((item) => !['cancelled', 'done'].includes(item.status)).length;
    const certificateTotal = asArray(certificates).reduce((total, item) => total + Number(item.amount || 0), 0);
    const profileSectionAttr = (section) => section === profileSection ? '' : ' hidden';
    app.innerHTML = `
        <section class="profile-layout">
            <aside class="profile-sidebar">
                <a class="profile-logo" href="#home"><span>PS</span><strong>PHOTO STUDIO</strong></a>
                <nav>
                    <a class="${profileActive('info')}" href="#profile?section=info"><span>♙</span>Данные</a>
                    <a class="${profileActive('bookings')}" href="#profile?section=bookings"><span>▣</span>Записи</a>
                    <a class="${profileActive('certificates')}" href="#profile?section=certificates"><span>□</span>Сертификаты</a>
                    <a class="${profileActive('favorites')}" href="#profile?section=favorites"><span>♡</span>Избранное</a>
                    <a class="${profileActive('reviews')}" href="#profile?section=reviews"><span>☆</span>Отзывы</a>
                    <a class="${profileActive('chat')}" href="#profile?section=chat"><span>▱</span>Чат${unreadCount ? `<b>${unreadCount}</b>` : ''}</a>
                </nav>
                <button class="profile-logout" type="button" data-logout>Выйти</button>
            </aside>
            <div class="profile-main">
                <header class="profile-top">
                    <div class="profile-hero-user">
                        <img src="${esc(me.avatar_url || fallbackImage())}" alt="${esc(me.name || 'Профиль')}">
                        <div>
                            <p class="eyebrow">Личный кабинет</p>
                            <h1>${esc(me.name || 'Клиент')}</h1>
                            <span>${esc(me.email || '')}${me.phone ? ` · ${esc(me.phone)}` : ''}</span>
                        </div>
                    </div>
                    <div class="profile-hero-actions">
                        <a class="btn ghost" href="#services">Выбрать услугу</a>
                        <button class="btn accent" type="button" data-open-booking>Записаться</button>
                    </div>
                </header>
                <section class="profile-stats">
                    ${profileStat('Записи', upcomingCount, 'активных')}
                    ${profileStat('Сертификаты', certificates.length, certificateTotal ? money(certificateTotal) : 'нет покупок')}
                    ${profileStat('Избранное', safeFavorites.length, 'услуг')}
                    ${profileStat('Сообщения', unreadCount, 'новых')}
                </section>
                <section class="profile-cards profile-section" id="profile-info"${profileSectionAttr('info')}>
                    <form class="profile-panel profile-user-card" id="profileForm">
                        <h2>Личные данные</h2>
                        <div class="profile-avatar">
                            <img src="${esc(me.avatar_url || fallbackImage())}" alt="${esc(me.name || 'Профиль')}">
                            <label class="btn ghost">Загрузить фото<input type="file" name="avatarFile" accept="image/*" hidden></label>
                        </div>
                        <div class="profile-fields">
                            <label>Имя<input name="name" value="${esc(me.name || '')}" required></label>
                            <label>Email<input type="email" name="email" value="${esc(me.email || '')}" required></label>
                            <label>Телефон<input name="phone" value="${esc(me.phone || '')}"></label>
                        </div>
                        <button class="btn accent" type="submit">Сохранить изменения</button>
                    </form>
                    <form class="profile-panel" id="passwordForm">
                        <h2>Смена пароля</h2>
                        <label>Текущий пароль<input type="password" name="currentPassword" required></label>
                        <label>Новый пароль<input type="password" name="newPassword" minlength="6" required></label>
                        <label>Повторите новый пароль<input type="password" name="repeatPassword" minlength="6" required></label>
                        <button class="btn ghost" type="submit">Поменять пароль</button>
                    </form>
                </section>
                <section class="profile-panel profile-section" id="profile-bookings"${profileSectionAttr('bookings')}>
                    <div class="profile-panel-head">
                        <div>
                            <h2>Мои записи</h2>
                            <p class="muted">Все будущие и прошлые съемки в одном месте.</p>
                        </div>
                        <button class="btn accent" type="button" data-open-booking>Новая запись</button>
                    </div>
                    ${bookings.length ? bookingTable(bookings, true) : profileEmpty('Записей пока нет', 'Выберите услугу и забронируйте удобное время.', '#services', 'Выбрать услугу')}
                </section>
                <section class="profile-panel profile-section" id="profile-certificates"${profileSectionAttr('certificates')}>
                    <div class="profile-panel-head">
                        <div>
                            <h2>Мои сертификаты</h2>
                            <p class="muted">Здесь отображаются сертификаты, оформленные на ваш аккаунт или email.</p>
                        </div>
                        <a class="btn ghost" href="#certificate">Купить сертификат</a>
                    </div>
                    ${certificates.length ? certificateProfileList(certificates) : profileEmpty('Сертификатов пока нет', 'Оформите подарочный сертификат для себя или близких.', '#certificate', 'Выбрать сертификат')}
                </section>
                <section class="profile-panel profile-section" id="profile-reviews"${profileSectionAttr('reviews')}>
                    <div class="profile-panel-head">
                        <div>
                            <h2>Мои отзывы</h2>
                            <p class="muted">Ваши опубликованные отзывы об услугах.</p>
                        </div>
                    </div>
                    ${safeReviews.length ? `<div class="review-grid">${safeReviews.map((review) => reviewCard({ ...review, user_name: me.name, avatar_url: me.avatar_url })).join('')}</div>` : '<p class="muted">Вы пока не оставляли отзывы.</p>'}
                </section>
                <section class="profile-panel profile-section" id="profile-favorites"${profileSectionAttr('favorites')}>
                    <div class="profile-panel-head">
                        <div>
                            <h2>Избранные услуги</h2>
                            <p class="muted">То, что вы сохранили для будущей записи.</p>
                        </div>
                        <a class="btn ghost" href="#services">Все услуги</a>
                    </div>
                    ${safeFavorites.length ? `<div class="grid">${safeFavorites.map(serviceCard).join('')}</div>` : profileEmpty('В избранном пусто', 'Добавьте понравившиеся услуги со страницы услуг.', '#services', 'Перейти к услугам')}
                </section>
                <section class="profile-panel profile-chat profile-section" id="profile-chat"${profileSectionAttr('chat')}>
                    ${profileChatBody}
                </section>
            </div>
        </section>
    `;
    scrollChatToBottom();
}

function profileStat(title, value, text) {
    return `
        <article>
            <span>${esc(title)}</span>
            <strong>${esc(String(value))}</strong>
            <small>${esc(text)}</small>
        </article>
    `;
}

function profileEmpty(title, text, href, action) {
    return `
        <div class="profile-empty">
            <strong>${esc(title)}</strong>
            <p>${esc(text)}</p>
            <a class="btn ghost" href="${esc(href)}">${esc(action)}</a>
        </div>
    `;
}

async function renderFavoritesPage() {
    if (!state.user) {
        openAuth('login');
        location.hash = 'home';
        return;
    }

    app.innerHTML = '<section class="page"><p class="lead">Загружаю избранные услуги...</p></section>';
    const favorites = asArray(await api('/api/me/favorites').catch((error) => {
        showToast(error.message);
        return [];
    }));
    state.favoriteServices = favorites;
    app.innerHTML = `
        <section class="page">
            <div class="section-head between">
                <div>
                    <h1 class="page-title">Мои избранные услуги</h1>
                    <p class="lead">Здесь хранятся услуги, которые вы отметили для будущей записи.</p>
                </div>
                <a class="btn accent" href="#booking">Записаться онлайн</a>
            </div>
            ${favorites.length ? `<div class="grid">${favorites.map(serviceCard).join('')}</div>` : '<p class="muted">Пока нет избранных услуг.</p>'}
        </section>
        ${renderFooter()}
    `;
}

function certificateProfileList(certificates) {
    return `
        <div class="certificate-profile-list">
            ${certificates.map((certificate) => `
                <article>
                    <strong>${money(certificate.amount)}</strong>
                    <span>${esc(certificate.recipient_name || 'Для получателя')}</span>
                    <small>${statusLabel(certificate.status)} · ${new Date(certificate.created_at).toLocaleDateString('ru-RU')}</small>
                </article>
            `).join('')}
        </div>
    `;
}

async function renderAdminPage(activeSection = 'overview') {
    if (state.user?.role !== 'admin') {
        showToast('Админка доступна только администратору');
        location.hash = 'home';
        return;
    }

    app.innerHTML = '<section class="page"><p class="lead">Загружаю админку...</p></section>';
    const context = await loadAdminContext(activeSection);
    const titles = {
        overview: 'Главная',
        bookings: 'Записи',
        services: 'Редактирование услуг',
        addons: 'Редактирование доп. услуг',
        portfolio: 'Редактирование портфолио',
        certificates: 'Сертификаты',
        chat: 'Чат с клиентами',
        schedule: 'График работы',
        settings: 'Настройки сайта'
    };

    app.innerHTML = `
        <section class="admin-shell">
            <aside class="admin-sidebar">
                <a class="admin-brand" href="#admin">
                    <span class="brand-icon" aria-hidden="true">▣</span>
                    <span><strong>PHOTO STUDIO</strong><small>Панель администратора</small></span>
                </a>
                <nav class="admin-menu" aria-label="Меню админки">
                    ${adminMenuItem('⌂', 'Главная', 'admin', activeSection === 'overview')}
                    ${adminMenuItem('□', 'Записи', 'admin-bookings', activeSection === 'bookings')}
                    ${adminMenuItem('▣', 'Услуги', 'admin-services', activeSection === 'services')}
                    ${adminMenuItem('✦', 'Доп. услуги', 'admin-addons', activeSection === 'addons')}
                    ${adminMenuItem('▤', 'Портфолио', 'admin-portfolio', activeSection === 'portfolio')}
                    ${adminMenuItem('□', 'Сертификаты', 'admin-certificates', activeSection === 'certificates')}
                    ${adminMenuItem('✉', 'Чат', 'admin-chat', activeSection === 'chat')}
                    ${adminMenuItem('◷', 'График', 'admin-schedule', activeSection === 'schedule')}
                    ${adminMenuItem('⚙', 'Настройки', 'admin-settings', activeSection === 'settings')}
                </nav>
            </aside>

            <div class="admin-content">
                <header class="admin-top">
                    <div>
                        <p class="eyebrow">Администрирование</p>
                        <h1>${esc(titles[activeSection] || titles.overview)}</h1>
                    </div>
                    <a class="btn ghost" href="#home">На сайт</a>
                </header>
                ${renderAdminSection(activeSection, context)}
            </div>
        </section>
    `;
    if (activeSection === 'chat') scrollChatToBottom();
}

async function loadAdminContext(section) {
    const context = {
        bookings: [],
        services: [],
        addons: [],
        certificates: [],
        schedule: [],
        portfolio: [],
        certificateProducts: [],
        certificateDesigns: [],
        certificateDeliveryOptions: [],
        serviceTimeSlots: [],
        chatClients: [],
        chatMessages: []
    };

    if (section === 'bookings') {
        context.bookings = await api('/api/admin/bookings');
        return context;
    }

    if (section === 'services') {
        context.services = await api('/api/admin/services');
        state.adminServices = asArray(context.services);
        return context;
    }

    if (section === 'addons') {
        context.addons = await api('/api/admin/addons');
        state.adminAddons = asArray(context.addons);
        return context;
    }

    if (section === 'portfolio') {
        context.portfolio = await api('/api/admin/portfolio');
        return context;
    }

    if (section === 'certificates') {
        const [certificates, certificateProducts, certificateDesigns, certificateDeliveryOptions] = await Promise.all([
            api('/api/admin/certificates'),
            api('/api/admin/certificate-products'),
            api('/api/admin/certificate-designs'),
            api('/api/admin/certificate-delivery-options')
        ]);
        return { ...context, certificates, certificateProducts, certificateDesigns, certificateDeliveryOptions };
    }

    if (section === 'schedule') {
        const [schedule, services, serviceTimeSlots] = await Promise.all([
            api('/api/working-hours'),
            api('/api/admin/services'),
            api('/api/admin/service-time-slots')
        ]);
        return { ...context, schedule, services, serviceTimeSlots };
    }

    if (section === 'chat') {
        const clients = await api('/api/admin/chat-clients');
        const selectedClientId = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('client')) || clients[0]?.id || null;
        const messages = selectedClientId ? await api(`/api/messages?recipientId=${selectedClientId}`) : [];
        return { ...context, chatClients: clients, chatMessages: messages, selectedClientId };
    }

    if (section === 'settings') {
        return context;
    }

    const [bookings, services, addons, certificates, portfolio] = await Promise.all([
        api('/api/admin/bookings'),
        api('/api/admin/services'),
        api('/api/admin/addons'),
        api('/api/admin/certificates'),
        api('/api/admin/portfolio')
    ]);
    return { ...context, bookings, services, addons, certificates, portfolio };
}

function bookingTable(bookings, canCancel) {
    return `
        <div class="table-wrap">
            <table class="table">
                <thead><tr><th>Дата</th><th>Услуга</th><th>Клиент</th><th>Статус</th><th></th></tr></thead>
                <tbody>
                    ${bookings.map((booking) => `
                        <tr>
                            <td>${String(booking.booking_date).slice(0, 10)} ${String(booking.start_time).slice(0, 5)}<br><span class="muted">${booking.hours} ч.</span></td>
                            <td>${esc(booking.service_title || '')}${booking.package_title ? `<br><span class="muted">Пакет: ${esc(booking.package_title)} · ${money(booking.package_price)}</span>` : ''}</td>
                            <td>${esc(booking.user_name || state.user?.name || '')}<br><span class="muted">${esc(booking.user_email || '')}</span></td>
                            <td><span class="status">${esc(statusLabel(booking.status))}</span></td>
                            <td>${canCancel && booking.status !== 'cancelled' ? `<button class="btn ghost" data-cancel-booking="${booking.id}">Отменить</button>` : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function adminBookingTable(bookings) {
    return `
        <div class="table-wrap">
            <table class="admin-data-table" data-admin-table="bookings">
                <thead><tr><th>Дата</th><th>Услуга</th><th>Клиент</th><th>Статус</th><th>Действие</th></tr></thead>
                <tbody>
                    ${bookings.map((booking) => `
                        <tr data-admin-booking-row data-title="${esc(`${booking.service_title || ''} ${booking.user_name || ''} ${booking.user_email || ''}`).toLowerCase()}" data-status="${esc(booking.status || '')}" data-date="${String(booking.booking_date).slice(0, 10)}">
                            <td>${String(booking.booking_date).slice(0, 10)} ${String(booking.start_time).slice(0, 5)}<br><span class="muted">${booking.hours} ч.</span></td>
                            <td>${esc(booking.service_title || '')}${booking.package_title ? `<br><span class="muted">Пакет: ${esc(booking.package_title)} · ${money(booking.package_price)}</span>` : ''}</td>
                            <td>${esc(booking.user_name || '')}<br><span class="muted">${esc(booking.user_email || '')}</span></td>
                            <td><span class="admin-pill ${booking.status === 'cancelled' ? 'inactive' : 'active'}">${esc(statusLabel(booking.status))}</span></td>
                            <td>
                                <form class="inline-actions" data-admin-edit="booking" data-id="${booking.id}">
                                    <select name="status">
                                        ${statusOptions('booking', booking.status)}
                                    </select>
                                    <button class="btn ghost" type="submit">Сохранить</button>
                                </form>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderAdminChat(clients = [], messages = [], selectedClientId = null, target = 'admin-chat') {
    const selectedClient = clients.find((client) => Number(client.id) === Number(selectedClientId));
    const clientHref = (clientId) => `#${target}${target.includes('?') ? '&' : '?'}client=${clientId}`;
    return `
        <section class="admin-chat-shell panel">
            <aside class="admin-chat-clients">
                <div class="admin-chat-clients-head">
                    <h2>Клиенты</h2>
                    <span>${clients.length}</span>
                </div>
                <label class="admin-search admin-chat-search">
                    <span>⌕</span>
                    <input type="search" placeholder="Поиск по имени, email или телефону..." data-admin-chat-search>
                </label>
                ${clients.length ? clients.map((client) => `
                    <a class="${Number(client.id) === Number(selectedClientId) ? 'active' : ''}" href="${clientHref(client.id)}" data-admin-chat-client data-search="${esc(`${client.name || ''} ${client.email || ''} ${client.phone || ''} ${client.last_message || ''}`).toLowerCase()}">
                        <img src="${esc(client.avatar_url || fallbackImage())}" alt="${esc(client.name || 'Клиент')}">
                        <span>
                            <strong>${esc(client.name || client.email || 'Клиент')}${Number(client.unread_count || 0) ? `<b>${client.unread_count}</b>` : ''}</strong>
                            <small>${client.last_message ? `${esc(client.last_sender_name || 'Клиент')}: ${esc(client.last_message)}` : 'Нет сообщений'}</small>
                        </span>
                    </a>
                `).join('') : '<p class="muted">Клиенты появятся здесь после первого сообщения.</p>'}
            </aside>
            <div class="admin-chat-thread">
                ${selectedClient ? `
                    <div class="admin-chat-head">
                        <img src="${esc(selectedClient.avatar_url || fallbackImage())}" alt="${esc(selectedClient.name || 'Клиент')}">
                        <div>
                            <h2>${esc(selectedClient.name || 'Клиент')}</h2>
                            <p class="muted">${esc(selectedClient.email || '')}${selectedClient.phone ? ` · ${esc(selectedClient.phone)}` : ''}</p>
                        </div>
                    </div>
                    <div class="chat-messages admin-chat-messages">
                        ${messages.length ? messages.map((item) => `
                            <article class="${Number(item.sender_id) === Number(state.user?.id) ? 'mine' : ''}">
                                <strong>${esc(item.sender_name || (Number(item.sender_id) === Number(state.user?.id) ? state.user?.name : selectedClient.name) || 'Сообщение')}</strong>
                                <p>${esc(item.message)}</p>
                                <small>${new Date(item.created_at).toLocaleString('ru-RU')}</small>
                            </article>
                        `).join('') : '<p class="muted">С этим клиентом пока нет сообщений.</p>'}
                    </div>
                    <form class="chat-form" id="adminChatForm">
                        <input type="hidden" name="recipientId" value="${selectedClient.id}">
                        <textarea name="message" rows="3" placeholder="Напишите сообщение этому клиенту" required></textarea>
                        <button class="btn accent" type="submit">Отправить</button>
                    </form>
                ` : '<p class="muted">Выберите клиента слева.</p>'}
            </div>
        </section>
    `;
}

function adminEditorSection(icon, title, content) {
    return `
        <section class="admin-editor-section">
            <div class="admin-editor-section-title">
                <span>${esc(icon)}</span>
                <strong>${esc(title)}</strong>
            </div>
            ${content}
        </section>
    `;
}

function adminPhotoPanel(item = {}, multiple = false) {
    return `
        <aside class="admin-photo-panel">
            <section class="admin-editor-section">
                <div class="admin-editor-section-title">
                    <span>□</span>
                    <strong>Фотографии ${multiple ? 'услуги' : 'записи'}</strong>
                </div>
                <label class="admin-upload-zone" data-upload-zone>
                    <input type="file" name="${multiple ? 'imageFiles' : 'imageFile'}" accept="image/*" ${multiple ? 'multiple' : ''}>
                    <span>⌁</span>
                    <strong>Перетащите изображения сюда<br>или выберите файл</strong>
                    <small>JPG, PNG, WEBP. ${multiple ? 'Можно выбрать несколько файлов.' : 'Одно основное изображение.'}</small>
                </label>
                <div class="admin-selected-files" data-file-list hidden></div>
                ${item.image_url ? `
                    <img class="admin-photo-preview" src="${esc(item.image_url)}" alt="${esc(item.title || 'Фото')}">
                    <input type="hidden" name="imageUrl" value="${esc(item.image_url || '')}">
                ` : ''}
                ${multiple ? '<p class="muted">Первое выбранное фото станет главным фото услуги. Все выбранные фото добавятся в портфолио этой категории.</p>' : ''}
            </section>
            ${item.id ? `
                <section class="admin-meta-card">
                    <p><span>ID</span><strong>#${item.id}</strong></p>
                    <p><span>Статус</span><strong>${activeBool(item.is_active) ? 'Активная' : 'Неактивная'}</strong></p>
                </section>
            ` : ''}
        </aside>
    `;
}

function adminServiceEditor(service = {}, mode = 'edit', inModal = false) {
    const isNew = mode === 'create';
    const active = activeBool(service.is_active);
    return `
        <form class="admin-editor-form" ${isNew ? 'id="adminServiceForm"' : `data-admin-edit="service" data-id="${service.id}"`} ${isNew && !inModal ? 'hidden' : ''}>
            <div class="admin-editor-main">
                ${adminEditorSection('□', 'Основная информация', `
                    <div class="admin-editor-grid">
                        <label>Название услуги <b>*</b><input name="title" value="${esc(service.title || '')}" placeholder="Индивидуальная фотосессия" required></label>
                        <label>Категория <b>*</b>${categorySelect('category', service.category || '')}</label>
                        <label>Статус <b>*</b><select name="isActive">
                            <option value="true" ${active ? 'selected' : ''}>Активная</option>
                            <option value="false" ${!active ? 'selected' : ''}>Неактивная</option>
                        </select></label>
                        <label>Цена <b>*</b><input type="number" name="price" value="${esc(service.price || '')}" placeholder="3000" required></label>
                        <label class="wide">Описание<textarea name="description" rows="4" maxlength="1000" placeholder="Коротко опишите услугу">${esc(service.description || '')}</textarea></label>
                    </div>
                `)}
                ${adminEditorSection('◷', 'Параметры съемки', `
                    <div class="admin-editor-grid three">
                        <label>Длительность <b>*</b><input name="serviceDurationText" value="${esc(service.service_duration_text || '')}" placeholder="1 ч."></label>
                        <label>Количество фото<input name="photoCountText" value="${esc(service.photo_count_text || '')}" placeholder="От 50"></label>
                        <label>Готовность фото <b>*</b><input name="photoDeliveryText" value="${esc(service.photo_delivery_text || '')}" placeholder="1-3 дня"></label>
                        <input type="hidden" name="durationHours" value="${esc(service.duration_hours || 1)}">
                    </div>
                `)}
                ${adminEditorSection('⌖', 'Локация и рекомендации', `
                    <div class="admin-editor-grid">
                        <label>Студия / Локация <b>*</b><input name="serviceLocation" value="${esc(service.service_location || '')}" placeholder="Студия Light"></label>
                        <label class="wide">Рекомендации клиенту<textarea name="serviceRecommendations" rows="3" maxlength="500" placeholder="Рекомендуем взять 2-3 образа...">${esc(service.service_recommendations || '')}</textarea></label>
                    </div>
                `)}
            </div>
            ${adminPhotoPanel(service, true)}
            <div class="admin-editor-actions">
                ${!isNew ? `<button class="btn ghost" type="button" data-admin-toggle-service="${service.id}" data-active="${active ? 'false' : 'true'}">${active ? 'Сделать неактивной' : 'Сделать активной'}</button>` : '<span></span>'}
                <span class="muted">Изменения сразу отображаются на сайте.</span>
                <button class="btn accent" type="submit">${isNew ? 'Добавить услугу' : 'Сохранить изменения'}</button>
            </div>
        </form>
    `;
}

function adminAddonEditor(addon = {}, mode = 'edit', inModal = false) {
    const isNew = mode === 'create';
    return `
        <form class="admin-editor-form addon-editor-form" ${isNew ? 'id="adminAddonForm"' : `data-admin-edit="addon" data-id="${addon.id}"`} ${isNew && !inModal ? 'hidden' : ''}>
            <div class="admin-editor-main">
                ${adminEditorSection('□', 'Основная информация', `
                    <div class="admin-editor-grid">
                        <label>Название <b>*</b><input name="title" value="${esc(addon.title || '')}" placeholder="Срочная обработка" required></label>
                        <label>Цена <b>*</b><input type="number" name="price" value="${esc(addon.price || '')}" placeholder="2500" required></label>
                        <label class="wide">Описание<textarea name="description" rows="4" maxlength="1000" placeholder="Опишите дополнительную услугу">${esc(addon.description || '')}</textarea></label>
                    </div>
                `)}
            </div>
            ${adminPhotoPanel(addon, false)}
            <div class="admin-editor-actions">
                ${!isNew ? `<button class="btn ghost" type="button" data-admin-delete="addon" data-id="${addon.id}">Скрыть</button>` : '<span></span>'}
                <span class="muted">Дополнительная услуга появится в разделе и в форме записи.</span>
                <button class="btn accent" type="submit">${isNew ? 'Добавить доп. услугу' : 'Сохранить изменения'}</button>
            </div>
        </form>
    `;
}

function renderAdminSection(section, { bookings = [], services = [], addons = [], certificates = [], schedule = [], portfolio = [], certificateProducts = [], certificateDesigns = [], certificateDeliveryOptions = [], serviceTimeSlots = [], chatClients = [], chatMessages = [], selectedClientId = null }) {
    if (section === 'chat') {
        return renderAdminChat(chatClients, chatMessages, selectedClientId);
    }

    if (section === 'bookings') {
        return `
            <section class="admin-table-panel panel">
                <div class="admin-toolbar bookings-toolbar">
                    <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по клиенту или услуге..." data-admin-search="bookings"></label>
                    <select data-admin-filter-status="bookings">
                        <option value="">Все статусы</option>
                        ${statusOptions('booking', '')}
                    </select>
                    <input type="date" data-admin-filter-date="bookings">
                    <button class="btn ghost" type="button" data-admin-export="bookings">⇩ Экспорт</button>
                </div>
                ${adminBookingTable(bookings)}
            </section>
        `;
    }

    if (section === 'services') {
        return `
            <section class="admin-table-panel panel">
                <div class="admin-toolbar">
                    <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по названию услуги..." data-admin-search="services"></label>
                    ${categoryFilter('services')}
                    <select data-admin-filter-status="services">
                        <option value="">Все статусы</option>
                        <option value="active">Активная</option>
                        <option value="inactive">Неактивная</option>
                    </select>
                    <button class="btn ghost" type="button" data-admin-export="services">⇩ Экспорт</button>
                    <button class="btn accent" type="button" data-open-admin-create="service">+ Добавить услугу</button>
                </div>

                ${adminServiceEditor({}, 'create')}
                <div class="admin-table-wrap">
                    <table class="admin-data-table" data-admin-table="services">
                        <thead>
                            <tr>
                                
                                <th>Услуга</th>
                                <th>Категория</th>
                                <th>Студия</th>
                                <th>Цена</th>
                                <th>Длительность</th>
                                <th>Статус</th>
                                <th>Продано</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${services.map(adminServiceRow).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    if (section === 'addons') {
        return `
            <section class="admin-table-panel panel">
                <div class="admin-toolbar">
                    <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по названию доп. услуги..." data-admin-search="addons"></label>
                    ${categoryFilter('addons')}
                    <select data-admin-filter-status="addons">
                        <option value="">Все статусы</option>
                        <option value="active">Активная</option>
                        <option value="inactive">Неактивная</option>
                    </select>
                    <button class="btn ghost" type="button" data-admin-export="addons">⇩ Экспорт</button>
                    <button class="btn accent" type="button" data-open-admin-create="addon">+ Добавить доп. услугу</button>
                </div>
                ${adminAddonEditor({}, 'create')}
                <div class="admin-table-wrap">
                    <table class="admin-data-table" data-admin-table="addons">
                        <thead>
                            <tr>
                                
                                <th>Доп. услуга</th>
                                <th>Категория</th>
                                <th>Цена</th>
                                <th>Статус</th>
                                <th>Продано</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>${addons.map(adminAddonRow).join('')}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    if (section === 'portfolio') {
        return `
            <section class="admin-table-panel panel">
                <div class="admin-toolbar portfolio-toolbar">
                    <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по названию работы..." data-admin-search="portfolio"></label>
                    ${categoryFilter('portfolio')}
                    <button class="btn ghost" type="button" data-admin-export="portfolio">⇩ Экспорт</button>
                    <button class="btn accent" type="button" data-open-admin-create="portfolio">+ Добавить работу</button>
                </div>
                <form class="admin-create-row" id="adminPortfolioForm" hidden>
                    <input name="title" placeholder="Название" required>
                    ${categorySelect('category', '')}
                    <input type="number" name="sortOrder" value="0" placeholder="Порядок">
                    <input type="file" name="imageFile" accept="image/*" required>
                    <button class="btn accent" type="submit">Сохранить</button>
                </form>
                <div class="admin-table-wrap">
                    <table class="admin-data-table" data-admin-table="portfolio">
                        <thead>
                            <tr>
                                
                                <th>Работа</th>
                                <th>Категория</th>
                                <th>Порядок</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>${portfolio.map(adminPortfolioRow).join('')}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    if (section === 'certificates') {
        const purchased = certificates.filter((item) => ['paid', 'done'].includes(item.status));
        return `
            <section class="admin-stats certificates-stats">
                ${adminStat('Всего заявок', certificates.length)}
                ${adminStat('Новые', certificates.filter((item) => item.status === 'new').length)}
                ${adminStat('Оплачены', purchased.length)}
                ${adminStat('Сумма оплат', purchased.reduce((sum, item) => sum + Number(item.amount || 0), 0))}
            </section>

            <div class="admin-certificate-layout">
                ${adminCertificateCatalog(certificateProducts, certificateDesigns, certificateDeliveryOptions)}
            </div>

            <section class="admin-table-panel panel">
                <div class="admin-toolbar certificates-toolbar">
                    <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по имени или email..." data-admin-search="certificates"></label>
                    <select data-admin-filter-status="certificates">
                        <option value="">Все статусы</option>
                        ${statusOptions('certificate', '')}
                    </select>
                    <button class="btn ghost" type="button" data-admin-export="certificates">⇩ Экспорт</button>
                    <button class="btn accent" type="button" data-open-admin-create="certificate">+ \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442</button>
                </div>
                <form class="admin-create-row certificate-create-row" id="adminCertificateForm" hidden>
                    <input name="buyerName" placeholder="\u0418\u043c\u044f \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f" required>
                    <input type="email" name="buyerEmail" placeholder="Email \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f" required>
                    <input type="number" name="amount" placeholder="\u0421\u0443\u043c\u043c\u0430" min="1" required>
                    <input name="recipientName" placeholder="\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044c">
                    <select name="status">${statusOptions('certificate', 'new')}</select>
                    <textarea name="message" rows="2" placeholder="\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439 \u0438\u043b\u0438 \u0442\u0435\u043a\u0441\u0442 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u0430"></textarea>
                    <button class="btn accent" type="submit">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442</button>
                </form>
                <div class="admin-table-wrap">
                    <table class="admin-data-table" data-admin-table="certificates">
                        <thead>
                            <tr>
                                
                                <th>Покупатель</th>
                                <th>Получатель</th>
                                <th>Сумма</th>
                                <th>Дата</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${certificates.length ? certificates.map(adminCertificateRow).join('') : '<tr><td colspan="6" class="muted">Заявок пока нет.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="admin-table-panel panel admin-section">
                <div class="admin-section-title">
                    <h2>Купленные сертификаты</h2>
                    <span>${purchased.length} шт.</span>
                </div>
                <div class="admin-table-wrap">
                    <table class="admin-data-table" data-admin-table="purchased-certificates">
                        <thead>
                            <tr>
                                <th>Сертификат</th>
                                <th>Покупатель</th>
                                <th>Получатель</th>
                                <th>Сумма</th>
                                <th>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${purchased.length ? purchased.map(adminPurchasedCertificateRow).join('') : '<tr><td colspan="5" class="muted">Купленных сертификатов пока нет.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    if (section === 'schedule') {
        const dayOrder = [1, 2, 3, 4, 5, 6, 0];
        const scheduleByDay = new Map(schedule.map((day) => [Number(day.day_of_week), day]));
        return `
            <section class="admin-section panel admin-schedule-panel">
                <div class="admin-section-title">
                    <div>
                        <h2>График работы</h2>
                        <p class="muted">Настройте рабочие дни и базовые часы записи.</p>
                    </div>
                    <span>${schedule.filter((day) => day.is_working).length} рабочих дней</span>
                </div>
                <div class="admin-schedule-grid">
                    ${dayOrder.map((dayNumber) => {
                        const day = scheduleByDay.get(dayNumber) || { day_of_week: dayNumber, is_working: false, start_time: '10:00', end_time: '18:00' };
                        return `
                        <form class="admin-schedule-card ${day.is_working ? 'working' : 'closed'}" data-admin-edit="schedule" data-id="${day.day_of_week}">
                            <div class="admin-schedule-card-head">
                                <strong>${dayName(day.day_of_week)}</strong>
                                <span class="admin-pill ${day.is_working ? 'active' : 'inactive'}">${day.is_working ? 'Открыто' : 'Выходной'}</span>
                            </div>
                            <div class="admin-schedule-fields">
                                <label>День<select name="isWorking">
                                    <option value="true" ${day.is_working ? 'selected' : ''}>Да</option>
                                    <option value="false" ${!day.is_working ? 'selected' : ''}>Нет</option>
                                </select></label>
                                <label>Начало<input type="time" name="startTime" value="${String(day.start_time).slice(0, 5)}"></label>
                                <label>Конец<input type="time" name="endTime" value="${String(day.end_time).slice(0, 5)}"></label>
                            </div>
                            <button class="btn ghost" type="submit">Сохранить</button>
                        </form>
                    `; }).join('')}
                </div>
            </section>
            <section class="admin-section panel admin-slot-panel">
                <div class="admin-section-title">
                    <div>
                        <h2>Окна времени по услугам</h2>
                        <p class="muted">Если у услуги отдельное расписание, оно будет важнее общего графика.</p>
                    </div>
                    <span>${serviceTimeSlots.length} окон</span>
                </div>
                <form class="admin-slot-form" id="adminServiceSlotForm">
                    <div class="admin-slot-fields">
                        <label>Услуга<select name="serviceId" required>
                            <option value="">Выберите услугу</option>
                            ${services.map((service) => `<option value="${service.id}">${esc(service.title)}</option>`).join('')}
                        </select></label>
                        <label>День<select name="dayOfWeek" required>
                            ${[1, 2, 3, 4, 5, 6, 0].map((day) => `<option value="${day}">${dayName(day)}</option>`).join('')}
                        </select></label>
                        <label>С<input type="time" name="startTime" value="10:00" required></label>
                        <label>До<input type="time" name="endTime" value="18:00" required></label>
                    </div>
                    <button class="btn accent" type="submit">Добавить окно</button>
                </form>
                <div class="admin-slot-list">
                    ${serviceTimeSlots.length ? serviceTimeSlots.map((slot) => `
                        <article class="admin-slot-card">
                            <div>
                                <strong>${esc(slot.service_title)}</strong>
                                <span>${dayName(slot.day_of_week)} · ${String(slot.start_time).slice(0, 5)} - ${String(slot.end_time).slice(0, 5)}</span>
                            </div>
                            <button class="icon-mini" type="button" data-admin-delete="serviceSlot" data-id="${slot.id}" title="Удалить">×</button>
                        </article>
                    `).join('') : '<div class="profile-empty"><strong>Отдельных окон пока нет</strong><p>Для услуг будет использоваться общий график выше.</p></div>'}
                </div>
            </section>
        `;
    }

    if (section === 'settings') {
        return `
            <form class="form panel admin-section" id="adminSettingsForm">
                <h2>Настройки сайта</h2>
                <div class="admin-form-grid">
                    <label>Название студии<input name="studio_name" value="${esc(state.settings.studio_name || '')}"></label>
                    <label>Короткий слоган<input name="short_tagline" value="${esc(state.settings.short_tagline || '')}"></label>
                    <label>Заголовок первого экрана<input name="hero_title" value="${esc(state.settings.hero_title || '')}"></label>
                    <label>Фоновое фото главной<input type="file" name="heroImageFile" accept="image/*"></label>
                    <input type="hidden" name="hero_image_url" value="${esc(state.settings.hero_image_url || '')}">
                    <label>Текст первого экрана<textarea name="hero_text" rows="3">${esc(state.settings.hero_text || '')}</textarea></label>
                    <label>Рассказ "Обо мне"<textarea name="about_text" rows="3">${esc(state.settings.about_text || '')}</textarea></label>
                    <label>Заголовок "Обо мне"<input name="about_title" value="${esc(state.settings.about_title || '')}"></label>
                    <label>Фото Дарьи<input type="file" name="aboutImageFile" accept="image/*"></label>
                    <input type="hidden" name="about_hero_image_url" value="${esc(state.settings.about_hero_image_url || '')}">
                    <label>Фотосессий проведено<input name="about_stat_1_value" value="${esc(state.settings.about_stat_1_value || '')}"></label>
                    <label>Лет в фотографии<input name="about_stat_2_value" value="${esc(state.settings.about_stat_2_value || '')}"></label>
                    <label>Довольных клиентов<input name="about_stat_3_value" value="${esc(state.settings.about_stat_3_value || '')}"></label>
                    <label>Город съемки<input name="about_stat_4_value" value="${esc(state.settings.about_stat_4_value || '')}"></label>
                    <label>Телефон<input name="contact_phone" value="${esc(state.settings.contact_phone || '')}"></label>
                    <label>Email<input name="contact_email" value="${esc(state.settings.contact_email || '')}"></label>
                </div>
                <button class="btn accent" type="submit">Сохранить настройки</button>
            </form>
        `;
    }

    return `
        <section class="admin-stats">
            ${adminStat('Записи', bookings.length)}
            ${adminStat('Услуги', services.filter((item) => item.is_active).length)}
            ${adminStat('Доп. услуги', addons.filter((item) => item.is_active).length)}
            ${adminStat('Сертификаты', certificates.length)}
        </section>
        <section class="admin-grid-2">
            <div class="panel">
                <h2>Последние записи</h2>
                ${bookingTable(bookings.slice(0, 5), false)}
            </div>
            <div class="panel admin-list">
                <h2>Быстрый обзор</h2>
                <p><strong>Активных услуг:</strong><br><span class="muted">${services.filter((item) => item.is_active).length}</span></p>
                <p><strong>Работ в портфолио:</strong><br><span class="muted">${portfolio.length}</span></p>
                <p><strong>Заявок на сертификаты:</strong><br><span class="muted">${certificates.length}</span></p>
            </div>
        </section>
    `;
}

function adminServiceForm(service) {
    return adminServiceEditor(service, 'edit');
}

function adminServiceRow(service) {
    const active = Boolean(service.is_active);
    return `
        <tr data-admin-service-row data-title="${esc(service.title || '').toLowerCase()}" data-category="${esc(service.category || '')}" data-status="${active ? 'active' : 'inactive'}">
            
            <td>
                <div class="admin-service-cell">
                    <img src="${esc(service.image_url || fallbackImage())}" alt="${esc(service.title)}">
                    <div>
                        <strong>${esc(service.title)}</strong>
                        <span>ID: ${service.id}</span>
                    </div>
                </div>
            </td>
            <td>${esc(service.category || 'Без категории')}</td>
            <td>Студия Light</td>
            <td>${money(service.price)}</td>
            <td>${esc(service.duration_hours || 1)} ч.</td>
            <td><span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активная' : 'Неактивная'}</span></td>
            <td>${Number(service.sold_count || service.id * 11 || 0)}</td>
            <td>
                <div class="admin-row-actions">
                    <a class="icon-mini" href="#service-${service.id}" title="Посмотреть">◉</a>
                    <button class="icon-mini" type="button" data-admin-row-edit="service" data-id="${service.id}" title="Редактировать">✎</button>
                    <button class="icon-mini" type="button" data-admin-toggle-service="${service.id}" data-active="${active ? 'false' : 'true'}" title="${active ? 'Сделать неактивной' : 'Сделать активной'}">⋮</button>
                </div>
            </td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="service-${service.id}" hidden>
            <td colspan="8">${adminServiceForm(service)}</td>
        </tr>
    `;
}

function adminAddonForm(addon) {
    return adminAddonEditor(addon, 'edit');
}

function adminAddonRow(addon) {
    const active = addon.is_active !== false;
    return `
        <tr data-admin-addon-row data-title="${esc(addon.title || '').toLowerCase()}" data-category="Доп. услуги" data-status="${active ? 'active' : 'inactive'}">
            
            <td>
                <div class="admin-service-cell">
                    <img src="${esc(addon.image_url || fallbackImage())}" alt="${esc(addon.title)}">
                    <div>
                        <strong>${esc(addon.title)}</strong>
                        <span>ID: ${addon.id}</span>
                    </div>
                </div>
            </td>
            <td>Доп. услуги</td>
            <td>${money(addon.price)}</td>
            <td><span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активная' : 'Неактивная'}</span></td>
            <td>${Number(addon.sold_count || addon.id * 7 || 0)}</td>
            <td>
                <div class="admin-row-actions">
                    <button class="icon-mini" type="button" data-admin-row-edit="addon" data-id="${addon.id}" title="Редактировать">✎</button>
                    <button class="icon-mini" type="button" data-admin-delete="addon" data-id="${addon.id}" title="Скрыть">⋮</button>
                </div>
            </td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="addon-${addon.id}" hidden>
            <td colspan="6">${adminAddonForm(addon)}</td>
        </tr>
    `;
}

function adminPortfolioForm(item) {
    return `
        <form class="admin-edit-card" data-admin-edit="portfolio" data-id="${item.id}">
            <img src="${esc(item.image_url)}" alt="${esc(item.title)}">
            <div class="admin-edit-grid">
                <label>Название<input name="title" value="${esc(item.title || '')}" required></label>
                <label>Категория${categorySelect('category', item.category || '')}</label>
                <label>Порядок<input type="number" name="sortOrder" value="${esc(item.sort_order || 0)}"></label>
                <label>Новое фото<input type="file" name="imageFile" accept="image/*"></label>
                <input type="hidden" name="imageUrl" value="${esc(item.image_url || '')}">
            </div>
            <div class="inline-actions">
                <button class="btn accent" type="submit">Сохранить</button>
                <button class="btn ghost" type="button" data-admin-delete="portfolio" data-id="${item.id}">Удалить</button>
            </div>
        </form>
    `;
}

function adminPortfolioRow(item) {
    return `
        <tr data-admin-portfolio-row data-title="${esc(item.title || '').toLowerCase()}" data-category="${esc(item.category || '')}">
            
            <td>
                <div class="admin-service-cell">
                    <img src="${esc(item.image_url || fallbackImage())}" alt="${esc(item.title)}">
                    <div>
                        <strong>${esc(item.title)}</strong>
                        <span>ID: ${item.id}</span>
                    </div>
                </div>
            </td>
            <td>${esc(item.category || 'Без категории')}</td>
            <td>${Number(item.sort_order || 0)}</td>
            <td><span class="admin-pill active">Активная</span></td>
            <td>
                <div class="admin-row-actions">
                    <a class="icon-mini" href="#portfolio" title="Посмотреть">◉</a>
                    <button class="icon-mini" type="button" data-admin-row-edit="portfolio" data-id="${item.id}" title="Редактировать">✎</button>
                    <button class="icon-mini" type="button" data-admin-delete="portfolio" data-id="${item.id}" title="Удалить">⋮</button>
                </div>
            </td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="portfolio-${item.id}" hidden>
            <td colspan="6">${adminPortfolioForm(item)}</td>
        </tr>
    `;
}

function adminCertificateCatalog(products = [], designs = [], deliveryOptions = []) {
    return `
        <section class="admin-table-panel panel admin-catalog-panel">
            <div class="admin-section-title">
                <h2>Варианты сертификатов</h2>
                <span>${products.length} шт.</span>
            </div>
            <div class="admin-toolbar">
                <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по сертификатам..." data-admin-search="certificate-products"></label>
                <select data-admin-filter-status="certificate-products">
                    <option value="">Все статусы</option>
                    <option value="active">Активный</option>
                    <option value="inactive">Скрытый</option>
                </select>
                <button class="btn ghost" type="button" data-admin-export="certificate-products">⇩ Экспорт</button>
                <button class="btn accent" type="button" data-open-admin-create="certificateProduct">+ Добавить вариант</button>
            </div>
            <form class="admin-create-row" id="adminCertificateProductForm" hidden>
                <input name="title" placeholder="Название" required>
                <input type="number" name="amount" placeholder="Сумма" min="1" required>
                <select name="type"><option value="amount">На сумму</option><option value="service">На услугу</option></select>
                <input type="number" name="sortOrder" value="0" placeholder="Порядок">
                <textarea name="description" rows="2" placeholder="Описание"></textarea>
                    <input name="serviceDurationText" placeholder="Длительность, например 1-1,5 часа">
                    <input name="photoDeliveryText" placeholder="Готовность фото, например 7-10 дней">
                    <input name="photoCountText" placeholder="Количество фото, например от 50 штук">
                    <input name="serviceLocation" placeholder="Локация, например Студия / Улица">
                    <textarea name="serviceRecommendations" rows="2" placeholder="Рекомендации"></textarea>
                <button class="btn accent" type="submit">Сохранить</button>
            </form>
            <div class="admin-compact-cards" data-admin-table="certificate-products">
                ${products.length ? products.map(adminCertificateProductCard).join('') : '<p class="muted">Вариантов пока нет.</p>'}
            </div>
        </section>
        <section class="admin-table-panel panel admin-catalog-panel">
            <div class="admin-section-title"><h2>Дизайны сертификатов</h2><span>${designs.length} шт.</span></div>
            <div class="admin-toolbar">
                <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по дизайнам..." data-admin-search="certificate-designs"></label>
                <button class="btn ghost" type="button" data-admin-export="certificate-designs">⇩ Экспорт</button>
                <button class="btn accent" type="button" data-open-admin-create="certificateDesign">+ Добавить дизайн</button>
            </div>
            <form class="admin-create-row" id="adminCertificateDesignForm" hidden>
                <input name="title" placeholder="Название дизайна" required>
                <input name="code" placeholder="Код, например classic">
                <select name="theme"><option value="dark">Темный</option><option value="light">Светлый</option><option value="warm">Теплый</option></select>
                <input type="number" name="sortOrder" value="0" placeholder="Порядок">
                <input type="file" name="imageFile" accept="image/*">
                <button class="btn accent" type="submit">Сохранить</button>
            </form>
            <div class="admin-compact-cards" data-admin-table="certificate-designs">
                ${designs.length ? designs.map(adminCertificateDesignCard).join('') : '<p class="muted">Дизайнов пока нет.</p>'}
            </div>
        </section>
        <section class="admin-table-panel panel admin-catalog-panel">
            <div class="admin-section-title"><h2>Получение сертификата</h2><span>${deliveryOptions.length} шт.</span></div>
            <div class="admin-toolbar">
                <label class="admin-search"><span>⌕</span><input type="search" placeholder="Поиск по способам..." data-admin-search="certificate-delivery"></label>
                <button class="btn ghost" type="button" data-admin-export="certificate-delivery">⇩ Экспорт</button>
                <button class="btn accent" type="button" data-open-admin-create="certificateDelivery">+ Добавить способ</button>
            </div>
            <form class="admin-create-row" id="adminCertificateDeliveryForm" hidden>
                <input name="title" placeholder="Название" required>
                <input name="icon" placeholder="Иконка">
                <input type="number" name="sortOrder" value="0" placeholder="Порядок">
                <textarea name="description" rows="2" placeholder="Описание"></textarea>
                    <input name="serviceDurationText" placeholder="Длительность, например 1-1,5 часа">
                    <input name="photoDeliveryText" placeholder="Готовность фото, например 7-10 дней">
                    <input name="photoCountText" placeholder="Количество фото, например от 50 штук">
                    <input name="serviceLocation" placeholder="Локация, например Студия / Улица">
                    <textarea name="serviceRecommendations" rows="2" placeholder="Рекомендации"></textarea>
                <button class="btn accent" type="submit">Сохранить</button>
            </form>
            <div class="admin-compact-cards" data-admin-table="certificate-delivery">
                ${deliveryOptions.length ? deliveryOptions.map(adminCertificateDeliveryCard).join('') : '<p class="muted">Способов пока нет.</p>'}
            </div>
        </section>
    `;
}

function adminCertificateProductCard(product) {
    const active = product.is_active !== false;
    return `
        <article class="admin-compact-card" data-admin-certificate-products-row data-title="${esc(product.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            <div>
                <span class="admin-card-kicker">${product.type === 'service' ? 'На услугу' : 'На сумму'} · ${Number(product.sort_order || 0)}</span>
                <strong>${esc(product.title)}</strong>
                <p>${esc(product.description || 'Без описания')}</p>
            </div>
            <div class="admin-compact-meta">
                <b>${money(product.amount)}</b>
                <span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span>
            </div>
            <div class="admin-row-actions">
                <button class="icon-mini" type="button" data-admin-row-edit="certificateProduct" data-id="${product.id}" title="Редактировать">✎</button>
                <button class="icon-mini" type="button" data-admin-delete="certificateProduct" data-id="${product.id}" title="Скрыть">⋮</button>
            </div>
            <div class="admin-compact-editor" data-admin-editor="certificateProduct-${product.id}" hidden>${adminCertificateProductForm(product)}</div>
        </article>
    `;
}

function adminCertificateDesignCard(design) {
    const active = design.is_active !== false;
    return `
        <article class="admin-compact-card design" data-admin-certificate-designs-row data-title="${esc(design.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            <img src="${esc(design.image_url || fallbackImage())}" alt="${esc(design.title)}">
            <div>
                <span class="admin-card-kicker">${esc(design.code || 'без кода')} · ${esc(design.theme || 'dark')}</span>
                <strong>${esc(design.title)}</strong>
                <p>Порядок: ${Number(design.sort_order || 0)}</p>
            </div>
            <div class="admin-compact-meta">
                <span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span>
            </div>
            <div class="admin-row-actions">
                <button class="icon-mini" type="button" data-admin-row-edit="certificateDesign" data-id="${design.id}" title="Редактировать">✎</button>
                <button class="icon-mini" type="button" data-admin-delete="certificateDesign" data-id="${design.id}" title="Скрыть">⋮</button>
            </div>
            <div class="admin-compact-editor" data-admin-editor="certificateDesign-${design.id}" hidden>${adminCertificateDesignForm(design)}</div>
        </article>
    `;
}

function adminCertificateDeliveryCard(option) {
    const active = option.is_active !== false;
    return `
        <article class="admin-compact-card" data-admin-certificate-delivery-row data-title="${esc(option.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            <div class="admin-delivery-icon">${esc(option.icon || '□')}</div>
            <div>
                <span class="admin-card-kicker">Порядок: ${Number(option.sort_order || 0)}</span>
                <strong>${esc(option.title)}</strong>
                <p>${esc(option.description || 'Без описания')}</p>
            </div>
            <div class="admin-compact-meta">
                <span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span>
            </div>
            <div class="admin-row-actions">
                <button class="icon-mini" type="button" data-admin-row-edit="certificateDelivery" data-id="${option.id}" title="Редактировать">✎</button>
                <button class="icon-mini" type="button" data-admin-delete="certificateDelivery" data-id="${option.id}" title="Скрыть">⋮</button>
            </div>
            <div class="admin-compact-editor" data-admin-editor="certificateDelivery-${option.id}" hidden>${adminCertificateDeliveryForm(option)}</div>
        </article>
    `;
}

function adminCertificateProductRow(product) {
    const active = product.is_active !== false;
    return `
        <tr data-admin-certificate-products-row data-title="${esc(product.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            
            <td><strong>${esc(product.title)}</strong><br><span class="muted">${esc(product.description || '')}</span></td>
            <td>${product.type === 'service' ? 'На услугу' : 'На сумму'}</td>
            <td>${money(product.amount)}</td>
            <td>${Number(product.sort_order || 0)}</td>
            <td><span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span></td>
            <td><div class="admin-row-actions"><button class="icon-mini" type="button" data-admin-row-edit="certificateProduct" data-id="${product.id}" title="Редактировать">✎</button><button class="icon-mini" type="button" data-admin-delete="certificateProduct" data-id="${product.id}" title="Скрыть">⋮</button></div></td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="certificateProduct-${product.id}" hidden><td colspan="6">${adminCertificateProductForm(product)}</td></tr>
    `;
}

function adminCertificateProductForm(product) {
    return `
        <form class="admin-edit-card" data-admin-edit="certificateProduct" data-id="${product.id}">
            <div class="admin-edit-grid">
                <label>Название<input name="title" value="${esc(product.title || '')}" required></label>
                <label>Сумма<input type="number" name="amount" value="${esc(product.amount || 0)}" min="1" required></label>
                <label>Тип<select name="type"><option value="amount" ${product.type !== 'service' ? 'selected' : ''}>На сумму</option><option value="service" ${product.type === 'service' ? 'selected' : ''}>На услугу</option></select></label>
                <label>Порядок<input type="number" name="sortOrder" value="${esc(product.sort_order || 0)}"></label>
                <label>Статус<select name="isActive"><option value="true" ${activeSelected(product.is_active)}>Активный</option><option value="false" ${!activeBool(product.is_active) ? 'selected' : ''}>Скрытый</option></select></label>
                <label class="wide">Описание<textarea name="description" rows="2">${esc(product.description || '')}</textarea></label>
            </div>
            <button class="btn accent" type="submit">Сохранить</button>
        </form>
    `;
}

function adminCertificateDesignRow(design) {
    const active = design.is_active !== false;
    return `
        <tr data-admin-certificate-designs-row data-title="${esc(design.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            
            <td><div class="admin-service-cell"><img src="${esc(design.image_url || fallbackImage())}" alt="${esc(design.title)}"><div><strong>${esc(design.title)}</strong><span>ID: ${design.id}</span></div></div></td>
            <td>${esc(design.code || '')}</td>
            <td>${esc(design.theme || 'dark')}</td>
            <td>${Number(design.sort_order || 0)}</td>
            <td><span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span></td>
            <td><div class="admin-row-actions"><button class="icon-mini" type="button" data-admin-row-edit="certificateDesign" data-id="${design.id}" title="Редактировать">✎</button><button class="icon-mini" type="button" data-admin-delete="certificateDesign" data-id="${design.id}" title="Скрыть">⋮</button></div></td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="certificateDesign-${design.id}" hidden><td colspan="6">${adminCertificateDesignForm(design)}</td></tr>
    `;
}

function adminCertificateDesignForm(design) {
    return `
        <form class="admin-edit-card" data-admin-edit="certificateDesign" data-id="${design.id}">
            <img src="${esc(design.image_url || fallbackImage())}" alt="${esc(design.title)}">
            <div class="admin-edit-grid">
                <label>Название<input name="title" value="${esc(design.title || '')}" required></label>
                <label>Код<input name="code" value="${esc(design.code || '')}"></label>
                <label>Тема<select name="theme"><option value="dark" ${design.theme === 'dark' ? 'selected' : ''}>Темный</option><option value="light" ${design.theme === 'light' ? 'selected' : ''}>Светлый</option><option value="warm" ${design.theme === 'warm' ? 'selected' : ''}>Теплый</option></select></label>
                <label>Порядок<input type="number" name="sortOrder" value="${esc(design.sort_order || 0)}"></label>
                <label>Статус<select name="isActive"><option value="true" ${activeSelected(design.is_active)}>Активный</option><option value="false" ${!activeBool(design.is_active) ? 'selected' : ''}>Скрытый</option></select></label>
                <label>Новое фото<input type="file" name="imageFile" accept="image/*"></label>
                <input type="hidden" name="imageUrl" value="${esc(design.image_url || '')}">
            </div>
            <button class="btn accent" type="submit">Сохранить</button>
        </form>
    `;
}

function adminCertificateDeliveryRow(option) {
    const active = option.is_active !== false;
    return `
        <tr data-admin-certificate-delivery-row data-title="${esc(option.title || '').toLowerCase()}" data-status="${active ? 'active' : 'inactive'}">
            
            <td><strong>${esc(option.title)}</strong><br><span class="muted">${esc(option.description || '')}</span></td>
            <td>${esc(option.icon || '')}</td>
            <td>${Number(option.sort_order || 0)}</td>
            <td><span class="admin-pill ${active ? 'active' : 'inactive'}">${active ? 'Активный' : 'Скрытый'}</span></td>
            <td><div class="admin-row-actions"><button class="icon-mini" type="button" data-admin-row-edit="certificateDelivery" data-id="${option.id}" title="Редактировать">✎</button><button class="icon-mini" type="button" data-admin-delete="certificateDelivery" data-id="${option.id}" title="Скрыть">⋮</button></div></td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="certificateDelivery-${option.id}" hidden><td colspan="6">${adminCertificateDeliveryForm(option)}</td></tr>
    `;
}

function adminCertificateDeliveryForm(option) {
    return `
        <form class="admin-edit-card" data-admin-edit="certificateDelivery" data-id="${option.id}">
            <div class="admin-edit-grid">
                <label>Название<input name="title" value="${esc(option.title || '')}" required></label>
                <label>Иконка<input name="icon" value="${esc(option.icon || '')}"></label>
                <label>Порядок<input type="number" name="sortOrder" value="${esc(option.sort_order || 0)}"></label>
                <label>Статус<select name="isActive"><option value="true" ${activeSelected(option.is_active)}>Активный</option><option value="false" ${!activeBool(option.is_active) ? 'selected' : ''}>Скрытый</option></select></label>
                <label class="wide">Описание<textarea name="description" rows="2">${esc(option.description || '')}</textarea></label>
            </div>
            <button class="btn accent" type="submit">Сохранить</button>
        </form>
    `;
}

function activeBool(value) {
    return value !== false && value !== 'false';
}

function activeSelected(value) {
    return activeBool(value) ? 'selected' : '';
}

function adminCertificateForm(item) {
    return `
        <form class="admin-edit-card certificate-edit-card" data-admin-edit="certificate" data-id="${item.id}">
            <div class="certificate-edit-summary">
                <span class="certificate-icon">&#9633;</span>
                <strong>\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442 #${item.id}</strong>
                <p class="muted">${String(item.created_at || '').slice(0, 10) || '-'}</p>
            </div>
            <div class="admin-edit-grid">
                <label>\u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c<input name="buyerName" value="${esc(item.buyer_name || '')}" required></label>
                <label>Email<input type="email" name="buyerEmail" value="${esc(item.buyer_email || '')}" required></label>
                <label>\u0421\u0443\u043c\u043c\u0430<input type="number" name="amount" value="${esc(item.amount || 0)}" min="1" required></label>
                <label>\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044c<input name="recipientName" value="${esc(item.recipient_name || '')}"></label>
                <label>\u0421\u0442\u0430\u0442\u0443\u0441<select name="status">
                    ${statusOptions('certificate', item.status)}
                </select></label>
                <label class="wide">\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435<textarea name="message" rows="2">${esc(item.message || '')}</textarea></label>
            </div>
            <button class="btn accent" type="submit">\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</button>
        </form>
    `;
}

function adminCertificateRow(item) {
    return `
        <tr data-admin-certificate-row data-title="${esc(`${item.buyer_name || ''} ${item.buyer_email || ''} ${item.recipient_name || ''}`).toLowerCase()}" data-status="${esc(item.status || 'new')}">
            
            <td>
                <div class="admin-service-cell certificate-mini">
                    <span class="certificate-icon">&#9633;</span>
                    <div>
                        <strong>${esc(item.buyer_name)}</strong>
                        <span>${esc(item.buyer_email)}</span>
                    </div>
                </div>
            </td>
            <td>${esc(item.recipient_name || '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d')}<br>${item.message ? `<span class="muted">${esc(item.message)}</span>` : ''}</td>
            <td>${money(item.amount)}</td>
            <td>${String(item.created_at || '').slice(0, 10) || '-'}</td>
            <td><span class="admin-pill ${['cancelled'].includes(item.status) ? 'inactive' : ['paid', 'done'].includes(item.status) ? 'active' : 'pending'}">${esc(statusLabel(item.status))}</span></td>
            <td>
                <div class="admin-row-actions">
                    <button class="icon-mini" type="button" data-admin-row-edit="certificate" data-id="${item.id}" title="\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c">&#9998;</button>
                </div>
            </td>
        </tr>
        <tr class="admin-inline-editor" data-admin-editor="certificate-${item.id}" hidden>
            <td colspan="6">${adminCertificateForm(item)}</td>
        </tr>
    `;
}
function adminPurchasedCertificate(item) {
    return `
        <article class="admin-edit-card certificate-bought">
            <div>
                <strong>Сертификат ${money(item.amount)}</strong>
                <p class="muted">Покупатель: ${esc(item.buyer_name)} · ${esc(item.buyer_email)}</p>
                ${item.recipient_name ? `<p class="muted">Получатель: ${esc(item.recipient_name)}</p>` : ''}
            </div>
            <span class="status">${esc(statusLabel(item.status))}</span>
        </article>
    `;
}

function adminPurchasedCertificateRow(item) {
    return `
        <tr>
            <td><strong>Сертификат #${item.id}</strong><br><span class="muted">${String(item.created_at || '').slice(0, 10) || '—'}</span></td>
            <td>${esc(item.buyer_name)}<br><span class="muted">${esc(item.buyer_email)}</span></td>
            <td>${esc(item.recipient_name || 'Не указан')}</td>
            <td>${money(item.amount)}</td>
            <td><span class="admin-pill active">${esc(statusLabel(item.status))}</span></td>
        </tr>
    `;
}
function allCategories() {
    return [...new Set([
        'Портрет',
        'Love Story',
        'Пара',
        'Семья',
        'Беременность',
        'Студийные',
        'Коммерческие',
        'Доп. услуги',
        ...state.services.map((item) => item.category),
        ...state.portfolio.map((item) => item.category)
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function categorySelect(name, selected = '') {
    const categories = allCategories();
    const known = categories.includes(selected);
    return `
        <span class="category-field">
            <select name="${esc(name)}">
                <option value="">Выберите категорию</option>
                ${categories.map((category) => `<option value="${esc(category)}" ${category === selected ? 'selected' : ''}>${esc(category)}</option>`).join('')}
            </select>
            <input name="${esc(name)}Custom" value="${known ? '' : esc(selected)}" placeholder="Новая категория">
        </span>
    `;
}

function categoryFilter(scope) {
    const categories = allCategories();
    return `
        <select data-admin-filter-category="${esc(scope)}">
            <option value="">Все категории</option>
            ${categories.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}
        </select>
    `;
}

function statusLabel(status = '') {
    return {
        pending: 'Ожидает',
        confirmed: 'Подтверждена',
        done: 'Завершено',
        cancelled: 'Отменено',
        new: 'Новая',
        processing: 'В обработке',
        paid: 'Оплачен'
    }[status] || status || 'Новая';
}

function statusOptions(type, selected = '') {
    const statuses = type === 'booking'
        ? ['pending', 'confirmed', 'done', 'cancelled']
        : ['new', 'processing', 'paid', 'done', 'cancelled'];

    return statuses.map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${statusLabel(status)}</option>`).join('');
}

function filterAdminTables() {
    filterAdminBookings();
    filterAdminRows('services', '[data-admin-service-row]');
    filterAdminRows('addons', '[data-admin-addon-row]');
    filterAdminRows('portfolio', '[data-admin-portfolio-row]');
    filterAdminRows('certificates', '[data-admin-certificate-row]');
    filterAdminRows('certificateProducts', '[data-admin-certificate-product-row]');
    filterAdminRows('certificate-products', '[data-admin-certificate-products-row]');
    filterAdminRows('certificate-designs', '[data-admin-certificate-designs-row]');
    filterAdminRows('certificate-delivery', '[data-admin-certificate-delivery-row]');
}

function filterPublicCards() {
    const toolbar = document.querySelector('[data-public-toolbar]');
    if (!toolbar) return;
    const search = (toolbar.querySelector('[data-public-search]')?.value || '').trim().toLowerCase();
    const category = toolbar.querySelector('[data-public-category]')?.value || '';

    document.querySelectorAll('[data-public-card]').forEach((card) => {
        const matchSearch = !search || (card.dataset.title || '').includes(search);
        const matchCategory = !category || card.dataset.category === category;
        card.hidden = !(matchSearch && matchCategory);
    });
}

function filterAdminBookings() {
    const search = (document.querySelector('[data-admin-search="bookings"]')?.value || '').trim().toLowerCase();
    const status = document.querySelector('[data-admin-filter-status="bookings"]')?.value || '';
    const date = document.querySelector('[data-admin-filter-date="bookings"]')?.value || '';

    document.querySelectorAll('[data-admin-booking-row]').forEach((row) => {
        const visible = (!search || row.dataset.title.includes(search))
            && (!status || row.dataset.status === status)
            && (!date || row.dataset.date === date);
        row.hidden = !visible;
    });
}

function filterAdminRows(scope, selector) {
    const search = (document.querySelector(`[data-admin-search="${scope}"]`)?.value || '').trim().toLowerCase();
    const category = document.querySelector(`[data-admin-filter-category="${scope}"]`)?.value || '';
    const status = document.querySelector(`[data-admin-filter-status="${scope}"]`)?.value || '';

    document.querySelectorAll(selector).forEach((row) => {
        const matchSearch = !search || row.dataset.title.includes(search);
        const matchCategory = !category || row.dataset.category === category;
        const matchStatus = !status || row.dataset.status === status;
        const visible = matchSearch && matchCategory && matchStatus;
        row.hidden = !visible;
        const editor = row.nextElementSibling;
        if (editor?.matches('.admin-inline-editor') && !visible) editor.hidden = true;
        const cardEditor = row.querySelector?.('.admin-compact-editor');
        if (cardEditor && !visible) cardEditor.hidden = true;
    });
}

function exportAdminTable(scope) {
    const table = document.querySelector(`[data-admin-table="${scope}"]`) || document.querySelector('.admin-data-table');
    const rowSelectors = {
        bookings: '[data-admin-booking-row]',
        services: '[data-admin-service-row]',
        addons: '[data-admin-addon-row]',
        portfolio: '[data-admin-portfolio-row]',
        certificates: '[data-admin-certificate-row]',
        certificateProducts: '[data-admin-certificate-product-row]',
        'certificate-products': '[data-admin-certificate-products-row]',
        'certificate-designs': '[data-admin-certificate-designs-row]',
        'certificate-delivery': '[data-admin-certificate-delivery-row]'
    };
    const rows = [...document.querySelectorAll(rowSelectors[scope] || '')]
        .filter((row) => !row.hidden);

    if (!table || rows.length === 0) {
        showToast('Нет данных для экспорта');
        return;
    }

    const isCardExport = !table.matches('table');
    const headers = isCardExport ? ['Название', 'Описание', 'Статус', 'Сумма'] : [...table.querySelectorAll('thead th')]
        .map((cell) => cell.textContent.trim())
        .filter((text) => text && text !== 'Действия');
    const body = rows.map((row) => (isCardExport
        ? [
            row.querySelector('strong')?.textContent || '',
            row.querySelector('p')?.textContent || '',
            row.querySelector('.admin-pill')?.textContent || '',
            row.querySelector('.admin-compact-meta b')?.textContent || ''
        ]
        : [...row.children].slice(0, headers.length).map((cell) => cell.textContent)
    )
        .map((text) => `"${String(text).replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`)
        .join(','));
    const csv = [headers.map((item) => `"${item}"`).join(','), ...body].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Экспорт готов');
}

function adminMenuItem(icon, label, target, active = false) {
    return `<a class="${active ? 'active' : ''}" href="#${target}"><span>${icon}</span>${esc(label)}</a>`;
}

function adminStat(label, value) {
    return `
        <article>
            <span>${esc(label)}</span>
            <strong>${Number(value || 0).toLocaleString('ru-RU')}</strong>
        </article>
    `;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
    });
}

function compressImageFile(file, maxSize = 1600, quality = 0.86) {
    if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif' || file.size < 900000) {
        return readFileAsDataUrl(file);
    }

    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Не удалось подготовить изображение'));
        };
        image.src = url;
    });
}

async function uploadImageFile(file) {
    if (!file || !file.name || file.size === 0) return '';
    const dataUrl = await compressImageFile(file);
    const result = await api('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, dataUrl })
    });
    return result.url;
}

async function uploadImageFiles(files = []) {
    const selected = [...files].filter((file) => file && file.size > 0);
    const urls = [];
    for (const file of selected) {
        urls.push(await uploadImageFile(file));
    }
    return urls;
}

async function uploadAvatarFile(file) {
    if (!file || !file.name || file.size === 0) return null;
    const dataUrl = await compressImageFile(file, 900, 0.86);
    return api('/api/me/avatar', {
        method: 'POST',
        body: JSON.stringify({ fileName: file.name, dataUrl })
    });
}

async function collectFormDataWithUploads(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const galleryInput = form.querySelector('[name="imageFiles"]');
    const galleryFiles = galleryInput?.files ? [...galleryInput.files] : [];

    if (data.imageFile instanceof File && data.imageFile.size > 0) {
        data.imageUrl = await uploadImageFile(data.imageFile);
    }

    if (galleryFiles.length > 0) {
        data.galleryImageUrls = await uploadImageFiles(galleryFiles);
        if (!data.imageUrl && data.galleryImageUrls.length) {
            data.imageUrl = data.galleryImageUrls[0];
        }
    }

    if (data.heroImageFile instanceof File && data.heroImageFile.size > 0) {
        data.hero_image_url = await uploadImageFile(data.heroImageFile);
    }

    if (data.aboutImageFile instanceof File && data.aboutImageFile.size > 0) {
        data.about_hero_image_url = await uploadImageFile(data.aboutImageFile);
    }

    delete data.imageFile;
    delete data.imageFiles;
    delete data.heroImageFile;
    delete data.aboutImageFile;
    applyCustomCategory(data);
    return data;
}

function applyCustomCategory(data) {
    Object.keys(data).forEach((key) => {
        if (!key.endsWith('Custom')) return;
        const baseKey = key.slice(0, -6);
        if (String(data[key] || '').trim()) data[baseKey] = String(data[key]).trim();
        delete data[key];
    });
    return data;
}

function updateUploadFileList(input) {
    const panel = input.closest('.admin-editor-section');
    const list = panel?.querySelector('[data-file-list]');
    if (!list) return;

    const files = [...(input.files || [])];
    list.hidden = files.length === 0;
    list.innerHTML = files.map((file, index) => `
        <span>${index + 1}. ${esc(file.name)} <small>${Math.round(file.size / 1024)} КБ</small></span>
    `).join('');
}

function setUploadFiles(input, files) {
    const dataTransfer = new DataTransfer();
    [...files].filter((file) => file.type?.startsWith('image/')).forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
    updateUploadFileList(input);
}

async function createPortfolioItemsFromService(service, imageUrls = []) {
    const urls = asArray(imageUrls).filter(Boolean);
    if (!service || urls.length === 0) return;
    const baseSortOrder = Math.floor(Date.now() / 1000) % 2000000000;

    await Promise.all(urls.map((imageUrl, index) => api('/api/admin/portfolio', {
        method: 'POST',
        body: JSON.stringify({
            title: `${service.title || 'Услуга'}${urls.length > 1 ? ` ${index + 1}` : ''}`,
            category: service.category || 'Фотосессия',
            imageUrl,
            sortOrder: baseSortOrder + index
        })
    })));
}

function renderCta(title, text) {
    return `
        <section class="cta-band">
            <div>
                <h2>${esc(title)}</h2>
                <p>${esc(text)}</p>
                <button class="btn accent" type="button" data-open-chat>Написать фотографу</button>
            </div>
        </section>
    `;
}

function renderFooter() {
    return `
        <footer class="footer">
            <div class="footer-inner">
                <div>
                    <h3>${esc(state.settings.studio_name || 'PHOTO STUDIO')}</h3>
                    <p>${esc(state.settings.short_tagline || 'Запечатлеваем важные моменты вашей жизни.')}</p>
                </div>
                <div>
                    <strong>Навигация</strong>
                    <p><a href="#home">Главная</a><br><a href="#services">Услуги</a><br><a href="#portfolio">Портфолио</a><br><a href="#about">Обо мне</a><br><a href="#certificate">Сертификаты</a><br><a href="#addons">Доп. услуги</a></p>
                </div>
                <div>
                    <strong>Контакты</strong>
                    <p>${esc(state.settings.contact_phone || '+7 (999) 123-45-67')}<br>${esc(state.settings.contact_email || 'nikitinadara43@gmail.com')}<br>${esc(state.settings.contact_address || 'г. Чебоксары')}</p>
                </div>
                <div>
                    <strong>Режим работы</strong>
                    <p>${esc(state.settings.working_text || 'Пн - Пт: 10:00 - 20:00\nСб - Вс: 10:00 - 18:00')}</p>
                </div>
                <p class="footer-copy">© 2026 Photo Studio. Все права защищены.</p>
            </div>
        </footer>
    `;
}

function dayName(day) {
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][Number(day)];
}

function normalize(value = '') {
    return String(value).trim().toLowerCase();
}

function fallbackImage() {
    return 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80';
}

function openAuth(mode = 'login') {
    authModal.hidden = false;
    setAuthMode(mode);
}

function setAuthMode(mode) {
    document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.authTab === mode);
    });
    document.querySelector('#loginForm').hidden = mode !== 'login';
    document.querySelector('#registerForm').hidden = mode !== 'register';
}

async function openBooking(serviceId = '', packageId = '') {
    if (!state.user) {
        openAuth('login');
        showToast('Сначала войдите или зарегистрируйтесь');
        return;
    }

    bookingModal.hidden = false;
    const serviceSelect = bookingModal.querySelector('[name="serviceId"]');
    serviceSelect.innerHTML = state.services.map((service) => `<option value="${service.id}">${esc(service.title)} · от ${money(service.price)}</option>`).join('');
    if (serviceId) serviceSelect.value = serviceId;
    bookingModal.querySelector('#bookingAddons').innerHTML = state.addons.map((addon) => `
        <label class="check">
            <input type="checkbox" name="addonIds" value="${addon.id}">
            <span>${esc(addon.title)} · ${money(addon.price)}</span>
        </label>
    `).join('');
    const dateInput = bookingModal.querySelector('[name="date"]');
    if (dateInput) {
        const today = new Date().toISOString().slice(0, 10);
        dateInput.min = today;
        dateInput.value = dateInput.value || today;
    }
    renderBookingPackages(bookingModal.querySelector('#bookingForm'), packageId);
    updateBookingTotal();
    await loadSlots();
}

function renderBookingPackages(form, selectedPackageId = '') {
    const serviceId = form.elements.serviceId?.value;
    const service = state.services.find((item) => String(item.id) === String(serviceId));
    const packages = service && (state.servicePackages[serviceId] || []).length
        ? state.servicePackages[serviceId]
        : service ? fallbackPackages(service) : [];
    const target = form.querySelector('[data-booking-packages]');
    if (!target) return;
    if (!packages.length) {
        target.innerHTML = '<span class="muted">Сначала выберите услугу.</span>';
        if (form.elements.packageId) form.elements.packageId.value = '';
        return;
    }
    target.innerHTML = packages.map((item, index) => `
        <button type="button" class="${String(item.id) === String(selectedPackageId) || (!selectedPackageId && index === 0) ? 'active' : ''}" data-select-package="${item.id}">
            <strong>${esc(item.title)}</strong>
            <span>${money(item.price)}</span>
        </button>
    `).join('');
    const selected = target.querySelector('.active')?.dataset.selectPackage || '';
    form.elements.packageId.value = selected;
    const pkg = packages.find((item) => String(item.id) === String(selected));
    if (pkg && form.elements.hours) form.elements.hours.value = Math.ceil(Number(pkg.hours || 1));
}

function selectedBookingPackage(form) {
    const service = state.services.find((item) => String(item.id) === String(form.elements.serviceId?.value));
    const packages = service && (state.servicePackages[service?.id] || []).length ? state.servicePackages[service?.id] : service ? fallbackPackages(service) : [];
    return packages.find((item) => String(item.id) === String(form.elements.packageId?.value)) || null;
}

function updateBookingTotal() {
    const form = document.querySelector('#bookingForm');
    if (!form) return;
    const service = state.services.find((item) => String(item.id) === String(form.elements.serviceId?.value));
    const packages = (state.servicePackages[service?.id] || []).length ? state.servicePackages[service?.id] : fallbackPackages(service);
    const pkg = packages.find((item) => String(item.id) === String(form.elements.packageId?.value));
    const hours = Math.max(1, Number(form.elements.hours?.value || pkg?.hours || 1));
    const servicePrice = pkg ? Number(pkg.price || 0) : Number(service?.price || 0) * hours;
    const addonTotal = [...form.querySelectorAll('[name="addonIds"]:checked')]
        .reduce((total, input) => {
            const addon = state.addons.find((item) => String(item.id) === String(input.value));
            return total + Number(addon?.price || 0);
        }, 0);
    const target = form.querySelector('[data-booking-total]');
    if (target) target.textContent = money(servicePrice + addonTotal);
}

async function loadSlots() {
    const form = document.querySelector('#bookingForm');
    if (!form) return;
    await renderAvailableSlots(form);
}

async function renderAvailableSlots(form) {
    const dateInput = form.elements.date;
    const timeInput = form.elements.time;
    const slotList = form.querySelector('[data-slot-list]');
    if (!dateInput || !timeInput || !slotList) return;

    const today = new Date().toISOString().slice(0, 10);
    dateInput.min = today;
    dateInput.value = dateInput.value || today;
    timeInput.value = '';
    slotList.innerHTML = '<span class="muted">Загружаем свободные окошки...</span>';

    const params = new URLSearchParams({
        serviceId: form.elements.serviceId?.value || '',
        date: dateInput.value,
        hours: form.elements.hours?.value || (state.servicePackages[form.elements.serviceId?.value] || []).find((item) => String(item.id) === String(form.elements.packageId?.value))?.hours || '1',
        days: '1'
    });
    const response = await api(`/api/availability?${params.toString()}`);
    const slots = Array.isArray(response) ? response : response.slots || [];
    if (!slots.length && response.closed) {
        slotList.innerHTML = '<span class="muted">В этот день выходной.</span>';
        return;
    }
    slotList.innerHTML = slots.length
        ? slots.map((slot) => `<button type="button" data-slot-time="${slot.time}">${slot.time}</button>`).join('')
        : '<span class="muted">На эту дату свободных окошек нет.</span>';
}

document.addEventListener('click', async (event) => {
    const authButton = event.target.closest('[data-open-auth]');
    const bookingButton = event.target.closest('[data-open-booking]');
    const closeButton = event.target.closest('[data-close-modal]');
    const logoutButton = event.target.closest('[data-logout]');
    const chatButton = event.target.closest('[data-open-chat]');
    const cancelButton = event.target.closest('[data-cancel-booking]');
    const authTab = event.target.closest('[data-auth-tab]');
    const certAmountButton = event.target.closest('[data-cert-amount]');
    const certScrollButton = event.target.closest('[data-scroll-certificate-form]');
    const adminDeleteButton = event.target.closest('[data-admin-delete]');
    const adminToggleServiceButton = event.target.closest('[data-admin-toggle-service]');
    const adminCreateButton = event.target.closest('[data-open-admin-create]');
    const adminRowEditButton = event.target.closest('[data-admin-row-edit]');
    const adminExportButton = event.target.closest('[data-admin-export]');
    const serviceThumb = event.target.closest('.service-thumbs img');
    const certTabButton = event.target.closest('[data-cert-tab]');
    const slotButton = event.target.closest('[data-slot-time]');
    const packageButton = event.target.closest('[data-select-package]');
    const favoriteButton = event.target.closest('[data-toggle-favorite]');

    if (authButton) openAuth(authButton.dataset.openAuth);
    if (bookingButton) openBooking(bookingButton.dataset.service, bookingButton.dataset.package);
    if (chatButton) {
        if (!state.user) {
            sessionStorage.setItem('photoPendingRoute', 'profile?section=chat');
            openAuth('login');
            showToast('Войдите, чтобы открыть чат с фотографом');
        } else {
            location.hash = 'profile?section=chat';
        }
    }
    if (closeButton) closeButton.closest('.modal').hidden = true;
    if (authTab) setAuthMode(authTab.dataset.authTab);
    if (certScrollButton) {
        openCertificatePurchaseModal();
    }
    if (certAmountButton) {
        setCertificateSelection(certAmountButton, true);
    }
    if (certTabButton) {
        applyCertificateMode(certTabButton.dataset.certTab);
    }
    if (serviceThumb) {
        const mainImage = document.querySelector('.service-main-image');
        if (mainImage) {
            mainImage.src = serviceThumb.src;
            document.querySelectorAll('.service-thumbs img').forEach((thumb) => thumb.classList.toggle('active', thumb === serviceThumb));
        }
    }
    if (slotButton) {
        const form = slotButton.closest('form');
        form.elements.time.value = slotButton.dataset.slotTime;
        form.querySelectorAll('[data-slot-time]').forEach((button) => button.classList.toggle('active', button === slotButton));
    }
    if (packageButton) {
        const form = packageButton.closest('form');
        form.elements.packageId.value = packageButton.dataset.selectPackage;
        form.querySelectorAll('[data-select-package]').forEach((button) => button.classList.toggle('active', button === packageButton));
        const pkg = selectedBookingPackage(form);
        if (pkg && form.elements.hours) form.elements.hours.value = Math.ceil(Number(pkg.hours || 1));
        updateBookingTotal();
        loadSlots().catch((error) => showToast(error.message));
    }
    if (favoriteButton) {
        if (!state.user) {
            openAuth('login');
            showToast('Войдите, чтобы добавить услугу в избранное');
            return;
        }

        const serviceId = favoriteButton.dataset.toggleFavorite;
        const favorite = isFavorite(serviceId);
        await api(`/api/me/favorites/${serviceId}`, { method: favorite ? 'DELETE' : 'POST' });
        await loadPersonalData();
        showToast(favorite ? 'Услуга удалена из избранного' : 'Услуга добавлена в избранное');
        render();
        return;
    }
    if (logoutButton) {
        clearSession();
        syncHeader();
        location.hash = 'home';
        showToast('Вы вышли из аккаунта');
    }
    if (cancelButton) {
        await api(`/api/bookings/${cancelButton.dataset.cancelBooking}/cancel`, { method: 'PATCH' });
        showToast('Запись отменена');
        renderProfilePage();
    }
    if (adminDeleteButton) {
        const type = adminDeleteButton.dataset.adminDelete;
        const id = adminDeleteButton.dataset.id;
        const paths = {
            service: `/api/admin/services/${id}`,
            addon: `/api/admin/addons/${id}`,
            portfolio: `/api/admin/portfolio/${id}`,
            certificateProduct: `/api/admin/certificate-products/${id}`,
            certificateDesign: `/api/admin/certificate-designs/${id}`,
            certificateDelivery: `/api/admin/certificate-delivery-options/${id}`,
            serviceSlot: `/api/admin/service-time-slots/${id}`
        };

        if (paths[type]) {
            await api(paths[type], { method: 'DELETE' });
            showToast(type === 'portfolio' ? 'Работа удалена' : 'Запись скрыта');
            await boot();
            location.hash = ['certificateProduct', 'certificateDesign', 'certificateDelivery'].includes(type)
                ? 'admin-certificates'
                : type === 'serviceSlot'
                    ? 'admin-schedule'
                : `admin-${type === 'service' ? 'services' : type === 'addon' ? 'addons' : 'portfolio'}`;
        }
    }
    if (adminToggleServiceButton) {
        const id = adminToggleServiceButton.dataset.adminToggleService;
        const isActive = adminToggleServiceButton.dataset.active === 'true';
        await api(`/api/admin/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive })
        });
        showToast(isActive ? 'Услуга активирована' : 'Услуга сделана неактивной');
        await boot();
        location.hash = 'admin-services';
    }
    if (adminCreateButton) {
        const createType = adminCreateButton.dataset.openAdminCreate;
        if (createType === 'service') {
            openAdminEditorModal('Добавление услуги', adminServiceEditor({}, 'create', true));
            return;
        }
        if (createType === 'addon') {
            openAdminEditorModal('Добавление доп. услуги', adminAddonEditor({}, 'create', true));
            return;
        }
        const forms = {
            service: '#adminServiceForm',
            addon: '#adminAddonForm',
            portfolio: '#adminPortfolioForm',
            certificate: '#adminCertificateForm',
            certificateProduct: '#adminCertificateProductForm',
            certificateDesign: '#adminCertificateDesignForm',
            certificateDelivery: '#adminCertificateDeliveryForm'
        };
        const form = document.querySelector(forms[adminCreateButton.dataset.openAdminCreate]);
        if (form) form.hidden = !form.hidden;
    }
    if (adminRowEditButton) {
        const editType = adminRowEditButton.dataset.adminRowEdit;
        const id = Number(adminRowEditButton.dataset.id);
        if (editType === 'service') {
            if (!state.adminServices.length) {
                state.adminServices = asArray(await api('/api/admin/services'));
            }
            const service = state.adminServices.find((item) => Number(item.id) === id);
            if (service) openAdminEditorModal('Редактирование услуги', adminServiceEditor(service, 'edit', true));
            else showToast('Услуга не найдена');
            return;
        }
        if (editType === 'addon') {
            if (!state.adminAddons.length) {
                state.adminAddons = asArray(await api('/api/admin/addons'));
            }
            const addon = state.adminAddons.find((item) => Number(item.id) === id);
            if (addon) openAdminEditorModal('Редактирование доп. услуги', adminAddonEditor(addon, 'edit', true));
            else showToast('Доп. услуга не найдена');
            return;
        }
        const editor = document.querySelector(`[data-admin-editor="${adminRowEditButton.dataset.adminRowEdit}-${adminRowEditButton.dataset.id}"]`);
        if (editor) editor.hidden = !editor.hidden;
    }
    if (adminExportButton) {
        exportAdminTable(adminExportButton.dataset.adminExport);
    }
});

document.addEventListener('input', (event) => {
    if (event.target.matches('[data-admin-search], [data-admin-filter-category], [data-admin-filter-status], [data-admin-filter-date]')) {
        filterAdminTables();
    }
    if (event.target.matches('[data-admin-chat-search]')) {
        const search = event.target.value.trim().toLowerCase();
        document.querySelectorAll('[data-admin-chat-client]').forEach((client) => {
            client.hidden = search && !client.dataset.search.includes(search);
        });
    }
    if (event.target.matches('[data-public-search]')) {
        filterPublicCards();
    }
});

document.addEventListener('change', (event) => {
    if (event.target.matches('.admin-upload-zone input[type="file"]')) {
        updateUploadFileList(event.target);
    }
    if (event.target.matches('[data-admin-filter-category], [data-admin-filter-status], [data-admin-filter-date]')) {
        filterAdminTables();
    }
    if (event.target.matches('[data-public-category]')) {
        filterPublicCards();
    }
    if (event.target.matches('#bookingForm [name="serviceId"], #bookingForm [name="hours"], #bookingForm [name="addonIds"]')) {
        if (event.target.matches('#bookingForm [name="serviceId"]')) {
            renderBookingPackages(event.target.form);
        }
        updateBookingTotal();
    }
    if (event.target.matches('#bookingForm [name="serviceId"], #bookingForm [name="hours"], #bookingForm [name="date"]')) {
        loadSlots().catch((error) => showToast(error.message));
    }
    if (event.target.matches('#bookingPageForm [name="serviceId"], #bookingPageForm [name="date"]')) {
        if (event.target.matches('#bookingPageForm [name="serviceId"]')) {
            renderBookingPackages(event.target.form);
        }
        renderAvailableSlots(event.target.form).catch((error) => showToast(error.message));
    }
    if (event.target.matches('[name="design"]')) {
        document.querySelectorAll('.design-card').forEach((card) => card.classList.toggle('active', card.contains(event.target)));
    }
    if (event.target.matches('[name="delivery"]')) {
        document.querySelectorAll('.delivery-card').forEach((card) => card.classList.toggle('active', card.contains(event.target)));
    }
    if (event.target.matches('#certificateForm [name="customAmount"]')) {
        setCertificateCustomAmount(event.target);
    }
});

document.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-upload-zone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.add('dragover');
});

document.addEventListener('dragleave', (event) => {
    const zone = event.target.closest('[data-upload-zone]');
    if (!zone) return;
    zone.classList.remove('dragover');
});

document.addEventListener('drop', (event) => {
    const zone = event.target.closest('[data-upload-zone]');
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove('dragover');
    const input = zone.querySelector('input[type="file"]');
    if (input) setUploadFiles(input, event.dataTransfer.files);
});

document.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    let data = Object.fromEntries(new FormData(form).entries());

    try {
        if (form.id === 'loginForm') {
            setSession(await api('/auth/login', { method: 'POST', body: JSON.stringify(data) }));
            authModal.hidden = true;
            showToast('Вы вошли');
        }
        if (form.id === 'registerForm') {
            if (data.password !== data.repeatPassword) {
                showToast('Пароли не совпадают');
                return;
            }
            if (String(data.botCheck || '').trim() !== '5') {
                showToast('Проверка не пройдена');
                return;
            }
            setSession(await api('/auth/register', { method: 'POST', body: JSON.stringify(data) }));
            authModal.hidden = true;
            showToast('Аккаунт создан');
        }
        if (form.id === 'bookingForm') {
            if (!data.time) {
                showToast('Выберите свободное окошко');
                return;
            }
            const pkg = selectedBookingPackage(form);
            const addonIds = [...form.querySelectorAll('[name="addonIds"]:checked')].map((input) => Number(input.value));
            await api('/api/bookings', {
                method: 'POST',
                body: JSON.stringify({
                    ...data,
                    addonIds,
                    packageId: /^\d+$/.test(String(data.packageId || '')) ? data.packageId : null,
                    packageTitle: pkg?.title || null,
                    packagePrice: pkg?.price || null,
                    hours: Number(pkg?.hours || data.hours)
                })
            });
            const total = form.querySelector('[data-booking-total]')?.textContent || '';
            bookingModal.hidden = true;
            showToast(`Вы успешно записались${total ? `. Итог: ${total}` : ''}`);
            if (location.hash === '#profile') renderProfilePage();
        }
        if (form.id === 'bookingPageForm') {
            if (!state.user) {
                openAuth('login');
                showToast('Чтобы оформить запись, сначала войдите или зарегистрируйтесь');
                return;
            }

            if (!data.time) {
                showToast('Выберите свободное окошко');
                return;
            }

            const pkg = selectedBookingPackage(form);
            const addonIds = [...form.querySelectorAll('[name="addonIds"]:checked')].map((input) => Number(input.value));
            await api('/api/bookings', {
                method: 'POST',
                body: JSON.stringify({
                    serviceId: data.serviceId,
                    packageId: /^\d+$/.test(String(data.packageId || '')) ? data.packageId : null,
                    packageTitle: pkg?.title || null,
                    packagePrice: pkg?.price || null,
                    addonIds,
                    date: data.date,
                    time: data.time,
                    hours: Number(pkg?.hours || data.hours || 1),
                    comment: [data.location, data.comment].filter(Boolean).join('\n')
                })
            });
            form.reset();
            showToast('Заявка на съемку сохранена');
        }
        if (form.id === 'certificateForm') {
            if (data.customAmount) data.amount = data.customAmount;
            if (!Number(data.amount) || Number(data.amount) < 1000) {
                showToast('Укажите сумму сертификата от 1 000 ₽');
                return;
            }
            await api('/api/certificates', { method: 'POST', body: JSON.stringify(data) });
            form.reset();
            document.querySelector('#certificatePurchaseModal')?.setAttribute('hidden', '');
            showToast('Заявка на сертификат отправлена');
        }
        if (form.id === 'profileForm') {
            if (data.avatarFile instanceof File && data.avatarFile.size > 0) {
                const uploadedUser = await uploadAvatarFile(data.avatarFile);
                state.user = uploadedUser;
            }
            delete data.avatarFile;
            const user = await api('/api/me', { method: 'PUT', body: JSON.stringify(data) });
            state.user = user;
            localStorage.setItem('photoUser', JSON.stringify(user));
            showToast('Данные сохранены');
            renderProfilePage();
        }
        if (form.id === 'passwordForm') {
            if (data.repeatPassword && data.newPassword !== data.repeatPassword) {
                showToast('Новые пароли не совпадают');
                return;
            }
            delete data.repeatPassword;
            await api('/api/me/password', { method: 'PUT', body: JSON.stringify(data) });
            form.reset();
            showToast('Пароль изменен');
        }
        if (form.id === 'reviewForm') {
            await api('/api/reviews', { method: 'POST', body: JSON.stringify(data) });
            state.reviews = asArray(await api('/api/reviews').catch(() => state.reviews));
            form.reset();
            showToast('Отзыв опубликован');
            render();
        }
        if (form.id === 'chatForm') {
            await api('/api/messages', { method: 'POST', body: JSON.stringify(data) });
            form.reset();
            showToast('Сообщение отправлено');
            renderProfilePage();
        }
        if (form.id === 'adminChatForm') {
            await api('/api/messages', { method: 'POST', body: JSON.stringify(data) });
            form.reset();
            showToast('Сообщение отправлено клиенту');
            if (location.hash.startsWith('#profile')) {
                renderProfilePage();
            } else {
                renderAdminPage('chat');
            }
        }
        if (form.id === 'adminServiceSlotForm') {
            await api('/api/admin/service-time-slots', { method: 'POST', body: JSON.stringify(data) });
            showToast('Окно времени добавлено');
            await boot();
            location.hash = 'admin-schedule';
        }
        if (form.dataset.adminEdit) {
            data = await collectFormDataWithUploads(form);
            const id = form.dataset.id;
            const type = form.dataset.adminEdit;
            const galleryImageUrls = asArray(data.galleryImageUrls);
            delete data.galleryImageUrls;
            const paths = {
                booking: `/api/admin/bookings/${id}`,
                schedule: `/api/admin/working-hours/${id}`,
                service: `/api/admin/services/${id}`,
                addon: `/api/admin/addons/${id}`,
                portfolio: `/api/admin/portfolio/${id}`,
                certificate: `/api/admin/certificates/${id}`,
                certificateProduct: `/api/admin/certificate-products/${id}`,
                certificateDesign: `/api/admin/certificate-designs/${id}`,
                certificateDelivery: `/api/admin/certificate-delivery-options/${id}`
            };
            const savedItem = await api(paths[type], { method: ['certificate', 'booking'].includes(type) ? 'PATCH' : 'PUT', body: JSON.stringify(data) });
            if (type === 'service') {
                await createPortfolioItemsFromService(savedItem, galleryImageUrls);
            }
            showToast('Изменения сохранены');
            closeAdminEditorModal();
            await boot();
            location.hash = `admin-${type === 'booking' ? 'bookings' : type === 'schedule' ? 'schedule' : type === 'service' ? 'services' : type === 'addon' ? 'addons' : ['certificate', 'certificateProduct', 'certificateDesign', 'certificateDelivery'].includes(type) ? 'certificates' : 'portfolio'}`;
        }
        if (form.id === 'adminSettingsForm') {
            data = await collectFormDataWithUploads(form);
            await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
            showToast('Настройки сохранены');
            await boot();
            location.hash = 'admin-settings';
        }
        if (form.id === 'adminServiceForm') {
            data = await collectFormDataWithUploads(form);
            const galleryImageUrls = asArray(data.galleryImageUrls);
            delete data.galleryImageUrls;
            const service = await api('/api/admin/services', { method: 'POST', body: JSON.stringify(data) });
            await createPortfolioItemsFromService(service, galleryImageUrls);
            showToast('Услуга добавлена');
            closeAdminEditorModal();
            await boot();
            location.hash = 'admin-services';
        }
        if (form.id === 'adminAddonForm') {
            data = await collectFormDataWithUploads(form);
            await api('/api/admin/addons', { method: 'POST', body: JSON.stringify(data) });
            showToast('Доп. услуга добавлена');
            closeAdminEditorModal();
            await boot();
            location.hash = 'admin-addons';
        }
        if (form.id === 'adminPortfolioForm') {
            data = await collectFormDataWithUploads(form);
            await api('/api/admin/portfolio', { method: 'POST', body: JSON.stringify(data) });
            showToast('Работа добавлена в портфолио');
            await boot();
            location.hash = 'admin-portfolio';
        }
        if (form.id === 'adminCertificateForm') {
            await api('/api/admin/certificates', { method: 'POST', body: JSON.stringify(data) });
            showToast('\u0421\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d');
            await boot();
            location.hash = 'admin-certificates';
        }
        if (form.id === 'adminCertificateProductForm') {
            await api('/api/admin/certificate-products', { method: 'POST', body: JSON.stringify(data) });
            showToast('\u041d\u043e\u043c\u0438\u043d\u0430\u043b \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d');
            await boot();
            location.hash = 'admin-certificates';
        }
        if (form.id === 'adminCertificateDesignForm') {
            data = await collectFormDataWithUploads(form);
            await api('/api/admin/certificate-designs', { method: 'POST', body: JSON.stringify(data) });
            showToast('Дизайн сертификата добавлен');
            await boot();
            location.hash = 'admin-certificates';
        }
        if (form.id === 'adminCertificateDeliveryForm') {
            await api('/api/admin/certificate-delivery-options', { method: 'POST', body: JSON.stringify(data) });
            showToast('Способ получения добавлен');
            await boot();
            location.hash = 'admin-certificates';
        }
    } catch (error) {
        showToast(error.message);
    }
});

if (menuToggle) {
    menuToggle.addEventListener('click', toggleMobileMenu);
}

if (mainNav) {
    mainNav.addEventListener('click', (event) => {
        if (event.target.closest('a')) closeMobileMenu();
    });
}

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileMenu();
});

window.addEventListener('hashchange', () => {
    closeMobileMenu();
    renderCurrentRoute();
});
boot().catch((error) => {
    app.innerHTML = `<section class="page"><p class="lead">${esc(error.message)}</p></section>`;
});

