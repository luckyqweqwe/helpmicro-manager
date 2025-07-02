import { formatDateTime, getPaymentTypeText } from './utils.js';

// ... (весь код до renderProductReportTable залишається без змін) ...

// --- DOM елементи ---
const fileStatusEl = document.getElementById('fileStatus');
const outputContainerEl = document.getElementById('output');
const dateRangeTotalEl = document.getElementById('dateRangeTotal');
const reportResultContainerEl = document.getElementById('reportResult');
const actionButtons = [
    document.getElementById('calculateRangeSumBtn'),
    document.getElementById('generateReportBtn'),
    document.getElementById('exportExcelBtn')
];

export function updateStatusMessage(message, isError = false) {
    fileStatusEl.textContent = message;
    fileStatusEl.className = isError ? 'status-message error' : 'status-message success';
}

export function toggleActionButtons(enabled) {
    actionButtons.forEach(btn => {
        if (btn) btn.disabled = !enabled;
    });
}

export function clearProductReport() {
    reportResultContainerEl.innerHTML = '<p>Звіт очищено.</p>';
}

export function displaySummaryResults(totals) {
    const netTotal = totals.sales - totals.returns;
    dateRangeTotalEl.innerHTML = `
        <strong>Заг. Продажі: ${totals.sales.toFixed(2)}</strong> | <strong>Заг. Повернення: ${totals.returns.toFixed(2)}</strong> | <strong>Чистий Оборот: ${netTotal.toFixed(2)}</strong><br>
        <strong>Знижки (Продаж): ${totals.discountsSales.toFixed(2)}</strong> | <strong>Знижки (Повернення): ${totals.discountsReturns.toFixed(2)}</strong><br>
        <strong>Служб. Внесення: ${totals.serviceIn.toFixed(2)}</strong> | <strong>Служб. Винесення: ${totals.serviceOut.toFixed(2)}</strong>
        <hr>
        <strong>Продажі (за ставками):</strong><br>
        A: ${totals.salesByTax[1].toFixed(2)} (Акц: ${totals.salesExcise[1].toFixed(2)}) | 
        Б: ${totals.salesByTax[2].toFixed(2)} (Акц: ${totals.salesExcise[2].toFixed(2)}) | 
        В: ${totals.salesByTax[3].toFixed(2)} (Акц: ${totals.salesExcise[3].toFixed(2)}) | 
        Г: ${totals.salesByTax[4].toFixed(2)} (Акц: ${totals.salesExcise[4].toFixed(2)}) | 
        Д: ${totals.salesByTax[5].toFixed(2)} | 
        E: ${totals.salesByTax[0].toFixed(2)}<br>
        <strong>Повернення (за ставками):</strong><br>
        A: ${totals.returnsByTax[1].toFixed(2)} (Акц: ${totals.returnsExcise[1].toFixed(2)}) | 
        Б: ${totals.returnsByTax[2].toFixed(2)} (Акц: ${totals.returnsExcise[2].toFixed(2)}) | 
        В: ${totals.returnsByTax[3].toFixed(2)} (Акц: ${totals.returnsExcise[3].toFixed(2)}) | 
        Г: ${totals.returnsByTax[4].toFixed(2)} (Акц: ${totals.returnsExcise[4].toFixed(2)}) | 
        Д: ${totals.returnsByTax[5].toFixed(2)} | 
        E: ${totals.returnsByTax[0].toFixed(2)}`;
}

export function renderZReportList(ksefData) {
    outputContainerEl.innerHTML = '';
    if (!ksefData || ksefData.length === 0) {
        outputContainerEl.innerHTML = '<p>Немає даних для відображення.</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    ksefData.forEach((report) => {
        const reportDiv = createReportElement(report);
        fragment.appendChild(reportDiv);
    });
    outputContainerEl.appendChild(fragment);
    
    setupIntersectionObserver();
}

function createReportElement(report) {
    const reportDiv = document.createElement('article');
    reportDiv.className = 'report';
    reportDiv.dataset.reportData = JSON.stringify(report);
    reportDiv.dataset.reportNumber = report.Z;

    const summary = calculateReportSummary(report);
    const hasDetails = Array.isArray(report.ejourn) && report.ejourn.some(entry => entry.F || entry.R);

    reportDiv.innerHTML = `
        <div class="report-header">
            <span><strong>Z-звіт ${summary.zNumber ?? 'N/A'}</strong> - ${formatDateTime(summary.openTime)} (Загальна сума: ${summary.totalSum.toFixed(2)} грн)</span>
            <span class="toggle-icon">${hasDetails ? '+' : ''}</span>
        </div>
        <div class="z-report-summary">
            <span><strong>Z-звіт:</strong> ${summary.zNumber ?? 'N/A'}</span>
            <span><strong>Час відкриття:</strong> ${formatDateTime(summary.openTime)}</span>
            <span><strong>Час закриття:</strong> ${formatDateTime(summary.closeTime)}</span>
            <span><strong>Загальна сума:</strong> ${summary.totalSum.toFixed(2)} грн</span>
        </div>
        <div class="details"></div>
    `;

    if (!hasDetails) {
        reportDiv.querySelector('.details').innerHTML = '<p>Детальна інформація відсутня.</p>';
        reportDiv.querySelector('.report-header').style.cursor = 'default';
    }

    return reportDiv;
}

function calculateReportSummary(report) {
    let totalSum = 0;
    let openTime = null;
    let closeTime = null;
    if (Array.isArray(report.ejourn)) {
        report.ejourn.forEach((entry, index) => {
            if (index === 0) openTime = entry.datetime;
            if (entry.Z1) closeTime = entry.datetime;
            if (entry.F) entry.F.forEach(item => { if (item.S) totalSum += item.S.sum; });
            if (entry.R) entry.R.forEach(item => { if (item.S) totalSum -= item.S.sum; });
        });
    }
    return { zNumber: report.Z, openTime, closeTime, totalSum };
}

function setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const reportDiv = entry.target;
                const detailsDiv = reportDiv.querySelector('.details');
                if (detailsDiv && !detailsDiv.dataset.loaded) {
                    try {
                        const reportData = JSON.parse(reportDiv.dataset.reportData);
                        if (Array.isArray(reportData.ejourn)) {
                            renderReportDetails(detailsDiv, reportData.ejourn);
                            detailsDiv.dataset.loaded = 'true';
                        }
                    } catch (e) {
                        detailsDiv.innerHTML = '<p style="color:red">Помилка завантаження деталей.</p>';
                    }
                    obs.unobserve(reportDiv);
                }
            }
        });
    }, { threshold: 0.05 });

    document.querySelectorAll('.report').forEach(report => observer.observe(report));
}

function renderReportDetails(detailsContainer, ejourn) {
    const filteredEntries = ejourn.filter(entry => entry.F || entry.R);
    if (filteredEntries.length === 0) {
        detailsContainer.innerHTML = '<p>Немає транзакцій для відображення.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'details-table';
    table.innerHTML = `<thead><tr><th>Тип</th><th>Номер</th><th>Дата та час</th><th>Сума</th><th>Деталі</th></tr></thead>`;
    
    const tbody = document.createElement('tbody');
    filteredEntries.forEach(entry => {
        const entryType = entry.F ? 'Продаж' : 'Повернення';
        const entrySum = (entry.F || entry.R).reduce((sum, item) => sum + (item.S?.sum ?? 0), 0);

        const headerRow = document.createElement('tr');
        headerRow.className = 'check-header-row';
        headerRow.innerHTML = `
            <td>${entryType}</td>
            <td>${entry.no ?? entry.DI ?? '—'}</td>
            <td>${formatDateTime(entry.datetime)}</td>
            <td>${entrySum.toFixed(2)} грн</td>
            <td><span class="toggle-icon small">+</span> Деталі</td>
        `;
        
        const detailsRow = document.createElement('tr');
        detailsRow.className = 'check-details-row';
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 5;
        detailsCell.innerHTML = `<div class="check-details-content">${renderEntryDetailsContent(entry)}</div>`;
        detailsRow.appendChild(detailsCell);

        tbody.appendChild(headerRow);
        tbody.appendChild(detailsRow);
    });
    
    table.appendChild(tbody);
    detailsContainer.appendChild(table);
}

function renderEntryDetailsContent(entry) {
    const itemsArray = entry.F || entry.R || [];
    const items = itemsArray.filter(item => item.S);
    const payments = itemsArray.filter(item => item.P);
    
    let contentHTML = '<strong>Товари:</strong><br>';
    if (items.length === 0) {
        contentHTML += '<em>Товари відсутні.</em>';
    } else {
        const taxGroupMap = { 1: 'A', 2: 'Б', 3: 'В', 4: 'Г', 5: 'Д', 0: 'E' };
        items.forEach(item => {
            const product = item.S;
            const taxGroup = taxGroupMap[product.tax] ?? 'N/A';
            const exciseStamps = (product.excise?.map(s => s.stamp).join(', ') || '—');
            contentHTML += `
                <div class="check-item">
                    <strong>Назва:</strong> ${product.name || '—'} (${product.code || '—'})<br>
                    <strong>Кільк.:</strong> ${product.qty || 0} ${product.unit_name || 'шт.'} x ${(product.price ?? 0).toFixed(2)} грн = <strong>${(product.sum ?? 0).toFixed(2)} грн</strong><br>
                    <strong>Штрихкод:</strong> ${product.barcode || '—'} | <strong>УКТЗЕД:</strong> ${product.uktzed || '—'} | <strong>Подат. гр.:</strong> ${taxGroup}<br>
                    <strong>Акцизна марка:</strong> ${exciseStamps}<br>
                </div>`;
        });
    }

    if (payments.length > 0) {
        contentHTML += '<div class="payment-details"><strong>Оплата:</strong><br>';
        payments.forEach(p => {
            const payment = p.P;
            if (payment) {
                contentHTML += `Тип: ${getPaymentTypeText(payment.no)}, Сума: ${payment.sum?.toFixed(2) ?? 'N/A'}`;
                if (payment.change) contentHTML += `, Решта: ${payment.change.toFixed(2)}`;
                if (payment.card_mask) contentHTML += `, Картка: ${payment.card_mask}`;
                contentHTML += '<br>';
            }
        });
        contentHTML += '</div>';
    }
    return contentHTML;
}


/**
 * Рендерить таблицю звіту по товарах, тепер очікуючи об'єкт з даними.
 * @param {Object} reportData - Об'єкт, що містить { groupedData, paymentSummary }.
 */
export function renderProductReportTable(reportData) {
    reportResultContainerEl.innerHTML = '';
    
    // --- ЗМІНА: Розпаковуємо дані з об'єкта ---
    const { groupedData, paymentSummary } = reportData;

    if (!groupedData || groupedData.length === 0) {
        reportResultContainerEl.innerHTML = '<p>Немає даних за вашими фільтрами.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'product-report-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
        <th class="col-toggle"></th>
        <th class="col-code">Код товару</th>
        <th class="col-name">Назва</th>
        <th class="col-qty">Заг. кількість</th>
        <th class="col-sum">Заг. сума</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let totalNetSum = 0;

    groupedData.forEach(group => {
        const groupHeaderRow = document.createElement('tr');
        groupHeaderRow.className = 'product-group-header';
        groupHeaderRow.dataset.productCode = group.productCode;
        groupHeaderRow.innerHTML = `
            <td class="col-toggle"><span class="toggle-icon">+</span></td>
            <td class="col-code">${group.productCode}</td>
            <td class="col-name">${group.productName}</td>
            <td class="col-qty">${group.totalQty.toFixed(3)}</td>
            <td class="col-sum">${group.totalSum.toFixed(2)}</td>
        `;
        tbody.appendChild(groupHeaderRow);

        const groupDetailsRow = document.createElement('tr');
        groupDetailsRow.className = 'product-group-details';
        groupDetailsRow.style.display = 'none';
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 5;
        detailsCell.appendChild(createDetailsTable(group.transactions));
        groupDetailsRow.appendChild(detailsCell);
        tbody.appendChild(groupDetailsRow);

        totalNetSum += group.totalSum;
    });

    // --- ЗМІНА: Створюємо новий tfoot з розширеними підсумками ---
    const tfoot = document.createElement('tfoot');
    
    // Додаємо підсумки по типах оплати
    const paymentTypes = Object.keys(paymentSummary).sort();
    if (paymentTypes.length > 0) {
        const headerRow = document.createElement('tr');
        headerRow.className = 'payment-summary-row';
        headerRow.innerHTML = `<td colspan="5" style="text-align:center; font-weight:bold; background-color: #f5f5f5;">Підсумки за типом оплати</td>`;
        tfoot.appendChild(headerRow);

        for (const type of paymentTypes) {
            const summary = paymentSummary[type];
            const netSum = summary.sales - summary.returns;
            const summaryRow = document.createElement('tr');
            summaryRow.className = 'payment-summary-row';
            summaryRow.innerHTML = `
                <td colspan="2"></td>
                <td><strong>${type}</strong></td>
                <td>Продажі: ${summary.sales.toFixed(2)}</td>
                <td>Повернення: ${summary.returns.toFixed(2)} | <strong>Разом: ${netSum.toFixed(2)}</strong></td>
            `;
            tfoot.appendChild(summaryRow);
        }
    }

    // Додаємо загальний підсумок
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    totalRow.innerHTML = `
        <td colspan="4" style="text-align: right; font-weight: bold;">Загальний підсумок по звіту:</td>
        <td class="col-sum">${totalNetSum.toFixed(2)}</td>
    `;
    tfoot.appendChild(totalRow);
    
    table.appendChild(tbody);
    table.appendChild(tfoot);
    reportResultContainerEl.appendChild(table);
}

function createDetailsTable(transactions) {
    const detailsTable = document.createElement('table');
    detailsTable.className = 'details-subtable';

    detailsTable.innerHTML = `<thead>
        <tr>
            <th class="dt-col-type">Тип</th>
            <th class="dt-col-num">Чек №</th>
            <th class="dt-col-datetime">Дата та час</th>
            <th class="dt-col-barcode">Штрих-код</th>
            <th class="dt-col-uktzed">УКТЗЕД</th>
            <th class="dt-col-tax">Ставка</th>
            <th class="dt-col-qty">К-сть</th>
            <th class="dt-col-price">Ціна</th>
            <th class="dt-col-sum">Сума</th>
            <th class="dt-col-discount">Знижка</th>
            <th class="dt-col-payment">Тип оплати</th>
        </tr>
    </thead>`;
    
    const detailsBody = document.createElement('tbody');
    transactions.forEach(trx => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="dt-col-type">${trx.checkType}</td>
            <td class="dt-col-num">${trx.receiptNumber}</td>
            <td class="dt-col-datetime">${formatDateTime(trx.dateTime)}</td>
            <td class="dt-col-barcode">${trx.barcode}</td>
            <td class="dt-col-uktzed">${trx.uktzed}</td>
            <td class="dt-col-tax">${trx.tax}</td>
            <td class="dt-col-qty">${trx.quantity}</td>
            <td class="dt-col-price">${trx.price.toFixed(2)}</td>
            <td class="dt-col-sum">${trx.sum.toFixed(2)}</td>
            <td class="dt-col-discount">${trx.discount.toFixed(2)}</td>
            <td class="dt-col-payment">${trx.paymentType}</td>
        `;
        detailsBody.appendChild(row);
    });

    detailsTable.appendChild(detailsBody);
    return detailsTable;
}