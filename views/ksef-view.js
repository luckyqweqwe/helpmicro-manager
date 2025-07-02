import { showConfirmationModal } from '../modal-handlers.js';
// ЗМІНА: Імпортуємо функції з нового плеєра
import { startLoop, stopLoop } from '../utils/sound-player.js';

let currentlySelectedRRO;
let showNotification;
let ksefProgressListener = null;

export function renderKsefView(container, rro, notificationFunc) {
    currentlySelectedRRO = rro;
    showNotification = notificationFunc;

    container.innerHTML = `
        <h1>Робота з КСЕФ</h1>
        <div id="progress-container"></div>
        <div class="ksef-actions">
            <div class="form-group"><label for="ksef-start-z">Звіти з №</label><input type="number" id="ksef-start-z" placeholder="1" min="1"><label for="ksef-end-z">по №</label><input type="number" id="ksef-end-z" placeholder="10" min="1"><button id="getKsefByNumBtn">Завантажити за №</button></div>
            <div class="separator"></div>
            <div class="form-group"><label for="ksef-start-date">Звіти за датою з</label><input type="date" id="ksef-start-date"><label for="ksef-end-date">по</label><input type="date" id="ksef-end-date"><button id="getKsefByDateBtn">Завантажити за датою</button></div>
        </div>
        <div class="ksef-library-container">
            <h2>Локальна бібліотека звітів</h2>
            <table id="ksef-library-table">
                <thead><tr><th>Ім'я файлу</th><th>Розмір</th><th>Дата створення</th><th>Дії</th></tr></thead>
                <tbody><tr><td colspan="4">Завантаження...</td></tr></tbody>
            </table>
        </div>
    `;

    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('ksef-start-date').value = today;
    document.getElementById('ksef-end-date').value = today;

    document.getElementById('getKsefByNumBtn').addEventListener('click', fetchKsefByNumber);
    document.getElementById('getKsefByDateBtn').addEventListener('click', fetchKsefByDate);
    
    const libraryContainer = container.querySelector('.ksef-library-container');
    libraryContainer.addEventListener('click', async (e) => {
        const target = e.target;
        if (target.matches('.edit-btn[data-path]')) {
            window.electron.openJournalViewer(target.dataset.path);
        } else if (target.matches('.delete-btn[data-filename]')) {
            const confirmed = await showConfirmationModal('Видалити цей файл звіту?');
            if (!confirmed) return;
            try {
                await window.electron.deleteKsefFile(target.dataset.filename);
                showNotification('Файл звіту видалено.', 'success');
                renderKsefLibraryTable();
            } catch (error) {
                showNotification(`Помилка видалення файлу: ${error.message}`, 'error');
            }
        }
    });

    renderKsefLibraryTable();
}

async function renderKsefLibraryTable() {
    const tableBody = document.querySelector('#ksef-library-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="4">Оновлення...</td></tr>';
    try {
        const files = await window.electron.getKsefLibrary();
        if (files.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Ваша бібліотека порожня. Завантажте звіти з РРО.</td></tr>';
            return;
        }
        tableBody.innerHTML = files.map(file => `
            <tr>
                <td>${file.filename}</td>
                <td>${(file.size / 1024).toFixed(2)} KB</td>
                <td>${new Date(file.createdAt).toLocaleString()}</td>
                <td class="actions">
                    <button class="edit-btn" data-path="${file.path}" title="Відкрити у переглядачі">Відкрити</button>
                    <button class="delete-btn" data-filename="${file.filename}" title="Видалити файл">Видалити</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="4" style="color: red;">Помилка: ${error.message}</td></tr>`;
    }
}

async function handleKsefFetch(fetchFunction, filenamePrefix) {
    if (!currentlySelectedRRO) return showNotification('Будь ласка, оберіть РРО.', 'error');
    
    const soundSettings = await window.electron.getSoundSettings();

    showNotification(`Завантаження звітів... Це може зайняти час.`, 'info');
    
    const progressContainer = document.getElementById('progress-container');
    progressContainer.innerHTML = `
        <div class="progress-bar-container">
            <div id="ksef-progress-fill" class="progress-bar-fill"></div>
            <div id="ksef-progress-text" class="progress-bar-text">Ініціалізація...</div>
        </div>
    `;
    const progressBarFill = document.getElementById('ksef-progress-fill');
    const progressBarText = document.getElementById('ksef-progress-text');

    if (ksefProgressListener) ksefProgressListener();
    
    ksefProgressListener = window.electron.onKsefProgress(progress => {
        const percentage = (progress.current / progress.total) * 100;
        if (progressBarFill) progressBarFill.style.width = `${percentage}%`;
        if (progressBarText) progressBarText.textContent = `${progress.text} (${Math.round(percentage)}%)`;
    });

    if (soundSettings.enabled) {
        startLoop(currentlySelectedRRO, soundSettings.melody);
    }

    try {
        const state = await window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/state', 'GET');
        const serial = state.serial || 'UnknownRRO';
        const journalData = await fetchFunction();

        if (journalData.length === 0) {
            showNotification('Не знайдено звітів за вказаними критеріями.', 'info');
            return;
        }

        const dateStr = new Date().toISOString().slice(0, 10);
        const defaultFilename = `${serial}_${filenamePrefix}_${dateStr}.json`;
        const finalFilename = await getFilenameFromUser(defaultFilename);

        if (!finalFilename) {
            showNotification('Збереження скасовано.', 'info');
            return;
        }

        await window.electron.saveKsefFile(finalFilename, journalData);
        showNotification('Звіти успішно завантажено та збережено!', 'success');
        renderKsefLibraryTable();
    } catch (error) {
        showNotification(`Помилка завантаження КСЕФ: ${error.message}`, 'error');
    } finally {
        stopLoop();

        progressContainer.innerHTML = '';
        if (ksefProgressListener) {
            ksefProgressListener();
            ksefProgressListener = null;
        }
    }
}


function getFilenameFromUser(defaultName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('filenameModal');
        const filenameInput = modal.querySelector('#filenameInput');
        const saveBtn = modal.querySelector('#saveFilenameBtn');
        const cancelBtn = document.getElementById('cancelFilenameBtn');
        const closeBtn = modal.querySelector('.close');

        filenameInput.value = defaultName;

        const onSave = () => { cleanup(); resolve(filenameInput.value.trim()); };
        const onCancel = () => { cleanup(); resolve(null); };

        const cleanup = () => {
            saveBtn.removeEventListener('click', onSave);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            modal.classList.remove('active');
        };

        saveBtn.addEventListener('click', onSave, { once: true });
        cancelBtn.addEventListener('click', onCancel, { once: true });
        closeBtn.addEventListener('click', onCancel, { once: true });
        modal.classList.add('active');
        filenameInput.focus();
    });
}

function fetchKsefByNumber() {
    const startZ = document.getElementById('ksef-start-z').value;
    const endZ = document.getElementById('ksef-end-z').value;
    if (!startZ || !endZ || +startZ <= 0 || +endZ < +startZ) {
        return showNotification('Введіть коректний діапазон.', 'error');
    }
    handleKsefFetch(
        () => window.electron.fetchKsefFromRro(currentlySelectedRRO, +startZ, +endZ),
        `Z${startZ}-${endZ}`
    );
}

async function fetchKsefByDate() {
    const startDateEl = document.getElementById('ksef-start-date');
    const endDateEl = document.getElementById('ksef-end-date');
    if (!startDateEl.value || !endDateEl.value) {
        return showNotification('Вкажіть обидві дати.', 'error');
    }
    const startDate = new Date(startDateEl.value);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateEl.value);
    endDate.setHours(23, 59, 59, 999);

    if (startDate > endDate) {
        return showNotification('Початкова дата не може бути пізнішою за кінцеву.', 'error');
    }

    const confirmed = await showConfirmationModal("УВАГА! Завантаження за датою може бути повільним. Продовжити?");
    if (!confirmed) return;

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    handleKsefFetch(
        () => window.electron.fetchKsefByDate(currentlySelectedRRO, startTimestamp, endTimestamp),
        `${startDateEl.value}_to_${endDateEl.value}`
    );
}