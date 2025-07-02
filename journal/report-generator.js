import { getPaymentTypeText } from './utils.js';

/**
 * Розраховує підсумки за період (короткий звіт).
 * @param {Array} ksefData - Масив звітів KSEF.
 * @param {number} startTimestamp - Початкова мітка часу.
 * @param {number} endTimestamp - Кінцева мітка часу.
 * @returns {Object} - Об'єкт з розрахованими підсумками.
 */
export function calculateDateRangeSummary(ksefData, startTimestamp, endTimestamp) {
    const totals = {
        sales: 0,
        returns: 0,
        serviceIn: 0,
        serviceOut: 0,
        discountsSales: 0,
        discountsReturns: 0,
        salesByTax: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 },
        returnsByTax: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 },
        salesExcise: { 1: 0, 2: 0, 3: 0, 4: 0 },
        returnsExcise: { 1: 0, 2: 0, 3: 0, 4: 0 }
    };

    ksefData.forEach(report => {
        if (!Array.isArray(report.ejourn)) return;

        report.ejourn.forEach(entry => {
            if (entry.datetime && entry.datetime >= startTimestamp && entry.datetime <= endTimestamp) {
                if (entry.F) { // Продаж
                    processCheckItems(entry.F, totals.salesByTax, totals.salesExcise, totals, 'sales');
                    totals.discountsSales += entry.F.find(item => item.D)?.D?.sum ?? 0;
                } else if (entry.R) { // Повернення
                    processCheckItems(entry.R, totals.returnsByTax, totals.returnsExcise, totals, 'returns');
                    totals.discountsReturns += entry.R.find(item => item.D)?.D?.sum ?? 0;
                } else if (entry.SI) { // Службове внесення
                    totals.serviceIn += entry.sum ?? 0;
                } else if (entry.SO) { // Службове винесення
                    totals.serviceOut += entry.sum ?? 0;
                }
            }
        });
    });

    return totals;
}

/**
 * Допоміжна функція для обробки товарів у чеку.
 * @private
 */
function processCheckItems(itemsArray, totalByTax, exciseByTax, globalTotals, type) {
    itemsArray?.forEach(item => {
        if (item.S) {
            const sum = item.S.sum ?? 0;
            const tax = item.S.tax;
            globalTotals[type] += sum;
            if (tax !== undefined && totalByTax.hasOwnProperty(tax)) {
                totalByTax[tax] += sum;
                if (tax >= 1 && tax <= 4) {
                    exciseByTax[tax] += sum * 0.05;
                }
            }
        }
    });
}

/**
 * Генерує звіт по товарах, групуючи їх за кодом та підбиваючи підсумки по оплатах.
 * @param {Array} ksefData - Масив звітів KSEF.
 * @param {Object} filters - Об'єкт з фільтрами.
 * @returns {Object} - Об'єкт, що містить згруповані дані та підсумки по оплатах.
 */
export function generateProductReport(ksefData, filters) {
    const groupedByCode = new Map();
    const paymentSummary = {}; // --- ЗМІНА: Об'єкт для зберігання підсумків по оплатах

    ksefData.forEach(report => {
        if (!Array.isArray(report.ejourn)) return;

        report.ejourn.forEach(entry => {
            const entryTimestamp = entry.datetime;
            if (!entryTimestamp || (filters.startDate && entryTimestamp < filters.startDate) || (filters.endDate && entryTimestamp > filters.endDate)) return;
            
            const entryType = entry.F ? 'Продаж' : (entry.R ? 'Повернення' : 'Інше');
            if (filters.checkType && entryType !== filters.checkType) return;
            if (entryType === 'Інше') return;

            const glimpseArray = entry.F || entry.R;
            const paymentItem = glimpseArray.find(item => item.P);
            const paymentTypeNo = paymentItem?.P?.no;
            const paymentTypeText = getPaymentTypeText(paymentTypeNo);

            if (filters.paymentType && filters.paymentType !== (paymentTypeNo ?? '').toString()) return;
            
            // --- ЗМІНА: Ініціалізуємо підсумок для типу оплати, якщо його ще немає ---
            if (!paymentSummary[paymentTypeText]) {
                paymentSummary[paymentTypeText] = { sales: 0, returns: 0 };
            }

            glimpseArray.forEach(item => {
                if (!item.S) return;
                
                const product = item.S;
                const productCode = product.code ?? '—';

                if ( (filters.productCode && productCode.toString().toLowerCase() !== filters.productCode) ||
                     (filters.barcode && (product.barcode ?? '') !== filters.barcode) ||
                     (filters.group && (product.grp ?? '').toString() !== filters.group) ||
                     (filters.department && (product.dep ?? '').toString() !== filters.department) ||
                     (filters.taxRate && (product.tax ?? '').toString() !== filters.taxRate)
                ) {
                    return;
                }

                // --- ЗМІНА: Додаємо суму до відповідного типу оплати ---
                if (entryType === 'Продаж') {
                    paymentSummary[paymentTypeText].sales += product.sum;
                } else {
                    paymentSummary[paymentTypeText].returns += product.sum;
                }
                
                if (!groupedByCode.has(productCode)) {
                    groupedByCode.set(productCode, {
                        productCode: productCode,
                        productName: product.name ?? '—',
                        totalQty: 0,
                        totalSum: 0,
                        transactions: []
                    });
                }

                const group = groupedByCode.get(productCode);
                const transactionAmount = (entryType === 'Продаж') ? product.sum : -product.sum;
                const transactionQty = (entryType === 'Продаж') ? product.qty : -product.qty;

                group.totalSum += transactionAmount;
                group.totalQty += transactionQty;

                group.transactions.push({
                    checkType: entryType,
                    receiptNumber: entry.no ?? entry.DI ?? '—',
                    dateTime: entryTimestamp,
                    barcode: product.barcode ?? '—',
                    uktzed: product.uktzed ?? '—',
                    tax: product.tax ?? '—',
                    quantity: product.qty ?? 0,
                    price: product.price ?? 0,
                    sum: product.sum ?? 0,
                    discount: glimpseArray.find(item => item.D)?.D?.sum ?? 0,
                    paymentType: paymentTypeText,
                    exciseStamps: (product.excise?.map(stamp => stamp?.stamp).filter(Boolean).join(', ') || '—')
                });
            });
        });
    });

    // --- ЗМІНА: Повертаємо об'єкт з двома властивостями ---
    return {
        groupedData: Array.from(groupedByCode.values()).sort((a, b) => {
            return a.productCode.toString().localeCompare(b.productCode.toString());
        }),
        paymentSummary: paymentSummary
    };
}