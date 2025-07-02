import { initializeModals, renderRROConfigsList, showConfirmationModal } from './modal-handlers.js';
import { renderStateView } from './views/state-view.js';
import { renderKsefView } from './views/ksef-view.js';
import { renderPluView } from './views/plu-view.js';
import { renderFunctionsView } from './views/functions-view.js';

const mainViewContainer = document.getElementById('main-view-container');
const notificationDiv = document.getElementById('notification');
const rroSelector = document.getElementById('rroSelector');
const selectedRROInfo = document.getElementById('selectedRROInfo');

let allRROConfigs = [];
let currentlySelectedRRO = null;
let currentView = 'state';
let notificationTimeout;

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupEventListeners();
    initializeModals(allRROConfigs, showNotification, loadRROSelector);
    await loadRROSelector();
    renderView(currentView);
}

function renderView(viewName) {
    document.querySelectorAll('.sidebar button[data-view]').forEach(btn => btn.classList.remove('active'));
    const activeButton = document.querySelector(`.sidebar button[data-view="${viewName}"]`);
    if (activeButton) activeButton.classList.add('active');
    
    currentView = viewName;
    const renderArgs = [mainViewContainer, currentlySelectedRRO, showNotification, showConfirmationModal];

    switch (viewName) {
        case 'state':
            renderStateView(...renderArgs);
            break;
        case 'ksef':
            renderKsefView(...renderArgs);
            break;
        case 'plu':
            renderPluView(...renderArgs);
            break;
        case 'functions':
            renderFunctionsView(...renderArgs);
            break;
    }
}

async function loadRROSelector() {
    try {
        const configs = await window.electron.loadRROConfigs();
        allRROConfigs.splice(0, allRROConfigs.length, ...configs);
        
        const lastId = await window.electron.getSelectedRROId();
        
        rroSelector.innerHTML = allRROConfigs.length === 0 
            ? '<option value="">-- Додайте конфігурацію --</option>' 
            : '<option value="">-- Оберіть РРО --</option>';

        allRROConfigs.forEach(rro => {
            rroSelector.innerHTML += `<option value="${rro.id}">${rro.name}</option>`;
        });
        
        // Пункт "Керувати РРО..." видалено звідси
        
        if (lastId && allRROConfigs.some(r => r.id === lastId)) {
            rroSelector.value = lastId;
        }
        
        updateSelectedRROInfo(rroSelector.value);
    } catch (error) {
        showNotification(`Помилка завантаження конфігурацій: ${error.message}`, 'error');
    }
}

function updateSelectedRROInfo(rroId) {
    currentlySelectedRRO = allRROConfigs.find(r => r.id === rroId) || null;
    
    const pluBtn = document.getElementById('viewPluBtn');
    const funcBtn = document.getElementById('viewFunctionsBtn');
    
    if (currentlySelectedRRO) {
        selectedRROInfo.innerHTML = `<strong>${currentlySelectedRRO.name}</strong><br>IP: ${currentlySelectedRRO.address}:${currentlySelectedRRO.port}`;
        if (pluBtn) pluBtn.disabled = false;
        if (funcBtn) funcBtn.disabled = false;
    } else {
        selectedRROInfo.innerHTML = '<p>Не обрано РРО.</p>';
        if (pluBtn) pluBtn.disabled = true;
        if (funcBtn) funcBtn.disabled = true;
    }

    window.electron.saveSelectedRROId(rroId || '');
    
    if (currentView === 'state' || currentView === 'functions' || currentView === 'plu') {
        renderView(currentView);
    }
}

function setupEventListeners() {
    document.querySelectorAll('.sidebar button[data-view]').forEach(button => {
        button.addEventListener('click', (e) => renderView(e.target.dataset.view));
    });

    // Обробник спрощено, він тепер тільки оновлює інформацію
    rroSelector.addEventListener('change', (e) => {
        updateSelectedRROInfo(e.target.value);
    });

    document.getElementById('manageConfigsBtn').addEventListener('click', () => {
        renderRROConfigsList();
        document.getElementById('settingsModal').classList.add('active');
    });
}

function showNotification(message, type = 'success') {
    if (notificationTimeout) clearTimeout(notificationTimeout);
    notificationDiv.textContent = message;
    notificationDiv.className = `notification show ${type}`;
    notificationTimeout = setTimeout(() => notificationDiv.classList.remove('show'), 4000);
}