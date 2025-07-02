import { formatSeconds, decodeModemState } from '../utils.js';

let isFetchingInfo = false;
let currentlySelectedRRO;
let showNotification;

/**
 * Ініціалізує та рендерить вигляд "Інфо про РРО".
 */
export function renderStateView(container, rro, notificationFunc) {
    currentlySelectedRRO = rro;
    showNotification = notificationFunc;

    // ЗМІНА: Додано контейнер для типів оплат
    container.innerHTML = `
        <div id="rroErrorContainer"></div>
        <div class="info-view-grid">
            <div id="checkHeaderContainer" class="info-block full-width"></div>
            <div id="devInfoContainer" class="info-block"></div>
            <div id="stateContainer" class="info-block"></div>
            <div id="taxContainer" class="info-block"></div>
            <div id="modemContainer" class="info-block"></div>
            <div id="paymentTypesContainer" class="info-block"></div>
        </div>
    `;
    fetchRROInfo();
}

async function fetchRROInfo() {
    if (!currentlySelectedRRO) {
        document.querySelector('.info-view-grid').innerHTML = `<p>Будь ласка, оберіть РРО для перегляду інформації.</p>`;
        return;
    }
    if (isFetchingInfo) {
        showNotification('Оновлення вже триває...', 'info');
        return;
    }
    isFetchingInfo = true;

    const containers = {
        error: document.getElementById('rroErrorContainer'),
        header: document.getElementById('checkHeaderContainer'),
        devInfo: document.getElementById('devInfoContainer'),
        state: document.getElementById('stateContainer'),
        tax: document.getElementById('taxContainer'),
        modem: document.getElementById('modemContainer'),
        payment: document.getElementById('paymentTypesContainer')
    };

    Object.values(containers).forEach(c => { if (c) c.innerHTML = '<p>Завантаження...</p>'; });
    if (containers.error) containers.error.style.display = 'none';
    showNotification('Отримання даних з РРО...', 'info');

    try {
        // ЗМІНА: Оновлено список запитів
        const results = await Promise.allSettled([
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/state', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/tbl/Hdr', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/dev_info', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/proc/getfmroom', 'GET'), // Замість getjrnroom
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/tbl/Tax?sort_by=id&order=asc', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/status', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/fw_info', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/tbl/Ftr', 'GET'),
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/tbl/Pay', 'GET'), // Новий запит
            window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/tbl/Fsk', 'GET')  // Новий запит
        ]);
        const [stateRes, hdrRes, devInfoRes, fmRoomRes, taxRes, modemRes, fwInfoRes, ftrRes, payRes, fskRes] = results;

        if (stateRes.status === 'fulfilled' && stateRes.value.err && stateRes.value.err.length > 0) {
            renderErrorBlock(containers.error, stateRes.value);
        } else {
            if (containers.error) containers.error.style.display = 'none';
        }

        if (containers.header) renderHeaderBlock(containers.header, hdrRes, ftrRes);
        if (containers.devInfo) renderDevInfoBlock(containers.devInfo, devInfoRes, fwInfoRes);
        if (containers.state) renderStateBlock(containers.state, stateRes, fmRoomRes);
        if (containers.tax) renderTaxBlock(containers.tax, taxRes, fskRes); // Передаємо дані про Fsk
        if (containers.modem) renderModemBlock(containers.modem, modemRes);
        if (containers.payment) renderPaymentTypesBlock(containers.payment, payRes); // Рендеримо новий блок

        showNotification('Дані оновлено.', 'success');
    } catch (error) {
        showNotification(`Сталася помилка: ${error.message}`, 'error');
        document.querySelector('.info-view-grid').innerHTML = `<p style="color: red;">Не вдалося завантажити дані. Перевірте з'єднання та налаштування РРО.</p>`;
    } finally {
        isFetchingInfo = false;
    }
}

function renderErrorBlock(container, stateData) {
    container.style.display = 'block';
    // ЗМІНА: Персоналізований вивід помилок
    const errorMessages = stateData.err.map(e => e.e).join(', ');
    container.innerHTML = `<strong>Помилка РРО:</strong> ${errorMessages}`;
}

function renderHeaderBlock(container, hdrRes, ftrRes) {
    // без змін
    container.innerHTML = `<h3 class="info-block-title">Шапка чека</h3>`;
    const hdrData = (hdrRes.status === 'fulfilled' && Array.isArray(hdrRes.value)) ? hdrRes.value : [];
    const ftrData = (ftrRes.status === 'fulfilled' && Array.isArray(ftrRes.value)) ? ftrRes.value : [];

    if (hdrData.length === 0 && ftrData.length === 0) {
        container.innerHTML += `<p style="color: red;">Не вдалося завантажити дані шапки.</p>`;
        return;
    }

    const adLine7 = ftrData.find(line => line.id === 7);
    const adLine8 = ftrData.find(line => line.id === 8);
    const combinedHeader = [ ...hdrData.slice(0, 3), ...(adLine7 ? [adLine7] : []), ...(adLine8 ? [adLine8] : []), ...hdrData.slice(3) ];

    const headerContent = document.createElement('div');
    headerContent.className = 'check-header-block';
    combinedHeader.forEach(line => {
        const p = document.createElement('p');
        p.textContent = line.Line || '';
        if (line.Param === 2) p.style.fontWeight = 'bold';
        headerContent.appendChild(p);
    });
    container.appendChild(headerContent);
}

function renderDevInfoBlock(container, devInfoRes, fwInfoRes) {
    // без змін
    container.innerHTML = `<h3 class="info-block-title">Інформація про пристрій</h3>`;
    const list = document.createElement('ul');
    let content = '';

    if (devInfoRes.status === 'fulfilled') {
        const data = devInfoRes.value;
        content += `
            <li><span class="key">Заводський №:</span><span class="value">${data.dev_zn || '—'}</span></li>
            <li><span class="key">Фіскальний №:</span><span class="value">${data.dev_fn || '—'}</span></li>
            <li><span class="key">Версія ПЗ:</span><span class="value">${data.dev_ver || '—'}</span></li>
            <li><span class="key">Податковий №:</span><span class="value">${data.dev_nn || '—'}</span></li>
            <li><span class="key">Версія протоколу:</span><span class="value">${data.prot || '—'}</span></li>
        `;
    } else { content += `<li><span class="key">Інфо про пристрій:</span><span class="value danger">Помилка</span></li>`; }

    if (fwInfoRes.status === 'fulfilled' && fwInfoRes.value.fw_date) {
        content += `<li><span class="key">Дата внутріш.ПЗ:</span><span class="value">${fwInfoRes.value.fw_date}</span></li>`;
    } else { content += `<li><span class="key">Дата внутріш.ПЗ:</span><span class="value danger">Не знайдено</span></li>`; }

    list.innerHTML = content;
    container.appendChild(list);
}

function renderStateBlock(container, stateRes, fmRoomRes) {
    container.innerHTML = `<h3 class="info-block-title">Загальний стан</h3>`;
    if (stateRes.status === 'fulfilled') {
        const data = stateRes.value;
        const fmRoomData = fmRoomRes.status === 'fulfilled' ? fmRoomRes.value : null;
        let fmInfo = '—';
        // ЗМІНА: Використовуємо дані з getfmroom
        if (fmRoomData && fmRoomData.Total > 0) {
            const usedPercent = ((fmRoomData.Used / fmRoomData.Total) * 100).toFixed(2);
            fmInfo = `${fmRoomData.Used} / ${fmRoomData.Total} (${usedPercent}%)`;
        }

        const list = document.createElement('ul');
        list.innerHTML = `
            <li><span class="key">Модель:</span><span class="value">${data.model || '—'}</span></li>
            <li><span class="key">Час на РРО:</span><span class="value">${new Date(data.time * 1000).toLocaleString('uk-UA')}</span></li>
            <li><span class="key">Зміна:</span><span class="value ${data.IsWrk === 1 ? 'success' : ''}">${data.IsWrk === 1 ? 'Відкрита' : 'Закрита'}</span></li>
            <li><span class="key">Останній Z-звіт:</span><span class="value">${data.currZ || '—'}</span></li>
            ${// ЗМІНА: Умовний рендеринг FskMode
              data.FskMode !== undefined ? `<li><span class="key">Стан фіскального друку:</span><span class="value ${data.FskMode === 1 ? 'success' : 'danger'}">${data.FskMode === 1 ? 'Готовий до друку' : 'Не готовий'}</span></li>` : ''
            }
            <li><span class="key">Заповненість ФП:</span><span class="value">${fmInfo}</span></li>
            <li><span class="key">Надруковано рядків:</span><span class="value">${data.NPrLin ?? '—'}</span></li>
        `;
        container.appendChild(list);
    } else {
        container.innerHTML += `<p style="color: red;">Не вдалося завантажити.</p>`;
    }
}

// ЗМІНА: Функція тепер приймає дані від /cgi/tbl/Fsk
function renderTaxBlock(container, taxResponse, fskResponse) {
    container.innerHTML = `<h3 class="info-block-title">Податкові ставки</h3>`;
    
    if (taxResponse.status !== 'fulfilled' || !Array.isArray(taxResponse.value)) {
        container.innerHTML += `<p style="color: red;">Не вдалося завантажити ставки.</p>`;
        return;
    }

    const taxData = taxResponse.value;
    const taxLetterMap = { 1: 'А', 2: 'Б', 3: 'В', 4: 'Г', 5: 'Д', 0: 'E' };
    const smodeTooltip = {
        0: "Податок та збір на базу оподаткування",
        1: "Податок на базу оподаткування та на збір",
        2: "Збір на базу оподаткування та на податок"
    };

    const table = document.createElement('table');
    // ЗМІНА: Додано нові колонки
    table.innerHTML = `<thead><tr><th>№ (Літера)</th><th>% податку</th><th>% збору</th><th>Назва збору</th><th>Тип оподатк.</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');

    taxData.forEach(tax => {
        const taxName = taxLetterMap[tax.id] || `(ID: ${tax.id})`;
        tbody.innerHTML += `
            <tr>
                <td>${tax.id ?? 'N/A'} (${taxName})</td>
                <td>${(tax.Prc || 0).toFixed(2)}%</td>
                <td>${(tax.Extra || 0).toFixed(2)}%</td>
                <td>${tax.SName || '—'}</td>
                <td title="${smodeTooltip[tax.SMode] || ''}">${tax.SMode}</td>
            </tr>`;
    });
    container.appendChild(table);

    // ЗМІНА: Додаємо інформацію з Fsk
    if (fskResponse.status === 'fulfilled' && fskResponse.value) {
        const taxModeText = fskResponse.value.TaxOff === 0 
            ? "ПДВ включено в ціну" 
            : "ПДВ не включено в ціну";
        const fskInfo = document.createElement('p');
        fskInfo.style.marginTop = '15px';
        fskInfo.innerHTML = `<strong>Режим оподаткування:</strong> ${taxModeText}`;
        container.appendChild(fskInfo);
    }
}

function renderModemBlock(container, modemRes) {
    // без змін
    container.innerHTML = `<h3 class="info-block-title">Інформація про модем</h3>`;
    if (modemRes.status === 'fulfilled') {
        const data = modemRes.value;
        const list = document.createElement('ul');
        const statusBit = (data.dev_state & (1 << 5)) !== 0;

        list.innerHTML = `
            <li><span class="key">Стан модема:</span><span class="value">${decodeModemState(data.dev_state)}</span></li>
            <li><span class="key">Мережеве з'єднання:</span><span class="value ${statusBit ? 'success' : 'danger'}">${statusBit ? 'Встановлено' : 'Відсутнє'}</span></li>
            <li><span class="key">Час до блокування:</span><span class="value">${formatSeconds(data.bt)}</span></li>
            <li><span class="key">Непередані документи:</span><span class="value">${data.ndoc !== undefined ? data.ndoc : '—'}</span></li>
            <li><span class="key">ID SAM:</span><span class="value">${data.sam_id || '—'}</span></li>
            <li><span class="key">ID DEV:</span><span class="value">${data.sam_dev_id || '—'}</span></li>
        `;
        container.appendChild(list);
    } else {
        container.innerHTML += `<p style="color: red;">Не вдалося завантажити.</p>`;
    }
}

// ЗМІНА: Нова функція для рендерингу типів оплат
function renderPaymentTypesBlock(container, response) {
    container.innerHTML = `<h3 class="info-block-title">Типи оплат</h3>`;
    if (response.status === 'fulfilled' && Array.isArray(response.value)) {
        const data = response.value;
        if (data.length === 0) {
            container.innerHTML += `<p>Немає налаштованих типів оплат.</p>`;
            return;
        }
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr><th>ID</th><th>Назва</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        data.forEach(pay => {
            tbody.innerHTML += `<tr><td>${pay.id}</td><td>${pay.Name}</td></tr>`;
        });
        container.appendChild(table);
    } else {
        container.innerHTML += `<p style="color: red;">Не вдалося завантажити.</p>`;
    }
}