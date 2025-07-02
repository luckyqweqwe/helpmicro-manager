/**
 * Форматує мітку часу Unix у локалізований рядок дати та часу.
 * @param {number} timestamp - Мітка часу Unix в секундах.
 * @returns {string} - Відформатований рядок або 'Невідома дата'.
 */
export function formatDateTime(timestamp) {
    if (!timestamp) {
        return 'Невідома дата';
    }
    return new Date(timestamp * 1000).toLocaleString('uk-UA');
}

/**
 * Повертає текстову назву типу оплати за її номером.
 * @param {number} paymentNo - Номер типу оплати.
 * @returns {string} - Назва типу оплати або 'Невідомий'.
 */
export function getPaymentTypeText(paymentNo) {
    const paymentTypes = {
        1: 'Готівкою',
        2: 'Чеком',
        3: 'Кредит',
        4: 'Картка'
    };
    return paymentTypes[paymentNo] || 'Невідомий';
}

/**
 * Отримує мітку часу Unix з елемента введення дати.
 * @param {HTMLInputElement} inputElement - Елемент input[type="date"].
 * @param {boolean} [isEndDate=false] - Якщо true, встановлює час на кінець дня.
 * @returns {number|null} - Мітка часу в секундах або null, якщо дата недійсна.
 */
export function getTimestampFromInput(inputElement, isEndDate = false) {
    const dateValue = inputElement.value;
    if (!dateValue) {
        return null;
    }
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
            return null;
        }
        if (isEndDate) {
            date.setHours(23, 59, 59, 999);
        } else {
            date.setHours(0, 0, 0, 0);
        }
        return Math.floor(date.getTime() / 1000);
    } catch {
        return null;
    }
}