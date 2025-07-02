const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const axios = require('axios');
const xlsx = require('xlsx');
const dgram = require('dgram');
const { URL } = require('url');

let store;
let mainWindow;

function getKsefReportsDir() {
    const defaultPath = path.join(app.getPath('userData'), 'ksef_reports');
    return store ? store.get('ksefReportsPath', defaultPath) : defaultPath;
}

async function ensureReportsDirExists() {
    try {
        await fs.mkdir(getKsefReportsDir(), { recursive: true });
    } catch (error) {
        console.error("Не вдалося створити директорію для звітів:", error);
    }
}

function createWindow() {
    const preloadPath = path.resolve(__dirname, 'preload.js');
    mainWindow = new BrowserWindow({
        // fullscreen: true, // Цей рядок видалено
        width: 1200, 
        height: 800, 
        minWidth: 940, 
        minHeight: 600,
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false, contextIsolation: true, sandbox: false,
        }
    });

    // ЗМІНА: Додано команду для розгортання вікна на весь екран
    mainWindow.maximize();

    mainWindow.setMenu(null);
    mainWindow.loadFile('index.html');
    
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
            mainWindow.webContents.toggleDevTools();
        }
        if (input.key === 'F5' && input.type === 'keyDown') {
            mainWindow.reload();
        }
        if (input.key === 'F11' && input.type === 'keyDown') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });
}

async function initializeApp() {
    const { default: Store } = await import('electron-store');
    store = new Store();
    setupIpcHandlers();
    await ensureReportsDirExists();
    createWindow();
}

app.whenReady().then(initializeApp);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function md5(data) { return crypto.createHash('md5').update(data).digest('hex'); }

async function performRRORequest(rroDetails, requestPath, method = 'GET', data = null, headers = {}) {
    const { address, port, username, password } = rroDetails;
    const baseUrl = (port === '80' || port === 80) ? `http://${address}` : `http://${address}:${port}`;
    const url = `${baseUrl}${requestPath}`;
    
    let options = { method, url, data, validateStatus: null, headers: {...headers} };
    if (data && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json;charset=UTF-8';
    }

    try {
        let initialResponse = await axios(options);
        if (initialResponse.status !== 401) {
             if (initialResponse.status === 200) return initialResponse.data;
             throw new Error(`HTTP error! status: ${initialResponse.status} - ${JSON.stringify(initialResponse.data) || initialResponse.statusText}`);
        }
        
        const wwwAuthHeader = initialResponse.headers['www-authenticate'];
        if (!wwwAuthHeader || !wwwAuthHeader.startsWith('Digest')) throw new Error(`Invalid Digest challenge. Status: ${initialResponse.status}`);
        const authParams = Object.fromEntries(wwwAuthHeader.substring(7).split(',').map(part => {
            const [key, val] = part.split(/=(.*)/s);
            return [key.trim(), val.trim().replace(/"/g, '')];
        }));
        const { realm, nonce, qop } = authParams;
        if (!realm || !nonce || !qop) throw new Error('Missing required Digest parameters');
        const cnonce = crypto.randomBytes(8).toString('hex');
        const nc = '00000001';
        const ha1 = md5(`${username}:${realm}:${password}`);
        const ha2 = md5(`${method}:${requestPath}`);
        const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
        options.headers['Authorization'] = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${requestPath}", algorithm=MD5, response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
        let finalResponse = await axios(options);
        if (finalResponse.status !== 200) throw new Error(`HTTP error after auth: Status ${finalResponse.status} - ${JSON.stringify(finalResponse.data)}`);
        return finalResponse.data;
    } catch (error) {
        console.error(`Error during RRO request to ${requestPath}:`, error.message);
        throw new Error(`RRO Request Failed: ${error.message}`);
    }
}

async function getSerialUnauthenticated(address, port) {
    try {
        const url = `http://${address}:${port}/cgi/dev_info`;
        const response = await axios.get(url, { timeout: 1500 });
        if (response.status === 200 && response.data && response.data.dev_zn) {
            return response.data.dev_zn;
        }
        return 'Не вдалося визначити';
    } catch (error) {
        if (error.response && error.response.status === 401) {
            return 'Потребує авторизації';
        }
        return 'Недоступний';
    }
}


function setupIpcHandlers() {
    ipcMain.handle('send-rro-request', (event, ...args) => performRRORequest(...args));
    
    ipcMain.handle('fetch-ksef-from-rro', async (event, rroDetails, startZ, endZ) => {
        const journal = [];
        const totalReports = endZ - startZ + 1;
        
        for (let i = 0; i < totalReports; i++) {
            const z = startZ + i;
            try {
                const reportData = await performRRORequest(rroDetails, `/cgi/ejournal?Z=${z}`, 'GET');
                if (reportData && reportData.Z === z && Array.isArray(reportData.ejourn) && reportData.ejourn.length > 0) {
                    journal.push(reportData);
                } else {
                    console.log(`Звіт №${z} не знайдено. Зупинка завантаження.`);
                    mainWindow.webContents.send('ksef-download-progress', {
                        current: totalReports,
                        total: totalReports,
                        text: `Завершено. Останній звіт: №${z-1}`
                    });
                    break;
                }
            } catch (error) { 
                console.error(`[ERROR] Помилка при завантаженні Z=${z}: ${error.message}`);
                break;
            }
            
            mainWindow.webContents.send('ksef-download-progress', {
                current: i + 1,
                total: totalReports,
                text: `Завантажено звіт №${z}`
            });
        }
        return journal;
    });

    ipcMain.handle('fetch-ksef-by-date', async (event, rroDetails, startDate, endDate) => {
        const fDayTable = await performRRORequest(rroDetails, '/cgi/tbl/FDay', 'GET');
        if (!Array.isArray(fDayTable)) throw new Error("Не вдалося отримати таблицю звітів (FDay) з РРО.");
        
        const reportNumbersToFetch = fDayTable.filter(r => r.Date >= startDate && r.Date <= endDate).map(r => r.id);
        if (reportNumbersToFetch.length === 0) return [];

        const journal = [];
        const totalReports = reportNumbersToFetch.length;

        for (let i = 0; i < totalReports; i++) {
            const z = reportNumbersToFetch[i];
            try {
                const reportData = await performRRORequest(rroDetails, `/cgi/ejournal?Z=${z}`, 'GET');
                if (reportData && reportData.Z === z && Array.isArray(reportData.ejourn) && reportData.ejourn.length > 0) {
                    journal.push(reportData);
                }
            } catch (error) { 
                console.error(`[ERROR] Помилка при завантаженні відфільтрованого звіту Z=${z}: ${error.message}`);
            }
             mainWindow.webContents.send('ksef-download-progress', {
                current: i + 1,
                total: totalReports,
                text: `Завантажено звіт №${z} (з ${totalReports})`
            });
        }
        return journal;
    });
    
    ipcMain.handle('load-rro-configs', async () => {
        const configPath = path.join(app.getPath('userData'), 'rro-configs.json');
        try { await fs.access(configPath); } catch { await fs.writeFile(configPath, '[]', 'utf8'); }
        return JSON.parse(await fs.readFile(configPath, 'utf8'));
    });

    ipcMain.handle('save-rro-configs', async (event, configs) => {
        const configPath = path.join(app.getPath('userData'), 'rro-configs.json');
        await fs.writeFile(configPath, JSON.stringify(configs, null, 2), 'utf8');
        return { success: true };
    });

    let currentSelectedRROId = null;
    ipcMain.handle('save-selected-rro-id', (event, rroId) => { currentSelectedRROId = rroId; });
    ipcMain.handle('get-selected-rro-id', () => currentSelectedRROId );

    ipcMain.handle('get-ksef-library', async () => {
        const ksefDir = getKsefReportsDir();
        await ensureReportsDirExists();
        const files = await fs.readdir(ksefDir);
        const fileDetails = await Promise.all(
            files.filter(f => f.endsWith('.json')).map(async (file) => {
                const stats = await fs.stat(path.join(ksefDir, file));
                return { filename: file, path: path.join(ksefDir, file), size: stats.size, createdAt: stats.birthtime };
            })
        );
        return fileDetails.sort((a, b) => b.createdAt - a.createdAt);
    });

    ipcMain.handle('save-ksef-file', async (event, filename, data) => {
        await fs.writeFile(path.join(getKsefReportsDir(), filename), JSON.stringify(data, null, 2));
        return { success: true };
    });

    ipcMain.handle('delete-ksef-file', async (event, filename) => {
        await fs.unlink(path.join(getKsefReportsDir(), filename));
        return { success: true };
    });

    ipcMain.handle('open-journal-viewer', (event, filePath) => {
        const viewerWindow = new BrowserWindow({
            width: 1200, height: 800, title: `Переглядач КСЕФ: ${path.basename(filePath)}`,
            webPreferences: { 
                preload: path.resolve(__dirname, 'preload.js'),
                nodeIntegration: false, 
                contextIsolation: true 
            }
        });
        viewerWindow.loadFile(path.join(__dirname, 'journal', 'journal-viewer.html'));
        viewerWindow.webContents.on('did-finish-load', () => viewerWindow.webContents.send('load-journal-from-path', filePath));
    });

    ipcMain.handle('read-journal-file', async (event, filePath) => {
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            return { success: true, content: fileContent };
        } catch (error) {
            console.error(`Error reading journal file: ${error}`);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-basename', (event, filePath) => {
        return path.basename(filePath);
    });
    
    ipcMain.handle('get-ksef-path', () => getKsefReportsDir());

    ipcMain.handle('set-ksef-path', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: "Оберіть каталог для збереження звітів КСЕФ", properties: ['openDirectory']
        });
        if (!canceled && filePaths.length > 0) {
            store.set('ksefReportsPath', filePaths[0]);
            return filePaths[0];
        }
        return store.get('ksefReportsPath');
    });

    ipcMain.handle('get-sound-settings', () => {
        return store.get('soundSettings', { enabled: false, melody: 'simple' });
    });

    ipcMain.handle('save-sound-settings', (event, settings) => {
        store.set('soundSettings', settings);
    });

    ipcMain.handle('get-plu', async (event, rroDetails) => {
        return await performRRORequest(rroDetails, '/cgi/tbl/PLU', 'GET');
    });

    ipcMain.handle('update-plu', async (event, rroDetails, pluData) => {
        const headers = { 'X-HTTP-Method-Override': 'PUT' };
        return await performRRORequest(rroDetails, '/cgi/tbl/PLU', 'POST', JSON.stringify(pluData), headers);
    });

    ipcMain.handle('export-plu-to-excel', async (event, pluData) => {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Експорт товарів в Excel', defaultPath: `PLU_export_${new Date().toISOString().slice(0, 10)}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });
        if (!canceled && filePath) {
            const worksheet = xlsx.utils.json_to_sheet(pluData);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Товари');
            xlsx.writeFile(workbook, filePath);
            return { success: true, path: filePath };
        }
        return { success: false, error: 'Експорт скасовано' };
    });

    ipcMain.handle('import-plu-from-excel', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Імпорт товарів з Excel', filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
            properties: ['openFile']
        });
        if (!canceled && filePaths.length > 0) {
            const workbook = xlsx.readFile(filePaths[0]);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);
            return { success: true, data: jsonData };
        }
        return { success: false, error: 'Імпорт скасовано' };
    });
    
    ipcMain.handle('discover-rros', () => {
        return new Promise((resolve) => {
            const socket = dgram.createSocket('udp4');
            const discoveredDevicesPromises = new Map();
    
            const searchTarget = 'upnp:rootdevice';
            const message = Buffer.from(
                'M-SEARCH * HTTP/1.1\r\n' +
                'HOST: 239.255.255.250:1900\r\n' +
                'MAN: "ssdp:discover"\r\n' +
                'MX: 3\r\n' +
                `ST: ${searchTarget}\r\n\r\n`
            );
    
            socket.on('message', async (msg) => {
                const response = msg.toString();
                if (response.startsWith('HTTP/1.1 200 OK')) {
                    const lines = response.split('\r\n');
                    const headers = {};
                    lines.forEach(line => {
                        const parts = line.split(':');
                        if (parts.length >= 2) {
                            const key = parts[0].trim().toUpperCase();
                            const value = parts.slice(1).join(':').trim();
                            headers[key] = value;
                        }
                    });
    
                    const serverSignature = headers.SERVER ? headers.SERVER.toLowerCase() : '';
                    if (serverSignature.includes('lw-ssdp')) {
                        if (headers.LOCATION && headers.USN && !discoveredDevicesPromises.has(headers.USN)) {
                            
                            const devicePromise = (async () => {
                                try {
                                    const locationUrl = new URL(headers.LOCATION);
                                    const serial = await getSerialUnauthenticated(locationUrl.hostname, locationUrl.port || '80');
                                    
                                    return {
                                        address: locationUrl.hostname,
                                        port: locationUrl.port || '80',
                                        serial: serial,
                                        usn: headers.USN,
                                    };
                                } catch (e) {
                                    console.error('Error processing discovered device:', e);
                                    return null;
                                }
                            })();
                            discoveredDevicesPromises.set(headers.USN, devicePromise);
                        }
                    }
                }
            });
    
            socket.on('listening', () => {
                socket.send(message, 0, message.length, 1900, '239.255.255.250', (err) => {
                    if (err) {
                        console.error('SSDP send error:', err);
                        socket.close();
                        resolve([]);
                    }
                });
            });
    
            setTimeout(async () => {
                socket.close();
                const settledDevices = await Promise.all(discoveredDevicesPromises.values());
                const validDevices = settledDevices.filter(device => device !== null);
                resolve(validDevices);
            }, 4000);
    
            socket.bind();
        });
    });

    ipcMain.handle('get-plu-column-widths', () => {
        return store.get('pluColumnWidths', {});
    });
    
    ipcMain.handle('save-plu-column-widths', (event, widths) => {
        store.set('pluColumnWidths', widths);
    });
// --- ЗМІНА: Додано обробники для оновлень ---
autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update-available');
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
});

ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});
}