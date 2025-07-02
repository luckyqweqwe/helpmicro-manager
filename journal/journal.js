import * as DataService from './data-service.js';
import { initializeEventListeners } from './event-handlers.js';
import { updateStatusMessage, toggleActionButtons, renderZReportList, clearProductReport } from './ui-renderer.js';

// --- Ініціалізація додатку при завантаженні сторінки ---

document.addEventListener('DOMContentLoaded', async () => {
    initializeUI();
    
    try {
        // Очікуємо на шлях до файлу від головного процесу та завантажуємо дані
        const { message, dataLength } = await DataService.initializeDataService();
        updateStatusMessage(message, false);

        if (dataLength > 0) {
            // Якщо дані завантажено, активуємо UI
            const ksefData = DataService.getKsefData();
            renderZReportList(ksefData);
            toggleActionButtons(true);
        } else {
            // Якщо даних немає, UI залишається неактивним
            toggleActionButtons(false);
        }

    } catch (error) {
        console.error("Помилка ініціалізації:", error);
        updateStatusMessage(error.message, true);
        toggleActionButtons(false);
    }
});

/**
 * Встановлює початковий стан UI.
 */
function initializeUI() {
    const today = new Date().toISOString().slice(0, 10);
    
    // Встановлюємо сьогоднішню дату в усі поля
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('startDateReport').value = today;
    document.getElementById('endDateReport').value = today;

    // Очищуємо результати та вимикаємо кнопки
    document.getElementById('dateRangeTotal').innerHTML = '';
    document.getElementById('output').innerHTML = '<p>Очікування даних від основного додатку...</p>';
    clearProductReport();
    toggleActionButtons(false);
    
    // Ініціалізуємо всі обробники подій
    initializeEventListeners();
}