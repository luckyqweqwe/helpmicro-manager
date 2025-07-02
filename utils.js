// utils.js

/**
 * Форматує секунди у формат HH:MM:SS.
 * @param {number} totalSeconds - Загальна кількість секунд.
 * @returns {string} - Відформатований час.
 */
export function formatSeconds(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '—';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
}

/**
 * Розшифровує стан модема з числового значення.
 * @param {number} stateValue - Числове значення стану.
 * @returns {string} - Опис стану модема.
 */
export function decodeModemState(stateValue) {
    if (stateValue === undefined || stateValue === null) return 'Невідомо';
    const states = [];
    if (!(stateValue & (1 << 0))) states.push('SAM не виявлено'); else states.push('SAM виявлено');
    if (stateValue & (1 << 1)) states.push('SAM не пов\'язаний');
    if (stateValue & (1 << 2)) states.push('Персоналізація присутня'); else states.push('Персоналізація відсутня');
    if (stateValue & (1 << 3)) states.push('Помилка персоналізації');
    if (!(stateValue & (1 << 4))) states.push('Сховище пошкоджено'); else states.push('Сховище справне');
    if (!(stateValue & (1 << 5))) states.push('Немає мережі'); else states.push('Мережа є');
    if (stateValue & (1 << 6)) states.push('Помилка модема');
    return states.join(', ');
}