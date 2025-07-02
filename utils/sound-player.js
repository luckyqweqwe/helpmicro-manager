// utils/sound-player.js

/**
 * Цей модуль є централізованим менеджером для відтворення звуків на РРО.
 * Він містить визначення мелодій та функції для їх одиночного або зацикленого відтворення.
 */

// Об'єкт з усіма мелодіями
const melodies = {
    simple: [[500, 500]],
    double: [[200, 500], [100, 0], [200, 500]],
    alarm: [[150, 800], [150, 400], [150, 800], [150, 400]],
    mario: [
        [120, 660], [120, 660], [100, 0], [120, 660], [100, 0], [120, 510], [120, 660], [100, 0], [120, 770], 
        [250, 0], [120, 380], [250, 0], [120, 510], [200, 0], [120, 380], [200, 0], [120, 320],
        [250, 0], [120, 440], [100, 0], [120, 480], [100, 0], [120, 450], [120, 430], [100, 0],
        [120, 380], [100, 0], [120, 660], [120, 760], [120, 860], [100, 0], [120, 700], [120, 760],
        [100, 0], [120, 660], [100, 0], [120, 510], [120, 580], [120, 480]
    ],
    imperial_march: [
        [350, 440], [350, 440], [350, 440], [250, 349], [150, 523], 
        [350, 440], [250, 349], [150, 523], [500, 440], [150, 0],
        [350, 659], [350, 659], [350, 659], [250, 698], [150, 523],
        [350, 415], [250, 349], [150, 523], [500, 440]
    ]
};

// Змінні для керування станом програвача
let isPlaying = false;
let stopSignal = false;

/**
 * Відтворює мелодію один раз. Використовується в меню "Функції".
 * @param {object} rro - Об'єкт з даними РРО.
 * @param {string} melodyType - Назва мелодії.
 * @param {function} showNotification - Функція для показу сповіщень.
 */
export async function playOnce(rro, melodyType, showNotification) {
    if (!rro) return showNotification('Оберіть РРО.', 'error');
    const melody = melodies[melodyType];
    if (!melody) return;

    showNotification(`Відтворення мелодії "${melodyType}"...`, 'info');

    for (const note of melody) {
        const [duration, tone] = note;
        if (tone > 0) {
            try {
                await window.electron.sendRRORequest(rro, `/cgi/proc/sound?${duration}&${tone}`, 'GET');
            } catch (error) {
                showNotification(`Помилка відтворення: ${error.message}`, 'error');
                break; 
            }
        }
        await new Promise(resolve => setTimeout(resolve, duration + 50)); 
    }
}

/**
 * Запускає відтворення мелодії у циклі. Використовується при завантаженні КСЕФ.
 * @param {object} rro - Об'єкт з даними РРО.
 * @param {string} melodyType - Назва мелодії.
 */
export async function startLoop(rro, melodyType) {
    if (isPlaying || !rro) return;
    
    const melody = melodies[melodyType];
    if (!melody) return;

    isPlaying = true;
    stopSignal = false;

    // Асинхронний цикл, щоб не блокувати основний потік
    (async () => {
        while (!stopSignal) {
            for (const note of melody) {
                if (stopSignal) break;
                const [duration, tone] = note;
                if (tone > 0) {
                    try {
                        await window.electron.sendRRORequest(rro, `/cgi/proc/sound?${duration}&${tone}`, 'GET');
                    } catch (e) {
                        console.error("Sound loop error:", e.message);
                        stopLoop(); // Зупиняємо у разі помилки
                    }
                }
                await new Promise(resolve => setTimeout(resolve, duration + 50));
            }
            // Невелика пауза між повтореннями циклу
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    })();
}

/**
 * Зупиняє відтворення мелодії у циклі.
 */
export function stopLoop() {
    if (isPlaying) {
        stopSignal = true;
        isPlaying = false;
    }
}