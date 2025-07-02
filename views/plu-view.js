import { showConfirmationModal, openPluFlagsModal } from '../modal-handlers.js';

let currentlySelectedRRO;
let showNotification;
let pluDataCache = [];
let pluChanges = { deleted: new Set() };

let sortConfig = { key: 'Code', direction: 'asc' };
let isBarcodeSupported = true;

let columnWidths = {};
const DEFAULT_WIDTHS = {
    'col-checkbox': '40px', 'col-code': '100px', 'col-name': '3fr',
    'col-price': '100px', 'col-dep': '80px', 'col-grp': '80px',
    'col-tax': '80px', 'col-qty': '90px', 'col-flg': '90px',
    'col-uktzed': '120px', 'col-barcode': '150px'
};

const PLU_FLAGS = [
    { label: 'ціна може змінюватись', value: 1 }, { label: 'вагова кількість', value: 2 },
    { label: 'слідкувати за залишком', value: 4 }, { label: 'завершувати чек', value: 16 },
    { label: 'тільки повернення', value: 32 }, { label: 'повернення заборонене', value: 64 },
    { label: 'акцизна марка', value: 128 }, { label: 'друкувати штрих-код в чекові', value: 256 }
];


export async function renderPluView(container, rro, notificationFunc) {
    currentlySelectedRRO = rro;
    showNotification = notificationFunc;

    container.innerHTML = `
        <div class="plu-view-wrapper">
            <header class="plu-header">
                <h1>Керування товарами (PLU)</h1>
                <div class="plu-main-actions">
                    <button id="pluFetchBtn" class="action-button secondary" title="Завантажити...">Завантажити з РРО</button>
                    <div class="save-options">
                        <input type="checkbox" id="pluIncludeBarcode" checked>
                        <label for="pluIncludeBarcode">Враховувати штрих-код</label>
                    </div>
                    <button id="pluSaveChangesBtn" class="action-button accent" title="Записати...">Зберегти в РРО</button>
                </div>
            </header>
            <div class="plu-controls">
                <div class="search-group">
                    <input type="text" id="pluSearchInput" placeholder="Пошук...">
                    <span id="pluSearchClear" class="clear-search-btn">×</span>
                </div>
                <div class="plu-buttons-container">
                    <div class="plu-buttons-group">
                        <button id="pluAddItemBtn" class="action-button" title="Додати...">Додати</button>
                        <button id="pluDeleteBtn" class="action-button secondary" title="Видалити...">Видалити</button>
                    </div>
                    <div class="plu-buttons-group">
                        <button id="pluImportBtn" class="action-button" title="Імпорт...">Імпорт</button>
                        <button id="pluExportBtn" class="action-button" title="Експорт...">Експорт</button>
                    </div>
                </div>
            </div>
            <div class="plu-table-container">
                <table id="plu-table">
                    <thead><tr>
                        <th class="col-checkbox"><input type="checkbox" id="pluSelectAll" title="Вибрати все"></th>
                        <th class="col-code sortable" data-sort-key="Code">Код</th>
                        <th class="col-name">Назва</th>
                        <th class="col-price">Ціна</th>
                        <th class="col-dep">Відділ</th>
                        <th class="col-grp">Група</th>
                        <th class="col-tax">ПДВ гр.</th>
                        <th class="col-qty">К-сть</th>
                        <th class="col-flg">Прапорці</th>
                        <th class="col-uktzed">Код УКТ ЗЕД</th>
                        <th class="col-barcode barcode-col">Штрих-код</th>
                    </tr></thead>
                    <tbody id="plu-table-body"><tr><td colspan="11" class="empty-state">Натисніть "Завантажити з РРО"</td></tr></tbody>
                </table>
            </div>
        </div>`;
    
    await loadColumnWidths();
    setupPluEventListeners(container);
    initializeColumnResizing(container.querySelector('#plu-table'));
    renderPluTable();
}

async function loadColumnWidths() {
    const savedWidths = await window.electron.getPluColumnWidths();
    columnWidths = { ...DEFAULT_WIDTHS, ...savedWidths };
}

async function saveColumnWidths() {
    await window.electron.savePluColumnWidths(columnWidths);
}

function applyColumnWidths() {
    const table = document.getElementById('plu-table');
    if (!table) return;
    const visibleHeaders = Array.from(table.querySelectorAll('thead th')).filter(th => !(!isBarcodeSupported && th.classList.contains('barcode-col')));
    const gridTemplateColumns = visibleHeaders.map(th => {
        const colClass = th.classList[0];
        return columnWidths[colClass] || 'min-content';
    }).join(' ');
    table.style.gridTemplateColumns = gridTemplateColumns;
}

function initializeColumnResizing(table) {
    const headers = table.querySelectorAll('thead th');
    headers.forEach((header, index) => {
        if (index === headers.length - 1) return;
        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        header.appendChild(resizer);
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.pageX;
            const startWidth = header.offsetWidth;
            const colClass = header.classList[0];
            const handleMouseMove = (moveEvent) => {
                const newWidth = startWidth + (moveEvent.pageX - startX);
                if (newWidth > 40) {
                    columnWidths[colClass] = `${newWidth}px`;
                    applyColumnWidths();
                }
            };
            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                saveColumnWidths();
            };
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    });
}

function setupPluEventListeners(container) {
    document.getElementById('pluFetchBtn').addEventListener('click', fetchPluFromRro);
    document.getElementById('pluAddItemBtn').addEventListener('click', addNewPluItem);
    document.getElementById('pluDeleteBtn').addEventListener('click', deleteSelectedPluItems);
    document.getElementById('pluSaveChangesBtn').addEventListener('click', savePluChangesToRro);
    document.getElementById('pluSelectAll').addEventListener('change', (e) => {
        document.querySelectorAll('#plu-table .plu-row-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    document.getElementById('pluImportBtn').addEventListener('click', importPluFromExcel);
    document.getElementById('pluExportBtn').addEventListener('click', exportPluToExcel);
    const searchInput = document.getElementById('pluSearchInput');
    const clearBtn = document.getElementById('pluSearchClear');
    searchInput.addEventListener('input', () => {
        clearBtn.style.display = searchInput.value ? 'block' : 'none';
        renderPluTable(searchInput.value);
    });
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderPluTable('');
        searchInput.focus();
    });
    container.querySelector('.sortable[data-sort-key="Code"]').addEventListener('click', (e) => {
        if (e.target.classList.contains('col-resizer')) return;
        const key = e.currentTarget.dataset.sortKey;
        if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
        }
        sortPluData();
        renderPluTable(searchInput.value);
    });
    
    container.addEventListener('click', (e) => {
        if (e.target.matches('.flags-helper-icon')) {
            const targetInput = e.target.closest('.flags-cell-wrapper').querySelector('input');
            openPluFlagsModal(targetInput);
        }
    });
    
    container.addEventListener('input', (e) => {
        if (e.target.matches('.plu-cell')) {
            const row = e.target.closest('.plu-row');
            const originalCode = row.dataset.code;
            const field = e.target.dataset.field;
            let value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
            if (e.target.type === 'number' && isNaN(value)) { value = e.target.value; }
            const itemIndex = pluDataCache.findIndex(i => i.Code.toString() === originalCode);
            if (itemIndex !== -1) {
                pluDataCache[itemIndex][field] = value;
                if (field === 'Code') { row.dataset.code = value.toString(); }
                e.target.classList.remove('invalid-input');
            }
        }
    });
}

function sortPluData() {
    pluDataCache.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateTableView() {
    const table = document.getElementById('plu-table');
    if (!table) return;
    const includeBarcodeCheckbox = document.getElementById('pluIncludeBarcode');
    if (includeBarcodeCheckbox) {
        if (isBarcodeSupported) {
            includeBarcodeCheckbox.disabled = false;
        } else {
            includeBarcodeCheckbox.disabled = true;
            includeBarcodeCheckbox.checked = false;
        }
    }
    applyColumnWidths();
    table.querySelectorAll('th.sortable').forEach(th => {
        th.removeAttribute('data-sort-dir');
    });
    const activeSorter = table.querySelector(`th[data-sort-key="${sortConfig.key}"]`);
    if (activeSorter) {
        activeSorter.setAttribute('data-sort-dir', sortConfig.direction);
    }
    const display = isBarcodeSupported ? '' : 'none';
    table.querySelectorAll('.barcode-col').forEach(col => {
        col.style.display = display;
    });
}

async function fetchPluFromRro() {
    if (!currentlySelectedRRO) return showNotification('Оберіть РРО.', 'error');
    if (Object.values(pluChanges).some(s => s.size > 0)) {
        const confirmed = await showConfirmationModal('Оновити дані з РРО? Незбережені зміни будуть втрачені.', 'Підтвердження');
        if (!confirmed) return;
    }
    showNotification('Завантаження товарів з РРО...', 'info');
    try {
        pluDataCache = await window.electron.getPlu(currentlySelectedRRO) || [];
        pluChanges = { deleted: new Set() };
        isBarcodeSupported = pluDataCache.length > 0 && pluDataCache[0].BarCode !== undefined;
        sortPluData();
        renderPluTable();
        showNotification(`Завантажено ${pluDataCache.length} товарів.`, 'success');
    } catch(error) { showNotification(`Помилка завантаження товарів: ${error.message}`, 'error'); }
}

function renderPluTable(searchTerm = '') {
    const tableBody = document.querySelector('#plu-table-body');
    if (!tableBody) return;
    updateTableView();

    const lowerSearchTerm = searchTerm.toLowerCase();
    const filteredData = searchTerm 
        ? pluDataCache.filter(item => 
            (item.Name ?? '').toLowerCase().includes(lowerSearchTerm) || 
            (item.Code ?? '').toString().toLowerCase().includes(lowerSearchTerm))
        : pluDataCache;
    
    const colspan = isBarcodeSupported ? 11 : 10;
    if (pluDataCache.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">Список товарів порожній.</td></tr>`;
        return;
    }
    if (filteredData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">Товарів за вашим запитом не знайдено.</td></tr>`;
        return;
    }
    
    tableBody.innerHTML = filteredData.map(item => {
        const codeStr = item.Code.toString();
        const rowClass = pluChanges.deleted.has(codeStr) ? 'plu-row row-deleted' : 'plu-row';
        const barcodeCell = isBarcodeSupported ? `<td class="col-barcode barcode-col"><input type="text" value="${item.BarCode ?? '0'}" class="plu-cell" data-field="BarCode"></td>` : '';
        return `<tr data-code="${codeStr}" class="${rowClass}">
            <td class="col-checkbox"><input type="checkbox" class="plu-row-checkbox"></td>
            <td class="col-code"><input type="number" value="${item.Code}" class="plu-cell" data-field="Code"></td>
            <td class="col-name"><input type="text" value="${item.Name ?? ''}" class="plu-cell" data-field="Name"></td>
            <td class="col-price"><input type="number" step="0.01" value="${item.Price ?? 0}" class="plu-cell" data-field="Price"></td>
            <td class="col-dep"><input type="number" value="${item.Dep ?? 1}" class="plu-cell" data-field="Dep"></td>
            <td class="col-grp"><input type="number" value="${item.Grp ?? 1}" class="plu-cell" data-field="Grp"></td>
            <td class="col-tax"><input type="number" value="${item.Tax ?? 1}" class="plu-cell" data-field="Tax"></td>
            <td class="col-qty"><input type="number" step="0.001" value="${item.Qty ?? 0}" class="plu-cell" data-field="Qty"></td>
            <td class="col-flg">
                <div class="flags-cell-wrapper">
                    <input type="number" value="${item.Flg ?? 0}" class="plu-cell" data-field="Flg">
                    <span class="flags-helper-icon" title="Налаштувати прапорці">⚙️</span>
                </div>
            </td>
            <td class="col-uktzed"><input type="text" value="${item.UktZed ?? '0'}" class="plu-cell" data-field="UktZed"></td>
            ${barcodeCell}
        </tr>`;
    }).join('');
}

function addNewPluItem() {
    const existingCodes = new Set(pluDataCache.map(item => item.Code));
    let newCode = 1;
    while (existingCodes.has(newCode)) { newCode++; }
    const newItem = { Code: newCode, Name: 'Новий товар', Price: 0, Dep: 1, Grp: 1, Tax: 1, Qty: 0, Flg: 0, UktZed: '0' };
    if (isBarcodeSupported) { newItem.BarCode = '0'; }
    pluDataCache.unshift(newItem);
    renderPluTable(document.getElementById('pluSearchInput').value);
    const newRow = document.querySelector(`tr[data-code='${newCode}']`);
    if (newRow) {
        newRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newRow.querySelector('input[data-field="Name"]').focus();
    }
}

async function deleteSelectedPluItems() {
    const selectedCheckboxes = document.querySelectorAll('.plu-row-checkbox:checked');
    if (selectedCheckboxes.length === 0) return showNotification('Оберіть товари для видалення.', 'info');
    selectedCheckboxes.forEach(cb => {
        const row = cb.closest('.plu-row');
        const code = row.dataset.code;
        pluChanges.deleted.add(code);
        row.classList.add('row-deleted');
        cb.checked = false;
    });
    const selectAllCheckbox = document.getElementById('pluSelectAll');
    if (selectAllCheckbox) { selectAllCheckbox.checked = false; }
    showNotification(`${selectedCheckboxes.length} товар(ів) позначено на видалення.`, 'info');
}

function validatePluData(dataToValidate) {
    let isValid = true;
    document.querySelectorAll('.plu-cell.invalid-input').forEach(el => el.classList.remove('invalid-input'));
    for (const item of dataToValidate) {
        const row = document.querySelector(`.plu-row[data-code='${item.Code}']`);
        if (!row) continue;
        const fieldsToValidate = ['Name', 'Code', 'Price', 'Dep', 'Grp', 'Tax', 'UktZed'];
        if (isBarcodeSupported && document.getElementById('pluIncludeBarcode').checked) {
             fieldsToValidate.push('BarCode');
        }
        for (const fieldName of fieldsToValidate) {
            const value = item[fieldName];
            const inputElement = row.querySelector(`input[data-field='${fieldName}']`);
            if (value == null || value.toString().trim() === '') {
                isValid = false;
                if (inputElement) inputElement.classList.add('invalid-input');
            }
        }
    }
    return isValid;
}

// --- ЗМІНА: Додано функції для оверлею та оновлено логіку збереження ---

function showSavingOverlay(message) {
    const wrapper = document.querySelector('.plu-view-wrapper');
    if (!wrapper) return;

    // Блокуємо всі кнопки
    document.querySelectorAll('.plu-header button, .plu-controls button').forEach(btn => btn.disabled = true);

    const overlay = document.createElement('div');
    overlay.className = 'plu-overlay';
    overlay.innerHTML = `
        <div class="spinner"></div>
        <p>${message}</p>
    `;
    wrapper.style.position = 'relative'; // Необхідно для абсолютного позиціонування
    wrapper.appendChild(overlay);
}

function hideSavingOverlay() {
    const overlay = document.querySelector('.plu-overlay');
    if (overlay) {
        overlay.remove();
    }
    // Розблоковуємо кнопки
    document.querySelectorAll('.plu-header button, .plu-controls button').forEach(btn => btn.disabled = false);
}


async function savePluChangesToRro() {
    if (!currentlySelectedRRO) return showNotification('Оберіть РРО.', 'error');
    
    const includeBarcode = document.getElementById('pluIncludeBarcode').checked;
    const dataToSend = pluDataCache.filter(item => !pluChanges.deleted.has(item.Code.toString()));
    const codes = new Set();
    
    for (const item of dataToSend) {
        if (codes.has(item.Code)) {
            showNotification(`Помилка: дублікат коду товару "${item.Code}".`, 'error');
            document.querySelectorAll(`.plu-row[data-code='${item.Code}'] input[data-field='Code']`).forEach(el => el.classList.add('invalid-input'));
            return;
        }
        codes.add(item.Code);
    }
    
    if (!validatePluData(dataToSend)) {
        return showNotification('Помилка валідації! Перевірте виділені поля.', 'error');
    }

    let dataForRRO = dataToSend;
    if (!includeBarcode) {
        dataForRRO = dataToSend.map(({ BarCode, ...rest }) => rest);
    }
    
    const confirmed = await showConfirmationModal(`УВАГА! Це повністю перезапише таблицю товарів на РРО (${dataForRRO.length} позицій). Продовжити?`, 'Повне оновлення товарів');
    if (!confirmed) return;

    showSavingOverlay('Збереження змін на РРО... Будь ласка, зачекайте.');

    try {
        await window.electron.updatePlu(currentlySelectedRRO, dataForRRO);
        showNotification('Таблицю товарів успішно оновлено!', 'success');
        // Після успішного збереження, очищаємо кеш змін і перезавантажуємо дані
        pluChanges.deleted.clear();
        await fetchPluFromRro(); 
    } catch (error) {
        showNotification(`Помилка збереження товарів: ${error.message}`, 'error');
    } finally {
        hideSavingOverlay();
    }
}

async function exportPluToExcel() {
    if (pluDataCache.length === 0) return showNotification('Немає товарів для експорту.', 'info');
    showNotification('Підготовка файлу для експорту...', 'info');
    const dataToExport = isBarcodeSupported ? pluDataCache : pluDataCache.map(({ BarCode, ...rest }) => rest);
    const result = await window.electron.exportPluToExcel(dataToExport);
    if (result.success) {
        showNotification(`Товари успішно експортовано у файл: ${result.path}`, 'success');
    } else if (result.error !== 'Експорт скасовано') {
        showNotification(`Помилка експорту: ${result.error}`, 'error');
    }
}

async function importPluFromExcel() {
    const confirmed = await showConfirmationModal('УВАГА! Дані з файлу замінять поточний список у програмі. Продовжити?', 'Імпорт товарів з Excel');
    if (!confirmed) return;
    const result = await window.electron.importPluFromExcel();
    if (result.success) {
        pluDataCache = result.data.map(item => ({
            ...item, Code: parseInt(item.Code, 10), Price: parseFloat(item.Price),
            Dep: parseInt(item.Dep, 10), Grp: parseInt(item.Grp, 10), Tax: parseInt(item.Tax, 10),
            Qty: parseFloat(item.Qty), Flg: parseInt(item.Flg, 10),
        }));
        pluChanges = { deleted: new Set() };
        isBarcodeSupported = pluDataCache.length > 0 && result.data.some(d => d.BarCode !== undefined);
        sortPluData();
        renderPluTable();
        showNotification(`Імпортовано ${result.data.length} товарів. Не забудьте зберегти зміни на РРО.`, 'success');
    } else if (result.error !== 'Імпорт скасовано') {
        showNotification(`Помилка імпорту: ${result.error}`, 'error');
    }
}