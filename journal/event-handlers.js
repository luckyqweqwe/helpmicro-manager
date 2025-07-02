import * as DataService from './data-service.js';
import * as UIRenderer from './ui-renderer.js';
import * as ReportGenerator from './report-generator.js';
import { getTimestampFromInput } from './utils.js';

// --- DOM елементи ---
// (код без змін)
const calculateRangeSumBtn = document.getElementById('calculateRangeSumBtn');
const generateReportBtn = document.getElementById('generateReportBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const clearReportBtn = document.getElementById('clearReportBtn');
const scrollToReportBtn = document.getElementById('scrollToReportBtn');

const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const productReportForm = document.getElementById('productReportForm');
const reportSearchInput = document.getElementById('reportSearchInput');
const outputContainer = document.getElementById('output');
const reportResultContainer = document.getElementById('reportResult');


export function initializeEventListeners() {
    // (код без змін)
    calculateRangeSumBtn.addEventListener('click', handleCalculateRangeSum);
    generateReportBtn.addEventListener('click', handleGenerateProductReport);
    exportExcelBtn.addEventListener('click', handleExportExcel);
    clearReportBtn.addEventListener('click', handleClearReport);
    scrollToReportBtn.addEventListener('click', handleScrollToReport);
    
    reportSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleScrollToReport();
        }
    });

    outputContainer.addEventListener('click', handleZReportDetailsToggle);
    reportResultContainer.addEventListener('click', handleProductGroupToggle);
}

// --- handleCalculateRangeSum, handleGenerateProductReport, handleExportExcel, handleClearReport, handleScrollToReport ---
// (код без змін)
function handleCalculateRangeSum() {
    const startTimestamp = getTimestampFromInput(startDateInput);
    const endTimestamp = getTimestampFromInput(endDateInput, true);

    if (startTimestamp === null || endTimestamp === null || startTimestamp > endTimestamp) {
        document.getElementById('dateRangeTotal').innerHTML = '<p style="color: red;">Вкажіть коректний діапазон дат.</p>';
        return;
    }
    
    const ksefData = DataService.getKsefData();
    if (ksefData.length === 0) {
         document.getElementById('dateRangeTotal').innerHTML = '<p style="color: orange;">Завантажте JSON файл.</p>';
        return;
    }
    
    const totals = ReportGenerator.calculateDateRangeSummary(ksefData, startTimestamp, endTimestamp);
    UIRenderer.displaySummaryResults(totals);
}

function handleGenerateProductReport() {
    const ksefData = DataService.getKsefData();
    if (ksefData.length === 0) {
        UIRenderer.renderProductReportTable([]);
        return;
    }

    const filters = {
        startDate: getTimestampFromInput(document.getElementById('startDateReport')),
        endDate: getTimestampFromInput(document.getElementById('endDateReport'), true),
        productCode: document.getElementById('productCodeFilter').value.trim().toLowerCase(),
        barcode: document.getElementById('barcodeFilter').value.trim(),
        group: document.getElementById('groupFilter').value.trim(),
        department: document.getElementById('departmentFilter').value.trim(),
        taxRate: document.getElementById('taxRateFilter').value.trim(),
        checkType: document.getElementById('checkTypeFilter').value,
        paymentType: document.getElementById('paymentTypeFilter').value
    };
    
    if (filters.startDate !== null && filters.endDate !== null && filters.startDate > filters.endDate) {
        reportResultContainer.innerHTML = '<p style="color: red;">Помилка: Початкова дата звіту не може бути пізнішою за кінцеву.</p>';
        return;
    }

    const reportData = ReportGenerator.generateProductReport(ksefData, filters);
    UIRenderer.renderProductReportTable(reportData);
}

function handleExportExcel() {
    alert('Функція експорту для згрупованого звіту наразі в розробці.');
}

function handleClearReport() {
    UIRenderer.clearProductReport();
    if (productReportForm) {
        productReportForm.reset();
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('startDateReport').value = today;
        document.getElementById('endDateReport').value = today;
    }
}

function handleScrollToReport() {
    const reportNumber = parseInt(reportSearchInput.value, 10);
    if (isNaN(reportNumber) || reportNumber < 1) {
        alert('Будь ласка, введіть коректний номер Z-звіту.');
        return;
    }

    const reportElement = document.querySelector(`.report[data-report-number="${reportNumber}"]`);
    if (reportElement) {
        const reportSection = document.querySelector('.detailed-reports-section');
        reportSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => {
            const reportSectionRect = reportSection.getBoundingClientRect();
            const reportElementRect = reportElement.getBoundingClientRect();
            const scrollOffset = reportElementRect.top - reportSectionRect.top + reportSection.scrollTop - 50;
            reportSection.scrollTop = scrollOffset;

            const detailsDiv = reportElement.querySelector('.details');
            if (detailsDiv.style.display !== 'block') {
                 toggleZReportDetails(reportElement);
            }
        }, 300);
    } else {
        alert(`Z-звіт ${reportNumber} не знайдено.`);
    }
}


/**
 * Обробник для розгортання/згортання деталей Z-звітів та чеків.
 */
function handleZReportDetailsToggle(event) {
    // Обробка кліку на заголовок Z-звіту
    const reportHeader = event.target.closest('.report-header');
    if (reportHeader) {
        toggleZReportDetails(reportHeader.closest('.report'));
        return;
    }
    
    // --- ЗМІНА: Виправляємо логіку для розгортання чека ---
    const checkHeader = event.target.closest('.check-header-row');
    if (checkHeader) {
        const detailsContent = checkHeader.nextElementSibling?.querySelector('.check-details-content');
        const toggleIcon = checkHeader.querySelector('.toggle-icon.small');
        if (detailsContent && toggleIcon) {
            const isVisible = detailsContent.style.display === 'block';
            detailsContent.style.display = isVisible ? 'none' : 'block';
            toggleIcon.textContent = isVisible ? '+' : '-';
        }
    }
}

function toggleZReportDetails(reportDiv) {
    // (код без змін)
    if (!reportDiv) return;
    const detailsDiv = reportDiv.querySelector('.details');
    const summaryDiv = reportDiv.querySelector('.z-report-summary');
    const toggleIcon = reportDiv.querySelector('.report-header .toggle-icon');

    if (detailsDiv && toggleIcon && toggleIcon.textContent) {
        const isVisible = detailsDiv.style.display === 'block';
        detailsDiv.style.display = isVisible ? 'none' : 'block';
        if (summaryDiv) summaryDiv.style.display = isVisible ? 'none' : 'grid';
        toggleIcon.textContent = isVisible ? '+' : '-';
    }
}

function handleProductGroupToggle(event) {
    // (код без змін)
    const groupHeader = event.target.closest('.product-group-header');
    if (!groupHeader) return;

    const detailsRow = groupHeader.nextElementSibling;
    const toggleIcon = groupHeader.querySelector('.toggle-icon');

    if (detailsRow && toggleIcon) {
        const isVisible = detailsRow.style.display === 'table-row';
        detailsRow.style.display = isVisible ? 'none' : 'table-row';
        toggleIcon.textContent = isVisible ? '+' : '-';
    }
}