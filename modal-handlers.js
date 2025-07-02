const PLU_FLAGS = [
    { label: 'ціна може змінюватись', value: 1 },
    { label: 'вагова кількість', value: 2 },
    { label: 'слідкувати за залишком', value: 4 },
    { label: 'завершувати чек', value: 16 },
    { label: 'тільки повернення', value: 32 },
    { label: 'повернення заборонене', value: 64 },
    { label: 'акцизна марка', value: 128 },
    { label: 'друкувати штрих-код в чекові', value: 256 }
];

let allRROConfigsRef;
let showNotificationRef;
let loadRROSelectorRef;
let targetFlagInput = null;

export function initializeModals(configs, notificationFunc, selectorLoaderFunc) {
    allRROConfigsRef = configs;
    showNotificationRef = notificationFunc;
    loadRROSelectorRef = selectorLoaderFunc;

    setupModalEventListeners();
    setupFormEventListeners();
    initializeFlagsModal(); 
}

function setupModalEventListeners() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
        modal.querySelector('.close')?.addEventListener('click', () => modal.classList.remove('active'));
    });

    document.getElementById('addNewRROBtn').addEventListener('click', () => {
        openEditRROModal();
    });

    document.getElementById('discoverDevicesBtn').addEventListener('click', handleDeviceDiscovery);
    
    // Обробник для "Загальні налаштування"
    document.getElementById('generalSettingsBtn').addEventListener('click', async () => {
        const modal = document.getElementById('generalSettingsModal');
        const currentPath = await window.electron.getKsefPath();
        document.getElementById('ksefPathDisplay').textContent = currentPath;
        const soundSettings = await window.electron.getSoundSettings();
        const enableSoundCheckbox = document.getElementById('enableSoundCheckbox');
        const melodySelect = document.getElementById('melodySelect');
        enableSoundCheckbox.checked = soundSettings.enabled || false;
        melodySelect.value = soundSettings.melody || 'simple';
        melodySelect.disabled = !enableSoundCheckbox.checked;
        modal.classList.add('active');
    });

    // ЗМІНА: Додано обробники для нового вікна "Про додаток"
    document.getElementById('aboutAppBtn').addEventListener('click', () => {
        document.getElementById('aboutAppModal').classList.add('active');
    });

    document.getElementById('checkForUpdateBtn').addEventListener('click', () => {
        const updateInfo = document.getElementById('update-info');
        updateInfo.textContent = 'Перевірка...';
        window.electron.checkForUpdates();
    });

    window.electron.onUpdateAvailable(() => {
        const updateInfo = document.getElementById('update-info');
        updateInfo.textContent = 'Знайдено нову версію. Завантаження...';
    });

    window.electron.onUpdateDownloaded(() => {
        const updateInfo = document.getElementById('update-info');
        updateInfo.textContent = 'Оновлення завантажено. Перезапустіть додаток, щоб встановити.';
        
        // Можна додати кнопку для перезапуску
        const restartButton = document.createElement('button');
        restartButton.textContent = 'Перезапустити зараз';
        restartButton.className = 'action-button accent';
        restartButton.style.marginTop = '10px';
        restartButton.onclick = () => window.electron.restartApp();
        updateInfo.appendChild(restartButton);
    });

    document.getElementById('changeKsefPathBtn').addEventListener('click', async () => {
        const newPath = await window.electron.setKsefPath();
        if (newPath) {
            document.getElementById('ksefPathDisplay').textContent = newPath;
            showNotificationRef('Шлях до каталогу збережено!', 'success');
        }
    });

    document.getElementById('enableSoundCheckbox').addEventListener('change', async (event) => {
        document.getElementById('melodySelect').disabled = !event.target.checked;
        await saveSoundSettings();
    });

    document.getElementById('melodySelect').addEventListener('change', async () => {
        await saveSoundSettings();
    });

    document.getElementById('settingsModal').addEventListener('click', async (e) => {
        const target = e.target;
        if (target.matches('.edit-btn[data-id]')) {
            const rro = allRROConfigsRef.find(r => r.id === target.dataset.id);
            if (rro) openEditRROModal(rro);
        } else if (target.matches('.delete-btn[data-id]')) {
            const confirmed = await showConfirmationModal('Видалити цю конфігурацію РРО?');
            if (!confirmed) return;
            
            const rroIdToDelete = target.dataset.id;
            const updatedConfigs = allRROConfigsRef.filter(r => r.id !== rroIdToDelete);
            
            try {
                await window.electron.saveRROConfigs(updatedConfigs);
                showNotificationRef('Конфігурацію видалено.', 'success');
                allRROConfigsRef.splice(0, allRROConfigsRef.length, ...updatedConfigs);
                await loadRROSelectorRef();
                renderRROConfigsList();
            } catch (error) {
                showNotificationRef(`Помилка видалення: ${error.message}`, 'error');
            }
        }
    });
}

function initializeFlagsModal() {
    const modal = document.getElementById('flagsHelperModal');
    if (!modal) {
        console.error('Modal #flagsHelperModal not found in index.html');
        return;
    }
    const container = modal.querySelector('#flags-checkbox-container');
    const totalValueEl = modal.querySelector('#flags-total-value');
    
    container.innerHTML = PLU_FLAGS.map(flag => `
        <div class="flag-item">
            <input type="checkbox" id="flag-${flag.value}" value="${flag.value}">
            <label for="flag-${flag.value}">${flag.label}</label>
        </div>
    `).join('');

    container.addEventListener('change', () => {
        let total = 0;
        container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            total += parseInt(cb.value, 10);
        });
        totalValueEl.textContent = total;
    });
    
    modal.querySelector('#applyFlagsBtn').addEventListener('click', () => {
        if (targetFlagInput) {
            const newValue = totalValueEl.textContent;
            targetFlagInput.value = newValue;
            targetFlagInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        modal.classList.remove('active');
    });
}

export function openPluFlagsModal(inputElement) {
    targetFlagInput = inputElement;
    const currentValue = parseInt(targetFlagInput.value, 10) || 0;
    
    const modal = document.getElementById('flagsHelperModal');
    const container = modal.querySelector('#flags-checkbox-container');
    const totalValueEl = modal.querySelector('#flags-total-value');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const flagValue = parseInt(cb.value, 10);
        cb.checked = (currentValue & flagValue) === flagValue;
    });

    totalValueEl.textContent = currentValue;
    modal.classList.add('active');
}

async function saveSoundSettings() {
    const settings = {
        enabled: document.getElementById('enableSoundCheckbox').checked,
        melody: document.getElementById('melodySelect').value
    };
    try {
        await window.electron.saveSoundSettings(settings);
        showNotificationRef('Налаштування звуку збережено.', 'success');
    } catch (error) {
        showNotificationRef(`Помилка збереження налаштувань: ${error.message}`, 'error');
    }
}

function setupFormEventListeners() {
    const rroEditForm = document.getElementById('rroEditForm');
    rroEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rroData = {
            id: document.getElementById('rro-id-input').value,
            name: document.getElementById('rro-name-input').value,
            address: document.getElementById('rro-address-input').value,
            port: document.getElementById('rro-port-input').value,
            username: document.getElementById('rro-username-input').value,
            password: document.getElementById('rro-password-input').value
        };

        let updatedConfigs;
        if (!rroData.id) {
            rroData.id = `rro_${Date.now()}`;
            updatedConfigs = [...allRROConfigsRef, rroData];
        } else {
            updatedConfigs = allRROConfigsRef.map(rro => rro.id === rroData.id ? rroData : rro);
        }

        try {
            await window.electron.saveRROConfigs(updatedConfigs);
            showNotificationRef('Налаштування збережено!', 'success');
            document.getElementById('editRROModal').classList.remove('active');
            allRROConfigsRef.splice(0, allRROConfigsRef.length, ...updatedConfigs);
            await loadRROSelectorRef();
            renderRROConfigsList();
        } catch (error) {
            showNotificationRef(`Помилка збереження: ${error.message}`, 'error');
        }
    });
}

export function renderRROConfigsList() {
    const container = document.getElementById('rro-configs-list-container');
    if (!container) return;
    if (allRROConfigsRef.length === 0) {
        container.innerHTML = '<p>Немає налаштованих РРО.</p>';
        return;
    }
    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr><th>Назва</th><th>Адреса</th><th>Користувач</th><th>Дії</th></tr></thead>
        <tbody>
            ${allRROConfigsRef.map(rro => `
                <tr>
                    <td>${rro.name}</td>
                    <td>${rro.address}:${rro.port}</td>
                    <td>${rro.username}</td>
                    <td class="actions">
                        <button class="edit-btn" data-id="${rro.id}">Редаг.</button>
                        <button class="delete-btn" data-id="${rro.id}">Видал.</button>
                    </td>
                </tr>
            `).join('')}
        </tbody>`;
    container.innerHTML = '';
    container.appendChild(table);
}

async function handleDeviceDiscovery() {
    const discoveryModal = document.getElementById('discoveryModal');
    const resultsList = document.getElementById('discovery-results-list');
    const discoveryStatus = document.getElementById('discovery-status');

    resultsList.innerHTML = '';
    discoveryStatus.textContent = 'Пошук пристроїв у мережі...';
    discoveryStatus.style.display = 'block';
    discoveryModal.classList.add('active');

    try {
        const devices = await window.electron.discoverRROs();
        
        if (devices.length === 0) {
            discoveryStatus.textContent = 'Пристроїв не знайдено. Перевірте підключення та налаштування брандмауера.';
        } else {
            discoveryStatus.style.display = 'none';
            devices.forEach(device => {
                const listItem = document.createElement('li');
                listItem.innerHTML = `
                    <div class="device-info">
                        <strong>IP: ${device.address}:${device.port}</strong>
                        <span>Заводський №: ${device.serial || 'N/A'}</span>
                    </div>
                    <button class="action-button small add-discovered-btn">Додати</button>
                `;
                listItem.querySelector('.add-discovered-btn').addEventListener('click', () => {
                    discoveryModal.classList.remove('active');
                    openEditRROModal(null, device);
                });
                resultsList.appendChild(listItem);
            });
        }
    } catch (error) {
        discoveryStatus.textContent = `Помилка пошуку: ${error.message}`;
        showNotificationRef(`Помилка пошуку: ${error.message}`, 'error');
    }
}

function openEditRROModal(rro = null, discoveredDevice = null) {
    const modal = document.getElementById('editRROModal');
    const title = modal.querySelector('#editRROModalTitle');
    const form = modal.querySelector('#rroEditForm');
    form.reset();

    if (rro) {
        title.textContent = 'Редагувати РРО';
        document.getElementById('rro-id-input').value = rro.id;
        document.getElementById('rro-name-input').value = rro.name;
        document.getElementById('rro-address-input').value = rro.address;
        document.getElementById('rro-port-input').value = rro.port;
        document.getElementById('rro-username-input').value = rro.username;
        document.getElementById('rro-password-input').value = rro.password;
    } else {
        title.textContent = 'Додати новий РРО';
        document.getElementById('rro-id-input').value = '';
        document.getElementById('rro-port-input').value = discoveredDevice ? discoveredDevice.port : '80';
        document.getElementById('rro-address-input').value = discoveredDevice ? discoveredDevice.address : '';
        document.getElementById('rro-name-input').value = discoveredDevice ? `РРО ${discoveredDevice.serial}` : '';
        document.getElementById('rro-username-input').value = 'service';
        document.getElementById('rro-password-input').value = '';
    }
    modal.classList.add('active');
}

export function showConfirmationModal(message, title = "Підтвердження дії") {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmationModal');
        modal.querySelector('#confirmationTitle').textContent = title;
        modal.querySelector('#confirmationMessage').textContent = message;
        const okBtn = modal.querySelector('#confirmOkBtn');
        const cancelBtn = modal.querySelector('#confirmCancelBtn');

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        const cleanup = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.classList.remove('active');
        };

        okBtn.addEventListener('click', onOk, { once: true });
        cancelBtn.addEventListener('click', onCancel, { once: true });
        modal.classList.add('active');
    });
}