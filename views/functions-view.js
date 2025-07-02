import { showConfirmationModal } from '../modal-handlers.js';
// ЗМІНА: Імпортуємо плеєр замість того, щоб визначати його тут
import { playOnce } from '../utils/sound-player.js';

let currentlySelectedRRO;
let showNotification;

export function renderFunctionsView(container, rro, notificationFunc) {
    currentlySelectedRRO = rro;
    showNotification = notificationFunc;

    container.innerHTML = `
        <h1>Функції та звіти</h1>
        <div class="info-view-grid">
            <div class="info-block">
                <h3 class="info-block-title">Денний звіт (без обнулення)</h3>
                <p>Друк проміжного X-звіту для перевірки сум. Ця операція не закриває зміну.</p>
                <button id="printXReportBtn" class="action-button">Друк X-звіту</button>
            </div>

            <div class="info-block">
                <h3 class="info-block-title">Періодичний звіт з ФП (скорочений)</h3>
                <p>Друк скороченого звіту з фіскальної пам'яті за вказаний діапазон дат.</p>
                <div class="ksef-actions" style="padding:0; box-shadow: none;">
                    <div class="form-group"><label for="periodic-start-date">З</label><input type="date" id="periodic-start-date"></div>
                    <div class="form-group"><label for="periodic-end-date">По</label><input type="date" id="periodic-end-date"></div>
                </div>
                <button id="printPeriodicReportBtn" class="action-button" style="margin-top: 10px;">Друк звіту</button>
            </div>

            <div class="info-block">
                <h3 class="info-block-title">Подати сигнал</h3>
                <p>Відтворити звуковий сигнал або просту мелодію на пристрої.</p>
                <button id="showSoundModalBtn" class="action-button secondary">Вибрати сигнал</button>
            </div>
        </div>

        <div id="soundModal" class="modal">
            <div class="modal-content" style="width: 400px;">
                <span class="close">&times;</span>
                <h2>Виберіть мелодію</h2>
                <div class="melody-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                    <button class="action-button" data-melody="simple">Простий сигнал</button>
                    <button class="action-button" data-melody="double">Подвійний</button>
                    <button class="action-button" data-melody="alarm">Тривога</button>
                    <button class="action-button secondary" data-melody="mario">Супер Маріо</button>
                    <button class="action-button secondary" data-melody="imperial_march">Імп. марш</button>
                </div>
            </div>
        </div>
    `;

    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('periodic-start-date').value = today;
    document.getElementById('periodic-end-date').value = today;

    document.getElementById('printXReportBtn').addEventListener('click', printXReport);
    document.getElementById('printPeriodicReportBtn').addEventListener('click', printPeriodicReport);

    const modal = document.getElementById('soundModal');
    document.getElementById('showSoundModalBtn').addEventListener('click', () => {
        if (!currentlySelectedRRO) return showNotification('Оберіть РРО.', 'error');
        modal.classList.add('active');
    });

    modal.querySelector('.close').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('active');
        }
    });

    modal.querySelector('.melody-buttons').addEventListener('click', (event) => {
        const melodyType = event.target.dataset.melody;
        if (melodyType) {
            // ЗМІНА: Викликаємо функцію з нового менеджера
            playOnce(currentlySelectedRRO, melodyType, showNotification);
            modal.classList.remove('active');
        }
    });
}

async function printXReport() {
    if (!currentlySelectedRRO) return showNotification('Оберіть РРО.', 'error');
    
    const confirmed = await showConfirmationModal('Ви впевнені, що хочете роздрукувати X-звіт?');
    if (!confirmed) return;

    showNotification('Відправлення команди на друк X-звіту...', 'info');
    try {
        await window.electron.sendRRORequest(currentlySelectedRRO, '/cgi/proc/printreport?10', 'GET');
        showNotification('Команду друку X-звіту успішно надіслано!', 'success');
    } catch (error) {
        showNotification(`Помилка друку X-звіту: ${error.message}`, 'error');
    }
}

async function printPeriodicReport() {
    if (!currentlySelectedRRO) return showNotification('Оберіть РРО.', 'error');
    
    const startDate = document.getElementById('periodic-start-date').value;
    const endDate = document.getElementById('periodic-end-date').value;

    if (!startDate || !endDate) {
        return showNotification('Будь ласка, вкажіть початкову та кінцеву дати.', 'error');
    }
    if (new Date(startDate) > new Date(endDate)) {
        return showNotification('Початкова дата не може бути пізнішою за кінцеву.', 'error');
    }

    const confirmed = await showConfirmationModal(`Роздрукувати скорочений звіт за період з ${startDate} по ${endDate}?`);
    if (!confirmed) return;
    
    const requestPath = `/cgi/proc/printfmreport?3&${startDate}&${endDate}&1&1`;
    
    showNotification('Відправлення команди на друк звіту...', 'info');
    try {
        await window.electron.sendRRORequest(currentlySelectedRRO, requestPath, 'GET');
        showNotification('Команду друку звіту успішно надіслано!', 'success');
    } catch (error) {
        showNotification(`Помилка друку звіту: ${error.message}`, 'error');
    }
}

// --- ЗМІНА: Локальна функція playMelody видалена, оскільки тепер використовується sound-player.js ---