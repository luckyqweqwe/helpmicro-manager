// Використовуємо API, яке було безпечно надано через preload.js.
const { readJournalFile, getBasename, onJournalLoad } = window.electron;

// Приватна змінна для зберігання даних.
let ksefData = [];

/**
 * Завантажує та обробляє дані KSEF.
 * @param {string} filePath - Повний шлях до файлу.
 * @returns {Promise<{success: boolean, message: string, dataLength: number}>} - Результат операції.
 */
async function loadAndProcessKsefFile(filePath) {
    const fileName = await getBasename(filePath);
    const result = await readJournalFile(filePath);

    if (!result.success) {
        console.error("Помилка читання файлу журналу:", result.error);
        throw new Error(`Помилка читання файлу: ${result.error}`);
    }

    try {
        const parsedData = JSON.parse(result.content);
        if (!Array.isArray(parsedData)) {
            throw new Error("Формат JSON не є масивом звітів.");
        }
        ksefData = parsedData;

        let message = `Файл "${fileName}" успішно завантажено. Звітів: ${ksefData.length}`;
        if (ksefData.length > 5000) {
            message += ". Увага: великий обсяг даних може сповільнити роботу!";
        }
        
        return {
            success: true,
            message: message,
            dataLength: ksefData.length,
        };
    } catch (parseErr) {
        console.error("Помилка парсингу JSON:", parseErr);
        throw new Error(`Помилка парсингу файлу: ${parseErr.message}`);
    }
}

/**
 * Ініціалізує прослуховувач для отримання шляху до файлу від основного процесу.
 * @returns {Promise<{success: boolean, message: string, dataLength: number}>} - Результат завантаження.
 */
export function initializeDataService() {
    return new Promise((resolve, reject) => {
        // Використовуємо прослуховувач, наданий через preload
        onJournalLoad(async (filePath) => {
            try {
                const result = await loadAndProcessKsefFile(filePath);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * Повертає всі завантажені дані KSEF.
 * @returns {Array} - Масив звітів.
 */
export function getKsefData() {
    return ksefData;
}