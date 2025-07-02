const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    // --- Керування конфігураціями РРО ---
    loadRROConfigs: () => ipcRenderer.invoke('load-rro-configs'),
    saveRROConfigs: (configs) => ipcRenderer.invoke('save-rro-configs', configs),
    
    // --- Керування сесією ---
    saveSelectedRROId: (rroId) => ipcRenderer.invoke('save-selected-rro-id', rroId),
    getSelectedRROId: () => ipcRenderer.invoke('get-selected-rro-id'),

    // --- Робота з РРО ---
    sendRRORequest: (rroDetails, requestPath, method, data) => ipcRenderer.invoke('send-rro-request', rroDetails, requestPath, method, data),
    fetchKsefFromRro: (rroDetails, startZ, endZ) => ipcRenderer.invoke('fetch-ksef-from-rro', rroDetails, startZ, endZ),
    fetchKsefByDate: (rroDetails, startDate, endDate) => ipcRenderer.invoke('fetch-ksef-by-date', rroDetails, startDate, endDate),

    // --- Робота з локальною бібліотекою КСЕФ ---
    getKsefLibrary: () => ipcRenderer.invoke('get-ksef-library'),
    saveKsefFile: (filename, data) => ipcRenderer.invoke('save-ksef-file', filename, data),
    deleteKsefFile: (filename) => ipcRenderer.invoke('delete-ksef-file', filename),

    // --- Відкриття вікон ---
    openJournalViewer: (filePath) => ipcRenderer.invoke('open-journal-viewer', filePath),

    // --- Загальні налаштування ---
    getKsefPath: () => ipcRenderer.invoke('get-ksef-path'),
    setKsefPath: () => ipcRenderer.invoke('set-ksef-path'),

    // --- Робота з товарами (PLU) ---
    getPlu: (rroDetails) => ipcRenderer.invoke('get-plu', rroDetails),
    updatePlu: (rroDetails, pluData) => ipcRenderer.invoke('update-plu', rroDetails, pluData),

    // === ФУНКЦІЇ ДЛЯ EXCEL ===
    exportPluToExcel: (pluData) => ipcRenderer.invoke('export-plu-to-excel', pluData),
    importPluFromExcel: () => ipcRenderer.invoke('import-plu-from-excel'),
    
    // === ФУНКЦІЇ ВИЯВЛЕННЯ ===
    discoverRROs: () => ipcRenderer.invoke('discover-rros'),

    // === НОВІ ФУНКЦІЇ ДЛЯ НАЛАШТУВАНЬ ТАБЛИЦІ ===
    getPluColumnWidths: () => ipcRenderer.invoke('get-plu-column-widths'),
    savePluColumnWidths: (widths) => ipcRenderer.invoke('save-plu-column-widths', widths),

    // --- Функції для вікна перегляду ---
    readJournalFile: (filePath) => ipcRenderer.invoke('read-journal-file', filePath),
    getBasename: (filePath) => ipcRenderer.invoke('get-basename', filePath),
    onJournalLoad: (callback) => ipcRenderer.on('load-journal-from-path', (event, ...args) => callback(...args)),

    // --- Функції для прогрес-бару ---
    onKsefProgress: (callback) => {
        const subscription = (event, ...args) => callback(...args);
        ipcRenderer.on('ksef-download-progress', subscription);
        return () => ipcRenderer.removeListener('ksef-download-progress', subscription);
    },

    // --- ЗМІНА: Додано функції для налаштувань звуку ---
    getSoundSettings: () => ipcRenderer.invoke('get-sound-settings'),
    saveSoundSettings: (settings) => ipcRenderer.invoke('save-sound-settings', settings),

        // --- ЗМІНА: Додано канали для оновлень ---
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    restartApp: () => ipcRenderer.send('restart-app'),
});