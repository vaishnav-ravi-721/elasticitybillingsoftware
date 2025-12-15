// Add IndexedDB variables at the top
let db = null;
const DB_NAME = 'BillAppDB';

const DB_VERSION = 8; // Changed from 5 to 6 to trigger upgrade
let dbInitialized = false;
let dbInitPromise = null;
let isGSTMode = false;
let gstCustomers = [];
let gstSavedBills = [];
let companyInfo = null;
let currentGSTPercent = 18;
let transactionType = 'intrastate'; // 'intrastate' or 'interstate'
// Global variables for toggle states
let currentCustomerMode = 'regular'; // 'regular' or 'gst'
let currentBillsMode = 'regular'; // 'regular' or 'gst'
let currentlyEditingSectionId = null;
let currentAdjustTaxPercent = 0;
let isGSTInclusive = false;
let confirmResolve = null;
let currentlyEditingPaymentId = null;
let termsListItems = [];
let termsListType = 'ul';
let termsListStyle = 'disc';

let discountAmount = 0;
let discountPercent = 0;
let gstPercent = 0;
let autoApplyCustomerRates = true;

// Edit mode variables
let editMode = false;
let currentEditingBillId = null;
let currentEditingBillType = null; // 'regular' or 'gst
// 
let currentConvertUnit = 'none';

// [ADD AT TOP WITH GLOBAL VARIABLES]
let adjustmentChain = []; // Stores: { id, name, type, value, operation, textColor }
let adjDragSrcEl = null;  // Unique drag source for adjustments

let codeReader = null;
let currentScannerMode = null; // 'main' or 'modal'
let scannedItemData = null;
let scannerMode = 'manual'; // 'manual' or 'auto'
let lastScannedCode = null;
let lastScanTime = 0;
const SCAN_DELAY = 1500;

let isVendorMode = false;
let currentVendorFile = null; // Stores Base64 string of uploaded bill
let currentlyEditingVendorId = null;
let currentVendorBillsMode = 'regular'; // 'regular' or 'gst'

// Add this with other global variables
let sectionModalState = {
    align: 'left',
    bgColor: '#ffe8b5',
    fontColor: '#000000',
    fontSize: '14',
    textTransform: 'none',
    paddingType: '',
    paddingValue: ''
};

// IndexedDB initialization function
function initDB() {
    if (dbInitPromise) {
        return dbInitPromise;
    }

    dbInitPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION); // Make sure DB_VERSION is incremented if needed

        request.onerror = () => {
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            dbInitialized = true;

            db.onerror = (event) => {
                console.error('Database error:', event.target.error);
            };

            db.onclose = () => {
                dbInitialized = false;
                dbInitPromise = null;
            };

            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // Existing object stores
            if (!database.objectStoreNames.contains('billDataManual')) {
                database.createObjectStore('billDataManual', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('billHistoryManual')) {
                database.createObjectStore('billHistoryManual', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('vendorList')) {
                database.createObjectStore('vendorList', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('vendorSavedBills')) {
                database.createObjectStore('vendorSavedBills', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('taxSettings')) {
                database.createObjectStore('taxSettings', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('theme')) {
                database.createObjectStore('theme', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('savedItems')) {
                database.createObjectStore('savedItems', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('savedCustomers')) {
                database.createObjectStore('savedCustomers', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('savedBills')) {
                database.createObjectStore('savedBills', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('gstCustomers')) {
                database.createObjectStore('gstCustomers', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('gstSavedBills')) {
                database.createObjectStore('gstSavedBills', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('companyInfo')) {
                database.createObjectStore('companyInfo', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('gstMode')) {
                database.createObjectStore('gstMode', { keyPath: 'id' });
            }

            if (!database.objectStoreNames.contains('expenses')) {
                const expenseStore = database.createObjectStore('expenses', { keyPath: 'id' });
                expenseStore.createIndex('date', 'date', { unique: false });
                expenseStore.createIndex('category', 'category', { unique: false });
            }

            // NEW: Add payment and credit note object stores
            if (!database.objectStoreNames.contains('customerPayments')) {
                database.createObjectStore('customerPayments', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('customerCreditNotes')) {
                database.createObjectStore('customerCreditNotes', { keyPath: 'id' });
            }

            // ADD THIS: Create settings object store
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'id' });
            }
            // Add this with other object store creations
            if (!database.objectStoreNames.contains('restoredBills')) {
                database.createObjectStore('restoredBills', { keyPath: 'id' });
            }
        };

        request.onblocked = () => {
            console.log('Database blocked - waiting for other connections to close');
        };
    });

    return dbInitPromise;
}

async function ensureDBInitialized() {
    if (!dbInitialized && !dbInitPromise) {
        await initDB();
    } else if (dbInitPromise) {
        await dbInitPromise;
    }

    if (db && (db.readyState === 'closed' || !db.objectStoreNames)) {
        dbInitialized = false;
        dbInitPromise = null;
        await initDB();
    }
}

async function getFromDB(storeName, key) {
    await ensureDBInitialized();

    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        try {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
        } catch (error) {
            reject(error);
        }
    });
}

async function setInDB(storeName, key, value) {
    await ensureDBInitialized();

    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put({ id: key, value: value });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function removeFromDB(storeName, key) {
    await ensureDBInitialized();

    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        } catch (error) {
            reject(error);
        }
    });
}


// Save payment/credit note
async function savePaymentRecord(customerName, gstin, paymentData, type = 'payment') {
    const storeName = type === 'payment' ? 'customerPayments' : 'customerCreditNotes';
    const recordId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const record = {
        id: recordId,
        customerName: customerName,
        gstin: gstin,
        date: paymentData.date,
        method: paymentData.method,
        amount: parseFloat(paymentData.amount),
        notes: paymentData.notes || '',
        timestamp: Date.now(),
        type: type
    };

    await setInDB(storeName, recordId, record);
    return recordId;
}
// Toggle auto-apply customer rates
async function toggleAutoApplyRates() {
    try {
        autoApplyCustomerRates = !autoApplyCustomerRates;
        updateAutoApplyButton();
        showNotification(`Auto-apply customer rates: ${autoApplyCustomerRates ? 'ON' : 'OFF'}`, 'info', 2000);

        // Save the setting to DB with error handling
        try {
            await setInDB('settings', 'autoApplyCustomerRates', autoApplyCustomerRates);
        } catch (error) {
            console.warn('Could not save auto-apply setting (settings store may not exist):', error);
            // Continue without saving - the setting will work for current session
        }
    } catch (error) {
        console.error('Error toggling auto-apply rates:', error);
    }
}

// Update the button appearance
function updateAutoApplyButton() {
    const button = document.querySelector('.auto-apply-rates-btn');
    if (button) {
        if (autoApplyCustomerRates) {
            button.style.backgroundColor = '#27ae60';
            button.innerHTML = '<span class="material-icons">auto_awesome</span>Auto Rate : ON';
        } else {
            button.style.backgroundColor = '';
            button.innerHTML = '<span class="material-icons">auto_awesome</span>Auto Rate : OFF';
        }
    }
}

// Load auto-apply setting on startup
async function loadAutoApplySetting() {
    try {
        // Check if settings store exists first
        await ensureDBInitialized();

        if (db && db.objectStoreNames.contains('settings')) {
            const setting = await getFromDB('settings', 'autoApplyCustomerRates');
            autoApplyCustomerRates = setting !== false; // Default to true if not set
        } else {
            // Settings store doesn't exist, use default
            autoApplyCustomerRates = true;
        }
        updateAutoApplyButton();
    } catch (error) {
        console.warn('Error loading auto-apply setting, using default:', error);
        autoApplyCustomerRates = true;
        updateAutoApplyButton();
    }
}

// Customer Rate Suggestion System
// Customer Rate & Discount Suggestion System
// Customer Rate & Discount Suggestion System (Split Logic)
async function getCustomerRateSuggestion(identifier, itemName) {
    try {
        if (!identifier || !itemName) return null;

        let suggestedData = null;
        let latestTimestamp = 0;

        if (isGSTMode) {
            // GST MODE: Search by GSTIN in gstSavedBills
            const gstBills = await getAllFromDB('gstSavedBills');
            gstBills.forEach(bill => {
                // Check both Bill To and Ship To GSTINs
                const billToGSTIN = bill.value.customer?.billTo?.gstin;
                const shipToGSTIN = bill.value.customer?.shipTo?.gstin;

                if ((billToGSTIN === identifier || shipToGSTIN === identifier) && bill.value.items) {
                    bill.value.items.forEach(item => {
                        if (item.itemName.toLowerCase() === itemName.toLowerCase() &&
                            item.rate > 0 &&
                            bill.value.timestamp > latestTimestamp) {

                            suggestedData = {
                                rate: parseFloat(item.rate),
                                discountType: item.discountType || 'none',
                                discountValue: parseFloat(item.discountValue) || 0
                            };
                            latestTimestamp = bill.value.timestamp;
                        }
                    });
                }
            });
        } else {
            // REGULAR MODE: Search by Name in savedBills
            const regularBills = await getAllFromDB('savedBills');
            regularBills.forEach(bill => {
                if (bill.value.customer?.name === identifier && bill.value.tableStructure) {
                    bill.value.tableStructure.forEach(row => {
                        if (row.type === 'item' &&
                            row.itemName.toLowerCase() === itemName.toLowerCase() &&
                            row.rate > 0 &&
                            bill.value.timestamp > latestTimestamp) {

                            suggestedData = {
                                rate: row.rate,
                                discountType: row.discountType || 'none',
                                discountValue: parseFloat(row.discountValue) || 0
                            };
                            latestTimestamp = bill.value.timestamp;
                        }
                    });
                }
            });
        }

        return suggestedData;
    } catch (error) {
        console.error('Error getting customer rate suggestion:', error);
        return null;
    }
}

// Sync rates to all tables (input, bill view, GST view)
function syncRateToOtherTables(itemId, newRate, newAmount, particularsHtml = null, discountType = null, discountValue = null) {
    // Sync to regular bill table (copyListManual)
    const copyRow = document.querySelector(`#copyListManual tr[data-id="${itemId}"]`);
    if (copyRow) {
        const cells = copyRow.children;
        cells[4].textContent = parseFloat(newRate).toFixed(2);
        cells[5].textContent = parseFloat(newAmount).toFixed(2);

        if (particularsHtml) cells[1].innerHTML = particularsHtml;
        if (discountType !== null) copyRow.setAttribute('data-discount-type', discountType);
        if (discountValue !== null) copyRow.setAttribute('data-discount-value', discountValue);
    }

    // Sync to GST table if in GST mode
    if (isGSTMode) {
        const gstRow = document.querySelector(`#gstCopyListManual tr[data-id="${itemId}"]`);
        if (gstRow) {
            const cells = gstRow.children;
            cells[5].textContent = parseFloat(newRate).toFixed(2); // Rate column
            cells[6].textContent = parseFloat(newAmount).toFixed(2); // Amount column

            // FIXED: Update HTML and Attributes on GST Row
            if (particularsHtml) cells[1].innerHTML = particularsHtml;
            if (discountType !== null) gstRow.setAttribute('data-discount-type', discountType);
            if (discountValue !== null) gstRow.setAttribute('data-discount-value', discountValue);
        }
    }
}

// Check and apply customer-specific rates to existing items (SYNCED VERSION)
// Check and apply customer-specific rates to existing items
async function checkAndApplyCustomerRates(paramIdentifier) {
    if (!autoApplyCustomerRates) return;

    try {
        // Determine Identifier based on Mode
        let identifier = null;

        if (isGSTMode) {
            // GST Mode: Use GSTIN
            // Try display element first, then input value
            const displayGstin = document.getElementById('billToGstin').textContent.trim();
            const inputGstin = document.getElementById('consignee-gst').value.trim();

            if (displayGstin && displayGstin !== 'customer 15-digit GSTIN' && displayGstin !== 'N/A') {
                identifier = displayGstin;
            } else if (inputGstin) {
                identifier = inputGstin;
            }
        } else {
            // Regular Mode: Use Customer Name (from param or input)
            identifier = paramIdentifier || document.getElementById('custName').value.trim();
        }

        if (!identifier) return;

        const items = document.querySelectorAll('#createListManual tbody tr[data-id]');
        let appliedCount = 0;

        for (const row of items) {
            const cells = row.children;
            const particularsDiv = cells[1];
            const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim();

            if (itemName) {
                const suggestion = await getCustomerRateSuggestion(identifier, itemName);

                if (suggestion) {
                    const { rate: suggestedRate, discountType, discountValue } = suggestion;

                    // 1. Update Rate
                    cells[4].textContent = parseFloat(suggestedRate).toFixed(2);
                    row.setAttribute('data-rate', parseFloat(suggestedRate).toFixed(8));

                    // 2. Update Discount Attributes
                    row.setAttribute('data-discount-type', discountType);
                    row.setAttribute('data-discount-value', discountValue);

                    // 3. Recalculate Amount
                    const quantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
                    const dimensionType = row.getAttribute('data-dimension-type') || 'none';

                    let finalQuantity = quantity;
                    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
                        const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
                        const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
                        finalQuantity = quantity * calculatedArea;
                    } else if (dimensionType === 'dozen') {
                        finalQuantity = quantity / 12;
                    }

                    let baseAmount = finalQuantity * suggestedRate;
                    let discountAmount = 0;

                    if (discountType !== 'none' && discountValue > 0) {
                        switch (discountType) {
                            case 'percent_per_unit':
                                const discountPerUnit = suggestedRate * (discountValue / 100);
                                discountAmount = discountPerUnit * finalQuantity;
                                break;
                            case 'amt_per_unit':
                                discountAmount = discountValue * finalQuantity;
                                break;
                            case 'percent_on_amount':
                                discountAmount = baseAmount * (discountValue / 100);
                                break;
                            case 'amt_on_amount':
                                discountAmount = discountValue;
                                break;
                        }
                    }

                    const finalAmount = storeWithPrecision(baseAmount - discountAmount);
                    const safeFinalAmount = finalAmount < 0 ? 0 : finalAmount;

                    cells[5].textContent = safeFinalAmount.toFixed(2);
                    row.setAttribute('data-amount', safeFinalAmount.toFixed(8));

                    // 4. Regenerate Particulars Text
                    const notes = particularsDiv.querySelector('.notes')?.textContent || '';
                    const storedDimValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
                    const storedDimUnit = row.getAttribute('data-dimension-unit') || 'ft';
                    const storedUnit = cells[3].textContent;
                    const storedToggles = JSON.parse(row.getAttribute('data-dimension-toggles') || '{"toggle1":true,"toggle2":true,"toggle3":true}');

                    const dimDisplayText = getDimensionDisplayText(dimensionType, storedDimValues, storedDimUnit, storedToggles);

                    const particularsHtml = formatParticularsManual(
                        itemName, notes, dimDisplayText, quantity, finalQuantity, suggestedRate,
                        dimensionType, storedDimUnit, storedUnit, discountType, discountValue, storedToggles
                    );

                    cells[1].innerHTML = particularsHtml;

                    // 5. Sync
                    syncRateToOtherTables(row.getAttribute('data-id'), suggestedRate, safeFinalAmount, particularsHtml, discountType, discountValue);

                    appliedCount++;
                }
            }
        }

        if (appliedCount > 0) {
            updateTotal();
            if (isGSTMode) updateGSTTaxCalculation();
            await saveToLocalStorage();
            showNotification(`Applied previous rates for ${identifier}`, 'info', 3000);
        }

    } catch (error) {
        console.error('Error applying customer rates:', error);
    }
}

// Get customer payments/credit notes
async function getCustomerPayments(customerName, gstin, type = 'payment', filters = {}) {
    const storeName = type === 'payment' ? 'customerPayments' : 'customerCreditNotes';

    try {
        const allRecords = await getAllFromDB(storeName);

        // If no records exist yet, return empty array
        if (!allRecords || allRecords.length === 0) {
            return [];
        }

        let records = allRecords.filter(record => {
            // Match by GSTIN if available, otherwise by name
            if (gstin && record.value.gstin) {
                return record.value.gstin === gstin && record.value.type === type;
            } else {
                return record.value.customerName === customerName && record.value.type === type;
            }
        }).map(record => record.value);

        // Apply filters
        records = applyPaymentFilters(records, filters);

        return records;
    } catch (error) {
        console.error(`Error getting ${type} records:`, error);
        return [];
    }
}

// Apply filters to payments/credit notes
function applyPaymentFilters(records, filters) {
    let filtered = [...records];

    // Search filter
    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filtered = filtered.filter(record =>
            record.method.toLowerCase().includes(searchTerm) ||
            record.amount.toString().includes(searchTerm) ||
            record.date.includes(searchTerm) ||
            (record.notes && record.notes.toLowerCase().includes(searchTerm))
        );
    }

    // Date range filter
    if (filters.startDate && filters.endDate) {
        filtered = filtered.filter(record =>
            record.date >= filters.startDate && record.date <= filters.endDate
        );
    }

    // Statement period filter
    if (filters.period && filters.period !== 'all') {
        const today = new Date();
        let startDate = new Date();

        switch (filters.period) {
            case '1month':
                startDate.setMonth(today.getMonth() - 1);
                break;
            case '3months':
                startDate.setMonth(today.getMonth() - 3);
                break;
            case '6months':
                startDate.setMonth(today.getMonth() - 6);
                break;
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        filtered = filtered.filter(record => record.date >= startDateStr);
    }

    // Sort
    const sortBy = filters.sortBy || 'date';
    const sortOrder = filters.sortOrder || 'desc';

    filtered.sort((a, b) => {
        let aValue, bValue;

        if (sortBy === 'date') {
            aValue = new Date(a.date);
            bValue = new Date(b.date);
        } else if (sortBy === 'amount') {
            aValue = parseFloat(a.amount);
            bValue = parseFloat(b.amount);
        }

        if (sortOrder === 'asc') {
            return aValue - bValue;
        } else {
            return bValue - aValue;
        }
    });

    return filtered;
}

// Delete payment/credit note
async function deletePaymentRecord(recordId, type = 'payment') {
    const storeName = type === 'payment' ? 'customerPayments' : 'customerCreditNotes';
    await removeFromDB(storeName, recordId);
}

async function loadGSTCustomers() {
    try {
        const customers = await getAllFromDB('gstCustomers');
        gstCustomers = customers.map(c => c.value);
    } catch (error) {
        console.error('Error loading GST customers:', error);
        gstCustomers = [];
    }
}

async function getAllFromDB(storeName) {
    await ensureDBInitialized();

    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('Database not initialized'));
            return;
        }

        try {
            // Check if the object store exists
            if (!db.objectStoreNames.contains(storeName)) {
                console.warn(`Object store '${storeName}' does not exist, returning empty array`);
                resolve([]);
                return;
            }

            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        } catch (error) {
            console.error(`Error accessing store '${storeName}':`, error);
            resolve([]); // Return empty array instead of rejecting
        }
    });
}

// Notification System
function showNotification(message, type = 'info', duration = 2000) {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    // Auto remove after duration
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);

    return notification;
}

// Custom Confirm Dialog
function showConfirm(message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirm-dialog');
        const messageEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-yes');
        const noBtn = document.getElementById('confirm-no');

        messageEl.textContent = message;
        confirmResolve = resolve;

        dialog.classList.add('active');

        // Remove previous event listeners
        yesBtn.onclick = null;
        noBtn.onclick = null;

        // Add new event listeners
        yesBtn.onclick = () => {
            dialog.classList.remove('active');
            confirmResolve(true);
        };

        noBtn.onclick = () => {
            dialog.classList.remove('active');
            confirmResolve(false);
        };
    });
}

// Close confirm dialog when clicking outside
document.getElementById('confirm-dialog').addEventListener('click', function (e) {
    if (e.target === this) {
        this.classList.remove('active');
        if (confirmResolve) {
            confirmResolve(false);
        }
    }
});

function handleDiscountTypeChange() {
    const type = document.getElementById('discount-type-select').value;
    const percentGroup = document.getElementById('percent-input-group');
    const amountGroup = document.getElementById('amount-input-group');

    // Hide both initially
    percentGroup.style.display = 'none';
    amountGroup.style.display = 'none';

    // Show relevant input
    if (type === 'percent') {
        percentGroup.style.display = 'flex';
    } else if (type === 'amount') {
        amountGroup.style.display = 'flex';
    }
}

// Get current subtotal for discount calculations
function getCurrentSubtotal() {
    if (isGSTMode) {
        // Get from actual stored items, not displayed total
        const items = document.querySelectorAll('#createListManual tbody tr[data-id]');
        let subtotal = 0;

        items.forEach(row => {
            const amount = parseFloat(row.getAttribute('data-amount')) || 0;
            subtotal = storeWithPrecision(subtotal + amount);
        });

        return subtotal;
    } else {
        // Get from actual stored items, not displayed total
        const items = document.querySelectorAll('#createListManual tbody tr[data-id]');
        let subtotal = 0;

        items.forEach(row => {
            const amount = parseFloat(row.getAttribute('data-amount')) || 0;
            subtotal = storeWithPrecision(subtotal + amount);
        });

        return subtotal;
    }
}

function toggleDiscountInputs() {
    const container = document.getElementById('discount-inputs-container');
    const button = document.getElementById('toggleDiscountBtn');

    if (container.style.display === 'none') {
        container.style.display = 'flex';
        button.style.backgroundColor = '#27ae60'; // Green when active
    } else {
        container.style.display = 'none';
        button.style.backgroundColor = ''; // Reset to default
    }
}

function toggleDimensionInputs() {
    const container = document.getElementById('dimension-inputs-container');
    const button = document.getElementById('toggleDimensionBtn');
    const convertBtn = document.getElementById('toggleConvertBtn');

    if (container.style.display === 'none') {
        container.style.display = 'flex';
        button.style.backgroundColor = '#3498db';
        if (convertBtn) convertBtn.style.display = 'inline-block';
    } else {
        container.style.display = 'none';
        button.style.backgroundColor = '';
        if (convertBtn) {
            convertBtn.style.display = 'none';
            convertBtn.classList.remove('active');
        }

        // Reset convert state
        const convertSelect = document.getElementById('convertUnit');
        if (convertSelect) {
            convertSelect.style.display = 'none';
            convertSelect.value = 'none';
        }
        currentConvertUnit = 'none';
    }
}

let rowCounterManual = 1;
let currentlyEditingRowIdManual = null;
let historyStackManual = [];
let historyIndexManual = -1;
let rateColumnHidden = false;
let currentView = 'input';
let showDimensions = true;

const themes = ['blue', 'green', 'red', 'purple', 'orange', 'dark', 'high-contrast', 'teal', 'indigo', 'brown', 'pink', 'cyan', 'lime', 'deep-purple', 'amber', 'deep-orange', 'blue-grey', 'navy', 'charcoal', 'burgundy', 'forest', 'slate', 'lavender', 'mint', 'peach', 'sage', 'rose-gold', 'nebula', 'cosmic', 'galaxy', 'stellar', 'asteroid', 'rainbow'];
let currentThemeIndex = 0;


// let discountPercent = 0;
// let gstPercent = 0;

let currentDimensions = {
    type: 'none',
    unit: 'ft',
    values: [0, 0, 0],
    calculatedArea: 0
};

let currentlyEditingItemId = null;
let currentlyEditingCustomerId = null;

function getModeSpecificVars() {
    return {
        rowCounter: rowCounterManual,
        currentlyEditingRowId: currentlyEditingRowIdManual,
        historyStack: historyStackManual,
        historyIndex: historyIndexManual,
        createListId: 'createListManual',
        copyListId: 'copyListManual',
        totalAmountId: 'createTotalAmountManual',
        copyTotalAmountId: 'copyTotalAmount',
        localStorageKey: 'billDataManual',
        historyStorageKey: 'billHistoryManual',
        addRowFunc: addRowManual,
        updateRowFunc: updateRowManual,
        editRowFunc: editRowManual,
        removeRowFunc: removeRowManual
    };
}

function toggleSettingsSidebar() {
    const sidebar = document.getElementById("settings-sidebar");
    const overlay = document.getElementById("settings-overlay");
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
}

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const settingsSidebar = document.getElementById("settings-sidebar");
        if (settingsSidebar.classList.contains("open")) {
            toggleSettingsSidebar();
        }
    }
});

document.addEventListener('DOMContentLoaded', async function () {
    try {
        await initDB();
        await loadFromLocalStorage();
        await loadHistoryFromLocalStorage();
        await loadSavedTheme();
        await loadTaxSettings();
        // await loadSavedItems();
        await loadSavedCustomers();
        await loadBillHeadings();
        await loadBrandingSettings();

        // Load GST mode settings
        const gstModeSetting = await getFromDB('gstMode', 'isGSTMode');
        isGSTMode = gstModeSetting || false;
        await loadCompanyInfo();
        await loadGSTCustomers();

        updateUIForGSTMode();

        // === FIX: Force Adjustment Calculation on Load ===
        // This ensures the total table renders correctly after refresh
        setTimeout(() => {
            updateTotal(); // Triggers calculateAdjustments using the loaded adjustmentChain
        }, 100);

        saveStateToHistory();

        // Fix profit state after page refresh
        restoreProfitStateAfterRefresh();

        // Safe date initialization
        const dateInput = document.getElementById('billDate');
        if (dateInput && !dateInput.value) {
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            dateInput.value = `${day}-${month}-${year}`;
            initializeDateInputs();
            saveToLocalStorage();
        }

        // Initialize payment and ledger systems
        setupPaymentDialog();

        // Safe ledger period initialization
        const fromDateInput = document.getElementById('from-date-input');
        if (fromDateInput) {
            // Set default from date to 3 months ago for "From Date" option
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            fromDateInput.value = threeMonthsAgo.toISOString().split('T')[0];
        }

        // Safe select all dates event listener
        const selectAllDates = document.getElementById('select-all-dates');
        if (selectAllDates) {
            selectAllDates.addEventListener('change', handleSelectAllChange);
        }

        // Close payment dialog
        const closePaymentBtn = document.getElementById('close-payment-dialog');
        if (closePaymentBtn) {
            closePaymentBtn.addEventListener('click', closePaymentDialog);
        }

        // Close ledger dialog
        const closeLedgerBtn = document.getElementById('close-ledger-dialog');
        if (closeLedgerBtn) {
            closeLedgerBtn.addEventListener('click', closeLedgerDialog);
        }

        // Setup payment type toggle
        setupPaymentTypeToggle();

        // Close dialogs when clicking outside
        const paymentDialog = document.getElementById('payment-dialog');
        if (paymentDialog) {
            paymentDialog.addEventListener('click', function (e) {
                if (e.target === this) closePaymentDialog();
            });
        }

        const ledgerDialog = document.getElementById('ledger-dialog');
        if (ledgerDialog) {
            ledgerDialog.addEventListener('click', function (e) {
                if (e.target === this) closeLedgerDialog();
            });
        }

        // Close purchase price dialog
        const closePurchaseBtn = document.getElementById('close-purchase-dialog');
        if (closePurchaseBtn) {
            closePurchaseBtn.addEventListener('click', closePurchasePriceDialog);
        }

        // Close purchase dialog when clicking outside
        const purchaseDialog = document.getElementById('purchase-price-dialog');
        if (purchaseDialog) {
            purchaseDialog.addEventListener('click', function (e) {
                if (e.target === this) closePurchasePriceDialog();
            });
        }

        // Validate purchase price inputs on change
        document.addEventListener('input', function (e) {
            if (e.target.classList.contains('purchase-price-input')) {
                const value = parseFloat(e.target.value) || 0;
                if (value > 0) {
                    e.target.style.borderColor = '';
                }
            }
        });

        // UPDATED DIMENSION INPUT EVENT LISTENERS
        const dimension1 = document.getElementById('dimension1');
        if (dimension1) {
            dimension1.addEventListener('input', function () {
                currentDimensions.values[0] = parseFloat(this.value) || 0;
                calculateDimensions();
            });
            dimension1.addEventListener('blur', function () {
                if (this.value) {
                    this.value = parseFloat(this.value).toFixed(2);
                    currentDimensions.values[0] = parseFloat(this.value);
                    calculateDimensions();
                }
            });
        }

        const dimension2 = document.getElementById('dimension2');
        if (dimension2) {
            dimension2.addEventListener('input', function () {
                currentDimensions.values[1] = parseFloat(this.value) || 0;
                calculateDimensions();
            });
            dimension2.addEventListener('blur', function () {
                if (this.value) {
                    this.value = parseFloat(this.value).toFixed(2);
                    currentDimensions.values[1] = parseFloat(this.value);
                    calculateDimensions();
                }
            });
        }

        const dimension3 = document.getElementById('dimension3');
        if (dimension3) {
            dimension3.addEventListener('input', function () {
                currentDimensions.values[2] = parseFloat(this.value) || 0;
                calculateDimensions();
            });
            dimension3.addEventListener('blur', function () {
                if (this.value) {
                    this.value = parseFloat(this.value).toFixed(2);
                    currentDimensions.values[2] = parseFloat(this.value);
                    calculateDimensions();
                }
            });
        }

        // Customer name event listeners
        const custName = document.getElementById('custName');
        if (custName) {
            custName.addEventListener('input', async function () {
                const customerName = this.value.trim();
                if (customerName) {
                    window.currentCustomer = customerName;
                    if (autoApplyCustomerRates) {
                        await checkAndApplyCustomerRates(customerName);
                    }
                }
            });
        }

        // Add customer rate suggestion listeners
        if (custName) {
            custName.addEventListener('input', async function () {
                const customerName = this.value.trim();
                if (customerName) {
                    window.currentCustomer = customerName;
                    if (autoApplyCustomerRates) {
                        await checkAndApplyCustomerRates(customerName);
                    }
                }
            });
        }

        // Add click handler for existing terms
        document.addEventListener('click', function (e) {
            const termsDiv = e.target.closest('.bill-footer-list[data-editable="true"]');
            if (termsDiv) {
                e.preventDefault();
                e.stopPropagation();
                editExistingTerms(termsDiv);
            }
        });

        // Add event delegation for dynamically created ledger and payment buttons
        document.addEventListener('click', function (e) {
            // Handle ledger buttons
            if (e.target.classList.contains('btn-ledger') || e.target.closest('.btn-ledger')) {
                const button = e.target.classList.contains('btn-ledger') ? e.target : e.target.closest('.btn-ledger');
                const customerName = button.getAttribute('data-customer-name');
                const gstin = button.getAttribute('data-gstin');

                if (customerName) {
                    openLedgerDialog(customerName, gstin);
                }
            }

            // auto select cgst or igst
            const consigneeGST = document.getElementById('consignee-gst');
            if (consigneeGST) {
                consigneeGST.addEventListener('input', function () {
                    const cGSTVal = this.value.trim();
                    const companyGST = document.getElementById('company-gst').value.trim();

                    if (cGSTVal.length >= 2 && companyGST.length >= 2) {
                        const consigneeStateCode = cGSTVal.substring(0, 2);
                        const companyStateCode = companyGST.substring(0, 2);

                        const transactionTypeSelect = document.getElementById('transaction_type');
                        if (consigneeStateCode !== companyStateCode) {
                            transactionTypeSelect.value = 'interstate';
                        } else {
                            transactionTypeSelect.value = 'intrastate';
                        }
                    }
                });
            }

            // Handle payment buttons
            if (e.target.classList.contains('btn-payment') || e.target.closest('.btn-payment')) {
                const button = e.target.classList.contains('btn-payment') ? e.target : e.target.closest('.btn-payment');
                const customerName = button.getAttribute('data-customer-name');
                const gstin = button.getAttribute('data-gstin');

                if (customerName) {
                    openPaymentDialog(customerName, gstin);
                }
            }
        });

        // Add this to hide ALL suggestion boxes when clicking elsewhere
        document.addEventListener('click', function (e) {
            const suggestionPairs = [
                { inputId: 'itemNameManual', boxId: 'item-suggestions' },
                { inputId: 'consignee-name', boxId: 'consignee-suggestions' },
                { inputId: 'buyer-name', boxId: 'buyer-suggestions' },
                { inputId: 'custName', boxId: 'regular-customer-suggestions' },
                { inputId: 'selectUnit', boxId: 'unit-suggestions' },
                { inputId: 'saved-select-unit', boxId: 'saved-unit-suggestions' }
            ];

            suggestionPairs.forEach(pair => {
                const input = document.getElementById(pair.inputId);
                const box = document.getElementById(pair.boxId);

                if (input && box) {
                    if (e.target !== input && !box.contains(e.target)) {
                        box.style.display = 'none';
                    }
                }
            });
        });


        // OCR start

        // OVR end

        // ADD THIS: Close restored bills modal
        const closeRestoredBtn = document.querySelector('#restored-bills-modal .close');
        if (closeRestoredBtn) {
            closeRestoredBtn.addEventListener('click', closeRestoredBillsModal);
        }

        // // Item name input listener
        // const itemNameManual = document.getElementById('itemNameManual');
        // if (itemNameManual) {
        //     itemNameManual.addEventListener('input', handleItemNameInput);
        // }

        // Load custom payment methods on startup
        await loadCustomPaymentMethods();

        // Add this to your DOMContentLoaded function
        await loadAutoApplySetting();
        // Load customer dialog state
        await loadCustomerDialogState();
        setupCustomerDialogAutoSave();

        await loadVendorState();   // Restore mode and inputs
        setupVendorAutoSave();     // Attach listeners for future typing

    } catch (error) {
        console.error('Error during initialization:', error);
    }
});


function initializeDateInputs() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const todayFormatted = `${day}-${month}-${year}`;

    // Set today's date for all date inputs
    const dateInputs = [
        'billDate',
        'invoice-date',
        'payment-date',
        'from-date',
        'to-date'
    ];

    dateInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input && !input.value) {
            input.value = todayFormatted;
        }
    });
}

function toggleConvertOptions() {
    const convertSelect = document.getElementById('convertUnit');
    const btn = document.getElementById('toggleConvertBtn');

    if (convertSelect.style.display === 'none') {
        convertSelect.style.display = 'inline-block';
        btn.classList.add('active');
    } else {
        convertSelect.style.display = 'none';
        convertSelect.value = 'none';
        currentConvertUnit = 'none';
        btn.classList.remove('active');
        // Recalculate without conversion
        calculateDimensions();
    }
}

function handleConvertUnitChange() {
    currentConvertUnit = document.getElementById('convertUnit').value;
}

function getConversionFactor(fromUnit, toUnit, power) {
    if (fromUnit === toUnit || toUnit === 'none' || !toUnit) return 1;

    const factors = {
        ft: { inch: 12, mtr: 0.3048, cm: 30.48, mm: 304.8 },
        inch: { ft: 1 / 12, mtr: 0.0254, cm: 2.54, mm: 25.4 },
        mtr: { ft: 3.28084, inch: 39.3701, cm: 100, mm: 1000 },
        cm: { ft: 0.0328084, inch: 0.393701, mtr: 0.01, mm: 10 },
        mm: { ft: 0.00328084, inch: 0.0393701, mtr: 0.001, cm: 0.1 }
    };

    if (!factors[fromUnit] || !factors[fromUnit][toUnit]) return 1;

    const baseFactor = factors[fromUnit][toUnit];
    return Math.pow(baseFactor, power);
}

function handleDimensionTypeChange() {
    const dimensionType = document.getElementById('dimensionType').value;
    const measurementUnit = document.getElementById('measurementUnit');
    const dimensionInputs = document.getElementById('dimensionInputs');

    const dim1 = document.getElementById('dimension1');
    const dim2 = document.getElementById('dimension2');
    const dim3 = document.getElementById('dimension3');
    const dim1Toggle = document.getElementById('dimension1-toggle');
    const dim2Toggle = document.getElementById('dimension2-toggle');
    const dim3Toggle = document.getElementById('dimension3-toggle');

    currentDimensions.type = dimensionType;

    // Reset values
    if (!dim1.value) dim1.value = '';
    if (!dim2.value) dim2.value = '';
    if (!dim3.value) dim3.value = '';

    // Reset toggles
    if (dim1Toggle) dim1Toggle.checked = true;
    if (dim2Toggle) dim2Toggle.checked = true;
    if (dim3Toggle) dim3Toggle.checked = true;

    if (dimensionType === 'none') {
        if (measurementUnit) measurementUnit.style.display = 'none';
        if (dimensionInputs) dimensionInputs.style.display = 'none';
    } else if (dimensionType === 'dozen') {
        if (measurementUnit) measurementUnit.style.display = 'none';
        if (dimensionInputs) dimensionInputs.style.display = 'none';
        const quantityInput = document.getElementById('quantityManual');
        if (quantityInput && quantityInput.value) {
            const quantity = parseFloat(quantityInput.value);
            quantityInput.value = (quantity / 12).toFixed(2);
        }
    } else {
        if (measurementUnit) measurementUnit.style.display = 'inline-block';
        if (dimensionInputs) dimensionInputs.style.display = 'flex';

        // Show/hide appropriate inputs
        const inputs = document.querySelectorAll('#dimensionInputs .dimension-input-with-toggle');
        inputs.forEach(input => input.style.display = 'none');

        if (inputs[0]) inputs[0].style.display = 'flex';
        if (dim1) dim1.style.display = 'inline-block';

        switch (dimensionType) {
            case 'length': if (dim1) dim1.placeholder = 'Length'; break;
            case 'widthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Height';
                break;
            case 'widthXheightXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Height';
                if (dim3) dim3.placeholder = 'Depth';
                break;
            case 'lengthXwidthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                if (dim3) dim3.placeholder = 'Height';
                break;
            case 'widthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Depth';
                break;
            case 'lengthXheightXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Height';
                if (dim3) dim3.placeholder = 'Depth';
                break;
            case 'lengthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Depth';
                break;
            case 'lengthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Height';
                break;
            case 'lengthXwidth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                break;
            case 'lengthXwidthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                if (dim3) dim3.placeholder = 'Depth';
                break;
        }
    }

    calculateDimensions();
}

// Add function to update dimension calculation based on toggles
function updateDimensionCalculation() {
    calculateDimensions();
}

function handleMeasurementUnitChange() {
    const newUnit = document.getElementById('measurementUnit').value;
    const oldUnit = currentDimensions.unit;

    if (oldUnit !== newUnit) {
        convertDimensions(oldUnit, newUnit);
    }

    currentDimensions.unit = newUnit;
    calculateDimensions();
}

function convertDimensions(fromUnit, toUnit) {
    const conversionFactors = {
        ft: { inch: 12, mtr: 0.3048, cm: 30.48, mm: 304.8 },
        inch: { ft: 1 / 12, mtr: 0.0254, cm: 2.54, mm: 25.4 },
        mtr: { ft: 3.28084, inch: 39.3701, cm: 100, mm: 1000 },
        cm: { ft: 0.0328084, inch: 0.393701, mtr: 0.01, mm: 10 },
        mm: { ft: 0.00328084, inch: 0.0393701, mtr: 0.001, cm: 0.1 }
    };

    const factor = conversionFactors[fromUnit][toUnit];

    const dim1 = document.getElementById('dimension1');
    const dim2 = document.getElementById('dimension2');
    const dim3 = document.getElementById('dimension3');

    if (dim1.value) {
        dim1.value = (parseFloat(dim1.value) * factor).toFixed(4);
        currentDimensions.values[0] = parseFloat(dim1.value);
    }
    if (dim2.value && dim2.style.display !== 'none') {
        dim2.value = (parseFloat(dim2.value) * factor).toFixed(4);
        currentDimensions.values[1] = parseFloat(dim2.value);
    }
    if (dim3.value && dim3.style.display !== 'none') {
        dim3.value = (parseFloat(dim3.value) * factor).toFixed(4);
        currentDimensions.values[2] = parseFloat(dim3.value);
    }
}

function calculateDimensions() {
    const dim1 = document.getElementById('dimension1');
    const dim2 = document.getElementById('dimension2');
    const dim3 = document.getElementById('dimension3');
    const dim1Toggle = document.getElementById('dimension1-toggle');
    const dim2Toggle = document.getElementById('dimension2-toggle');
    const dim3Toggle = document.getElementById('dimension3-toggle');

    // Convert input values to numbers and update currentDimensions
    // BUT DON'T FORMAT THEM HERE - keep raw input for typing
    if (dim1.value) currentDimensions.values[0] = parseFloat(dim1.value) || 0;
    if (dim2.value && dim2.style.display !== 'none') currentDimensions.values[1] = parseFloat(dim2.value) || 0;
    if (dim3.value && dim3.style.display !== 'none') currentDimensions.values[2] = parseFloat(dim3.value) || 0;

    let calculatedValue = 0;
    const [v1, v2, v3] = currentDimensions.values;

    // Apply toggle states - if unchecked, use 1 (no effect on multiplication)
    const effectiveV1 = dim1Toggle.checked ? v1 : 1;
    const effectiveV2 = dim2Toggle.checked ? v2 : 1;
    const effectiveV3 = dim3Toggle.checked ? v3 : 1;

    switch (currentDimensions.type) {
        case 'length':
            calculatedValue = effectiveV1;
            break;
        case 'widthXheight':
            calculatedValue = effectiveV1 * effectiveV2;
            break;
        case 'widthXheightXdepth':
            calculatedValue = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'lengthXwidthXheight':
            calculatedValue = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'widthXdepth':
            calculatedValue = effectiveV1 * effectiveV2;
            break;
        case 'lengthXheightXdepth':
            calculatedValue = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'lengthXdepth':
            calculatedValue = effectiveV1 * effectiveV2;
            break;
        case 'lengthXheight':
            calculatedValue = effectiveV1 * effectiveV2;
            break;
        case 'lengthXwidth':
            calculatedValue = effectiveV1 * effectiveV2;
            break;
        case 'lengthXwidthXdepth':
            calculatedValue = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        default:
            calculatedValue = 0;
    }

    currentDimensions.calculatedArea = calculatedValue;

    // REMOVE THE FORMATTING FROM HERE - it interferes with typing
    // We'll format only when the input loses focus or when saving
}

function getDimensionDisplayText(dimensionType = null, dimensionValues = null, dimensionUnit = null, toggleStates = null) {
    // Use passed parameters or fall back to current state
    const type = dimensionType || currentDimensions.type;
    const unit = dimensionUnit || currentDimensions.unit;

    if (type === 'none' || type === 'dozen') {
        return '';
    }

    // Handle both array and object formats for dimension values
    let values = dimensionValues || currentDimensions.values;
    let v1 = 0, v2 = 0, v3 = 0;

    if (Array.isArray(values)) {
        [v1, v2, v3] = values;
    } else if (typeof values === 'object' && values !== null) {
        // Extract values from object
        v1 = values[0] || values.values?.[0] || 0;
        v2 = values[1] || values.values?.[1] || 0;
        v3 = values[2] || values.values?.[2] || 0;
    }

    // Get toggle states
    const toggles = toggleStates || {
        toggle1: true,
        toggle2: true,
        toggle3: true
    };

    // Count how many dimensions are checked (actually used in calculation)
    const checkedCount = [toggles.toggle1, toggles.toggle2, toggles.toggle3].filter(Boolean).length;

    // DYNAMIC UNIT SUFFIX BASED ON CHECKED DIMENSIONS
    let unitSuffix = '';
    switch (checkedCount) {
        case 1:
            unitSuffix = unit; // Linear (1 dimension)
            break;
        case 2:
            unitSuffix = unit + '²'; // Area (2 dimensions)
            break;
        case 3:
            unitSuffix = unit + '³'; // Volume (3 dimensions)
            break;
        default:
            unitSuffix = unit; // Fallback
    }

    // Format values
    const formattedV1 = formatNumber(v1);
    const formattedV2 = formatNumber(v2);
    const formattedV3 = formatNumber(v3);

    let dimensionText = '';

    switch (type) {
        case 'length':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit}`;
            break;
        case 'widthXheight':
            dimensionText = `${toggles.toggle1 ? 'W' : '<span style="color: red">W</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'H' : '<span style="color: red">H</span>'} ${formattedV2}${unit}`;
            break;
        case 'widthXheightXdepth':
            dimensionText = `${toggles.toggle1 ? 'W' : '<span style="color: red">W</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'H' : '<span style="color: red">H</span>'} ${formattedV2}${unit} X ${toggles.toggle3 ? 'D' : '<span style="color: red">D</span>'} ${formattedV3}${unit}`;
            break;
        case 'lengthXwidthXheight':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'W' : '<span style="color: red">W</span>'} ${formattedV2}${unit} X ${toggles.toggle3 ? 'H' : '<span style="color: red">H</span>'} ${formattedV3}${unit}`;
            break;
        case 'widthXdepth':
            dimensionText = `${toggles.toggle1 ? 'W' : '<span style="color: red">W</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'D' : '<span style="color: red">D</span>'} ${formattedV2}${unit}`;
            break;
        case 'lengthXheightXdepth':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'H' : '<span style="color: red">H</span>'} ${formattedV2}${unit} X ${toggles.toggle3 ? 'D' : '<span style="color: red">D</span>'} ${formattedV3}${unit}`;
            break;
        case 'lengthXdepth':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'D' : '<span style="color: red">D</span>'} ${formattedV2}${unit}`;
            break;
        case 'lengthXheight':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'H' : '<span style="color: red">H</span>'} ${formattedV2}${unit}`;
            break;
        case 'lengthXwidth':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'W' : '<span style="color: red">W</span>'} ${formattedV2}${unit}`;
            break;
        case 'lengthXwidthXdepth':
            dimensionText = `${toggles.toggle1 ? 'L' : '<span style="color: red">L</span>'} ${formattedV1}${unit} X ${toggles.toggle2 ? 'W' : '<span style="color: red">W</span>'} ${formattedV2}${unit} X ${toggles.toggle3 ? 'D' : '<span style="color: red">D</span>'} ${formattedV3}${unit}`;
            break;
    }

    return dimensionText;
}


// ==========================================
// AUTO RATE CONVERSION LOGIC (FINAL)
// ==========================================

let autoRateConversion = false;
let previousConvertUnit = 'none';

function toggleAutoRateConversion() {
    autoRateConversion = !autoRateConversion;

    // 1. Save state
    localStorage.setItem('billApp_autoRate', autoRateConversion);

    // 2. Update UI
    updateAutoRateUI();

    // 3. Notify
    if (autoRateConversion) {
        showNotification("Auto Rate Conversion Enabled", "success");
    } else {
        showNotification("Auto Rate Conversion Disabled", "info");
    }
}

// Helper: Update Button UI based on state
function updateAutoRateUI() {
    const btn = document.getElementById('btn-auto-rate');
    if (!btn) return;

    const label = btn.querySelector('.sidebar-label');
    const icon = btn.querySelector('.material-icons');

    if (autoRateConversion) {
        label.textContent = "Rate Convert : ON";
        icon.style.color = "#2ecc71"; // Green
        btn.style.backgroundColor = "#e8f5e9";
    } else {
        label.textContent = "Rate Convert: OFF";
        icon.style.color = ""; // Reset
        btn.style.backgroundColor = "";
    }
}

// Helper: Check if the "Convert" button is toggled ON
function isConvertModeActive() {
    const btn = document.getElementById('toggleConvertBtn');
    return btn && btn.classList.contains('active');
}

// LOAD STATE ON STARTUP
document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore Auto Rate Toggle
    const savedState = localStorage.getItem('billApp_autoRate');
    if (savedState === 'true') {
        autoRateConversion = true;
        setTimeout(updateAutoRateUI, 100);
    }

    // 2. Sync "Previous Unit" Tracker
    setTimeout(() => {
        const convertSelect = document.getElementById('convertUnit');
        if (convertSelect) {
            previousConvertUnit = convertSelect.value;
        }
    }, 1000);
});

// --- MATH HELPERS ---

function getLinearFactor(fromUnit, toUnit) {
    if (!fromUnit || !toUnit || fromUnit === toUnit || fromUnit === 'none' || toUnit === 'none') return 1;

    const factors = {
        'ft': { 'inch': 12, 'mtr': 0.3048, 'cm': 30.48, 'mm': 304.8 },
        'inch': { 'ft': 1 / 12, 'mtr': 0.0254, 'cm': 2.54, 'mm': 25.4 },
        'mtr': { 'ft': 3.28084, 'inch': 39.3701, 'cm': 100, 'mm': 1000 },
        'cm': { 'ft': 0.0328084, 'inch': 0.393701, 'mtr': 0.01, 'mm': 10 },
        'mm': { 'ft': 0.00328084, 'inch': 0.0393701, 'mtr': 0.001, 'cm': 0.1 }
    };

    if (factors[fromUnit] && factors[fromUnit][toUnit]) {
        return factors[fromUnit][toUnit];
    }
    return 1;
}

function getDimensionPower() {
    const type = document.getElementById('dimensionType').value;
    if (['widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(type)) return 3;
    if (['widthXheight', 'widthXdepth', 'lengthXdepth', 'lengthXheight', 'lengthXwidth'].includes(type)) return 2;
    return 1;
}

// --- OVERRIDES WITH CONDITIONAL CHECKS ---

const originalHandleMeasurementUnitChange = handleMeasurementUnitChange;

handleMeasurementUnitChange = function () {
    const newUnit = document.getElementById('measurementUnit').value;
    const oldUnit = currentDimensions.unit || 'ft';
    const rateInput = document.getElementById('rateManual');

    // CONDITION: Convert ONLY if AutoRate is ON AND Convert Button is OFF
    if (autoRateConversion && !isConvertModeActive() && rateInput.value && oldUnit !== newUnit) {
        const currentRate = parseFloat(rateInput.value);
        const power = getDimensionPower();
        const factor = getLinearFactor(oldUnit, newUnit);

        // Input Change: Rate DECREASES if unit gets smaller
        const conversionMultiplier = Math.pow(factor, power);
        const newRate = currentRate / conversionMultiplier;

        rateInput.value = parseFloat(newRate.toFixed(4));
        showNotification(`Rate converted: ${oldUnit} -> ${newUnit}`, "info");
    }

    originalHandleMeasurementUnitChange();
};

const originalHandleConvertUnitChange = handleConvertUnitChange;

handleConvertUnitChange = function () {
    const convertSelect = document.getElementById('convertUnit');
    const newConvertUnit = convertSelect.value;

    // 1. Update Global Variable (Original Functionality)
    currentConvertUnit = newConvertUnit;

    // 2. Auto Rate Conversion Logic
    const rateInput = document.getElementById('rateManual');

    // Determine source unit (Previous convert unit OR Base unit if starting from None)
    const oldConvertUnit = previousConvertUnit || 'none';
    const baseUnit = document.getElementById('measurementUnit').value;
    const sourceUnit = (oldConvertUnit === 'none') ? baseUnit : oldConvertUnit;

    // CONDITION: Convert only if AutoRate ON + Convert Button ON + Valid Values
    if (autoRateConversion && isConvertModeActive() && rateInput.value && newConvertUnit !== 'none') {
        const currentRate = parseFloat(rateInput.value);
        const power = getDimensionPower();
        const factor = getLinearFactor(sourceUnit, newConvertUnit);

        // Output Change: Rate INCREASES if unit gets larger (Divide by factor)
        // e.g. ft -> mtr (0.3048). Rate must increase. Rate / 0.3048 = Larger Rate.
        const conversionMultiplier = Math.pow(factor, power);

        if (conversionMultiplier !== 0) {
            const newRate = currentRate / conversionMultiplier;
            rateInput.value = parseFloat(newRate.toFixed(4));
            showNotification(`Rate converted to ${newConvertUnit}`, "info");
        }
    }

    // 3. Update Previous Unit Tracker
    previousConvertUnit = newConvertUnit;
};

const originalHandleDimensionTypeChange = handleDimensionTypeChange;
handleDimensionTypeChange = function () {
    originalHandleDimensionTypeChange();
    previousConvertUnit = document.getElementById('convertUnit').value;
};

// END AUTO RATE CONVERT

function toggleDimensionsDisplay() {
    showDimensions = !showDimensions;

    // Update all existing rows to reflect the new global setting
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id], #copyListManual tbody tr[data-id]');

    rows.forEach(row => {
        const cells = row.children;
        const particularsDiv = cells[1];
        const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
        const notes = particularsDiv.querySelector('.notes')?.textContent || '';

        // Get the stored dimension data
        const dimensionType = row.getAttribute('data-dimension-type') || 'none';
        const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
        const dimensionUnit = row.getAttribute('data-dimension-unit') || 'ft';
        const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
        const unit = cells[3].textContent;
        const rate = parseFloat(cells[4].textContent);
        const finalQuantity = parseFloat(cells[5].textContent) / rate; // Calculate back the final quantity

        // Recreate the particulars HTML with current showDimensions setting
        let particularsHtml = formatParticularsManual(
            itemName,
            notes,
            getDimensionDisplayText(dimensionType, dimensionValues, dimensionUnit),
            originalQuantity,
            finalQuantity,
            rate,
            dimensionType,
            dimensionUnit,
            unit
        );

        // Update the particulars cell
        cells[1].innerHTML = particularsHtml;

        // Reset per-row visibility to follow global setting
        if (showDimensions) {
            row.setAttribute('data-dimensions-visible', 'true');
        } else {
            row.setAttribute('data-dimensions-visible', 'false');
        }

        // Update toggle button icon in input table
        if (row.closest('#createListManual')) {
            const dimensionsBtn = row.querySelector('.dimensions-btn .material-icons');
            if (dimensionsBtn) {
                dimensionsBtn.textContent = showDimensions ? 'layers' : 'layers_clear';
            }
        }
    });

    // Also update the copy table
    const copyRows = document.querySelectorAll('#copyListManual tbody tr[data-id]');
    copyRows.forEach((row, index) => {
        const createRow = rows[index];
        if (createRow) {
            row.children[1].innerHTML = createRow.children[1].innerHTML;
        }
    });

    saveToLocalStorage();
    saveStateToHistory();

    // === NEW: UPDATE BUTTON STYLE DIRECTLY ===
    const btn = document.getElementById('toggleDimensionText');
    if (btn) {
        btn.style.backgroundColor = showDimensions ? 'var(--primary-color)' : '';
        btn.style.color = showDimensions ? 'white' : '';
    }
}

async function handleItemSearch() {
    const searchTerm = document.getElementById('itemNameManual').value.trim().toLowerCase();
    const suggestions = document.getElementById('item-suggestions');

    if (searchTerm.length < 1) {
        suggestions.style.display = 'none';
        return;
    }

    try {
        const items = await getAllFromDB('savedItems');

        if (!items || !Array.isArray(items)) {
            suggestions.style.display = 'none';
            return;
        }

        // Expanded Search Logic (Matches barcode, batch, etc.)
        const filtered = items.filter(item => {
            if (!item || !item.value) return false;

            const data = item.value;

            const name = (data.name || '').toLowerCase();
            const otherNames = (data.otherNames || '').toLowerCase();
            const barcode = (data.barcode || '').toLowerCase();
            const productCode = (data.productCode || '').toLowerCase();
            const sectionCode = (data.sectionCode || '').toLowerCase();
            const batchNumber = (data.batchNumber || '').toLowerCase();

            return name.includes(searchTerm) ||
                otherNames.includes(searchTerm) ||
                barcode.includes(searchTerm) ||
                productCode.includes(searchTerm) ||
                sectionCode.includes(searchTerm) ||
                batchNumber.includes(searchTerm);
        }).slice(0, 5);

        suggestions.innerHTML = '';
        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item-suggestion-item';

            // Only show Name + Stock (No extra info)
            const stockText = item.value.stockQuantity !== undefined ? ` (Stock: ${item.value.stockQuantity})` : '';
            div.textContent = item.value.name + stockText;

            div.onclick = () => selectItemSuggestion(item.value.name);
            suggestions.appendChild(div);
        });

        suggestions.style.display = filtered.length > 0 ? 'block' : 'none';
    } catch (error) {
        console.error('Error searching items:', error);
        suggestions.style.display = 'none';
    }
}

// Handle item selection from suggestions
function selectItemSuggestion(itemName) {
    document.getElementById('itemNameManual').value = itemName;
    document.getElementById('item-suggestions').style.display = 'none';

    // Trigger the existing item name input handler
    handleItemNameInput();
}

// Toggle More Options in Add Item Modal
function toggleMoreOptions() {
    const container = document.getElementById('more-options-container');
    const btn = document.getElementById('toggle-more-options-btn');
    const icon = btn.querySelector('.material-icons');

    if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.innerHTML = 'Hide Options <span class="material-icons">keyboard_arrow_up</span>';
        btn.style.backgroundColor = '#e0e0e0';
    } else {
        container.style.display = 'none';
        btn.innerHTML = 'More Options <span class="material-icons">keyboard_arrow_down</span>';
        btn.style.backgroundColor = '#f0f0f0';
    }
}

// Logic for Category Suggestions (Fetch from DB)
async function handleSavedCategorySearch() {
    const input = document.getElementById('saved-category');
    const suggestionsBox = document.getElementById('saved-category-suggestions');
    const searchTerm = input.value.trim().toLowerCase();

    if (searchTerm.length < 1) {
        suggestionsBox.style.display = 'none';
        return;
    }

    try {
        const allItems = await getAllFromDB('savedItems');
        // Extract unique categories
        const categories = [...new Set(allItems.map(item => item.value.category).filter(c => c))];

        const filtered = categories.filter(cat => cat.toLowerCase().includes(searchTerm)).slice(0, 5);

        suggestionsBox.innerHTML = '';

        if (filtered.length > 0) {
            filtered.forEach(cat => {
                const div = document.createElement('div');
                div.className = 'item-suggestion-item';
                div.textContent = cat;
                div.onclick = () => {
                    input.value = cat;
                    suggestionsBox.style.display = 'none';
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (error) {
        console.error('Error searching categories:', error);
        suggestionsBox.style.display = 'none';
    }
}

// --- Unit Suggestion Logic ---
const defaultUnits = ['nos', 'pair', 'pak', 'box', 'pouch', 'kg', 'g', 'ft', 'sqft', 'sheet', 'ltr', 'ml', 'pc', 'set'];

async function handleUnitSearch() {
    const input = document.getElementById('selectUnit');
    const suggestionsBox = document.getElementById('unit-suggestions');
    const searchTerm = input.value.trim().toLowerCase();

    try {
        // 1. Static Units (Your default list)
        const staticUnits = ['nos', 'pair', 'pak', 'box', 'pouch', 'kg', 'g', 'ft', 'sqft', 'sheet', 'ltr', 'ml', 'pc', 'set'];

        // 2. Fetch Dynamic Units from DB (Existing saved items)
        const allItems = await getAllFromDB('savedItems');
        const dbUnits = allItems.map(item => item.value.defaultUnit).filter(u => u);

        // 3. Merge and Deduplicate (Combine lists and remove duplicates)
        const uniqueUnits = [...new Set([...staticUnits, ...dbUnits])];

        // 4. Filter based on what user typed
        const filtered = uniqueUnits.filter(unit => unit.toLowerCase().includes(searchTerm)).slice(0, 5);

        suggestionsBox.innerHTML = '';

        if (filtered.length > 0) {
            filtered.forEach(unit => {
                const div = document.createElement('div');
                div.className = 'item-suggestion-item';
                div.textContent = unit;

                // When clicked, fill input and hide suggestions
                div.onclick = () => {
                    input.value = unit;
                    suggestionsBox.style.display = 'none';
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (error) {
        console.error("Error fetching units", error);
        suggestionsBox.style.display = 'none';
    }
}

function selectUnitSuggestion(unit) {
    document.getElementById('selectUnit').value = unit;
    document.getElementById('unit-suggestions').style.display = 'none';
}

// --- Saved Item Unit Suggestion Logic ---
// Updated Unit Suggestions (Static + DB Units)
async function handleSavedUnitSearch() {
    const input = document.getElementById('saved-select-unit');
    const suggestionsBox = document.getElementById('saved-unit-suggestions');
    const searchTerm = input.value.trim().toLowerCase();

    try {
        // 1. Static Units
        const staticUnits = ['nos', 'pair', 'pak', 'box', 'pouch', 'kg', 'g', 'ft', 'sqft', 'sheet', 'ltr', 'ml', 'pc', 'set'];

        // 2. Fetch Dynamic Units from DB
        const allItems = await getAllFromDB('savedItems');
        const dbUnits = allItems.map(item => item.value.defaultUnit).filter(u => u);

        // 3. Merge and Deduplicate
        const uniqueUnits = [...new Set([...staticUnits, ...dbUnits])];

        // 4. Filter
        const filtered = uniqueUnits.filter(unit => unit.toLowerCase().includes(searchTerm)).slice(0, 5);

        suggestionsBox.innerHTML = '';

        if (filtered.length > 0) {
            filtered.forEach(unit => {
                const div = document.createElement('div');
                div.className = 'item-suggestion-item';
                div.textContent = unit;
                div.onclick = () => {
                    input.value = unit;
                    suggestionsBox.style.display = 'none';
                };
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    } catch (error) {
        console.error("Error fetching units", error);
        suggestionsBox.style.display = 'none';
    }
}

function selectSavedUnitSuggestion(unit) {
    document.getElementById('saved-select-unit').value = unit;
    document.getElementById('saved-unit-suggestions').style.display = 'none';
}

async function handleItemNameInput() {
    const itemName = document.getElementById('itemNameManual').value.trim();
    if (!itemName) return;

    try {
        let item = await getFromDB('savedItems', itemName);

        if (!item) {
            const allItems = await getAllFromDB('savedItems');
            item = allItems.find(savedItem => {
                if (!savedItem.value.otherNames) return false;
                const otherNames = savedItem.value.otherNames.split(',').map(name => name.trim().toLowerCase());
                return otherNames.includes(itemName.toLowerCase());
            })?.value;
        }

        if (item) {
            document.getElementById('dimensionType').value = item.dimensionType || 'none';
            document.getElementById('quantityManual').value = item.defaultQuantity || 1;
            document.getElementById('selectUnit').value = item.defaultUnit || '';
            document.getElementById('itemNotesManual').value = item.notes || '';
            document.getElementById('hsnCodeManual').value = item.hsnCode || '';
            document.getElementById('productCodeManual').value = item.productCode || '';

            // --- UPDATED: Rate & Tax Logic with Priority ---
            let rateToFill = 0;
            let taxTypeToUse = 'exclusive';

            if (item.salePrice && item.salePrice > 0) {
                // Priority 1: Sale Price exists
                rateToFill = item.salePrice;
                taxTypeToUse = item.saleTaxType || 'exclusive';
            } else if (item.mrp && item.mrp > 0) {
                // Priority 2: Sale Price empty, MRP exists
                rateToFill = item.mrp;
                taxTypeToUse = item.mrpTaxType || 'exclusive';
            } else if (item.defaultRate > 0) {
                // Priority 3: Fallback
                rateToFill = item.defaultRate;
                taxTypeToUse = item.taxType || 'exclusive';
            }

            document.getElementById('rateManual').value = rateToFill > 0 ? rateToFill : '';

            // Set GST Toggle
            if (isGSTMode) {
                const gstBtn = document.getElementById('gstInclusiveBtn');
                if (gstBtn) {
                    if (taxTypeToUse === 'inclusive') {
                        isGSTInclusive = true;
                        gstBtn.textContent = 'Inclusive';
                        gstBtn.style.backgroundColor = '#27ae60';
                    } else {
                        isGSTInclusive = false;
                        gstBtn.textContent = 'Exclusive';
                        gstBtn.style.backgroundColor = '';
                    }
                }
            }
            // ----------------------------------------------

            if (item.dimensionValues) {
                document.getElementById('dimension1').value = parseFloat(item.dimensionValues[0]) || '';
                document.getElementById('dimension2').value = parseFloat(item.dimensionValues[1]) || '';
                document.getElementById('dimension3').value = parseFloat(item.dimensionValues[2]) || '';
            }

            let identifier = null;
            if (isGSTMode) {
                const displayGstin = document.getElementById('billToGstin').textContent.trim();
                const inputGstin = document.getElementById('consignee-gst').value.trim();
                if (displayGstin && displayGstin !== 'customer 15-digit GSTIN' && displayGstin !== 'N/A') {
                    identifier = displayGstin;
                } else if (inputGstin) {
                    identifier = inputGstin;
                }
            } else {
                identifier = document.getElementById('custName').value.trim();
            }

            let suggestedData = null;
            if (identifier && autoApplyCustomerRates) {
                suggestedData = await getCustomerRateSuggestion(identifier, itemName);
            }

            const discountContainer = document.getElementById('discount-inputs-container');
            const discountBtn = document.getElementById('toggleDiscountBtn');

            if (suggestedData) {
                document.getElementById('rateManual').value = suggestedData.rate;
                document.getElementById('discountType').value = suggestedData.discountType;
                document.getElementById('discountValue').value = suggestedData.discountValue;

                if (suggestedData.discountType !== 'none' && suggestedData.discountValue > 0) {
                    discountContainer.style.display = 'flex';
                    discountBtn.style.backgroundColor = '#27ae60';
                } else {
                    discountContainer.style.display = 'none';
                    discountBtn.style.backgroundColor = '';
                }
            } else {
                document.getElementById('discountType').value = item.discountType || 'none';
                document.getElementById('discountValue').value = item.discountValue || '';

                if (item.discountType && item.discountType !== 'none' && item.discountValue) {
                    discountContainer.style.display = 'flex';
                    discountBtn.style.backgroundColor = '#27ae60';
                } else {
                    discountContainer.style.display = 'none';
                    discountBtn.style.backgroundColor = '';
                }
            }

            currentDimensions.type = item.dimensionType || 'none';
            currentDimensions.unit = item.measurementUnit || 'ft';
            if (item.dimensionValues) {
                currentDimensions.values = [
                    parseFloat(item.dimensionValues[0]) || 0,
                    parseFloat(item.dimensionValues[1]) || 0,
                    parseFloat(item.dimensionValues[2]) || 0
                ];
            } else {
                currentDimensions.values = [0, 0, 0];
            }

            document.getElementById('measurementUnit').value = item.measurementUnit || 'ft';

            handleDimensionTypeChange();

            if (item.dimensionToggles) {
                if (document.getElementById('dimension1-toggle')) document.getElementById('dimension1-toggle').checked = item.dimensionToggles.toggle1 !== false;
                if (document.getElementById('dimension2-toggle')) document.getElementById('dimension2-toggle').checked = item.dimensionToggles.toggle2 !== false;
                if (document.getElementById('dimension3-toggle')) document.getElementById('dimension3-toggle').checked = item.dimensionToggles.toggle3 !== false;
            } else {
                if (document.getElementById('dimension1-toggle')) document.getElementById('dimension1-toggle').checked = true;
                if (document.getElementById('dimension2-toggle')) document.getElementById('dimension2-toggle').checked = true;
                if (document.getElementById('dimension3-toggle')) document.getElementById('dimension3-toggle').checked = true;
            }

            calculateDimensions();

            const dimensionContainer = document.getElementById('dimension-inputs-container');
            const dimensionBtn = document.getElementById('toggleDimensionBtn');

            if (item.dimensionType && item.dimensionType !== 'none') {
                dimensionContainer.style.display = 'flex';
                dimensionBtn.style.backgroundColor = '#3498db';
                const convertBtn = document.getElementById('toggleConvertBtn');
                if (convertBtn) convertBtn.style.display = 'inline-block';
            } else {
                dimensionContainer.style.display = 'none';
                dimensionBtn.style.backgroundColor = '';
                const convertBtn = document.getElementById('toggleConvertBtn');
                if (convertBtn) convertBtn.style.display = 'none';
            }

            document.getElementById('quantityManual').focus();
        }
    } catch (error) {
        console.error('Error checking saved item:', error);
    }
}

async function openManageItemsModal() {
    try {
        document.getElementById('manage-items-modal').style.display = 'block';
        await loadItemsList();
        toggleSettingsSidebar();
    } catch (error) {
        console.error('Error opening manage items modal:', error);
    }
}

function closeManageItemsModal() {
    document.getElementById('manage-items-modal').style.display = 'none';
}

function openAddItemModal() {
    currentlyEditingItemId = null;
    document.getElementById('add-item-modal-title').textContent = 'Add New Item';
    document.getElementById('save-item-btn').textContent = 'Save Item';

    // 1. Reset Standard Fields
    document.getElementById('saved-item-name').value = '';
    document.getElementById('saved-category').value = '';
    document.getElementById('saved-batch-number').value = '';
    document.getElementById('saved-section-code').value = '';
    document.getElementById('saved-barcode').value = '';

    // --- NEW: Reset Brand & Vendor ---
    document.getElementById('saved-brand-name').value = '';
    document.getElementById('saved-vendor-name').value = '';

    // --- NEW: Reset Sale Price & MRP ---
    document.getElementById('saved-sale-price').value = '';
    document.getElementById('saved-sale-tax-type').value = 'exclusive';
    document.getElementById('saved-mrp').value = '';
    document.getElementById('saved-mrp-tax-type').value = 'exclusive'; // Default Exclusive
    // ----------------------------------

    document.getElementById('saved-stock-quantity').value = '0';
    document.getElementById('saved-dimension-type').value = 'none';
    document.getElementById('saved-measurement-unit').value = 'ft';
    document.getElementById('saved-default-quantity').value = '1';
    document.getElementById('saved-select-unit').value = '';

    document.getElementById('saved-dimension1').value = '';
    document.getElementById('saved-dimension2').value = '';
    document.getElementById('saved-dimension3').value = '';

    document.getElementById('saved-hsn-code').value = '';
    document.getElementById('saved-product-code').value = '';
    document.getElementById('saved-purchase-rate').value = '';
    document.getElementById('saved-discount-type').value = 'none';
    document.getElementById('saved-discount-value').value = '';
    document.getElementById('saved-other-names').value = '';
    document.getElementById('saved-notes').value = '';

    // 2. Reset New Fields
    document.getElementById('saved-min-stock').value = '0';

    // 3. Reset UI State (Collapse "More Options")
    document.getElementById('more-options-container').style.display = 'none';
    document.getElementById('toggle-more-options-btn').innerHTML = 'More Options <span class="material-icons">keyboard_arrow_down</span>';

    // 4. Reset Suggestions Boxes (Good practice)
    document.getElementById('saved-category-suggestions').style.display = 'none';
    document.getElementById('saved-unit-suggestions').style.display = 'none';

    // 5. Force Dimension Toggles to Checked (Default for NEW items)
    if (document.getElementById('saved-dimension1-toggle')) document.getElementById('saved-dimension1-toggle').checked = true;
    if (document.getElementById('saved-dimension2-toggle')) document.getElementById('saved-dimension2-toggle').checked = true;
    if (document.getElementById('saved-dimension3-toggle')) document.getElementById('saved-dimension3-toggle').checked = true;

    // Reset Barcode Type
    if (document.getElementById('saved-barcode-type')) document.getElementById('saved-barcode-type').value = 'CODE_128';

    // 6. Update UI visibility based on reset values
    handleSavedDimensionTypeChange();
    document.getElementById('add-item-modal').style.display = 'block';
}

function closeAddItemModal() {
    document.getElementById('add-item-modal').style.display = 'none';
}

// Handle dimension type change in saved items modal
// FIND this function in index.js and REPLACE it with this version:
function handleSavedDimensionTypeChange() {
    // 1. Get Elements (Modal Specific IDs)
    const dimensionType = document.getElementById('saved-dimension-type').value;

    // TARGET THE CONTAINER DIV (Label + Select)
    const measurementUnitWrapper = document.getElementById('saved-measurement-unit-wrapper');
    const measurementUnitSelect = document.getElementById('saved-measurement-unit');

    const dimensionInputs = document.getElementById('saved-dimension-inputs');

    // Inputs
    const dim1 = document.getElementById('saved-dimension1');
    const dim2 = document.getElementById('saved-dimension2');
    const dim3 = document.getElementById('saved-dimension3');

    // Inputs Containers
    const inputs = document.querySelectorAll('#saved-dimension-inputs .dimension-input-with-toggle');

    // --- REMOVED THE FORCED RESET LOGIC HERE --- 
    // The lines setting .checked = true were deleted

    // Reset values only if they're not already set
    if (dim1 && !dim1.value) dim1.value = '';
    if (dim2 && !dim2.value) dim2.value = '';
    if (dim3 && !dim3.value) dim3.value = '';

    // --- VISIBILITY LOGIC ---
    if (dimensionType === 'none' || dimensionType === 'dozen') {
        // HIDE THE CONTAINER
        if (measurementUnitWrapper) measurementUnitWrapper.style.display = 'none';
        if (measurementUnitSelect) measurementUnitSelect.style.display = 'none';
        if (dimensionInputs) dimensionInputs.style.display = 'none';
    } else {
        // SHOW THE CONTAINER
        if (measurementUnitWrapper) measurementUnitWrapper.style.display = 'block';
        if (measurementUnitSelect) measurementUnitSelect.style.display = 'block';
        if (dimensionInputs) dimensionInputs.style.display = 'block';

        // Hide all inputs first
        inputs.forEach(input => input.style.display = 'none');

        // Show first input for all types
        if (inputs[0]) inputs[0].style.display = 'flex';
        if (dim1) dim1.style.display = 'inline-block';

        // Set placeholders based on dimension type
        switch (dimensionType) {
            case 'length':
                if (dim1) dim1.placeholder = 'Length';
                break;
            case 'widthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Height';
                break;
            case 'widthXheightXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Height';
                if (dim3) dim3.placeholder = 'Depth';
                break;
            case 'lengthXwidthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                if (dim3) dim3.placeholder = 'Height';
                break;
            case 'widthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Width';
                if (dim2) dim2.placeholder = 'Depth';
                break;
            case 'lengthXheightXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Height';
                if (dim3) dim3.placeholder = 'Depth';
                break;
            case 'lengthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Depth';
                break;
            case 'lengthXheight':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Height';
                break;
            case 'lengthXwidth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                break;
            case 'lengthXwidthXdepth':
                if (inputs[1]) inputs[1].style.display = 'flex';
                if (inputs[2]) inputs[2].style.display = 'flex';
                if (dim1) dim1.placeholder = 'Length';
                if (dim2) dim2.placeholder = 'Width';
                if (dim3) dim3.placeholder = 'Depth';
                break;
        }
    }
}

function updateSavedDimensionCalculation() {
    // Get dimension values
    const dim1 = parseFloat(document.getElementById('saved-dimension1').value) || 0;
    const dim2 = parseFloat(document.getElementById('saved-dimension2').value) || 0;
    const dim3 = parseFloat(document.getElementById('saved-dimension3').value) || 0;

    // Get toggle states
    const dim1Toggle = document.getElementById('saved-dimension1-toggle').checked;
    const dim2Toggle = document.getElementById('saved-dimension2-toggle').checked;
    const dim3Toggle = document.getElementById('saved-dimension3-toggle').checked;

    const dimensionType = document.getElementById('saved-dimension-type').value;

    // Calculate effective values based on toggles
    const effectiveV1 = dim1Toggle ? dim1 : 1;
    const effectiveV2 = dim2Toggle ? dim2 : 1;
    const effectiveV3 = dim3Toggle ? dim3 : 1;

    let calculatedArea = 0;

    switch (dimensionType) {
        case 'length':
            calculatedArea = effectiveV1;
            break;
        case 'widthXheight':
            calculatedArea = effectiveV1 * effectiveV2;
            break;
        case 'widthXheightXdepth':
            calculatedArea = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'lengthXwidthXheight':
            calculatedArea = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'widthXdepth':
            calculatedArea = effectiveV1 * effectiveV2;
            break;
        case 'lengthXheightXdepth':
            calculatedArea = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        case 'lengthXdepth':
            calculatedArea = effectiveV1 * effectiveV2;
            break;
        case 'lengthXheight':
            calculatedArea = effectiveV1 * effectiveV2;
            break;
        case 'lengthXwidth':
            calculatedArea = effectiveV1 * effectiveV2;
            break;
        case 'lengthXwidthXdepth':
            calculatedArea = effectiveV1 * effectiveV2 * effectiveV3;
            break;
        default:
            calculatedArea = 0;
    }

    // You can display this calculated area if needed, or use it for preview
    // For now, we'll just update the display values
    if (document.getElementById('saved-dimension1').value) {
        document.getElementById('saved-dimension1').value = dim1.toFixed(2);
    }
    if (document.getElementById('saved-dimension2').value && document.getElementById('saved-dimension2').style.display !== 'none') {
        document.getElementById('saved-dimension2').value = dim2.toFixed(2);
    }
    if (document.getElementById('saved-dimension3').value && document.getElementById('saved-dimension3').style.display !== 'none') {
        document.getElementById('saved-dimension3').value = dim3.toFixed(2);
    }
}
// Handle measurement unit change in saved items modal
function handleSavedMeasurementUnitChange() {
    // Unit conversion logic can be added here if needed
}
// Add this function to debug stock saving
async function debugStock() {
    const items = await getAllFromDB('savedItems');
    console.log('All items with stock:', items.map(item => ({
        name: item.value.name,
        stock: item.value.stockQuantity,
        hasStock: item.value.stockQuantity != null
    })));
}

async function editItem(itemName) {
    try {
        const item = await getFromDB('savedItems', itemName);
        if (item) {
            currentlyEditingItemId = itemName;
            document.getElementById('add-item-modal-title').textContent = 'Edit Item';
            document.getElementById('save-item-btn').textContent = 'Update Item';

            // Populate Fields
            document.getElementById('saved-item-name').value = item.name;
            document.getElementById('saved-category').value = item.category || '';
            document.getElementById('saved-min-stock').value = item.minStock || 0;
            document.getElementById('saved-batch-number').value = item.batchNumber || '';
            document.getElementById('saved-section-code').value = item.sectionCode || '';
            document.getElementById('saved-barcode').value = item.barcode || '';

            // --- NEW: Populate Brand & Vendor ---
            document.getElementById('saved-brand-name').value = item.brandName || '';
            document.getElementById('saved-vendor-name').value = item.vendorName || '';

            // --- NEW: Populate Sale Price & MRP ---
            document.getElementById('saved-sale-price').value = item.salePrice || item.defaultRate || '';
            document.getElementById('saved-sale-tax-type').value = item.saleTaxType || item.taxType || 'exclusive';

            document.getElementById('saved-mrp').value = item.mrp || '';
            document.getElementById('saved-mrp-tax-type').value = item.mrpTaxType || 'exclusive';
            // --------------------------------------

            document.getElementById('saved-stock-quantity').value = item.stockQuantity || 0;
            document.getElementById('saved-dimension-type').value = item.dimensionType || 'none';
            document.getElementById('saved-measurement-unit').value = item.measurementUnit || 'ft';
            document.getElementById('saved-default-quantity').value = item.defaultQuantity || 1;
            document.getElementById('saved-select-unit').value = item.defaultUnit || '';

            if (document.getElementById('saved-barcode-type')) document.getElementById('saved-barcode-type').value = item.barcodeType || 'CODE_128';

            if (item.dimensionValues) {
                document.getElementById('saved-dimension1').value = parseFloat(item.dimensionValues[0]) || '';
                document.getElementById('saved-dimension2').value = parseFloat(item.dimensionValues[1]) || '';
                document.getElementById('saved-dimension3').value = parseFloat(item.dimensionValues[2]) || '';
            } else {
                document.getElementById('saved-dimension1').value = '';
                document.getElementById('saved-dimension2').value = '';
                document.getElementById('saved-dimension3').value = '';
            }

            if (item.dimensionToggles) {
                if (document.getElementById('saved-dimension1-toggle')) document.getElementById('saved-dimension1-toggle').checked = item.dimensionToggles.toggle1;
                if (document.getElementById('saved-dimension2-toggle')) document.getElementById('saved-dimension2-toggle').checked = item.dimensionToggles.toggle2;
                if (document.getElementById('saved-dimension3-toggle')) document.getElementById('saved-dimension3-toggle').checked = item.dimensionToggles.toggle3;
            } else {
                if (document.getElementById('saved-dimension1-toggle')) document.getElementById('saved-dimension1-toggle').checked = true;
                if (document.getElementById('saved-dimension2-toggle')) document.getElementById('saved-dimension2-toggle').checked = true;
                if (document.getElementById('saved-dimension3-toggle')) document.getElementById('saved-dimension3-toggle').checked = true;
            }

            updateSavedDimensionCalculation();

            document.getElementById('saved-discount-type').value = item.discountType || 'none';
            document.getElementById('saved-discount-value').value = item.discountValue || '';
            document.getElementById('saved-hsn-code').value = item.hsnCode || '';
            document.getElementById('saved-product-code').value = item.productCode || '';
            document.getElementById('saved-purchase-rate').value = item.purchaseRate || '';
            document.getElementById('saved-other-names').value = item.otherNames || '';
            document.getElementById('saved-notes').value = item.notes || '';
            document.getElementById('more-options-container').style.display = 'none';
            document.getElementById('toggle-more-options-btn').innerHTML = 'More Options <span class="material-icons">keyboard_arrow_down</span>';

            handleSavedDimensionTypeChange();
            document.getElementById('add-item-modal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error editing item:', error);
        showNotification('Error loading item for editing');
    }
}

async function saveItem() {
    const itemName = document.getElementById('saved-item-name').value.trim();
    // Existing Fields
    const category = document.getElementById('saved-category').value.trim();
    const batchNumber = document.getElementById('saved-batch-number').value.trim();
    const sectionCode = document.getElementById('saved-section-code').value.trim();

    const brandName = document.getElementById('saved-brand-name').value.trim();
    const vendorName = document.getElementById('saved-vendor-name').value.trim();

    const barcode = document.getElementById('saved-barcode').value.trim();
    const barcodeType = document.getElementById('saved-barcode-type') ? document.getElementById('saved-barcode-type').value : 'CODE128';

    const salePrice = parseFloat(document.getElementById('saved-sale-price').value) || 0;
    const saleTaxType = document.getElementById('saved-sale-tax-type').value;
    const mrp = parseFloat(document.getElementById('saved-mrp').value) || 0;
    const mrpTaxType = document.getElementById('saved-mrp-tax-type').value;

    const dimensionType = document.getElementById('saved-dimension-type').value;
    const measurementUnit = document.getElementById('saved-measurement-unit').value;
    const defaultQuantity = parseFloat(document.getElementById('saved-default-quantity').value) || 1;
    const defaultUnit = document.getElementById('saved-select-unit').value.trim();
    // const defaultRate = parseFloat(document.getElementById('saved-default-rate').value) || 0;

    const discountType = document.getElementById('saved-discount-type').value;
    const discountValue = parseFloat(document.getElementById('saved-discount-value').value) || 0;
    const hsnCode = document.getElementById('saved-hsn-code').value.trim();

    const stockQuantity = parseInt(document.getElementById('saved-stock-quantity').value) || 0;
    const minStock = parseInt(document.getElementById('saved-min-stock').value) || 0;

    const productCode = document.getElementById('saved-product-code').value.trim();
    const purchaseRate = parseFloat(document.getElementById('saved-purchase-rate').value) || 0;
    const otherNames = document.getElementById('saved-other-names').value.trim();
    const notes = document.getElementById('saved-notes').value.trim();

    const dimension1 = parseFloat(document.getElementById('saved-dimension1').value) || 0;
    const dimension2 = parseFloat(document.getElementById('saved-dimension2').value) || 0;
    const dimension3 = parseFloat(document.getElementById('saved-dimension3').value) || 0;
    const dimensionValues = [dimension1, dimension2, dimension3];

    const toggleStates = {
        toggle1: document.getElementById('saved-dimension1-toggle') ? document.getElementById('saved-dimension1-toggle').checked : true,
        toggle2: document.getElementById('saved-dimension2-toggle') ? document.getElementById('saved-dimension2-toggle').checked : true,
        toggle3: document.getElementById('saved-dimension3-toggle') ? document.getElementById('saved-dimension3-toggle').checked : true
    };

    if (!itemName) {
        showNotification('Please enter an item name');
        return;
    }

    // --- UPDATED: Handle Stock History Logic ---
    let lastStockQuantity = 0;
    let lastStockUpdate = Date.now(); // Default for new items

    if (currentlyEditingItemId) {
        try {
            const oldItem = await getFromDB('savedItems', currentlyEditingItemId);
            if (oldItem) {
                const oldStock = parseInt(oldItem.stockQuantity) || 0;

                if (oldStock !== stockQuantity) {
                    // Stock changed manually: Archive old stock
                    lastStockQuantity = oldStock;
                    lastStockUpdate = Date.now();
                } else {
                    // Stock didn't change: Preserve existing history
                    lastStockQuantity = oldItem.lastStockQuantity !== undefined ? oldItem.lastStockQuantity : 0;
                    lastStockUpdate = oldItem.lastStockUpdate || Date.now();
                }
            }
        } catch (e) {
            console.error("Error fetching old item for stock history", e);
        }
    }
    // -------------------------------------------

    const itemData = {
        name: itemName,
        category: category,
        batchNumber: batchNumber,
        sectionCode: sectionCode,
        barcode: barcode,
        barcodeType: barcodeType,
        brandName: brandName,
        vendorName: vendorName,
        salePrice: salePrice,
        saleTaxType: saleTaxType,
        mrp: mrp,
        mrpTaxType: mrpTaxType,

        defaultRate: salePrice > 0 ? salePrice : mrp,
        taxType: saleTaxType,

        dimensionType: dimensionType,
        measurementUnit: measurementUnit,
        dimensionValues: dimensionValues,
        dimensionToggles: toggleStates,
        defaultQuantity: defaultQuantity,
        defaultUnit: defaultUnit,
        discountType: discountType,
        discountValue: discountValue,
        hsnCode: hsnCode,

        stockQuantity: stockQuantity,
        minStock: minStock,
        // Save history fields
        lastStockQuantity: lastStockQuantity,
        lastStockUpdate: lastStockUpdate,

        productCode: productCode,
        purchaseRate: purchaseRate,
        otherNames: otherNames,
        notes: notes,
        timestamp: Date.now()
    };

    try {
        if (currentlyEditingItemId && currentlyEditingItemId !== itemName) {
            await removeFromDB('savedItems', currentlyEditingItemId);
        }
        await setInDB('savedItems', itemName, itemData);
        closeAddItemModal();
        await loadItemsList();
    } catch (error) {
        console.error('Error saving item:', error);
    }
}

// Batch Invoice Functions
function openBatchInvoiceModal() {
    toggleSettingsSidebar();
    document.getElementById('batch-invoice-modal').style.display = 'block';
}

function closeBatchInvoiceModal() {
    document.getElementById('batch-invoice-modal').style.display = 'none';
}

async function generateBatchInvoice() {
    const input = document.getElementById('batch-invoice-input').value.trim();

    if (!input) {
        showNotification('Please enter product data', 'error');
        return;
    }

    try {
        // Remove brackets and parse the input
        const cleanInput = input.replace(/[\[\]]/g, '');

        // Parse the input handling quoted strings with commas
        const items = [];
        let currentItem = '';
        let insideQuotes = false;

        for (let i = 0; i < cleanInput.length; i++) {
            const char = cleanInput[i];

            if (char === '"') {
                insideQuotes = !insideQuotes;
                currentItem += char;
            } else if (char === ',' && !insideQuotes) {
                items.push(currentItem.trim());
                currentItem = '';
            } else {
                currentItem += char;
            }
        }

        // Push the last item
        if (currentItem.trim()) {
            items.push(currentItem.trim());
        }

        if (items.length < 4) {
            showNotification('Invalid format. Need at least 2 products + contact + customer name + address', 'error');
            return;
        }

        // Extract components (last 3 elements: contact, name, address)
        const address = items[items.length - 1].replace(/"/g, '').trim();
        const customerName = items[items.length - 2].replace(/"/g, '').trim();
        const contactNumber = items[items.length - 3].trim();
        const productItems = items.slice(0, items.length - 3);

        // Fill customer details
        document.getElementById('custName').value = customerName;
        document.getElementById('custPhone').value = contactNumber;
        document.getElementById('custAddr').value = address;

        // Process each product
        let addedCount = 0;
        for (const item of productItems) {
            const [productCode, quantity] = item.split('@');

            if (!productCode || !quantity) {
                console.warn('Invalid item format:', item);
                continue;
            }

            await addItemByProductCode(productCode.trim(), parseFloat(quantity.trim()));
            addedCount++;
        }

        closeBatchInvoiceModal();
        showNotification(`Added ${addedCount} items for ${customerName}`, 'success');

    } catch (error) {
        console.error('Error generating batch invoice:', error);
        showNotification('Error processing batch invoice', 'error');
    }
}

async function addItemByProductCode(productCode, quantity) {
    try {
        // Search for item by product code
        const allItems = await getAllFromDB('savedItems');
        const item = allItems.find(savedItem =>
            savedItem.value.productCode === productCode
        );

        if (!item) {
            console.warn('Product not found:', productCode);
            showNotification(`Product ${productCode} not found`, 'warning');
            return;
        }

        // Fill the manual input fields with item data
        document.getElementById('itemNameManual').value = item.value.name;
        document.getElementById('quantityManual').value = quantity;
        document.getElementById('selectUnit').value = item.value.defaultUnit || '';
        document.getElementById('rateManual').value = item.value.defaultRate || '';
        document.getElementById('itemNotesManual').value = item.value.notes || '';
        document.getElementById('hsnCodeManual').value = item.value.hsnCode || '';
        document.getElementById('productCodeManual').value = item.value.productCode || '';
        document.getElementById('discountType').value = item.value.discountType || 'none';
        document.getElementById('discountValue').value = item.value.discountValue || '';

        // Handle dimensions
        document.getElementById('dimensionType').value = item.value.dimensionType || 'none';
        if (item.value.dimensionType && item.value.dimensionType !== 'none') {
            document.getElementById('measurementUnit').value = item.value.measurementUnit || 'ft';

            if (item.value.dimensionValues) {
                document.getElementById('dimension1').value = parseFloat(item.value.dimensionValues[0]) || '';
                document.getElementById('dimension2').value = parseFloat(item.value.dimensionValues[1]) || '';
                document.getElementById('dimension3').value = parseFloat(item.value.dimensionValues[2]) || '';
            }

            // Show dimension inputs if needed
            document.getElementById('dimension-inputs-container').style.display = 'flex';
            document.getElementById('toggleDimensionBtn').style.backgroundColor = '#3498db';
            handleDimensionTypeChange();
        }

        // Show discount inputs if needed
        if (item.value.discountType && item.value.discountType !== 'none') {
            document.getElementById('discount-inputs-container').style.display = 'flex';
            document.getElementById('toggleDiscountBtn').style.backgroundColor = '#27ae60';
        }

        // Add the item to table
        await addRowManual();

    } catch (error) {
        console.error('Error adding item by product code:', error);
        throw error;
    }
}

async function reduceStockOnSave() {
    try {
        const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');

        for (const row of rows) {
            const itemName = row.children[1].querySelector('.itemNameClass')?.textContent.trim();
            const quantity = parseFloat(row.getAttribute('data-original-quantity')) || parseFloat(row.children[2].textContent);

            if (itemName && quantity > 0) {
                const savedItem = await getFromDB('savedItems', itemName);
                if (savedItem && savedItem.stockQuantity !== undefined) {
                    const newStock = Math.max(0, savedItem.stockQuantity - quantity);
                    savedItem.stockQuantity = newStock;
                    await setInDB('savedItems', itemName, savedItem);
                }
            }
        }
    } catch (error) {
        console.error('Error reducing stock:', error);
    }
}
// --- New UI Helper Functions ---

// Toggle Details Visibility
function toggleCardDetails(btn) {
    // Find the parent card
    const card = btn.closest('.item-card, .customer-card, .saved-bill-card');
    // Find the details section within that card
    const details = card.querySelector('.details-section');
    const icon = btn.querySelector('.material-icons');

    if (details.classList.contains('hidden')) {
        // Show details
        details.classList.remove('hidden');
        icon.textContent = 'keyboard_arrow_up';
    } else {
        // Hide details
        details.classList.add('hidden');
        icon.textContent = 'keyboard_arrow_down';
    }
}

// Toggle Action Menu
function toggleActionMenu(event, menuId) {
    event.stopPropagation(); // Prevent event bubbling

    // Close any other open menus first
    closeAllActionMenus();

    const menu = document.getElementById(menuId);
    if (menu) {
        menu.classList.toggle('show');
    }
}

// Close all menus (used when clicking outside)
function closeAllActionMenus() {
    document.querySelectorAll('.action-dropdown.show').forEach(menu => {
        menu.classList.remove('show');
    });
}

// Global listener to close menus when clicking anywhere else
document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-menu-container')) {
        closeAllActionMenus();
    }
});

async function loadItemsList() {
    try {
        const items = await getAllFromDB('savedItems');
        const itemsList = document.getElementById('items-list');
        itemsList.innerHTML = '';

        if (items.length === 0) {
            itemsList.innerHTML = '<div class="item-card">No items saved yet</div>';
            return;
        }

        // Helper function to format date: dd-mm-yy, hh:mm AM/PM
        const formatStockDate = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear()).slice(-2);

            let h = d.getHours();
            const m = String(d.getMinutes()).padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12; // Convert 0 to 12

            return `${day}-${month}-${year}, ${h}:${m} ${ampm}`;
        };

        items.forEach(item => {
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';

            const safeName = item.value.name.replace(/[^a-zA-Z0-9]/g, '-');
            const menuId = `menu-item-${safeName}-${Date.now()}`;

            let dimensionInfo = '';
            let unitInfo = '';
            if (item.value.dimensionType && item.value.dimensionType !== 'none') {
                dimensionInfo += `<div>Dimension Type: ${item.value.dimensionType}</div>`;
                unitInfo = `<div>Measurement Unit: ${item.value.measurementUnit || 'ft'}</div>`;
                if (item.value.dimensionValues) {
                    const [v1, v2, v3] = item.value.dimensionValues;
                    dimensionInfo += `<div>Dimension Values: ${v1}, ${v2}, ${v3}</div>`;
                }
            }

            // --- UPDATED: Stock Info with History ---
            let stockInfo = '';
            if (item.value.stockQuantity !== undefined) {
                const updateTimeStr = item.value.lastStockUpdate ? formatStockDate(item.value.lastStockUpdate) : '';
                const updateDisplay = updateTimeStr ? ` <span style="font-size:0.85em; color:#666;">(Updated: ${updateTimeStr})</span>` : '';

                stockInfo = `<div>Stock: ${item.value.stockQuantity}${updateDisplay}</div>`;

                if (item.value.lastStockQuantity !== undefined) {
                    stockInfo += `<div>Last Stock: ${item.value.lastStockQuantity}</div>`;
                }
            }
            // ----------------------------------------

            let discountInfo = (item.value.discountType && item.value.discountType !== 'none') ? `<div>Discount: ${item.value.discountType} - ${item.value.discountValue}</div>` : '';
            let notesInfo = (item.value.notes && item.value.notes !== 'None' && item.value.notes.trim() !== '') ? `<div>Notes: ${item.value.notes}</div>` : '';

            let otherNamesInfo = item.value.otherNames ? `<div>Other Names: ${item.value.otherNames}</div>` : '';
            let hsnInfo = item.value.hsnCode ? `<div>HSN/SAC: ${item.value.hsnCode}</div>` : '';
            let productCodeInfo = item.value.productCode ? `<div>Product Code: ${item.value.productCode}</div>` : '';
            let purchaseRateInfo = item.value.purchaseRate ? `<div>Purchase Rate: ₹${item.value.purchaseRate}</div>` : '';

            let categoryInfo = item.value.category ? `<div>Category: ${item.value.category}</div>` : '';
            let brandInfo = item.value.brandName ? `<div>Brand: ${item.value.brandName}</div>` : '';
            let vendorInfo = item.value.vendorName ? `<div>Vendor: ${item.value.vendorName}</div>` : '';

            let saleInfo = item.value.salePrice
                ? `<div>Sale Price: ₹${item.value.salePrice} <span style="font-size:0.85em; color:#666;">(${item.value.saleTaxType})</span></div>`
                : '';
            let mrpInfo = item.value.mrp
                ? `<div>MRP: ₹${item.value.mrp} <span style="font-size:0.85em; color:#666;">(${item.value.mrpTaxType})</span></div>`
                : '';

            let batchInfo = item.value.batchNumber ? `<div>Batch: ${item.value.batchNumber}</div>` : '';
            let sectionInfo = item.value.sectionCode ? `<div>Section: ${item.value.sectionCode}</div>` : '';

            let taxTypeInfo = item.value.taxType ? ` <span style="font-size:0.85em; color:#666;">(Default: ${item.value.taxType})</span>` : '';

            let codeOptions = '';
            if (item.value.productCode) {
                codeOptions += `
                <button class="dropdown-item" onclick="openCodeModal('qr', '${item.value.productCode}', '${item.value.name}', 'Product Code')">
                    <span class="material-icons">qr_code_2</span> Product Code QR
                </button>`;
            }
            if (item.value.sectionCode) {
                codeOptions += `
                <button class="dropdown-item" onclick="openCodeModal('qr', '${item.value.sectionCode}', '${item.value.name}', 'Section Code')">
                    <span class="material-icons">qr_code_2</span> Section Code QR
                </button>`;
            }
            if (item.value.barcode) {
                const bType = item.value.barcodeType || 'CODE128';
                codeOptions += `
                <button class="dropdown-item" onclick="openCodeModal('barcode', '${item.value.barcode}', '${item.value.name}', '${bType}')">
                    <span class="material-icons">view_week</span> View Barcode
                </button>`;
            }

            itemCard.innerHTML = `
                <div class="card-header-row">
                    <div class="card-info">${item.value.name}</div>
                    
                    <div class="card-controls">
                        <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                        
                        <div class="action-menu-container">
                            <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="${menuId}" class="action-dropdown">
                                <button class="dropdown-item" onclick="openAddStockModal('${item.value.name}')">
                                    <span class="material-icons">add_box</span> Add Stock
                                </button>
                                <button class="dropdown-item" onclick="editItem('${item.value.name}')">
                                    <span class="material-icons">edit</span> Edit
                                </button>
                                
                                ${codeOptions}
                                
                                <button class="dropdown-item delete-item" onclick="deleteItem('${item.value.name}')">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section hidden item-details">
                    ${categoryInfo}
                    ${brandInfo}
                    ${vendorInfo}
                    ${saleInfo}
                    ${mrpInfo}
                    ${batchInfo}
                    ${sectionInfo}
                    ${dimensionInfo}
                    ${unitInfo}
                    <div>Default Quantity: ${item.value.defaultQuantity || 1}</div>
                    <div>Default Unit: ${item.value.defaultUnit}</div>
                    ${stockInfo}
                    ${productCodeInfo}
                    ${hsnInfo}
                    ${purchaseRateInfo}
                    ${discountInfo}
                    ${otherNamesInfo}
                    ${notesInfo}
                </div>
            `;
            itemsList.appendChild(itemCard);
        });
    } catch (error) {
        console.error('Error loading items list:', error);
    }
}

function searchItems() {
    const searchTerm = document.getElementById('item-search').value.toLowerCase();
    const itemCards = document.querySelectorAll('.item-card');

    itemCards.forEach(card => {
        const nameEl = card.querySelector('.card-info');
        const detailsEl = card.querySelector('.details-section');

        const itemName = nameEl ? nameEl.textContent.toLowerCase() : '';
        // Since Category, Batch, and Section are added to detailsHtml, this search covers them!
        const itemDetails = detailsEl ? detailsEl.textContent.toLowerCase() : '';

        if (itemName.includes(searchTerm) || itemDetails.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

async function deleteItem(itemName) {
    const shouldDeleteItem = await showConfirm(`Are you sure you want to delete "${itemName}"?`)
    if (shouldDeleteItem) {
        try {
            await removeFromDB('savedItems', itemName);
            // await loadSavedItems();
            await loadItemsList();
        } catch (error) {
            console.error('Error deleting item:', error);
        }
    }
}

// --- Code Generation Logic ---

function openCodeModal(type, codeValue, itemName, meta) {
    const modal = document.getElementById('code-display-modal');
    const container = document.getElementById('code-canvas-container');
    const headerTitle = document.getElementById('code-modal-title');
    const cardTitle = document.getElementById('code-product-name-display');
    const textDisplay = document.getElementById('code-text-display');

    // Reset
    container.innerHTML = '';
    headerTitle.textContent = meta || 'Code View';
    cardTitle.textContent = itemName;
    textDisplay.textContent = codeValue;

    if (type === 'qr') {
        const qrDiv = document.createElement('div');
        container.appendChild(qrDiv);

        // 1. GENERATE AT HIGH RESOLUTION (600x600)
        // This creates plenty of pixels for a sharp result
        new QRCode(qrDiv, {
            text: codeValue,
            width: 600,
            height: 600,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // 2. VISUALLY SCALE DOWN
        // CSS makes it fit the modal, but the image data remains high-res
        const qrImg = qrDiv.querySelector('img');
        if (qrImg) {
            qrImg.style.width = "200px";
            qrImg.style.height = "auto";
        }

        // Add meta label
        const label = document.createElement('div');
        label.textContent = meta;
        label.style.fontSize = '0.8em';
        label.style.color = '#666';
        label.style.marginTop = '5px';
        textDisplay.appendChild(label);

    } else if (type === 'barcode') {
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);

        let format = meta.replace('_', '');
        if (format === 'UPCA') format = 'UPC';

        try {
            // 1. GENERATE AT HIGH RESOLUTION
            // Thicker bars (width: 4) and taller height ensure crisp rendering
            JsBarcode(canvas, codeValue, {
                format: format,
                lineColor: "#000",
                width: 4,
                height: 150,
                displayValue: false,
                margin: 10
            });

            // 2. VISUALLY SCALE DOWN
            canvas.style.maxWidth = "100%";
            canvas.style.height = "100px"; // Visual height

        } catch (e) {
            console.error("Barcode generation error", e);
            container.innerHTML = '<p style="color:red">Invalid format for this barcode type</p>';
        }

        const label = document.createElement('div');
        label.textContent = meta;
        label.style.fontSize = '0.7em';
        label.style.color = '#888';
        label.style.marginTop = '2px';
        textDisplay.appendChild(label);
    }

    modal.style.display = 'block';

    const sidebar = document.getElementById("settings-sidebar");
    if (sidebar) sidebar.classList.remove("open");
}

function closeCodeModal() {
    document.getElementById('code-display-modal').style.display = 'none';
}

function downloadCodeImage() {
    // Check if html2canvas is loaded
    if (typeof html2canvas === 'undefined') {
        showNotification("Error: html2canvas library is missing.", "error");
        return;
    }

    const element = document.getElementById('printable-code-card');
    const itemName = document.getElementById('code-product-name-display').textContent;
    const safeName = itemName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const code = document.getElementById('code-text-display').innerText.split('\n')[0];

    html2canvas(element, {
        scale: 5, // SCALE 5: Captures at 5x screen resolution (Very Sharp)
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `${safeName}-${code}.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }).catch(err => {
        console.error("Download failed:", err);
        showNotification("Image generation failed", "error");
    });
}

//Useless loadsaved function 
async function loadSavedCustomers() {
    // We no longer use the <datalist>, so we don't need to populate HTML here.
    // The new suggestion box fetches data dynamically when you type.
    try {
        // Just ensuring DB connection works
        await getAllFromDB('savedCustomers');
    } catch (error) {
        console.error('Error checking saved customers:', error);
    }
}

async function handleCustomerNameInput() {
    const customerName = document.getElementById('custName').value.trim();
    if (!customerName) return;

    try {
        const customer = await getFromDB('savedCustomers', customerName);
        if (customer) {
            document.getElementById('custAddr').value = customer.address || '';
            document.getElementById('custPhone').value = customer.phone || '';
            document.getElementById('custGSTIN').value = customer.gstin || '';
            saveToLocalStorage();
        }
    } catch (error) {
        console.error('Error checking saved customer:', error);
    }
}


// Open Manage Customers Modal
function openManageCustomersModal() {
    document.getElementById('manage-customers-modal').style.display = 'block';

    // Reset to regular mode by default
    document.getElementById('customer-mode-toggle').checked = false;
    currentCustomerMode = 'regular';
    document.getElementById('add-customer-main-btn').textContent = 'Add New Customer';

    // LOAD REGULAR CUSTOMERS INITIALLY
    loadCustomersList();
    toggleSettingsSidebar();
}


function closeManageCustomersModal() {
    document.getElementById('manage-customers-modal').style.display = 'none';
}

function openAddCustomerModal() {
    currentlyEditingCustomerId = null;
    document.getElementById('add-customer-modal-title').textContent = 'Add New Customer';
    document.getElementById('save-customer-btn').textContent = 'Save Customer';

    document.getElementById('saved-customer-name').value = '';
    document.getElementById('saved-customer-address').value = '';
    document.getElementById('saved-customer-phone').value = '';
    document.getElementById('saved-customer-gstin').value = '';

    document.getElementById('add-customer-modal').style.display = 'block';
}

function closeAddCustomerModal() {
    document.getElementById('add-customer-modal').style.display = 'none';
    currentlyEditingCustomerId = null; // ADD THIS LINE
}

async function saveCustomer() {
    const customerName = document.getElementById('saved-customer-name').value.trim();
    const address = document.getElementById('saved-customer-address').value.trim();
    const phone = document.getElementById('saved-customer-phone').value.trim();
    const gstin = document.getElementById('saved-customer-gstin').value.trim();

    if (!customerName) {
        showNotification('Please enter a customer name', 'error');
        return;
    }

    // Check for duplicate customer (case-insensitive)
    const existingCustomers = await getAllFromDB('savedCustomers');
    const customerExists = existingCustomers.some(customer =>
        customer.value.name.toLowerCase() === customerName.toLowerCase()
    );

    // If editing and name changed, or creating new and name exists
    if ((currentlyEditingCustomerId && customerName.toLowerCase() !== currentlyEditingCustomerId.toLowerCase()) ||
        (!currentlyEditingCustomerId && customerExists)) {
        showNotification('Customer already exists! Please use a different name.', 'error');
        return;
    }

    const customerData = {
        name: customerName,
        address: address,
        phone: phone,
        gstin: gstin,
        timestamp: Date.now()
    };

    try {
        // CHECK IF EDITING EXISTING CUSTOMER
        if (currentlyEditingCustomerId) {
            // UPDATE existing customer
            await setInDB('savedCustomers', currentlyEditingCustomerId, customerData);
            showNotification('Customer updated successfully!', 'success');
        } else {
            // CREATE new customer
            await setInDB('savedCustomers', customerName, customerData);
            showNotification('Customer saved successfully!', 'success');
        }

        await loadSavedCustomers();
        closeAddCustomerModal();
        // RESET editing state
        currentlyEditingCustomerId = null;
        await loadCustomersList();
    } catch (error) {
        console.error('Error saving customer:', error);
    }
}
//load regular mode customers
async function loadCustomersList() {
    try {
        const customers = await getAllFromDB('savedCustomers');
        const customersList = document.getElementById('customers-list');
        customersList.innerHTML = '';

        if (customers.length === 0) {
            customersList.innerHTML = '<div class="customer-card">No regular customers saved yet</div>';
            return;
        }

        customers.forEach(customer => {
            const customerCard = document.createElement('div');
            customerCard.className = 'customer-card';

            const safeName = customer.value.name.replace(/[^a-zA-Z0-9]/g, '-');
            const menuId = `menu-cust-${safeName}-${Date.now()}`;

            customerCard.innerHTML = `
                <div class="card-header-row">
                    <div class="card-info">${customer.value.name}</div>
                    
                    <div class="card-controls">
                        <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                        
                        <div class="action-menu-container">
                            <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="${menuId}" class="action-dropdown">
                                <button class="dropdown-item" onclick="openPaymentDialog('${customer.value.name}', '${customer.value.gstin || ''}')">
                                    <span class="material-icons">payments</span> Payment & CN
                                </button>
                                <button class="dropdown-item" onclick="openLedgerDialog('${customer.value.name}', '${customer.value.gstin || ''}')">
                                    <span class="material-icons">book</span> Ledger
                                </button>
                                <button class="dropdown-item" onclick="editCustomer('${customer.value.name}')">
                                    <span class="material-icons">edit</span> Edit
                                </button>
                                <button class="dropdown-item delete-item" onclick="deleteCustomer('${customer.value.name}')">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section hidden customer-details-text">
                    <div>Address: ${customer.value.address || 'Not provided'}</div>
                    <div>Phone: ${customer.value.phone || 'Not provided'}</div>
                    <div>GSTIN: ${customer.value.gstin || 'Not provided'}</div>
                </div>
            `;
            customersList.appendChild(customerCard);
        });
    } catch (error) {
        console.error('Error loading customers list:', error);
    }
}

// Search Customers (works for both regular and GST)
function searchCustomers() {
    const searchTerm = document.getElementById('customer-search').value.toLowerCase();
    const customerCards = document.querySelectorAll('#customers-list .customer-card');

    customerCards.forEach(card => {
        const nameEl = card.querySelector('.card-info');
        const detailsEl = card.querySelector('.details-section');

        const customerName = nameEl ? nameEl.textContent.toLowerCase() : '';
        const customerDetails = detailsEl ? detailsEl.textContent.toLowerCase() : '';

        if (customerName.includes(searchTerm) || customerDetails.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}
async function handleRegularCustomerSearch() {
    const input = document.getElementById('custName');
    const suggestions = document.getElementById('regular-customer-suggestions');
    const searchTerm = input.value.trim();

    if (searchTerm.length < 1) {
        suggestions.style.display = 'none';
        return;
    }

    try {
        const allCustomers = await getAllFromDB('savedCustomers');

        // Filter customers
        const filtered = allCustomers.filter(customer =>
            customer.value.name.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 5);

        suggestions.innerHTML = '';

        if (filtered.length > 0) {
            filtered.forEach(customer => {
                const div = document.createElement('div');
                div.className = 'customer-suggestion-item';
                div.textContent = customer.value.name; // Display Name

                // Click handler
                div.onclick = () => selectRegularCustomer(customer.value);

                suggestions.appendChild(div);
            });
            suggestions.style.display = 'block';
        } else {
            suggestions.style.display = 'none';
        }

        // Also trigger the existing logic for rate suggestions
        window.currentCustomer = searchTerm;

    } catch (error) {
        console.error('Error searching regular customers:', error);
        suggestions.style.display = 'none';
    }
}

async function selectRegularCustomer(customer) {
    // 1. Fill Fields
    document.getElementById('custName').value = customer.name;
    document.getElementById('custAddr').value = customer.address || '';
    document.getElementById('custPhone').value = customer.phone || '';
    document.getElementById('custGSTIN').value = customer.gstin || '';

    // 2. Hide Suggestions
    document.getElementById('regular-customer-suggestions').style.display = 'none';

    // 3. Save & Trigger updates
    await saveToLocalStorage();

    // 4. Trigger Rate Application
    window.currentCustomer = customer.name;
    if (typeof checkAndApplyCustomerRates === 'function') {
        await checkAndApplyCustomerRates(customer.name);
    }
}

// Search Bills (works for both regular and GST)
function searchSavedBills() {
    const searchTerm = document.getElementById('saved-bills-search').value.toLowerCase();
    const billCards = document.querySelectorAll('#saved-bills-list .saved-bill-card');

    billCards.forEach(card => {
        const infoEl = card.querySelector('.card-info');
        const subInfoEl = card.querySelector('.card-sub-info');
        const detailsEl = card.querySelector('.details-section');

        const billTitle = infoEl ? infoEl.textContent.toLowerCase() : '';
        const billTotal = subInfoEl ? subInfoEl.textContent.toLowerCase() : '';
        const billDetails = detailsEl ? detailsEl.textContent.toLowerCase() : '';

        if (billTitle.includes(searchTerm) || billTotal.includes(searchTerm) || billDetails.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}
async function editCustomer(customerName) {
    try {
        const customer = await getFromDB('savedCustomers', customerName);
        if (customer) {
            currentlyEditingCustomerId = customerName;
            document.getElementById('add-customer-modal-title').textContent = 'Edit Customer';
            document.getElementById('save-customer-btn').textContent = 'Update Customer';

            // PROPERLY FILL ALL FORM FIELDS
            document.getElementById('saved-customer-name').value = customer.name;
            document.getElementById('saved-customer-address').value = customer.address || '';
            document.getElementById('saved-customer-phone').value = customer.phone || '';
            document.getElementById('saved-customer-gstin').value = customer.gstin || '';

            document.getElementById('add-customer-modal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error editing customer:', error);
        showNotification('Error loading customer for editing', 'error');
    }
}

async function deleteCustomer(customerName) {
    const shouldDeleteCustomer = await showConfirm(`Are you sure you want to delete "${customerName}"?`)
    if (shouldDeleteCustomer) {
        try {
            await removeFromDB('savedCustomers', customerName);
            await loadSavedCustomers();
            await loadCustomersList();
        } catch (error) {
            console.error('Error deleting customer:', error);
        }
    }
}

async function autoSaveRegularCustomer(customerName) {
    // Check if customer already exists in regular customers (case-insensitive)
    const existingCustomers = await getAllFromDB('savedCustomers');
    const customerExists = existingCustomers.some(customer =>
        customer.value.name.toLowerCase() === customerName.toLowerCase()
    );

    if (customerExists) {
        console.log('Customer already exists, skipping auto-save');
        return;
    }

    // Create customer data
    const customerData = {
        name: customerName,
        address: document.getElementById('custAddr').value || '',
        phone: document.getElementById('custPhone').value || '',
        gstin: document.getElementById('custGSTIN').value || '',
        timestamp: Date.now()
    };

    try {
        await setInDB('savedCustomers', customerName, customerData);
        await loadSavedCustomers(); // Refresh the customer list
        console.log('Customer auto-saved:', customerName);
    } catch (error) {
        console.error('Error auto-saving customer:', error);
    }
}

// Check for duplicate bill/invoice numbers
async function checkDuplicateBillNumber(number, type) {
    try {
        const storeName = type === 'gst' ? 'gstSavedBills' : 'savedBills';
        const savedBills = await getAllFromDB(storeName);

        for (const bill of savedBills) {
            if (type === 'gst') {
                if (bill.value.invoiceDetails && bill.value.invoiceDetails.number === number) {
                    return true;
                }
            } else {
                if (bill.value.customer && bill.value.customer.billNo === number) {
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking duplicate bill number:', error);
        return false;
    }
}

// Reset edit mode
function resetEditMode() {
    editMode = false;
    currentEditingBillId = null;
    currentEditingBillType = null;
    updateSaveButtonAppearance();
}

// Update save button appearance
function updateSaveButtonAppearance() {
    const saveBtn = document.querySelector('.settings-btn[onclick="saveCurrentBill()"]');
    if (saveBtn) {
        if (editMode) {
            saveBtn.style.backgroundColor = '#27ae60'; // Green
            saveBtn.innerHTML = '<span class="material-icons">save</span>UPDATE BILL';
        } else {
            saveBtn.style.backgroundColor = ''; // Default
            saveBtn.innerHTML = '<span class="material-icons">save</span>SAVE BILL';
        }
    }
}

// Set edit mode
function setEditMode(billId, billType) {
    editMode = true;
    currentEditingBillId = billId;
    currentEditingBillType = billType;
    updateSaveButtonAppearance();
}

async function editSavedBill(billId, billType, event) {
    if (event) event.stopPropagation();
    // CLEAR CURRENT DATA AND SAVE TO HISTORY FIRST
    await clearAllData(true); // true = silent mode

    // Set edit mode FIRST
    setEditMode(billId, billType);

    // Store original bill number for duplicate checking
    let savedBill;
    if (billType === 'regular') {
        savedBill = await getFromDB('savedBills', billId);
        window.currentEditingBillOriginalNumber = savedBill?.customer?.billNo;
    } else {
        savedBill = await getFromDB('gstSavedBills', billId);
        window.currentEditingBillOriginalNumber = savedBill?.invoiceDetails?.number;
    }

    // SWITCH MODE BASED ON BILL TYPE
    let modeChanged = false;
    if (billType === 'gst' && !isGSTMode) {
        isGSTMode = true;
        await setInDB('gstMode', 'isGSTMode', true);
        modeChanged = true;
    } else if (billType === 'regular' && isGSTMode) {
        isGSTMode = false;
        await setInDB('gstMode', 'isGSTMode', false);
        modeChanged = true;
    }

    // Update UI if mode changed
    if (modeChanged) {
        updateUIForGSTMode();
    }

    // LOAD THE BILL DATA
    if (billType === 'regular') {
        await loadSavedBill(billId);
    } else {
        await loadGSTSavedBill(billId);
        updateGSTBillDisplay();
    }

    closeSavedBillsModal();
    showNotification('Edit mode activated. Make your changes and click UPDATE BILL to save.', 'info');
    await saveToLocalStorage();
}
// Delete saved bill with confirmation
async function deleteSavedBill(billId, billType, event) {
    if (event) event.stopPropagation();

    const shouldDelete = await showConfirm('Are you sure you want to delete this bill?');
    if (shouldDelete) {
        try {
            const storeName = billType === 'gst' ? 'gstSavedBills' : 'savedBills';
            await removeFromDB(storeName, billId);

            // Reload the appropriate list
            if (billType === 'gst') {
                await loadGSTSavedBillsList();
            } else {
                await loadSavedBillsList();
            }

            showNotification('Bill deleted successfully!', 'success');
        } catch (error) {
            console.error('Error deleting bill:', error);
            showNotification('Error deleting bill', 'error');
        }
    }
}



// REPLACE ENTIRE saveCurrentBill FUNCTION WITH THIS:
async function saveCurrentBill() {
    // 1. CHECK VENDOR MODE FIRST
    if (isVendorMode) {
        await saveVendorPurchaseBill();
        return;
    }

    // 2. EXISTING SALES LOGIC
    if (isGSTMode) {
        await saveGSTCurrentBill();
    } else {
        // Regular bill save logic
        const customerName = document.getElementById('custName').value.trim();
        const billNo = document.getElementById('billNo').value.trim();
        const totalAmount = document.getElementById('createTotalAmountManual').textContent || '0.00';

        if (!billNo || billNo.length === 0) {
            showNotification('Please enter a bill number before saving.', 'error');
            return;
        }

        // Check for duplicate bill number
        if (!editMode || (editMode && billNo !== window.currentEditingBillOriginalNumber)) {
            const isDuplicate = await checkDuplicateBillNumber(billNo, 'regular');
            if (isDuplicate) {
                showNotification('Bill number already exists! Please use a different number.', 'error');
                return;
            }
        }

        // Auto-save customer if name exists
        if (customerName) {
            await autoSaveRegularCustomer(customerName);
        }

        try {
            const currentData = await getFromDB('billDataManual', 'currentBill');
            if (!currentData) return;

            const itemCount = document.querySelectorAll('#createListManual tbody tr[data-id]').length;

            const savedBill = {
                ...currentData,
                title: `${customerName} - ${billNo}`,
                totalAmount: totalAmount,
                timestamp: Date.now(),
                date: document.getElementById('billDate').value || new Date().toLocaleDateString(),
                itemCount: itemCount
            };

            let billId;
            if (editMode && currentEditingBillId) {
                // EDIT MODE: Restore original stock first
                await restoreStockFromOriginalBill(currentEditingBillId);

                billId = currentEditingBillId;
                await setInDB('savedBills', billId, savedBill);
                // Then reduce stock with new quantities
                await reduceStockOnSave();
                showNotification('Bill updated successfully!');
                resetEditMode();
            } else {
                // NORMAL MODE: Just reduce stock
                billId = `saved-bill-${Date.now()}`;
                await setInDB('savedBills', billId, savedBill);
                await reduceStockOnSave();
                showNotification('Bill saved successfully!');
            }

        } catch (error) {
            console.error('Error saving bill:', error);
        }
    }
}
/* ==========================================
   VENDOR STATE PERSISTENCE (AUTO-SAVE)
   ========================================== */

async function saveVendorState() {
    // We do NOT save items here anymore. 
    // The unified table is handled by the main saveToLocalStorage() function.

    const state = {
        isVendorMode: isVendorMode,
        // Inputs Only
        vendorName: document.getElementById('vendorName').value,
        vendorInvoiceNo: document.getElementById('vendorInvoiceNo').value,
        vendorAddr: document.getElementById('vendorAddr').value,
        vendorDate: document.getElementById('vendorDate').value,
        vendorPhone: document.getElementById('vendorPhone').value,
        vendorGSTIN: document.getElementById('vendorGSTIN').value,
        vendorEmail: document.getElementById('vendorEmail').value,
        vendorType: document.getElementById('vendorType').value
    };

    try {
        await setInDB('settings', 'vendorState', state);
    } catch (e) {
        console.error("Error saving vendor state", e);
    }
}

async function loadVendorState() {
    try {
        const state = await getFromDB('settings', 'vendorState');
        if (state) {
            // 1. Restore Mode
            // This switches the visible container (hides Sales, shows Vendor)
            if (state.isVendorMode && !isVendorMode) {
                toggleVendorMode();
            }

            // 2. Restore Inputs
            document.getElementById('vendorName').value = state.vendorName || '';
            document.getElementById('vendorInvoiceNo').value = state.vendorInvoiceNo || '';
            document.getElementById('vendorAddr').value = state.vendorAddr || '';
            document.getElementById('vendorDate').value = state.vendorDate || '';
            document.getElementById('vendorPhone').value = state.vendorPhone || '';
            document.getElementById('vendorGSTIN').value = state.vendorGSTIN || '';
            document.getElementById('vendorEmail').value = state.vendorEmail || '';
            document.getElementById('vendorType').value = state.vendorType || 'Regular';

            // 3. REMOVED: Table restoration logic. 
            // The table (including sections) is now preserved because loadFromLocalStorage() 
            // runs before this and handles the unified table structure.
        }
    } catch (e) {
        console.error("Error loading vendor state", e);
    }
}

function setupVendorAutoSave() {
    const inputs = [
        'vendorName', 'vendorInvoiceNo', 'vendorAddr', 'vendorDate',
        'vendorPhone', 'vendorGSTIN', 'vendorEmail', 'vendorType'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Save state whenever user types or changes value
            el.addEventListener('input', () => {
                // Use existing debounce logic or direct save
                saveVendorState();
            });
            el.addEventListener('change', saveVendorState);
        }
    });
}

/* ==========================================
   VENDOR MODE & PURCHASE ENTRY LOGIC
   ========================================== */

function toggleVendorMode() {
    isVendorMode = !isVendorMode;
    const body = document.body;
    const btn = document.querySelector('.vendor-mode-btn');

    // Toggle UI Elements
    const regHeading = document.getElementById('regular-bill-heading');
    const companyDetails = document.getElementById('regular-company-details');
    // Important: The selector below targets the sales customer details block
    const customerDetails = document.querySelector('#bill-container .customer-details');
    const vendorDetails = document.getElementById('vendor-details-container');
    const regFooter = document.getElementById('regular-bill-footer');
    const saveBtn = document.querySelector('.settings-btn[onclick="saveCurrentBill()"]');

    if (isVendorMode) {
        // --- SWITCH TO VENDOR MODE ---
        body.classList.add('vendor-mode');

        // Hide Sales Elements
        if (regHeading) regHeading.style.display = 'none';
        if (companyDetails) companyDetails.style.display = 'none';
        if (customerDetails) customerDetails.style.display = 'none';
        if (regFooter) regFooter.style.display = 'none';

        // Show Vendor Elements
        if (vendorDetails) vendorDetails.style.display = 'block';

        // Update Sidebar Button
        if (btn) {
            btn.style.backgroundColor = '#e67e22';
            btn.innerHTML = '<span class="material-icons">domain</span>SALES MODE';
        }

        // Update Save Button Text
        if (saveBtn) {
            saveBtn.style.backgroundColor = '#d35400';
            saveBtn.innerHTML = '<span class="material-icons">save_alt</span>SAVE PURCHASE';
        }

        // Set Default Date
        const today = new Date();
        const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        const dateInput = document.getElementById('vendorDate');
        if (dateInput && !dateInput.value) dateInput.value = dateStr;

        // showNotification("Switched to Vendor (Purchase) Mode", "info");

    } else {
        // --- SWITCH BACK TO SALES MODE ---
        body.classList.remove('vendor-mode');

        // Show Sales Elements
        if (regHeading) regHeading.style.display = 'block';
        if (companyDetails) companyDetails.style.display = 'flex';
        if (customerDetails) customerDetails.style.display = 'block'; // customer details is a table
        if (regFooter) regFooter.style.display = 'none'; // Footer hidden by default until toggled

        // Hide Vendor Elements
        if (vendorDetails) vendorDetails.style.display = 'none';

        // Reset Buttons
        if (btn) {
            btn.style.backgroundColor = '';
            btn.innerHTML = '<span class="material-icons">store</span>VENDOR MODE';
        }

        if (saveBtn) {
            saveBtn.style.backgroundColor = '';
            saveBtn.innerHTML = '<span class="material-icons">save</span>SAVE BILL';
        }
    }
    saveVendorState();
}

function toggleVendorBillsMode() {
    const toggle = document.getElementById('vendor-bills-mode-toggle');
    currentVendorBillsMode = toggle.checked ? 'gst' : 'regular';
    loadVendorSavedBillsList();
}

async function editVendorSavedBill(billId, event) {
    if (event) event.stopPropagation();

    try {
        const bill = await getFromDB('vendorSavedBills', billId);
        if (!bill) {
            showNotification("Bill not found", "error");
            return;
        }

        // 1. Clear current workspace
        await clearAllData(true);

        // 2. Ensure we are in Vendor Mode
        if (!isVendorMode) {
            toggleVendorMode();
        }

        const data = bill.value || bill;

        // 3. Set Edit Mode Globals
        editMode = true;
        currentEditingBillId = billId;

        const saveBtn = document.querySelector('.settings-btn[onclick="saveCurrentBill()"]');
        if (saveBtn) {
            saveBtn.innerHTML = '<span class="material-icons">update</span>UPDATE PURCHASE';
            saveBtn.style.backgroundColor = '#27ae60';
        }

        // 4. Populate Inputs
        document.getElementById('vendorName').value = data.vendor.name;
        document.getElementById('vendorAddr').value = data.vendor.address || '';
        document.getElementById('vendorPhone').value = data.vendor.phone || '';
        document.getElementById('vendorGSTIN').value = data.vendor.gstin || '';
        document.getElementById('vendorEmail').value = data.vendor.email || '';
        document.getElementById('vendorInvoiceNo').value = data.billDetails.invoiceNo;
        document.getElementById('vendorDate').value = data.billDetails.date;
        document.getElementById('vendorType').value = data.billDetails.type || 'Regular';

        if (data.billDetails.file) {
            currentVendorFile = data.billDetails.file;
            const label = document.getElementById('vendorFileName');
            label.style.display = 'inline';
            label.textContent = data.billDetails.file.name;
        } else {
            currentVendorFile = null;
            document.getElementById('vendorFileName').style.display = 'none';
        }

        // 5. Populate Items (This manipulates the DOM directly)
        if (data.items && data.items.length > 0) {
            const createListTbody = document.querySelector("#createListManual tbody");
            const copyListTbody = document.querySelector("#copyListManual tbody");

            data.items.forEach(item => {
                const rowId = item.id || `row-manual-${Date.now()}-${Math.random()}`;
                const toggleStates = item.dimensionToggles || { toggle1: true, toggle2: true, toggle3: true };

                const row1 = createTableRowManual(
                    rowId, item.itemName, item.quantity, item.unit, item.rate, item.amount, item.notes || '',
                    '', true, item.quantity, item.dimensionType || 'none', item.quantity,
                    { values: item.dimensionValues || [0, 0, 0], toggle1: toggleStates.toggle1, toggle2: toggleStates.toggle2, toggle3: toggleStates.toggle3 },
                    item.dimensionUnit || 'ft', item.hsn || '', '', item.discountType || 'none', item.discountValue || 0
                );
                if (item.particularsHtml) row1.children[1].innerHTML = item.particularsHtml;
                createListTbody.appendChild(row1);

                const row2 = createTableRowManual(
                    rowId, item.itemName, item.quantity, item.unit, item.rate, item.amount, item.notes || '',
                    '', false, item.quantity, item.dimensionType || 'none', item.quantity,
                    { values: item.dimensionValues || [0, 0, 0], toggle1: toggleStates.toggle1, toggle2: toggleStates.toggle2, toggle3: toggleStates.toggle3 }
                );
                if (item.particularsHtml) row2.children[1].innerHTML = item.particularsHtml;
                copyListTbody.appendChild(row2);
            });
        }

        // 6. UI Updates
        updateSerialNumbers();
        updateTotal();
        closeVendorSavedBillsModal();
        showNotification("Purchase bill loaded for editing", "info");

        // 7. CRITICAL: Save to BOTH storages immediately
        // This persists the Table Items to billDataManual
        await saveToLocalStorage();
        // This persists the Vendor Mode & Inputs to vendorState
        await saveVendorState();

    } catch (e) {
        console.error("Error loading vendor bill", e);
        showNotification("Error loading bill", "error");
    }
}

// Handle File Upload (Convert to Base64)
function handleVendorFileSelect(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        // 5MB Limit
        if (file.size > 5 * 1024 * 1024) {
            showNotification("File too large (Max 5MB)", "error");
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            currentVendorFile = {
                name: file.name,
                type: file.type,
                data: e.target.result // Base64 string
            };
            const label = document.getElementById('vendorFileName');
            if (label) {
                label.style.display = 'inline';
                label.textContent = file.name.substring(0, 15) + '...';
            }
        };
        reader.readAsDataURL(file);
    }
}

// === SAVE PURCHASE LOGIC ===

// Helper to scrape items specifically from the Input Table (createListManual)
function getVendorItemsData() {
    const items = [];
    // Select rows from the INPUT table, not the GST view table
    document.querySelectorAll('#createListManual tbody tr[data-id]').forEach(row => {
        const cells = row.children;
        const particularsDiv = cells[1];
        const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
        const notes = particularsDiv.querySelector('.notes')?.textContent || '';

        // Safely extract values
        const quantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent) || 0;
        const rate = parseFloat(cells[4].textContent) || 0;
        const amount = parseFloat(cells[5].textContent) || 0;

        items.push({
            id: row.getAttribute('data-id'),
            itemName: itemName,
            quantity: quantity,
            unit: cells[3].textContent,
            rate: rate,
            amount: amount,
            notes: notes,
            // Capture all hidden attributes needed to recreate the row exactly
            hsn: row.getAttribute('data-hsn') || '',
            dimensionType: row.getAttribute('data-dimension-type') || 'none',
            dimensionValues: JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]'),
            dimensionUnit: row.getAttribute('data-dimension-unit') || 'ft',
            dimensionToggles: JSON.parse(row.getAttribute('data-dimension-toggles') || '{"toggle1":true,"toggle2":true,"toggle3":true}'),
            discountType: row.getAttribute('data-discount-type') || 'none',
            discountValue: row.getAttribute('data-discount-value') || 0,
            particularsHtml: particularsDiv.innerHTML
        });
    });
    return items;
}

async function saveVendorPurchaseBill() {
    const vendorName = document.getElementById('vendorName').value.trim();
    const invoiceNo = document.getElementById('vendorInvoiceNo').value.trim();

    if (!vendorName || !invoiceNo) {
        showNotification("Vendor Name and Invoice No are required", "error");
        return;
    }

    // 1. Determine ID (New or Existing)
    let billId;
    if (editMode && currentEditingBillId) {
        billId = currentEditingBillId; // Keep existing ID
    } else {
        billId = `vendor-bill-${Date.now()}`; // Generate New ID
    }

    // 2. Gather Data (Using the new helper)
    const itemsData = getVendorItemsData(); // SCRAPE FROM INPUT TABLE

    const purchaseData = {
        id: billId,
        vendor: {
            name: vendorName,
            address: document.getElementById('vendorAddr').value,
            phone: document.getElementById('vendorPhone').value,
            gstin: document.getElementById('vendorGSTIN').value,
            email: document.getElementById('vendorEmail').value
        },
        billDetails: {
            invoiceNo: invoiceNo,
            date: document.getElementById('vendorDate').value,
            type: document.getElementById('vendorType').value,
            file: currentVendorFile // Base64 string
        },
        items: itemsData,
        totalAmount: document.getElementById('createTotalAmountManual').textContent,
        timestamp: Date.now()
    };

    try {
        // 3. Save Bill
        await setInDB('vendorSavedBills', billId, purchaseData);

        // 4. Auto-Save Vendor (if new)
        await autoSaveVendor(purchaseData.vendor);

        // 5. Handle Stock (Only increase if NEW bill, to avoid double counting on edits for now)
        if (!editMode) {
            await processPurchaseItems(purchaseData.items);
            showNotification("Purchase Saved & Stock Updated!", "success");
        } else {
            showNotification("Purchase Updated Successfully!", "success");
        }

        // 6. RESET UI & EXIT EDIT MODE
        // Clear Form
        document.getElementById('vendorName').value = '';
        document.getElementById('vendorInvoiceNo').value = '';
        document.getElementById('vendorAddr').value = '';
        document.getElementById('vendorPhone').value = '';
        document.getElementById('vendorGSTIN').value = '';
        document.getElementById('vendorEmail').value = '';

        // Clear Tables
        await clearAllData(true);

        // Reset File
        currentVendorFile = null;
        document.getElementById('vendorFileName').style.display = 'none';
        document.getElementById('vendorFile').value = '';

        // Reset Edit Mode State
        editMode = false;
        currentEditingBillId = null;

        // Reset Button Text
        const saveBtn = document.querySelector('.settings-btn[onclick="saveCurrentBill()"]');
        if (saveBtn) {
            saveBtn.innerHTML = '<span class="material-icons">save_alt</span>SAVE PURCHASE';
            saveBtn.style.backgroundColor = '#d35400';
        }

    } catch (e) {
        console.error("Purchase save error", e);
        showNotification("Error saving purchase bill", "error");
    }
}

async function autoSaveVendor(vendorData) {
    const vendors = await getAllFromDB('vendorList');
    const exists = vendors.find(v => v.value.name.toLowerCase() === vendorData.name.toLowerCase());

    if (!exists) {
        await setInDB('vendorList', `vendor-${Date.now()}`, vendorData);
        console.log("New vendor added automatically");
    }
}

async function processPurchaseItems(items) {
    for (const item of items) {
        const qty = parseFloat(item.quantity) || 0;
        if (qty <= 0) continue;

        // Check if item exists in savedItems
        let savedItemObj = await getFromDB('savedItems', item.itemName);

        if (savedItemObj) {
            // EXISTS: Increase Stock
            const currentStock = parseFloat(savedItemObj.stockQuantity) || 0;
            savedItemObj.stockQuantity = currentStock + qty;

            // Update purchase rate to the rate in this bill
            savedItemObj.purchaseRate = parseFloat(item.rate);

            savedItemObj.lastStockUpdate = Date.now();

            await setInDB('savedItems', item.itemName, savedItemObj);
        } else {
            // NEW ITEM: Create it automatically
            const newItem = {
                name: item.itemName,
                stockQuantity: qty,
                purchaseRate: parseFloat(item.rate),
                salePrice: 0, // Default 0, user sets later
                defaultUnit: item.unit,
                category: 'Uncategorized',
                timestamp: Date.now()
            };
            await setInDB('savedItems', item.itemName, newItem);
        }
    }
}

// === VENDOR MANAGEMENT UI ===

function openManageVendorsModal() {
    toggleSettingsSidebar();
    document.getElementById('manage-vendors-modal').style.display = 'block';
    loadVendorList();
}

function closeManageVendorsModal() {
    document.getElementById('manage-vendors-modal').style.display = 'none';
}

async function loadVendorList() {
    const list = document.getElementById('vendors-list');
    list.innerHTML = '';
    const vendors = await getAllFromDB('vendorList');

    if (vendors.length === 0) { list.innerHTML = '<div class="item-card">No vendors found</div>'; return; }

    vendors.forEach(v => {
        const val = v.value;
        const menuId = `menu-vendor-${v.id}-${Date.now()}`;

        const card = document.createElement('div');
        card.className = 'customer-card';
        card.innerHTML = `
            <div class="card-header-row">
                <div class="card-info">${val.name} <span class="card-sub-info">${val.phone || ''}</span></div>
                
                <div class="card-controls">
                    <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                        <span class="material-icons">keyboard_arrow_down</span>
                    </button>
                    
                    <div class="action-menu-container">
                        <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                            <span class="material-icons">more_vert</span>
                        </button>
                        <div id="${menuId}" class="action-dropdown">
                            <button class="dropdown-item" onclick="openPaymentDialog('${val.name}', '${val.gstin || ''}')">
                                <span class="material-icons">payments</span> Payment & CN
                            </button>
                            <button class="dropdown-item" onclick="openLedgerDialog('${val.name}', '${val.gstin || ''}')">
                                <span class="material-icons">book</span> Ledger
                            </button>
                            <button class="dropdown-item" onclick="editVendor('${v.id}')">
                                <span class="material-icons">edit</span> Edit
                            </button>
                            <button class="dropdown-item delete-item" onclick="deleteVendor('${v.id}')">
                                <span class="material-icons">delete</span> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="details-section hidden">
                <div>${val.address || 'No Address'}</div>
                <div>GSTIN: ${val.gstin || '-'}</div>
                <div>Email: ${val.email || '-'}</div>
            </div>
        `;
        list.appendChild(card);
    });
}

function openAddVendorModal() {
    document.getElementById('saved-vendor-name').value = '';
    document.getElementById('saved-vendor-address').value = '';
    document.getElementById('saved-vendor-phone').value = '';
    document.getElementById('saved-vendor-gstin').value = '';
    document.getElementById('saved-vendor-email').value = '';
    document.getElementById('add-vendor-modal').style.display = 'block';
}

function closeAddVendorModal() {
    document.getElementById('add-vendor-modal').style.display = 'none';
    currentlyEditingVendorId = null;
}

async function saveVendor() {
    // 1. Target the specific modal to avoid ID conflicts
    const modalContext = document.getElementById('add-vendor-modal');
    if (!modalContext) {
        console.error("Vendor modal not found in DOM");
        return;
    }

    // 2. Query inputs strictly within this modal
    const nameInput = modalContext.querySelector('#saved-vendor-name');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        console.warn("Vendor Name is empty. Checking input element:", nameInput);
        showNotification("Vendor Name is required", "error");
        return;
    }

    const vendorData = {
        name: name,
        address: modalContext.querySelector('#saved-vendor-address').value || '',
        phone: modalContext.querySelector('#saved-vendor-phone').value || '',
        gstin: modalContext.querySelector('#saved-vendor-gstin').value || '',
        email: modalContext.querySelector('#saved-vendor-email').value || '',
        timestamp: Date.now()
    };

    try {
        if (currentlyEditingVendorId) {
            // Update Existing Vendor
            console.log("Updating vendor:", currentlyEditingVendorId);
            await setInDB('vendorList', currentlyEditingVendorId, vendorData);

            // Optional: Update global vendor state inputs if this vendor is currently loaded in the main view
            const currentVendorName = document.getElementById('vendorName');
            if (currentVendorName && currentVendorName.value === name) {
                document.getElementById('vendorAddr').value = vendorData.address;
                document.getElementById('vendorPhone').value = vendorData.phone;
                document.getElementById('vendorGSTIN').value = vendorData.gstin;
                document.getElementById('vendorEmail').value = vendorData.email;
                if (typeof saveVendorState === 'function') saveVendorState();
            }

            showNotification("Vendor updated successfully", "success");
        } else {
            // Create New Vendor
            const newId = `vendor-${Date.now()}`;
            console.log("Creating new vendor:", newId);
            await setInDB('vendorList', newId, vendorData);
            showNotification("Vendor added successfully", "success");
        }

        closeAddVendorModal(); // Use the correct close function name
        await loadVendorList();   // Refresh list

        // Reset editing ID
        currentlyEditingVendorId = null;

    } catch (e) {
        console.error("Save vendor error:", e);
        showNotification("Error saving vendor", "error");
    }
}

async function deleteVendor(id) {
    if (confirm("Are you sure you want to delete this vendor?")) {
        await removeFromDB('vendorList', id);
        loadVendorList();
    }
}

// Vendor Autocomplete
async function handleVendorSearch() {
    const input = document.getElementById('vendorName');
    const suggestions = document.getElementById('vendor-suggestions');
    const val = input.value.trim().toLowerCase();

    if (val.length < 1) {
        suggestions.style.display = 'none';
        return;
    }

    try {
        const all = await getAllFromDB('vendorList');

        // Search by Name or GSTIN
        const filtered = all.filter(v =>
            v.value.name.toLowerCase().includes(val) ||
            (v.value.gstin && v.value.gstin.toLowerCase().includes(val))
        ).slice(0, 5);

        suggestions.innerHTML = '';

        if (filtered.length > 0) {
            filtered.forEach(v => {
                const div = document.createElement('div');
                div.className = 'customer-suggestion-item';

                // CHANGED: Show ONLY the name, removed GSTIN appending
                div.textContent = v.value.name;

                div.onclick = () => selectVendorSuggestion(v.value);
                suggestions.appendChild(div);
            });
            suggestions.style.display = 'block';
        } else {
            suggestions.style.display = 'none';
        }
    } catch (e) {
        console.error("Vendor search error", e);
    }
}
function selectVendorSuggestion(vendorData) {
    // 1. Auto-Fill Details
    document.getElementById('vendorName').value = vendorData.name;
    document.getElementById('vendorAddr').value = vendorData.address || '';
    document.getElementById('vendorPhone').value = vendorData.phone || '';
    document.getElementById('vendorGSTIN').value = vendorData.gstin || '';
    document.getElementById('vendorEmail').value = vendorData.email || '';

    // 2. Hide Suggestions
    document.getElementById('vendor-suggestions').style.display = 'none';

    // 3. CRITICAL: Persist State Immediately
    // This ensures data is saved if page is refreshed right after clicking
    saveVendorState();
}

function openAddVendorModal() {
    currentlyEditingVendorId = null;
    document.getElementById('add-vendor-modal-title').textContent = 'Add New Vendor';
    document.getElementById('save-vendor-btn').textContent = 'Save Vendor';

    // Clear inputs
    document.getElementById('saved-vendor-name').value = '';
    document.getElementById('saved-vendor-address').value = '';
    document.getElementById('saved-vendor-phone').value = '';
    document.getElementById('saved-vendor-gstin').value = '';
    document.getElementById('saved-vendor-email').value = '';

    document.getElementById('add-vendor-modal').style.display = 'block';
}

async function editVendor(vendorId) {
    try {
        console.log("Attempting to edit vendor ID:", vendorId);

        // 1. Fetch from DB
        const result = await getFromDB('vendorList', vendorId);

        if (!result) {
            console.error("Vendor not found in database.");
            return;
        }

        // 2. Unwrap Data
        // Handle both wrapped {id, value: {..}} and direct {id, name: ..} structures
        const val = result.value || result;
        console.log("Vendor Data Loaded:", val);

        currentlyEditingVendorId = vendorId;

        // 3. Update Modal UI
        document.getElementById('add-vendor-modal-title').textContent = 'Edit Vendor';
        const saveBtn = document.getElementById('save-vendor-btn');
        if (saveBtn) saveBtn.textContent = 'Update Vendor';

        // 4. Populate Fields (Targeting specifically within the modal to avoid ambiguity)
        const modal = document.getElementById('add-vendor-modal');
        if (modal) {
            const nameInput = modal.querySelector('#saved-vendor-name');
            const addrInput = modal.querySelector('#saved-vendor-address');
            const phoneInput = modal.querySelector('#saved-vendor-phone');
            const gstinInput = modal.querySelector('#saved-vendor-gstin');
            const emailInput = modal.querySelector('#saved-vendor-email');

            if (nameInput) {
                // Ensure we handle null/undefined names gracefully
                nameInput.value = (val.name !== undefined && val.name !== null) ? val.name : '';
            }
            if (addrInput) addrInput.value = val.address || '';
            if (phoneInput) phoneInput.value = val.phone || '';
            if (gstinInput) gstinInput.value = val.gstin || '';
            if (emailInput) emailInput.value = val.email || '';

            // Show Modal
            modal.style.display = 'block';
        } else {
            console.error("Modal element 'add-vendor-modal' not found in DOM");
        }

    } catch (e) {
        console.error("Error in editVendor:", e);
    }
}

// === VENDOR BILLS HISTORY ===

function openVendorSavedBillsModal() {
    toggleSettingsSidebar();
    document.getElementById('vendor-bills-modal').style.display = 'block';

    // Reset toggle to Regular by default
    document.getElementById('vendor-bills-mode-toggle').checked = false;
    currentVendorBillsMode = 'regular';

    loadVendorSavedBillsList();
}

function closeVendorSavedBillsModal() {
    document.getElementById('vendor-bills-modal').style.display = 'none';
}

async function loadVendorSavedBillsList() {
    const list = document.getElementById('vendor-bills-list');
    list.innerHTML = '';

    let bills = await getAllFromDB('vendorSavedBills');

    if (bills.length === 0) {
        list.innerHTML = '<div class="item-card">No purchase bills found</div>';
        return;
    }

    // Filter based on toggle mode
    // Note: Older bills might not have 'type', so we assume 'Regular' if missing
    bills = bills.filter(b => {
        const type = (b.value.billDetails.type || 'Regular').toLowerCase();
        return type === currentVendorBillsMode;
    });

    if (bills.length === 0) {
        list.innerHTML = `<div class="item-card">No ${currentVendorBillsMode.toUpperCase()} bills found</div>`;
        return;
    }

    // Sort newest first
    bills.sort((a, b) => b.value.timestamp - a.value.timestamp);

    bills.forEach(b => {
        const val = b.value;
        const menuId = `menu-vbill-${b.id}-${Date.now()}`;
        const hasFile = !!val.billDetails.file;

        const card = document.createElement('div');
        card.className = 'saved-bill-card';
        card.innerHTML = `
            <div class="card-header-row">
                <div class="card-info">
                    <span>${val.vendor.name} - ${val.billDetails.invoiceNo}</span>
                    <span class="card-sub-info" style="color:var(--primary-color)">₹${val.totalAmount}</span>
                </div>
                
                <div class="card-controls">
                    <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                        <span class="material-icons">keyboard_arrow_down</span>
                    </button>
                    
                    <div class="action-menu-container">
                        <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                            <span class="material-icons">more_vert</span>
                        </button>
                        <div id="${menuId}" class="action-dropdown">
                            ${hasFile ? `
                            <button class="dropdown-item" onclick="viewBillFile('${b.id}')">
                                <span class="material-icons">description</span> View File
                            </button>` : ''}
                            
                            <button class="dropdown-item" onclick="editVendorSavedBill('${b.id}', event)">
                                <span class="material-icons">edit</span> Edit
                            </button>
                            
                            <button class="dropdown-item delete-item" onclick="deleteVendorBill('${b.id}')">
                                <span class="material-icons">delete</span> Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="details-section hidden saved-bill-details">
                <div>Date: ${val.billDetails.date}</div>
                <div>GSTIN: ${val.vendor.gstin || '-'}</div>
                <div>Items: ${val.items ? val.items.length : 0}</div>
            </div>
        `;

        // Click on card body to load/edit (ignoring buttons)
        card.addEventListener('click', (e) => {
            if (!e.target.closest('button')) {
                editVendorSavedBill(b.id, e);
            }
        });

        list.appendChild(card);
    });
}

/* ==========================================
   IMAGE VIEWER ZOOM & PAN LOGIC
   ========================================== */

let imgState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    // Touch specifics
    lastTouchDist: 0
};

function initImageZoom() {
    const img = document.getElementById('file-viewer-img');
    const container = document.querySelector('#file-viewer-modal .modal-body');

    if (!img || !container) return;

    // Reset State
    imgState = { scale: 1, panning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, lastTouchDist: 0 };
    updateImageTransform();

    // --- MOUSE EVENTS (PC) ---

    // 1. Zoom (Scroll)
    container.onwheel = function (e) {
        e.preventDefault();
        const xs = (e.clientX - imgState.pointX) / imgState.scale;
        const ys = (e.clientY - imgState.pointY) / imgState.scale;

        const delta = -e.deltaY;

        // Zoom Factor
        (delta > 0) ? (imgState.scale *= 1.1) : (imgState.scale /= 1.1);

        // Limits (0.5x to 10x)
        if (imgState.scale < 0.5) imgState.scale = 0.5;
        if (imgState.scale > 10) imgState.scale = 10;

        updateImageTransform();
    };

    // 2. Pan Start (MouseDown)
    img.onmousedown = function (e) {
        e.preventDefault();
        imgState.startX = e.clientX - imgState.pointX;
        imgState.startY = e.clientY - imgState.pointY;
        imgState.panning = true;
        img.style.cursor = 'grabbing'; // Visual feedback during drag
    };

    // 3. Pan Move (MouseMove)
    container.onmousemove = function (e) {
        e.preventDefault();
        if (!imgState.panning) return;
        imgState.pointX = e.clientX - imgState.startX;
        imgState.pointY = e.clientY - imgState.startY;
        updateImageTransform();
    };

    // 4. Pan End (MouseUp)
    container.onmouseup = function (e) {
        imgState.panning = false;
        img.style.cursor = 'move'; // Revert to requested cursor
    };

    container.onmouseleave = function (e) {
        imgState.panning = false;
        img.style.cursor = 'move';
    }

    // --- TOUCH EVENTS (MOBILE) ---

    // 1. Touch Start
    container.ontouchstart = function (e) {
        if (e.touches.length === 1) {
            // Single finger = Pan
            const touch = e.touches[0];
            imgState.startX = touch.clientX - imgState.pointX;
            imgState.startY = touch.clientY - imgState.pointY;
            imgState.panning = true;
        } else if (e.touches.length === 2) {
            // Two fingers = Zoom Init
            imgState.panning = false;
            imgState.lastTouchDist = getTouchDistance(e.touches);
        }
    };

    // 2. Touch Move
    container.ontouchmove = function (e) {
        e.preventDefault(); // Prevent page scroll

        if (e.touches.length === 1 && imgState.panning) {
            // Pan Logic
            const touch = e.touches[0];
            imgState.pointX = touch.clientX - imgState.startX;
            imgState.pointY = touch.clientY - imgState.startY;
            updateImageTransform();
        } else if (e.touches.length === 2) {
            // Pinch Zoom Logic
            const currentDist = getTouchDistance(e.touches);
            if (imgState.lastTouchDist > 0) {
                const ratio = currentDist / imgState.lastTouchDist;
                imgState.scale *= ratio;

                // Limits
                if (imgState.scale < 0.5) imgState.scale = 0.5;
                if (imgState.scale > 10) imgState.scale = 10;

                updateImageTransform();
            }
            imgState.lastTouchDist = currentDist;
        }
    };

    // 3. Touch End
    container.ontouchend = function (e) {
        imgState.panning = false;
        imgState.lastTouchDist = 0;
    };
}

// Helper: Calculate distance between two fingers
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper: Apply CSS
function updateImageTransform() {
    const img = document.getElementById('file-viewer-img');
    if (img) {
        img.style.transform = `translate(${imgState.pointX}px, ${imgState.pointY}px) scale(${imgState.scale})`;
    }
}

// --- KEYBOARD EVENTS ---
document.addEventListener('keydown', function (e) {
    // Only active if modal is open
    const modal = document.getElementById('file-viewer-modal');
    if (modal.style.display !== 'block' && modal.style.display !== 'flex') return;

    if (e.ctrlKey) {
        // Numpad + or standard + (keycode 107 or 187)
        if (e.key === '+' || e.code === 'NumpadAdd' || e.key === '=') {
            e.preventDefault();
            imgState.scale *= 1.1;
            updateImageTransform();
        }
        // Numpad - or standard - (keycode 109 or 189)
        if (e.key === '-' || e.code === 'NumpadSubtract') {
            e.preventDefault();
            imgState.scale /= 1.1;
            if (imgState.scale < 0.5) imgState.scale = 0.5;
            updateImageTransform();
        }
        // Reset (Ctrl + 0)
        if (e.key === '0' || e.code === 'Numpad0') {
            e.preventDefault();
            imgState.scale = 1;
            imgState.pointX = 0;
            imgState.pointY = 0;
            updateImageTransform();
        }
    }
});

// View Uploaded File
// UPDATE THIS FUNCTION
async function viewBillFile(id) {
    const bill = await getFromDB('vendorSavedBills', id);
    if (bill && bill.billDetails.file) {
        const file = bill.billDetails.file;
        const modal = document.getElementById('file-viewer-modal');
        const img = document.getElementById('file-viewer-img');
        const iframe = document.getElementById('file-viewer-pdf');
        const msg = document.getElementById('file-viewer-msg');

        modal.style.display = 'flex';
        img.style.display = 'none';
        iframe.style.display = 'none';
        msg.style.display = 'none';

        // Reset Transform style immediately
        img.style.transform = 'translate(0px, 0px) scale(1)';

        if (file.type.includes('image')) {
            img.src = file.data;
            img.style.display = 'block';

            // INITIALIZE ZOOM CONTROLS HERE
            initImageZoom();

        } else if (file.type.includes('pdf')) {
            iframe.src = file.data;
            iframe.style.display = 'block';
            // Remove zoom listeners for PDF to allow native PDF controls
            const container = document.querySelector('#file-viewer-modal .modal-body');
            container.onwheel = null;
            container.onmousedown = null;
            container.ontouchstart = null;
        } else {
            msg.style.display = 'block';
            msg.textContent = "File format not supported for preview";
        }
    }
}

// UPDATE THIS FUNCTION
function closeFileViewerModal() {
    document.getElementById('file-viewer-modal').style.display = 'none';
    const img = document.getElementById('file-viewer-img');
    img.src = '';
    document.getElementById('file-viewer-pdf').src = '';

    // Clean up Event Listeners to prevent errors when modal is closed
    const container = document.querySelector('#file-viewer-modal .modal-body');
    if (container) {
        container.onwheel = null;
        container.onmousedown = null;
        container.onmousemove = null;
        container.onmouseup = null;
        container.onmouseleave = null;
        container.ontouchstart = null;
        container.ontouchmove = null;
        container.ontouchend = null;
    }

    // Reset Image State
    if (img) {
        img.style.transform = 'none';
        img.style.cursor = 'move';
    }
}

async function deleteVendorBill(id) {
    if (confirm("Delete this purchase record? (Note: Stock added by this bill will NOT be reverted automatically)")) {
        await removeFromDB('vendorSavedBills', id);
        loadVendorSavedBillsList();
    }
}

function searchVendorBills() {
    const term = document.getElementById('vendor-bills-search').value.toLowerCase();
    const cards = document.querySelectorAll('#vendor-bills-list .saved-bill-card');

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? 'block' : 'none';
    });
}

function searchVendors() {
    const term = document.getElementById('vendor-search').value.toLowerCase();
    const cards = document.querySelectorAll('#vendors-list .customer-card');

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? 'block' : 'none';
    });
}

// VENDOR FUNCTIONS END

async function restoreStockFromOriginalBill(billId) {
    try {
        const originalBill = await getFromDB('savedBills', billId);
        if (!originalBill || !originalBill.tableStructure) return;

        // Restore stock for each item in the original bill
        for (const rowData of originalBill.tableStructure) {
            if (rowData.type === 'item' && rowData.itemName) {
                const savedItem = await getFromDB('savedItems', rowData.itemName);
                if (savedItem && savedItem.stockQuantity !== undefined) {
                    const originalQuantity = parseFloat(rowData.quantity) || 0;
                    // Add back the original quantity to stock
                    savedItem.stockQuantity += originalQuantity;
                    await setInDB('savedItems', rowData.itemName, savedItem);
                }
            }
        }
    } catch (error) {
        console.error('Error restoring stock from original bill:', error);
    }
}

// Open Saved Bills Modal
function openSavedBillsModal() {
    document.getElementById('saved-bills-modal').style.display = 'block';

    // Reset to regular mode by default
    document.getElementById('bills-mode-toggle').checked = false;
    currentBillsMode = 'regular';

    // LOAD REGULAR BILLS INITIALLY
    loadSavedBillsList();
    toggleSettingsSidebar();
}


function closeSavedBillsModal() {
    document.getElementById('saved-bills-modal').style.display = 'none';
}

async function loadSavedBillsList() {
    try {
        const savedBills = await getAllFromDB('savedBills');
        const billsList = document.getElementById('saved-bills-list');
        billsList.innerHTML = '';

        if (savedBills.length === 0) {
            billsList.innerHTML = '<div class="saved-bill-card">No regular bills saved yet</div>';
            return;
        }

        savedBills.sort((a, b) => b.value.timestamp - a.value.timestamp);

        savedBills.forEach(bill => {
            const billCard = document.createElement('div');
            billCard.className = 'saved-bill-card';

            const menuId = `menu-bill-${bill.id}-${Date.now()}`;
            const billNo = bill.value.customer?.billNo || 'N/A';
            const custName = bill.value.customer?.name || 'N/A';

            // New Header: [Bill No] - [Customer] -> [Total] -> [Toggle] -> [Menu]
            billCard.innerHTML = `
                <div class="card-header-row">
                    <div class="card-info">
                        <span>${billNo} - ${custName}</span>
                        <span class="card-sub-info" style="color:var(--primary-color)">₹${bill.value.totalAmount}</span>
                    </div>
                    
                    <div class="card-controls">
                        <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                        
                        <div class="action-menu-container">
                            <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="${menuId}" class="action-dropdown">
                                <button class="dropdown-item" onclick="downloadBillAsJson('${bill.id}', 'regular', event)">
                                    <span class="material-icons">download</span> Download JSON
                                </button>
                                <button class="dropdown-item" onclick="editSavedBill('${bill.id}', 'regular', event)">
                                    <span class="material-icons">edit</span> Edit
                                </button>
                                <button class="dropdown-item delete-item" onclick="deleteSavedBill('${bill.id}', 'regular', event)">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section hidden saved-bill-details">
                    <div>Date: ${bill.value.date}</div>
                    <div>Items: ${bill.value.items?.length || bill.value.itemCount || 0}</div>
                    <div>Title: ${bill.value.title}</div>
                </div>
            `;
            // RESTORE CLICK TO LOAD FUNCTIONALITY
            billCard.addEventListener('click', async (e) => {
                // Ignore clicks on buttons/menu (Action controls)
                if (e.target.closest('.card-controls')) return;

                resetEditMode();
                await clearAllData(true);

                // Ensure we are in Regular Mode
                if (isGSTMode) {
                    isGSTMode = false;
                    updateUIForGSTMode();
                }

                await loadSavedBill(bill.id);
                closeSavedBillsModal();
            });
            billsList.appendChild(billCard);
        });
    } catch (error) {
        console.error('Error loading saved bills:', error);
    }
}

async function loadSavedBill(billId) {
    try {
        const savedBill = await getFromDB('savedBills', billId);
        if (!savedBill) return;

        await setInDB('billDataManual', 'currentBill', savedBill);
        await loadFromLocalStorage();
        saveStateToHistory();

        if (currentView === 'bill') {
            toggleView();
        }
        // FIX: Reset columns to visible on load
        resetColumnVisibility();
        // Don't set edit mode on regular load
    } catch (error) {
        console.error('Error loading saved bill:', error);
    }
}
// Add this helper function to format numbers (remove .00 when whole number)
function formatNumber(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    // Check if it's a whole number (no decimal part or .00)
    if (num % 1 === 0) {
        return num.toString(); // Return without decimals
    } else {
        return num.toFixed(2); // Return with 2 decimals for non-whole numbers
    }
}

function formatParticularsManual(itemName, notes, dimensions = '', quantity = 0, finalQuantity = 0, rate = 0, dimensionType = 'none', dimensionUnit = 'ft', unit = '', discountType = 'none', discountValue = '', toggleStates = null, convertUnit = 'none') {
    let particularsHtml = `<div class="itemNameClass">${itemName}</div>`;

    // Format the values using the helper function
    const formattedQuantity = formatNumber(quantity);
    const formattedFinalQuantity = formatNumber(finalQuantity);
    const formattedRate = formatNumber(rate);

    let calculationText = '';
    let discountText = '';

    // Build calculation text based on dimension type
    if (dimensionType !== 'none' && dimensions) {
        // COUNT ONLY GEOMETRIC DIMENSIONS (ignore quantity)
        let geometricDimensionsCount = 0;

        switch (dimensionType) {
            case 'length':
                geometricDimensionsCount = 1;
                break;
            case 'widthXheight':
            case 'widthXdepth':
            case 'lengthXdepth':
            case 'lengthXheight':
            case 'lengthXwidth':
                geometricDimensionsCount = 2;
                break;
            case 'widthXheightXdepth':
            case 'lengthXwidthXheight':
            case 'lengthXheightXdepth':
            case 'lengthXwidthXdepth':
                geometricDimensionsCount = 3;
                break;
            default:
                geometricDimensionsCount = 0;
        }

        // ADJUST for unchecked toggles
        if (toggleStates) {
            let actualUsedDimensions = 0;
            // Recalculate based on what is actually physically present in the calculation
            // We can't just map type to toggles blindly because different types use different toggles
            // But since we only need the count for the unit suffix (ft, sq.ft, cu.ft), we can count true toggles
            // LIMITED by the geometric max of that type.

            let activeCount = 0;
            if (toggleStates.toggle1) activeCount++;
            if (toggleStates.toggle2) activeCount++;
            if (toggleStates.toggle3) activeCount++;

            // If type is 2D but 3 toggles are active (shouldn't happen logic-wise but safety check), cap it
            geometricDimensionsCount = Math.min(geometricDimensionsCount, activeCount);
        }

        // DETERMINE UNIT SUFFIX based on convertUnit OR dimensionUnit
        let displayUnit = (convertUnit && convertUnit !== 'none') ? convertUnit : dimensionUnit;
        let unitSuffix = '';

        switch (geometricDimensionsCount) {
            case 1:
                unitSuffix = displayUnit; // Linear
                break;
            case 2:
                unitSuffix = displayUnit + '²'; // Area
                break;
            case 3:
                unitSuffix = displayUnit + '³'; // Volume
                break;
            default:
                unitSuffix = displayUnit; // Fallback
        }

        calculationText = `${dimensions} X ${formattedQuantity}${unit} = ${formattedFinalQuantity}${unitSuffix}`;
    } else {
        calculationText = `${formattedQuantity}${unit} @ ${formattedRate}/${unit}`;
    }

    // Build discount text based on discount type
    if (discountType !== 'none' && discountValue) {
        switch (discountType) {
            case 'percent_per_unit':
                discountText = ` (Less : ${discountValue}%/${unit})`;
                break;
            case 'amt_per_unit':
                discountText = ` (Less : ${discountValue}₹/${unit})`;
                break;
            case 'percent_on_amount':
                discountText = ` (Less : ${discountValue}%/amt)`;
                break;
            case 'amt_on_amount':
                discountText = ` (Less : ${discountValue}₹/amt)`;
                break;
        }
    }

    if (dimensionType !== 'none' && showDimensions) {
        particularsHtml += `<div class="dimensions" style="font-size: 0.8em; color: #666; margin: 5px 0;">${calculationText}${discountText}</div>`;
    } else if (showDimensions) {
        particularsHtml += `<div class="dimensions" style="font-size: 0.8em; color: #666; margin: 5px 0;">${calculationText}${discountText}</div>`;
    }

    if (notes) {
        particularsHtml += `<p class="notes">${notes}</p>`;
    }
    return particularsHtml;
}

// Add this line in the addRowManual, updateRowManual, and removeRowManual functions
// After calling updateTotal(), add:
function refreshCopyTableTotal() {
    const total = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]'))
        .reduce((sum, row) => {
            const amountCell = row.querySelector('.amount');
            if (amountCell) {
                const amountValue = parseFloat(amountCell.textContent) || 0;
                return sum + amountValue;
            }
            return sum;
        }, 0);

    const copyTotalElement = document.getElementById('copyTotalAmount');
    if (copyTotalElement) {
        copyTotalElement.textContent = total.toFixed(2);
    }
}

async function addRowManual() {
    let itemName = document.getElementById("itemNameManual").value.trim();
    let quantity = parseFloat(document.getElementById("quantityManual").value.trim());
    let unit = document.getElementById("selectUnit").value.trim();
    let rate = parseFloat(document.getElementById("rateManual").value.trim());

    // GST Inclusive Logic
    if (isGSTMode && isGSTInclusive && currentGSTPercent > 0) {
        rate = rate / (1 + currentGSTPercent / 100);
    }

    const notes = document.getElementById("itemNotesManual").value.trim();

    // Get HSN code if in GST mode
    let hsnCode = '';
    let productCode = '';
    if (isGSTMode) {
        hsnCode = document.getElementById("hsnCodeManual").value.trim();
        productCode = document.getElementById("productCodeManual").value.trim();
    }

    // Get discount values
    const discountType = document.getElementById("discountType").value;
    const discountValue = parseFloat(document.getElementById("discountValue").value) || 0;

    // ENSURE DIMENSION VALUES ARE PROPERLY CALCULATED FIRST
    calculateDimensions();

    // CAPTURE DIMENSION DATA
    const currentDimType = currentDimensions.type;
    const currentDimValues = [...currentDimensions.values];
    const currentDimUnit = currentDimensions.unit;
    const currentDimArea = currentDimensions.calculatedArea;

    // CAPTURE TOGGLE STATES
    const dim1Toggle = document.getElementById('dimension1-toggle');
    const dim2Toggle = document.getElementById('dimension2-toggle');
    const dim3Toggle = document.getElementById('dimension3-toggle');
    const toggleStates = {
        toggle1: dim1Toggle ? dim1Toggle.checked : true,
        toggle2: dim2Toggle ? dim2Toggle.checked : true,
        toggle3: dim3Toggle ? dim3Toggle.checked : true
    };

    // Get dimensions display text
    const dimensionText = getDimensionDisplayText(currentDimType, currentDimValues, currentDimUnit, toggleStates);

    // Store original quantity with full precision
    const originalQuantity = quantity;

    // --- NEW CONVERSION LOGIC ---
    let power = 0;
    if (currentDimType !== 'none' && currentDimType !== 'dozen') {
        if (toggleStates.toggle1) power++;
        if (['widthXheight', 'widthXdepth', 'lengthXdepth', 'lengthXheight', 'lengthXwidth', 'widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(currentDimType)) {
            if (toggleStates.toggle2) power++;
        }
        if (['widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(currentDimType)) {
            if (toggleStates.toggle3) power++;
        }
    }
    const selectedConvertUnit = document.getElementById('convertUnit').value;
    const conversionFactor = getConversionFactor(currentDimUnit, selectedConvertUnit, power);
    // ----------------------------

    // Calculate base amount
    let calculatedQuantity = quantity;
    let baseAmount = 0;

    if (currentDimType !== 'none' && currentDimType !== 'dozen' && currentDimArea > 0) {
        // Apply conversion factor
        calculatedQuantity = (quantity * currentDimArea) * conversionFactor;
        baseAmount = storeWithPrecision(calculatedQuantity * rate);
    } else if (currentDimType === 'dozen') {
        calculatedQuantity = quantity / 12;
        baseAmount = storeWithPrecision(calculatedQuantity * rate);
    } else {
        baseAmount = quantity * rate;
    }

    // CALCULATE DISCOUNT
    let discountAmount = 0;
    let finalAmount = baseAmount;

    if (discountType !== 'none' && discountValue > 0) {
        switch (discountType) {
            case 'percent_per_unit':
                const discountPerUnit = rate * (discountValue / 100);
                discountAmount = discountPerUnit * (currentDimType !== 'none' && currentDimType !== 'dozen' ? calculatedQuantity : quantity);
                break;
            case 'amt_per_unit':
                discountAmount = discountValue * (currentDimType !== 'none' && currentDimType !== 'dozen' ? calculatedQuantity : quantity);
                break;
            case 'percent_on_amount':
                discountAmount = baseAmount * (discountValue / 100);
                break;
            case 'amt_on_amount':
                discountAmount = discountValue;
                break;
        }
        finalAmount = storeWithPrecision(baseAmount - discountAmount);
        if (finalAmount < 0) finalAmount = 0;
    }

    if (isNaN(quantity) || isNaN(rate) || !itemName) {
        return;
    }

    const id = 'row-manual-' + rowCounterManual++;

    const row1 = createTableRowManual(
        id,
        itemName,
        originalQuantity.toFixed(8),
        unit,
        rate,
        finalAmount,
        notes,
        dimensionText,
        true,
        calculatedQuantity,
        currentDimType,
        originalQuantity,
        {
            values: currentDimValues,
            toggle1: toggleStates.toggle1,
            toggle2: toggleStates.toggle2,
            toggle3: toggleStates.toggle3
        },
        currentDimUnit,
        hsnCode,
        productCode,
        discountType,
        discountValue,
        true,
        selectedConvertUnit // Pass convert unit
    );

    row1.setAttribute('data-amount', storeWithPrecision(finalAmount));
    row1.setAttribute('data-rate', storeWithPrecision(rate));

    const row2 = createTableRowManual(
        id,
        itemName,
        originalQuantity.toFixed(8),
        unit,
        rate,
        finalAmount,
        notes,
        dimensionText,
        false,
        calculatedQuantity,
        currentDimType,
        originalQuantity,
        {
            values: currentDimValues,
            toggle1: toggleStates.toggle1,
            toggle2: toggleStates.toggle2,
            toggle3: toggleStates.toggle3
        },
        currentDimUnit,
        hsnCode,
        productCode,
        discountType,
        discountValue,
        true,
        selectedConvertUnit // Pass convert unit
    );

    document.getElementById("createListManual").querySelector('tbody').appendChild(row1);
    document.getElementById("copyListManual").querySelector('tbody').appendChild(row2);

    if (isGSTMode) {
        copyItemsToGSTBill();
        updateGSTTaxCalculation();
    }

    updateSerialNumbers();
    updateTotal();
    refreshCopyTableTotal();
    await saveToLocalStorage();
    saveStateToHistory();

    // Clear inputs
    document.getElementById("itemNameManual").value = "";
    document.getElementById("quantityManual").value = "";
    document.getElementById("rateManual").value = "";
    document.getElementById("itemNotesManual").value = "";
    document.getElementById("dimension1").value = "";
    document.getElementById("dimension2").value = "";
    document.getElementById("dimension3").value = "";
    document.getElementById("discountType").value = "none";
    document.getElementById("discountValue").value = "";

    if (isGSTMode) {
        document.getElementById("hsnCodeManual").value = "";
        document.getElementById("productCodeManual").value = "";
    }

    document.getElementById('dimensionType').value = 'none';
    document.getElementById('measurementUnit').style.display = 'none';
    document.getElementById('dimensionInputs').style.display = 'none';

    // Reset Convert options
    document.getElementById('toggleConvertBtn').style.display = 'none';
    document.getElementById('toggleConvertBtn').classList.remove('active');
    document.getElementById('convertUnit').style.display = 'none';
    document.getElementById('convertUnit').value = 'none';
    currentConvertUnit = 'none';

    currentDimensions = {
        type: 'none',
        unit: 'ft',
        values: [0, 0, 0],
        calculatedArea: 0
    };

    document.getElementById("itemNameManual").focus();

    applyColumnVisibility()
}

async function updateRowManual() {
    if (!currentlyEditingRowIdManual) return;

    let itemName = document.getElementById("itemNameManual").value.trim();
    let quantityInput = document.getElementById("quantityManual").value.trim();
    let quantity = parseFloat(quantityInput);
    let unit = document.getElementById("selectUnit").value.trim();
    let rate = parseFloat(document.getElementById("rateManual").value.trim());

    if (isGSTMode && isGSTInclusive && currentGSTPercent > 0) {
        rate = rate / (1 + currentGSTPercent / 100);
    }
    const notes = document.getElementById("itemNotesManual").value.trim();

    let hsnCode = '';
    let productCode = '';
    if (isGSTMode) {
        hsnCode = document.getElementById("hsnCodeManual").value.trim();
        productCode = document.getElementById("productCodeManual").value.trim();
    }

    const discountType = document.getElementById("discountType").value;
    const discountValue = parseFloat(document.getElementById("discountValue").value) || 0;

    const dimensionType = currentDimensions.type;

    const dim1Toggle = document.getElementById('dimension1-toggle');
    const dim2Toggle = document.getElementById('dimension2-toggle');
    const dim3Toggle = document.getElementById('dimension3-toggle');
    const toggleStates = {
        toggle1: dim1Toggle ? dim1Toggle.checked : true,
        toggle2: dim2Toggle ? dim2Toggle.checked : true,
        toggle3: dim3Toggle ? dim3Toggle.checked : true
    };

    const dim1Value = parseFloat(document.getElementById('dimension1').value) || 0;
    const dim2Value = parseFloat(document.getElementById('dimension2').value) || 0;
    const dim3Value = parseFloat(document.getElementById('dimension3').value) || 0;

    document.getElementById('dimension1').value = dim1Value.toFixed(2);
    document.getElementById('dimension2').value = dim2Value.toFixed(2);
    document.getElementById('dimension3').value = dim3Value.toFixed(2);

    currentDimensions.values = [dim1Value, dim2Value, dim3Value];
    calculateDimensions();

    const dimensionText = getDimensionDisplayText(dimensionType, currentDimensions.values, currentDimensions.unit, toggleStates);
    const originalQuantity = quantity;

    // --- NEW CONVERSION LOGIC ---
    let power = 0;
    if (currentDimensions.type !== 'none' && currentDimensions.type !== 'dozen') {
        if (toggleStates.toggle1) power++;
        if (['widthXheight', 'widthXdepth', 'lengthXdepth', 'lengthXheight', 'lengthXwidth', 'widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(currentDimensions.type)) {
            if (toggleStates.toggle2) power++;
        }
        if (['widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(currentDimensions.type)) {
            if (toggleStates.toggle3) power++;
        }
    }
    const selectedConvertUnit = document.getElementById('convertUnit').value;
    const conversionFactor = getConversionFactor(currentDimensions.unit, selectedConvertUnit, power);
    // ----------------------------

    let calculatedQuantity = quantity;
    let baseAmount = 0;

    if (currentDimensions.type !== 'none' && currentDimensions.type !== 'dozen' && currentDimensions.calculatedArea > 0) {
        // Apply conversion factor
        calculatedQuantity = (quantity * currentDimensions.calculatedArea) * conversionFactor;
        baseAmount = storeWithPrecision(calculatedQuantity * rate);
    } else if (currentDimensions.type === 'dozen') {
        calculatedQuantity = quantity / 12;
        baseAmount = storeWithPrecision(calculatedQuantity * rate);
    } else {
        baseAmount = quantity * rate;
    }

    let discountAmount = 0;
    let finalAmount = baseAmount;

    if (discountType !== 'none' && discountValue > 0) {
        switch (discountType) {
            case 'percent_per_unit':
                const discountPerUnit = rate * (discountValue / 100);
                discountAmount = discountPerUnit * (currentDimensions.type !== 'none' && currentDimensions.type !== 'dozen' ? calculatedQuantity : quantity);
                break;
            case 'amt_per_unit':
                discountAmount = discountValue * (currentDimensions.type !== 'none' && currentDimensions.type !== 'dozen' ? calculatedQuantity : quantity);
                break;
            case 'percent_on_amount':
                discountAmount = baseAmount * (discountValue / 100);
                break;
            case 'amt_on_amount':
                discountAmount = discountValue;
                break;
        }
        finalAmount = storeWithPrecision(baseAmount - discountAmount);
        if (finalAmount < 0) finalAmount = 0;
    }

    if (isNaN(quantity) || isNaN(rate) || !itemName) {
        return;
    }

    const numericRate = typeof rate === 'string' ? parseFloat(rate) : Number(rate);
    const dimensionUnit = currentDimensions.unit;

    const formattedDisplayQuantity = originalQuantity % 1 === 0 ?
        originalQuantity.toString() :
        originalQuantity.toFixed(2);

    let finalQuantity = calculatedQuantity;
    if (currentDimensions.type !== 'none' && currentDimensions.type !== 'dozen' && currentDimensions.calculatedArea > 0) {
        finalQuantity = (quantity * currentDimensions.calculatedArea) * conversionFactor;
    } else if (currentDimensions.type === 'dozen') {
        finalQuantity = quantity / 12;
    } else {
        finalQuantity = quantity;
    }

    // Pass selectedConvertUnit
    let particularsHtml = formatParticularsManual(itemName, notes, dimensionText, formattedDisplayQuantity, finalQuantity, numericRate, dimensionType, dimensionUnit, unit, discountType, discountValue, toggleStates, selectedConvertUnit);

    const rows = document.querySelectorAll(`tr[data-id="${currentlyEditingRowIdManual}"]`);
    rows.forEach(row => {
        const cells = row.children;
        cells[1].innerHTML = particularsHtml;

        const formattedQuantity = originalQuantity % 1 === 0 ?
            originalQuantity.toString() :
            originalQuantity.toFixed(2);
        cells[2].textContent = formattedQuantity;

        cells[3].textContent = unit;
        cells[4].textContent = parseFloat(rate).toFixed(2);
        cells[5].textContent = roundToTwoDecimals(finalAmount).toFixed(2);

        row.setAttribute('data-amount', storeWithPrecision(finalAmount));
        row.setAttribute('data-rate', storeWithPrecision(rate));

        row.setAttribute('data-dimension-type', dimensionType);
        row.setAttribute('data-dimension-values', JSON.stringify([...currentDimensions.values]));
        row.setAttribute('data-dimension-unit', currentDimensions.unit);
        row.setAttribute('data-dimension-toggles', JSON.stringify(toggleStates));
        row.setAttribute('data-original-quantity', originalQuantity.toFixed(8));
        row.setAttribute('data-convert-unit', selectedConvertUnit); // SAVE CONVERT UNIT

        if (isGSTMode) {
            row.setAttribute('data-hsn', hsnCode);
            row.setAttribute('data-product-code', productCode);
        }

        row.setAttribute('data-discount-type', discountType);
        row.setAttribute('data-discount-value', discountValue);
    });

    if (isGSTMode) {
        copyItemsToGSTBill();
        updateGSTTaxCalculation();
    }

    updateSerialNumbers();
    updateTotal();
    await saveToLocalStorage();
    saveStateToHistory();

    // Clear inputs
    document.getElementById("itemNameManual").value = "";
    document.getElementById("quantityManual").value = "";
    document.getElementById("rateManual").value = "";
    document.getElementById("itemNotesManual").value = "";
    document.getElementById("dimension1").value = "";
    document.getElementById("dimension2").value = "";
    document.getElementById("dimension3").value = "";
    document.getElementById("discountType").value = "none";
    document.getElementById("discountValue").value = "";

    if (isGSTMode) {
        document.getElementById("hsnCodeManual").value = "";
        document.getElementById("productCodeManual").value = "";
    }

    document.getElementById('dimensionType').value = 'none';
    document.getElementById('measurementUnit').style.display = 'none';
    document.getElementById('dimensionInputs').style.display = 'none';

    // Reset Convert Options
    document.getElementById('toggleConvertBtn').style.display = 'none';
    document.getElementById('toggleConvertBtn').classList.remove('active');
    document.getElementById('convertUnit').style.display = 'none';
    document.getElementById('convertUnit').value = 'none';
    currentConvertUnit = 'none';

    currentDimensions = {
        type: 'none',
        unit: 'ft',
        values: [0, 0, 0],
        calculatedArea: 0
    };

    document.getElementById("addItemBtnManual").style.display = "inline-block";
    document.getElementById("updateItemBtnManual").style.display = "none";
    currentlyEditingRowIdManual = null;
    document.getElementById("itemNameManual").focus();
}

// Helper function to calculate area from dimensions considering toggle states
function calculateAreaWithToggles(dimensionType, dimensionValues, toggleStates) {
    const [v1, v2, v3] = dimensionValues;

    // Apply toggle states - if unchecked, use 1 (no effect on multiplication)
    const effectiveV1 = toggleStates.toggle1 ? v1 : 1;
    const effectiveV2 = toggleStates.toggle2 ? v2 : 1;
    const effectiveV3 = toggleStates.toggle3 ? v3 : 1;

    switch (dimensionType) {
        case 'length':
            return effectiveV1;
        case 'widthXheight':
            return effectiveV1 * effectiveV2;
        case 'widthXheightXdepth':
            return effectiveV1 * effectiveV2 * effectiveV3;
        case 'lengthXwidthXheight':
            return effectiveV1 * effectiveV2 * effectiveV3;
        case 'widthXdepth':
            return effectiveV1 * effectiveV2;
        case 'lengthXheightXdepth':
            return effectiveV1 * effectiveV2 * effectiveV3;
        case 'lengthXdepth':
            return effectiveV1 * effectiveV2;
        case 'lengthXheight':
            return effectiveV1 * effectiveV2;
        case 'lengthXwidth':
            return effectiveV1 * effectiveV2;
        case 'lengthXwidthXdepth':
            return effectiveV1 * effectiveV2 * effectiveV3;
        default:
            return 1;
    }
}

function duplicateRow(rowId) {
    const sourceRow = document.querySelector(`#createListManual tr[data-id="${rowId}"]`);
    if (!sourceRow) return;

    // Get all data from source row
    const cells = sourceRow.children;
    const particularsDiv = cells[1];
    const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
    const notes = particularsDiv.querySelector('.notes')?.textContent || '';

    const dimensionType = sourceRow.getAttribute('data-dimension-type') || 'none';
    const dimensionValues = JSON.parse(sourceRow.getAttribute('data-dimension-values') || '[0,0,0]');
    const dimensionUnit = sourceRow.getAttribute('data-dimension-unit') || 'ft';

    // FIX: PROPERLY get toggle states
    const toggleStatesAttr = sourceRow.getAttribute('data-dimension-toggles');
    let toggleStates;
    try {
        toggleStates = toggleStatesAttr && toggleStatesAttr !== 'undefined' ? JSON.parse(toggleStatesAttr) : { toggle1: true, toggle2: true, toggle3: true };
    } catch (e) {
        console.warn('Invalid toggle states, using defaults:', e);
        toggleStates = { toggle1: true, toggle2: true, toggle3: true };
    }

    const originalQuantity = parseFloat(sourceRow.getAttribute('data-original-quantity') || cells[2].textContent);

    const hsnCode = sourceRow.getAttribute('data-hsn') || '';
    const productCode = sourceRow.getAttribute('data-product-code') || '';
    const discountType = sourceRow.getAttribute('data-discount-type') || 'none';
    const discountValue = sourceRow.getAttribute('data-discount-value') || '';

    // --- FIX: GET CONVERT UNIT ---
    const convertUnit = sourceRow.getAttribute('data-convert-unit') || 'none';

    const unit = cells[3].textContent;
    const rate = parseFloat(cells[4].textContent);
    const amount = parseFloat(cells[5].textContent);

    // Create new unique ID
    const newId = 'row-manual-' + rowCounterManual++;

    // --- FIX: Calculate final quantity using NEW CONVERSION LOGIC ---
    let finalQuantity = originalQuantity;

    // 1. Determine dimensionality (power)
    let power = 0;
    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
        if (toggleStates.toggle1) power++;
        if (['widthXheight', 'widthXdepth', 'lengthXdepth', 'lengthXheight', 'lengthXwidth', 'widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(dimensionType)) {
            if (toggleStates.toggle2) power++;
        }
        if (['widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].includes(dimensionType)) {
            if (toggleStates.toggle3) power++;
        }
    }

    // 2. Get Conversion Factor
    const conversionFactor = getConversionFactor(dimensionUnit, convertUnit, power);

    // 3. Calculate Final Quantity
    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
        const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
        // Apply toggles to calculation (simplified check, ideally use calculateAreaWithToggles if strict)
        // But for duplication, we can rely on the source row's logic logic being consistent

        // Re-calculate area with toggles specifically
        let effectiveArea = calculateAreaWithToggles(dimensionType, dimensionValues, toggleStates);
        finalQuantity = (originalQuantity * effectiveArea) * conversionFactor;
    } else if (dimensionType === 'dozen') {
        finalQuantity = originalQuantity / 12;
    }

    // Get dimension text
    const dimensionText = getDimensionDisplayText(dimensionType, dimensionValues, dimensionUnit, toggleStates);

    // Create duplicate row with PROPER CONVERT UNIT
    const newRow = createTableRowManual(
        newId,
        itemName,
        originalQuantity.toFixed(8),
        unit,
        rate,
        amount,
        notes,
        dimensionText,
        true,
        finalQuantity,
        dimensionType,
        originalQuantity,
        {
            values: dimensionValues,
            toggle1: toggleStates.toggle1,
            toggle2: toggleStates.toggle2,
            toggle3: toggleStates.toggle3
        },
        dimensionUnit,
        hsnCode,
        productCode,


        discountType,
        discountValue,
        true, // dimensionsVisible
        convertUnit // <--- PASS CONVERT UNIT
    );

    // Insert the duplicate below the source row
    sourceRow.parentNode.insertBefore(newRow, sourceRow.nextSibling);

    // Sync to other tables
    syncDuplicatedRowToOtherTables(newId, sourceRow, itemName, originalQuantity, unit, rate, amount, notes, dimensionType, dimensionValues, dimensionUnit, hsnCode, productCode, discountType, discountValue, finalQuantity, dimensionText, toggleStates, convertUnit);

    // Update everything
    updateSerialNumbers();
    updateTotal();
    refreshCopyTableTotal(); // Ensure copy table total updates
    saveToLocalStorage();
    saveStateToHistory();
    applyColumnVisibility();

    if (isGSTMode) {
        copyItemsToGSTBill(); // Ensure sync
        updateGSTTaxCalculation();
    }
}

// Helper function to calculate area from dimensions (add if not exists)
function calculateAreaFromDimensions(dimensionType, dimensionValues) {
    const [v1, v2, v3] = dimensionValues;
    switch (dimensionType) {
        case 'length':
            return v1;
        case 'widthXheight':
            return v1 * v2;
        case 'widthXheightXdepth':
            return v1 * v2 * v3;
        default:
            return 1;
    }
}

// Sync duplicated row to other tables with toggle states
function syncDuplicatedRowToOtherTables(newId, sourceRow, itemName, quantity, unit, rate, amount, notes, dimensionType, dimensionValues, dimensionUnit, hsnCode, productCode, discountType, discountValue, finalQuantity, dimensionText, toggleStates, convertUnit = 'none') {
    // Sync to copyListManual (regular bill table)
    const copySourceRow = document.querySelector(`#copyListManual tr[data-id="${sourceRow.getAttribute('data-id')}"]`);
    if (copySourceRow) {
        const copyRow = createTableRowManual(
            newId,
            itemName,
            quantity.toFixed(8),
            unit,
            rate,
            amount,
            notes,
            dimensionText,
            false,
            finalQuantity,
            dimensionType,
            quantity,
            {
                values: dimensionValues,
                toggle1: toggleStates.toggle1,
                toggle2: toggleStates.toggle2,
                toggle3: toggleStates.toggle3
            },
            dimensionUnit,
            hsnCode,
            productCode,
            discountType,
            discountValue,
            true, // dimensionsVisible default
            convertUnit // <--- PASS CONVERT UNIT
        );
        copySourceRow.parentNode.insertBefore(copyRow, copySourceRow.nextSibling);
    }

    // Sync to GST table if in GST mode
    if (isGSTMode) {
        const gstSourceRow = document.querySelector(`#gstCopyListManual tr[data-id="${sourceRow.getAttribute('data-id')}"]`);
        if (gstSourceRow) {
            const gstRow = createGSTTableRowManual(
                newId,
                itemName,
                quantity.toFixed(8),
                unit,
                rate,
                amount,
                notes,
                dimensionText,
                false,
                finalQuantity,
                dimensionType,
                quantity,
                dimensionValues,
                dimensionUnit,
                hsnCode,
                productCode,
                discountType,
                discountValue,
                convertUnit // <--- PASS CONVERT UNIT
            );
            gstSourceRow.parentNode.insertBefore(gstRow, gstSourceRow.nextSibling);
        }
    }
}

function toggleRowDimensions(rowId) {
    const rows = document.querySelectorAll(`tr[data-id="${rowId}"]`);
    const isCurrentlyVisible = document.querySelector(`#createListManual tr[data-id="${rowId}"]`)?.getAttribute('data-dimensions-visible') === 'true';
    const newVisibilityState = !isCurrentlyVisible;

    rows.forEach(row => {
        const particularsCell = row.children[1];
        const dimensionsDiv = particularsCell.querySelector('.dimensions');

        if (dimensionsDiv) {
            if (newVisibilityState) {
                // Show dimensions
                dimensionsDiv.style.display = 'block';
                row.setAttribute('data-dimensions-visible', 'true');
            } else {
                // Hide dimensions
                dimensionsDiv.style.display = 'none';
                row.setAttribute('data-dimensions-visible', 'false');
            }
        }

        // Only update the toggle button icon in the input table (where it exists)
        if (row.closest('#createListManual')) {
            const dimensionsBtn = row.querySelector('.dimensions-btn .material-icons');
            if (dimensionsBtn) {
                dimensionsBtn.textContent = newVisibilityState ? 'layers' : 'layers_clear';
            }
        }
    });

    saveToLocalStorage();
    saveStateToHistory(); // ADDED: Capture dimension toggle in undo/redo history
}
function createTableRowManual(id, itemName, quantity, unit, rate, amount, notes, dimensions, editable, finalQuantity = 0, dimensionType = 'none', originalQuantity = 0, dimensionData = { values: [0, 0, 0], toggle1: true, toggle2: true, toggle3: true }, dimensionUnit = 'ft', hsnCode = '', productCode = '', discountType = 'none', discountValue = '', dimensionsVisible = true, convertUnit = 'none') {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", id);

    // Add drag listeners to ALL rows
    addDragAndDropListeners(tr);

    // Only add click listener for editing to input table rows
    if (editable) {
        tr.addEventListener('click', () => editRowManual(id));
    }

    // Extract dimension values and toggle states
    const dimensionValues = dimensionData.values || [0, 0, 0];
    const toggleStates = {
        toggle1: dimensionData.toggle1 !== false,
        toggle2: dimensionData.toggle2 !== false,
        toggle3: dimensionData.toggle3 !== false
    };

    // FIX: Format display quantity - remove .00 if whole number
    const displayQuantity = parseFloat(originalQuantity > 0 ? originalQuantity : quantity);
    const formattedDisplayQuantity = displayQuantity % 1 === 0 ?
        displayQuantity.toString() :
        displayQuantity.toFixed(2);

    // SAFELY handle rate conversion to number
    const numericRate = typeof rate === 'string' ? parseFloat(rate) : Number(rate);
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);

    // Pass convertUnit to formatParticularsManual
    let particularsHtml = formatParticularsManual(itemName, notes, dimensions, displayQuantity, finalQuantity, numericRate, dimensionType, dimensionUnit, unit, discountType, discountValue, toggleStates, convertUnit);

    const removeFn = editable ? `removeRowManual('${id}')` : `removeRowManual('${id}', true)`;

    // Create actions HTML with three buttons
    let actionsHtml = '';
    if (editable) {
        actionsHtml = `
            <div class="action-buttons">
                <button onclick="duplicateRow('${id}')" class="action-btn copy-btn" title="Duplicate Item">
                    <span class="material-icons">content_copy</span>
                </button>
                <button onclick="toggleRowDimensions('${id}')" class="action-btn dimensions-btn" title="Toggle Dimensions">
                    <span class="material-icons">${dimensionsVisible ? 'layers' : 'layers_clear'}</span>
                </button>
                <button onclick="${removeFn}" class="action-btn remove-btn" title="Remove Item">
                    <span class="material-icons">close</span>
                </button>
            </div>
        `;
    } else {
        // actionsHtml = `<button onclick="${removeFn}" class="remove-btn"><span class="material-icons">close</span></button>`;
    }

    tr.innerHTML = `
    <td class="sr-no"></td>
    <td>${particularsHtml}</td>
    <td>${formattedDisplayQuantity}</td>
    <td>${unit}</td>
    <td>${numericRate.toFixed(2)}</td>
    <td class="amount">${numericAmount.toFixed(2)}</td>
    <td class="actions-cell">${actionsHtml}</td>
`;

    // Set dimension attributes including toggle states
    tr.setAttribute('data-dimension-type', dimensionType);
    tr.setAttribute('data-dimension-values', JSON.stringify(dimensionValues));
    tr.setAttribute('data-dimension-unit', dimensionUnit);
    tr.setAttribute('data-dimension-toggles', JSON.stringify(toggleStates));
    tr.setAttribute('data-original-quantity', displayQuantity.toFixed(8));

    // SAFELY store original rate as number
    tr.setAttribute('data-original-rate', numericRate.toFixed(8));

    // Set amounts
    tr.setAttribute('data-amount', storeWithPrecision(numericAmount));
    tr.setAttribute('data-rate', storeWithPrecision(numericRate));

    // Set dimension visibility attribute
    tr.setAttribute('data-dimensions-visible', dimensionsVisible ? 'true' : 'false');

    // Set Convert Unit attribute
    tr.setAttribute('data-convert-unit', convertUnit);

    // Add HSN and product code data if provided
    if (hsnCode) {
        tr.setAttribute('data-hsn', hsnCode);
    }
    if (productCode) {
        tr.setAttribute('data-product-code', productCode);
    }

    // Add discount data attributes
    tr.setAttribute('data-discount-type', discountType);
    tr.setAttribute('data-discount-value', discountValue);

    return tr;
}

function createGSTTableRowManual(id, itemName, quantity, unit, rate, amount, notes, dimensions, editable, finalQuantity = 0, dimensionType = 'none', originalQuantity = 0, dimensionValues = [0, 0, 0], dimensionUnit = 'ft', hsnCode = '', productCode = '', discountType = 'none', discountValue = '', convertUnit = 'none') {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", id);

    const displayQuantity = parseFloat(originalQuantity > 0 ? originalQuantity : quantity);
    const formattedDisplayQuantity = displayQuantity % 1 === 0 ? displayQuantity.toString() : displayQuantity.toFixed(2);

    const numericRate = typeof rate === 'string' ? parseFloat(rate) : Number(rate);
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : Number(amount);

    // Pass convertUnit to formatParticularsManual (toggleStates is null here as GST table relies on saved calc)
    let particularsHtml = formatParticularsManual(itemName, notes, dimensions, displayQuantity, finalQuantity, numericRate, dimensionType, dimensionUnit, unit, discountType, discountValue, null, convertUnit);

    const removeFn = `removeRowManual('${id}', true)`;

    tr.innerHTML = `
    <td class="sr-no"></td>
    <td>${particularsHtml}</td>
    <td>${hsnCode}</td>
    <td>${formattedDisplayQuantity}</td>
    <td>${unit}</td>
    <td>${numericRate.toFixed(2)}</td>
    <td class="amount">${numericAmount.toFixed(2)}</td>
    
`;

    tr.setAttribute('data-dimension-type', dimensionType);
    tr.setAttribute('data-dimension-values', JSON.stringify(dimensionValues));
    tr.setAttribute('data-dimension-unit', dimensionUnit);
    tr.setAttribute('data-original-quantity', displayQuantity.toFixed(8));
    tr.setAttribute('data-hsn', hsnCode);
    tr.setAttribute('data-convert-unit', convertUnit);

    tr.setAttribute('data-discount-type', discountType);
    tr.setAttribute('data-discount-value', discountValue);

    if (productCode) {
        tr.setAttribute('data-product-code', productCode);
    }

    return tr;
}

function removeRowManual(id) {
    // Remove from regular tables
    document.querySelectorAll(`tr[data-id="${id}"]`).forEach(row => row.remove());

    // Remove from GST table if exists
    const gstRows = document.querySelectorAll(`#gstCopyListManual tr[data-id="${id}"]`);
    gstRows.forEach(row => row.remove());

    // FIX: Update GST table and calculations when in GST mode
    if (isGSTMode) {
        copyItemsToGSTBill();
        updateGSTTaxCalculation();
    }

    updateSerialNumbers();
    updateTotal();
    // In addRowManual, updateRowManual, removeRowManual functions:
    // After updateTotal(); add:
    refreshCopyTableTotal();
    saveToLocalStorage();
    saveStateToHistory();
}

function editRowManual(id) {
    // Prevent editing if click came from action buttons
    if (window.event) {
        const target = window.event.target;
        if (target.closest('.action-buttons') || target.closest('.action-btn')) {
            return;
        }
    }

    const row = document.querySelector(`#createListManual tr[data-id="${id}"]`);
    if (!row) return;
    currentlyEditingRowIdManual = id;
    const cells = row.children;
    const particularsDiv = cells[1];
    const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
    const notesText = particularsDiv.querySelector('.notes')?.textContent || '';

    const dimensionType = row.getAttribute('data-dimension-type') || 'none';
    const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
    const dimensionUnit = row.getAttribute('data-dimension-unit') || 'ft';


    // Safe JSON parsing for dimension toggles
    const toggleStatesAttr = row.getAttribute('data-dimension-toggles');
    let toggleStates;
    try {
        toggleStates = toggleStatesAttr && toggleStatesAttr !== 'undefined' ? JSON.parse(toggleStatesAttr) : { toggle1: true, toggle2: true, toggle3: true };
    } catch (e) {
        console.warn('Invalid toggle states in editRowManual, using defaults:', e);
        toggleStates = { toggle1: true, toggle2: true, toggle3: true };
    }

    const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);

    // Get HSN, product code, discount, and CONVERT UNIT
    const hsnCode = row.getAttribute('data-hsn') || '';
    const productCode = row.getAttribute('data-product-code') || '';
    const discountType = row.getAttribute('data-discount-type') || 'none';
    const discountValue = row.getAttribute('data-discount-value') || '';
    const savedConvertUnit = row.getAttribute('data-convert-unit') || 'none';


    // Populate all fields
    document.getElementById("itemNameManual").value = itemName;

    const formattedQuantity = originalQuantity % 1 === 0 ?
        originalQuantity.toString() :
        originalQuantity.toFixed(2);
    document.getElementById("quantityManual").value = formattedQuantity;

    document.getElementById("selectUnit").value = cells[3].textContent;
    document.getElementById("rateManual").value = parseFloat(cells[4].textContent).toFixed(2);
    document.getElementById("itemNotesManual").value = notesText;

    document.getElementById("hsnCodeManual").value = hsnCode;
    document.getElementById("productCodeManual").value = productCode;

    // --- RESTORE DISCOUNT STATE ---
    document.getElementById("discountType").value = discountType;
    document.getElementById("discountValue").value = discountValue;

    if (discountType !== 'none' && discountValue > 0) {
        document.getElementById("discount-inputs-container").style.display = 'flex';
        // ACTIVATE BUTTON VISUALLY
        document.getElementById("toggleDiscountBtn").style.backgroundColor = '#27ae60';
    } else {
        document.getElementById("discount-inputs-container").style.display = 'none';
        document.getElementById("toggleDiscountBtn").style.backgroundColor = '';
    }

    // --- RESTORE DIMENSION STATE ---
    document.getElementById('dimensionType').value = dimensionType;
    handleDimensionTypeChange(); // This shows inputs based on type

    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
        // ACTIVATE BUTTON VISUALLY
        document.getElementById("dimension-inputs-container").style.display = 'flex';
        document.getElementById("toggleDimensionBtn").style.backgroundColor = '#3498db';

        // Show Convert Button since Dimensions are active
        document.getElementById('toggleConvertBtn').style.display = 'inline-block';

        document.getElementById('measurementUnit').value = dimensionUnit;
        currentDimensions.unit = dimensionUnit;

        const hasActualDimensions = dimensionValues.some(val => val > 0);

        if (hasActualDimensions) {
            document.getElementById('dimension1').value = parseFloat(dimensionValues[0]).toFixed(2);
            // Only fill 2 and 3 if applicable to type to keep UI clean
            if (['widthXheight', 'widthXdepth', 'lengthXdepth', 'lengthXheight', 'lengthXwidth', 'widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].some(t => dimensionType.includes(t) || dimensionType === t)) {
                document.getElementById('dimension2').value = parseFloat(dimensionValues[1]).toFixed(2);
            }
            if (['widthXheightXdepth', 'lengthXwidthXheight', 'lengthXheightXdepth', 'lengthXwidthXdepth'].some(t => dimensionType.includes(t) || dimensionType === t)) {
                document.getElementById('dimension3').value = parseFloat(dimensionValues[2]).toFixed(2);
            }
        } else {
            document.getElementById('dimension1').value = '';
            document.getElementById('dimension2').value = '';
            document.getElementById('dimension3').value = '';
        }

        currentDimensions.values = dimensionValues;

        // Set toggle states
        document.getElementById('dimension1-toggle').checked = toggleStates.toggle1;
        document.getElementById('dimension2-toggle').checked = toggleStates.toggle2;
        document.getElementById('dimension3-toggle').checked = toggleStates.toggle3;

        // --- RESTORE CONVERT UNIT STATE ---
        if (savedConvertUnit && savedConvertUnit !== 'none') {
            document.getElementById('toggleConvertBtn').classList.add('active'); // Make it purple
            document.getElementById('convertUnit').style.display = 'inline-block';
            document.getElementById('convertUnit').value = savedConvertUnit;
            currentConvertUnit = savedConvertUnit;
        } else {
            document.getElementById('toggleConvertBtn').classList.remove('active'); // Reset color
            document.getElementById('convertUnit').style.display = 'none';
            document.getElementById('convertUnit').value = 'none';
            currentConvertUnit = 'none';
        }

        calculateDimensions();
    } else {
        // Reset if no dimensions
        document.getElementById("dimension-inputs-container").style.display = 'none';
        document.getElementById("toggleDimensionBtn").style.backgroundColor = '';
        document.getElementById('toggleConvertBtn').style.display = 'none'; // Hide convert
    }
    previousConvertUnit = savedConvertUnit;
    document.getElementById("addItemBtnManual").style.display = "none";
    document.getElementById("updateItemBtnManual").style.display = "inline-block";
}

function updateSerialNumbers() {
    const vars = getModeSpecificVars();
    const createListId = vars.createListId;
    const copyListId = vars.copyListId;

    // Update all tables including GST table
    const tables = [createListId, copyListId];
    if (isGSTMode) {
        tables.push('gstCopyListManual');
    }

    tables.forEach(tableId => {
        const rows = document.querySelectorAll(`#${tableId} tbody tr`);
        let itemCounter = 0;

        rows.forEach((row) => {
            const srNoCell = row.querySelector('.sr-no');
            if (srNoCell) {
                if (row.classList.contains('section-row')) {
                    // Section rows get no serial number (blank)
                    srNoCell.textContent = '';
                } else if (row.getAttribute('data-id')) {
                    // Item rows get sequential serial numbers
                    itemCounter++;
                    srNoCell.textContent = itemCounter;
                } else {
                    // Any other rows get no serial number
                    srNoCell.textContent = '';
                }
            }
        });
    });
}
let isRegularFooterVisible = false;

function toggleRegularFooter() {
    const footer = document.getElementById('regular-bill-footer');
    const btn = document.getElementById('reg-footer-btn');

    isRegularFooterVisible = !isRegularFooterVisible;

    if (footer) {
        footer.style.display = isRegularFooterVisible ? 'table' : 'none';
    }


    // === UPDATED: SET BUTTON STYLE DIRECTLY ===
    if (btn) {
        btn.style.backgroundColor = isRegularFooterVisible ? 'var(--primary-color)' : '';
        btn.style.color = isRegularFooterVisible ? 'white' : '';
    }

    // Update info if showing
    if (isRegularFooterVisible) {
        updateRegularFooterInfo();
        // Also update amount in words immediately
        updateTotal();
    }

    applyColumnVisibility();
}

function updateRegularFooterInfo() {
    if (!companyInfo) return;

    // Update Text Fields
    const signatory = document.getElementById('reg-bill-company-signatory');
    const accHolder = document.getElementById('reg-bill-account-holder');
    const accNo = document.getElementById('reg-bill-account-number');
    const ifsc = document.getElementById('reg-bill-ifsc-code');
    const branch = document.getElementById('reg-bill-branch');
    const bank = document.getElementById('reg-bill-bank-name');

    if (signatory) signatory.textContent = `for ${companyInfo.name || 'COMPANY NAME'}`;
    if (accHolder) accHolder.textContent = companyInfo.accountHolder || '-';
    if (accNo) accNo.textContent = companyInfo.accountNumber || '-';
    if (ifsc) ifsc.textContent = companyInfo.ifscCode || '-';
    if (branch) branch.textContent = companyInfo.branch || '-';
    if (bank) bank.textContent = companyInfo.bankName || '-';

    // Update Branding (Sign & Stamp) for Regular Bill
    const regStampCell = document.getElementById('reg-stamp-cell');
    const regSignatureCell = document.getElementById('reg-signature-cell');

    if (regStampCell && regSignatureCell && brandingSettings) {
        regStampCell.innerHTML = '';
        regSignatureCell.innerHTML = '';

        if (brandingSettings.stamp) {
            const stampImg = document.createElement('img');
            stampImg.src = brandingSettings.stamp;
            stampImg.className = 'bill-stamp';
            regStampCell.appendChild(stampImg);
        }

        if (brandingSettings.signature) {
            const signImg = document.createElement('img');
            signImg.src = brandingSettings.signature;
            signImg.className = 'bill-signature';
            regSignatureCell.appendChild(signImg);
        }
    }
}

function updateTotal() {
    // 1. Calculate Item Subtotal
    const createListId = getModeSpecificVars().createListId;
    const subtotal = Array.from(document.querySelectorAll(`#${createListId} tbody tr[data-id]`))
        .reduce((sum, row) => {
            const amountCell = row.querySelector('.amount');
            return sum + (amountCell ? (parseFloat(amountCell.textContent) || 0) : 0);
        }, 0);

    // === NEW: UPDATE DISCOUNT & GST BUTTONS BASED ON ACTIVE CHAIN ===

    // Check Discount
    const hasDiscount = adjustmentChain && adjustmentChain.some(a => a.name.toLowerCase().includes('discount'));
    const discBtn = document.getElementById('discount-tool-btn');
    if (discBtn) {
        discBtn.style.backgroundColor = hasDiscount ? 'var(--primary-color)' : '';
        discBtn.style.color = hasDiscount ? 'white' : '';
    }

    // Check GST (Only in Regular Mode)
    const gstBtn = document.getElementById('gst-tool-btn');
    if (gstBtn) {
        // GST button active if GST exists in chain AND we are NOT in GST mode (since GST mode handles tax differently)
        const hasGST = adjustmentChain && adjustmentChain.some(a => a.name.toLowerCase().includes('gst'));
        if (hasGST && !isGSTMode) {
            gstBtn.style.backgroundColor = 'var(--primary-color)';
            gstBtn.style.color = 'white';
        } else {
            gstBtn.style.backgroundColor = '';
            gstBtn.style.color = '';
        }
    }

    // 2. Run Sequential Adjustment Calculation
    calculateAdjustments(subtotal);
    updateSectionTotals();

    if (isVendorMode) {
        saveVendorState();
    }
}


// Helper to create items from saved data
function createItemInAllTablesFromSaved(itemData) {
    const createListTbody = document.querySelector("#createListManual tbody");
    const copyListTbody = document.querySelector("#copyListManual tbody");

    // Create for input table
    const row1 = createTableRowManual(
        itemData.id,
        itemData.itemName,
        itemData.quantity,
        itemData.unit,
        parseFloat(itemData.rate),
        parseFloat(itemData.amount),
        itemData.notes,
        '', // dimension text will come from particularsHtml
        true,
        parseFloat(itemData.quantity),
        itemData.dimensionType,
        parseFloat(itemData.quantity),
        {
            values: itemData.dimensionValues || [0, 0, 0],
            toggle1: itemData.dimensionToggles?.toggle1 !== false,
            toggle2: itemData.dimensionToggles?.toggle2 !== false,
            toggle3: itemData.dimensionToggles?.toggle3 !== false
        },
        itemData.dimensionUnit,
        itemData.hsnCode,
        itemData.productCode,
        itemData.discountType,
        itemData.discountValue,
        itemData.dimensionsVisible !== false,
        itemData.convertUnit // <--- PASS THIS
    );

    // Use saved particulars HTML if available
    if (itemData.particularsHtml) {
        row1.children[1].innerHTML = itemData.particularsHtml;
    }
    if (itemData.displayQuantity) {
        row1.children[2].textContent = itemData.displayQuantity;
    }

    createListTbody.appendChild(row1);

    // Create for regular bill table
    const row2 = createTableRowManual(
        itemData.id,
        itemData.itemName,
        itemData.quantity,
        itemData.unit,
        parseFloat(itemData.rate),
        parseFloat(itemData.amount),
        itemData.notes,
        '',
        false,
        parseFloat(itemData.quantity),
        itemData.dimensionType,
        parseFloat(itemData.quantity),
        {
            values: itemData.dimensionValues || [0, 0, 0],
            toggle1: itemData.dimensionToggles?.toggle1 !== false,
            toggle2: itemData.dimensionToggles?.toggle2 !== false,
            toggle3: itemData.dimensionToggles?.toggle3 !== false
        },
        itemData.dimensionUnit,
        itemData.hsnCode,
        itemData.productCode,
        itemData.discountType,
        itemData.discountValue,
        itemData.dimensionsVisible !== false,
        itemData.convertUnit // <--- PASS THIS
    );

    if (itemData.particularsHtml) {
        row2.children[1].innerHTML = itemData.particularsHtml;
    }
    if (itemData.displayQuantity) {
        row2.children[2].textContent = itemData.displayQuantity;
    }

    copyListTbody.appendChild(row2);

    // Create for GST table if needed
    if (isGSTMode) {
        const gstListTbody = document.querySelector("#gstCopyListManual tbody");
        if (gstListTbody) {
            const gstRow = createGSTTableRowManual(
                itemData.id,
                itemData.itemName,
                itemData.quantity,
                itemData.unit,
                parseFloat(itemData.rate),
                parseFloat(itemData.amount),
                itemData.notes,
                '',
                false,
                parseFloat(itemData.quantity),
                itemData.dimensionType,
                parseFloat(itemData.quantity),
                itemData.dimensionValues,
                itemData.dimensionUnit,
                itemData.hsnCode,
                itemData.productCode,
                itemData.discountType,
                itemData.discountValue,
                itemData.convertUnit // <--- PASS THIS
            );

            if (itemData.particularsHtml) {
                gstRow.children[1].innerHTML = itemData.particularsHtml;
            }
            if (itemData.displayQuantity) {
                gstRow.children[3].textContent = itemData.displayQuantity;
            }

            gstListTbody.appendChild(gstRow);
        }
    }
}

async function removeSection(sectionId) {
    const shouldDeleteSection = await showConfirm('Are you sure you want to remove this section? All items under this section will also be removed.');
    if (shouldDeleteSection) {
        // Remove from all tables
        const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];
        tables.forEach(tableId => {
            const sectionRow = document.querySelector(`#${tableId} tr[data-section-id="${sectionId}"]`);
            if (sectionRow) {
                // Also remove all items under this section (until next section)
                let nextRow = sectionRow.nextElementSibling;
                while (nextRow && !nextRow.classList.contains('section-row')) {
                    const nextNextRow = nextRow.nextElementSibling;
                    nextRow.remove();
                    nextRow = nextNextRow;
                }
                // Remove the section row itself
                sectionRow.remove();
            }
        });

        updateSerialNumbers();
        updateTotal();
        saveToLocalStorage();
        saveStateToHistory();

        if (isGSTMode) {
            updateGSTTaxCalculation();
        }
    }
}


// Helper function to create sections from saved data
function createSectionInAllTablesFromSaved(sectionData) {
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

    tables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const tr = document.createElement('tr');
        tr.className = 'section-row';
        tr.setAttribute('data-section-id', sectionData.id);
        tr.setAttribute('draggable', 'true');

        const colspan = tableId === 'gstCopyListManual' ? '8' : '7';

        // FIX: Handle saved HTML differently for input table vs bill view tables
        if (sectionData.html && tableId === 'createListManual') {
            // Input table - use saved HTML with buttons
            tr.innerHTML = `<td colspan="${colspan}" style="${sectionData.style || ''}">${sectionData.html}</td>`;
        } else if (sectionData.html && (tableId === 'copyListManual' || tableId === 'gstCopyListManual')) {
            // Bill view tables - extract just the section name from HTML (remove buttons)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sectionData.html;

            // Extract just the text content (section name) without buttons
            let sectionName = '';
            for (let node of tempDiv.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    sectionName = node.textContent.trim();
                    break;
                }
            }

            // If we couldn't extract the name, fall back to the saved name
            if (!sectionName) {
                sectionName = sectionData.name;
            }

            tr.innerHTML = `
                <td colspan="${colspan}" style="${sectionData.style || ''}">
                    ${sectionName}
                </td>
            `;
        } else {
            // Fallback: create from basic data
            let content = sectionData.name;
            if (tableId === 'createListManual') {
                const buttonText = sectionData.collapsed ? '+' : '−';
                content = `${sectionData.name} 
                    <button class="collapse-btn" onclick="toggleSection('${sectionData.id}')">${buttonText}</button>
                    <button onclick="event.stopPropagation(); removeSection('${sectionData.id}')" class="remove-btn"><span class="material-icons">close</span></button>`;
            } else {
                // Bill view tables - show only section name
                content = sectionData.name;
            }

            tr.innerHTML = `
                <td colspan="${colspan}" style="${sectionData.style || ''}">
                    ${content}
                </td>
            `;
        }

        // ADD DRAG LISTENERS TO SECTION ROW
        addDragAndDropListeners(tr);
        tbody.appendChild(tr);
    });
}

function loadTermsData(termsData) {
    // Remove any existing terms first
    const existingTerms = document.querySelectorAll('.bill-footer-list[data-editable="true"]');
    existingTerms.forEach(terms => terms.remove());

    // Create new terms from saved data
    termsData.forEach(terms => {
        createTermsFromData(terms);
    });
}

function createTermsFromData(termsData) {
    const listContainer = document.createElement('div');
    listContainer.className = 'bill-footer-list';
    listContainer.setAttribute('data-editable', 'true');

    let listHTML = `<h4>${termsData.heading}</h4>`;
    listHTML += `<${termsData.listType} style="list-style-type: ${termsData.listStyle}">`;

    termsData.listItems.forEach(item => {
        listHTML += `<li>${item}</li>`;
    });

    listHTML += `</${termsData.listType}>`;
    listContainer.innerHTML = listHTML;

    // Insert below the appropriate table
    const billTotalTable = document.getElementById('bill-total-table');
    const gstBillTotalsTable = document.getElementById('gst-bill-totals-table');

    if (billTotalTable && !isGSTMode) {
        billTotalTable.parentNode.insertBefore(listContainer, billTotalTable.nextSibling);
    } else if (gstBillTotalsTable && isGSTMode) {
        gstBillTotalsTable.parentNode.insertBefore(listContainer, gstBillTotalsTable.nextSibling);
    } else {
        const listContainerParent = document.querySelector('.list-of-items');
        if (listContainerParent) {
            listContainerParent.appendChild(listContainer);
        }
    }
}

async function loadGSTCustomerDataFromLocalStorage() {
    try {
        const gstCustomerData = await getFromDB('gstMode', 'gstCustomerData');
        if (gstCustomerData) {
            // Update GST bill header
            document.getElementById('bill-invoice-no').textContent = gstCustomerData.invoiceNo || '001';
            document.getElementById('bill-date-gst').textContent = formatDateForDisplay(gstCustomerData.invoiceDate) || formatDateForDisplay(new Date());

            // Update Bill To section
            document.getElementById('billToName').textContent = gstCustomerData.billTo.name || '';
            document.getElementById('billToAddr').textContent = gstCustomerData.billTo.address || '';
            document.getElementById('billToGstin').textContent = gstCustomerData.billTo.gstin || 'customer 15-digit GSTIN';
            document.getElementById('billToState').textContent = gstCustomerData.billTo.state || 'maharashtra';
            document.getElementById('billToStateCode').textContent = gstCustomerData.billTo.stateCode || '27';

            // Update Ship To section if applicable
            const shipToDiv = document.getElementById('shipTo');
            if (gstCustomerData.customerType === 'both' && gstCustomerData.shipTo.name) {
                shipToDiv.style.display = 'block';
                document.getElementById('shipToName').textContent = gstCustomerData.shipTo.name;
                document.getElementById('shipToAddr').textContent = gstCustomerData.shipTo.address;
                document.getElementById('shipToGstin').textContent = gstCustomerData.shipTo.gstin;
                document.getElementById('shipToState').textContent = gstCustomerData.shipTo.state;
                document.getElementById('shipToStateCode').textContent = gstCustomerData.shipTo.stateCode;
                document.getElementById('shipToPOS').textContent = gstCustomerData.shipTo.placeOfSupply;
            } else {
                shipToDiv.style.display = 'none';
            }

            // Update transaction type and GST percent
            transactionType = gstCustomerData.transactionType || 'intrastate';
            currentGSTPercent = gstCustomerData.gstPercent || 18;

            console.log('GST customer data loaded successfully');
        }
    } catch (error) {
        console.error('Error loading GST customer data:', error);
    }
}

async function loadFromLocalStorage() {
    try {
        const saved = await getFromDB('billDataManual', 'currentBill');
        if (saved) {
            // Load company details
            document.getElementById("companyName").textContent = saved.company?.name || "COMPANY NAME";
            document.getElementById("companyAddr").textContent = saved.company?.address || "Address";
            document.getElementById("companyPhone").textContent = saved.company?.phone || "+91 01234-56789";
            document.getElementById("companyGstin").textContent = saved.company?.gstin || "GSTIN : Your 15-digit GSTIN";

            // Load customer details
            document.getElementById("custName").value = saved.customer?.name || "";
            document.getElementById("billNo").value = saved.customer?.billNo || "";
            document.getElementById("custAddr").value = saved.customer?.address || "";
            document.getElementById("billDate").value = saved.customer?.date || "";
            document.getElementById("custPhone").value = saved.customer?.phone || "";
            document.getElementById("custGSTIN").value = saved.customer?.gstin || "";

            // === NEW: Load Adjustments (with Migration) ===
            if (saved.adjustmentChain) {
                // Load new format directly
                adjustmentChain = saved.adjustmentChain;
            } else if (saved.taxSettings) {
                // MIGRATION: Convert legacy Tax/Discount to Adjustment Chain
                adjustmentChain = []; // Reset

                // Migrate Discount (Subtract) - Put at start
                if (saved.taxSettings.discountPercent > 0) {
                    adjustmentChain.push({
                        id: 'legacy-discount',
                        name: 'Discount',
                        type: 'percent',
                        value: saved.taxSettings.discountPercent,
                        operation: 'subtract',
                        textColor: '#e74c3c'
                    });
                } else if (saved.taxSettings.discountAmount > 0) {
                    adjustmentChain.push({
                        id: 'legacy-discount',
                        name: 'Discount',
                        type: 'amount',
                        value: saved.taxSettings.discountAmount,
                        operation: 'subtract',
                        textColor: '#e74c3c'
                    });
                }

                // Migrate GST (Add) - Put at end
                if (saved.taxSettings.gstPercent > 0) {
                    adjustmentChain.push({
                        id: 'legacy-gst',
                        name: 'GST',
                        type: 'percent',
                        value: saved.taxSettings.gstPercent,
                        operation: 'add',
                        textColor: '#27ae60'
                    });
                }
                console.log('Migrated legacy tax settings to adjustment chain');
            } else {
                adjustmentChain = [];
            }

            // Load GST Data
            await loadCompanyInfo();
            await loadGSTCustomerDataFromLocalStorage();

            if (saved.gstCustomerData) {
                // ... [Existing GST Customer Load Logic] ...
                document.getElementById('bill-invoice-no').textContent = saved.gstCustomerData.invoiceNo || '';
                document.getElementById('bill-date-gst').textContent = saved.gstCustomerData.invoiceDate || '';
                document.getElementById('billToName').textContent = saved.gstCustomerData.billTo?.name || '';
                document.getElementById('billToAddr').textContent = saved.gstCustomerData.billTo?.address || '';
                document.getElementById('billToGstin').textContent = saved.gstCustomerData.billTo?.gstin || 'customer 15-digit GSTIN';
                document.getElementById('billToContact').textContent = saved.gstCustomerData.billTo?.contact || 'Not provided';
                document.getElementById('billToState').textContent = saved.gstCustomerData.billTo?.state || 'Maharashtra';
                document.getElementById('billToStateCode').textContent = saved.gstCustomerData.billTo?.stateCode || '27';

                if (saved.gstCustomerData.customerType === 'both' && saved.gstCustomerData.shipTo?.name) {
                    document.getElementById('shipTo').style.display = 'block';
                    document.getElementById('shipToName').textContent = saved.gstCustomerData.shipTo.name;
                    document.getElementById('shipToAddr').textContent = saved.gstCustomerData.shipTo.address;
                    document.getElementById('shipToGstin').textContent = saved.gstCustomerData.shipTo.gstin;
                    document.getElementById('shipToContact').textContent = saved.gstCustomerData.shipTo?.contact || 'Not provided';
                    document.getElementById('shipToState').textContent = saved.gstCustomerData.shipTo.state;
                    document.getElementById('shipToStateCode').textContent = saved.gstCustomerData.shipTo.stateCode;
                    document.getElementById('shipToPOS').textContent = saved.gstCustomerData.shipTo.placeOfSupply;
                } else {
                    document.getElementById('shipTo').style.display = 'none';
                }
            }

            // Clear and Rebuild Tables
            const createListTbody = document.querySelector("#createListManual tbody");
            const copyListTbody = document.querySelector("#copyListManual tbody");
            const gstListTbody = document.querySelector("#gstCopyListManual tbody");

            createListTbody.innerHTML = "";
            copyListTbody.innerHTML = "";
            if (gstListTbody) gstListTbody.innerHTML = "";

            let maxId = 0;

            // Load Items/Sections
            if (saved.tableStructure && saved.tableStructure.length > 0) {
                saved.tableStructure.forEach(rowData => {
                    if (rowData.type === 'section') {
                        createSectionInAllTablesFromSaved(rowData);
                    } else if (rowData.type === 'item') {
                        createItemInAllTablesFromSaved(rowData);
                        const idNum = parseInt(rowData.id.split('-')[2]);
                        if (idNum > maxId) maxId = idNum;
                    }
                });
                rowCounterManual = maxId + 1;
            }

            // Load Terms
            if (saved.termsData && saved.termsData.length > 0) {
                loadTermsData(saved.termsData);
            }

            // Final Updates
            updateSerialNumbers();
            updateTotal(); // Calculates using the new adjustmentChain
            updateGSTINVisibility();

            if (isGSTMode) {
                copyItemsToGSTBill();
                updateGSTTaxCalculation();
            }
        }
    } catch (error) {
        console.error('Error loading from IndexedDB:', error);
    }
}
function getTermsData() {
    const termsDivs = document.querySelectorAll('.bill-footer-list[data-editable="true"]');
    const termsData = [];

    termsDivs.forEach(termsDiv => {
        const heading = termsDiv.querySelector('h4')?.textContent || '';
        const listElement = termsDiv.querySelector('ul, ol');
        const listType = listElement?.tagName.toLowerCase() || 'ul';
        const listStyle = listElement?.style.listStyleType || (listType === 'ul' ? 'disc' : 'decimal');

        const listItems = Array.from(termsDiv.querySelectorAll('li')).map(li => li.textContent);

        termsData.push({
            heading: heading,
            listType: listType,
            listStyle: listStyle,
            listItems: listItems
        });
    });

    return termsData;
}

function copyBillToShipTo() {
    // Copy values from Bill To (consignee) to Ship To (buyer)
    document.getElementById('buyer-name').value = document.getElementById('consignee-name').value;
    document.getElementById('buyer-address').value = document.getElementById('consignee-address').value;
    document.getElementById('buyer-gst').value = document.getElementById('consignee-gst').value;
    document.getElementById('buyer-state').value = document.getElementById('consignee-state').value;
    document.getElementById('buyer-code').value = document.getElementById('consignee-code').value;
    document.getElementById('buyer-contact').value = document.getElementById('consignee-contact').value;

    // Trigger auto-save if setup
    saveCustomerDialogState();
    
    showNotification('Copied details from Bill To', 'success');
}
async function getGSTCustomerDataForSave() {
    // Get current GST customer data from the BILL VIEW DISPLAY, not the form
    const shipToVisible = document.getElementById('shipTo').style.display !== 'none';

    return {
        invoiceNo: document.getElementById('bill-invoice-no').textContent,
        invoiceDate: document.getElementById('bill-date-gst').textContent,
        billTo: {
            name: document.getElementById('billToName').textContent,
            address: document.getElementById('billToAddr').textContent,
            gstin: document.getElementById('billToGstin').textContent,
            contact: document.getElementById('billToContact').textContent,
            state: document.getElementById('billToState').textContent,
            stateCode: document.getElementById('billToStateCode').textContent
        },
        shipTo: {
            name: document.getElementById('shipToName').textContent,
            address: document.getElementById('shipToAddr').textContent,
            gstin: document.getElementById('shipToGstin').textContent,
            contact: document.getElementById('shipToContact').textContent,
            state: document.getElementById('shipToState').textContent,
            stateCode: document.getElementById('shipToStateCode').textContent,
            placeOfSupply: document.getElementById('shipToPOS').textContent
        },
        customerType: shipToVisible ? 'both' : 'bill-to',
        transactionType: transactionType,
        gstPercent: currentGSTPercent
    };
}
async function saveToLocalStorage() {
    try {
        const vars = getModeSpecificVars();
        const createListId = vars.createListId;

        // 1. Gather all basic data
        const data = {
            tableStructure: [],
            company: {
                name: document.getElementById("companyName").textContent,
                address: document.getElementById("companyAddr").textContent,
                phone: document.getElementById("companyPhone").textContent,
                gstin: document.getElementById("companyGstin").textContent
            },
            customer: {
                name: document.getElementById("custName").value,
                billNo: document.getElementById("billNo").value,
                address: document.getElementById("custAddr").value,
                date: document.getElementById("billDate").value,
                phone: document.getElementById("custPhone").value,
                gstin: document.getElementById("custGSTIN").value
            },
            // Keep legacy taxSettings object for safety, but main logic uses adjustmentChain
            taxSettings: {
                discountPercent: 0, // Deprecated but kept for structure
                discountAmount: 0,
                gstPercent: 0
            },
            // NEW: Save the adjustment chain
            adjustmentChain: adjustmentChain,

            // State flags
            normalBillState: {
                discountVisible: adjustmentChain.length > 0,
                gstVisible: adjustmentChain.length > 0
            },
            termsData: getTermsData(),
            gstCustomerData: await getGSTCustomerDataForSave()
        };

        // 2. Gather Rows (Items and Sections)
        document.querySelectorAll(`#${createListId} tbody tr`).forEach(row => {
            if (row.classList.contains('section-row')) {
                // ... [Existing Section Logic] ...
                const sectionId = row.getAttribute('data-section-id');
                const cell = row.querySelector('td');
                const collapseBtn = row.querySelector('.collapse-btn');

                let sectionName = '';
                for (let node of cell.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        sectionName = node.textContent.trim();
                        break;
                    }
                }

                let htmlContent = row.closest('#createListManual') ? cell.innerHTML : sectionName;

                // In saveToLocalStorage, inside the section row block:
                data.tableStructure.push({
                    type: 'section',
                    id: sectionId,
                    name: sectionName,
                    style: cell.getAttribute('style') || '',
                    collapsed: collapseBtn ? collapseBtn.textContent === '+' : false,
                    html: htmlContent,
                    sourceTable: row.closest('table')?.id || 'createListManual',
                    showTotal: row.getAttribute('data-show-total') === 'true' // Save this
                });

            } else if (row.getAttribute('data-id')) {
                // ... [Existing Item Logic] ...
                const cells = row.children;
                const particularsDiv = cells[1];
                const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
                const notes = particularsDiv.querySelector('.notes')?.textContent || '';

                const dimensionType = row.getAttribute('data-dimension-type') || 'none';
                const dimensionValuesAttr = row.getAttribute('data-dimension-values');
                const dimensionValues = dimensionValuesAttr ? JSON.parse(dimensionValuesAttr) : [0, 0, 0];
                const dimensionUnit = row.getAttribute('data-dimension-unit') || 'ft';
                const toggleStatesAttr = row.getAttribute('data-dimension-toggles');
                const toggleStates = toggleStatesAttr ? JSON.parse(toggleStatesAttr) : { toggle1: true, toggle2: true, toggle3: true };

                const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
                const hsnCode = row.getAttribute('data-hsn') || '';
                const productCode = row.getAttribute('data-product-code') || '';
                const discountType = row.getAttribute('data-discount-type') || 'none';
                const discountValue = row.getAttribute('data-discount-value') || '';
                const convertUnit = row.getAttribute('data-convert-unit') || 'none';

                data.tableStructure.push({
                    type: 'item',
                    id: row.getAttribute('data-id'),
                    itemName: itemName,
                    quantity: originalQuantity.toFixed(8),
                    unit: cells[3].textContent,
                    rate: storeWithPrecision(parseFloat(cells[4].textContent)),
                    amount: storeWithPrecision(parseFloat(cells[5].textContent)),
                    notes: notes,
                    dimensionType: dimensionType,
                    dimensionValues: dimensionValues,
                    dimensionUnit: dimensionUnit,
                    dimensionToggles: toggleStates,
                    convertUnit: convertUnit,
                    hsnCode: hsnCode,
                    productCode: productCode,
                    discountType: discountType,
                    discountValue: discountValue,
                    particularsHtml: particularsDiv.innerHTML,
                    displayQuantity: cells[2].textContent,
                    dimensionsVisible: row.getAttribute('data-dimensions-visible') === 'true'
                });
            }
        });

        // 3. Save to DB
        await setInDB('billDataManual', 'currentBill', data);

    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function saveStateToHistory() {
    const historyStack = historyStackManual;
    let historyIndex = historyIndexManual;

    if (historyIndex < historyStack.length - 1) {
        historyStack.splice(historyIndex + 1);
    }

    const state = {
        tableStructure: [],
        company: {
            name: document.getElementById("companyName").textContent,
            address: document.getElementById("companyAddr").textContent,
            phone: document.getElementById("companyPhone").textContent
        },
        customer: {
            name: document.getElementById("custName").value,
            billNo: document.getElementById("billNo").value,
            address: document.getElementById("custAddr").value,
            date: document.getElementById("billDate").value,
            phone: document.getElementById("custPhone").value,
            gstin: document.getElementById("custGSTIN").value
        },
        taxSettings: {
            discountPercent: storeWithPrecision(discountPercent),
            discountAmount: storeWithPrecision(discountAmount),
            gstPercent: storeWithPrecision(gstPercent)
        }
    };

    document.querySelectorAll(`#createListManual tbody tr`).forEach(row => {
        if (row.classList.contains('section-row')) {
            const sectionId = row.getAttribute('data-section-id');
            const cell = row.querySelector('td');
            const collapseBtn = row.querySelector('.collapse-btn');

            let sectionName = '';
            for (let node of cell.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    sectionName = node.textContent.trim();
                    break;
                }
            }

            const completeHTML = cell.innerHTML;

            state.tableStructure.push({
                type: 'section',
                id: sectionId,
                name: sectionName,
                style: cell.getAttribute('style') || '',
                collapsed: collapseBtn ? collapseBtn.textContent === '+' : false,
                html: completeHTML,
                showTotal: row.getAttribute('data-show-total') === 'true' // <--- ADDED THIS FIX
            });
        } else if (row.getAttribute('data-id')) {
            const cells = row.children;
            const particularsDiv = cells[1];
            const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
            const notes = particularsDiv.querySelector('.notes')?.textContent || '';

            const particularsHtml = particularsDiv.innerHTML;

            const dimensionType = row.getAttribute('data-dimension-type') || 'none';
            const dimensionValuesAttr = row.getAttribute('data-dimension-values');
            const dimensionValues = dimensionValuesAttr ? JSON.parse(dimensionValuesAttr) : [0, 0, 0];
            const dimensionUnit = row.getAttribute('data-dimension-unit') || 'ft';

            const toggleStatesAttr = row.getAttribute('data-dimension-toggles');
            let toggleStates;
            try {
                toggleStates = toggleStatesAttr && toggleStatesAttr !== 'undefined' ? JSON.parse(toggleStatesAttr) : { toggle1: true, toggle2: true, toggle3: true };
            } catch (e) {
                toggleStates = { toggle1: true, toggle2: true, toggle3: true };
            }

            const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
            const hsnCode = row.getAttribute('data-hsn') || '';
            const productCode = row.getAttribute('data-product-code') || '';
            const discountType = row.getAttribute('data-discount-type') || 'none';
            const discountValue = row.getAttribute('data-discount-value') || '';

            // --- SAVE CONVERT UNIT ---
            const convertUnit = row.getAttribute('data-convert-unit') || 'none';

            state.tableStructure.push({
                type: 'item',
                id: row.getAttribute('data-id'),
                itemName: itemName,
                quantity: originalQuantity.toFixed(8),
                unit: cells[3].textContent,
                rate: storeWithPrecision(parseFloat(cells[4].textContent)),
                amount: storeWithPrecision(parseFloat(cells[5].textContent)),
                notes: notes,
                dimensionType: dimensionType,
                dimensionValues: dimensionValues,
                dimensionUnit: dimensionUnit,
                dimensionToggles: toggleStates,
                convertUnit: convertUnit, // <--- SAVED HERE
                hsnCode: hsnCode,
                productCode: productCode,
                discountType: discountType,
                discountValue: discountValue,
                particularsHtml: particularsHtml,
                displayQuantity: cells[2].textContent,
                dimensionsVisible: row.getAttribute('data-dimensions-visible') === 'true'
            });
        }
    });

    historyStack.push(JSON.stringify(state));
    historyIndex = historyStack.length - 1;
    historyIndexManual = historyIndex;

    if (historyStack.length > 50) {
        historyStack.shift();
        historyIndexManual--;
    }
}

function undoAction() {
    if (currentView === 'bill') {
        showNotification('Switch to Input mode for Undo/Redo', 'info');
        return;
    }

    if (historyIndexManual > 0) {
        historyIndexManual--;
        restoreStateFromHistory();
    }
}

function redoAction() {
    if (currentView === 'bill') {
        showNotification('Switch to Input mode for Undo/Redo', 'info');
        return;
    }

    if (historyIndexManual < historyStackManual.length - 1) {
        historyIndexManual++;
        restoreStateFromHistory();
    }
}
function restoreStateFromHistory() {
    const state = JSON.parse(historyStackManual[historyIndexManual]);

    document.getElementById("companyName").textContent = state.company?.name || "COMPANY NAME";
    document.getElementById("companyAddr").textContent = state.company?.address || "Address";
    document.getElementById("companyPhone").textContent = state.company?.phone || "+91 01234-56789";
    document.getElementById("companyGstin").textContent = state.company?.gstin || "GSTIN : Your 15-digit GSTIN";

    document.getElementById("custName").value = state.customer?.name || "";
    document.getElementById("billNo").value = state.customer?.billNo || "";
    document.getElementById("custAddr").value = state.customer?.address || "";
    document.getElementById("billDate").value = state.customer?.date || "";
    document.getElementById("custPhone").value = state.customer?.phone || "";
    document.getElementById("custGSTIN").value = state.customer?.gstin || "";

    if (state.taxSettings) {
        discountPercent = state.taxSettings.discountPercent || 0;
        gstPercent = state.taxSettings.gstPercent || 0;
    }

    const createListTbody = document.querySelector("#createListManual tbody");
    const copyListTbody = document.querySelector("#copyListManual tbody");
    createListTbody.innerHTML = "";
    copyListTbody.innerHTML = "";

    let maxId = 0;

    if (state.tableStructure && state.tableStructure.length > 0) {
        state.tableStructure.forEach(rowData => {
            if (rowData.type === 'section') {
                createSectionInAllTablesFromSaved(rowData);
            } else if (rowData.type === 'item') {
                const toggleStates = rowData.dimensionToggles || { toggle1: true, toggle2: true, toggle3: true };

                createItemInAllTablesFromSaved({
                    type: 'item',
                    id: rowData.id,
                    itemName: rowData.itemName,
                    quantity: rowData.quantity,
                    unit: rowData.unit,
                    rate: rowData.rate,
                    amount: rowData.amount,
                    notes: rowData.notes,
                    dimensionType: rowData.dimensionType,
                    dimensionValues: rowData.dimensionValues,
                    dimensionUnit: rowData.dimensionUnit,
                    dimensionToggles: toggleStates,
                    hsnCode: rowData.hsnCode,
                    productCode: rowData.productCode,
                    discountType: rowData.discountType,
                    discountValue: rowData.discountValue,
                    particularsHtml: rowData.particularsHtml,
                    displayQuantity: rowData.displayQuantity,
                    dimensionsVisible: rowData.dimensionsVisible !== false,
                    convertUnit: rowData.convertUnit // <--- CRITICAL FIX
                });

                const idNum = parseInt(rowData.id.split('-')[2]);
                if (idNum > maxId) maxId = idNum;
            }
        });
        rowCounterManual = maxId + 1;
    }

    if (state.tableStructure) {
        state.tableStructure.forEach(rowData => {
            if (rowData.type === 'section' && rowData.collapsed) {
                const sectionRow = document.querySelector(`tr[data-section-id="${rowData.id}"]`);
                if (sectionRow) {
                    const button = sectionRow.querySelector('.collapse-btn');
                    if (button) {
                        button.textContent = '+';
                        let nextRow = sectionRow.nextElementSibling;
                        while (nextRow && !nextRow.classList.contains('section-row')) {
                            nextRow.style.display = 'none';
                            nextRow = nextRow.nextElementSibling;
                        }
                    }
                }
            }
        });
    }

    updateSerialNumbers();
    updateTotal();
    updateGSTINVisibility();
    saveToLocalStorage();

    initializeDragAndDrop();
    formatAllQuantitiesAfterRestore();
    updateColumnVisibility();
}

// Replace the formatAllQuantities function with this one
function formatAllQuantitiesAfterRestore() {
    const tables = ['createListManual', 'copyListManual'];
    if (isGSTMode) {
        tables.push('gstCopyListManual');
    }

    tables.forEach(tableId => {
        const rows = document.querySelectorAll(`#${tableId} tbody tr[data-id]`);

        rows.forEach(row => {
            const quantityCell = row.children[2]; // Qty is at index 2 for regular tables
            let originalQuantity;

            // For GST table, quantity is at index 3
            if (tableId === 'gstCopyListManual') {
                originalQuantity = parseFloat(row.children[3].textContent);
            } else {
                originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || quantityCell.textContent);
            }

            // Format quantity - remove .00 if whole number
            const formattedQuantity = originalQuantity % 1 === 0 ?
                originalQuantity.toString() :
                originalQuantity.toFixed(2);

            // Update the cell
            if (tableId === 'gstCopyListManual') {
                row.children[3].textContent = formattedQuantity;
            } else {
                quantityCell.textContent = formattedQuantity;
            }
        });
    });
}
async function saveToHistory() {
    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        const customerName = document.getElementById("custName").value.trim() || "Unnamed Bill";
        const billNo = document.getElementById("billNo").value.trim() || "No Bill Number";
        const date = document.getElementById("billDate").value.trim() || new Date().toLocaleDateString();

        const createListId = vars.createListId;

        // --- 1. Calculate Total Amount based on Adjustment Chain ---
        let subtotal = 0;
        document.querySelectorAll(`#${createListId} tbody tr[data-id]`).forEach(row => {
            const amount = parseFloat(row.children[5].textContent) || 0;
            subtotal += amount;
        });

        let runningBalance = subtotal;

        // Filter chain based on mode (same logic as calculateAdjustments)
        const activeChain = isGSTMode
            ? adjustmentChain.filter(a => a.id !== 'legacy-gst')
            : adjustmentChain;

        // Apply Adjustments
        if (activeChain && activeChain.length > 0) {
            activeChain.forEach(adj => {
                let adjAmount = 0;
                if (adj.type === 'percent') {
                    adjAmount = (runningBalance * adj.value) / 100;
                } else {
                    adjAmount = adj.value;
                }

                if (adj.operation === 'subtract') {
                    runningBalance -= adjAmount;
                } else {
                    runningBalance += adjAmount;
                }
            });
        }

        // If GST Mode, add tax to final total for display
        if (isGSTMode) {
            const taxableValue = runningBalance;
            let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

            if (typeof transactionType !== 'undefined' && transactionType === 'intrastate') {
                cgstAmount = (taxableValue * (currentGSTPercent / 2)) / 100;
                sgstAmount = (taxableValue * (currentGSTPercent / 2)) / 100;
            } else {
                igstAmount = (taxableValue * currentGSTPercent) / 100;
            }
            runningBalance = Math.round(taxableValue + cgstAmount + sgstAmount + igstAmount);
        }

        // --- 2. Construct Data Object ---
        const currentData = {
            tableStructure: [],
            company: {
                name: document.getElementById("companyName").textContent,
                address: document.getElementById("companyAddr").textContent,
                phone: document.getElementById("companyPhone").textContent
            },
            customer: {
                name: customerName,
                billNo: billNo,
                address: document.getElementById("custAddr").value,
                date: date,
                phone: document.getElementById("custPhone").value,
                gstin: document.getElementById("custGSTIN").value
            },
            // === UPDATE: Save Adjustment Chain ===
            adjustmentChain: adjustmentChain,
            // Keep legacy settings zeroed out to maintain schema
            taxSettings: {
                discountPercent: 0,
                discountAmount: 0,
                gstPercent: 0
            },
            timestamp: Date.now(),
            totalAmount: runningBalance.toFixed(2) // Use calculated total
        };

        // Save complete table structure (Existing Logic)
        document.querySelectorAll(`#${createListId} tbody tr`).forEach(row => {
            if (row.classList.contains('section-row')) {
                const sectionId = row.getAttribute('data-section-id');
                const cell = row.querySelector('td');
                const collapseBtn = row.querySelector('.collapse-btn');

                let sectionName = '';
                for (let node of cell.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        sectionName = node.textContent.trim();
                        break;
                    }
                }

                currentData.tableStructure.push({
                    type: 'section',
                    id: sectionId,
                    name: sectionName,
                    style: cell.getAttribute('style') || '',
                    collapsed: collapseBtn ? collapseBtn.textContent === '+' : false,
                    html: cell.innerHTML, // Use innerHTML to preserve buttons for manual table
                    showTotal: row.getAttribute('data-show-total') === 'true' // <--- ADDED THIS FIX
                });
            } else if (row.getAttribute('data-id')) {
                const cells = row.children;
                const particularsDiv = cells[1];
                const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
                const notes = particularsDiv.querySelector('.notes')?.textContent || '';

                // Note: We don't need to sum totalAmount here anymore as we calculated it above

                const particularsHtml = particularsDiv.innerHTML;
                const dimensionType = row.getAttribute('data-dimension-type') || 'none';
                const dimensionValuesAttr = row.getAttribute('data-dimension-values');
                const dimensionValues = dimensionValuesAttr ? JSON.parse(dimensionValuesAttr) : [0, 0, 0];
                const dimensionUnit = row.getAttribute('data-dimension-unit') || 'ft';

                const toggleStatesAttr = row.getAttribute('data-dimension-toggles');
                let toggleStates;
                try {
                    toggleStates = toggleStatesAttr && toggleStatesAttr !== 'undefined' ? JSON.parse(toggleStatesAttr) : { toggle1: true, toggle2: true, toggle3: true };
                } catch (e) {
                    toggleStates = { toggle1: true, toggle2: true, toggle3: true };
                }

                const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
                const hsnCode = row.getAttribute('data-hsn') || '';
                const productCode = row.getAttribute('data-product-code') || '';
                const discountType = row.getAttribute('data-discount-type') || 'none';
                const discountValue = row.getAttribute('data-discount-value') || '';
                const convertUnit = row.getAttribute('data-convert-unit') || 'none';

                currentData.tableStructure.push({
                    type: 'item',
                    id: row.getAttribute('data-id'),
                    itemName: itemName,
                    quantity: originalQuantity.toFixed(8),
                    unit: cells[3].textContent,
                    rate: cells[4].textContent,
                    amount: cells[5].textContent,
                    notes: notes,
                    dimensionType: dimensionType,
                    dimensionValues: dimensionValues,
                    dimensionUnit: dimensionUnit,
                    dimensionToggles: toggleStates,
                    convertUnit: convertUnit,
                    hsnCode: hsnCode,
                    productCode: productCode,
                    discountType: discountType,
                    discountValue: discountValue,
                    particularsHtml: particularsHtml,
                    displayQuantity: cells[2].textContent,
                    dimensionsVisible: row.getAttribute('data-dimensions-visible') === 'true'
                });
            }
        });

        if (currentData.totalAmount === "0.00" && currentData.tableStructure.length === 0) {
            return;
        }

        let history = await getFromDB(historyStorageKey, 'history') || [];

        if (history.length > 0) {
            const lastItem = history[0];
            // Check adjustments in duplicate detection
            if (JSON.stringify(lastItem.data.tableStructure) === JSON.stringify(currentData.tableStructure) &&
                lastItem.data.customer.name === currentData.customer.name &&
                lastItem.data.customer.billNo === currentData.customer.billNo &&
                JSON.stringify(lastItem.data.adjustmentChain) === JSON.stringify(currentData.adjustmentChain)) {
                return;
            }
        }

        const historyData = {
            id: `bill-${Date.now()}`,
            title: `${customerName} - ${billNo}`,
            date: date,
            data: currentData
        };

        history.unshift(historyData);

        if (history.length > 50) {
            history = history.slice(0, 50);
        }

        await setInDB(historyStorageKey, 'history', history);

        const historySidebar = document.getElementById("history-sidebar");
        if (historySidebar && historySidebar.classList.contains("open")) {
            loadHistoryFromLocalStorage();
        }
    } catch (error) {
        console.error('Error saving to history:', error);
    }
}

async function loadHistoryFromLocalStorage() {
    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        const history = await getFromDB(historyStorageKey, 'history') || [];
        const historyList = document.getElementById("history-list");

        historyList.innerHTML = "";

        if (history.length === 0) {
            historyList.innerHTML = '<div class="history-item">No history available</div>';
            return;
        }

        history.forEach(item => {
            const historyItem = document.createElement("div");
            historyItem.className = "history-item";
            historyItem.innerHTML = `
                <div class="history-item-title">${item.title}</div>
                <div class="history-item-date">${item.date}</div>
                <div class="history-item-total">Total: ₹${item.data.totalAmount || '0.00'}</div>
                <button class="history-item-remove" onclick="removeHistoryItem('${item.id}', event)">×</button>
            `;

            historyItem.addEventListener('click', function (e) {
                if (!e.target.classList.contains('history-item-remove')) {
                    loadFromHistory(item);
                }
            });

            historyList.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Error loading history:', error);
        document.getElementById("history-list").innerHTML = '<div class="history-item">Error loading history</div>';
    }
}

async function removeHistoryItem(id, event) {
    if (event) event.stopPropagation();

    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        let history = await getFromDB(historyStorageKey, 'history') || [];
        history = history.filter(item => item.id !== id);
        await setInDB(historyStorageKey, 'history', history);

        await loadHistoryFromLocalStorage();
    } catch (error) {
        console.error('Error removing history item:', error);
    }
}

async function loadFromHistory(item) {
    if (!item.data) return;

    const data = item.data;

    // Only load data if there's actual content
    if (data.tableStructure && data.tableStructure.length > 0) {
        document.getElementById("companyName").textContent = data.company.name;
        document.getElementById("companyAddr").textContent = data.company.address;
        document.getElementById("companyPhone").textContent = data.company.phone;
        document.getElementById("custName").value = data.customer.name;
        document.getElementById("billNo").value = data.customer.billNo;
        document.getElementById("custAddr").value = data.customer.address;
        document.getElementById("billDate").value = data.customer.date;
        document.getElementById("custPhone").value = data.customer.phone;
        document.getElementById("custGSTIN").value = data.customer.gstin || '';

        // === UPDATE: Load Adjustments (with Migration) ===
        if (data.adjustmentChain) {
            // Load new format
            adjustmentChain = data.adjustmentChain;
        } else if (data.taxSettings) {
            // Migrate Legacy History Items
            adjustmentChain = [];

            if (data.taxSettings.discountPercent > 0) {
                adjustmentChain.push({
                    id: 'legacy-discount', name: 'Discount', type: 'percent',
                    value: data.taxSettings.discountPercent, operation: 'subtract', textColor: '#e74c3c'
                });
            } else if (data.taxSettings.discountAmount > 0) {
                adjustmentChain.push({
                    id: 'legacy-discount', name: 'Discount', type: 'amount',
                    value: data.taxSettings.discountAmount, operation: 'subtract', textColor: '#e74c3c'
                });
            }

            if (data.taxSettings.gstPercent > 0) {
                adjustmentChain.push({
                    id: 'legacy-gst', name: 'GST', type: 'percent',
                    value: data.taxSettings.gstPercent, operation: 'add', textColor: '#27ae60'
                });
            }
        } else {
            adjustmentChain = [];
        }

        const createListTbody = document.querySelector("#createListManual tbody");
        const copyListTbody = document.querySelector("#copyListManual tbody");
        createListTbody.innerHTML = "";
        copyListTbody.innerHTML = "";

        let maxId = 0;

        // Restore table structure
        if (data.tableStructure && data.tableStructure.length > 0) {
            data.tableStructure.forEach(rowData => {
                if (rowData.type === 'section') {
                    createSectionInAllTablesFromSaved(rowData);
                } else if (rowData.type === 'item') {
                    const toggleStates = rowData.dimensionToggles || { toggle1: true, toggle2: true, toggle3: true };

                    createItemInAllTablesFromSaved({
                        type: 'item',
                        id: rowData.id,
                        itemName: rowData.itemName,
                        quantity: rowData.quantity,
                        unit: rowData.unit,
                        rate: rowData.rate,
                        amount: rowData.amount,
                        notes: rowData.notes,
                        dimensionType: rowData.dimensionType,
                        dimensionValues: rowData.dimensionValues,
                        dimensionUnit: rowData.dimensionUnit,
                        dimensionToggles: toggleStates,
                        hsnCode: rowData.hsnCode,
                        productCode: rowData.productCode,
                        discountType: rowData.discountType,
                        discountValue: rowData.discountValue,
                        particularsHtml: rowData.particularsHtml,
                        displayQuantity: rowData.displayQuantity,
                        dimensionsVisible: rowData.dimensionsVisible !== false,
                        convertUnit: rowData.convertUnit
                    });

                    const idNum = parseInt(rowData.id.split('-')[2]);
                    if (idNum > maxId) maxId = idNum;
                }
            });
            rowCounterManual = maxId + 1;
        }

        // Apply collapse states
        if (data.tableStructure) {
            data.tableStructure.forEach(rowData => {
                if (rowData.type === 'section' && rowData.collapsed) {
                    const sectionRow = document.querySelector(`tr[data-section-id="${rowData.id}"]`);
                    if (sectionRow) {
                        const button = sectionRow.querySelector('.collapse-btn');
                        if (button) {
                            button.textContent = '+';
                            let nextRow = sectionRow.nextElementSibling;
                            while (nextRow && !nextRow.classList.contains('section-row')) {
                                nextRow.style.display = 'none';
                                nextRow = nextRow.nextElementSibling;
                            }
                        }
                    }
                }
            });
        }

        updateSerialNumbers();
        // Re-calculate totals based on loaded items and loaded chain
        updateTotal();
        updateGSTINVisibility();
        await saveToLocalStorage();

        // UPDATE LEGACY DIALOG BOXES (Visual only)
        setTimeout(() => {
            const discountTypeSelect = document.getElementById('discount-type-select');
            const discountPercentInput = document.getElementById('discount-percent-input');
            const discountAmountInput = document.getElementById('discount-amount-input');

            // Try to find legacy discount in the chain
            const legacyDisc = adjustmentChain.find(a => a.id === 'legacy-discount');
            if (legacyDisc) {
                discountTypeSelect.value = legacyDisc.type; // percent or amount
                if (legacyDisc.type === 'percent') discountPercentInput.value = legacyDisc.value;
                else discountAmountInput.value = legacyDisc.value;
            } else {
                discountTypeSelect.value = 'none';
            }

            // Try to find legacy GST
            const legacyGST = adjustmentChain.find(a => a.id === 'legacy-gst');
            const gstInput = document.getElementById('gst-input');
            if (legacyGST) gstInput.value = legacyGST.value;
            else gstInput.value = '';

            if (typeof handleDiscountTypeChange === 'function') handleDiscountTypeChange();
        }, 100);

        saveStateToHistory();
        initializeDragAndDrop();
        closeHistoryModal();
        // updateColumnVisibility();
        // FIX: Reset columns to visible on load
        resetColumnVisibility();

        console.log('Bill restored successfully from history');
    } else {
        console.log('No data found in this history item');
        showNotification('No data found in this history item');
    }
}

function openDiscountModal() {
    const modal = document.getElementById('discount-modal');
    const percentInput = document.getElementById('discount-percent-input');
    const amountInput = document.getElementById('discount-amount-input');
    const typeSelect = document.getElementById('discount-type-select');
    const subtotalDisplay = document.getElementById('current-subtotal-display');

    // Get current subtotal
    const currentSubtotal = getCurrentSubtotal();
    subtotalDisplay.textContent = roundToTwoDecimals(currentSubtotal);

    // === FIX 2: Check Adjustment Chain for existing legacy discount ===
    const existingAdj = adjustmentChain.find(a => a.id === 'legacy-discount');

    if (existingAdj) {
        typeSelect.value = existingAdj.type; // 'percent' or 'amount'

        if (existingAdj.type === 'percent') {
            percentInput.value = existingAdj.value;
            amountInput.value = '';
        } else {
            amountInput.value = existingAdj.value;
            percentInput.value = '';
        }
    } else {
        // Reset if no discount exists
        typeSelect.value = 'none';
        percentInput.value = '';
        amountInput.value = '';
    }

    // Update visibility of inputs based on selection
    handleDiscountTypeChange();

    modal.style.display = 'block';
}

function closeDiscountModal() {
    const modal = document.getElementById('discount-modal');
    modal.style.display = 'none';
}

// Precision helper functions
function roundToTwoDecimals(value) {
    if (isNaN(value)) return 0;

    // First round to handle floating-point precision issues
    const rounded = Math.round(value * 100) / 100;

    // If it's very close to a whole number after rounding, return the whole number
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
        return Math.round(rounded);
    }

    return parseFloat(rounded.toFixed(2));
}

function storeWithPrecision(value) {
    if (isNaN(value)) return 0;
    return parseFloat(value.toFixed(8));
}

function calculateWithPrecision(value) {
    if (isNaN(value)) return 0;
    return parseFloat(value.toFixed(8));
}

async function applyDiscountSettings() {
    const type = document.getElementById('discount-type-select').value;

    // 1. Remove any existing legacy discount to avoid duplicates
    adjustmentChain = adjustmentChain.filter(a => a.id !== 'legacy-discount');

    let newDiscount = null;

    // 2. Create new adjustment object based on input
    if (type === 'percent') {
        const percentValue = parseFloat(document.getElementById('discount-percent-input').value) || 0;

        if (percentValue > 100) {
            showNotification('Discount percentage cannot exceed 100%', 'info');
            return;
        }

        if (percentValue > 0) {
            newDiscount = {
                id: 'legacy-discount',
                name: 'Discount',
                type: 'percent',
                value: percentValue,
                operation: 'subtract',
                textColor: '#e74c3c' // Red color
            };
        }
    }
    else if (type === 'amount') {
        const amountValue = parseFloat(document.getElementById('discount-amount-input').value) || 0;
        const currentSubtotal = getCurrentSubtotal(); // Helper function we added earlier

        if (amountValue > currentSubtotal) {
            showNotification('Discount amount cannot exceed subtotal', 'info');
            return;
        }

        if (amountValue > 0) {
            newDiscount = {
                id: 'legacy-discount',
                name: 'Discount',
                type: 'amount',
                value: amountValue,
                operation: 'subtract',
                textColor: '#e74c3c' // Red color
            };
        }
    }

    // 3. Add to Chain (Unshift adds to TOP, usually before Tax)
    if (newDiscount) {
        adjustmentChain.unshift(newDiscount);
    }

    // 4. Save and Update
    await saveToLocalStorage();
    saveStateToHistory();
    updateTotal(); // Triggers new calculation logic
    closeDiscountModal();

    showNotification('Discount applied successfully', 'success');
}

function openGSTModal() {
    const modal = document.getElementById('gst-modal');
    const gstInput = document.getElementById('gst-input');
    const gstinInput = document.getElementById('gstin-input');

    // === FIX 3: Check Adjustment Chain for existing legacy GST ===
    const existingAdj = adjustmentChain.find(a => a.id === 'legacy-gst');

    if (existingAdj) {
        gstInput.value = existingAdj.value;
    } else {
        gstInput.value = ''; // Reset to empty if no GST
    }

    gstinInput.value = document.getElementById('custGSTIN').value || '';

    modal.style.display = 'block';
}

function closeGSTModal() {
    const modal = document.getElementById('gst-modal');
    modal.style.display = 'none';
}

// Add this NEW function to update GSTIN field visibility
function updateGSTINVisibility() {
    const gstLine = document.getElementById('reg-header-gstin-line');
    const gstTD = document.getElementById('custGSINTd');
    const companyGSTINSpan = document.getElementById('companyGstin'); // Ensure this exists

    // Check if GST exists in the new Adjustment Chain
    const hasGST = adjustmentChain.some(a => a.id === 'legacy-gst');

    if (hasGST) {
        // Show elements
        if (gstLine) {
            // Only show header line if there is actually text content
            const hasText = companyGSTINSpan && companyGSTINSpan.textContent.trim() !== '' && companyGSTINSpan.textContent !== 'Your 15-digit GSTIN';
            gstLine.style.display = hasText ? 'block' : 'none';
        }
        if (gstTD) gstTD.style.display = 'table-cell'; // table-cell preserves layout better than block
    } else {
        // Hide elements
        if (gstLine) gstLine.style.display = 'none';
        if (gstTD) gstTD.style.display = 'none';
    }
}

async function applyGSTSettings() {
    const gstInput = document.getElementById('gst-input');
    const gstinInput = document.getElementById('gstin-input');

    const newGST = parseFloat(gstInput.value) || 0;
    const newGSTIN = gstinInput.value.trim();

    if (newGST < 0 || newGST > 100) {
        showNotification('Invalid GST Percentage', 'error');
        return;
    }

    // 1. Update GSTIN field value
    const custGSTINEl = document.getElementById('custGSTIN');
    if (custGSTINEl) custGSTINEl.value = newGSTIN;

    // 2. Update Adjustment Chain
    // Remove existing legacy GST first
    adjustmentChain = adjustmentChain.filter(a => a.id !== 'legacy-gst');

    if (newGST > 0) {
        const newTax = {
            id: 'legacy-gst',
            name: 'GST',
            type: 'percent',
            value: newGST,
            operation: 'add',
            textColor: '#27ae60' // Green color
        };

        adjustmentChain.push(newTax);
    }

    // 3. Save and Update
    updateGSTINVisibility(); // Call the updated visibility logic
    await saveToLocalStorage();
    saveStateToHistory();
    updateTotal();
    closeGSTModal();

    showNotification('GST applied successfully', 'success');
}

async function saveGSTIN() {
    await saveToLocalStorage();
    saveStateToHistory();
}

async function saveTaxSettings() {
    const taxSettings = {
        discountPercent: storeWithPrecision(discountPercent),
        discountAmount: storeWithPrecision(discountAmount),
        gstPercent: storeWithPrecision(gstPercent)
    };
    await setInDB('taxSettings', 'taxSettings', taxSettings);
}

async function loadTaxSettings() {
    try {
        const saved = await getFromDB('taxSettings', 'taxSettings');
        if (saved) {
            discountPercent = saved.discountPercent || 0;
            gstPercent = saved.gstPercent || 0;
        }
    } catch (error) {
        console.error('Error loading tax settings:', error);
    }
}

async function backupData() {
    try {
        const currentBill = await getFromDB('billDataManual', 'currentBill');
        const historyData = await getAllFromDB('billHistoryManual');
        const taxSettings = await getFromDB('taxSettings', 'taxSettings');
        const theme = await getFromDB('theme', 'currentTheme');
        const savedItems = await getAllFromDB('savedItems');
        const savedCustomers = await getAllFromDB('savedCustomers');
        const savedBills = await getAllFromDB('savedBills');

        // GST Data
        const gstCustomers = await getAllFromDB('gstCustomers');
        const gstSavedBills = await getAllFromDB('gstSavedBills');
        const companyInfo = await getFromDB('companyInfo', 'companyInfo');
        const gstMode = await getFromDB('gstMode', 'isGSTMode');

        const backupData = {
            currentBill: currentBill,
            history: historyData,
            taxSettings: taxSettings,
            theme: theme,
            savedItems: savedItems,
            savedCustomers: savedCustomers,
            savedBills: savedBills,
            // GST Data
            gstCustomers: gstCustomers,
            gstSavedBills: gstSavedBills,
            companyInfo: companyInfo,
            gstMode: gstMode,
            timestamp: new Date().toISOString(),
            version: '2.0'
        };

        const dataStr = JSON.stringify(backupData);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bill-app-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Error creating backup:', error);
    }
}

async function restoreData() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const backupData = JSON.parse(event.target.result);

                    if (!backupData.currentBill || !backupData.history) {
                        showNotification('Invalid backup file format');
                        return;
                    }

                    // Clear all existing data before restoring
                    await clearAllData(true);

                    // Restore regular data
                    await setInDB('billDataManual', 'currentBill', backupData.currentBill);

                    for (const historyItem of backupData.history) {
                        await setInDB('billHistoryManual', historyItem.id, historyItem.value);
                    }

                    if (backupData.taxSettings) {
                        await setInDB('taxSettings', 'taxSettings', backupData.taxSettings);
                    }

                    if (backupData.theme) {
                        await setInDB('theme', 'currentTheme', backupData.theme);
                    }

                    if (backupData.savedItems) {
                        for (const item of backupData.savedItems) {
                            await setInDB('savedItems', item.id, item.value);
                        }
                    }

                    if (backupData.savedCustomers) {
                        for (const customer of backupData.savedCustomers) {
                            await setInDB('savedCustomers', customer.id, customer.value);
                        }
                    }

                    if (backupData.savedBills) {
                        for (const bill of backupData.savedBills) {
                            await setInDB('savedBills', bill.id, bill.value);
                        }
                    }

                    // Restore GST Data
                    if (backupData.gstCustomers) {
                        for (const customer of backupData.gstCustomers) {
                            await setInDB('gstCustomers', customer.id, customer.value);
                        }
                    }

                    if (backupData.gstSavedBills) {
                        for (const bill of backupData.gstSavedBills) {
                            await setInDB('gstSavedBills', bill.id, bill.value);
                        }
                    }

                    if (backupData.companyInfo) {
                        await setInDB('companyInfo', 'companyInfo', backupData.companyInfo);
                    }

                    if (backupData.gstMode !== undefined) {
                        await setInDB('gstMode', 'isGSTMode', backupData.gstMode);
                    }


                    // Reload all data
                    await loadFromLocalStorage();
                    await loadHistoryFromLocalStorage();
                    await loadSavedTheme();
                    await loadTaxSettings();
                    // await loadSavedItems();
                    await loadSavedCustomers();

                    // Load GST data
                    await loadCompanyInfo();
                    await loadGSTCustomers();

                    // Update GST mode
                    const gstModeSetting = await getFromDB('gstMode', 'isGSTMode');
                    isGSTMode = gstModeSetting || false;
                    updateUIForGSTMode();

                    saveStateToHistory();

                    showNotification('Data restored successfully!');

                } catch (error) {
                    console.error('Error parsing backup file:', error);
                    showNotification('Error restoring backup file. Please make sure it\'s a valid backup file.');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    } catch (error) {
        console.error('Error restoring data:', error);
        showNotification('Error restoring data. Please try again.');
    }
}
function clearCustomerInputs() {
    // Clear Bill To inputs
    document.getElementById('consignee-name').value = '';
    document.getElementById('consignee-address').value = '';
    document.getElementById('consignee-gst').value = '';
    document.getElementById('consignee-state').value = 'Maharashtra';
    document.getElementById('consignee-code').value = '27';
    document.getElementById('consignee-contact').value = '';

    // Clear Ship To inputs
    document.getElementById('buyer-name').value = '';
    document.getElementById('buyer-address').value = '';
    document.getElementById('buyer-gst').value = '';
    document.getElementById('buyer-state').value = 'Maharashtra';
    document.getElementById('buyer-code').value = '27';
    document.getElementById('buyer-contact').value = '';
    document.getElementById('place-of-supply').value = 'Maharashtra';

    // Clear invoice details
    document.getElementById('invoice-no').value = '';
    document.getElementById('gst-percent-input').value = '18';

    // Also clear the bill view display
    document.getElementById('bill-invoice-no').textContent = '';
    document.getElementById('bill-date-gst').textContent = '';
    document.getElementById('billToName').textContent = '';
    document.getElementById('billToAddr').textContent = '';
    document.getElementById('billToGstin').textContent = 'customer 15-digit GSTIN';
    document.getElementById('billToContact').textContent = 'Not provided';
    document.getElementById('shipTo').style.display = 'none';

    // Save the cleared state
    saveCustomerDialogState();
    saveToLocalStorage();

    showNotification('Customer details cleared successfully!', 'success');
}

async function clearAllData(silent = false) {
    // 1. Save current state to history BEFORE clearing (only if there's actual data)
    const hasItems = document.querySelectorAll('#createListManual tbody tr[data-id]').length > 0;
    const hasSections = document.querySelectorAll('#createListManual tbody tr.section-row').length > 0;
    // Check length of chain instead of individual legacy vars
    const hasTaxSettings = adjustmentChain.length > 0;

    if (hasItems || hasSections || hasTaxSettings) {
        // Only save to history if there's actual content to preserve
        saveStateToHistory();
        await saveToHistory();
    }

    // 2. Clear current workspace inputs
    document.getElementById("custName").value = "";

    // Auto-increment bill number based on saved bills
    try {
        const savedBills = await getAllFromDB('savedBills');
        let maxBillNo = 0;

        savedBills.forEach(bill => {
            if (bill.value.customer?.billNo) {
                const billNo = parseInt(bill.value.customer.billNo);
                if (!isNaN(billNo) && billNo > maxBillNo) {
                    maxBillNo = billNo;
                }
            }
        });

        if (maxBillNo > 0) {
            document.getElementById("billNo").value = (maxBillNo + 1).toString();
        } else {
            document.getElementById("billNo").value = "";
        }
    } catch (error) {
        console.error('Error getting saved bills for bill number:', error);
        document.getElementById("billNo").value = "";
    }

    document.getElementById("custAddr").value = "";
    document.getElementById("custPhone").value = "";
    document.getElementById("custGSTIN").value = "";

    initializeDateInputs();
    // Set current date in dd-mm-yyyy format
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('billDate').value = `${day}-${month}-${year}`;

    // 3. Clear All Tables
    const createListTbody = document.querySelector("#createListManual tbody");
    const copyListTbody = document.querySelector("#copyListManual tbody");
    createListTbody.innerHTML = "";
    copyListTbody.innerHTML = "";

    // Clear GST table if exists
    const gstListTbody = document.querySelector("#gstCopyListManual tbody");
    if (gstListTbody) {
        gstListTbody.innerHTML = "";
    }

    // 4. RESET ADJUSTMENTS & CALCULATIONS (Crucial Fix)
    adjustmentChain = []; // Empty the new chain
    discountPercent = 0;  // Reset legacy vars for safety
    discountAmount = 0;
    gstPercent = 0;

    rowCounterManual = 1;
    currentlyEditingRowIdManual = null;

    currentDimensions = {
        type: 'none',
        unit: 'ft',
        values: [0, 0, 0],
        calculatedArea: 0
    };

    // 5. Reset Customer Dialog State (GST Mode Forms)
    try {
        await removeFromDB('gstMode', 'customerDialogState');
        // Reset the customer type to default
        const custTypeEl = document.getElementById('customer-type');
        if (custTypeEl) {
            custTypeEl.value = 'bill-to';
            handleCustomerTypeChange();
        }

        // CLEAR ALL CUSTOMER DIALOG FORM FIELDS
        const inputsToClear = [
            'consignee-name', 'consignee-address', 'consignee-gst', 'consignee-contact',
            'consignee-state', 'consignee-code',
            'buyer-name', 'buyer-address', 'buyer-gst', 'buyer-contact',
            'buyer-state', 'buyer-code', 'place-of-supply',
            'invoice-no'
        ];

        inputsToClear.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Keep defaults for state/code
                if (id.includes('state') && !id.includes('place')) el.value = 'Maharashtra';
                else if (id.includes('code')) el.value = '27';
                else el.value = '';
            }
        });

        // Set today's date in customer dialog modal
        document.getElementById('invoice-date').value = `${day}-${month}-${year}`;

        // [INSERT THIS BLOCK] ----------------------------------------------------
        // Clear Vendor Inputs (Silent Mode)
        document.getElementById('vendorName').value = '';
        document.getElementById('vendorInvoiceNo').value = '';
        document.getElementById('vendorAddr').value = '';
        document.getElementById('vendorPhone').value = '';
        document.getElementById('vendorGSTIN').value = '';
        document.getElementById('vendorEmail').value = '';
        const vDateSil = document.getElementById('vendorDate');
        if (vDateSil) vDateSil.value = `${day}-${month}-${year}`;

        document.getElementById('vendorFile').value = '';
        const vFileLabelSil = document.getElementById('vendorFileName');
        if (vFileLabelSil) vFileLabelSil.style.display = 'none';
        currentVendorFile = null;

        if (typeof saveVendorState === 'function') saveVendorState();
        // ------------------------------------------------------------------------

        const createListTbody = document.querySelector("#createListManual tbody");

    } catch (error) {
        console.error('Error clearing customer dialog state:', error);
    }

    // 6. Reset GST Mode Display Elements
    if (isGSTMode) {
        // Generate fresh invoice number (highest + 1)
        await generateNextInvoiceNumber();
        document.getElementById('bill-invoice-no').textContent = document.getElementById('invoice-no').value;

        // Reset date display
        document.getElementById('bill-date-gst').textContent = `${day}-${month}-${year}`;

        // Reset Bill To to default placeholders
        document.getElementById('billToName').textContent = ' ';
        document.getElementById('billToAddr').textContent = ' ';
        document.getElementById('billToGstin').textContent = 'customer 15-digit GSTIN';
        document.getElementById('billToState').textContent = 'Maharashtra';
        document.getElementById('billToStateCode').textContent = '27';
        document.getElementById('billToContact').textContent = 'Not provided';

        // Hide and reset Ship To
        document.getElementById('shipTo').style.display = 'none';
        document.getElementById('shipToName').textContent = '';
        document.getElementById('shipToAddr').textContent = '';
        document.getElementById('shipToGstin').textContent = 'customer 15-digit GSTIN';
        document.getElementById('shipToContact').textContent = 'Not provided';
        document.getElementById('shipToState').textContent = 'Maharashtra';
        document.getElementById('shipToStateCode').textContent = '27';
        document.getElementById('shipToPOS').textContent = '';
    }

    // 7. Update UI & Reset Modals
    updateSerialNumbers();
    updateTotal(); // This will now correctly render "Total: 0.00"
    resetEditMode();

    // Reset legacy discount/GST modals just in case
    setTimeout(() => {
        const discountTypeSelect = document.getElementById('discount-type-select');
        const discountPercentInput = document.getElementById('discount-percent-input');
        const discountAmountInput = document.getElementById('discount-amount-input');

        if (discountTypeSelect) discountTypeSelect.value = 'none';
        if (discountPercentInput) discountPercentInput.value = '';
        if (discountAmountInput) discountAmountInput.value = '';

        const gstInput = document.getElementById('gst-input');
        const gstinInput = document.getElementById('gstin-input');

        if (gstInput) gstInput.value = '';
        if (gstinInput) gstinInput.value = '';

        handleDiscountTypeChange();
    }, 100);

    // 8. Persist the Empty State to DB
    await saveTaxSettings();
    await saveToLocalStorage();
    await saveCustomerDialogState();
    await saveGSTCustomerDataToLocalStorage();

    if (!silent) {
        console.log('All data cleared.');
    }
}

function changeTheme(theme) {
    const root = document.documentElement;

    switch (theme) {
        case 'high-contrast':
            root.style.setProperty('--primary-color', '#000000');
            root.style.setProperty('--secondary-color', '#3b3b3bff');
            root.style.setProperty('--text-color', '#000000');
            root.style.setProperty('--bg-color', '#ffffff');
            root.style.setProperty('--border-color', '#d4d4d4ff');
            root.style.setProperty('--highlight-color', '#000000');
            root.style.setProperty('--total-bg', '#cfcfcfff');
            break;
        case 'blue':
            root.style.setProperty('--primary-color', '#3498db');
            root.style.setProperty('--secondary-color', '#2980b9');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#f9f9f9');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#ecf0f1');
            break;
        case 'green':
            root.style.setProperty('--primary-color', '#2ecc71');
            root.style.setProperty('--secondary-color', '#27ae60');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#f9f9f9');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#eafaf1');
            break;
        case 'red':
            root.style.setProperty('--primary-color', '#e74c3c');
            root.style.setProperty('--secondary-color', '#c0392b');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#f9f9f9');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#fdedec');
            break;
        case 'purple':
            root.style.setProperty('--primary-color', '#9b59b6');
            root.style.setProperty('--secondary-color', '#8e44ad');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#f9f9f9');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#f5eef8');
            break;
        case 'orange':
            root.style.setProperty('--primary-color', '#f26d38');
            root.style.setProperty('--secondary-color', '#e67e22');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#f9f9f9');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#fef5e7');
            break;
        case 'dark':
            root.style.setProperty('--primary-color', '#34495e');
            root.style.setProperty('--secondary-color', '#2c3e50');
            root.style.setProperty('--text-color', '#000');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#34495e');
            root.style.setProperty('--highlight-color', '#f1c40f');
            root.style.setProperty('--total-bg', '#e1e1e1');
            break;
        case 'teal':
            root.style.setProperty('--primary-color', '#009688');
            root.style.setProperty('--secondary-color', '#00796b');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff9800');
            root.style.setProperty('--total-bg', '#e0f2f1');
            break;
        case 'indigo':
            root.style.setProperty('--primary-color', '#3f51b5');
            root.style.setProperty('--secondary-color', '#303f9f');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff4081');
            root.style.setProperty('--total-bg', '#e8eaf6');
            break;
        case 'brown':
            root.style.setProperty('--primary-color', '#795548');
            root.style.setProperty('--secondary-color', '#5d4037');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff5722');
            root.style.setProperty('--total-bg', '#efebe9');
            break;
        case 'pink':
            root.style.setProperty('--primary-color', '#e91e63');
            root.style.setProperty('--secondary-color', '#c2185b');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#00bcd4');
            root.style.setProperty('--total-bg', '#fce4ec');
            break;
        case 'cyan':
            root.style.setProperty('--primary-color', '#00bcd4');
            root.style.setProperty('--secondary-color', '#0097a7');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff5722');
            root.style.setProperty('--total-bg', '#e0f7fa');
            break;
        case 'lime':
            root.style.setProperty('--primary-color', '#cddc39');
            root.style.setProperty('--secondary-color', '#afb42b');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff5722');
            root.style.setProperty('--total-bg', '#f9fbe7');
            break;
        case 'deep-purple':
            root.style.setProperty('--primary-color', '#673ab7');
            root.style.setProperty('--secondary-color', '#512da8');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff9800');
            root.style.setProperty('--total-bg', '#ede7f6');
            break;
        case 'amber':
            root.style.setProperty('--primary-color', '#ffc107');
            root.style.setProperty('--secondary-color', '#ffa000');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#e91e63');
            root.style.setProperty('--total-bg', '#fff8e1');
            break;
        case 'deep-orange':
            root.style.setProperty('--primary-color', '#ff5722');
            root.style.setProperty('--secondary-color', '#e64a19');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#2196f3');
            root.style.setProperty('--total-bg', '#fbe9e7');
            break;
        case 'blue-grey':
            root.style.setProperty('--primary-color', '#607d8b');
            root.style.setProperty('--secondary-color', '#455a64');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff9800');
            root.style.setProperty('--total-bg', '#eceff1');
            break;
        case 'navy':
            root.style.setProperty('--primary-color', '#001f3f');
            root.style.setProperty('--secondary-color', '#001a33');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#7fdbff');
            root.style.setProperty('--total-bg', '#e6f2ff');
            break;
        case 'charcoal':
            root.style.setProperty('--primary-color', '#36454f');
            root.style.setProperty('--secondary-color', '#2c3e50');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#e74c3c');
            root.style.setProperty('--total-bg', '#f8f9fa');
            break;
        case 'burgundy':
            root.style.setProperty('--primary-color', '#800020');
            root.style.setProperty('--secondary-color', '#660019');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#d4af37');
            root.style.setProperty('--total-bg', '#f9f0f2');
            break;
        case 'forest':
            root.style.setProperty('--primary-color', '#228b22');
            root.style.setProperty('--secondary-color', '#1c6b1c');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ffd700');
            root.style.setProperty('--total-bg', '#f0f8f0');
            break;
        case 'slate':
            root.style.setProperty('--primary-color', '#708090');
            root.style.setProperty('--secondary-color', '#5a6672');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff6b6b');
            root.style.setProperty('--total-bg', '#f8f9fa');
            break;
        case 'lavender':
            root.style.setProperty('--primary-color', '#b57edc');
            root.style.setProperty('--secondary-color', '#9b59b6');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ffb6c1');
            root.style.setProperty('--total-bg', '#f8f4ff');
            break;
        case 'mint':
            root.style.setProperty('--primary-color', '#98fb98');
            root.style.setProperty('--secondary-color', '#77dd77');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ffb347');
            root.style.setProperty('--total-bg', '#f0fff0');
            break;
        case 'peach':
            root.style.setProperty('--primary-color', '#ffdab9');
            root.style.setProperty('--secondary-color', '#f4a688');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#87ceeb');
            root.style.setProperty('--total-bg', '#fff5ee');
            break;
        case 'sage':
            root.style.setProperty('--primary-color', '#b2ac88');
            root.style.setProperty('--secondary-color', '#9a9578');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#d4a574');
            root.style.setProperty('--total-bg', '#f8f8f0');
            break;
        case 'rose-gold':
            root.style.setProperty('--primary-color', '#e8b4b4');
            root.style.setProperty('--secondary-color', '#d4a5a5');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#c9b037');
            root.style.setProperty('--total-bg', '#fdf0f0');
            break;
        case 'nebula':
            root.style.setProperty('--primary-color', '#4a235a');
            root.style.setProperty('--secondary-color', '#2c125a');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#e74c3c');
            root.style.setProperty('--total-bg', '#f5eef8');
            break;
        case 'cosmic':
            root.style.setProperty('--primary-color', '#1a237e');
            root.style.setProperty('--secondary-color', '#0d1452');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ffab00');
            root.style.setProperty('--total-bg', '#e8eaf6');
            break;
        case 'galaxy':
            root.style.setProperty('--primary-color', '#311b92');
            root.style.setProperty('--secondary-color', '#1a1267');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#00e5ff');
            root.style.setProperty('--total-bg', '#ede7f6');
            break;
        case 'stellar':
            root.style.setProperty('--primary-color', '#01579b');
            root.style.setProperty('--secondary-color', '#002f6c');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ffd600');
            root.style.setProperty('--total-bg', '#e1f5fe');
            break;
        case 'asteroid':
            root.style.setProperty('--primary-color', '#37474f');
            root.style.setProperty('--secondary-color', '#263238');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#ff6e40');
            root.style.setProperty('--total-bg', '#eceff1');
            break;
        case 'rainbow':
            root.style.setProperty('--primary-color', '#ff0000');
            root.style.setProperty('--secondary-color', '#ff7f00');
            root.style.setProperty('--text-color', '#333');
            root.style.setProperty('--bg-color', '#fff');
            root.style.setProperty('--border-color', '#ddd');
            root.style.setProperty('--highlight-color', '#4b0082');
            root.style.setProperty('--total-bg', '#f0f8ff');
            break;
    }
    setInDB('theme', 'theme', theme);
}

async function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    changeTheme(themes[currentThemeIndex]);
}

async function loadSavedTheme() {
    try {
        const savedTheme = await getFromDB('theme', 'theme');
        if (savedTheme !== null && themes.includes(savedTheme)) {
            currentThemeIndex = themes.indexOf(savedTheme);
            changeTheme(savedTheme);
        } else {
            changeTheme(themes[0]);
        }
    } catch (error) {
        console.error('Error loading theme:', error);
        changeTheme(themes[0]);
    }
}
// Dynamic Add Customer Handler
function handleAddCustomer() {
    if (currentCustomerMode === 'gst') {
        openAddGSTCustomerModal();
    } else {
        openAddCustomerModal();
    }
}

function toggleCustomerMode() {
    const toggle = document.getElementById('customer-mode-toggle');
    const addButton = document.getElementById('add-customer-main-btn');

    if (toggle.checked) {
        currentCustomerMode = 'gst';
        addButton.textContent = 'Add New GST Customer';
        // LOAD GST CUSTOMERS LIST
        loadGSTCustomersList();
    } else {
        currentCustomerMode = 'regular';
        addButton.textContent = 'Add New Customer';
        // LOAD REGULAR CUSTOMERS LIST
        loadCustomersList();
    }
}
// Toggle between Regular and GST Bills
function toggleBillsMode() {
    const toggle = document.getElementById('bills-mode-toggle');

    if (toggle.checked) {
        currentBillsMode = 'gst';
        // LOAD GST BILLS LIST
        loadGSTSavedBillsList();
    } else {
        currentBillsMode = 'regular';
        // LOAD REGULAR BILLS LIST
        loadSavedBillsList();
    }
}

//NO LOGNER USED updateColumnVisibility
// NEW FUNCTION: Update column visibility based on current view
function updateColumnVisibility() {
    if (currentView === 'bill') {
        if (isGSTMode) {
            // Hide remove button columns in GST bill view
            hideTableColumn(document.getElementById("gstCopyListManual"), 8, "none");
            hideTableColumn(document.getElementById("gstCopyListManual"), 7, "none");
        } else {
            // Hide remove button columns in regular bill view
            hideTableColumn(document.getElementById("copyListManual"), 7, "none");
            hideTableColumn(document.getElementById("copyListManual"), 6, "none");
        }
    } else {
        // Show columns in input view
        if (isGSTMode) {
            hideTableColumn(document.getElementById("gstCopyListManual"), 8, "table-cell");
            hideTableColumn(document.getElementById("gstCopyListManual"), 7, "table-cell");
        } else {
            hideTableColumn(document.getElementById("copyListManual"), 7, "table-cell");
            hideTableColumn(document.getElementById("copyListManual"), 6, "table-cell");
        }
    }
}

function toggleView() {
    const bill = document.getElementById("bill-container");
    const gstBill = document.getElementById("gst-bill-container");
    const manual = document.getElementById("manual-item-container");
    const viewText = document.getElementById('view-text');
    const viewIcon = document.getElementById('view-icon');
    const regFooterBtn = document.getElementById('reg-footer-btn'); // NEW

    currentView = currentView === 'input' ? 'bill' : 'input';

    if (currentView === 'bill') {
        manual.style.display = "none";
        viewText.textContent = "SHOW INPUT";
        viewIcon.textContent = "edit";

        if (isGSTMode) {
            bill.style.display = "none";
            gstBill.style.display = "block";
            updateGSTBillDisplay();
            hideTableColumn(document.getElementById("gstCopyListManual"), 8, "none");
            hideTableColumn(document.getElementById("gstCopyListManual"), 7, "none");

            if (regFooterBtn) regFooterBtn.style.display = 'none'; // Hide reg footer btn in GST
        } else {
            bill.style.display = "block";
            gstBill.style.display = "none";
            hideTableColumn(document.getElementById("copyListManual"), 7, "none");
            hideTableColumn(document.getElementById("copyListManual"), 6, "none");
            updateTotal();

            if (regFooterBtn) regFooterBtn.style.display = 'inline-block'; // Show reg footer btn
        }
    } else {
        bill.style.display = "none";
        gstBill.style.display = "none";
        manual.style.display = "block";
        viewText.textContent = "SHOW BILL";
        viewIcon.textContent = "description";

        if (regFooterBtn) regFooterBtn.style.display = 'none'; // Hide in input mode

        if (isGSTMode) {
            hideTableColumn(document.getElementById("gstCopyListManual"), 8, "table-cell");
            hideTableColumn(document.getElementById("gstCopyListManual"), 7, "table-cell");
        } else {
            hideTableColumn(document.getElementById("copyListManual"), 7, "table-cell");
            hideTableColumn(document.getElementById("copyListManual"), 6, "table-cell");
        }
    }
    // FIX: Recalculate column widths and total row colspan immediately
    applyColumnVisibility();
    // updateColumnVisibility();
}

// SIMPLE DRAG & DROP - Unified for all rows
let dragSrcEl = null;
let isDragging = false;

function handleDragStart(e) {
    dragSrcEl = this;
    isDragging = true;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';

    // Simple drag image
    const dragImage = this.cloneNode(true);
    dragImage.style.opacity = '0.7';
    dragImage.style.width = this.offsetWidth + 'px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
}

function handleDragOver(e) {
    e.preventDefault();
    if (!dragSrcEl || !isDragging) return;

    const tbody = this.closest('tbody');
    const afterElement = getDragAfterElement(tbody, e.clientY);

    // Remove highlight from all rows
    const allRows = tbody.querySelectorAll('tr');
    allRows.forEach(row => row.classList.remove('drag-over'));

    // Highlight the drop target
    if (afterElement && afterElement !== dragSrcEl) {
        afterElement.classList.add('drag-over');
    }

    return false;
}

function handleDragEnter(e) {
    e.preventDefault();
}

function handleDragLeave(e) {
    if (!this.contains(e.relatedTarget)) {
        this.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();

    if (!dragSrcEl || !isDragging) return;

    const sourceTbody = dragSrcEl.closest('tbody');
    const afterElement = getDragAfterElement(sourceTbody, e.clientY);

    if (dragSrcEl !== this && afterElement !== dragSrcEl) {
        if (afterElement) {
            sourceTbody.insertBefore(dragSrcEl, afterElement);
        } else {
            sourceTbody.appendChild(dragSrcEl);
        }

        // Sync across all tables
        syncAllTables();

        updateSerialNumbers();
        updateTotal();

        // FIX: Recalculate section totals immediately after drop
        // This ensures total rows appear/move correctly when sections/items are reordered
        updateSectionTotals();

        saveToLocalStorage();
        saveStateToHistory();

        if (isGSTMode) {
            updateGSTTaxCalculation();
        }
    }

    cleanupDrag();
    return false;
}

function handleDragEnd(e) {
    cleanupDrag();
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('tr:not(.dragging)')];

    for (const element of draggableElements) {
        const box = element.getBoundingClientRect();
        const middle = box.top + box.height / 2;

        if (y < middle) {
            return element;
        }
    }

    return null;
}

function syncAllTables() {
    const sourceTable = document.getElementById('createListManual');
    if (!sourceTable) return;

    const sourceTbody = sourceTable.querySelector('tbody');
    const sourceRows = Array.from(sourceTbody.querySelectorAll('tr'));

    // Apply same order to other tables
    const tablesToSync = ['copyListManual', 'gstCopyListManual'];
    tablesToSync.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        // Get all rows from this table
        const currentRows = Array.from(tbody.querySelectorAll('tr'));

        // Create a map for quick lookup
        const rowMap = new Map();
        currentRows.forEach(row => {
            const id = row.getAttribute('data-id') || row.getAttribute('data-section-id');
            if (id) rowMap.set(id, row);
        });

        // Clear the table
        tbody.innerHTML = '';

        // Add rows in the same order as source table
        sourceRows.forEach(sourceRow => {
            const id = sourceRow.getAttribute('data-id') || sourceRow.getAttribute('data-section-id');
            const rowToAdd = rowMap.get(id);
            if (rowToAdd) {
                tbody.appendChild(rowToAdd);
            }
        });
    });
}

function addDragAndDropListeners(row) {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', handleDragStart);
    row.addEventListener('dragenter', handleDragEnter);
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
    row.addEventListener('dragend', handleDragEnd);
}

function cleanupDrag() {
    if (dragSrcEl) {
        dragSrcEl.classList.remove('dragging');
    }

    // Remove all highlights
    const allTables = ['createListManual', 'copyListManual', 'gstCopyListManual'];
    allTables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (table) {
            const tbody = table.querySelector('tbody');
            if (tbody) {
                const allRows = tbody.querySelectorAll('tr');
                allRows.forEach(row => row.classList.remove('drag-over', 'dragging'));
            }
        }
    });

    dragSrcEl = null;
    isDragging = false;
}

function initializeDragAndDrop() {
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];
    tables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (table && table.querySelector('tbody')) {
            const rows = table.querySelector('tbody').querySelectorAll('tr');
            rows.forEach(row => {
                addDragAndDropListeners(row);
            });
        }
    });
}

async function downloadPDF() {
    // 1. Save data
    await saveToLocalStorage();

    // 2. Auto-Switch to Bill View if currently in Input View
    let wasInputView = false;
    if (currentView === 'input') {
        toggleView();
        wasInputView = true;
    }

    // 3. Select the correct container
    let element;
    const filename = `bill-${document.getElementById("billNo").value || 'document'}.pdf`;

    if (isGSTMode) {
        element = document.getElementById("gst-bill-container");
        if (currentView === 'input') {
            // This part handles GST table columns if needed, though toggleView usually handles it
            hideTableColumn(document.getElementById("gstCopyListManual"), 8, "none");
            hideTableColumn(document.getElementById("gstCopyListManual"), 7, "none");
        }
    } else {
        element = document.getElementById("bill-container");

        // UPDATED: Only show Footer if the user has toggled it ON
        const regFooter = document.getElementById('regular-bill-footer');
        if (regFooter) {
            if (isRegularFooterVisible) {
                regFooter.style.display = 'table';
                updateRegularFooterInfo(); // Ensure signatures are up to date
            } else {
                regFooter.style.display = 'none';
            }
        }
    }

    // 4. Configure Options
    const opt = {
        margin: [5, 5, 5, 5],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 5,
            dpi: 400,
            useCORS: true,
            logging: false,
            letterRendering: true,
            scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },

        // Keep rows intact
        pagebreak: {
            mode: ['css', 'legacy'],
            avoid: ['tr', '.section-row', '.section-total-row', '.bill-footer']
        }
    };

    // 5. Generate PDF
    element.classList.add('pdf-mode');

    html2pdf().set(opt).from(element).save().then(() => {
        // Cleanup CSS class
        element.classList.remove('pdf-mode');

        // Restore Regular Footer Visibility (matches UI state)
        if (!isGSTMode) {
            const regFooter = document.getElementById('regular-bill-footer');
            if (regFooter) {
                regFooter.style.display = isRegularFooterVisible ? 'table' : 'none';
            }
        }

        // 6. Switch back to Input View if we auto-switched
        if (wasInputView) {
            toggleView();
        }
    });
}

// Print functionality (keep this as is)
function handlePrint() {
    // Save current view state
    const previousView = currentView;

    // Switch to bill view based on current mode
    if (currentView !== 'bill') {
        toggleView(); // This will switch to bill view
    }

    // Wait for UI to update, then trigger print
    setTimeout(() => {
        window.print();

        // Optional: Return to previous view after print dialog closes
        setTimeout(() => {
            if (previousView !== 'bill') {
                toggleView(); // Return to previous view
            }
        }, 1000);
    }, 500);
}


// --- SHARE FUNCTIONALITY ---

function openShareModal() {
    // Close sidebar if open
    const sidebar = document.getElementById("settings-sidebar");
    if (sidebar) sidebar.classList.remove("open");

    document.getElementById('share-modal').style.display = 'block';
}

function closeShareModal() {
    document.getElementById('share-modal').style.display = 'none';
}

// 1. WhatsApp "Say Hi" Logic
function handleSayHi() {
    let phone = '';

    if (isGSTMode) {
        phone = document.getElementById('billToContact').textContent;

        if (!phone || phone.trim() === 'Not provided' || phone.trim() === '') {
            phone = document.getElementById('consignee-contact').value;
        }
    } else {
        phone = document.getElementById('custPhone').value;
    }

    // Clean: remove spaces, dashes, brackets
    phone = (phone || '').replace(/[\s\-()]/g, '');

    // If it starts with + -> keep as is
    if (phone.startsWith('+')) {
        // already correct international format
    }
    // If it starts with '00' -> convert to '+'
    else if (phone.startsWith('00')) {
        phone = '+' + phone.substring(2);
    }
    // If it starts with '91' AND length > 10 -> assume missing '+'
    else if (phone.startsWith('91') && phone.length > 10) {
        phone = '+' + phone;
    }
    // Else -> assume India default
    else {
        // Remove all non-digits again
        phone = phone.replace(/\D/g, '');
        // Must be at least 10 digits
        if (phone.length < 10) {
            showNotification("No valid phone number found!", "error");
            return;
        }
        phone = '+91' + phone;
    }

    // Validate length (minimum international length)
    const numeric = phone.replace(/\D/g, '');
    if (numeric.length < 10) {
        showNotification("No valid phone number found!", "error");
        return;
    }

    // Final WhatsApp Message
    const msg = encodeURIComponent("Hi");
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
}


// 2. Native Share PDF Logic
async function handleSharePDF() {
    // Check if Web Share API is supported for files
    if (!navigator.share || !navigator.canShare) {
        showNotification("Sharing is not supported on this device/browser.", "error");
        return;
    }

    showNotification("Generating PDF...", "info");

    // --- Prepare Container (Similar to downloadPDF logic) ---
    // Auto-Switch to Bill View if needed
    let wasInputView = false;
    if (currentView === 'input') {
        toggleView();
        wasInputView = true;
    }

    let element;
    // Determine filename
    let billNoVal = isGSTMode ? document.getElementById("bill-invoice-no").textContent : document.getElementById("billNo").value;
    const filename = `bill-${billNoVal || 'document'}.pdf`;

    if (isGSTMode) {
        element = document.getElementById("gst-bill-container");
    } else {
        element = document.getElementById("bill-container");
        // Handle Footer Visibility
        const regFooter = document.getElementById('regular-bill-footer');
        if (regFooter) {
            regFooter.style.display = isRegularFooterVisible ? 'table' : 'none';
            if (isRegularFooterVisible) updateRegularFooterInfo();
        }
    }

    // --- Generate PDF Blob ---
    const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, dpi: 400, useCORS: true, letterRendering: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.section-row', '.section-total-row', '.bill-footer'] }
    };

    try {
        element.classList.add('pdf-mode');

        // Generate Blob using html2pdf
        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');

        element.classList.remove('pdf-mode');

        // Restore View if needed
        if (wasInputView) toggleView();

        // Create File object
        const file = new File([pdfBlob], filename, { type: "application/pdf" });

        // Invoke Native Share
        if (navigator.canShare({ files: [file] })) {
            await navigator.share({
                title: 'Bill PDF',
                text: `Here is the bill: ${filename}`,
                files: [file]
            });
            closeShareModal();
        } else {
            showNotification("Your device does not support file sharing.", "error");
        }

    } catch (error) {
        console.error("Sharing failed:", error);
        element.classList.remove('pdf-mode');
        showNotification("Error generating or sharing PDF", "error");
    }
}

function hideTableColumn(table, colIndex, displayStyle) {
    if (!table) return;
    const rows = table.getElementsByTagName('tr');
    for (let i = 0; i < rows.length; i++) {
        const cols = rows[i].cells;
        if (cols.length > colIndex) {
            cols[colIndex].style.display = displayStyle;
        }
    }
}

//  REMOVE : function toggleRateColumn()

// function toggleRateColumn() {
//     if (currentView === 'bill') {
//         showNotification('Switch to Input mode to toggle rate column', 'info');
//         return;
//     }

//     const tables = [
//         document.getElementById("createListManual"),
//         document.getElementById("copyListManual")
//     ];

//     rateColumnHidden = !rateColumnHidden;
//     const displayStyle = rateColumnHidden ? "none" : "table-cell";

//     tables.forEach(table => {
//         if (table) {
//             hideTableColumn(table, 4, displayStyle);
//         }
//     });

//     // Also update GST table if in GST mode (shouldn't happen, but just in case)
//     if (isGSTMode) {
//         const gstTable = document.getElementById("gstCopyListManual");
//         if (gstTable) {
//             hideTableColumn(gstTable, 5, "table-cell"); // Always show in GST mode
//         }
//     }

//     const buttonIcon = document.querySelector('#tools button:nth-child(6) .material-icons');
//     if (buttonIcon) {
//         buttonIcon.textContent = rateColumnHidden ? "visibility" : "visibility_off";
//     }
// }

function autoSave() {
    saveToLocalStorage();
    saveToHistory();
    saveStateToHistory();
}

window.onclick = function (event) {
    const discountModal = document.getElementById('discount-modal');
    const gstModal = document.getElementById('gst-modal');
    const manageItemsModal = document.getElementById('manage-items-modal');
    const addItemModal = document.getElementById('add-item-modal');
    const manageCustomersModal = document.getElementById('manage-customers-modal');
    const addCustomerModal = document.getElementById('add-customer-modal');
    const savedBillsModal = document.getElementById('saved-bills-modal');
    const restoredBillsModal = document.getElementById('restored-bills-modal'); // ADD THIS
    const historyModal = document.getElementById('history-modal');
    const clearHistoryModal = document.getElementById('clear-history-modal');
    const batchInvoiceModal = document.getElementById('batch-invoice-modal');
    const billHeadingModal = document.getElementById('bill-heading-modal');

    // ADD THIS LINE: Get section modal
    const sectionModal = document.getElementById('section-modal');

    if (event.target == discountModal) {
        closeDiscountModal();
    }
    if (event.target == batchInvoiceModal) {
        closeBatchInvoiceModal();
    }
    if (event.target == gstModal) {
        closeGSTModal();
    }
    if (event.target == manageItemsModal) {
        closeManageItemsModal();
    }
    if (event.target == addItemModal) {
        // closeAddItemModal();
    }
    if (event.target == manageCustomersModal) {
        closeManageCustomersModal();
    }
    if (event.target == addCustomerModal) {
        closeAddCustomerModal();
    }
    if (event.target == savedBillsModal) {
        closeSavedBillsModal();
    }
    if (event.target == historyModal) {
        closeHistoryModal();
    }
    if (event.target == clearHistoryModal) {
        closeClearHistoryModal();
    }

    // ADD THIS: Handle section modal click
    if (event.target == sectionModal) {
        closeSectionModal();
    }

    // ADD THIS: Handle restored bills modal click
    if (event.target == restoredBillsModal) {
        closeRestoredBillsModal();
    }
    const addStockModal = document.getElementById('add-stock-modal');
    if (event.target == addStockModal) {
        closeAddStockModal();
    }
    if (event.target == billHeadingModal) {
        closeBillHeadingModal();
    }
    const brandingModal = document.getElementById('branding-modal');
    if (event.target == brandingModal) {
        closeBrandingModal();
    }
}

// History Modal Functions
function openHistoryModal() {
    document.getElementById('history-modal').style.display = 'block';
    loadHistoryFromLocalStorage();
    toggleSettingsSidebar(); // Close settings sidebar if open
}

function closeHistoryModal() {
    document.getElementById('history-modal').style.display = 'none';
}

function openClearHistoryConfirmation() {
    document.getElementById('clear-history-modal').style.display = 'block';
}

function closeClearHistoryModal() {
    document.getElementById('clear-history-modal').style.display = 'none';
}

async function clearAllHistory() {
    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        await setInDB(historyStorageKey, 'history', []);
        await loadHistoryFromLocalStorage();
        closeClearHistoryModal();
        closeHistoryModal();
    } catch (error) {
        console.error('Error clearing history:', error);
    }
}

function searchHistory() {
    const searchTerm = document.getElementById('history-search').value.toLowerCase();
    const historyItems = document.querySelectorAll('.history-item');

    historyItems.forEach(item => {
        const title = item.querySelector('.history-item-title').textContent.toLowerCase();
        const date = item.querySelector('.history-item-date').textContent.toLowerCase();

        if (title.includes(searchTerm) || date.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Update the loadHistoryFromLocalStorage function to work with modal
async function loadHistoryFromLocalStorage() {
    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        const history = await getFromDB(historyStorageKey, 'history') || [];
        const historyList = document.getElementById("history-list");

        historyList.innerHTML = "";

        if (history.length === 0) {
            historyList.innerHTML = '<div class="history-item">No history available</div>';
            return;
        }

        history.forEach(item => {
            const historyItem = document.createElement("div");
            historyItem.className = "history-item";
            historyItem.innerHTML = `
                <div class="history-item-title">${item.title}</div>
                <div class="history-item-date">${item.date}</div>
                <div class="history-item-total">Total: ₹${item.data.totalAmount || '0.00'}</div>
                <button class="history-item-remove" onclick="removeHistoryItem('${item.id}', event)">×</button>
            `;

            historyItem.addEventListener('click', function (e) {
                if (!e.target.classList.contains('history-item-remove')) {
                    loadFromHistory(item);
                    closeHistoryModal();
                }
            });

            historyList.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Error loading history:', error);
        document.getElementById("history-list").innerHTML = '<div class="history-item">Error loading history</div>';
    }
}

// Update the removeHistoryItem function
async function removeHistoryItem(id, event) {
    if (event) event.stopPropagation();

    try {
        const vars = getModeSpecificVars();
        const historyStorageKey = vars.historyStorageKey;

        let history = await getFromDB(historyStorageKey, 'history') || [];
        history = history.filter(item => item.id !== id);
        await setInDB(historyStorageKey, 'history', history);

        await loadHistoryFromLocalStorage();
    } catch (error) {
        console.error('Error removing history item:', error);
    }
}

function openGSTModeModal() {
    toggleSettingsSidebar();
    const modal = document.getElementById('gst-mode-modal');
    const enableGSTCheckbox = document.getElementById('enable-gst-mode');

    // Set checkbox to current GST mode state
    enableGSTCheckbox.checked = isGSTMode;

    // Update modal text based on current state
    const modalTitle = modal.querySelector('h3');
    const modalText = modal.querySelector('.modal-body p');

    if (isGSTMode) {
        modalTitle.textContent = 'Switch to Regular Mode';
        modalText.textContent = 'Switch to regular mode for simple billing without GST calculations?';
    } else {
        modalTitle.textContent = 'Switch to GST Mode';
        modalText.textContent = 'Switch to GST mode for GST-compliant invoicing with tax calculations?';
    }

    modal.style.display = 'block';
}

function closeGSTModeModal() {
    document.getElementById('gst-mode-modal').style.display = 'none';
}

async function toggleGSTMode() {
    const enableGST = document.getElementById('enable-gst-mode').checked;

    if (enableGST !== isGSTMode) {
        isGSTMode = enableGST;
        await setInDB('gstMode', 'isGSTMode', isGSTMode);

        // FIX: Reset all columns to visible when switching TO GST Mode
        if (isGSTMode) {
            const columnIds = ['colSrNo', 'colQty', 'colUnit', 'colRate', 'colAmt', 'colTotal'];
            columnIds.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) checkbox.checked = true;
            });
            // Apply these changes immediately
            applyColumnVisibility();
        }

        updateUIForGSTMode();
        closeGSTModeModal();

        // Force Recalculate Totals & Adjustments after Mode Switch
        setTimeout(() => {
            updateTotal();
            updateGSTINVisibility();
        }, 100);

        if (isGSTMode) {
            console.log('GST Mode Enabled. Please set up your company information and customer details.');
        } else {
            console.log('Switched to Regular Mode.');
        }
    }
}

function openTaxAdjustmentModal() {
    if (!isGSTMode) return;

    const modal = document.getElementById('tax-adjustment-modal');
    const customerGST = document.getElementById('current-customer-gst');
    const itemCount = document.getElementById('current-item-count');

    // Get current customer GST from customer details
    const currentCustomerGST = currentGSTPercent || 18;
    customerGST.textContent = currentCustomerGST;

    // Count current items
    const items = document.querySelectorAll('#createListManual tbody tr[data-id]');
    itemCount.textContent = items.length;

    // Set current adjust tax value
    document.getElementById('adjust-tax-percent').value = currentAdjustTaxPercent;

    modal.style.display = 'block';
}

function closeTaxAdjustmentModal() {
    document.getElementById('tax-adjustment-modal').style.display = 'none';
}

function applyTaxAdjustment() {
    if (!isGSTMode) return;

    const adjustTaxInput = document.getElementById('adjust-tax-percent');
    const adjustTaxPercent = parseFloat(adjustTaxInput.value) || 0;

    if (adjustTaxPercent < 0 || adjustTaxPercent > 100) {
        showNotification('Please enter a valid tax percentage between 0 and 100');
        return;
    }

    const customerGSTPercent = currentGSTPercent || 18;

    if (customerGSTPercent === 0) {
        showNotification('Customer GST percentage is 0%. Please set customer GST first.');
        return;
    }

    // Apply tax adjustment to all items
    applyTaxAdjustmentToItems(adjustTaxPercent, customerGSTPercent);

    currentAdjustTaxPercent = adjustTaxPercent;
    closeTaxAdjustmentModal();
}

function applyTaxAdjustmentToItems(adjustTaxPercent, customerGSTPercent) {
    const items = document.querySelectorAll('#createListManual tbody tr[data-id]');

    if (items.length === 0) {
        showNotification('No items found to adjust');
        return;
    }

    // Handle 0% adjustment - reset to original rates (no adjustment)
    if (adjustTaxPercent === 0) {
        // Reset all rates to their original values in ALL tables
        const allTables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

        allTables.forEach(tableId => {
            const tableItems = document.querySelectorAll(`#${tableId} tbody tr[data-id]`);
            tableItems.forEach(row => {
                const cells = row.children;
                if (cells.length < 6) return;

                const rateCell = cells[4];
                const amountCell = cells[5];

                // Get the original rate from data attribute or recalculate
                const originalRate = parseFloat(row.getAttribute('data-original-rate')) || parseFloat(rateCell.textContent);
                const quantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);

                if (!isNaN(originalRate) && originalRate > 0) {
                    // Reset to original rate
                    rateCell.textContent = originalRate.toFixed(2);

                    // Recalculate amount based on dimension type
                    const dimensionType = row.getAttribute('data-dimension-type') || 'none';
                    let finalQuantity = quantity;

                    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
                        const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
                        const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
                        finalQuantity = quantity * calculatedArea;
                    } else if (dimensionType === 'dozen') {
                        finalQuantity = quantity / 12;
                    }

                    const newAmount = finalQuantity * originalRate;
                    amountCell.textContent = newAmount.toFixed(2);

                    // Update data attributes
                    row.setAttribute('data-rate', originalRate.toFixed(8));
                    row.setAttribute('data-amount', newAmount.toFixed(8));
                }
            });
        });
    } else {
        // Calculate adjustment factor for non-zero adjustment
        const adjustmentFactor = (1 + adjustTaxPercent / 100) / (1 + customerGSTPercent / 100);

        // Apply adjustment to ALL tables
        const allTables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

        allTables.forEach(tableId => {
            const tableItems = document.querySelectorAll(`#${tableId} tbody tr[data-id]`);
            tableItems.forEach(row => {
                const cells = row.children;
                if (cells.length < 6) return;

                const rateCell = cells[4];
                const amountCell = cells[5];

                // Get current rate and quantity
                const currentRate = parseFloat(rateCell.textContent);
                const quantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);

                if (!isNaN(currentRate) && currentRate > 0) {
                    // Store original rate before adjustment (for reset functionality)
                    if (!row.getAttribute('data-original-rate')) {
                        row.setAttribute('data-original-rate', currentRate.toFixed(8));
                    }

                    // Calculate adjusted rate
                    const adjustedRate = currentRate * adjustmentFactor;

                    // Update rate
                    rateCell.textContent = adjustedRate.toFixed(2);

                    // Recalculate amount based on dimension type
                    const dimensionType = row.getAttribute('data-dimension-type') || 'none';
                    let finalQuantity = quantity;

                    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
                        const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
                        const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
                        finalQuantity = quantity * calculatedArea;
                    } else if (dimensionType === 'dozen') {
                        finalQuantity = quantity / 12;
                    }

                    const newAmount = finalQuantity * adjustedRate;
                    amountCell.textContent = newAmount.toFixed(2);

                    // Update data attributes
                    row.setAttribute('data-rate', adjustedRate.toFixed(8));
                    row.setAttribute('data-amount', newAmount.toFixed(8));
                }
            });
        });
    }

    // Update serial numbers and totals
    updateSerialNumbers();

    // Update calculations without triggering UI errors
    if (isGSTMode) {
        const gstBillContainer = document.getElementById('gst-bill-container');
        if (gstBillContainer && gstBillContainer.style.display !== 'none') {
            updateGSTTaxCalculation();
        }
    } else {
        const billContainer = document.getElementById('bill-container');
        if (billContainer && billContainer.style.display !== 'none') {
            updateTotal();
        }
    }

    // Always update the input table total (it's always visible)
    const totalAmountId = getModeSpecificVars().totalAmountId;
    const total = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]'))
        .reduce((sum, row) => {
            const amountCell = row.querySelector('.amount');
            if (amountCell) {
                const amountValue = parseFloat(amountCell.textContent) || 0;
                return sum + amountValue;
            }
            return sum;
        }, 0);
    document.getElementById(totalAmountId).textContent = total.toFixed(2);

    saveToLocalStorage();
    saveStateToHistory();

    if (adjustTaxPercent === 0) {
        showNotification('Tax adjustment removed! Rates reset to original values.');
    } else {
        showNotification(`Tax rates adjusted successfully! Effective tax: ${adjustTaxPercent}%, Displayed GST: ${customerGSTPercent}%`);
    }
}

function toggleGSTInclusive() {
    if (!isGSTMode) return;

    isGSTInclusive = !isGSTInclusive;
    const button = document.getElementById('gstInclusiveBtn');
    if (button) {
        button.textContent = isGSTInclusive ? 'Inclusive' : 'Exclusive';
        button.style.backgroundColor = isGSTInclusive ? '#27ae60' : '';
    }
}


function updateUIForGSTMode() {
    document.body.classList.toggle('gst-mode', isGSTMode);

    const gstInclusiveBtn = document.getElementById('gstInclusiveBtn');
    if (gstInclusiveBtn) {
        gstInclusiveBtn.style.display = isGSTMode ? 'inline-block' : 'none';
    }

    const gstModeBtn = document.querySelector('.gst-mode-btn');
    const companyInfoBtn = document.querySelector('.company-info-btn');
    const customerDetailsBtn = document.querySelector('.customer-details-btn');
    const gstCustomersBtn = document.querySelector('.gst-customers-btn');
    const gstBillsBtn = document.querySelector('.gst-bills-btn');
    const taxAdjustmentBtn = document.querySelector('.tax-adjustment-btn');

    // NEW: Handle "Regular Bill Details" Sidebar Button Visibility
    // ------------------------------------------------------------
    const btnRegularDetails = document.getElementById('btn-regular-details');
    if (btnRegularDetails) {
        btnRegularDetails.style.display = isGSTMode ? 'none' : 'flex';
    }
    // ------------------------------------------------------------

    // Toggle Footer Button logic
    const regFooterBtn = document.getElementById('reg-footer-btn');

    if (gstModeBtn) {
        gstModeBtn.style.display = 'flex';
        const icon = gstModeBtn.querySelector('.material-icons');
        const text = gstModeBtn.querySelector('span:not(.material-icons)') || document.createElement('span');
        if (isGSTMode) {
            icon.textContent = 'receipt';
            text.textContent = 'REGULAR MODE';
        } else {
            icon.textContent = 'receipt_long';
            text.textContent = 'GST MODE';
        }
        if (!gstModeBtn.contains(text)) gstModeBtn.appendChild(text);
    }

    // UPDATED: Company Info is now ALWAYS visible
    if (companyInfoBtn) companyInfoBtn.style.display = 'flex';

    // GST-only buttons
    if (customerDetailsBtn) customerDetailsBtn.style.display = isGSTMode ? 'flex' : 'none';
    if (gstCustomersBtn) gstCustomersBtn.style.display = isGSTMode ? 'flex' : 'none';
    if (gstBillsBtn) gstBillsBtn.style.display = isGSTMode ? 'flex' : 'none';
    if (taxAdjustmentBtn) taxAdjustmentBtn.style.display = isGSTMode ? 'flex' : 'none';

    const gstToolBtn = document.getElementById('gst-tool-btn');
    if (gstToolBtn) gstToolBtn.style.display = isGSTMode ? 'none' : 'inline-block';

    // Handle Regular Footer Button Visibility
    if (regFooterBtn) {
        // Only show in Regular Mode AND Bill View
        regFooterBtn.style.display = (!isGSTMode && currentView === 'bill') ? 'inline-block' : 'none';
    }

    const rateToggleBtn = document.getElementById('rate-toggle-btn'); 

    if (rateToggleBtn) {
        rateToggleBtn.style.display = isGSTMode ? 'none' : 'inline-block';
        if (isGSTMode) {
            hideTableColumn(document.getElementById("createListManual"), 4, "table-cell");
            hideTableColumn(document.getElementById("copyListManual"), 4, "table-cell");
            hideTableColumn(document.getElementById("gstCopyListManual"), 5, "table-cell");
            rateColumnHidden = false;
        } else {
            const displayStyle = rateColumnHidden ? "none" : "table-cell";
            hideTableColumn(document.getElementById("createListManual"), 4, displayStyle);
            hideTableColumn(document.getElementById("copyListManual"), 4, displayStyle);
        }
    }

    const billContainer = document.getElementById('bill-container');
    const gstBillContainer = document.getElementById('gst-bill-container');
    const manualContainer = document.getElementById('manual-item-container');

    if (currentView === 'bill') {
        if (isGSTMode) {
            billContainer.style.display = 'none';
            gstBillContainer.style.display = 'block';
            manualContainer.style.display = 'none';
            updateGSTBillDisplay();
        } else {
            billContainer.style.display = 'block';
            gstBillContainer.style.display = 'none';
            manualContainer.style.display = 'none';
            // Trigger footer update
            updateRegularFooterInfo();
        }
    } else {
        billContainer.style.display = 'none';
        gstBillContainer.style.display = 'none';
        manualContainer.style.display = 'block';
    }

    const hsnInputContainer = document.getElementById('hsn-input-container');
    if (hsnInputContainer) hsnInputContainer.style.display = isGSTMode ? 'flex' : 'none';

    const addTermsBtn = document.getElementById('addTermsListSectionBtn');
    if (addTermsBtn) addTermsBtn.style.display = isGSTMode ? 'none' : 'flex';
}


function openCompanyInfoModal() {
    toggleSettingsSidebar()
    document.getElementById('company-info-modal').style.display = 'block';
    loadCompanyInfo();
}

function closeCompanyInfoModal() {
    document.getElementById('company-info-modal').style.display = 'none';
}

async function loadCompanyInfo() {
    try {
        const info = await getFromDB('companyInfo', 'companyInfo');
        if (info) {
            companyInfo = info;

            // 1. Populate Modal Inputs
            document.getElementById('company-name').value = info.name || '';
            document.getElementById('company-address').value = info.address || '';
            document.getElementById('company-gst').value = info.gstin || '';
            document.getElementById('company-mobile').value = info.mobile || '';
            document.getElementById('company-email').value = info.email || '';
            document.getElementById('company-state').value = info.state || 'Maharashtra';
            document.getElementById('company-code').value = info.stateCode || '27';
            document.getElementById('account-number').value = info.accountNumber || '';
            document.getElementById('ifsc-code').value = info.ifscCode || '';
            document.getElementById('branch').value = info.branch || '';
            document.getElementById('bank-name').value = info.bankName || '';
            document.getElementById('account-holder').value = info.accountHolder || '';

            updateGSTBillCompanyInfo();
            updateRegularFooterInfo();

            // 2. Update Regular Bill Header & Hide Empty Fields
            const regName = document.getElementById('companyName');
            const regAddr = document.getElementById('companyAddr');
            const regGstin = document.getElementById('companyGstin');
            const regPhone = document.getElementById('companyPhone');
            const regEmail = document.getElementById('companyEmail');

            const regGstinLine = document.getElementById('reg-header-gstin-line');
            const regPhoneLine = document.getElementById('reg-header-phone-line');
            const regEmailLine = document.getElementById('reg-header-email-line');

            // Name
            if (regName) regName.textContent = info.name || 'COMPANY NAME';

            // Address - Hide if empty
            if (regAddr) {
                regAddr.textContent = info.address || '';
                regAddr.style.display = (info.address && info.address.trim().length > 0) ? 'block' : 'none';
            }

            // GSTIN - Set text (Visibility handled by updateGSTINVisibility below)
            if (regGstin) regGstin.textContent = info.gstin || '';

            // Contact No - Hide if empty
            if (regPhone && regPhoneLine) {
                regPhone.textContent = info.mobile || '';
                const hasPhone = info.mobile && info.mobile.trim().length > 0;
                regPhoneLine.style.display = hasPhone ? 'block' : 'none';
            }

            // Email - Hide if empty
            if (regEmail && regEmailLine) {
                regEmail.textContent = info.email || '';
                const hasEmail = info.email && info.email.trim().length > 0;
                regEmailLine.style.display = hasEmail ? 'block' : 'none';
            }

            if (typeof updateBrandingUI === 'function') {
                updateBrandingUI();
            }

            // Force check visibility based on current Tax Settings AND content length
            updateGSTINVisibility();
        }
    } catch (error) {
        console.error('Error loading company info:', error);
    }
}

async function saveCompanyInfo() {
    const companyData = {
        name: document.getElementById('company-name').value,
        address: document.getElementById('company-address').value,
        gstin: document.getElementById('company-gst').value,
        mobile: document.getElementById('company-mobile').value,
        email: document.getElementById('company-email').value,
        state: document.getElementById('company-state').value,
        stateCode: document.getElementById('company-code').value,
        accountNumber: document.getElementById('account-number').value,
        ifscCode: document.getElementById('ifsc-code').value,
        branch: document.getElementById('branch').value,
        bankName: document.getElementById('bank-name').value,
        accountHolder: document.getElementById('account-holder').value
    };

    try {
        await setInDB('companyInfo', 'companyInfo', companyData);
        companyInfo = companyData;

        // REFRESH UI IMMEDIATELY
        await loadCompanyInfo();

        closeCompanyInfoModal();
        showNotification('Company info saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving company info:', error);
        showNotification('Error saving company info', 'error');
    }
}

function updateGSTBillCompanyInfo() {
    if (companyInfo) {
        document.getElementById('gstCompanyName').textContent = companyInfo.name;
        document.getElementById('gstCompanyAddr').textContent = companyInfo.address;
        document.getElementById('gstCompanyGstin').textContent = companyInfo.gstin;
        document.getElementById('gstCompanyPhone').textContent = companyInfo.mobile;
        document.getElementById('gstCompanyEmail').textContent = companyInfo.email;

        // Update the bill footer signatory
        document.getElementById('bill-company-signatory').textContent = `for ${companyInfo.name}`;

        // Update bank details
        document.getElementById('bill-account-holder').textContent = companyInfo.accountHolder;
        document.getElementById('bill-account-number').textContent = companyInfo.accountNumber;
        document.getElementById('bill-ifsc-code').textContent = companyInfo.ifscCode;
        document.getElementById('bill-branch').textContent = companyInfo.branch;
        document.getElementById('bill-bank-name').textContent = companyInfo.bankName;
    }
}


// NEW: Function to generate next invoice number
async function generateNextInvoiceNumber() {
    try {
        const savedBills = await getAllFromDB('gstSavedBills');
        let maxInvoiceNo = 0;

        // Find the highest invoice number from all GST saved bills
        savedBills.forEach(bill => {
            if (bill.value && bill.value.invoiceDetails && bill.value.invoiceDetails.number) {
                const invoiceNo = parseInt(bill.value.invoiceDetails.number);
                if (!isNaN(invoiceNo) && invoiceNo > maxInvoiceNo) {
                    maxInvoiceNo = invoiceNo;
                }
            }
        });

        // Set next invoice number (max + 1) or default to 1 if no bills exist
        const nextInvoiceNo = maxInvoiceNo > 0 ? maxInvoiceNo + 1 : 1;
        document.getElementById('invoice-no').value = nextInvoiceNo.toString().padStart(3, '0');

        console.log('Generated next invoice number:', nextInvoiceNo, 'from max:', maxInvoiceNo);

    } catch (error) {
        console.error('Error generating invoice number:', error);
        document.getElementById('invoice-no').value = '001'; // Default to 001 if error
    }
}

function closeCustomerDetailsModal() {
    // SAVE the current state before closing (in case user made changes)
    saveCustomerDialogState();

    document.getElementById('customer-details-modal').style.display = 'none';

    // Only reset the invoice number field state, not the values
    const invoiceNoInput = document.getElementById('invoice-no');
    invoiceNoInput.disabled = false;
    invoiceNoInput.style.backgroundColor = '';
    invoiceNoInput.title = '';

    // DO NOT clear any form values here
}

function handleCustomerTypeChange() {
    const customerType = document.getElementById('customer-type').value;
    const shipToSection = document.getElementById('ship-to-section');

    if (customerType === 'both') {
        shipToSection.style.display = 'block';
    } else {
        shipToSection.style.display = 'none';
    }
}

async function handleCustomerSearch(type) {
    const input = document.getElementById(`${type}-name`);
    const suggestions = document.getElementById(`${type}-suggestions`);
    const searchTerm = input.value.trim();

    if (searchTerm.length < 2) {
        suggestions.style.display = 'none';
        return;
    }

    try {
        const allCustomers = await getAllFromDB('gstCustomers');
        const filtered = allCustomers.filter(customer =>
            customer.value.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.value.gstin.includes(searchTerm)
        ).slice(0, 5);

        suggestions.innerHTML = '';
        filtered.forEach(customer => {
            const div = document.createElement('div');
            div.className = 'customer-suggestion-item';
            div.textContent = `${customer.value.name} (${customer.value.gstin})`;
            div.onclick = () => fillCustomerDetails(type, customer.value);
            suggestions.appendChild(div);
        });

        suggestions.style.display = filtered.length > 0 ? 'block' : 'none';
    } catch (error) {
        console.error('Error searching customers:', error);
    }
}

function fillCustomerDetails(type, customer) {
    document.getElementById(`${type}-name`).value = customer.name;
    document.getElementById(`${type}-address`).value = customer.address;
    document.getElementById(`${type}-gst`).value = customer.gstin;
    document.getElementById(`${type}-state`).value = customer.state;
    document.getElementById(`${type}-code`).value = customer.stateCode;
    document.getElementById(`${type}-contact`).value = customer.phone;
    document.getElementById(`${type}-suggestions`).style.display = 'none';

    // Auto-detect transaction type based on state code
    if (companyInfo && customer.stateCode !== companyInfo.stateCode) {
        document.getElementById('transaction_type').value = 'interstate';
    } else {
        document.getElementById('transaction_type').value = 'intrastate';
    }
}


// NEW: Function to check for duplicate invoice numbers
async function checkDuplicateInvoiceNumber(invoiceNo) {
    try {
        const savedBills = await getAllFromDB('gstSavedBills');

        for (const bill of savedBills) {
            if (bill.value.invoiceDetails && bill.value.invoiceDetails.number === invoiceNo) {
                return true; // Duplicate found
            }
        }
        return false; // No duplicate found

    } catch (error) {
        console.error('Error checking duplicate invoice number:', error);
        return false; // Assume no duplicate on error
    }
}

function formatDateForDisplay(dateString) {
    if (!dateString || typeof dateString !== "string") return "N/A";

    try {
        // Normalize possible separators (/, .)
        let safeDate = dateString.replace(/\./g, "-").replace(/\//g, "-");

        const parts = safeDate.split("-");

        // Case 1 ✅ yyyy-mm-dd (from HTML date input)
        if (parts.length === 3 && parts[0].length === 4) {
            const [yyyy, mm, dd] = parts;
            return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
        }

        // Case 2 ✅ dd-mm-yyyy (already correct)
        if (parts.length === 3 && parts[2].length === 4) {
            const [dd, mm, yyyy] = parts;
            return `${dd.padStart(2, "0")}-${mm.padStart(2, "0")}-${yyyy}`;
        }

        // Fallback ✅ Use JavaScript parser for other formats
        const parsedDate = new Date(dateString);
        if (!isNaN(parsedDate.getTime())) {
            const dd = String(parsedDate.getDate()).padStart(2, "0");
            const mm = String(parsedDate.getMonth() + 1).padStart(2, "0");
            const yyyy = parsedDate.getFullYear();
            return `${dd}-${mm}-${yyyy}`;
        }

        // Last fallback: return what was given
        return dateString;

    } catch (err) {
        return dateString;
    }
}


function updateGSTTaxCalculation() {
    // Safety check - only proceed if in GST mode and GST bill container exists
    if (!isGSTMode) return;

    const gstBillContainer = document.getElementById('gst-bill-container');
    if (!gstBillContainer || gstBillContainer.style.display === 'none') {
        return; // GST bill not visible, skip calculation
    }

    const items = Array.from(document.querySelectorAll('#gstCopyListManual tbody tr[data-id]'));
    let subtotal = 0;
    const taxData = {};

    items.forEach(row => {
        const amountCell = row.querySelector('.amount');
        if (amountCell) {
            const amount = parseFloat(amountCell.textContent) || 0;
            subtotal += amount;

            const hsn = row.getAttribute('data-hsn') || 'N/A';
            if (!taxData[hsn]) {
                taxData[hsn] = {
                    taxableValue: 0,
                    items: 0
                };
            }
            taxData[hsn].taxableValue += amount;
            taxData[hsn].items += 1;
        }
    });

    // Calculate discount with precision
    const discountAmount = storeWithPrecision(subtotal * (discountPercent / 100));
    const taxableValue = storeWithPrecision(subtotal - discountAmount);

    // Calculate taxes with precision
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (transactionType === 'intrastate') {
        cgstAmount = storeWithPrecision(taxableValue * (currentGSTPercent / 200));
        sgstAmount = storeWithPrecision(taxableValue * (currentGSTPercent / 200));
    } else {
        igstAmount = storeWithPrecision(taxableValue * (currentGSTPercent / 100));
    }

    // ROUND OFF GRAND TOTAL to nearest whole number for display only
    const grandTotal = Math.round(taxableValue + cgstAmount + sgstAmount + igstAmount);

    // Update display with rounded values - safely get elements each time
    try {
        const gstSubTotalEl = document.getElementById('gst-sub-total');
        const gstDiscountAmountEl = document.getElementById('gst-discount-amount');
        const gstDiscountPercentEl = document.getElementById('gst-discount-percent');
        const gstCgstAmountEl = document.getElementById('gst-cgst-amount');
        const gstSgstAmountEl = document.getElementById('gst-sgst-amount');
        const gstIgstAmountEl = document.getElementById('gst-igst-amount');
        const gstGrandTotalEl = document.getElementById('gst-grand-total');

        // Only update if elements exist (GST bill is visible)
        if (gstSubTotalEl) gstSubTotalEl.textContent = roundToTwoDecimals(subtotal).toFixed(2);
        if (gstDiscountAmountEl) gstDiscountAmountEl.textContent = `-${roundToTwoDecimals(discountAmount).toFixed(2)}`;
        if (gstDiscountPercentEl) gstDiscountPercentEl.textContent = roundToTwoDecimals(discountPercent);
        if (gstCgstAmountEl) gstCgstAmountEl.textContent = roundToTwoDecimals(cgstAmount).toFixed(2);
        if (gstSgstAmountEl) gstSgstAmountEl.textContent = roundToTwoDecimals(sgstAmount).toFixed(2);
        if (gstIgstAmountEl) gstIgstAmountEl.textContent = roundToTwoDecimals(igstAmount).toFixed(2);
        if (gstGrandTotalEl) gstGrandTotalEl.textContent = roundToTwoDecimals(grandTotal).toFixed(2);

        // Update discount row label
        const gstDiscountRow = document.getElementById('gst-discount-row');
        if (gstDiscountRow && gstDiscountRow.cells && gstDiscountRow.cells[0]) {
            gstDiscountRow.cells[0].textContent = `Discount (${roundToTwoDecimals(discountPercent)}%)`;
        }

        // Show/hide rows based on conditions
        const gstDiscountRowDisplay = document.getElementById('gst-discount-row');
        const gstCgstRow = document.getElementById('gst-cgst-row');
        const gstSgstRow = document.getElementById('gst-sgst-row');
        const gstIgstRow = document.getElementById('gst-igst-row');

        // Only show discount row if discountPercent > 0 AND discountAmount > 0
        if (gstDiscountRowDisplay) {
            gstDiscountRowDisplay.style.display = (discountPercent > 0 && discountAmount > 0) ? '' : 'none';
        }
        if (gstCgstRow) gstCgstRow.style.display = transactionType === 'intrastate' ? '' : 'none';
        if (gstSgstRow) gstSgstRow.style.display = transactionType === 'intrastate' ? '' : 'none';
        if (gstIgstRow) gstIgstRow.style.display = transactionType === 'interstate' ? '' : 'none';

    } catch (error) {
        console.log('GST elements not available for update (normal during view switching)');
    }

    // Update tax breakdown table with discounted taxable value
    updateTaxBreakdownTable(taxData, taxableValue, cgstAmount, sgstAmount, igstAmount);

    // Update amount in words (without decimal part)
    updateAmountInWords(grandTotal);
}

/// Updated helper for GST Tax Table (Simplified for Adjustment Chain)
function updateTaxBreakdownTable(taxDataMap, taxableValue, cgst, sgst, igst) {
    const tbody = document.getElementById('bill-tax-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Calculate total tax for display
    const totalTax = (cgst + sgst + igst).toFixed(2);

    // Determine rates string based on mode
    const cgstRate = transactionType === 'intrastate' ? (currentGSTPercent / 2).toFixed(2) + '%' : '-';
    const sgstRate = transactionType === 'intrastate' ? (currentGSTPercent / 2).toFixed(2) + '%' : '-';
    const igstRate = transactionType === 'interstate' ? currentGSTPercent.toFixed(2) + '%' : '-';

    // Create a single summary row representing the final calculated values
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="align-center">All Items</td>
        <td class="align-center">${taxableValue.toFixed(2)}</td>
        <td class="align-center">${cgstRate}</td>
        <td class="align-center">${cgst.toFixed(2)}</td>
        <td class="align-center">${sgstRate}</td>
        <td class="align-center">${sgst.toFixed(2)}</td>
        <td class="align-center">${totalTax}</td>
    `;
    tbody.appendChild(row);

    // Add totals row (Visual consistency)
    const totalsRow = document.createElement('tr');
    totalsRow.id = 'tax-section-totals';
    totalsRow.style.fontWeight = 'bold';
    totalsRow.style.backgroundColor = '#f8f9fa';

    totalsRow.innerHTML = `
        <td class="align-center">TOTAL</td>
        <td class="align-center">${taxableValue.toFixed(2)}</td>
        <td></td>
        <td class="align-center">${cgst.toFixed(2)}</td>
        <td></td>
        <td class="align-center">${sgst.toFixed(2)}</td>
        <td class="align-center">${totalTax}</td>
    `;
    tbody.appendChild(totalsRow);
}

function updateAmountInWords(amount) {
    // Add safety check to prevent errors with invalid amounts
    let text = 'Rupees Zero Only';

    if (!isNaN(amount) && amount !== 0) {
        try {
            const words = convertNumberToWords(amount);
            text = `Rupees ${words} Only`;
        } catch (error) {
            console.error('Error converting amount to words:', error);
        }
    }

    // Update GST Bill Words (Existing)
    const gstWordsEl = document.getElementById('bill-amount-words');
    if (gstWordsEl) {
        gstWordsEl.textContent = text;
    }

    // Update Regular Bill Words (New Fix)
    const regWordsEl = document.getElementById('reg-bill-amount-words');
    if (regWordsEl) {
        regWordsEl.textContent = text;
    }
}

// Basic number to words converter (you might want to use a more robust library)
function convertNumberToWords(num) {
    // Round off to nearest whole number first
    const roundedNum = Math.round(num);

    if (roundedNum === 0) return 'Zero';

    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const thousands = ['', 'Thousand', 'Lakh', 'Crore'];

    let n = roundedNum;
    let words = '';

    if (n === 0) {
        words = 'Zero';
    } else {
        // Convert whole part only (no decimal handling)
        let numStr = n.toString();
        let groups = [];

        // Indian numbering system: groups of 2 digits after the first 3
        if (numStr.length > 3) {
            groups.push(numStr.substr(-3));
            numStr = numStr.substr(0, numStr.length - 3);

            while (numStr.length > 2) {
                groups.push(numStr.substr(-2));
                numStr = numStr.substr(0, numStr.length - 2);
            }
            if (numStr.length > 0) {
                groups.push(numStr);
            }
        } else {
            groups.push(numStr);
        }

        groups = groups.reverse();

        for (let i = 0; i < groups.length; i++) {
            let group = parseInt(groups[i]);
            if (group === 0) continue;

            let groupWords = '';
            const hundreds = Math.floor(group / 100);
            const remainder = group % 100;

            if (hundreds > 0) {
                groupWords += units[hundreds] + ' Hundred ';
            }

            if (remainder > 0) {
                if (remainder < 10) {
                    groupWords += units[remainder] + ' ';
                } else if (remainder < 20) {
                    groupWords += teens[remainder - 10] + ' ';
                } else {
                    const tensDigit = Math.floor(remainder / 10);
                    const unitsDigit = remainder % 10;
                    groupWords += tens[tensDigit] + ' ';
                    if (unitsDigit > 0) {
                        groupWords += units[unitsDigit] + ' ';
                    }
                }
            }

            if (i < groups.length - 1) {
                groupWords += thousands[groups.length - 1 - i] + ' ';
            }

            words += groupWords;
        }

        words = words.trim();
    }

    // Return only the whole number part without "and XX/100"
    return words;
}

function openGSTManageCustomersModal() {
    document.getElementById('gst-manage-customers-modal').style.display = 'block';
    loadGSTCustomersList();
}

function closeGSTManageCustomersModal() {
    document.getElementById('gst-manage-customers-modal').style.display = 'none';
}

function openAddGSTCustomerModal() {
    currentlyEditingCustomerId = null;
    document.getElementById('add-gst-customer-modal-title').textContent = 'Add New GST Customer';
    document.getElementById('save-gst-customer-btn').textContent = 'Save GST Customer';

    // RESET ALL FIELDS
    document.getElementById('saved-gst-customer-name').value = '';
    document.getElementById('saved-gst-customer-address').value = '';
    document.getElementById('saved-gst-customer-phone').value = '';
    document.getElementById('saved-gst-customer-gstin').value = '';
    document.getElementById('saved-gst-customer-state').value = 'Maharashtra';
    document.getElementById('saved-gst-customer-state-code').value = '27';
    document.getElementById('saved-gst-customer-email').value = '';

    document.getElementById('add-gst-customer-modal').style.display = 'block';
}

function closeAddGSTCustomerModal() {
    document.getElementById('add-gst-customer-modal').style.display = 'none';
    currentlyEditingCustomerId = null; // ADD THIS LINE
}

async function saveGSTCustomerDataToLocalStorage() {
    const gstCustomerData = {
        invoiceNo: document.getElementById('invoice-no').value,
        invoiceDate: document.getElementById('invoice-date').value,
        gstPercent: parseFloat(document.getElementById('gst-percent-input').value),
        customerType: document.getElementById('customer-type').value,
        transactionType: document.getElementById('transaction_type').value,

        // Bill To data - ADD CONTACT FIELD
        billTo: {
            name: document.getElementById('consignee-name').value,
            address: document.getElementById('consignee-address').value,
            gstin: document.getElementById('consignee-gst').value,
            contact: document.getElementById('consignee-contact').value, // THIS WAS MISSING
            state: document.getElementById('consignee-state').value,
            stateCode: document.getElementById('consignee-code').value
        },

        // Ship To data - ADD CONTACT FIELD  
        shipTo: {
            name: document.getElementById('buyer-name').value,
            address: document.getElementById('buyer-address').value,
            gstin: document.getElementById('buyer-gst').value,
            contact: document.getElementById('buyer-contact').value, // THIS WAS MISSING
            state: document.getElementById('buyer-state').value,
            stateCode: document.getElementById('buyer-code').value,
            placeOfSupply: document.getElementById('place-of-supply').value
        },

        timestamp: Date.now()
    };

    await setInDB('gstMode', 'gstCustomerData', gstCustomerData);

    // Also update the bill view immediately with contact numbers
    document.getElementById('billToContact').textContent = document.getElementById('consignee-contact').value || 'Not provided';
    if (document.getElementById('customer-type').value === 'both') {
        document.getElementById('shipToContact').textContent = document.getElementById('buyer-contact').value || 'Not provided';
    }
}

async function saveGSTCustomer() {
    const customerName = document.getElementById('saved-gst-customer-name').value.trim();
    const address = document.getElementById('saved-gst-customer-address').value.trim();
    const phone = document.getElementById('saved-gst-customer-phone').value.trim();
    const gstin = document.getElementById('saved-gst-customer-gstin').value.trim();
    const state = document.getElementById('saved-gst-customer-state').value.trim();
    const stateCode = document.getElementById('saved-gst-customer-state-code').value.trim();
    const email = document.getElementById('saved-gst-customer-email').value.trim();

    if (!customerName) {
        showNotification('Please enter a customer name');
        return;
    }

    const customerData = {
        name: customerName,
        address: address,
        phone: phone,
        gstin: gstin,
        state: state,
        stateCode: stateCode,
        email: email,
        timestamp: Date.now()
    };

    try {
        // CHECK IF EDITING EXISTING CUSTOMER
        if (currentlyEditingCustomerId) {
            // UPDATE existing customer
            await setInDB('gstCustomers', currentlyEditingCustomerId, customerData);
            showNotification('GST customer updated successfully!', 'success');
        } else {
            // CREATE new customer
            const customerId = `gst-customer-${Date.now()}`;
            await setInDB('gstCustomers', customerId, customerData);
            showNotification('GST customer saved successfully!', 'success');
        }

        await loadGSTCustomersList();
        closeAddGSTCustomerModal();
        // RESET editing state
        currentlyEditingCustomerId = null;
    } catch (error) {
        console.error('Error saving GST customer:', error);
    }
}

// Load GST Customers
async function loadGSTCustomersList() {
    try {
        const customers = await getAllFromDB('gstCustomers');
        const customersList = document.getElementById('customers-list');
        customersList.innerHTML = '';

        if (customers.length === 0) {
            customersList.innerHTML = '<div class="customer-card">No GST customers saved yet</div>';
            return;
        }

        customers.forEach(customer => {
            const customerCard = document.createElement('div');
            customerCard.className = 'customer-card';

            // Use ID for uniqueness as names might be duplicated
            const menuId = `menu-gstcust-${customer.id}-${Date.now()}`;

            customerCard.innerHTML = `
                <div class="card-header-row">
                    <div class="card-info">
                        <span>${customer.value.name}</span>
                        <span class="card-sub-info">${customer.value.gstin || 'No GSTIN'}</span>
                    </div>
                    
                    <div class="card-controls">
                        <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                        
                        <div class="action-menu-container">
                            <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="${menuId}" class="action-dropdown">
                                <button class="dropdown-item" onclick="openPaymentDialog('${customer.value.name}', '${customer.value.gstin || ''}')">
                                    <span class="material-icons">payments</span> Payment & CN
                                </button>
                                <button class="dropdown-item" onclick="openLedgerDialog('${customer.value.name}', '${customer.value.gstin || ''}')">
                                    <span class="material-icons">book</span> Ledger
                                </button>
                                <button class="dropdown-item" onclick="editGSTCustomer('${customer.id}')">
                                    <span class="material-icons">edit</span> Edit
                                </button>
                                <button class="dropdown-item delete-item" onclick="deleteGSTCustomer('${customer.id}')">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section hidden customer-details-text">
                    <div>Address: ${customer.value.address || 'Not provided'}</div>
                    <div>Phone: ${customer.value.phone || customer.value.contact || 'Not provided'}</div>
                    <div>State: ${customer.value.state || 'Not provided'} (${customer.value.stateCode || '-'})</div>
                    <div>Email: ${customer.value.email || 'Not provided'}</div>
                </div>
            `;
            customersList.appendChild(customerCard);
        });
    } catch (error) {
        console.error('Error loading GST customers list:', error);
    }
}

function searchGSTCustomers() {
    const searchTerm = document.getElementById('gst-customer-search').value.toLowerCase();
    const customerCards = document.querySelectorAll('#gst-customers-list .customer-card');

    customerCards.forEach(card => {
        const nameEl = card.querySelector('.card-info');
        const subInfoEl = card.querySelector('.card-sub-info');
        const detailsEl = card.querySelector('.details-section');

        const customerName = nameEl ? nameEl.textContent.toLowerCase() : '';
        const gstin = subInfoEl ? subInfoEl.textContent.toLowerCase() : '';
        const customerDetails = detailsEl ? detailsEl.textContent.toLowerCase() : '';

        if (customerName.includes(searchTerm) || gstin.includes(searchTerm) || customerDetails.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

async function editGSTCustomer(customerId) {
    try {
        const customer = await getFromDB('gstCustomers', customerId);
        if (customer) {
            currentlyEditingCustomerId = customerId;
            document.getElementById('add-gst-customer-modal-title').textContent = 'Edit GST Customer';
            document.getElementById('save-gst-customer-btn').textContent = 'Update GST Customer';

            // PROPERLY FILL ALL FORM FIELDS
            document.getElementById('saved-gst-customer-name').value = customer.name || '';
            document.getElementById('saved-gst-customer-address').value = customer.address || '';
            document.getElementById('saved-gst-customer-phone').value = customer.phone || '';
            document.getElementById('saved-gst-customer-gstin').value = customer.gstin || '';
            document.getElementById('saved-gst-customer-state').value = customer.state || 'Maharashtra';
            document.getElementById('saved-gst-customer-state-code').value = customer.stateCode || '27';
            document.getElementById('saved-gst-customer-email').value = customer.email || '';

            document.getElementById('add-gst-customer-modal').style.display = 'block';
        }
    } catch (error) {
        console.error('Error editing GST customer:', error);
        showNotification('Error loading customer for editing', 'error');
    }
}

async function deleteGSTCustomer(customerId) {
    const shouldDeleteGstcustomer = await showConfirm('Are you sure you want to delete this GST customer?');
    if (shouldDeleteGstcustomer) {
        try {
            await removeFromDB('gstCustomers', customerId);
            await loadGSTCustomersList();
        } catch (error) {
            console.error('Error deleting GST customer:', error);
        }
    }
}

function openGSTSavedBillsModal() {
    document.getElementById('gst-saved-bills-modal').style.display = 'block';
    loadGSTSavedBillsList();
}

function closeGSTSavedBillsModal() {
    document.getElementById('gst-saved-bills-modal').style.display = 'none';
}

async function autoSaveGSTCustomer() {
    const customerName = document.getElementById('billToName').textContent.trim();
    const customerGSTIN = document.getElementById('billToGstin').textContent.trim();

    if (!customerName) return; // No customer name, skip auto-save

    // Check if customer already exists in GST customers
    const existingCustomers = await getAllFromDB('gstCustomers');
    const customerExists = existingCustomers.some(customer =>
        customer.value.name === customerName || customer.value.gstin === customerGSTIN
    );

    if (customerExists) {
        console.log('GST customer already exists, skipping auto-save');
        return;
    }

    // Only save if GSTIN is provided and different (not placeholder)
    if (!customerGSTIN || customerGSTIN === 'customer 15-digit GSTIN' || customerGSTIN === 'N/A') {
        console.log('No valid GSTIN provided, skipping GST customer auto-save');
        return;
    }

    // Create GST customer data
    const customerData = {
        name: customerName,
        address: document.getElementById('billToAddr').textContent.trim(),
        phone: '', // GST bill doesn't have phone field
        gstin: customerGSTIN,
        state: document.getElementById('billToState').textContent.trim() || 'Maharashtra',
        stateCode: document.getElementById('billToStateCode').textContent.trim() || '27',
        email: '',
        timestamp: Date.now()
    };

    try {
        const customerId = `gst-customer-${Date.now()}`;
        await setInDB('gstCustomers', customerId, customerData);
        console.log('GST customer auto-saved:', customerName);
    } catch (error) {
        console.error('Error auto-saving GST customer:', error);
    }
}
function areGSTCustomerDetailsFilled() {
    const billToName = document.getElementById('billToName').textContent.trim();
    const billToAddr = document.getElementById('billToAddr').textContent.trim();
    const billToGstin = document.getElementById('billToGstin').textContent.trim();

    // Check if basic customer details are filled (not empty or placeholder)
    if (!billToName ||
        !billToAddr ||
        billToGstin === 'customer 15-digit GSTIN' ||
        billToName === 'jhone doe' ||
        billToAddr === 'new york city') {
        return false;
    }

    return true;
}

async function saveGSTCurrentBill() {
    console.log('Edit Mode:', editMode, 'Bill ID:', currentEditingBillId, 'Bill Type:', currentEditingBillType);
    if (!areGSTCustomerDetailsFilled()) {
        showNotification('Please fill customer details in GST mode', 'error');
        return;
    }


    const customerName = document.getElementById('billToName').textContent.trim();
    const invoiceNo = document.getElementById('bill-invoice-no').textContent.trim() || 'No Invoice Number';
    const totalAmount = document.getElementById('gst-grand-total').textContent || '0.00';

    // Check for duplicate invoice number in edit mode
    if (!editMode) {
        const isDuplicate = await checkDuplicateBillNumber(invoiceNo, 'gst');
        if (isDuplicate) {
            showNotification('Invoice number already exists! Please use a different number.', 'error');
            return;
        }
    }

    // Auto-save GST customer if doesn't exist
    await autoSaveGSTCustomer();

    try {
        const currentData = await getGSTBillData();
        if (!currentData) return;

        // Add item count calculation
        const itemCount = document.querySelectorAll('#createListManual tbody tr[data-id]').length;

        const savedBill = {
            ...currentData,
            title: `${customerName} - ${invoiceNo}`,
            totalAmount: totalAmount,
            timestamp: Date.now(),
            date: document.getElementById('bill-date-gst').textContent || new Date().toLocaleDateString(),
            itemCount: itemCount // Add this line
        };

        let billId;
        // In saveGSTCurrentBill() function, add this in the edit mode section:
        if (editMode && currentEditingBillId) {
            // EDIT MODE: Restore original stock first
            await restoreStockFromOriginalBill(currentEditingBillId);

            billId = currentEditingBillId;
            await setInDB('gstSavedBills', billId, savedBill);
            // Then reduce stock with new quantities
            await reduceStockOnSave();
            showNotification('GST Bill updated successfully!');
            resetEditMode();
        } else {
            // Normal mode: Create new bill
            billId = `gst-saved-bill-${Date.now()}`;
            await setInDB('gstSavedBills', billId, savedBill);
            // ADD STOCK REDUCTION HERE - for GST edit mode
            await reduceStockOnSave();
            showNotification('GST Bill saved successfully!');
        }

    } catch (error) {
        console.error('Error saving GST bill:', error);
        showNotification('Error saving GST bill');
    }
}

async function getGSTBillData() {
    const data = {
        company: companyInfo,
        customer: {
            billTo: {
                name: document.getElementById('billToName').textContent,
                address: document.getElementById('billToAddr').textContent,
                gstin: document.getElementById('billToGstin').textContent,
                contact: document.getElementById('billToContact').textContent,
                state: document.getElementById('billToState').textContent,
                stateCode: document.getElementById('billToStateCode').textContent,

            },
            shipTo: {
                name: document.getElementById('shipToName').textContent,
                address: document.getElementById('shipToAddr').textContent,
                gstin: document.getElementById('shipToGstin').textContent,
                contact: document.getElementById('shipToContact').textContent,
                state: document.getElementById('shipToState').textContent,
                stateCode: document.getElementById('shipToStateCode').textContent,
                placeOfSupply: document.getElementById('shipToPOS').textContent
            }
        },
        invoiceDetails: {
            number: document.getElementById('bill-invoice-no').textContent,
            date: document.getElementById('bill-date-gst').textContent
        },
        customerType: document.getElementById('customer-type').value,
        taxSettings: {
            transactionType: transactionType,
            gstPercent: currentGSTPercent,
            discountPercent: discountPercent
        },
        // === FIX: Save Adjustment Chain ===
        adjustmentChain: adjustmentChain,

        tableStructure: [],
        items: [],
        totals: {
            subtotal: parseFloat(document.getElementById('gst-sub-total')?.textContent) || 0,
            // Fallbacks for elements that might be hidden/missing if no adjustments
            cgst: parseFloat(document.getElementById('gst-cgst-amount')?.textContent) || 0,
            sgst: parseFloat(document.getElementById('gst-sgst-amount')?.textContent) || 0,
            igst: parseFloat(document.getElementById('gst-igst-amount')?.textContent) || 0,
            grandTotal: parseFloat(document.getElementById('gst-grand-total')?.textContent) || 0
        }
    };

    document.querySelectorAll('#gstCopyListManual tbody tr').forEach(row => {
        if (row.classList.contains('section-row')) {
            // Save section data
            const sectionId = row.getAttribute('data-section-id');
            const cell = row.querySelector('td');
            let sectionName = '';
            for (let node of cell.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    sectionName = node.textContent.trim();
                    break;
                }
            }

            data.tableStructure.push({
                type: 'section',
                id: sectionId,
                name: sectionName,
                style: cell.getAttribute('style') || ''
            });
        } else if (row.getAttribute('data-id')) {
            // Save item data
            const cells = row.children;
            const particularsDiv = cells[1];
            const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
            const notes = particularsDiv.querySelector('.notes')?.textContent || '';

            const itemObj = {
                type: 'item',
                id: row.getAttribute('data-id'),
                itemName: itemName,
                hsn: row.getAttribute('data-hsn') || '',
                quantity: cells[3].textContent,
                unit: cells[4].textContent,
                rate: parseFloat(cells[5].textContent).toFixed(2),
                amount: parseFloat(cells[6].textContent).toFixed(2),
                notes: notes,
                // Save Discount/Dim Data for reconstruction
                discountType: row.getAttribute('data-discount-type') || 'none',
                discountValue: row.getAttribute('data-discount-value') || 0,
                dimensionType: row.getAttribute('data-dimension-type') || 'none',
                dimensionValues: JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]'),
                dimensionUnit: row.getAttribute('data-dimension-unit') || 'ft',
                originalQuantity: row.getAttribute('data-original-quantity'),
                particularsHtml: particularsDiv.innerHTML
            };

            data.tableStructure.push(itemObj);
            data.items.push(itemObj);
        }
    });

    return data;
}


async function loadGSTSavedBillsList() {
    try {
        const savedBills = await getAllFromDB('gstSavedBills');
        const billsList = document.getElementById('saved-bills-list');
        billsList.innerHTML = '';

        if (savedBills.length === 0) {
            billsList.innerHTML = '<div class="saved-bill-card">No GST bills saved yet</div>';
            return;
        }

        savedBills.sort((a, b) => b.value.timestamp - a.value.timestamp);

        savedBills.forEach(bill => {
            const billCard = document.createElement('div');
            billCard.className = 'saved-bill-card';

            const menuId = `menu-gstbill-${bill.id}-${Date.now()}`;
            const invoiceNo = bill.value.invoiceDetails?.number || 'N/A';
            const custName = bill.value.customer?.billTo?.name || 'N/A';
            const gstin = bill.value.customer?.billTo?.gstin || 'No GSTIN';

            // New Header: [Invoice] - [Customer] -> [GSTIN] -> [Total] -> [Toggle] -> [Menu]
            billCard.innerHTML = `
                <div class="card-header-row">
                    <div class="card-info">
                        <span>${invoiceNo} - ${custName}</span>
                        <span class="card-sub-info">${gstin}</span>
                        <span class="card-sub-info" style="color:var(--primary-color)">₹${bill.value.totalAmount}</span>
                    </div>
                    
                    <div class="card-controls">
                        <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                            <span class="material-icons">keyboard_arrow_down</span>
                        </button>
                        
                        <div class="action-menu-container">
                            <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                                <span class="material-icons">more_vert</span>
                            </button>
                            <div id="${menuId}" class="action-dropdown">
                                <button class="dropdown-item" onclick="downloadBillAsJson('${bill.id}', 'gst', event)">
                                    <span class="material-icons">download</span> Download JSON
                                </button>
                                <button class="dropdown-item" onclick="editSavedBill('${bill.id}', 'gst', event)">
                                    <span class="material-icons">edit</span> Edit
                                </button>
                                <button class="dropdown-item delete-item" onclick="deleteSavedBill('${bill.id}', 'gst', event)">
                                    <span class="material-icons">delete</span> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section hidden saved-bill-details">
                    <div>Date: ${bill.value.date}</div>
                    <div>Items: ${bill.value.items?.length || bill.value.itemCount || 0}</div>
                    <div>Type: ${bill.value.taxSettings?.transactionType || 'N/A'}</div>
                </div>
            `;
            // RESTORE CLICK TO LOAD FUNCTIONALITY
            billCard.addEventListener('click', async (e) => {
                // Ignore clicks on buttons/menu (Action controls)
                if (e.target.closest('.card-controls')) return;

                resetEditMode();
                await clearAllData(true);

                // Ensure we are in GST Mode
                if (!isGSTMode) {
                    isGSTMode = true;
                    updateUIForGSTMode();
                }

                await loadGSTSavedBill(bill.id);
                closeSavedBillsModal();

                // Wait for UI to settle then update calculations
                setTimeout(() => {
                    copyItemsToGSTBill();
                    updateGSTTaxCalculation();
                    resetColumnVisibility();
                }, 100);
            });
            billsList.appendChild(billCard);
        });
    } catch (error) {
        console.error('Error loading GST saved bills:', error);
    }
}

async function loadGSTSavedBill(billId) {
    try {
        const savedBill = await getFromDB('gstSavedBills', billId);
        if (!savedBill) return;

        // 1. Load company info
        if (savedBill.companyInfo) {
            companyInfo = savedBill.companyInfo;
            updateGSTBillCompanyInfo();
        }

        // 2. Load customer details to GST bill display
        if (savedBill.customer) {
            document.getElementById('billToName').textContent = savedBill.customer.billTo?.name || '';
            document.getElementById('billToAddr').textContent = savedBill.customer.billTo?.address || '';
            document.getElementById('billToGstin').textContent = savedBill.customer.billTo?.gstin || 'customer 15-digit GSTIN';
            document.getElementById('billToContact').textContent = savedBill.customer.billTo?.contact || '';
            document.getElementById('billToState').textContent = savedBill.customer.billTo?.state || 'maharashtra';
            document.getElementById('billToStateCode').textContent = savedBill.customer.billTo?.stateCode || '27';

            // ALSO FILL CUSTOMER DETAILS DIALOG FORM
            document.getElementById('consignee-name').value = savedBill.customer.billTo?.name || '';
            document.getElementById('consignee-address').value = savedBill.customer.billTo?.address || '';
            document.getElementById('consignee-gst').value = savedBill.customer.billTo?.gstin || '';
            document.getElementById('consignee-state').value = savedBill.customer.billTo?.state || 'Maharashtra';
            document.getElementById('consignee-code').value = savedBill.customer.billTo?.stateCode || '27';
            document.getElementById('consignee-contact').value = savedBill.customer.billTo?.contact || '';

            // Handle ship to section - USE THE SAVED CUSTOMER TYPE
            const shipToDiv = document.getElementById('shipTo');
            if (savedBill.customerType === 'both' && savedBill.customer.shipTo?.name) {
                shipToDiv.style.display = 'block';
                document.getElementById('shipToName').textContent = savedBill.customer.shipTo.name;
                document.getElementById('shipToAddr').textContent = savedBill.customer.shipTo.address;
                document.getElementById('shipToGstin').textContent = savedBill.customer.shipTo.gstin;
                document.getElementById('shipToContact').textContent = savedBill.customer.shipTo?.contact || '';
                document.getElementById('shipToState').textContent = savedBill.customer.shipTo.state;
                document.getElementById('shipToStateCode').textContent = savedBill.customer.shipTo.stateCode;
                document.getElementById('shipToPOS').textContent = savedBill.customer.shipTo.placeOfSupply;

                // ALSO FILL SHIP TO IN CUSTOMER DETAILS DIALOG
                document.getElementById('buyer-name').value = savedBill.customer.shipTo?.name || '';
                document.getElementById('buyer-address').value = savedBill.customer.shipTo?.address || '';
                document.getElementById('buyer-gst').value = savedBill.customer.shipTo?.gstin || '';
                document.getElementById('buyer-state').value = savedBill.customer.shipTo?.state || 'Maharashtra';
                document.getElementById('buyer-code').value = savedBill.customer.shipTo?.stateCode || '27';
                document.getElementById('buyer-contact').value = savedBill.customer.shipTo?.contact || '';
                document.getElementById('place-of-supply').value = savedBill.customer.shipTo?.placeOfSupply || 'Maharashtra';
            } else {
                shipToDiv.style.display = 'none';
            }
        }

        // 3. Load invoice details
        if (savedBill.invoiceDetails) {
            document.getElementById('bill-invoice-no').textContent = savedBill.invoiceDetails.number;
            document.getElementById('bill-date-gst').textContent = savedBill.invoiceDetails.date;

            // ALSO FILL INVOICE DETAILS IN CUSTOMER DIALOG FORM
            document.getElementById('invoice-no').value = savedBill.invoiceDetails.number || '';
            document.getElementById('invoice-date').value = savedBill.invoiceDetails?.date || '';
        }

        if (savedBill.customerType) {
            document.getElementById('customer-type').value = savedBill.customerType;
            handleCustomerTypeChange();
        }

        // 4. Load tax settings variables
        if (savedBill.taxSettings) {
            transactionType = savedBill.taxSettings.transactionType || 'intrastate';
            currentGSTPercent = savedBill.taxSettings.gstPercent || 18;
            discountPercent = savedBill.taxSettings.discountPercent || 0;
        }

        // === 5. RESTORE ADJUSTMENT CHAIN (With Legacy Migration) ===
        if (savedBill.adjustmentChain) {
            adjustmentChain = savedBill.adjustmentChain;
        } else if (savedBill.taxSettings) {
            // Migrate Legacy Bills
            adjustmentChain = [];
            // Migrate Discount
            if (savedBill.taxSettings.discountPercent > 0) {
                adjustmentChain.push({
                    id: 'legacy-discount', name: 'Discount', type: 'percent',
                    value: savedBill.taxSettings.discountPercent, operation: 'subtract', textColor: '#e74c3c'
                });
            } else if (savedBill.taxSettings.discountAmount > 0) {
                adjustmentChain.push({
                    id: 'legacy-discount', name: 'Discount', type: 'amount',
                    value: savedBill.taxSettings.discountAmount, operation: 'subtract', textColor: '#e74c3c'
                });
            }
            // Migrate GST
            if (savedBill.taxSettings.gstPercent > 0) {
                adjustmentChain.push({
                    id: 'legacy-gst', name: 'GST', type: 'percent',
                    value: savedBill.taxSettings.gstPercent, operation: 'add', textColor: '#27ae60'
                });
            }
        } else {
            adjustmentChain = [];
        }

        // 6. Clear current items and load saved items
        const createListTbody = document.querySelector("#createListManual tbody");
        const copyListTbody = document.querySelector("#copyListManual tbody");
        const gstListTbody = document.querySelector("#gstCopyListManual tbody");

        createListTbody.innerHTML = "";
        copyListTbody.innerHTML = "";
        if (gstListTbody) gstListTbody.innerHTML = "";

        // Load table structure (sections + items in order)
        if (savedBill.tableStructure && savedBill.tableStructure.length > 0) {
            let maxId = 0;
            savedBill.tableStructure.forEach(rowData => {
                if (rowData.type === 'section') {
                    createSectionInAllTablesFromSaved(rowData);
                } else if (rowData.type === 'item') {
                    // Create item in all tables
                    createItemInAllTablesFromSaved({
                        type: 'item',
                        id: rowData.id,
                        itemName: rowData.itemName,
                        quantity: rowData.quantity,
                        unit: rowData.unit,
                        rate: parseFloat(rowData.rate),
                        amount: parseFloat(rowData.amount),
                        notes: rowData.notes,
                        dimensionType: rowData.dimensionType,
                        dimensionValues: rowData.dimensionValues,
                        dimensionUnit: rowData.dimensionUnit,
                        hsnCode: rowData.hsn,
                        productCode: rowData.productCode,
                        discountType: rowData.discountType,
                        discountValue: rowData.discountValue,
                        // Pass through new fields if they exist
                        dimensionToggles: rowData.dimensionToggles,
                        convertUnit: rowData.convertUnit
                    });

                    const idNum = parseInt(rowData.id.split('-')[2]);
                    if (idNum > maxId) maxId = idNum;
                }
            });
            rowCounterManual = maxId + 1;
        }
        // Backward compatibility
        else if (savedBill.items && savedBill.items.length > 0) {
            let maxId = 0;
            savedBill.items.forEach(item => {
                createItemInAllTablesFromSaved({
                    type: 'item',
                    id: item.id,
                    itemName: item.itemName,
                    quantity: item.quantity,
                    unit: item.unit,
                    rate: parseFloat(item.rate),
                    amount: parseFloat(item.amount),
                    notes: item.notes,
                    dimensionType: item.dimensionType,
                    dimensionValues: item.dimensionValues,
                    dimensionUnit: item.dimensionUnit,
                    hsnCode: item.hsn,
                    productCode: item.productCode,
                    discountType: item.discountType,
                    discountValue: item.discountValue
                });

                const idNum = parseInt(item.id.split('-')[2]);
                if (idNum > maxId) maxId = idNum;
            });
            rowCounterManual = maxId + 1;
        }

        updateSerialNumbers();

        // 7. Update Calculations (uses the loaded adjustmentChain)
        updateTotal();

        if (isGSTMode) {
            copyItemsToGSTBill();
            updateGSTTaxCalculation();
        }

        // 8. Save the loaded state
        await saveToLocalStorage();
        saveStateToHistory();
        await saveCustomerDialogState();

        // Store invoice data for modal
        window.currentSavedBillInvoiceData = {
            number: savedBill.invoiceDetails?.number,
            date: savedBill.invoiceDetails?.date
        };

        showNotification('GST bill loaded successfully');

        // 9. FORCE REFRESH THE BILL DISPLAY
        setTimeout(() => {
            updateGSTBillDisplay();
            copyItemsToGSTBill();
            updateGSTTaxCalculation();

            // Recalculate totals one last time to ensure UI sync with adjustment chain
            updateTotal();

            // Ensure customer details visible
            if (savedBill.customer) {
                document.getElementById('billToName').textContent = savedBill.customer.billTo?.name || '';
                // ... (other field updates handled by updateGSTBillDisplay) ...
            }
        }, 100);

    } catch (error) {
        console.error('Error loading GST saved bill:', error);
        showNotification('Error loading GST bill', 'error');
    }
    await saveToLocalStorage();
}

function updateGSTBillDisplay() {
    if (!isGSTMode) return;

    // Safety check - only proceed if GST bill container exists and is visible
    const gstBillContainer = document.getElementById('gst-bill-container');
    if (!gstBillContainer || gstBillContainer.style.display === 'none') {
        return; // GST bill not visible, skip update
    }

    // Update company details if available - with safety checks
    if (companyInfo) {
        const gstCompanyNameEl = document.getElementById('gstCompanyName');
        const gstCompanyAddrEl = document.getElementById('gstCompanyAddr');
        const gstCompanyGstinEl = document.getElementById('gstCompanyGstin');
        const gstCompanyPhoneEl = document.getElementById('gstCompanyPhone');
        const gstCompanyEmailEl = document.getElementById('gstCompanyEmail');

        if (gstCompanyNameEl) gstCompanyNameEl.textContent = companyInfo.name || 'COMPANY NAME';
        if (gstCompanyAddrEl) gstCompanyAddrEl.textContent = companyInfo.address || 'Address';
        if (gstCompanyGstinEl) gstCompanyGstinEl.textContent = companyInfo.gstin || 'Your 15-digit GSTIN';
        if (gstCompanyPhoneEl) gstCompanyPhoneEl.textContent = companyInfo.mobile || '+91 1234567890';
        if (gstCompanyEmailEl) gstCompanyEmailEl.textContent = companyInfo.email || 'abcd@gmail.com';
    }

    // Copy items from regular table to GST table
    copyItemsToGSTBill();

    // Update totals and tax calculations (with safety check inside the function)
    updateGSTTaxCalculation();

    // FIX: Calculate and insert section total rows for GST table
    updateSectionTotals();
}

function copyItemsToGSTBill() {
    const regularTable = document.querySelector('#copyListManual tbody');
    const gstTable = document.querySelector('#gstCopyListManual tbody');

    if (!regularTable || !gstTable) return;

    // Clear GST table first
    gstTable.innerHTML = '';

    // Copy ALL rows (both sections and items) from regular table to GST table
    const regularRows = regularTable.querySelectorAll('tr');
    let itemCounter = 0;

    regularRows.forEach((regularRow) => {
        if (regularRow.classList.contains('section-row')) {
            // Handle section rows
            const sectionId = regularRow.getAttribute('data-section-id');
            // FIX: Get the show-total attribute from the source row
            const showTotal = regularRow.getAttribute('data-show-total');

            const cell = regularRow.querySelector('td');
            // Clean name: remove buttons text if present
            const name = cell.textContent.replace('−', '').replace('+', '').trim();
            const styleString = cell.getAttribute('style') || '';

            // Create section row for GST table with JUST THE NAME (no buttons)
            const gstRow = document.createElement('tr');
            gstRow.className = 'section-row';
            gstRow.setAttribute('data-section-id', sectionId);
            // FIX: Set the attribute on the new GST row
            if (showTotal) gstRow.setAttribute('data-show-total', showTotal);

            gstRow.setAttribute('draggable', 'true');

            gstRow.innerHTML = `
                <td colspan="8" style="${styleString}">
                    ${name}
                </td>
            `;

            addDragAndDropListeners(gstRow);
            gstTable.appendChild(gstRow);
        } else if (regularRow.getAttribute('data-id')) {
            // Handle item rows - increment counter only for items
            itemCounter++;

            const cells = regularRow.children;
            const particularsDiv = cells[1];

            // Get HSN from saved item if available
            let hsnCode = regularRow.getAttribute('data-hsn') || '';

            // Get the ADJUSTED rate from the regular table
            const adjustedRate = parseFloat(cells[4].textContent) || 0;
            const adjustedAmount = parseFloat(cells[5].textContent) || 0;

            // Create GST table row with the ADJUSTED rate
            const gstRow = document.createElement('tr');
            gstRow.setAttribute('data-id', regularRow.getAttribute('data-id'));
            gstRow.setAttribute('data-hsn', hsnCode);

            // Copy all data attributes including adjusted rates
            const attributes = ['data-dimension-type', 'data-dimension-values', 'data-dimension-unit', 'data-original-quantity', 'data-product-code', 'data-discount-type', 'data-discount-value', 'data-rate', 'data-amount', 'data-original-rate'];
            attributes.forEach(attr => {
                if (regularRow.hasAttribute(attr)) {
                    gstRow.setAttribute(attr, regularRow.getAttribute(attr));
                }
            });

            gstRow.innerHTML = `
                <td class="sr-no">${itemCounter}</td>
                <td>${particularsDiv.innerHTML}</td>
                <td>${hsnCode}</td>
                <td>${cells[2].textContent}</td>
                <td>${cells[3].textContent}</td>
                <td>${adjustedRate.toFixed(2)}</td>
                <td class="amount">${adjustedAmount.toFixed(2)}</td>
            `;

            addDragAndDropListeners(gstRow);
            gstTable.appendChild(gstRow);
        }
    });

    // Update GST calculations after copying items
    updateGSTTaxCalculation();

    // FIX: Explicitly call updateSectionTotals here to ensure they appear immediately
    updateSectionTotals();
}

//GST STATE SAVE
async function saveGSTStateToDB() {
    if (!isGSTMode) return;

    const gstState = {
        companyInfo: companyInfo,
        customerDetails: {
            billTo: {
                name: document.getElementById('billToName').textContent,
                address: document.getElementById('billToAddr').textContent,
                gstin: document.getElementById('billToGstin').textContent,
                state: document.getElementById('billToState').textContent,
                stateCode: document.getElementById('billToStateCode').textContent
            },
            shipTo: {
                name: document.getElementById('shipToName').textContent,
                address: document.getElementById('shipToAddr').textContent,
                gstin: document.getElementById('shipToGstin').textContent,
                state: document.getElementById('shipToState').textContent,
                stateCode: document.getElementById('shipToStateCode').textContent,
                placeOfSupply: document.getElementById('shipToPOS').textContent
            }
        },
        invoiceDetails: {
            number: document.getElementById('bill-invoice-no').textContent,
            date: document.getElementById('bill-date-gst').textContent
        },
        taxSettings: {
            transactionType: transactionType,
            gstPercent: currentGSTPercent,
            discountPercent: discountPercent
        },
        items: await getGSTItemsData(),
        timestamp: Date.now()
    };

    await setInDB('gstMode', 'currentGSTState', gstState);
}

async function getGSTItemsData() {
    const items = [];
    document.querySelectorAll('#gstCopyListManual tbody tr[data-id]').forEach(row => {
        const cells = row.children;
        const particularsDiv = cells[1];
        const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';
        const notes = particularsDiv.querySelector('.notes')?.textContent || '';

        items.push({
            id: row.getAttribute('data-id'),
            itemName: itemName,
            hsn: row.getAttribute('data-hsn') || '',
            quantity: cells[3].textContent,
            unit: cells[4].textContent,
            rate: parseFloat(cells[5].textContent).toFixed(2),
            amount: parseFloat(cells[6].textContent).toFixed(2),
            notes: notes
        });
    });
    return items;
}

// Load GST state on initialization
async function loadGSTStateFromDB() {
    if (!isGSTMode) return;

    try {
        const gstState = await getFromDB('gstMode', 'currentGSTState');
        if (gstState) {
            // Load GST state here
            console.log('Loaded GST state:', gstState);
        }
    } catch (error) {
        console.error('Error loading GST state:', error);
    }
}

// Save customer dialog state
async function saveCustomerDialogState() {
    const customerState = {
        customerType: document.getElementById('customer-type').value,
        invoiceNo: document.getElementById('invoice-no').value,
        invoiceDate: document.getElementById('invoice-date').value,
        gstPercent: document.getElementById('gst-percent-input').value,
        transactionType: document.getElementById('transaction_type').value,

        // Bill To details
        consigneeName: document.getElementById('consignee-name').value,
        consigneeAddress: document.getElementById('consignee-address').value,
        consigneeGst: document.getElementById('consignee-gst').value,
        consigneeState: document.getElementById('consignee-state').value,
        consigneeCode: document.getElementById('consignee-code').value,
        consigneeContact: document.getElementById('consignee-contact').value, // ADD THIS LINE

        // Ship To details
        buyerName: document.getElementById('buyer-name').value,
        buyerAddress: document.getElementById('buyer-address').value,
        buyerGst: document.getElementById('buyer-gst').value,
        buyerState: document.getElementById('buyer-state').value,
        buyerCode: document.getElementById('buyer-code').value,
        buyerContact: document.getElementById('buyer-contact').value, // ADD THIS LINE
        placeOfSupply: document.getElementById('place-of-supply').value,

        timestamp: Date.now()
    };

    await setInDB('gstMode', 'customerDialogState', customerState);
}

// Load customer dialog state
async function loadCustomerDialogState() {
    try {
        const customerState = await getFromDB('gstMode', 'customerDialogState');
        if (customerState) {
            // Restore form values
            document.getElementById('customer-type').value = customerState.customerType || 'bill-to';
            // Update visibility based on customer type
            handleCustomerTypeChange();
            document.getElementById('invoice-no').value = customerState.invoiceNo || '';

            // Handle date format conversion if needed
            // let invoiceDate = customerState.invoiceDate || '';
            // if (invoiceDate && invoiceDate.includes('-')) {
            //     // Convert from yyyy-mm-dd to dd/mm/yyyy
            //     const [year, month, day] = invoiceDate.split('-');
            //     invoiceDate = `${day}-${month}-${year}`;
            // }
            // document.getElementById('invoice-date').value = invoiceDate;
            document.getElementById('invoice-date').value = customerState.invoiceDate || '';

            document.getElementById('gst-percent-input').value = customerState.gstPercent || '18';
            document.getElementById('transaction_type').value = customerState.transactionType || 'intrastate';

            // Restore Bill To details
            document.getElementById('consignee-name').value = customerState.consigneeName || '';
            document.getElementById('consignee-address').value = customerState.consigneeAddress || '';
            document.getElementById('consignee-gst').value = customerState.consigneeGst || '';
            document.getElementById('consignee-contact').value = customerState.consigneeContact || '';
            document.getElementById('consignee-state').value = customerState.consigneeState || 'Maharashtra';
            document.getElementById('consignee-code').value = customerState.consigneeCode || '27';
            document.getElementById('consignee-contact').value = customerState.consigneeContact || '';

            // Restore Ship To details
            document.getElementById('buyer-name').value = customerState.buyerName || '';
            document.getElementById('buyer-address').value = customerState.buyerAddress || '';
            document.getElementById('buyer-gst').value = customerState.buyerGst || '';
            document.getElementById('buyer-contact').value = customerState.buyerContact || '';
            document.getElementById('buyer-state').value = customerState.buyerState || 'Maharashtra';
            document.getElementById('buyer-code').value = customerState.buyerCode || '27';
            document.getElementById('buyer-contact').value = customerState.buyerContact || '';
            document.getElementById('place-of-supply').value = customerState.placeOfSupply || 'Maharashtra';

            // Update visibility based on customer type
            handleCustomerTypeChange();

            // NEW: Also update bill view with the loaded customer data
            document.getElementById('bill-invoice-no').textContent = customerState.invoiceNo || '';
            document.getElementById('bill-date-gst').textContent = formatDateForDisplay(customerState.invoiceDate) || '';

            document.getElementById('billToName').textContent = customerState.consigneeName || '';
            document.getElementById('billToAddr').textContent = customerState.consigneeAddress || '';
            document.getElementById('billToGstin').textContent = customerState.consigneeGst || 'customer 15-digit GSTIN';
            document.getElementById('billToContact').textContent = customerState.consigneeContact || 'Not provided';
            document.getElementById('billToState').textContent = customerState.consigneeState || 'Maharashtra';
            document.getElementById('billToStateCode').textContent = customerState.consigneeCode || '27';

            if (customerState.customerType === 'both') {
                document.getElementById('shipTo').style.display = 'block';
                document.getElementById('shipToName').textContent = customerState.buyerName || '';
                document.getElementById('shipToAddr').textContent = customerState.buyerAddress || '';
                document.getElementById('shipToGstin').textContent = customerState.buyerGst || 'customer 15-digit GSTIN';
                document.getElementById('shipToContact').textContent = customerState.buyerContact || 'Not provided';
                document.getElementById('shipToState').textContent = customerState.buyerState || 'Maharashtra';
                document.getElementById('shipToStateCode').textContent = customerState.buyerCode || '27';
                document.getElementById('shipToPOS').textContent = customerState.placeOfSupply || 'Maharashtra';
            } else {
                document.getElementById('shipTo').style.display = 'none';
            }
        } else {
            // NEW: If no saved state, set defaults
            document.getElementById('customer-type').value = 'bill-to';
            document.getElementById('gst-percent-input').value = '18';
            document.getElementById('transaction_type').value = 'intrastate';
            document.getElementById('consignee-state').value = 'Maharashtra';
            document.getElementById('consignee-code').value = '27';
            document.getElementById('buyer-state').value = 'Maharashtra';
            document.getElementById('buyer-code').value = '27';
            document.getElementById('place-of-supply').value = 'Maharashtra';

            // ADD THIS: Set today's date as default
            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            document.getElementById('invoice-date').value = `${day}-${month}-${year}`;

            handleCustomerTypeChange();
        }
    } catch (error) {
        console.error('Error loading customer dialog state:', error);
    }
    // Also update Bill View with the loaded contact numbers
    document.getElementById('billToContact').textContent = document.getElementById('consignee-contact').value || 'Not provided';
    if (document.getElementById('customer-type').value === 'both') {
        document.getElementById('shipToContact').textContent = document.getElementById('buyer-contact').value || 'Not provided';
    }
}
function openCustomerDetailsModal() {
    document.getElementById('customer-details-modal').style.display = 'block';

    // REMOVE any code that resets the form values here
    // The form should already have the saved state from loadCustomerDialogState()

    // Check if we're in edit mode and disable invoice number field
    const invoiceNoInput = document.getElementById('invoice-no');
    if (editMode && currentEditingBillId) {
        invoiceNoInput.disabled = true;
        invoiceNoInput.style.backgroundColor = '#f5f5f5';
        invoiceNoInput.title = 'Invoice number cannot be changed in edit mode';
    } else {
        invoiceNoInput.disabled = false;
        invoiceNoInput.style.backgroundColor = '';
        invoiceNoInput.title = '';
    }

    // Check if we have saved bill invoice data (for loaded bills)
    if (window.currentSavedBillInvoiceData) {
        // Use saved bill's invoice data
        document.getElementById('invoice-no').value = window.currentSavedBillInvoiceData.number || '';
        document.getElementById('invoice-date').value = window.currentSavedBillInvoiceData?.date || '';

        // Clear the stored data after using it
        window.currentSavedBillInvoiceData = null;
    }
    // If no saved bill data, the form should keep its current state

    showCustomerDetailsSummary();
}

// NEW: Function to show customer details summary in the modal
function showCustomerDetailsSummary() {
    const invoiceNo = document.getElementById('invoice-no').value;
    const invoiceDate = document.getElementById('invoice-date').value;

    // You can add this summary display in your modal HTML or as a notification
    console.log('Customer Details - Invoice:', invoiceNo, 'Date:', invoiceDate);
}


// [REPLACE EXISTING saveCustomerDetails FUNCTION]
async function saveCustomerDetails() {
    const invoiceNo = document.getElementById('invoice-no').value.trim();
    const invoiceDate = document.getElementById('invoice-date').value;
    const gstPercent = parseFloat(document.getElementById('gst-percent-input').value);
    const customerType = document.getElementById('customer-type').value;

    // Check for duplicate invoice number
    if (editMode && currentEditingBillId) {
        if (invoiceNo !== window.currentEditingBillOriginalNumber) {
            const isDuplicate = await checkDuplicateInvoiceNumber(invoiceNo);
            if (isDuplicate) {
                showNotification('Invoice number already exists! Please use a different number.', 'error');
                return;
            }
        }
    } else {
        const isDuplicate = await checkDuplicateInvoiceNumber(invoiceNo);
        if (isDuplicate) {
            showNotification('Invoice number already exists! Please use a different number.', 'error');
            return;
        }
    }

    // Update GST bill header
    document.getElementById('bill-invoice-no').textContent = invoiceNo;
    document.getElementById('bill-date-gst').textContent = formatDateForDisplay(invoiceDate);

    // Update bill to details
    document.getElementById('billToName').textContent = document.getElementById('consignee-name').value;
    document.getElementById('billToAddr').textContent = document.getElementById('consignee-address').value;
    document.getElementById('billToGstin').textContent = document.getElementById('consignee-gst').value;
    document.getElementById('billToState').textContent = document.getElementById('consignee-state').value;
    document.getElementById('billToStateCode').textContent = document.getElementById('consignee-code').value;
    document.getElementById('billToContact').textContent = document.getElementById('consignee-contact').value || '';

    // Update ship to details
    const shipToDiv = document.getElementById('shipTo');
    if (customerType === 'both') {
        shipToDiv.style.display = 'block';
        document.getElementById('shipToName').textContent = document.getElementById('buyer-name').value;
        document.getElementById('shipToAddr').textContent = document.getElementById('buyer-address').value;
        document.getElementById('shipToGstin').textContent = document.getElementById('buyer-gst').value;
        document.getElementById('shipToContact').textContent = document.getElementById('buyer-contact').value || '';
        document.getElementById('shipToState').textContent = document.getElementById('buyer-state').value;
        document.getElementById('shipToStateCode').textContent = document.getElementById('buyer-code').value;
        document.getElementById('shipToPOS').textContent = document.getElementById('place-of-supply').value;
    } else {
        shipToDiv.style.display = 'none';
    }

    // Update Global Variables
    transactionType = document.getElementById('transaction_type').value;
    currentGSTPercent = gstPercent;

    // Auto-apply rates logic
    if (autoApplyCustomerRates) {
        const gstin = document.getElementById('consignee-gst').value.trim();
        if (gstin) {
            await checkAndApplyCustomerRates(gstin);
        }
    }

    // Save states
    await saveCustomerDialogState();
    await saveGSTCustomerDataToLocalStorage();

    closeCustomerDetailsModal();

    // === FIX: Force Table Regeneration Immediately ===
    // This calls calculateAdjustments(), which re-renders the HTML 
    // with the correct display:none logic based on the new transactionType
    updateTotal();

    // Update breakdown table
    updateGSTTaxCalculation();

    await saveGSTStateToDB();

    showNotification('Customer details saved successfully!', 'success');
}


// Add auto-save on input changes
function setupCustomerDialogAutoSave() {
    const inputs = [
        'customer-type', 'invoice-no', 'invoice-date', 'gst-percent-input', 'transaction_type',
        'consignee-name', 'consignee-address', 'consignee-gst', 'consignee-state', 'consignee-code', 'consignee-contact',
        'buyer-name', 'buyer-address', 'buyer-gst', 'buyer-state', 'buyer-code', 'buyer-contact', 'place-of-supply',
        'invoice-no',
        'invoice-date'
    ];

    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', debounce(saveCustomerDialogState, 1000));
            element.addEventListener('change', saveCustomerDialogState);
        }
    });
}

// Debounce function to prevent too many saves
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}



// Add click handlers for section editing to all tables
document.addEventListener('click', function (e) {
    // Check if click is on a section row (but not the collapse button)
    const sectionRow = e.target.closest('.section-row');
    if (sectionRow && !e.target.classList.contains('collapse-btn')) {
        const sectionId = sectionRow.getAttribute('data-section-id');
        if (sectionId) {
            editSection(sectionId);
        }
    }
});
function handlePaddingTypeChange() {
    const paddingType = document.getElementById('section-padding-type').value;
    const singlePaddingGroup = document.getElementById('single-padding-group');
    const customPaddingGroup = document.getElementById('custom-padding-group');

    if (paddingType === 'custom') {
        singlePaddingGroup.style.display = 'none';
        customPaddingGroup.style.display = 'block';
    } else if (paddingType === '') {
        singlePaddingGroup.style.display = 'none';
        customPaddingGroup.style.display = 'none';
    } else {
        singlePaddingGroup.style.display = 'block';
        customPaddingGroup.style.display = 'none';
    }
}

function updateSectionTotals() {
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

    tables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        // Remove existing total rows to avoid duplicates
        table.querySelectorAll('.section-total-row').forEach(row => row.remove());

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        let currentSectionId = null;
        let currentSectionTotal = 0;
        let currentSectionName = '';
        let showTotalForCurrent = false;
        let lastItemRow = null;

        const insertTotalRow = () => {
            if (showTotalForCurrent && lastItemRow && currentSectionTotal > 0) {
                const totalRow = document.createElement('tr');
                totalRow.className = 'section-total-row';
                totalRow.setAttribute('data-for-section', currentSectionId);

                // Determine colspan based on table structure
                let labelColSpan;
                // GST Table: Sr, Particulars, HSN, Qty, Unit, Rate, Amount (Index 6)
                // Regular Table: Sr, Particulars, Qty, Unit, Rate, Amount (Index 5)
                if (tableId === 'gstCopyListManual') {
                    labelColSpan = 6;
                } else {
                    labelColSpan = 5;
                }

                const labelCell = document.createElement('td');
                labelCell.colSpan = labelColSpan;
                labelCell.style.textAlign = 'right';
                labelCell.style.fontWeight = 'bold';
                labelCell.style.paddingRight = '10px';
                labelCell.textContent = `Total :`;

                const amountCell = document.createElement('td');
                amountCell.style.textAlign = 'center';
                amountCell.style.fontWeight = 'bold';
                amountCell.textContent = currentSectionTotal.toFixed(2);

                totalRow.appendChild(labelCell);
                totalRow.appendChild(amountCell);

                // Add empty cell for Actions column if needed
                if (tableId === 'createListManual' || tableId === 'gstCopyListManual') {
                    const emptyCell = document.createElement('td');
                    // FIX: Add class to target this cell for visibility toggling
                    emptyCell.className = 'section-total-action-cell';
                    totalRow.appendChild(emptyCell);
                }

                lastItemRow.parentNode.insertBefore(totalRow, lastItemRow.nextSibling);
            }
        };

        rows.forEach(row => {
            if (row.classList.contains('section-row')) {
                // Close previous section
                if (currentSectionId) insertTotalRow();

                // Start new section
                currentSectionId = row.getAttribute('data-section-id');

                // Safely get text node only (ignoring buttons)
                const td = row.querySelector('td');
                currentSectionName = '';
                if (td) {
                    for (let node of td.childNodes) {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                            currentSectionName = node.textContent.trim();
                            break;
                        }
                    }
                }
                if (!currentSectionName) currentSectionName = 'Section';

                showTotalForCurrent = row.getAttribute('data-show-total') === 'true';
                currentSectionTotal = 0;
                lastItemRow = null;
            } else if (row.getAttribute('data-id')) {
                // Accumulate item
                if (currentSectionId) {
                    const amount = parseFloat(row.getAttribute('data-amount') || 0);
                    currentSectionTotal += amount;
                    lastItemRow = row;
                }
            }
        });

        // Handle last section
        if (currentSectionId) insertTotalRow();
    });
}

function resetSectionModal() {
    // Reset all fields to default values
    document.getElementById('section-name').value = '';
    document.getElementById('section-align').value = 'left';
    document.getElementById('section-font-weight').value = '600';
    document.getElementById('section-bg-color').value = '#ffe8b5';
    document.getElementById('section-font-color').value = '#000000';
    document.getElementById('section-font-size').value = '16';
    document.getElementById('section-text-transform').value = 'none';
    document.getElementById('section-padding-type').value = 'padding-left';
    document.getElementById('section-padding-value').value = '75';
    document.getElementById('section-show-total').checked = false; // NEW: Reset checkbox

    // Reset custom padding
    document.getElementById('section-padding-left').value = '';
    document.getElementById('section-padding-right').value = '';
    document.getElementById('section-padding-top').value = '';
    document.getElementById('section-padding-bottom').value = '';

    // Also reset the stored state to defaults
    sectionModalState = {
        align: 'center',
        fontWeight: '600',
        bgColor: '#ffe8b5',
        fontColor: '#000000',
        fontSize: '16',
        textTransform: 'none',
        paddingType: 'padding-left',
        paddingValue: '75',
        paddingLeft: '',
        paddingRight: '',
        paddingTop: '',
        paddingBottom: '',
        showTotal: false // NEW
    };

    // Reset visibility
    handlePaddingTypeChange();
}


function openSectionModal() {
    currentlyEditingSectionId = null;
    document.getElementById('section-modal-title').textContent = 'Create Section';
    document.getElementById('save-section-btn').textContent = 'Add Section';

    // Reset ONLY section name, preserve all styling from previous state
    document.getElementById('section-name').value = '';

    // Pre-fill with stored modal state (if available) instead of resetting
    document.getElementById('section-align').value = sectionModalState.align || 'left';
    document.getElementById('section-font-weight').value = sectionModalState.fontWeight || '600';
    document.getElementById('section-bg-color').value = sectionModalState.bgColor || '#ffe8b5';
    document.getElementById('section-font-color').value = sectionModalState.fontColor || '#000000';
    document.getElementById('section-font-size').value = sectionModalState.fontSize || '16';
    document.getElementById('section-text-transform').value = sectionModalState.textTransform || 'none';
    document.getElementById('section-padding-type').value = sectionModalState.paddingType || 'padding-left';
    document.getElementById('section-padding-value').value = sectionModalState.paddingValue || '75';

    // Handle custom padding if it was stored
    if (sectionModalState.paddingType === 'custom') {
        document.getElementById('section-padding-left').value = sectionModalState.paddingLeft || '';
        document.getElementById('section-padding-right').value = sectionModalState.paddingRight || '';
        document.getElementById('section-padding-top').value = sectionModalState.paddingTop || '';
        document.getElementById('section-padding-bottom').value = sectionModalState.paddingBottom || '';
    }

    // Update visibility based on padding type
    handlePaddingTypeChange();

    document.getElementById('section-modal').style.display = 'block';
}

function closeSectionModal() {
    document.getElementById('section-modal').style.display = 'none';
    currentlyEditingSectionId = null;
    // DON'T reset sectionModalState here - keep it for next time!
}

function editSection(sectionId) {
    const row = document.querySelector(`#createListManual tr[data-section-id="${sectionId}"]`);
    if (!row) return;

    currentlyEditingSectionId = sectionId;
    document.getElementById('section-modal-title').textContent = 'Edit Section';
    document.getElementById('save-section-btn').textContent = 'Update Section';

    const cell = row.querySelector('td');

    // Extract ONLY the section name (first text node) without any button text
    let sectionName = '';
    for (let node of cell.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            sectionName = node.textContent.trim();
            break;
        }
    }

    document.getElementById('section-name').value = sectionName;
    document.getElementById('section-align').value = cell.style.textAlign || 'left';
    document.getElementById('section-bg-color').value = rgbToHex(cell.style.backgroundColor) || '#ffe8b5';
    document.getElementById('section-font-color').value = rgbToHex(cell.style.color) || '#000000';
    document.getElementById('section-font-size').value = parseInt(cell.style.fontSize) || 16;
    document.getElementById('section-text-transform').value = cell.style.textTransform || 'none';

    // NEW: Load checkbox state
    const showTotal = row.getAttribute('data-show-total') === 'true';
    document.getElementById('section-show-total').checked = showTotal;

    // FIX: Parse padding correctly
    const paddingStyle = cell.style.padding || '';

    if (!paddingStyle) {
        // Handle individual padding properties
        const pl = parseInt(cell.style.paddingLeft) || 0;
        const pr = parseInt(cell.style.paddingRight) || 0;
        const pt = parseInt(cell.style.paddingTop) || 0;
        const pb = parseInt(cell.style.paddingBottom) || 0;

        setPaddingValues(pl, pr, pt, pb);
    } else {
        // Handle combined padding property (e.g., "10px 20px 15px 5px")
        const paddingValues = paddingStyle.split(' ').map(val => parseInt(val) || 0);

        if (paddingValues.length === 1) {
            // Single value: padding: 10px
            setPaddingValues(paddingValues[0], paddingValues[0], paddingValues[0], paddingValues[0]);
        } else if (paddingValues.length === 2) {
            // Two values: padding: 10px 20px (top-bottom, left-right)
            setPaddingValues(paddingValues[1], paddingValues[1], paddingValues[0], paddingValues[0]);
        } else if (paddingValues.length === 3) {
            // Three values: padding: 10px 20px 15px (top, left-right, bottom)
            setPaddingValues(paddingValues[1], paddingValues[1], paddingValues[0], paddingValues[2]);
        } else if (paddingValues.length === 4) {
            // Four values: padding: 10px 20px 15px 5px (top, right, bottom, left)
            setPaddingValues(paddingValues[3], paddingValues[1], paddingValues[0], paddingValues[2]);
        } else {
            setPaddingValues(0, 0, 0, 0);
        }
    }

    document.getElementById('section-modal').style.display = 'block';
}

// Helper function to set padding values in the modal
function setPaddingValues(left, right, top, bottom) {
    // Determine padding type based on the values
    if (left === right && top === bottom && left === top && left > 0) {
        // All sides equal
        document.getElementById('section-padding-type').value = 'padding-inline';
        document.getElementById('section-padding-value').value = left;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (left === right && left > 0 && top === 0 && bottom === 0) {
        // Left and right only
        document.getElementById('section-padding-type').value = 'padding-inline';
        document.getElementById('section-padding-value').value = left;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (top === bottom && top > 0 && left === 0 && right === 0) {
        // Top and bottom only
        document.getElementById('section-padding-type').value = 'padding-block';
        document.getElementById('section-padding-value').value = top;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (left > 0 && right === 0 && top === 0 && bottom === 0) {
        // Left only
        document.getElementById('section-padding-type').value = 'padding-left';
        document.getElementById('section-padding-value').value = left;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (right > 0 && left === 0 && top === 0 && bottom === 0) {
        // Right only
        document.getElementById('section-padding-type').value = 'padding-right';
        document.getElementById('section-padding-value').value = right;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (top > 0 && bottom === 0 && left === 0 && right === 0) {
        // Top only
        document.getElementById('section-padding-type').value = 'padding-top';
        document.getElementById('section-padding-value').value = top;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (bottom > 0 && top === 0 && left === 0 && right === 0) {
        // Bottom only
        document.getElementById('section-padding-type').value = 'padding-bottom';
        document.getElementById('section-padding-value').value = bottom;
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (top === bottom && left > 0 && right === 0) {
        // Top-Left-Bottom pattern
        document.getElementById('section-padding-type').value = 'top-left-bottom';
        document.getElementById('section-padding-value').value = left; // Using left as the common value
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else if (top === bottom && right > 0 && left === 0) {
        // Top-Right-Bottom pattern
        document.getElementById('section-padding-type').value = 'top-right-bottom';
        document.getElementById('section-padding-value').value = right; // Using right as the common value
        document.getElementById('single-padding-group').style.display = 'block';
        document.getElementById('custom-padding-group').style.display = 'none';
    } else {
        // Custom padding (different values for each side)
        document.getElementById('section-padding-type').value = 'custom';
        document.getElementById('section-padding-left').value = left;
        document.getElementById('section-padding-right').value = right;
        document.getElementById('section-padding-top').value = top;
        document.getElementById('section-padding-bottom').value = bottom;
        document.getElementById('single-padding-group').style.display = 'none';
        document.getElementById('custom-padding-group').style.display = 'block';
    }

    // Update the UI based on the selected padding type
    handlePaddingTypeChange();
}


function rgbToHex(rgb) {
    if (!rgb) return '';
    if (rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if (!m) return '';
    const [r, g, b] = m.map(Number);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function saveSection() {
    const name = document.getElementById('section-name').value.trim();
    if (!name) {
        showNotification('Please enter a section name');
        return;
    }

    const align = document.getElementById('section-align').value;
    const fontWeight = document.getElementById('section-font-weight').value;
    const bgColor = document.getElementById('section-bg-color').value;
    const fontColor = document.getElementById('section-font-color').value;
    const fontSize = document.getElementById('section-font-size').value + 'px';
    const textTransform = document.getElementById('section-text-transform').value;
    const paddingType = document.getElementById('section-padding-type').value;
    const paddingValue = document.getElementById('section-padding-value').value;

    // FIX: Capture the checkbox state
    const showTotal = document.getElementById('section-show-total').checked;

    let paddingStyle = '';
    if (paddingType && paddingValue) {
        if (paddingType === 'custom') {
            const left = document.getElementById('section-padding-left').value || '0';
            const right = document.getElementById('section-padding-right').value || '0';
            const top = document.getElementById('section-padding-top').value || '0';
            const bottom = document.getElementById('section-padding-bottom').value || '0';
            paddingStyle = `padding: ${top}px ${right}px ${bottom}px ${left}px;`;
        } else if (paddingType === 'top-left-bottom') {
            paddingStyle = `padding-top: ${paddingValue}px; padding-left: ${paddingValue}px; padding-bottom: ${paddingValue}px;`;
        } else if (paddingType === 'top-right-bottom') {
            paddingStyle = `padding-top: ${paddingValue}px; padding-right: ${paddingValue}px; padding-bottom: ${paddingValue}px;`;
        } else if (paddingType === 'padding-inline') {
            paddingStyle = `padding-left: ${paddingValue}px; padding-right: ${paddingValue}px;`;
        } else if (paddingType === 'padding-block') {
            paddingStyle = `padding-top: ${paddingValue}px; padding-bottom: ${paddingValue}px;`;
        } else {
            paddingStyle = `${paddingType}: ${paddingValue}px;`;
        }
    }

    const styleString = `background-color: ${bgColor}; color: ${fontColor}; font-size: ${fontSize}; font-weight: ${fontWeight}; text-transform: ${textTransform}; text-align: ${align}; ${paddingStyle}`;

    // STORE THE MODAL STATE for next section creation
    sectionModalState = {
        align: align,
        fontWeight: fontWeight,
        bgColor: bgColor,
        fontColor: fontColor,
        fontSize: document.getElementById('section-font-size').value, // Store without 'px'
        textTransform: textTransform,
        paddingType: paddingType,
        paddingValue: paddingValue,
        // Store custom padding values if used
        paddingLeft: document.getElementById('section-padding-left').value || '',
        paddingRight: document.getElementById('section-padding-right').value || '',
        paddingTop: document.getElementById('section-padding-top').value || '',
        paddingBottom: document.getElementById('section-padding-bottom').value || '',
        showTotal: showTotal // FIX: Save state for next time
    };

    if (currentlyEditingSectionId) {
        // Update existing section (Pass showTotal)
        updateSectionInAllTables(currentlyEditingSectionId, name, styleString, showTotal);
    } else {
        // Create new section (Pass showTotal)
        createSectionInAllTables(name, styleString, showTotal);
    }

    closeSectionModal();
    saveToLocalStorage();
    saveStateToHistory();

    // FIX: Recalculate totals immediately after saving
    updateSectionTotals();
    applyColumnVisibility();
}

function createSectionInAllTablesFromSaved(sectionData) {
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

    tables.forEach(tableId => {
        const table = document.getElementById(tableId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        const tr = document.createElement('tr');
        tr.className = 'section-row';
        tr.setAttribute('data-section-id', sectionData.id);
        tr.setAttribute('data-show-total', sectionData.showTotal || false); // NEW: Restore saved state
        tr.setAttribute('draggable', 'true');

        const colspan = tableId === 'gstCopyListManual' ? '8' : '7';

        // FIX: Completely separate logic for each table type
        let content = sectionData.name; // Default fallback

        if (tableId === 'createListManual') {
            // Input table - always show buttons
            const buttonText = sectionData.collapsed ? '+' : '−';
            content = `${sectionData.name} 
                <button class="collapse-btn" onclick="toggleSection('${sectionData.id}')">${buttonText}</button>
                <button onclick="event.stopPropagation(); removeSection('${sectionData.id}')" class="remove-btn"><span class="material-icons">close</span></button>`;
        } else {
            // Bill view tables - ALWAYS show only section name, ignore any saved HTML
            content = sectionData.name;
        }

        tr.innerHTML = `
            <td colspan="${colspan}" style="${sectionData.style || ''}">
                ${content}
            </td>
        `;

        // ADD DRAG LISTENERS TO SECTION ROW
        addDragAndDropListeners(tr);
        tbody.appendChild(tr);
    });
}

function createSectionInAllTables(name, styleString, showTotal) {
    const sectionId = 'section-' + Date.now();

    // Create for input table (Pass showTotal)
    createSectionRow('createListManual', sectionId, name, styleString, showTotal);
    // Create for regular bill table (Pass showTotal)
    createSectionRow('copyListManual', sectionId, name, styleString, showTotal);
    // Create for GST bill table (Pass showTotal)
    createSectionRow('gstCopyListManual', sectionId, name, styleString, showTotal);
}
// And update the createSectionRow function to include stopPropagation:
function createSectionRow(tableId, sectionId, name, styleString, showTotal = false) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const tr = document.createElement('tr');
    tr.className = 'section-row';
    tr.setAttribute('data-section-id', sectionId);
    // FIX: Actually set the attribute on creation so totals work immediately
    tr.setAttribute('data-show-total', showTotal);
    tr.setAttribute('draggable', 'true');

    const colspan = tableId === 'gstCopyListManual' ? '8' : '7';

    // FIX: Only show buttons in input table (createListManual)
    let content = name;
    if (tableId === 'createListManual') {
        // Input table - show buttons
        content = `${name} 
            <button class="collapse-btn" onclick="toggleSection('${sectionId}')">−</button>
            <button onclick="event.stopPropagation(); removeSection('${sectionId}')" class="remove-btn"><span class="material-icons">close</span></button>`;
    } else {
        // Bill view tables - show only section name (no buttons)
        content = name;
    }

    tr.innerHTML = `
        <td colspan="${colspan}" style="${styleString}">
            ${content}
        </td>
    `;

    // Add drag listeners to section rows too
    addDragAndDropListeners(tr);
    tbody.appendChild(tr);
}


function updateSectionInAllTables(sectionId, name, styleString, showTotal) { // NEW argument
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];
    tables.forEach(tableId => {
        const row = document.querySelector(`#${tableId} tr[data-section-id="${sectionId}"]`);
        if (row) {
            const colspan = tableId === 'gstCopyListManual' ? '8' : '7';

            // NEW: Update attribute
            row.setAttribute('data-show-total', showTotal);

            // FIX: Only show buttons in input table (createListManual)
            let content = name;
            if (tableId === 'createListManual') {
                // Input table - show buttons
                content = `${name} 
                    <button class="collapse-btn" onclick="toggleSection('${sectionId}')">−</button>
                    <button onclick="event.stopPropagation(); removeSection('${sectionId}')" class="remove-btn"><span class="material-icons">close</span></button>`;
            } else {
                // Bill view tables - show only section name (no buttons)
                content = name;
            }

            row.innerHTML = `
                <td colspan="${colspan}" style="${styleString}">
                    ${content}
                </td>
            `;
            // RE-ADD DRAG LISTENERS AFTER UPDATING HTML
            addDragAndDropListeners(row);
        }
    });
}
function toggleSection(sectionId) {
    const tables = ['createListManual', 'copyListManual', 'gstCopyListManual'];

    // First, find the collapse state from the input table (createListManual)
    const inputSectionRow = document.querySelector(`#createListManual tr[data-section-id="${sectionId}"]`);
    let isCollapsed = false;

    if (inputSectionRow) {
        const button = inputSectionRow.querySelector('.collapse-btn');
        if (button) {
            isCollapsed = button.textContent === '+';
            button.textContent = isCollapsed ? '−' : '+';
        }
    }

    // Apply the same collapse state to all tables
    tables.forEach(tableId => {
        const sectionRow = document.querySelector(`#${tableId} tr[data-section-id="${sectionId}"]`);
        if (!sectionRow) return;

        let nextRow = sectionRow.nextElementSibling;
        while (nextRow && !nextRow.classList.contains('section-row')) {
            nextRow.style.display = isCollapsed ? '' : 'none';
            nextRow = nextRow.nextElementSibling;
        }
    });

    updateSerialNumbers();
    saveToLocalStorage();
    saveStateToHistory();
}

// Payment & Credit Note System
let currentPaymentCustomer = null;
let currentPaymentType = 'payment'; // 'payment' or 'credit-note'

// Open Payment Dialog
function openPaymentDialog(customerName, gstin) {
    currentPaymentCustomer = { name: customerName, gstin: gstin };
    currentPaymentType = 'payment';

    document.getElementById('payment-dialog-title').textContent = `Payments - ${customerName}`;
    document.getElementById('payment-dialog').classList.add('active');

    // Set today's date as default using initializeDateInputs
    initializeDateInputs();

    loadPaymentsAndCreditNotes();
}

function initializePeriodSelector() {
    const selectAll = document.getElementById('select-all-dates');
    const periodInputs = document.getElementById('period-inputs');
    const fromDateInput = document.getElementById('from-date-input');

    if (selectAll && periodInputs) {
        // Set default state
        selectAll.checked = true;
        periodInputs.style.display = 'none';
    }

    if (fromDateInput) {
        // Set default from date to 3 months ago
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        fromDateInput.value = threeMonthsAgo.toISOString().split('T')[0];
        fromDateInput.style.display = 'none';
    }
}

function openLedgerDialog(customerName, gstin) {
    console.log('Opening ledger dialog for:', customerName, gstin);

    // FIX: Ensure customer data is properly set
    if (!customerName) {
        console.error('No customer name provided to openLedgerDialog');
        return;
    }

    currentPaymentCustomer = {
        name: customerName.trim(),
        gstin: (gstin || '').trim()
    };

    // FIX: Safe element access
    const ledgerDialog = document.getElementById('ledger-dialog');
    const ledgerTitle = document.getElementById('ledger-dialog-title');

    if (!ledgerDialog) {
        console.error('Ledger dialog element not found');
        return;
    }

    if (ledgerTitle) {
        ledgerTitle.textContent = `Ledger - ${customerName}`;
    }

    ledgerDialog.classList.add('active');

    // FIX: Initialize period selector
    initializePeriodSelector();

    // FIX: Load data with the stored customer
    loadLedgerData(currentPaymentCustomer.name, currentPaymentCustomer.gstin);
}

// Close dialogs
function closePaymentDialog() {
    document.getElementById('payment-dialog').classList.remove('active');
    currentPaymentCustomer = null;
}

function closeLedgerDialog() {
    document.getElementById('ledger-dialog').classList.remove('active');
}

// Setup payment type toggle
function setupPaymentTypeToggle() {
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            // Remove active class from all buttons
            toggleBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');

            currentPaymentType = this.dataset.type;
            updatePaymentUI();
            loadPaymentsAndCreditNotesWithFilters();
        });
    });
}

async function editPaymentRecord(recordId, recordType = null) {
    try {
        // Use provided type or fall back to currentPaymentType
        const type = recordType || currentPaymentType;
        const storeName = type === 'payment' ? 'customerPayments' : 'customerCreditNotes';

        // Get the record from database
        const record = await getFromDB(storeName, recordId);

        if (!record) {
            showNotification('Record not found', 'error');
            return;
        }

        // Store the currently editing ID and type
        currentlyEditingPaymentId = recordId;
        currentPaymentType = type; // Ensure we're in the correct mode

        // Populate the form with record data
        document.getElementById('payment-date').value = record.date;
        document.getElementById('payment-method').value = record.method;
        document.getElementById('payment-amount').value = record.amount;
        document.getElementById('payment-notes').value = record.notes || '';

        // Safe element updates
        const formTypeLabel = document.getElementById('form-type-label');
        const addBtnLabel = document.getElementById('add-btn-label');
        const addPaymentBtn = document.getElementById('add-payment-btn');

        const typeLabel = type === 'payment' ? 'Payment' : 'Credit Note';
        if (formTypeLabel) formTypeLabel.textContent = typeLabel;
        if (addBtnLabel) addBtnLabel.textContent = typeLabel;
        if (addPaymentBtn) addPaymentBtn.innerHTML = `<i class="material-icons">save</i> Update ${typeLabel}`;

        showNotification(`${typeLabel} loaded for editing`, 'info');

    } catch (error) {
        console.error('Error loading record for editing:', error);
        showNotification('Error loading record', 'error');
    }
}

function resetPaymentForm() {
    // Clear form fields
    document.getElementById('payment-date').value = '';
    document.getElementById('payment-method').value = 'Cash';
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-notes').value = '';

    // Clear custom method input and hide container
    document.getElementById('custom-payment-method').value = '';
    document.getElementById('custom-method-container').style.display = 'none';

    // Reset UI to add mode
    document.getElementById('add-payment-btn').innerHTML = '<i class="material-icons">add</i> Add <span id="add-btn-label">Payment</span>';

    // Clear editing state
    currentlyEditingPaymentId = null;
}
async function updatePaymentRecord() {
    if (!currentlyEditingPaymentId) {
        showNotification('No record selected for editing', 'error');
        return;
    }

    // Handle payment method (including custom methods)
    const methodSelect = document.getElementById('payment-method');
    let finalMethod = methodSelect.value;

    if (finalMethod === 'Other') {
        const customMethod = document.getElementById('custom-payment-method').value.trim();
        if (!customMethod) {
            showNotification('Please enter custom payment method name');
            return;
        }
        finalMethod = customMethod;
        await saveCustomPaymentMethod(customMethod);
        await loadCustomPaymentMethods(); // Refresh dropdown
    }

    const date = document.getElementById('payment-date').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const notes = document.getElementById('payment-notes').value;

    // Different validation for Payments vs Credit Notes
    if (!date || !finalMethod || isNaN(amount)) {
        showNotification('Please fill all required fields with valid values', 'error');
        return;
    }

    // Payment-specific validation (only positive)
    if (currentPaymentType === 'payment' && amount <= 0) {
        showNotification('Payment amount must be greater than 0', 'error');
        return;
    }

    // Credit Note validation (any non-zero value)
    if (currentPaymentType === 'credit-note' && amount === 0) {
        showNotification('Credit Note amount cannot be zero', 'error');
        return;
    }

    try {
        const storeName = currentPaymentType === 'payment' ? 'customerPayments' : 'customerCreditNotes';

        // Get the existing record to preserve other data
        const existingRecord = await getFromDB(storeName, currentlyEditingPaymentId);

        if (!existingRecord) {
            showNotification('Record not found', 'error');
            return;
        }

        // Update the record
        const updatedRecord = {
            ...existingRecord,
            date: date,
            method: finalMethod, // Use the final method (could be custom)
            amount: amount,
            notes: notes,
            updatedAt: Date.now()
        };

        // Save updated record
        await setInDB(storeName, currentlyEditingPaymentId, updatedRecord);

        // Reset form and UI
        resetPaymentForm();

        // Reload the list
        loadPaymentsAndCreditNotesWithFilters();

        const typeLabel = currentPaymentType === 'payment' ? 'Payment' : 'Credit Note';
        showNotification(`${typeLabel} updated successfully!`, 'success');

    } catch (error) {
        console.error('Error updating record:', error);
        showNotification('Error updating record', 'error');
    }
}

function updatePaymentUI() {
    const typeLabel = currentPaymentType === 'payment' ? 'Payment' : 'Credit Note';

    // Safe element access with null checks
    const formTypeLabel = document.getElementById('form-type-label');
    const addBtnLabel = document.getElementById('add-btn-label');
    const listTypeLabel = document.getElementById('list-type-label');

    if (formTypeLabel) formTypeLabel.textContent = typeLabel;
    if (addBtnLabel) addBtnLabel.textContent = typeLabel;
    if (listTypeLabel) listTypeLabel.textContent = typeLabel;
}
// Load payments and credit notes
async function loadPaymentsAndCreditNotes() {
    if (!currentPaymentCustomer) return;

    const payments = await getCustomerPayments(currentPaymentCustomer.name, currentPaymentCustomer.gstin, currentPaymentType);
    displayPayments(payments);
}

function displayPayments(payments) {
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = '';

    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">No records found</td></tr>';
        return;
    }

    payments.forEach(payment => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${convertToDisplayFormat(payment.date)}</td>
            <td>${payment.method}</td>
            <td>₹${parseFloat(payment.amount).toFixed(2)}</td>
            <td>${payment.notes || ''}</td>
            <td class="payment-actions">
                <button class="edit-payment-btn" data-id="${payment.id}" data-type="${currentPaymentType}">
                    <i class="material-icons">edit</i> Edit
                </button>
                <button class="delete-payment-btn" data-id="${payment.id}" data-type="${currentPaymentType}">
                    <i class="material-icons">delete</i> Delete
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// View bill from ledger
async function viewBill(billId, source) {
    if (source === 'gst') {
        await loadGSTSavedBill(billId);
    } else {
        await loadSavedBill(billId);
    }
    closeLedgerDialog();

    // Switch to bill view
    if (currentView !== 'bill') {
        toggleView();
    }
}
function convertToDisplayFormat(dateStr) {
    console.log(dateStr);
    if (!dateStr) return 'N/A';

    // If already in dd-mm-yyyy format, return as is
    if (dateStr.includes('-') && dateStr.length === 10) {
        const parts = dateStr.split('-');
        if (parts[0].length === 2 && parts[2].length === 4) {
            return dateStr; // Already dd-mm-yyyy
        }
        // Convert yyyy-mm-dd to dd-mm-yyyy
        if (parts[0].length === 4) {
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
    }
    return dateStr;
}

function handleSelectAllChange() {
    const selectAll = document.getElementById('select-all-dates');
    const periodInputs = document.getElementById('period-inputs');

    if (selectAll && periodInputs) {
        if (selectAll.checked) {
            periodInputs.style.display = 'none';
        } else {
            periodInputs.style.display = 'flex';
        }

        loadLedgerData();
    }
}

function handlePeriodChange() {
    const periodSelect = document.getElementById('period-select');
    const fromDateInput = document.getElementById('from-date-input');

    if (periodSelect && fromDateInput) {
        if (periodSelect.value === 'fromdate') {
            fromDateInput.style.display = 'block';
        } else {
            fromDateInput.style.display = 'none';
        }

        loadLedgerData();
    }
}

function getDateRangeForPeriod() {
    const selectAll = document.getElementById('select-all-dates');
    if (!selectAll) return null;

    if (selectAll.checked) {
        return null; // Return null to indicate no filtering (show all)
    }

    const periodSelect = document.getElementById('period-select');
    if (!periodSelect) return null;

    const today = new Date();
    let startDate = new Date();

    switch (periodSelect.value) {
        case '1month':
            startDate.setMonth(today.getMonth() - 1);
            break;
        case '3months':
            startDate.setMonth(today.getMonth() - 3);
            break;
        case '6months':
            startDate.setMonth(today.getMonth() - 6);
            break;
        case 'fromdate':
            const fromDateInput = document.getElementById('from-date-input');
            if (fromDateInput && fromDateInput.value) {
                startDate = new Date(fromDateInput.value);
            } else {
                startDate.setMonth(today.getMonth() - 3);
            }
            break;
        default:
            return null;
    }

    // Format dates as dd-mm-yyyy for filtering
    const formatDate = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    return {
        startDate: formatDate(startDate),
        endDate: formatDate(today)
    };
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Close payment dialog
    document.getElementById('close-payment-dialog').addEventListener('click', closePaymentDialog);

    // Close ledger dialog
    document.getElementById('close-ledger-dialog').addEventListener('click', closeLedgerDialog);

    // Setup payment type toggle
    setupPaymentTypeToggle();

    // Close dialogs when clicking outside
    document.getElementById('payment-dialog').addEventListener('click', function (e) {
        if (e.target === this) closePaymentDialog();
    });

    document.getElementById('ledger-dialog').addEventListener('click', function (e) {
        if (e.target === this) closeLedgerDialog();
    });
});

async function getCustomerBills(customerName, gstin) {
    let bills = [];

    try {
        console.log('Fetching bills for:', customerName, 'GSTIN:', gstin);

        // Check GST bills first if GSTIN is provided
        if (gstin) {
            const gstBills = await getAllFromDB('gstSavedBills');
            console.log('All GST bills:', gstBills.length);

            const filteredGstBills = gstBills.filter(bill => {
                const billGSTIN = bill.value.customer?.billTo?.gstin || bill.value.customer?.shipTo?.gstin;
                return billGSTIN === gstin;
            });

            console.log('Filtered GST bills:', filteredGstBills.length);
            bills = bills.concat(filteredGstBills.map(bill => ({
                ...bill.value,
                source: 'gst',
                id: bill.id
            })));
        }

        // Check regular bills by customer name
        const regularBills = await getAllFromDB('savedBills');
        console.log('All regular bills:', regularBills.length);

        const regularCustomerBills = regularBills.filter(bill => {
            const billCustomerName = bill.value.customer?.name;
            return billCustomerName === customerName;
        }).map(bill => ({
            ...bill.value,
            source: 'regular',
            id: bill.id
        }));

        console.log('Filtered regular bills:', regularCustomerBills.length);
        bills = bills.concat(regularCustomerBills);

        console.log('Total bills found:', bills.length);
        return bills;
    } catch (error) {
        console.error('Error getting customer bills:', error);
        return [];
    }
}

async function getCustomerFinancialData(customerName, gstin, dateRange = null) {
    console.log('Getting financial data for:', customerName, 'with dateRange:', dateRange);

    const bills = await getCustomerBills(customerName, gstin);
    const payments = await getCustomerPayments(customerName, gstin, 'payment');
    const creditNotes = await getCustomerPayments(customerName, gstin, 'credit-note');

    console.log('Raw data - Bills:', bills.length, 'Payments:', payments.length, 'Credit Notes:', creditNotes.length);

    // If no date range (Select All checked), return all data
    if (!dateRange) {
        console.log('No date range - returning all data');
        return { bills, payments, creditNotes };
    }

    // Filter data based on date range
    const filterByDateRange = (items) => {
        return items.filter(item => {
            const itemDate = item.date || item.invoiceDetails?.date;
            if (!itemDate) return false;

            try {
                // Convert dd-mm-yyyy to comparable format
                const [itemDay, itemMonth, itemYear] = itemDate.split('-');
                const itemDateObj = new Date(`${itemYear}-${itemMonth}-${itemDay}`);

                const [startDay, startMonth, startYear] = dateRange.startDate.split('-');
                const startDateObj = new Date(`${startYear}-${startMonth}-${startDay}`);

                const [endDay, endMonth, endYear] = dateRange.endDate.split('-');
                const endDateObj = new Date(`${endYear}-${endMonth}-${endDay}`);

                return itemDateObj >= startDateObj && itemDateObj <= endDateObj;
            } catch (error) {
                console.error('Error filtering date:', error, 'itemDate:', itemDate);
                return false;
            }
        });
    };

    const filteredData = {
        bills: filterByDateRange(bills),
        payments: filterByDateRange(payments),
        creditNotes: filterByDateRange(creditNotes)
    };

    console.log('Filtered data:', filteredData);
    return filteredData;
}

function setupPaymentDialog() {
    // Add payment button
    document.getElementById('add-payment-btn').addEventListener('click', addNewPayment);

    // Search functionality
    document.getElementById('payment-search').addEventListener('input', function () {
        loadPaymentsAndCreditNotesWithFilters();
    });

    // Sort order toggle
    document.getElementById('sort-order-btn').addEventListener('click', function () {
        const currentOrder = this.dataset.order;
        const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
        this.dataset.order = newOrder;
        this.querySelector('.material-icons').textContent = newOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
        loadPaymentsAndCreditNotesWithFilters();
    });

    // Sort by select
    document.getElementById('sort-by-select').addEventListener('change', function () {
        loadPaymentsAndCreditNotesWithFilters();
    });

    // Statement period
    document.getElementById('statement-period').addEventListener('change', function () {
        loadPaymentsAndCreditNotesWithFilters();
    });

    // Setup edit and delete button event delegation
    document.getElementById('payments-tbody').addEventListener('click', function (e) {
        const editBtn = e.target.closest('.edit-payment-btn');
        const deleteBtn = e.target.closest('.delete-payment-btn');

        if (editBtn) {
            const recordId = editBtn.dataset.id;
            const recordType = editBtn.dataset.type;
            editPaymentRecord(recordId, recordType);
        }

        if (deleteBtn) {
            const recordId = deleteBtn.dataset.id;
            const recordType = deleteBtn.dataset.type;
            deletePaymentRecordConfirm(recordId, recordType);
        }
    });
}

async function deletePaymentRecordConfirm(recordId, recordType = null) {
    const type = recordType || currentPaymentType;
    const typeLabel = type === 'payment' ? 'Payment' : 'Credit Note';

    const shouldDelete = await showConfirm(`Are you sure you want to delete this ${typeLabel.toLowerCase()}?`);
    if (shouldDelete) {
        try {
            await deletePaymentRecord(recordId, type);
            loadPaymentsAndCreditNotesWithFilters();
            showNotification(`${typeLabel} deleted successfully`, 'success');
        } catch (error) {
            console.error('Error deleting record:', error);
            showNotification('Error deleting record. Please try again.', 'error');
        }
    }
}

// Load payments with filters
async function loadPaymentsAndCreditNotesWithFilters() {
    if (!currentPaymentCustomer) return;

    const filters = {
        search: document.getElementById('payment-search').value,
        sortBy: document.getElementById('sort-by-select').value,
        sortOrder: document.getElementById('sort-order-btn').dataset.order,
        period: document.getElementById('statement-period').value
    };

    const payments = await getCustomerPayments(
        currentPaymentCustomer.name,
        currentPaymentCustomer.gstin,
        currentPaymentType,
        filters
    );

    displayPayments(payments);
}

async function addNewPayment() {
    if (!currentPaymentCustomer) return;

    // Handle payment method (including custom methods)
    const methodSelect = document.getElementById('payment-method');
    let finalMethod = methodSelect.value;

    if (finalMethod === 'Other') {
        const customMethod = document.getElementById('custom-payment-method').value.trim();
        if (!customMethod) {
            showNotification('Please enter custom payment method name');
            return;
        }
        finalMethod = customMethod;
        await saveCustomPaymentMethod(customMethod);
        await loadCustomPaymentMethods(); // Refresh dropdown
    }

    const date = document.getElementById('payment-date').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const notes = document.getElementById('payment-notes').value;

    // Different validation for Payments vs Credit Notes
    if (!date || !finalMethod || isNaN(amount)) {
        showNotification('Please fill all required fields with valid values', 'error');
        return;
    }

    // Payment-specific validation (only positive)
    if (currentPaymentType === 'payment' && amount <= 0) {
        showNotification('Payment amount must be greater than 0', 'error');
        return;
    }

    // Credit Note validation (any non-zero value)
    if (currentPaymentType === 'credit-note' && amount === 0) {
        showNotification('Credit Note amount cannot be zero', 'error');
        return;
    }

    // If we're in edit mode, update instead of add new
    if (currentlyEditingPaymentId) {
        await updatePaymentRecord();
        return;
    }

    const paymentData = {
        date,
        method: finalMethod, // Use the final method (could be custom)
        amount,
        notes
    };

    try {
        await savePaymentRecord(
            currentPaymentCustomer.name,
            currentPaymentCustomer.gstin,
            paymentData,
            currentPaymentType
        );

        // Clear form
        resetPaymentForm();

        // Reload list
        loadPaymentsAndCreditNotesWithFilters();

        // Show success message
        const typeLabel = currentPaymentType === 'payment' ? 'Payment' : 'Credit Note';
        showNotification(`${typeLabel} added successfully!`, 'success');

    } catch (error) {
        console.error('Error adding payment:', error);
        showNotification('Error adding payment. Please try again.', 'error');
    }
}
// Profit Calculation System - Complete Recalculation
let missingPurchaseItems = [];
let isProfitViewActive = false;
let originalRates = new Map();

// Toggle profit view
function toggleProfitView() {
    if (isProfitViewActive) {
        restoreOriginalRates();
    } else {
        calculateProfit();
    }
}

// Update the profit button in sidebar to use toggle:
// Change: onclick="calculateProfit()" to onclick="toggleProfitView()"
// Main profit calculation function
async function calculateProfit() {
    try {
        // Get all items from current bill
        const items = getCurrentBillItems();

        if (items.length === 0) {
            showNotification('No items in current bill to calculate profit');
            return;
        }

        // Check for items with missing purchase prices
        missingPurchaseItems = await findItemsWithMissingPurchasePrices(items);

        if (missingPurchaseItems.length > 0) {
            // Show dialog for missing purchase prices
            showPurchasePriceDialog(missingPurchaseItems);
        } else {
            // All purchase prices available, calculate profit directly
            applyProfitRecalculation(items);
        }
    } catch (error) {
        console.error('Error calculating profit:', error);
        showNotification('Error calculating profit. Please try again.');
    }
}

// Get all items from current bill
function getCurrentBillItems() {
    const items = [];
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');

    rows.forEach(row => {
        const cells = row.children;
        const particularsDiv = cells[1];
        const itemName = particularsDiv.querySelector('.itemNameClass')?.textContent.trim() || '';

        if (itemName) {
            const rate = parseFloat(cells[4].textContent) || 0;
            const quantity = parseFloat(cells[2].textContent) || 0;
            const amount = parseFloat(cells[5].textContent) || 0;

            items.push({
                id: row.getAttribute('data-id'),
                itemName: itemName,
                currentRate: rate,
                quantity: quantity,
                amount: amount,
                row: row
            });
        }
    });

    return items;
}

// Find items with missing purchase prices
async function findItemsWithMissingPurchasePrices(items) {
    const missingItems = [];

    for (const item of items) {
        const savedItem = await getFromDB('savedItems', item.itemName);

        if (!savedItem || !savedItem.purchaseRate || savedItem.purchaseRate <= 0) {
            missingItems.push({
                ...item,
                purchaseRate: savedItem?.purchaseRate || 0
            });
        }
    }

    return missingItems;
}

// Show purchase price dialog
function showPurchasePriceDialog(missingItems) {
    const itemsList = document.getElementById('purchase-price-items-list');
    itemsList.innerHTML = '';

    missingItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'purchase-price-item';
        itemElement.innerHTML = `
            <div class="purchase-price-item-name">${item.itemName}</div>
            <div class="current-rate">Selling: ₹${item.currentRate.toFixed(2)}</div>
            <div class="purchase-price-input-group">
                <label>Purchase:</label>
                <input type="number" 
                       class="purchase-price-input" 
                       data-item-id="${item.id}"
                       value="${item.purchaseRate || ''}" 
                       placeholder="0.00" 
                       step="0.01" 
                       min="0">
            </div>
        `;
        itemsList.appendChild(itemElement);
    });

    document.getElementById('purchase-price-dialog').classList.add('active');
}

// Close purchase price dialog
function closePurchasePriceDialog() {
    document.getElementById('purchase-price-dialog').classList.remove('active');
    missingPurchaseItems = [];
}

// Store original rates for restoration
function storeOriginalRates() {
    originalRates.clear();
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');

    rows.forEach(row => {
        const itemId = row.getAttribute('data-id');
        const currentRate = parseFloat(row.children[4].textContent) || 0;
        originalRates.set(itemId, currentRate);
    });
}


// Sync restore to other tables with error handling
function syncRestoreToOtherTables(itemId, originalRate, originalAmount) {
    try {
        // Update copyListManual table
        const copyRow = document.querySelector(`#copyListManual tr[data-id="${itemId}"]`);
        if (copyRow) {
            const cells = copyRow.children;
            cells[4].textContent = originalRate.toFixed(2);
            cells[5].textContent = originalAmount.toFixed(2);
        }

        // Update GST table if in GST mode
        if (isGSTMode) {
            const gstRow = document.querySelector(`#gstCopyListManual tr[data-id="${itemId}"]`);
            if (gstRow) {
                const cells = gstRow.children;
                cells[5].textContent = originalRate.toFixed(2);
                cells[6].textContent = originalAmount.toFixed(2);
            }
        }
    } catch (error) {
        console.error('Error syncing restore to other tables:', error);
    }
}

// Detect and restore profit state after page refresh
function restoreProfitStateAfterRefresh() {
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');
    let needsRestoration = false;

    // Check if any rows are in profit display mode (have profit HTML)
    rows.forEach(row => {
        const rateCell = row.children[4];
        const amountCell = row.children[5];

        // Check if cells contain profit display HTML instead of plain numbers
        const hasProfitHTML = rateCell.innerHTML.includes('profit-rate-display') ||
            rateCell.innerHTML.includes('profit-rate') ||
            amountCell.innerHTML.includes('profit-amount-display') ||
            amountCell.innerHTML.includes('profit-amount');

        // Check if cells contain NaN or invalid values
        const rateValue = parseFloat(rateCell.textContent);
        const amountValue = parseFloat(amountCell.textContent);
        const hasInvalidValues = isNaN(rateValue) || isNaN(amountValue);

        if (hasProfitHTML || hasInvalidValues) {
            needsRestoration = true;
        }
    });

    // Also check the total amount display
    const totalAmountElement = document.getElementById('createTotalAmountManual');
    if (totalAmountElement && totalAmountElement.innerHTML.includes('profit-total-display')) {
        needsRestoration = true;
    }

    if (needsRestoration) {
        console.log('Page was refreshed while in profit view. Restoring normal state...');
        const restoredCount = restoreOriginalRates();

        // Show a subtle notification
        if (restoredCount > 0) {
            console.log(`Successfully restored ${restoredCount} items after page refresh`);
        }
    }

    return needsRestoration;
}

// Enhanced restore function to handle both manual restore and page refresh
function restoreOriginalRates() {
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');
    let restoredCount = 0;

    rows.forEach(row => {
        const cells = row.children;

        // Method 1: Try to get original rate from data attribute
        let originalRate = parseFloat(row.getAttribute('data-original-rate'));

        // Method 2: If no original rate, try to get from data-rate attribute
        if (isNaN(originalRate) || originalRate <= 0) {
            originalRate = parseFloat(row.getAttribute('data-rate'));
        }

        // Method 3: If still no rate, try to parse from cell content
        if (isNaN(originalRate) || originalRate <= 0) {
            const rateText = cells[4].textContent || cells[4].innerText;
            originalRate = parseFloat(rateText.replace(/[^\d.]/g, ''));
        }

        // Method 4: If all methods fail, use a default safe value
        if (isNaN(originalRate) || originalRate <= 0) {
            originalRate = 1; // Safe default to avoid NaN
        }

        // Calculate final quantity and amount
        const finalQuantity = getFinalQuantity(row);
        const originalAmount = finalQuantity * originalRate;

        // Restore simple numeric display
        cells[4].textContent = originalRate.toFixed(2);
        cells[5].textContent = originalAmount.toFixed(2);

        // Ensure data attributes are correct and clean
        row.setAttribute('data-rate', originalRate.toFixed(8));
        row.setAttribute('data-amount', originalAmount.toFixed(8));

        // Remove all profit-specific attributes
        row.removeAttribute('data-profit-rate');
        row.removeAttribute('data-profit-amount');
        row.removeAttribute('data-purchase-rate');
        row.removeAttribute('data-original-rate');

        // Sync to other tables
        syncRestoreToOtherTables(row.getAttribute('data-id'), originalRate, originalAmount);

        restoredCount++;
    });

    // Restore original totals
    updateTotal();

    // Update UI state
    isProfitViewActive = false;
    updateProfitButtonState(false);

    console.log(`Restored ${restoredCount} items from profit view`);
    return restoredCount;
}


// Robust final quantity calculation
function getFinalQuantity(row) {
    try {
        const dimensionType = row.getAttribute('data-dimension-type') || 'none';
        const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || row.children[2].textContent) || 0;
        let finalQuantity = originalQuantity;

        if (dimensionType !== 'none' && dimensionType !== 'dozen') {
            const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
            const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
            finalQuantity = originalQuantity * (calculatedArea || 1);
        } else if (dimensionType === 'dozen') {
            finalQuantity = originalQuantity / 12;
        }

        return finalQuantity > 0 ? finalQuantity : 1; // Never return 0
    } catch (error) {
        console.error('Error calculating final quantity:', error);
        return 1; // Safe fallback
    }
}
// Update individual item with profit calculation
function updateItemWithProfitCalculation(row, profitRate, purchaseRate, originalRate) {
    const cells = row.children;
    const finalQuantity = getFinalQuantity(row);

    // Update rate cell to show profit
    cells[4].innerHTML = `
        <div class="profit-rate-display">
            <div class="original-rate">₹${originalRate.toFixed(2)}</div>
            <div class="profit-rate">Profit: ₹${profitRate.toFixed(2)}</div>
            <div class="purchase-rate">Cost: ₹${purchaseRate.toFixed(2)}</div>
        </div>
    `;

    // Calculate and update profit amount
    const profitAmount = finalQuantity * profitRate;
    cells[5].innerHTML = `
        <div class="profit-amount-display">
            <div class="profit-amount">₹${profitAmount.toFixed(2)}</div>
            <div class="profit-label">Profit</div>
        </div>
    `;

    // Update data attributes for profit mode
    row.setAttribute('data-profit-rate', profitRate.toFixed(8));
    row.setAttribute('data-profit-amount', profitAmount.toFixed(8));
    row.setAttribute('data-original-rate', originalRate.toFixed(8));
    row.setAttribute('data-purchase-rate', purchaseRate.toFixed(8));

    // Sync to other tables
    syncProfitUpdateToOtherTables(row.getAttribute('data-id'), profitRate, profitAmount, originalRate, purchaseRate);
}

// Update table totals with profit amounts
function updateTableTotalsWithProfit() {
    // Calculate total profit from all items
    const rows = document.querySelectorAll('#createListManual tbody tr[data-id]');
    let totalProfit = 0;

    rows.forEach(row => {
        const profitAmount = parseFloat(row.getAttribute('data-profit-amount') || 0);
        totalProfit += profitAmount;
    });

    // Apply discount to profit if discount exists
    let finalProfit = totalProfit;
    if (discountPercent > 0) {
        const discountAmount = totalProfit * (discountPercent / 100);
        finalProfit = totalProfit - discountAmount;
    }

    // Update total display
    const totalAmountElement = document.getElementById('createTotalAmountManual');
    totalAmountElement.innerHTML = `
        <div class="profit-total-display">
            <div class="total-profit">₹${finalProfit.toFixed(2)}</div>
            <div class="profit-total-label">Total Profit</div>
            ${discountPercent > 0 ? `<div class="profit-discount">After ${discountPercent}% discount</div>` : ''}
        </div>
    `;

    // Update copy table total
    const copyTotalElement = document.getElementById('copyTotalAmount');
    if (copyTotalElement) {
        copyTotalElement.innerHTML = `
            <div class="profit-total-display">
                <div class="total-profit">₹${finalProfit.toFixed(2)}</div>
                <div class="profit-total-label">Total Profit</div>
            </div>
        `;
    }
}

// Update profit button state
function updateProfitButtonState(isActive) {
    const profitBtn = document.querySelector('.settings-btn[onclick="toggleProfitView()"]');
    if (profitBtn) {
        if (isActive) {
            profitBtn.style.backgroundColor = '#27ae60';
            profitBtn.innerHTML = '<span class="material-icons">show_chart</span>PROFIT VIEW ACTIVE';
        } else {
            profitBtn.style.backgroundColor = '';
            profitBtn.innerHTML = '<span class="material-icons">calculate</span>PROFIT CALCULATION';
        }
    }
}

// Apply profit recalculation to all items
async function applyProfitRecalculation(items, manualPurchasePrices = {}) {
    try {
        // Store original rates for restoration
        storeOriginalRates();

        let totalProfit = 0;
        let updatedItems = 0;

        for (const item of items) {
            let purchaseRate = 0;

            // Get purchase rate from manual input or saved item
            if (manualPurchasePrices[item.id]) {
                purchaseRate = manualPurchasePrices[item.id];
            } else {
                const savedItem = await getFromDB('savedItems', item.itemName);
                purchaseRate = savedItem?.purchaseRate || 0;
            }

            if (purchaseRate > 0 && item.currentRate > purchaseRate) {
                // Calculate profit rate (selling rate - purchase rate)
                const profitRate = item.currentRate - purchaseRate;

                // Update the item with profit calculation
                updateItemWithProfitCalculation(item.row, profitRate, purchaseRate, item.currentRate);
                totalProfit += profitRate * getFinalQuantity(item.row);
                updatedItems++;
            } else if (purchaseRate > 0) {
                // No profit or loss
                updateItemWithProfitCalculation(item.row, 0, purchaseRate, item.currentRate);
            }
        }

        // Update table totals with profit amounts
        updateTableTotalsWithProfit();

        isProfitViewActive = true;

        // Show summary
        if (updatedItems > 0) {
            const profitMessage = `Profit calculation applied to ${updatedItems} items.\nTotal Profit: ₹${totalProfit.toFixed(2)}`;
            console.log(profitMessage);

            // Update profit button to show it's active
            updateProfitButtonState(true);
        } else {
            showNotification('No profit calculation applied. Check if purchase prices are set correctly.');
        }

    } catch (error) {
        console.error('Error applying profit calculation:', error);
        showNotification('Error applying profit calculation. Please try again.');
    }
}
async function updateSavedItemsWithPurchasePrices(purchasePrices, items) {
    // Add safety check for items
    if (!items || !Array.isArray(items)) {
        console.error('Invalid items array:', items);
        return;
    }

    // Additional check for empty array
    if (items.length === 0) {
        console.warn('No items to update with purchase prices');
        return;
    }

    for (const item of items) {
        if (purchasePrices[item.id]) {
            const savedItem = await getFromDB('savedItems', item.itemName);

            if (savedItem) {
                // Update existing item
                savedItem.purchaseRate = parseFloat(purchasePrices[item.id]);
                await setInDB('savedItems', item.itemName, savedItem);
            } else {
                // Create new saved item with purchase rate
                const newItem = {
                    name: item.itemName,
                    purchaseRate: parseFloat(purchasePrices[item.id]),
                    timestamp: Date.now()
                };
                await setInDB('savedItems', item.itemName, newItem);
            }
        }
    }
}
async function applyProfitCalculation() {
    try {
        // Collect all purchase prices from the dialog
        const purchasePriceInputs = document.querySelectorAll('.purchase-price-input');
        const purchasePrices = {};

        let allPricesValid = true;

        purchasePriceInputs.forEach(input => {
            const itemId = input.dataset.itemId;
            const purchaseRate = parseFloat(input.value) || 0;

            if (purchaseRate <= 0) {
                allPricesValid = false;
                input.style.borderColor = '#e74c3c';
            } else {
                purchasePrices[itemId] = purchaseRate;
                input.style.borderColor = '';
            }
        });

        if (!allPricesValid) {
            showNotification('Please enter valid purchase prices for all items (greater than 0)');
            return;
        }

        // === FIX: Get the items again to ensure they're available ===
        const items = getCurrentBillItems();

        if (!items || items.length === 0) {
            showNotification('No items found to calculate profit');
            return;
        }

        // Update saved items with purchase prices
        await updateSavedItemsWithPurchasePrices(purchasePrices, items);

        // Get all items and apply profit recalculation
        applyProfitRecalculation(items, purchasePrices);

        closePurchasePriceDialog();

    } catch (error) {
        console.error('Error applying profit calculation:', error);
        showNotification('Error applying profit calculation. Please try again.');
    }
}

// Apply profit calculation to all items
async function applyProfitToAllItems(items, manualPurchasePrices = {}) {
    let totalProfit = 0;
    let updatedItems = 0;

    for (const item of items) {
        let purchaseRate = 0;

        // Get purchase rate from manual input or saved item
        if (manualPurchasePrices[item.id]) {
            purchaseRate = manualPurchasePrices[item.id];
        } else {
            const savedItem = await getFromDB('savedItems', item.itemName);
            purchaseRate = savedItem?.purchaseRate || 0;
        }

        if (purchaseRate > 0) {
            // Calculate profit rate (selling rate - purchase rate)
            const profitRate = item.currentRate - purchaseRate;

            if (profitRate > 0) {
                // Update the item rate with profit calculation
                updateItemRateWithProfit(item.row, profitRate, purchaseRate);
                totalProfit += profitRate * item.quantity;
                updatedItems++;
            }
        }
    }

    // Show summary
    if (updatedItems > 0) {
        const profitMessage = `Profit calculation applied to ${updatedItems} items.\nTotal Profit: ₹${totalProfit.toFixed(2)}`;
        console.log(profitMessage);

        // Optional: Show success message
        showNotification(profitMessage);
    } else {
        showNotification('No profit calculation applied. Check if purchase prices are set correctly.');
    }
}

// Update individual item rate with profit calculation
function updateItemRateWithProfit(row, profitRate, purchaseRate) {
    const cells = row.children;
    const currentRate = parseFloat(cells[4].textContent) || 0;

    // Calculate new rate based on desired profit
    const newRate = purchaseRate + profitRate;

    // Update rate cell
    cells[4].textContent = newRate.toFixed(2);

    // Recalculate amount based on dimension type
    const dimensionType = row.getAttribute('data-dimension-type') || 'none';
    const originalQuantity = parseFloat(row.getAttribute('data-original-quantity') || cells[2].textContent);
    let finalQuantity = originalQuantity;

    if (dimensionType !== 'none' && dimensionType !== 'dozen') {
        const dimensionValues = JSON.parse(row.getAttribute('data-dimension-values') || '[0,0,0]');
        const calculatedArea = calculateAreaFromDimensions(dimensionType, dimensionValues);
        finalQuantity = originalQuantity * calculatedArea;
    } else if (dimensionType === 'dozen') {
        finalQuantity = originalQuantity / 12;
    }

    // Update amount
    const newAmount = finalQuantity * newRate;
    cells[5].textContent = newAmount.toFixed(2);

    // Update data attributes
    row.setAttribute('data-rate', newRate.toFixed(8));
    row.setAttribute('data-amount', newAmount.toFixed(8));

    // Sync to other tables
    syncProfitUpdateToOtherTables(row.getAttribute('data-id'), newRate, newAmount);
}

// Sync profit update to other tables
function syncProfitUpdateToOtherTables(itemId, profitRate, profitAmount, originalRate, purchaseRate) {
    // Update copyListManual table
    const copyRow = document.querySelector(`#copyListManual tr[data-id="${itemId}"]`);
    if (copyRow) {
        const cells = copyRow.children;
        cells[4].innerHTML = `
            <div class="profit-rate-display">
                <div class="original-rate">₹${originalRate.toFixed(2)}</div>
                <div class="profit-rate">Profit: ₹${profitRate.toFixed(2)}</div>
            </div>
        `;
        cells[5].innerHTML = `
            <div class="profit-amount-display">
                <div class="profit-amount">₹${profitAmount.toFixed(2)}</div>
                <div class="profit-label">Profit</div>
            </div>
        `;
    }

    // Update GST table if in GST mode
    if (isGSTMode) {
        const gstRow = document.querySelector(`#gstCopyListManual tr[data-id="${itemId}"]`);
        if (gstRow) {
            const cells = gstRow.children;
            cells[5].innerHTML = `
                <div class="profit-rate-display">
                    <div class="original-rate">₹${originalRate.toFixed(2)}</div>
                    <div class="profit-rate">Profit: ₹${profitRate.toFixed(2)}</div>
                </div>
            `;
            cells[6].innerHTML = `
                <div class="profit-amount-display">
                    <div class="profit-amount">₹${profitAmount.toFixed(2)}</div>
                    <div class="profit-label">Profit</div>
                </div>
            `;
        }
    }
}

// Add event listeners for purchase price dialog
document.addEventListener('DOMContentLoaded', function () {
    // Close purchase price dialog
    document.getElementById('close-purchase-dialog').addEventListener('click', closePurchasePriceDialog);

    // Close dialog when clicking outside
    document.getElementById('purchase-price-dialog').addEventListener('click', function (e) {
        if (e.target === this) closePurchasePriceDialog();
    });

    // Validate purchase price inputs on change
    document.addEventListener('input', function (e) {
        if (e.target.classList.contains('purchase-price-input')) {
            const value = parseFloat(e.target.value) || 0;
            if (value > 0) {
                e.target.style.borderColor = '';
            }
        }
    });
});

function deleteCurrentTerms() {
    if (window.currentEditingTermsDiv && confirm('Are you sure you want to delete these terms?')) {
        window.currentEditingTermsDiv.remove();
        closeTermsListModal();
        // Save immediately after deletion
        saveToLocalStorage();
        showNotification('Terms deleted successfully', 'success');
    }
}

function openTermsListModal() {
    toggleSettingsSidebar();
    // Reset editing state
    window.currentEditingTermsDiv = null;

    // Hide delete button for new terms
    const deleteBtn = document.getElementById('delete-terms-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Reset form
    termsListItems = [];
    termsListType = 'ul';
    termsListStyle = 'disc';

    document.getElementById('terms-heading').value = '';
    document.getElementById('terms-list-type').value = 'ul';
    updateListStyleOptions();
    document.getElementById('terms-items-container').innerHTML = '';

    // Set modal title for new terms
    document.getElementById('section-modal-title').textContent = 'Create Terms & Conditions';
    document.getElementById('save-section-btn').textContent = 'Add Terms';

    // Add first empty item
    addTermsListItem();

    updateTermsPreview();
    document.getElementById('terms-list-modal').style.display = 'block';
}

function closeTermsListModal() {
    document.getElementById('terms-list-modal').style.display = 'none';
    // Reset editing state
    window.currentEditingTermsDiv = null;
    // Hide delete button
    const deleteBtn = document.getElementById('delete-terms-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    // Reset modal title
    document.getElementById('section-modal-title').textContent = 'Create Terms & Conditions';
    document.getElementById('save-section-btn').textContent = 'Add Terms';
}

function handleListTypeChange() {
    termsListType = document.getElementById('terms-list-type').value;
    updateListStyleOptions();
    updateTermsPreview();
}

function updateListStyleOptions() {
    const styleSelect = document.getElementById('terms-list-style');
    styleSelect.innerHTML = '';

    const styles = termsListType === 'ul'
        ? [
            { value: 'disc', text: '● Disc' },
            { value: 'circle', text: '○ Circle' },
            { value: 'square', text: '■ Square' },
            { value: 'none', text: 'None' }
        ]
        : [
            { value: 'decimal', text: '1. Decimal' },
            { value: 'decimal-leading-zero', text: '01. Decimal Zero' },
            { value: 'lower-roman', text: 'i. Lower Roman' },
            { value: 'upper-roman', text: 'I. Upper Roman' },
            { value: 'lower-alpha', text: 'a. Lower Alpha' },
            { value: 'upper-alpha', text: 'A. Upper Alpha' },
            { value: 'none', text: 'None' }
        ];

    styles.forEach(style => {
        const option = document.createElement('option');
        option.value = style.value;
        option.textContent = style.text;
        styleSelect.appendChild(option);
    });

    styleSelect.value = termsListType === 'ul' ? 'disc' : 'decimal';
    termsListStyle = styleSelect.value;
}

function editExistingTerms(termsDiv) {
    // Store reference to the terms div being edited
    window.currentEditingTermsDiv = termsDiv;

    // Extract data from existing terms
    const heading = termsDiv.querySelector('h4')?.textContent || '';
    const listElement = termsDiv.querySelector('ul, ol');
    const listType = listElement?.tagName.toLowerCase() || 'ul';
    const listStyle = listElement?.style.listStyleType || (listType === 'ul' ? 'disc' : 'decimal');

    // Extract list items
    const listItems = Array.from(termsDiv.querySelectorAll('li')).map(li => li.textContent);

    // Set modal title and show delete button
    document.getElementById('section-modal-title').textContent = 'Edit Terms & Conditions';
    document.getElementById('save-section-btn').textContent = 'Update Terms';

    // Show delete button
    const deleteBtn = document.getElementById('delete-terms-btn');
    if (deleteBtn) deleteBtn.style.display = 'inline-block';

    // Fill modal fields
    document.getElementById('terms-heading').value = heading;
    document.getElementById('terms-list-type').value = listType;

    // Update list style options and set value
    updateListStyleOptions();
    document.getElementById('terms-list-style').value = listStyle;

    // Clear and refill items container
    const itemsContainer = document.getElementById('terms-items-container');
    itemsContainer.innerHTML = '';
    termsListItems = [];

    listItems.forEach((itemText, index) => {
        const itemId = 'terms-item-' + Date.now() + '-' + index;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'terms-item';
        itemDiv.innerHTML = `
            <input type="text" 
                   id="${itemId}" 
                   value="${itemText}"
                   placeholder="Enter list item text..." 
                   oninput="updateTermsListItem('${itemId}', this.value)"
                   onblur="updateTermsPreview()">
            <button type="button" onclick="removeTermsListItem('${itemId}')" class="remove-terms-item">
                <i class="material-icons">delete</i>
            </button>
        `;
        itemsContainer.appendChild(itemDiv);
        termsListItems.push({ id: itemId, text: itemText });
    });

    // If no items, add one empty
    if (termsListItems.length === 0) {
        addTermsListItem();
    }

    updateTermsPreview();
    document.getElementById('terms-list-modal').style.display = 'block';
}

function addTermsListItem() {
    const container = document.getElementById('terms-items-container');
    const itemId = 'terms-item-' + Date.now();

    const itemDiv = document.createElement('div');
    itemDiv.className = 'terms-item';
    itemDiv.innerHTML = `
        <input type="text" 
               id="${itemId}" 
               placeholder="Enter list item text..." 
               oninput="updateTermsListItem('${itemId}', this.value)"
               onblur="updateTermsPreview()">
        <button type="button" onclick="removeTermsListItem('${itemId}')" class="remove-terms-item">
            <i class="material-icons">delete</i>
        </button>
    `;

    container.appendChild(itemDiv);
    termsListItems.push({ id: itemId, text: '' });

    // Focus on the new input
    setTimeout(() => document.getElementById(itemId).focus(), 100);
}

function removeTermsListItem(itemId) {
    termsListItems = termsListItems.filter(item => item.id !== itemId);
    document.querySelector(`#terms-items-container [id="${itemId}"]`).closest('.terms-item').remove();
    updateTermsPreview();
}

function updateTermsListItem(itemId, text) {
    const item = termsListItems.find(item => item.id === itemId);
    if (item) {
        item.text = text;
    }
}

function updateTermsPreview() {
    const preview = document.getElementById('terms-preview');
    const heading = document.getElementById('terms-heading').value;
    termsListStyle = document.getElementById('terms-list-style').value;

    let previewHTML = '';

    if (heading) {
        previewHTML += `<h4>${heading}</h4>`;
    }

    // Only show list if there are items with text
    const validItems = termsListItems.filter(item => item.text.trim());

    if (validItems.length > 0) {
        const listTag = termsListType;
        previewHTML += `<${listTag} style="list-style-type: ${termsListStyle}">`;
        validItems.forEach(item => {
            previewHTML += `<li>${item.text}</li>`;
        });
        previewHTML += `</${listTag}>`;
    } else {
        previewHTML += '<p style="color: #666; font-style: italic;">No items to preview</p>';
    }

    preview.innerHTML = previewHTML;
}

function saveTermsList() {
    const heading = document.getElementById('terms-heading').value.trim();
    const validItems = termsListItems.filter(item => item.text.trim());

    if (!heading) {
        showNotification('Please enter a heading', 'error');
        return;
    }

    if (validItems.length === 0) {
        showNotification('Please add at least one list item', 'error');
        return;
    }

    let listContainer;

    if (window.currentEditingTermsDiv) {
        // Editing existing terms - update the existing div
        listContainer = window.currentEditingTermsDiv;
    } else {
        // Creating new terms - create new div
        listContainer = document.createElement('div');
        listContainer.className = 'bill-footer-list';
        listContainer.setAttribute('data-editable', 'true');
    }

    let listHTML = `<h4>${heading}</h4>`;

    const listTag = termsListType;
    listHTML += `<${listTag} style="list-style-type: ${termsListStyle}">`;
    validItems.forEach(item => {
        listHTML += `<li>${item.text}</li>`;
    });
    listHTML += `</${listTag}>`;

    listContainer.innerHTML = listHTML;

    // Only insert if it's a new terms div
    if (!window.currentEditingTermsDiv) {
        const billTotalTable = document.getElementById('bill-total-table');
        const gstBillTotalsTable = document.getElementById('gst-bill-totals-table');

        if (billTotalTable && !isGSTMode) {
            billTotalTable.parentNode.insertBefore(listContainer, billTotalTable.nextSibling);
        } else if (gstBillTotalsTable && isGSTMode) {
            gstBillTotalsTable.parentNode.insertBefore(listContainer, gstBillTotalsTable.nextSibling);
        } else {
            const listContainerParent = document.querySelector('.list-of-items');
            if (listContainerParent) {
                listContainerParent.appendChild(listContainer);
            }
        }
    }

    closeTermsListModal();
    showNotification(window.currentEditingTermsDiv ? 'Terms updated successfully!' : 'Terms added successfully!', 'success');

    // Save to localStorage to persist after refresh
    saveToLocalStorage();
}

function openColumnDialog() {
    // Set checkboxes based on current column visibility
    document.getElementById('colSrNo').checked = isColumnVisible(0);
    document.getElementById('colQty').checked = isColumnVisible(2);
    document.getElementById('colUnit').checked = isColumnVisible(3);
    document.getElementById('colRate').checked = isColumnVisible(4);
    document.getElementById('colAmt').checked = isColumnVisible(5);
    document.getElementById('colTotal').checked = isTotalVisible();

    document.getElementById('columnDialog').style.display = 'flex';
}

// Helper function to check if a column is currently visible
function isColumnVisible(columnIndex) {
    const table = document.getElementById('createListManual');
    if (table) {
        const headers = table.querySelectorAll('thead th');
        if (headers[columnIndex]) {
            return headers[columnIndex].style.display !== 'none';
        }
    }
    return true; // Default to visible if not found
}

// Helper function to check if total section is visible
function isTotalVisible() {
    const totalSection = document.getElementById('bill-total-table');
    return totalSection ? totalSection.style.display !== 'none' : true;
}

function closeColumnDialog() {
    document.getElementById('columnDialog').style.display = 'none';
}

function resetColumnVisibility() {
    const columnIds = ['colSrNo', 'colQty', 'colUnit', 'colRate', 'colAmt', 'colTotal'];
    columnIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = true;
    });
    // Apply changes immediately
    applyColumnVisibility();
}

function applyColumnVisibility() {
    const columns = {
        'colSrNo': 0,  // Column index for SR NO
        'colQty': 2,   // Column index for QTY
        'colUnit': 3,  // Column index for UNIT
        'colRate': 4,  // Column index for RATE
        'colAmt': 5,   // Column index for AMT
        'colTotal': 'total' // Special case for total table
    };

    // Tables to sync
    const inputTable = document.getElementById('createListManual'); // Input table
    const previewTable = document.getElementById('copyListManual'); // Preview table
    const totalSection = document.getElementById('bill-total-table'); // Total table

    // First, count visible columns to update section row colspan
    let visibleColumnCount = 7; // Start with all columns (including Actions)

    // Subtract hidden columns (excluding Actions column)
    for (const [checkboxId, columnIndex] of Object.entries(columns)) {
        if (columnIndex !== 'total' && columnIndex !== 6) { // Skip total and Actions
            const isVisible = document.getElementById(checkboxId).checked;
            if (!isVisible) {
                visibleColumnCount--;
            }
        }
    }

    // Check if Amount column is visible
    const isAmtVisible = document.getElementById('colAmt').checked;

    // Hide/show table columns based on checkboxes for BOTH tables
    for (const [checkboxId, columnIndex] of Object.entries(columns)) {
        const isVisible = document.getElementById(checkboxId).checked;

        if (columnIndex === 'total') {
            // Handle total table section
            if (totalSection) {
                totalSection.style.display = isVisible ? '' : 'none';
            }
        } else {
            // Handle both input table and preview table
            const tables = [inputTable, previewTable];

            tables.forEach(table => {
                if (table) {
                    // Hide headers (skip Actions column for input table)
                    const headers = table.querySelectorAll('thead th');
                    if (headers[columnIndex] && columnIndex !== 6) { // Skip Actions column
                        headers[columnIndex].style.display = isVisible ? '' : 'none';
                    }

                    // Hide cells in tbody (skip Actions column for input table)
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        // Skip section rows and total rows when hiding regular columns
                        if (!row.classList.contains('section-row') && !row.classList.contains('section-total-row')) {
                            const cells = row.querySelectorAll('td');
                            if (cells[columnIndex] && columnIndex !== 6) { // Skip Actions column
                                cells[columnIndex].style.display = isVisible ? '' : 'none';
                            }
                        }
                    });
                }
            });
        }
    }

    // Add padding to Particulars column when SR NO is hidden
    const srNoHidden = !document.getElementById('colSrNo').checked;
    const particularsHeaders = document.querySelectorAll('thead th:nth-child(2)');
    const particularsCells = document.querySelectorAll('tbody td:nth-child(2)');

    if (srNoHidden) {
        particularsHeaders.forEach(header => header.style.paddingLeft = '25px');
        particularsCells.forEach(cell => cell.style.paddingLeft = '25px');
    } else {
        particularsHeaders.forEach(header => header.style.paddingLeft = '');
        particularsCells.forEach(cell => cell.style.paddingLeft = '');
    }

    // Update section row colspan to match visible column count
    const sectionRows = document.querySelectorAll('.section-row');
    sectionRows.forEach(row => {
        row.querySelector('td').colSpan = visibleColumnCount;
    });

    // FIX: Update Section Total Rows visibility and colspan
    const sectionTotalRows = document.querySelectorAll('.section-total-row');
    sectionTotalRows.forEach(row => {
        // 1. Hide entire row if Amount column is hidden
        if (!isAmtVisible) {
            row.style.display = 'none';
        } else {
            row.style.display = ''; // Reset display to default (table-row)

            // 2. If visible, calculate colspan
            const cells = row.children;
            if (cells.length > 0) {
                const table = row.closest('table');
                let adjustment = 1; // Default: subtract Amount column

                // Handle the visibility of the extra Action cell
                const actionCell = row.querySelector('.section-total-action-cell');
                if (actionCell) {
                    // Determine if Actions column is hidden in this table
                    let isActionColHidden = false;
                    let actionHeaderIndex = 6; // Default for input table (createListManual)

                    if (table.id === 'gstCopyListManual') actionHeaderIndex = 7;

                    const actionHeader = table.querySelector(`thead th:nth-child(${actionHeaderIndex + 1})`);
                    // If header exists and is hidden, OR header doesn't exist (some views), hide cell
                    if (actionHeader && actionHeader.style.display === 'none') {
                        isActionColHidden = true;
                    } else if (!actionHeader) {
                        // Fallback for tables where action header might be missing/removed in DOM
                        isActionColHidden = true;
                    }

                    if (isActionColHidden) {
                        actionCell.style.display = 'none';
                    } else {
                        actionCell.style.display = 'table-cell';
                        // If action cell is visible, we subtract Amount + Action from colspan
                    }
                }

                // If table has actions column visible (like createListManual or GST view)
                if (table.id === 'createListManual' || table.id === 'gstCopyListManual') {
                    // Check if the row actually HAS an action cell AND it is visible
                    if (cells.length > 2 && actionCell && actionCell.style.display !== 'none') {
                        adjustment = 2; // Subtract Amount + Action
                    }
                } else {
                    // Regular preview table logic (copyListManual)
                    let visibleDataCols = 0;
                    for (let i = 0; i <= 4; i++) { // Check cols 0 to 4
                        const header = table.querySelector(`thead th:nth-child(${i + 1})`);
                        if (header && header.style.display !== 'none') {
                            visibleDataCols++;
                        }
                    }
                    cells[0].colSpan = visibleDataCols;
                    return;
                }

                const newColSpan = Math.max(1, visibleColumnCount - adjustment);
                cells[0].colSpan = newColSpan;
            }
        }
    });

    closeColumnDialog();
}

//new ledger functions
// Custom Payment Method Handler
function handlePaymentMethodChange() {
    const methodSelect = document.getElementById('payment-method');
    const customContainer = document.getElementById('custom-method-container');

    if (methodSelect.value === 'Other') {
        customContainer.style.display = 'block';
    } else {
        customContainer.style.display = 'none';
    }
}

// Save custom payment method to DB
async function saveCustomPaymentMethod(methodName) {
    try {
        const customMethods = await getFromDB('settings', 'customPaymentMethods') || [];
        if (!customMethods.includes(methodName)) {
            customMethods.push(methodName);
            await setInDB('settings', 'customPaymentMethods', customMethods);
        }
    } catch (error) {
        console.error('Error saving custom payment method:', error);
    }
}

// Load custom payment methods
async function loadCustomPaymentMethods() {
    try {
        const customMethods = await getFromDB('settings', 'customPaymentMethods') || [];
        const methodSelect = document.getElementById('payment-method');

        // Remove existing custom methods (except "Other")
        const optionsToRemove = [];
        for (let i = 0; i < methodSelect.options.length; i++) {
            if (methodSelect.options[i].value !== 'Other' &&
                !['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'].includes(methodSelect.options[i].value)) {
                optionsToRemove.push(i);
            }
        }

        // Remove in reverse order to avoid index issues
        optionsToRemove.reverse().forEach(index => {
            methodSelect.remove(index);
        });

        // Add custom methods
        customMethods.forEach(method => {
            const option = document.createElement('option');
            option.value = method;
            option.textContent = method;
            methodSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading custom payment methods:', error);
    }
}

// New Ledger Data Loading Function
async function loadLedgerData(customerName, gstin) {
    if (!customerName) {
        if (currentPaymentCustomer && currentPaymentCustomer.name) {
            customerName = currentPaymentCustomer.name;
            gstin = currentPaymentCustomer.gstin;
        } else {
            console.error('No customer selected for ledger');
            return;
        }
    }

    try {
        const dateRange = getDateRangeForPeriod();
        const financialData = await getCustomerFinancialData(customerName, gstin, dateRange);
        // In loadLedgerData function, update this line:
        const openingBalance = await calculateOpeningBalance(customerName, gstin, dateRange);

        displayUnifiedLedgerTable(financialData, openingBalance, dateRange);
    } catch (error) {
        console.error('Error loading ledger data:', error);
    }
}

// FIX: Correct date comparison for opening balance
async function calculateOpeningBalance(customerName, gstin, dateRange) {
    if (!dateRange) return { amount: 0, type: 'debit', date: 'Opening' };

    try {
        console.log('Calculating opening balance for date range:', dateRange);

        // Get all transactions
        const allPreviousData = await getCustomerFinancialData(customerName, gstin, null);

        let totalDebit = 0;
        let totalCredit = 0;
        let lastTransactionDate = 'Opening';

        // Convert filter start date to comparable format
        const filterStartDate = convertToComparableDate(dateRange.startDate);
        console.log('Filter start date:', dateRange.startDate, 'as:', filterStartDate);

        // Process all transactions and find the latest one before filter
        const allTransactions = [];

        // Add bills
        allPreviousData.bills.forEach(bill => {
            const billDate = bill.date || bill.invoiceDetails?.date;
            if (billDate) {
                let billTotal = 0;

                if (bill.source === 'gst') {
                    billTotal = parseFloat(bill.totals?.grandTotal || 0);
                } else {
                    const subtotal = parseFloat(bill.totalAmount || 0);
                    const discountPercent = bill.taxSettings?.discountPercent || 0;
                    const discountAmount = subtotal * (discountPercent / 100);
                    const gstPercent = bill.taxSettings?.gstPercent || 0;
                    const gstAmount = (subtotal - discountAmount) * (gstPercent / 100);
                    billTotal = subtotal - discountAmount + gstAmount;
                }

                const transactionDate = convertToComparableDate(billDate);
                const isBeforeFilter = transactionDate < filterStartDate;

                allTransactions.push({
                    date: billDate,
                    comparableDate: transactionDate,
                    amount: billTotal,
                    type: 'bill',
                    isBeforeFilter: isBeforeFilter
                });

                console.log('Bill:', billDate, 'Comparable:', transactionDate, 'Before filter:', isBeforeFilter);
            }
        });

        // Add payments
        allPreviousData.payments.forEach(payment => {
            const paymentDate = payment.date;
            if (paymentDate) {
                const paymentAmount = parseFloat(payment.amount);
                const transactionDate = convertToComparableDate(paymentDate);
                const isBeforeFilter = transactionDate < filterStartDate;

                allTransactions.push({
                    date: paymentDate,
                    comparableDate: transactionDate,
                    amount: paymentAmount,
                    type: 'payment',
                    isBeforeFilter: isBeforeFilter
                });

                console.log('Payment:', paymentDate, 'Comparable:', transactionDate, 'Before filter:', isBeforeFilter);
            }
        });

        // Add credit notes
        allPreviousData.creditNotes.forEach(creditNote => {
            const cnDate = creditNote.date;
            if (cnDate) {
                const cnAmount = parseFloat(creditNote.amount);
                const transactionDate = convertToComparableDate(cnDate);
                const isBeforeFilter = transactionDate < filterStartDate;

                allTransactions.push({
                    date: cnDate,
                    comparableDate: transactionDate,
                    amount: cnAmount,
                    type: 'credit-note',
                    isBeforeFilter: isBeforeFilter
                });

                console.log('Credit Note:', cnDate, 'Comparable:', transactionDate, 'Before filter:', isBeforeFilter);
            }
        });

        // Sort all transactions by date (newest first)
        allTransactions.sort((a, b) => b.comparableDate - a.comparableDate);

        console.log('All transactions sorted (newest first):', allTransactions);

        // Find the latest transaction before filter period
        let foundLatest = false;

        for (const transaction of allTransactions) {
            if (transaction.isBeforeFilter) {
                // This is the latest transaction before filter
                if (!foundLatest) {
                    lastTransactionDate = transaction.date;
                    foundLatest = true;
                    console.log('Found latest transaction before filter:', transaction.date);
                }

                // Add to totals
                if (transaction.type === 'bill') {
                    totalDebit += transaction.amount;
                } else {
                    totalCredit += transaction.amount;
                }

                console.log('Included in opening balance:', transaction.date, transaction.amount, transaction.type);
            }
        }

        // CORRECTED LOGIC: Calculate NET balance
        const netBalance = totalDebit - totalCredit;

        console.log('Final opening balance calculation:', {
            totalDebit,
            totalCredit,
            netBalance,
            lastTransactionDate,
            dateRange
        });

        let result = { amount: 0, type: 'debit', date: lastTransactionDate };

        if (netBalance > 0) {
            result = { amount: netBalance, type: 'debit', date: lastTransactionDate };
        } else if (netBalance < 0) {
            result = { amount: Math.abs(netBalance), type: 'credit', date: lastTransactionDate };
        }

        return result;

    } catch (error) {
        console.error('Error calculating opening balance:', error);
        return { amount: 0, type: 'debit', date: 'Opening' };
    }
}



// FIX: Improved date comparison function
function isDateBefore(dateStr, compareDateStr) {
    try {
        const dateObj = convertToComparableDate(dateStr);
        const compareDateObj = convertToComparableDate(compareDateStr);

        return dateObj < compareDateObj;
    } catch (error) {
        console.error('Error comparing dates:', error, dateStr, compareDateStr);
        return false;
    }
}

// FIX: Improved date conversion function
function convertToComparableDate(dateStr) {
    try {
        // Handle dd-mm-yyyy format
        const [day, month, year] = dateStr.split('-');

        // Ensure 2-digit day and month
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');

        // Create date in yyyy-mm-dd format for proper comparison
        return new Date(`${year}-${paddedMonth}-${paddedDay}`);
    } catch (error) {
        console.error('Error converting date:', error, dateStr);
        return new Date(); // Return current date as fallback
    }
}
function displayUnifiedLedgerTable(financialData, openingBalance, dateRange) {
    const tbody = document.getElementById('ledger-tbody');
    tbody.innerHTML = '';

    console.log('Displaying ledger table:', {
        openingBalance,
        billsCount: financialData.bills.length,
        paymentsCount: financialData.payments.length,
        creditNotesCount: financialData.creditNotes.length,
        dateRange
    });

    // CORRECTED: Start with NET opening balance
    let runningBalance = 0;
    if (openingBalance.type === 'debit') {
        runningBalance = openingBalance.amount;  // Positive balance
    } else {
        runningBalance = -openingBalance.amount; // Negative balance
    }

    let totalDebit = 0;
    let totalCredit = 0;

    // INCLUDE OPENING BALANCE IN TOTALS
    if (openingBalance.type === 'debit' && openingBalance.amount > 0) {
        totalDebit += openingBalance.amount;
    } else if (openingBalance.type === 'credit' && openingBalance.amount > 0) {
        totalCredit += openingBalance.amount;
    }

    // Add Opening Balance Row
    const openingRow = document.createElement('tr');
    const openingBalanceDate = openingBalance.date || (dateRange ? getPreviousPeriodEndDate(dateRange.startDate) : 'Opening');

    console.log('Opening balance display:', {
        amount: openingBalance.amount,
        type: openingBalance.type,
        date: openingBalanceDate
    });


    // Show in ONLY ONE column based on net balance
    if (openingBalance.type === 'debit' && openingBalance.amount > 0) {
        openingRow.innerHTML = `
            <td>${openingBalanceDate}</td>
            <td class="bold">Opening Balance</td>
            <td class="right">${openingBalance.amount.toFixed(2)}</td>
            <td class="right"></td>
        `;
    } else if (openingBalance.type === 'credit' && openingBalance.amount > 0) {
        openingRow.innerHTML = `
            <td>${openingBalanceDate}</td>
            <td class="bold">Opening Balance</td>
            <td class="right"></td>
            <td class="right">${openingBalance.amount.toFixed(2)}</td>
        `;
    } else {
        // Zero balance
        openingRow.innerHTML = `
            <td>${openingBalanceDate}</td>
            <td class="bold">Opening Balance</td>
            <td class="right">0.00</td>
            <td class="right"></td>
        `;
    }
    tbody.appendChild(openingRow);

    // Combine and sort all transactions by date
    const allTransactions = [];

    // Add bills as debit transactions
    financialData.bills.forEach(bill => {
        const invoiceNo = bill.source === 'gst' ?
            bill.invoiceDetails?.number : bill.customer?.billNo;
        const amount = bill.source === 'gst' ?
            parseFloat(bill.totals?.grandTotal || 0) :
            calculateRegularBillTotal(bill);

        allTransactions.push({
            date: bill.date || bill.invoiceDetails?.date,
            particulars: `By Sale A/c (Invoice No- ${invoiceNo})`,
            debit: amount,
            credit: 0,
            type: 'bill'
        });
        totalDebit += amount;

        console.log('Added bill transaction:', bill.date, amount);
    });

    // Add payments as credit transactions
    financialData.payments.forEach(payment => {
        const paymentAmount = parseFloat(payment.amount);
        allTransactions.push({
            date: payment.date,
            particulars: `To ${payment.method} A/c${payment.notes ? `<br>${payment.notes}` : ''}`,
            debit: 0,
            credit: paymentAmount,
            type: 'payment'
        });
        totalCredit += paymentAmount;

        console.log('Added payment transaction:', payment.date, paymentAmount);
    });

    // Add credit notes as credit transactions
    financialData.creditNotes.forEach(creditNote => {
        const cnAmount = parseFloat(creditNote.amount);
        allTransactions.push({
            date: creditNote.date,
            particulars: `To ${creditNote.method} A/c (Credit Note)${creditNote.notes ? `<br>${creditNote.notes}` : ''}`,
            debit: 0,
            credit: cnAmount,
            type: 'credit-note'
        });
        totalCredit += cnAmount;

        console.log('Added credit note transaction:', creditNote.date, cnAmount);
    });

    // Sort transactions by date
    allTransactions.sort((a, b) => {
        const dateA = new Date(a.date.split('-').reverse().join('-'));
        const dateB = new Date(b.date.split('-').reverse().join('-'));
        return dateA - dateB;
    });

    console.log('Sorted transactions:', allTransactions);

    // Add transactions to table and calculate running balance
    allTransactions.forEach(transaction => {
        // Update running balance
        runningBalance += transaction.debit - transaction.credit;

        console.log('Processing transaction:', {
            date: transaction.date,
            debit: transaction.debit,
            credit: transaction.credit,
            runningBalance: runningBalance
        });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${transaction.date}</td>
            <td>${transaction.particulars}</td>
            <td class="right">${transaction.debit > 0 ? transaction.debit.toFixed(2) : ''}</td>
            <td class="right">${transaction.credit > 0 ? transaction.credit.toFixed(2) : ''}</td>
        `;
        tbody.appendChild(row);
    });

    // NEW: Calculate net amount for footer
    const netAmount = totalDebit - totalCredit;

    // Determine what to show in Balance Amount and Advance Deposit
    let balanceAmount = 0;
    let advanceDeposit = 0;

    if (netAmount > 0) {
        // Debit > Credit: Show positive balance amount
        balanceAmount = netAmount;
        advanceDeposit = 0;
    } else if (netAmount < 0) {
        // Credit > Debit: Show advance deposit
        balanceAmount = 0;
        advanceDeposit = Math.abs(netAmount);
    } else {
        // Equal: Show zero for both
        balanceAmount = 0;
        advanceDeposit = 0;
    }

    // UPDATE: New footer structure with correct logic
    const tfoot = document.querySelector('.unified-ledger-table tfoot');
    if (tfoot) {
        tfoot.innerHTML = `
            <tr class="total-row highlight">
                <td colspan="2" class="right bold">TOTAL</td>
                <td class="right bold">₹${totalDebit.toFixed(2)}</td>
                <td class="right bold">₹${totalCredit.toFixed(2)}</td>
            </tr>
            <tr class="total-row highlight">
                <td colspan="2" class="right bold">Balance Amount</td>
                <td style="text-align:center;" class="right bold" colspan="2">${balanceAmount > 0 ? `₹${balanceAmount.toFixed(2)}` : '0.00'}</td>
            </tr>
            ${advanceDeposit > 0 ? `
            <tr class="total-row highlight">
                <td colspan="2" class="right bold">Advance Deposit</td>
                <td style="text-align:center;" class="right bold" colspan="2">₹${advanceDeposit.toFixed(2)}</td>
            </tr>
            ` : ''}
            <tr class="closing-balance-row">
                <td id="closing-balance-date">${allTransactions.length > 0 ? allTransactions[allTransactions.length - 1].date : (dateRange ? dateRange.endDate : new Date().toLocaleDateString('en-IN'))}</td>
                <td class="bold">Closing Balance</td>
                <td class="right bold" id="closing-balance-debit">${runningBalance > 0 ? `₹${runningBalance.toFixed(2)}` : ''}</td>
                <td class="right bold" id="closing-balance-credit">${runningBalance < 0 ? `₹${Math.abs(runningBalance).toFixed(2)}` : ''}</td>
            </tr>
        `;
    }

    console.log('Footer calculations:', {
        totalDebit,
        totalCredit,
        netAmount,
        balanceAmount,
        advanceDeposit,
        runningBalance
    });

    console.log('Ledger table display completed with new footer structure');
}

// Helper function to get previous period end date
function getPreviousPeriodEndDate(startDate) {
    try {
        const [day, month, year] = startDate.split('-');
        const dateObj = new Date(`${year}-${month}-${day}`);
        dateObj.setDate(dateObj.getDate() - 1);

        const prevDay = String(dateObj.getDate()).padStart(2, '0');
        const prevMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
        const prevYear = dateObj.getFullYear();

        return `${prevDay}-${prevMonth}-${prevYear}`;
    } catch (error) {
        console.error('Error getting previous period date:', error);
        return 'Opening';
    }
}

// Helper function to calculate regular bill total
function calculateRegularBillTotal(bill) {
    const subtotal = parseFloat(bill.totalAmount || 0);
    const discountPercent = bill.taxSettings?.discountPercent || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const gstPercent = bill.taxSettings?.gstPercent || 0;
    const gstAmount = (subtotal - discountAmount) * (gstPercent / 100);
    return subtotal - discountAmount + gstAmount;
}

// Update the downloadBillAsJson function filename generation
async function downloadBillAsJson(billId, billType, event) {
    if (event) event.stopPropagation();

    try {
        console.group('=== BILL DOWNLOAD DEBUG ===');
        console.log('Bill ID:', billId);
        console.log('Bill Type:', billType);

        // FIX: Determine correct store name based on bill type
        let storeName;
        if (billType === 'restored' || billId.startsWith('restored-bill-')) {
            storeName = 'restoredBills';
        } else {
            storeName = billType === 'gst' ? 'gstSavedBills' : 'savedBills';
        }

        console.log('Store Name:', storeName);

        const bill = await getFromDB(storeName, billId);
        console.log('Retrieved Bill Object:', bill);

        if (!bill) {
            console.error('❌ Bill is null/undefined');
            showNotification('Bill not found in database', 'error');
            console.groupEnd();
            return;
        }

        // FIX: Check if bill has value property or use bill directly
        const billData = bill.value || bill;
        console.log('Bill data to download:', billData);

        if (!billData) {
            console.error('❌ Bill data is missing');
            showNotification('Bill data structure is invalid', 'error');
            console.groupEnd();
            return;
        }

        console.log('✅ Bill looks valid, proceeding with download...');

        // FIXED: Generate proper filename with bill number, customer name, and type
        let billNo = '';
        let customerName = '';
        let type = billType === 'gst' ? 'gst' : 'regular';

        // Extract bill number and customer name based on bill type
        if (billType === 'gst' || billData.invoiceDetails) {
            billNo = billData.invoiceDetails?.number || billData.gstCustomerData?.invoiceNo || 'unknown';
            customerName = billData.customer?.billTo?.name || billData.gstCustomerData?.billTo?.name || 'unknown';
        } else {
            billNo = billData.customer?.billNo || 'unknown';
            customerName = billData.customer?.name || 'unknown';
        }

        // Clean up the filename (remove special characters)
        const cleanBillNo = billNo.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);

        const filename = `${cleanBillNo}_${cleanCustomerName}_${type}.json`;

        const downloadData = billData;
        const dataStr = JSON.stringify(downloadData, null, 2);

        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('✅ Download completed successfully');
        showNotification('Bill downloaded!', 'success');
        console.groupEnd();

    } catch (error) {
        console.error('❌ Download failed:', error);
        showNotification('Download error: ' + error.message, 'error');
        console.groupEnd();
    }
}

// Open Restored Bills Modal
function openRestoredBillsModal() {
    document.getElementById('restored-bills-modal').style.display = 'block';
    loadRestoredBillsList();
    toggleSettingsSidebar();
}

// Close Restored Bills Modal
function closeRestoredBillsModal() {
    document.getElementById('restored-bills-modal').style.display = 'none';
}

// Load Restored Bills List
async function loadRestoredBillsList() {
    try {
        const restoredBills = await getAllFromDB('restoredBills');
        const billsList = document.getElementById('restored-bills-list');
        billsList.innerHTML = '';

        if (restoredBills.length === 0) {
            billsList.innerHTML = '<div class="saved-bill-card">No restored bills yet. Use "Restore Bill from JSON" to add bills.</div>';
            return;
        }

        // Sort by timestamp (newest first)
        restoredBills.sort((a, b) => b.value.timestamp - a.value.timestamp);

        restoredBills.forEach(bill => {
            const billCard = createRestoredBillCard(bill);
            billsList.appendChild(billCard);
        });
    } catch (error) {
        console.error('Error loading restored bills:', error);
        billsList.innerHTML = '<div class="saved-bill-card">Error loading restored bills</div>';
    }
}

// Also update the card creation to be more accurate
function createRestoredBillCard(bill) {
    const billCard = document.createElement('div');
    billCard.className = 'saved-bill-card';

    const billData = bill.value || bill;
    const menuId = `menu-restored-${bill.id}-${Date.now()}`;

    // IMPROVED DETECTION FOR CARD DISPLAY (Kept existing logic)
    let isGST = false;
    let billNo = 'No Number';
    let customerName = 'Unknown Customer';
    let date = 'Unknown';

    // Check for Regular bill structure first
    if (billData.customer && billData.customer.name && !billData.customer.billTo) {
        isGST = false;
        billNo = billData.customer.billNo || 'No Number';
        customerName = billData.customer.name || 'Unknown Customer';
        date = billData.customer.date || 'Unknown';
    }
    else if (billData.customer && billData.customer.billNo && !billData.invoiceDetails) {
        isGST = false;
        billNo = billData.customer.billNo || 'No Number';
        customerName = billData.customer.name || 'Unknown Customer';
        date = billData.customer.date || 'Unknown';
    }
    // Then check for GST structure
    else if (billData.sourceType === 'gst' || billData.invoiceDetails || billData.gstCustomerData || billData.customer?.billTo) {
        isGST = true;
        billNo = billData.invoiceDetails?.number || billData.gstCustomerData?.invoiceNo || 'No Number';
        customerName = billData.customer?.billTo?.name || billData.gstCustomerData?.billTo?.name || 'Unknown Customer';
        date = billData.invoiceDetails?.date || billData.gstCustomerData?.invoiceDate || 'Unknown';
    }
    // Default to Regular if unclear
    else {
        isGST = false;
        billNo = billData.customer?.billNo || 'No Number';
        customerName = billData.customer?.name || 'Unknown Customer';
        date = billData.customer?.date || 'Unknown';
    }

    const totalAmount = billData.totalAmount || '0.00';
    const itemCount = billData.itemCount || billData.items?.length || billData.tableStructure?.filter(item => item.type === 'item').length || 0;

    // New UI Structure
    billCard.innerHTML = `
        <div class="card-header-row">
            <div class="card-info">
                <span>${customerName} - ${billNo}</span>
                <span class="card-sub-info" style="color:var(--primary-color)">₹${totalAmount}</span>
            </div>
            
            <div class="card-controls">
                <button class="icon-btn" onclick="toggleCardDetails(this)" title="Toggle Details">
                    <span class="material-icons">keyboard_arrow_down</span>
                </button>
                
                <div class="action-menu-container">
                    <button class="icon-btn" onclick="toggleActionMenu(event, '${menuId}')">
                        <span class="material-icons">more_vert</span>
                    </button>
                    <div id="${menuId}" class="action-dropdown">
                        <button class="dropdown-item" onclick="downloadBillAsJson('${bill.id}', 'restored', event)">
                            <span class="material-icons">download</span> Download JSON
                        </button>
                        <button class="dropdown-item" onclick="loadRestoredBill('${bill.id}', event)">
                            <span class="material-icons">open_in_browser</span> Load
                        </button>
                        <button class="dropdown-item delete-item" onclick="deleteRestoredBill('${bill.id}', event)">
                            <span class="material-icons">delete</span> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="details-section hidden saved-bill-details">
            <div>Date: ${date}</div>
            <div>Customer: ${customerName}</div>
            <div>Items: ${itemCount}</div>
            <div>Type: ${isGST ? 'GST' : 'Regular'} • Restored</div>
        </div>
    `;

    return billCard;
}

async function restoreIndividualBill() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const billData = JSON.parse(event.target.result);

                // Validate it's a bill file
                if (!billData.customer && !billData.invoiceDetails) {
                    showNotification('Invalid bill file format', 'error');
                    return;
                }

                // FIX: Determine source type based on bill structure
                const sourceType = billData.invoiceDetails ? 'gst' : 'regular';

                // Add to restored bills
                const restoredBillId = `restored-bill-${Date.now()}`;
                const restoredData = {
                    ...billData,
                    id: restoredBillId,
                    sourceType: sourceType, // ADD THIS LINE
                    timestamp: Date.now(),
                    isRestored: true
                };

                await setInDB('restoredBills', restoredBillId, restoredData);

                showNotification('Bill restored successfully!', 'success');

                // Refresh restored bills list
                await loadRestoredBillsList();

            } catch (error) {
                console.error('Error restoring bill:', error);
                showNotification('Error restoring bill file. Please make sure it\'s a valid bill JSON file.', 'error');
            }
        };
        reader.readAsText(file);
    };

    input.click();
}



// Delete Restored Bill
async function deleteRestoredBill(billId, event) {
    if (event) event.stopPropagation();

    const shouldDelete = await showConfirm('Are you sure you want to delete this restored bill?');
    if (shouldDelete) {
        try {
            await removeFromDB('restoredBills', billId);
            await loadRestoredBillsList();
            showNotification('Restored bill deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting restored bill:', error);
            showNotification('Error deleting restored bill', 'error');
        }
    }
}

// Search Restored Bills
function searchRestoredBills() {
    const searchTerm = document.getElementById('restored-bills-search').value.toLowerCase();
    const billCards = document.querySelectorAll('#restored-bills-list .saved-bill-card');

    billCards.forEach(card => {
        const infoEl = card.querySelector('.card-info');
        const subInfoEl = card.querySelector('.card-sub-info');
        const detailsEl = card.querySelector('.details-section');

        const billTitle = infoEl ? infoEl.textContent.toLowerCase() : '';
        const billTotal = subInfoEl ? subInfoEl.textContent.toLowerCase() : '';
        const billDetails = detailsEl ? detailsEl.textContent.toLowerCase() : '';

        if (billTitle.includes(searchTerm) || billTotal.includes(searchTerm) || billDetails.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Load Regular Restored Bill
async function loadRegularRestoredBill(billId) {
    try {
        const bill = await getFromDB('restoredBills', billId);
        if (!bill) return;

        // Use the same logic as loadSavedBill
        await setInDB('billDataManual', 'currentBill', bill.value);
        await loadFromLocalStorage();
        saveStateToHistory();

        if (currentView === 'bill') {
            toggleView();
        }

        console.log('Regular restored bill loaded successfully');

    } catch (error) {
        console.error('Error loading regular restored bill:', error);
        throw error;
    }
}

// Replace the loadRestoredBill function with this version
async function loadRestoredBill(billId, event) {
    if (event) event.stopPropagation();

    try {
        // Get the restored bill
        const restoredBill = await getFromDB('restoredBills', billId);
        if (!restoredBill) {
            showNotification('Restored bill not found', 'error');
            return;
        }

        const billData = restoredBill.value || restoredBill;

        // IMPROVED BILL TYPE DETECTION - Check for Regular bill structure FIRST
        let isGSTBill = false;

        console.log('🔍 ANALYZING BILL STRUCTURE:', {
            billId: billId,
            hasCustomerName: !!billData.customer?.name,
            hasCustomerBillTo: !!billData.customer?.billTo,
            hasInvoiceDetails: !!billData.invoiceDetails,
            hasGstCustomerData: !!billData.gstCustomerData,
            sourceType: billData.sourceType,
            customerStructure: billData.customer
        });

        // DETECT REGULAR BILLS FIRST (more specific criteria)
        if (billData.customer && billData.customer.name && !billData.customer.billTo) {
            // Regular bill: has customer.name but no billTo structure
            isGSTBill = false;
            console.log('✅ Detected REGULAR bill by customer.name structure');
        }
        else if (billData.customer && billData.customer.billNo && !billData.invoiceDetails) {
            // Regular bill: has customer.billNo but no invoiceDetails
            isGSTBill = false;
            console.log('✅ Detected REGULAR bill by customer.billNo structure');
        }
        // THEN DETECT GST BILLS
        else if (billData.sourceType === 'gst') {
            isGSTBill = true;
            console.log('✅ Detected GST bill by sourceType');
        }
        else if (billData.invoiceDetails && billData.invoiceDetails.number) {
            isGSTBill = true;
            console.log('✅ Detected GST bill by invoiceDetails.number');
        }
        else if (billData.gstCustomerData && billData.gstCustomerData.invoiceNo) {
            isGSTBill = true;
            console.log('✅ Detected GST bill by gstCustomerData');
        }
        else if (billData.customer && billData.customer.billTo) {
            isGSTBill = true;
            console.log('✅ Detected GST bill by billTo structure');
        }
        // DEFAULT TO REGULAR IF UNCLEAR
        else {
            isGSTBill = false;
            console.log('⚡ Defaulting to REGULAR bill (uncertain structure)');
        }

        console.log('🎯 FINAL DETECTION - Bill Type:', isGSTBill ? 'GST' : 'Regular');

        // MODE SWITCHING LOGIC
        let modeChanged = false;

        if (isGSTBill && !isGSTMode) {
            console.log('🔄 Switching to GST mode for GST bill');
            isGSTMode = true;
            await setInDB('gstMode', 'isGSTMode', true);
            modeChanged = true;
        } else if (!isGSTBill && isGSTMode) {
            console.log('🔄 Switching to Regular mode for Regular bill');
            isGSTMode = false;
            await setInDB('gstMode', 'isGSTMode', false);
            modeChanged = true;
        }

        // Clear workspace
        await clearAllDataSilently();

        // Update UI if mode changed
        if (modeChanged) {
            updateUIForGSTMode();
        }

        // Set as current bill
        await setInDB('billDataManual', 'currentBill', billData);

        // Load using your existing function
        await loadFromLocalStorage();
        saveStateToHistory();

        // Handle GST-specific setup ONLY for confirmed GST bills
        if (isGSTBill) {
            console.log('📋 Setting up GST bill display');
            if (billData.gstCustomerData) {
                await populateGSTCustomerDetails(billData.gstCustomerData);
            } else if (billData.customer && billData.invoiceDetails) {
                await populateGSTCustomerDetailsFromLegacy(billData);
            }
            copyItemsToGSTBill();
            updateGSTTaxCalculation();
            updateGSTBillDisplay();
        } else {
            console.log('📋 Setting up Regular bill display');
            updateTotal();
        }

        closeRestoredBillsModal();
        showNotification('Restored bill loaded successfully!', 'success');

    } catch (error) {
        console.error('Error loading restored bill:', error);
        showNotification('Error loading restored bill', 'error');
    }
}

// Add this helper function to clear data without triggering modals
async function clearAllDataSilently() {
    // Save current state to history BEFORE clearing (only if there's actual data)
    const hasItems = document.querySelectorAll('#createListManual tbody tr[data-id]').length > 0;
    const hasSections = document.querySelectorAll('#createListManual tbody tr.section-row').length > 0;

    if (hasItems || hasSections) {
        saveStateToHistory();
        await saveToHistory();
    }

    // Clear current workspace data without triggering mode modals
    document.getElementById("custName").value = "";

    // Auto-increment bill number based on saved bills
    try {
        const savedBills = await getAllFromDB('savedBills');
        let maxBillNo = 0;

        savedBills.forEach(bill => {
            if (bill.value.customer?.billNo) {
                const billNo = parseInt(bill.value.customer.billNo);
                if (!isNaN(billNo) && billNo > maxBillNo) {
                    maxBillNo = billNo;
                }
            }
        });

        if (maxBillNo > 0) {
            document.getElementById("billNo").value = (maxBillNo + 1).toString();
        } else {
            document.getElementById("billNo").value = "";
        }
    } catch (error) {
        document.getElementById("billNo").value = "";
    }

    document.getElementById("custAddr").value = "";
    document.getElementById("custPhone").value = "";
    document.getElementById("custGSTIN").value = "";

    // Set current date without triggering other modals
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('billDate').value = `${day}-${month}-${year}`;

    const createListTbody = document.querySelector("#createListManual tbody");
    const copyListTbody = document.querySelector("#copyListManual tbody");
    createListTbody.innerHTML = "";
    copyListTbody.innerHTML = "";

    // Clear GST table if exists
    const gstListTbody = document.querySelector("#gstCopyListManual tbody");
    if (gstListTbody) {
        gstListTbody.innerHTML = "";
    }

    rowCounterManual = 1;
    currentlyEditingRowIdManual = null;

    discountPercent = 0;
    gstPercent = 0;

    currentDimensions = {
        type: 'none',
        unit: 'ft',
        values: [0, 0, 0],
        calculatedArea: 0
    };

    updateSerialNumbers();
    updateTotal();

    // Reset edit mode when clearing all data
    resetEditMode();

    // Save the empty state to localStorage but NOT to history
    await saveToLocalStorage();
}


// NEW: Helper function to populate GST customer details in modal and bill view
async function populateGSTCustomerDetails(gstCustomerData) {
    if (!gstCustomerData) return;

    // Populate customer details modal form
    document.getElementById('invoice-no').value = gstCustomerData.invoiceNo || '';
    document.getElementById('invoice-date').value = gstCustomerData.invoiceDate || '';
    document.getElementById('gst-percent-input').value = gstCustomerData.gstPercent || '18';
    document.getElementById('transaction_type').value = gstCustomerData.transactionType || 'intrastate';
    document.getElementById('customer-type').value = gstCustomerData.customerType || 'bill-to';

    // Bill To details
    if (gstCustomerData.billTo) {
        document.getElementById('consignee-name').value = gstCustomerData.billTo.name || '';
        document.getElementById('consignee-address').value = gstCustomerData.billTo.address || '';
        document.getElementById('consignee-gst').value = gstCustomerData.billTo.gstin || '';
        document.getElementById('consignee-state').value = gstCustomerData.billTo.state || 'Maharashtra';
        document.getElementById('consignee-code').value = gstCustomerData.billTo.stateCode || '27';
        document.getElementById('consignee-contact').value = gstCustomerData.billTo.contact || '';
    }

    // Ship To details
    if (gstCustomerData.shipTo && gstCustomerData.customerType === 'both') {
        document.getElementById('buyer-name').value = gstCustomerData.shipTo.name || '';
        document.getElementById('buyer-address').value = gstCustomerData.shipTo.address || '';
        document.getElementById('buyer-gst').value = gstCustomerData.shipTo.gstin || '';
        document.getElementById('buyer-state').value = gstCustomerData.shipTo.state || 'Maharashtra';
        document.getElementById('buyer-code').value = gstCustomerData.shipTo.stateCode || '27';
        document.getElementById('buyer-contact').value = gstCustomerData.shipTo.contact || '';
        document.getElementById('place-of-supply').value = gstCustomerData.shipTo.placeOfSupply || 'Maharashtra';
    }

    // Update visibility based on customer type
    handleCustomerTypeChange();

    // Update GST bill view display
    document.getElementById('bill-invoice-no').textContent = gstCustomerData.invoiceNo || '';
    document.getElementById('bill-date-gst').textContent = gstCustomerData.invoiceDate || '';

    // Update Bill To in bill view
    if (gstCustomerData.billTo) {
        document.getElementById('billToName').textContent = gstCustomerData.billTo.name || '';
        document.getElementById('billToAddr').textContent = gstCustomerData.billTo.address || '';
        document.getElementById('billToGstin').textContent = gstCustomerData.billTo.gstin || 'customer 15-digit GSTIN';
        document.getElementById('billToContact').textContent = gstCustomerData.billTo.contact || 'Not provided';
        document.getElementById('billToState').textContent = gstCustomerData.billTo.state || 'Maharashtra';
        document.getElementById('billToStateCode').textContent = gstCustomerData.billTo.stateCode || '27';
    }

    // Update Ship To in bill view
    const shipToDiv = document.getElementById('shipTo');
    if (gstCustomerData.customerType === 'both' && gstCustomerData.shipTo) {
        shipToDiv.style.display = 'block';
        document.getElementById('shipToName').textContent = gstCustomerData.shipTo.name || '';
        document.getElementById('shipToAddr').textContent = gstCustomerData.shipTo.address || '';
        document.getElementById('shipToGstin').textContent = gstCustomerData.shipTo.gstin || 'customer 15-digit GSTIN';
        document.getElementById('shipToContact').textContent = gstCustomerData.shipTo.contact || 'Not provided';
        document.getElementById('shipToState').textContent = gstCustomerData.shipTo.state || 'Maharashtra';
        document.getElementById('shipToStateCode').textContent = gstCustomerData.shipTo.stateCode || '27';
        document.getElementById('shipToPOS').textContent = gstCustomerData.shipTo.placeOfSupply || '';
    } else {
        shipToDiv.style.display = 'none';
    }

    // Save the customer dialog state
    await saveCustomerDialogState();
    await saveGSTCustomerDataToLocalStorage();
}

// NEW: Helper function to handle legacy GST bill format
async function populateGSTCustomerDetailsFromLegacy(billData) {
    const gstCustomerData = {
        invoiceNo: billData.invoiceDetails?.number || '',
        invoiceDate: billData.invoiceDetails?.date || '',
        gstPercent: billData.taxSettings?.gstPercent || 18,
        transactionType: billData.taxSettings?.transactionType || 'intrastate',
        customerType: billData.customerType || 'bill-to',
        billTo: {
            name: billData.customer?.billTo?.name || '',
            address: billData.customer?.billTo?.address || '',
            gstin: billData.customer?.billTo?.gstin || '',
            contact: billData.customer?.billTo?.contact || '',
            state: billData.customer?.billTo?.state || 'Maharashtra',
            stateCode: billData.customer?.billTo?.stateCode || '27'
        },
        shipTo: {
            name: billData.customer?.shipTo?.name || '',
            address: billData.customer?.shipTo?.address || '',
            gstin: billData.customer?.shipTo?.gstin || '',
            contact: billData.customer?.shipTo?.contact || '',
            state: billData.customer?.shipTo?.state || 'Maharashtra',
            stateCode: billData.customer?.shipTo?.stateCode || '27',
            placeOfSupply: billData.customer?.shipTo?.placeOfSupply || ''
        }
    };

    await populateGSTCustomerDetails(gstCustomerData);
}

// add stock
// Global variable to track which item we are adding stock to
let currentItemForStock = null;

function openAddStockModal(itemName) {
    currentItemForStock = itemName;
    document.getElementById('stock-item-name').textContent = itemName;
    document.getElementById('add-stock-quantity').value = ''; // Clear previous input

    document.getElementById('add-stock-modal').style.display = 'block';

    // Auto-focus the input field for better UX
    setTimeout(() => {
        document.getElementById('add-stock-quantity').focus();
    }, 100);
}

function closeAddStockModal() {
    document.getElementById('add-stock-modal').style.display = 'none';
    currentItemForStock = null;
}

async function saveAddedStock() {
    const input = document.getElementById('add-stock-quantity');
    const quantityToAdd = parseFloat(input.value);

    if (!currentItemForStock) return;

    if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
        showNotification('Please enter a valid quantity greater than 0', 'error');
        input.style.borderColor = 'red';
        return;
    }

    try {
        // 1. Get current item data
        const item = await getFromDB('savedItems', currentItemForStock);

        if (item) {
            // 2. Calculate new stock
            const currentStock = parseFloat(item.stockQuantity) || 0;

            // --- UPDATED: Save Last Stock & Timestamp ---
            item.lastStockQuantity = currentStock; // Archive current stock
            item.lastStockUpdate = Date.now();     // Save timestamp
            // ------------------------------------------

            const newStock = currentStock + quantityToAdd;

            // 3. Update item object
            item.stockQuantity = newStock;

            // 4. Save back to DB
            await setInDB('savedItems', currentItemForStock, item);

            // 5. Success feedback and UI update
            showNotification(`Stock updated! New Total: ${newStock}`, 'success');
            closeAddStockModal();
            await loadItemsList(); // Refresh the list to see the new stock number
        } else {
            showNotification('Item not found in database', 'error');
        }
    } catch (error) {
        console.error('Error updating stock:', error);
        showNotification('Error updating stock', 'error');
    }
}

// Bill Heading Functions
// Bill Heading Functions
function openBillHeadingModal() {
    // Load current values from DOM
    const regHeading = document.getElementById('regular-bill-heading').textContent;
    const gstHeading = document.getElementById('gst-bill-heading').textContent;

    // Get current styles (Default to 18px and Uppercase if not set)
    const currentFontSize = parseInt(document.getElementById('regular-bill-heading').style.fontSize) || 18;
    const currentTransform = document.getElementById('regular-bill-heading').style.textTransform || 'uppercase';

    document.getElementById('regular-heading-input').value = regHeading;
    document.getElementById('gst-heading-input').value = gstHeading;
    document.getElementById('heading-font-size-input').value = currentFontSize;
    document.getElementById('heading-text-transform').value = currentTransform;

    document.getElementById('bill-heading-modal').style.display = 'block';
    toggleSettingsSidebar(); // Close sidebar
}

function closeBillHeadingModal() {
    document.getElementById('bill-heading-modal').style.display = 'none';
}

async function saveBillHeadings() {
    const regHeadingText = document.getElementById('regular-heading-input').value.trim();
    const gstHeadingText = document.getElementById('gst-heading-input').value.trim();
    const fontSize = document.getElementById('heading-font-size-input').value || '18';
    const textTransform = document.getElementById('heading-text-transform').value;

    // Update UI immediately
    updateHeadingDisplay('regular-bill-heading', regHeadingText, fontSize, textTransform);
    updateHeadingDisplay('gst-bill-heading', gstHeadingText, fontSize, textTransform);

    // Save to Database
    try {
        const headings = {
            regular: regHeadingText,
            gst: gstHeadingText,
            fontSize: fontSize,
            textTransform: textTransform
        };
        await setInDB('settings', 'billHeadings', headings);
        showNotification('Bill headings saved successfully!', 'success');
        closeBillHeadingModal();
    } catch (error) {
        console.error('Error saving bill headings:', error);
    }
}

function updateHeadingDisplay(elementId, text, fontSize = '18', textTransform = 'uppercase') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
        // Show if text exists, Hide if empty
        element.style.display = text.length > 0 ? 'block' : 'none';

        // Apply styles
        element.style.fontSize = fontSize + 'px';
        element.style.textTransform = textTransform;
    }
}

async function loadBillHeadings() {
    try {
        const headings = await getFromDB('settings', 'billHeadings');
        if (headings) {
            const fontSize = headings.fontSize || '18';
            const textTransform = headings.textTransform || 'uppercase';

            updateHeadingDisplay('regular-bill-heading', headings.regular || '', fontSize, textTransform);
            updateHeadingDisplay('gst-bill-heading', headings.gst || '', fontSize, textTransform);
        }
    } catch (error) {
        console.error('Error loading bill headings:', error);
    }
}

// --- Branding (Logo, Sign, Stamp) Functions ---


let brandingSettings = {
    logo: null,
    logoPosition: 'left',
    logoBorderRadius: 0, // <--- ADD THIS
    signature: null,
    stamp: null
};

function openBrandingModal() {
    // Load current position
    document.getElementById('logo-position').value = brandingSettings.logoPosition || 'left';

    // Load current border radius (NEW)
    document.getElementById('logo-radius').value = brandingSettings.logoBorderRadius || 0;

    // Clear file inputs
    document.getElementById('logo-upload').value = '';
    document.getElementById('sign-upload').value = '';
    document.getElementById('stamp-upload').value = '';

    // Show current images in previews
    updateModalPreviews();

    document.getElementById('branding-modal').style.display = 'block';
    toggleSettingsSidebar();
}

function closeBrandingModal() {
    document.getElementById('branding-modal').style.display = 'none';
}

// Update the thumbnails in the modal based on current state
function updateModalPreviews() {
    const types = ['logo', 'signature', 'stamp'];

    types.forEach(type => {
        // Note: HTML IDs are 'sign-preview' but key is 'signature'
        const domId = type === 'signature' ? 'sign' : type;
        const container = document.getElementById(`${domId}-preview`);

        if (container) {
            container.innerHTML = '';
            if (brandingSettings[type]) {
                const img = document.createElement('img');
                img.src = brandingSettings[type];
                container.appendChild(img);
            } else {
                container.innerHTML = '<span>No image set</span>';
            }
        }
    });
}

// Handle new file selection for preview
async function previewImage(input, type) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            // Update global state temporarily (will be saved on Save button)
            brandingSettings[type] = e.target.result;
            updateModalPreviews(); // Refresh UI
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveBrandingSettings() {
    const position = document.getElementById('logo-position').value;
    const radius = document.getElementById('logo-radius').value; // (NEW)

    try {
        // Update settings object
        brandingSettings.logoPosition = position;
        brandingSettings.logoBorderRadius = radius; // (NEW)

        // Save to DB
        await setInDB('settings', 'branding', brandingSettings);

        // Update Bill UI
        updateBrandingUI();

        showNotification('Branding saved successfully!', 'success');
        closeBrandingModal();
    } catch (error) {
        console.error('Error saving branding:', error);
        showNotification('Error saving images', 'error');
    }
}

function clearImage(type) {
    // 1. Update State immediately
    brandingSettings[type] = null;

    // 2. Clear Input
    const inputId = type === 'signature' ? 'sign-upload' : `${type}-upload`;
    const input = document.getElementById(inputId);
    if (input) input.value = '';

    // 3. Update Preview immediately
    updateModalPreviews();

    showNotification(`${type} removed (Click Save to apply)`, 'info');
}

async function loadBrandingSettings() {
    try {
        const saved = await getFromDB('settings', 'branding');
        if (saved) {
            brandingSettings = { ...brandingSettings, ...saved };
            updateBrandingUI();
        }
    } catch (error) {
        console.error('Error loading branding:', error);
    }
}

function updateBrandingUI() {
    // 1. Update Header Logo (Regular & GST)
    const containers = ['regular-company-details', 'gst-company-details'];

    containers.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        const existingLogo = container.querySelector('.bill-logo');
        if (existingLogo) existingLogo.remove();

        if (brandingSettings.logo) {
            const img = document.createElement('img');
            img.src = brandingSettings.logo;
            img.className = 'bill-logo';

            // APPLY BORDER RADIUS (NEW)
            img.style.borderRadius = (brandingSettings.logoBorderRadius || 0) + '%';

            if (brandingSettings.logoPosition === 'left') {
                container.insertBefore(img, container.firstChild);
                container.style.flexDirection = 'row';
                container.querySelector('.company-text').style.textAlign = 'right';
            } else {
                container.appendChild(img);
                container.style.flexDirection = 'row';
                container.querySelector('.company-text').style.textAlign = 'left';
            }
        } else {
            container.querySelector('.company-text').style.textAlign = 'center';
        }
    });

    // 2. Update Footer (Sign & Stamp Separate Cells) - GST Only
    const stampCell = document.getElementById('stamp-cell');
    const signatureCell = document.getElementById('signature-cell');

    if (stampCell && signatureCell) {
        // Clear current contents
        stampCell.innerHTML = '';
        signatureCell.innerHTML = '';

        // Add Stamp
        if (brandingSettings.stamp) {
            const stampImg = document.createElement('img');
            stampImg.src = brandingSettings.stamp;
            stampImg.className = 'bill-stamp';
            stampCell.appendChild(stampImg);
        }

        // Add Signature
        if (brandingSettings.signature) {
            const signImg = document.createElement('img');
            signImg.src = brandingSettings.signature;
            signImg.className = 'bill-signature';
            signatureCell.appendChild(signImg);
        }
    }
}

// Add this to your DOMContentLoaded event listener
// await loadBrandingSettings();

/* ==========================================
   UNIFIED ADJUSTMENT SYSTEM (SEQUENTIAL CHAIN)
   ========================================== */

function openAdjustmentModal() {
    // === FIX 2: Explicitly close sidebar instead of toggling ===
    const sidebar = document.getElementById("settings-sidebar");
    const overlay = document.getElementById("settings-overlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("open");

    document.getElementById('adjustment-modal').style.display = 'block';
    renderAdjustmentTables(getCurrentSubtotal());
    resetAdjForm();
}

function closeAdjustmentModal() {
    document.getElementById('adjustment-modal').style.display = 'none';
}

// Core Logic: The Chain Calculator (Handles Regular & GST Modes)
// Core Logic: The Chain Calculator (Handles Regular & GST Modes)
function calculateAdjustments(subtotal) {
    let runningBalance = subtotal;
    let mainBillRows = '';
    let modalPreviewRows = '';

    // --- 1. PREPARE CHAINS ---
    // If GST Mode: Filter out "Legacy GST" (Tax is calc'd at end)
    const activeChain = isGSTMode
        ? adjustmentChain.filter(a => a.id !== 'legacy-gst')
        : adjustmentChain;

    // --- 2. GENERATE FIXED SUBTOTAL ROW FOR MODAL (Common) ---
    const fixedSubRow = `
        <tr style="background-color: #f8f9fa; font-weight: bold;">
            <td>SUB TOTAL</td>
            <td>${subtotal.toFixed(2)}</td>
            <td>-</td>
            <td>-</td>
            <td>${subtotal.toFixed(2)}</td>
            <td></td>
        </tr>`;

    modalPreviewRows += fixedSubRow;

    // --- 3. CALCULATE ADJUSTMENTS CHAIN ---
    activeChain.forEach((adj, index) => {
        let adjAmount = 0;
        let sourceAmount = runningBalance;

        if (adj.type === 'percent') {
            adjAmount = (sourceAmount * adj.value) / 100;
        } else {
            adjAmount = adj.value;
        }
        adjAmount = parseFloat(adjAmount.toFixed(2));

        // === FIX 1: Regular Mode "Taxable Amount" in Modal ===
        // Auto-Insert if Tax is applied after other adjustments
        if ((adj.name.toLowerCase().includes('gst') || adj.name.toLowerCase().includes('tax')) &&
            !isGSTMode &&
            Math.abs(runningBalance - subtotal) > 0.01) {

            // Add to Main Bill
            mainBillRows += `
                <tr class="taxable-row">
                    <td colspan="5" style="text-align: right;">Taxable Amount</td>
                    <td style="text-align: center;">${runningBalance.toFixed(2)}</td>
                </tr>`;

            // Add to Modal Preview (Fixed Row)
            modalPreviewRows += `
                <tr style="background-color: #e8f5e9; font-weight: bold; color: #666;">
                    <td>Taxable Amount</td>
                    <td>${runningBalance.toFixed(2)}</td>
                    <td>-</td>
                    <td>-</td>
                    <td>${runningBalance.toFixed(2)}</td>
                    <td></td>
                </tr>`;
        }

        // Apply Operation
        if (adj.operation === 'subtract') {
            runningBalance -= adjAmount;
        } else {
            runningBalance += adjAmount;
        }

        const sign = adj.operation === 'subtract' ? '-' : '';
        const colorStyle = adj.textColor ? `color: ${adj.textColor};` : '';

        // --- GENERATE HTML ---

        // A. Main Bill Table Row
        mainBillRows += `
            <tr data-adj-id="${adj.id}">
                <td ${isGSTMode ? '' : 'colspan="5" style="text-align: right;"'}>
                    ${adj.name} ${adj.type === 'percent' ? `(${adj.value}%)` : ''}
                </td>
                <td style="text-align: right; ${colorStyle}">${sign}${adjAmount.toFixed(2)}</td>
            </tr>`;

        // B. Modal Preview Row
        const realIndex = adjustmentChain.findIndex(a => a.id === adj.id);

        modalPreviewRows += `
            <tr class="adj-row" draggable="true" data-index="${realIndex}" data-id="${adj.id}">
                <td>${adj.name}</td>
                <td>${sourceAmount.toFixed(2)}</td>
                <td>${adj.type === 'percent' ? adj.value + '%' : '-'}</td>
                <td style="color:${adj.operation === 'subtract' ? 'red' : 'green'}">
                    ${sign}${adjAmount.toFixed(2)}
                </td>
                <td style="font-weight:bold">${runningBalance.toFixed(2)}</td>
                <td>
                    <button class="adj-action-btn edit" onclick="editAdjustment('${adj.id}')">
                        <i class="material-icons" style="font-size:16px">edit</i>
                    </button>
                    <button class="adj-action-btn remove" onclick="removeAdjustment('${adj.id}')">
                        <i class="material-icons" style="font-size:16px">close</i>
                    </button>
                </td>
            </tr>`;
    });

    // --- 4. FINAL CALCULATIONS & DISPLAY ---

    if (isGSTMode) {
        // === GST MODE LOGIC ===
        const taxableValue = runningBalance;
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;

        // Calculate Taxes
        if (typeof transactionType !== 'undefined' && transactionType === 'intrastate') {
            cgstAmount = parseFloat(((taxableValue * (currentGSTPercent / 2)) / 100).toFixed(2));
            sgstAmount = parseFloat(((taxableValue * (currentGSTPercent / 2)) / 100).toFixed(2));
        } else {
            igstAmount = parseFloat(((taxableValue * currentGSTPercent) / 100).toFixed(2));
        }

        const grandTotal = Math.round(taxableValue + cgstAmount + sgstAmount + igstAmount);

        const showTaxableRow = activeChain.length > 0;

        // === FIX 2: Add Tax Breakdown Rows to Modal Preview ===
        const taxRows = `
            <tr style="background-color: #e8f5e9; font-weight: bold; display: ${showTaxableRow ? '' : 'none'};">
                <td>TAXABLE AMT</td>
                <td>${taxableValue.toFixed(2)}</td>
                <td>-</td>
                <td>-</td>
                <td>${taxableValue.toFixed(2)}</td>
                <td></td>
            </tr>
            ${transactionType === 'intrastate' ? `
            <tr style="font-weight: bold; color: #666;">
                <td>CGST</td>
                <td>${taxableValue.toFixed(2)}</td>
                <td>${(currentGSTPercent / 2)}%</td>
                <td style="color:green">+${cgstAmount.toFixed(2)}</td>
                <td>-</td>
                <td></td>
            </tr>
            <tr style="font-weight: bold; color: #666;">
                <td>SGST</td>
                <td>${taxableValue.toFixed(2)}</td>
                <td>${(currentGSTPercent / 2)}%</td>
                <td style="color:green">+${sgstAmount.toFixed(2)}</td>
                <td>-</td>
                <td></td>
            </tr>` : `
            <tr style="font-weight: bold; color: #666;">
                <td>IGST</td>
                <td>${taxableValue.toFixed(2)}</td>
                <td>${currentGSTPercent}%</td>
                <td style="color:green">+${igstAmount.toFixed(2)}</td>
                <td>-</td>
                <td></td>
            </tr>`}
            <tr style="background-color: #2c3e50; color: white; font-weight: bold;">
                <td>GRAND TOTAL</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${grandTotal.toFixed(2)}</td>
                <td></td>
            </tr>`;

        modalPreviewRows += taxRows;

        // Update GST Bill Table
        const gstBillHtml = `
            <tr>
                <td>Sub Total</td>
                <td id="gst-sub-total">${subtotal.toFixed(2)}</td>
            </tr>
            ${mainBillRows}
            <tr style="font-weight:bold; background-color:#f8f9fa; display: ${showTaxableRow ? '' : 'none'};">
                <td>TAXABLE AMT</td>
                <td id="gst-taxable-amount">${taxableValue.toFixed(2)}</td>
            </tr>
            <tr style="${transactionType === 'intrastate' ? '' : 'display:none'}">
                <td>CGST</td>
                <td id="gst-cgst-amount">${cgstAmount.toFixed(2)}</td>
            </tr>
            <tr style="${transactionType === 'intrastate' ? '' : 'display:none'}">
                <td>SGST</td>
                <td id="gst-sgst-amount">${sgstAmount.toFixed(2)}</td>
            </tr>
            <tr style="${transactionType === 'interstate' ? '' : 'display:none'}">
                <td>IGST</td>
                <td id="gst-igst-amount">${igstAmount.toFixed(2)}</td>
            </tr>
            <tr>
                <td><strong>Grand Total</strong></td>
                <td><strong id="gst-grand-total">${grandTotal.toFixed(2)}</strong></td>
            </tr>`;

        const gstTbody = document.querySelector('#gst-bill-totals-table tbody');
        if (gstTbody) gstTbody.innerHTML = gstBillHtml;

        updateTaxBreakdownTable({}, taxableValue, cgstAmount, sgstAmount, igstAmount);

        const inputTotal = document.getElementById('createTotalAmountManual');
        if (inputTotal) inputTotal.textContent = subtotal.toFixed(2);

        updateAmountInWords(grandTotal);

    } else {
        // === REGULAR MODE LOGIC ===
        const grandTotal = runningBalance;

        // Modal Fixed Row (Regular)
        const finalRow = `
            <tr style="background-color: #2c3e50; color: white; font-weight: bold;">
                <td>GRAND TOTAL</td>
                <td>-</td>
                <td>-</td>
                <td>-</td>
                <td>${grandTotal.toFixed(2)}</td>
                <td></td>
            </tr>`;
        modalPreviewRows += finalRow;

        // Update Regular Bill Table
        let regBillHtml = '';

        if (activeChain.length > 0) {
            regBillHtml = `
                <tr>
                    <td colspan="5" class="total-cell" style="text-align: right;">SUB TOTAL</td>
                    <td class="total-cell" style="text-align: center;">${subtotal.toFixed(2)}</td>
                </tr>
                ${mainBillRows}
                <tr>
                    <td colspan="5" class="total-cell" style="text-align: right;">GRAND TOTAL</td>
                    <td class="total-cell" style="text-align: center;">${grandTotal.toFixed(2)}</td>
                </tr>`;
        } else {
            regBillHtml = `
                <tr>
                    <td colspan="5" class="total-cell" style="text-align: right;">TOTAL</td>
                    <td class="total-cell" style="text-align: center;">${grandTotal.toFixed(2)}</td>
                </tr>`;
        }

        const regTbody = document.getElementById('bill-total-tbody');
        if (regTbody) regTbody.innerHTML = regBillHtml;

        // Update Input Mode Total
        const inputTotal = document.getElementById('createTotalAmountManual');
        if (inputTotal) inputTotal.textContent = subtotal.toFixed(2);

        const copyTotal = document.getElementById('copyTotalAmount');
        if (copyTotal) copyTotal.textContent = grandTotal.toFixed(2);

        updateAmountInWords(grandTotal);
    }

    // --- 5. UPDATE MODAL PREVIEW DOM ---
    const previewBody = document.getElementById('adj-preview-tbody');
    if (previewBody) {
        previewBody.innerHTML = modalPreviewRows;
        addAdjDragListeners();
    }
}

// Helper: Get raw item total
function getCurrentSubtotal() {
    const items = document.querySelectorAll('#createListManual tbody tr[data-id]');
    let subtotal = 0;
    items.forEach(row => {
        const amount = parseFloat(row.getAttribute('data-amount')) || 0;
        subtotal += amount;
    });
    return parseFloat(subtotal.toFixed(2)); // Fixed precision issues
}

// CRUD: Add/Edit/Remove
async function saveAdjustment() {
    const id = document.getElementById('adj-id').value || 'adj-' + Date.now();
    const name = document.getElementById('adj-name').value.trim();
    const type = document.getElementById('adj-type').value;
    const value = parseFloat(document.getElementById('adj-value').value);
    const operation = document.getElementById('adj-operation').value;
    const color = document.getElementById('adj-color').value;

    if (!name || isNaN(value)) {
        showNotification('Please enter valid details', 'error');
        return;
    }

    const newAdj = { id, name, type, value, operation, textColor: color };

    const existingIndex = adjustmentChain.findIndex(a => a.id === id);
    if (existingIndex >= 0) {
        adjustmentChain[existingIndex] = newAdj;
    } else {
        adjustmentChain.push(newAdj);
    }

    updateTotal();
    openAdjustmentModal();
    resetAdjForm();

    // === FIX 3: Persist data immediately ===
    await saveToLocalStorage();
    saveStateToHistory();
}

function editAdjustment(id) {
    const adj = adjustmentChain.find(a => a.id === id);
    if (!adj) return;

    document.getElementById('adj-id').value = adj.id;
    document.getElementById('adj-name').value = adj.name;
    document.getElementById('adj-type').value = adj.type;
    document.getElementById('adj-value').value = adj.value;
    document.getElementById('adj-operation').value = adj.operation;
    document.getElementById('adj-color').value = adj.textColor;
    document.getElementById('btn-save-adj').textContent = 'Update';
}

// [REPLACE EXISTING removeAdjustment FUNCTION]
async function removeAdjustment(id) {
    // Use custom confirmation dialog
    const shouldRemove = await showConfirm('Are you sure you want to remove this adjustment?');

    if (shouldRemove) {
        adjustmentChain = adjustmentChain.filter(a => a.id !== id);

        // Update UI
        updateTotal();
        renderAdjustmentTables(getCurrentSubtotal());

        // Persist data
        await saveToLocalStorage();
        saveStateToHistory();

        showNotification('Adjustment removed successfully', 'success');
    }
}

function resetAdjForm() {
    document.getElementById('adj-id').value = '';
    document.getElementById('adj-name').value = '';
    document.getElementById('adj-value').value = '';
    document.getElementById('btn-save-adj').textContent = 'Add';
}

function renderAdjustmentTables(subtotal) {
    calculateAdjustments(subtotal); // Re-runs calculation and updates DOM
}

/* ==========================================
   UNIQUE DRAG & DROP FOR ADJUSTMENTS
   ========================================== */
function addAdjDragListeners() {
    const rows = document.querySelectorAll('.adj-row');
    rows.forEach(row => {
        row.addEventListener('dragstart', handleAdjDragStart);
        row.addEventListener('dragover', handleAdjDragOver);
        row.addEventListener('drop', handleAdjDrop);
        row.addEventListener('dragend', handleAdjDragEnd);
    });
}

function handleAdjDragStart(e) {
    adjDragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('adj-dragging');
}

function handleAdjDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    if (!adjDragSrcEl) return;

    const targetRow = e.target.closest('tr');
    if (targetRow && targetRow !== adjDragSrcEl) {
        targetRow.classList.add('adj-drag-over');
    }
    return false;
}

async function handleAdjDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (adjDragSrcEl === this) return false;

    const srcIdx = parseInt(adjDragSrcEl.getAttribute('data-index'));
    const destIdx = parseInt(this.getAttribute('data-index'));

    const itemToMove = adjustmentChain[srcIdx];
    adjustmentChain.splice(srcIdx, 1);
    adjustmentChain.splice(destIdx, 0, itemToMove);

    updateTotal();
    renderAdjustmentTables(getCurrentSubtotal());

    // === FIX 3: Persist data immediately ===
    await saveToLocalStorage();
    saveStateToHistory();

    return false;
}

function handleAdjDragEnd() {
    this.classList.remove('adj-dragging');
    document.querySelectorAll('.adj-row').forEach(row => row.classList.remove('adj-drag-over'));
    adjDragSrcEl = null;
}

// --- SCANNER FUNCTIONS ---

async function initScanner() {
    if (!codeReader) {
        codeReader = new ZXing.BrowserMultiFormatReader();
    }
}

async function openScanner(mode) {
    currentScannerMode = mode;

    const modal = document.getElementById('scanner-modal');
    modal.style.display = 'block';

    // --- RESET VISIBILITY (In case it was hidden previously) ---
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';

    // Get UI references
    const toggleContainer = document.querySelector('.scan-mode-toggle');
    const manualEntryContainer = document.querySelector('.manual-barcode-entry');

    if (mode === 'modal') {
        // --- ADD ITEM MODE ---
        // 1. Force logic to 'manual' (so it doesn't try to auto-add to bill)
        if (typeof setScanMode === 'function') {
            setScanMode('manual');
        } else {
            scannerMode = 'manual';
        }

        // 2. Hide extra UI elements
        if (toggleContainer) toggleContainer.style.display = 'none';
        if (manualEntryContainer) manualEntryContainer.style.display = 'none';

    } else {
        // --- MAIN BILLING MODE ---
        // 1. Show UI elements
        if (toggleContainer) toggleContainer.style.display = 'flex';
        if (manualEntryContainer) manualEntryContainer.style.display = 'flex';
    }

    // Reset Standard UI Components
    document.getElementById('scanner-container').style.display = 'flex';
    document.getElementById('scanner-controls').style.display = 'flex';
    document.getElementById('camera-select').style.display = 'inline-block';
    document.getElementById('quick-add-form').style.display = 'none';

    await initScanner();

    try {
        const videoInputDevices = await codeReader.listVideoInputDevices();
        const sourceSelect = document.getElementById('camera-select');
        sourceSelect.innerHTML = '';

        videoInputDevices.forEach((element) => {
            const sourceOption = document.createElement('option');
            sourceOption.text = element.label;
            sourceOption.value = element.deviceId;
            sourceSelect.appendChild(sourceOption);
        });

        // Use last camera (often back camera on mobile) or first available
        const selectedDeviceId = videoInputDevices.length > 1 ? videoInputDevices[videoInputDevices.length - 1].deviceId : videoInputDevices[0].deviceId;

        startDecoding(selectedDeviceId);

        sourceSelect.onchange = () => {
            codeReader.reset();
            startDecoding(sourceSelect.value);
        };

    } catch (err) {
        console.error(err);
        showNotification('Error accessing camera', 'error');
    }
}

function startDecoding(deviceId) {
    codeReader.decodeFromVideoDevice(deviceId, 'scanner-video', (result, err) => {
        if (result) {
            handleScanSuccess(result);
        }
        if (err) {
            // IGNORE specific errors that occur during closing/resizing
            if (err instanceof ZXing.NotFoundException ||
                err.message.includes("IndexSizeError") ||
                err.message.includes("The source width is 0")) {
                return;
            }
            // Log genuine errors
            console.error(err);
        }
    });
}

function closeScannerModal() {
    // 1. Stop the library reader immediately
    if (codeReader) {
        codeReader.reset();
    }

    // 2. Forcefully stop the actual video tracks
    const video = document.getElementById('scanner-video');
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }

    // 3. Hide the modal
    document.getElementById('scanner-modal').style.display = 'none';
}

function hideScannerModal() {
    const modal = document.getElementById('scanner-modal');

    // Make invisible but keep in DOM so camera keeps running
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';

    showNotification("Scanner running in background", "info");
}
// --- NEW Helper Function for Dynamic Header ---
function updateQuickAddHeader() {
    const headerEl = document.getElementById('scanned-item-name');
    const inputVal = parseFloat(document.getElementById('quick-quantity').value) || 0;
    const existingQty = parseFloat(headerEl.getAttribute('data-existing-qty')) || 0;
    const baseName = headerEl.getAttribute('data-base-name');

    if (existingQty > 0 && baseName) {
        const newTotal = existingQty + inputVal;

        // Use innerHTML to render the icon
        // Added styling to make the detail text slightly lighter and align the icon
        headerEl.innerHTML = `${baseName} <span style="font-size: 1em; color: #666;">(Qty: ${existingQty} <span class="material-icons" style="font-size: 14px; vertical-align: middle; position: relative; top: -1px;">arrow_right_alt</span> ${newTotal})</span>`;

    } else if (baseName) {
        headerEl.textContent = baseName;
    }
}
// --- UPDATED handleScanSuccess Function ---
async function handleScanSuccess(result) {
    const barcodeText = result.text;
    const currentTime = Date.now();

    // --- AUTOMATIC MODE LOGIC ---
    if (scannerMode === 'auto') {
        if (barcodeText === lastScannedCode && (currentTime - lastScanTime < SCAN_DELAY)) {
            return;
        }

        lastScannedCode = barcodeText;
        lastScanTime = currentTime;

        const allItems = await getAllFromDB('savedItems');
        const foundItem = allItems.find(item =>
            item.value.barcode === barcodeText || item.value.productCode === barcodeText
        );

        if (foundItem) {
            playBeep(); // PLAY SOUND
            await processAutomaticAdd(foundItem.value);
        } else {
            // showNotification(`Item not found: ${barcodeText}`, 'error');
        }
        return;
    }

    // --- MANUAL MODE LOGIC ---
    if (document.getElementById('quick-add-form').style.display !== 'block') {
        if (currentScannerMode === 'modal') {
            document.getElementById('saved-barcode').value = barcodeText;
            const typeSelect = document.getElementById('saved-barcode-type');
            if (barcodeText.length === 13) typeSelect.value = 'EAN_13';
            else if (barcodeText.length === 12) typeSelect.value = 'UPC_A';
            else typeSelect.value = 'CODE_128';

            playBeep(); // PLAY SOUND
            closeScannerModal();
            showNotification('Barcode Scanned!', 'success');
        } else if (currentScannerMode === 'main') {
            const allItems = await getAllFromDB('savedItems');
            const foundItem = allItems.find(item =>
                item.value.barcode === barcodeText || item.value.productCode === barcodeText
            );

            if (foundItem) {
                playBeep(); // PLAY SOUND

                // Pause Camera UI
                document.getElementById('scanner-container').style.display = 'none';
                document.getElementById('scanner-controls').style.display = 'none'; // <--- NEW
                // document.getElementById('camera-select').style.display = 'none';

                // Show Form
                const form = document.getElementById('quick-add-form');
                form.style.display = 'block';

                // Populate Form
                document.getElementById('quick-item-name').value = foundItem.value.name;

                const defaultQty = foundItem.value.defaultQuantity ? parseFloat(foundItem.value.defaultQuantity) : 1;
                document.getElementById('quick-quantity').value = defaultQty;

                document.getElementById('quick-unit').value = foundItem.value.defaultUnit || '';
                document.getElementById('quick-rate').value = foundItem.value.defaultRate || 0;

                scannedItemData = foundItem.value;

                // Existing Qty Logic for Header
                const existingRow = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]')).find(row => {
                    const nameCell = row.querySelector('.itemNameClass');
                    return nameCell && nameCell.textContent.trim() === foundItem.value.name;
                });

                const headerEl = document.getElementById('scanned-item-name');
                headerEl.setAttribute('data-base-name', foundItem.value.name);

                if (existingRow) {
                    const currentQty = parseFloat(existingRow.getAttribute('data-original-quantity') || existingRow.children[2].textContent);
                    headerEl.setAttribute('data-existing-qty', currentQty);
                } else {
                    headerEl.setAttribute('data-existing-qty', 0);
                }

                updateQuickAddHeader();
                document.getElementById('quick-quantity').focus();
            } else {
                // showNotification(`Item ${barcodeText} not found!`, 'error');
            }
        }
    }
}

async function processAutomaticAdd(itemData) {
    const itemName = itemData.name;

    // CHANGED: Use saved Default Quantity, otherwise fallback to 1
    const addedQty = itemData.defaultQuantity ? parseFloat(itemData.defaultQuantity) : 1;

    const addedUnit = itemData.defaultUnit || '';
    const addedRate = itemData.defaultRate || 0;

    // 1. Check if exists in current bill
    const existingRow = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]')).find(row => {
        const nameCell = row.querySelector('.itemNameClass');
        return nameCell && nameCell.textContent.trim() === itemName;
    });

    if (existingRow) {
        // --- UPDATE EXISTING ---
        const rowId = existingRow.getAttribute('data-id');
        const currentQty = parseFloat(existingRow.getAttribute('data-original-quantity') || existingRow.children[2].textContent);

        // Increment by the Default Quantity
        const newTotalQty = currentQty + addedQty;

        currentlyEditingRowIdManual = rowId;

        // Populate globals for updateRowManual
        document.getElementById('itemNameManual').value = itemName;
        document.getElementById('quantityManual').value = newTotalQty;
        document.getElementById('selectUnit').value = addedUnit;
        document.getElementById('rateManual').value = addedRate;
        document.getElementById('itemNotesManual').value = existingRow.querySelector('.notes')?.textContent || '';

        // Restore dimensions logic
        const dimType = existingRow.getAttribute('data-dimension-type') || 'none';
        document.getElementById('dimensionType').value = dimType;
        const dimValues = JSON.parse(existingRow.getAttribute('data-dimension-values') || '[0,0,0]');
        document.getElementById('dimension1').value = dimValues[0] || '';
        document.getElementById('dimension2').value = dimValues[1] || '';
        document.getElementById('dimension3').value = dimValues[2] || '';

        // Setup Dimensions Object
        currentDimensions.type = dimType;
        currentDimensions.values = dimValues;
        currentDimensions.unit = existingRow.getAttribute('data-dimension-unit') || 'ft';
        calculateDimensions();

        await updateRowManual();
        showNotification(`Updated: ${itemName} (+${addedQty})`, 'success');

    } else {
        // --- ADD NEW ---
        document.getElementById('itemNameManual').value = itemName;

        // Set Initial Quantity to Default Quantity
        document.getElementById('quantityManual').value = addedQty;

        document.getElementById('selectUnit').value = addedUnit;
        document.getElementById('rateManual').value = addedRate;

        // Load Item Dimensions
        const dimType = itemData.dimensionType || 'none';
        document.getElementById('dimensionType').value = dimType;

        // Restore saved toggle states if they exist
        if (itemData.dimensionToggles) {
            if (document.getElementById('dimension1-toggle')) document.getElementById('dimension1-toggle').checked = itemData.dimensionToggles.toggle1;
            if (document.getElementById('dimension2-toggle')) document.getElementById('dimension2-toggle').checked = itemData.dimensionToggles.toggle2;
            if (document.getElementById('dimension3-toggle')) document.getElementById('dimension3-toggle').checked = itemData.dimensionToggles.toggle3;
        } else {
            // Default checked if no config
            if (document.getElementById('dimension1-toggle')) document.getElementById('dimension1-toggle').checked = true;
            if (document.getElementById('dimension2-toggle')) document.getElementById('dimension2-toggle').checked = true;
            if (document.getElementById('dimension3-toggle')) document.getElementById('dimension3-toggle').checked = true;
        }

        if (dimType !== 'none') {
            currentDimensions.type = dimType;
            currentDimensions.values = itemData.dimensionValues || [0, 0, 0];
            currentDimensions.unit = itemData.measurementUnit || 'ft';
            calculateDimensions();
        } else {
            currentDimensions = { type: 'none', unit: 'ft', values: [0, 0, 0], calculatedArea: 0 };
        }

        await addRowManual();
        showNotification(`Added: ${itemName}`, 'success');
    }

    // Reset Globals after Op
    currentlyEditingRowIdManual = null;
    document.getElementById('itemNameManual').value = '';
    document.getElementById('quantityManual').value = '';
    document.getElementById('rateManual').value = '';
}

async function processQuickAdd() {
    if (!scannedItemData) return;

    // 1. Get values from Quick Add Form
    const itemName = scannedItemData.name;
    const addedQty = parseFloat(document.getElementById('quick-quantity').value) || 0;
    const addedUnit = document.getElementById('quick-unit').value;
    const addedRate = parseFloat(document.getElementById('quick-rate').value) || 0;

    if (addedQty <= 0) {
        showNotification('Please enter a valid quantity', 'error');
        return;
    }

    // 2. Check if item already exists in the bill
    // We look for a row with the same item name in the input table
    const existingRow = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]')).find(row => {
        const nameCell = row.querySelector('.itemNameClass');
        return nameCell && nameCell.textContent.trim() === itemName;
    });

    if (existingRow) {
        // --- UPDATE EXISTING ITEM (Logic: Merge Qty + Update Row) ---
        const rowId = existingRow.getAttribute('data-id');

        // Get current quantity (using data attribute for precision)
        const currentQty = parseFloat(existingRow.getAttribute('data-original-quantity') || existingRow.children[2].textContent);
        const newTotalQty = currentQty + addedQty;

        // Set global variables required by updateRowManual()
        currentlyEditingRowIdManual = rowId;

        // Fill global inputs with NEW TOTAL quantity and scanned values
        document.getElementById('itemNameManual').value = itemName;
        document.getElementById('quantityManual').value = newTotalQty;
        document.getElementById('selectUnit').value = addedUnit;
        document.getElementById('rateManual').value = addedRate;

        // Preserve notes from existing row
        const existingNotes = existingRow.querySelector('.notes')?.textContent || '';
        document.getElementById('itemNotesManual').value = existingNotes;

        // Restore dimensions and toggles from the existing row to global context
        // This ensures the update function calculates the area correctly
        const dimType = existingRow.getAttribute('data-dimension-type') || 'none';
        document.getElementById('dimensionType').value = dimType;

        const dimValues = JSON.parse(existingRow.getAttribute('data-dimension-values') || '[0,0,0]');
        document.getElementById('dimension1').value = dimValues[0] || '';
        document.getElementById('dimension2').value = dimValues[1] || '';
        document.getElementById('dimension3').value = dimValues[2] || '';

        const toggles = JSON.parse(existingRow.getAttribute('data-dimension-toggles') || '{"toggle1":true,"toggle2":true,"toggle3":true}');
        if (document.getElementById('dimension1-toggle')) document.getElementById('dimension1-toggle').checked = toggles.toggle1;
        if (document.getElementById('dimension2-toggle')) document.getElementById('dimension2-toggle').checked = toggles.toggle2;
        if (document.getElementById('dimension3-toggle')) document.getElementById('dimension3-toggle').checked = toggles.toggle3;

        // Update global dimension calculation object
        currentDimensions.type = dimType;
        currentDimensions.values = dimValues;
        currentDimensions.unit = existingRow.getAttribute('data-dimension-unit') || 'ft';
        calculateDimensions();

        // Execute the update
        await updateRowManual();

        showNotification(`Updated ${itemName}: Quantity increased to ${newTotalQty}`, 'success');

    } else {
        // --- ADD NEW ITEM ---
        // Fill global inputs
        document.getElementById('itemNameManual').value = itemName;
        document.getElementById('quantityManual').value = addedQty;
        document.getElementById('selectUnit').value = addedUnit;
        document.getElementById('rateManual').value = addedRate;

        // Handle dimensions from scanned data
        const dimType = scannedItemData.dimensionType || 'none';
        document.getElementById('dimensionType').value = dimType;

        if (dimType !== 'none') {
            currentDimensions.type = dimType;
            currentDimensions.values = scannedItemData.dimensionValues || [0, 0, 0];
            currentDimensions.unit = scannedItemData.measurementUnit || 'ft';
            calculateDimensions();
        } else {
            currentDimensions = { type: 'none', unit: 'ft', values: [0, 0, 0], calculatedArea: 0 };
        }

        // Execute add
        await addRowManual();
        showNotification(`${itemName} added to bill`, 'success');
    }

    // 3. Reset Scanner for Continuous Scanning (Continuous Mode)
    // Hide the form
    document.getElementById('quick-add-form').style.display = 'none';
    // Show the camera container
    document.getElementById('scanner-container').style.display = 'flex';
    document.getElementById('scanner-controls').style.display = 'flex'; // <--- NEW (Use flex)
    // document.getElementById('camera-select').style.display = 'inline-block';

    // Clear temp data
    scannedItemData = null;

    // Restart the camera immediately
    const selectedDeviceId = document.getElementById('camera-select').value;
    if (selectedDeviceId) {
        codeReader.reset(); // Reset to be safe
        startDecoding(selectedDeviceId);
    }
}

function setScanMode(mode) {
    scannerMode = mode;

    // Update UI
    document.getElementById('btn-scan-manual').className = mode === 'manual' ? 'btn-mode active' : 'btn-mode';
    document.getElementById('btn-scan-auto').className = mode === 'auto' ? 'btn-mode active' : 'btn-mode';

    // Reset scanner UI if switching modes
    document.getElementById('quick-add-form').style.display = 'none';
    document.getElementById('scanner-container').style.display = 'flex';
    document.getElementById('scanner-controls').style.display = 'flex'; // <--- NEW
    document.getElementById('camera-select').style.display = 'inline-block';

    // Restart scanning if needed
    if (codeReader) {
        codeReader.reset();
        const selectedDeviceId = document.getElementById('camera-select').value;
        if (selectedDeviceId) startDecoding(selectedDeviceId);
    }
}

// Handle "Enter" key in manual barcode input
function handleManualEnter(event) {
    if (event.key === 'Enter') {
        handleManualEntry();
    }
}

// Process Manual Barcode Entry
async function handleManualEntry() {
    const input = document.getElementById('manual-barcode-text');
    const code = input.value.trim();

    if (!code) {
        showNotification('Please enter a barcode', 'warning');
        return;
    }

    try {
        const allItems = await getAllFromDB('savedItems');

        // Search by Barcode OR Product Code
        const foundItem = allItems.find(item =>
            item.value.barcode === code || item.value.productCode === code
        );

        if (foundItem) {
            // REMOVED: playBeep();  <-- Sound removed for manual entry

            if (scannerMode === 'auto') {
                // --- AUTOMATIC MODE: Add Instantly ---
                await processAutomaticAdd(foundItem.value);
                input.value = '';
                input.focus();
            } else {
                // --- MANUAL MODE: Open Form ---

                // Hide Scanner UI to show form
                document.getElementById('scanner-container').style.display = 'none';
                document.getElementById('scanner-controls').style.display = 'none'; // <--- NEW
                // document.getElementById('camera-select').style.display = 'none';

                // Show Form
                const form = document.getElementById('quick-add-form');
                form.style.display = 'block';

                // Populate Form
                document.getElementById('quick-item-name').value = foundItem.value.name;

                const defaultQty = foundItem.value.defaultQuantity ? parseFloat(foundItem.value.defaultQuantity) : 1;
                document.getElementById('quick-quantity').value = defaultQty;

                document.getElementById('quick-unit').value = foundItem.value.defaultUnit || '';
                document.getElementById('quick-rate').value = foundItem.value.defaultRate || 0;

                scannedItemData = foundItem.value;

                // Header Logic
                const existingRow = Array.from(document.querySelectorAll('#createListManual tbody tr[data-id]')).find(row => {
                    const nameCell = row.querySelector('.itemNameClass');
                    return nameCell && nameCell.textContent.trim() === foundItem.value.name;
                });

                const headerEl = document.getElementById('scanned-item-name');
                headerEl.setAttribute('data-base-name', foundItem.value.name);

                if (existingRow) {
                    const currentQty = parseFloat(existingRow.getAttribute('data-original-quantity') || existingRow.children[2].textContent);
                    headerEl.setAttribute('data-existing-qty', currentQty);
                } else {
                    headerEl.setAttribute('data-existing-qty', 0);
                }

                updateQuickAddHeader();

                // Clear input and focus quantity in form
                input.value = '';
                document.getElementById('quick-quantity').focus();
            }

        } else {
            // showNotification(`Item not found: ${code}`, 'error');
            input.select();
        }
    } catch (error) {
        console.error('Error in manual entry:', error);
        showNotification('Error checking database', 'error');
    }
}


// Short Beep Sound (Base64 encoded)
const beepAudio = new Audio("./beep.mpeg");

function playBeep() {
    beepAudio.currentTime = 0;
    beepAudio.play().catch(e => console.log("Audio play failed (user interaction needed first)", e));
}


/* ==========================================================================
   ADVANCED OCR & DATA ENTRY ASSISTANT MODULE
   ========================================================================== */

var ocrState = {
    isDragging: false,
    isResizing: false,
    dragStartX: 0, dragStartY: 0,
    initialLeft: 0, initialTop: 0,
    initialWidth: 0, initialHeight: 0,
    resizeDir: '',
    cropper: null,
    currentFile: null,
    worker: null,
    extractedValue: '',
    isReplaceMode: true,
    originalImageSrc: null
};

// document.addEventListener('DOMContentLoaded', () => {
//     initOCRWindowManagement();
//     initOCRDragAndDrop();

//     // Global click listener to close context menu
//     document.addEventListener('click', (e) => {
//         if (!e.target.closest('#ocr-context-menu')) {
//             document.getElementById('ocr-context-menu').style.display = 'none';
//         }
//     });
// });

/* --- WINDOW MANAGEMENT (Drag & Resize) --- */
function initOCRWindowManagement() {
    const modal = document.getElementById('ocr-modal');
    const header = document.getElementById('ocr-header');
    if (!modal) return;

    // Drag Logic
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.window-controls')) return;
        ocrState.isDragging = true;
        ocrState.dragStartX = e.clientX;
        ocrState.dragStartY = e.clientY;
        const rect = modal.getBoundingClientRect();
        ocrState.initialLeft = rect.left;
        ocrState.initialTop = rect.top;
        modal.style.transform = 'none'; // Disable centering transform
        modal.style.left = ocrState.initialLeft + 'px';
        modal.style.top = ocrState.initialTop + 'px';
    });

    // Resize Logic
    document.querySelectorAll('.resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            ocrState.isResizing = true;
            ocrState.resizeDir = handle.className.split(' ').find(c => c.endsWith('-resize')).replace('-resize', '');
            ocrState.dragStartX = e.clientX;
            ocrState.dragStartY = e.clientY;
            const rect = modal.getBoundingClientRect();
            ocrState.initialWidth = rect.width;
            ocrState.initialHeight = rect.height;
            ocrState.initialLeft = rect.left;
            ocrState.initialTop = rect.top;
            modal.style.transform = 'none';
            modal.style.left = ocrState.initialLeft + 'px';
            modal.style.top = ocrState.initialTop + 'px';
        });
    });

    // Mouse Move
    document.addEventListener('mousemove', (e) => {
        if (ocrState.isDragging) {
            const dx = e.clientX - ocrState.dragStartX;
            const dy = e.clientY - ocrState.dragStartY;
            modal.style.left = (ocrState.initialLeft + dx) + 'px';
            modal.style.top = (ocrState.initialTop + dy) + 'px';
        }
        if (ocrState.isResizing) {
            const dx = e.clientX - ocrState.dragStartX;
            const dy = e.clientY - ocrState.dragStartY;

            if (ocrState.resizeDir.includes('e')) modal.style.width = Math.max(600, ocrState.initialWidth + dx) + 'px';
            if (ocrState.resizeDir.includes('s')) modal.style.height = Math.max(400, ocrState.initialHeight + dy) + 'px';
            // Simple implementation for SE corner mostly used
        }
    });

    // Mouse Up (End Interaction & Save)
    document.addEventListener('mouseup', () => {
        // Only save if we were actually interacting
        if (ocrState.isDragging || ocrState.isResizing) {
            saveOCRSettings(); // <--- Save position/size to LocalStorage
        }

        ocrState.isDragging = false;
        ocrState.isResizing = false;
    });
}

/* --- DRAG & DROP FILE ZONE --- */
function initOCRDragAndDrop() {
    const workbench = document.getElementById('ocr-workbench');

    workbench.addEventListener('dragover', (e) => {
        e.preventDefault();
        workbench.style.border = '2px dashed var(--primary-color)';
        workbench.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
    });

    workbench.addEventListener('dragleave', (e) => {
        e.preventDefault();
        workbench.style.border = 'none';
        workbench.style.backgroundColor = '#333';
    });

    workbench.addEventListener('drop', (e) => {
        e.preventDefault();
        workbench.style.border = 'none';
        workbench.style.backgroundColor = '#333';
        if (e.dataTransfer.files.length > 0) {
            const fileInput = document.getElementById('ocr-file-input');
            fileInput.files = e.dataTransfer.files;
            handleOCRFile(fileInput);
        }
    });
}

/* --- CORE FUNCTIONS --- */

function openOCRModal() {
    document.getElementById('ocr-modal').style.display = 'flex';
}

function closeOCRModal() {
    document.getElementById('ocr-modal').style.display = 'none';
    if (ocrState.cropper) ocrState.cropper.destroy();
}

// function minimizeOCRModal() {
//     // Basic minimize: just hide, or could shrink to a bar. 
//     // For now, let's just close (or you can implement a dock)
//     document.getElementById('ocr-modal').style.display = 'none';
// }

async function handleOCRFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    ocrState.currentFile = file;

    // UI Reset
    document.getElementById('ocr-empty-state').style.display = 'none';
    const canvasContainer = document.getElementById('ocr-canvas-container');
    canvasContainer.style.display = 'block';
    const imgElement = document.getElementById('ocr-source-image');

    // Enable Buttons
    document.getElementById('btn-crop-scan').disabled = false;
    document.getElementById('btn-filter').disabled = false;

    if (ocrState.cropper) ocrState.cropper.destroy();

    const fileType = file.name.split('.').pop().toLowerCase();

    if (['png', 'jpg', 'jpeg', 'bmp', 'webp'].includes(fileType)) {
        // Load Image directly
        const reader = new FileReader();
        reader.onload = (e) => {
            imgElement.src = e.target.result;
            ocrState.originalImageSrc = e.target.result;
            initCropper(imgElement);
        };
        reader.readAsDataURL(file);
    }
    else if (fileType === 'pdf') {
        // Render PDF Page 1 to Image
        updateOCRProgress(10, 'Rendering PDF...');
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdf.getPage(1); // Default to page 1

        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const pdfUrl = canvas.toDataURL('image/png');
        imgElement.src = pdfUrl;
        // NEW: Store original source
        ocrState.originalImageSrc = pdfUrl;
        initCropper(imgElement);
        updateOCRProgress(0, 'Ready');
    }
    else {
        // Docs/Excel: No visual crop, just process
        document.getElementById('ocr-empty-state').style.display = 'block';
        document.getElementById('ocr-empty-state').innerHTML = '<p>Document loaded. Click "Full Scan".</p>';
        canvasContainer.style.display = 'none';
        document.getElementById('btn-crop-scan').disabled = true;
    }
}

function initCropper(imageElement) {
    ocrState.cropper = new Cropper(imageElement, {
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
    });
}

/* --- OCR EXECUTION --- */

async function ocrProcess(mode) {
    // 1. Safety Check: Ensure a file is loaded
    if (!ocrState.currentFile) {
        showNotification("Please upload a file first to scan.", "error");
        return;
    }

    const resultArea = document.getElementById('ocr-result');
    const chipsContainer = document.getElementById('ocr-smart-chips');

    resultArea.value = '';
    chipsContainer.innerHTML = '';
    updateOCRProgress(0, 'Starting Engine...');
    document.getElementById('ocr-progress-container').style.display = 'block';

    try {
        let imageToScan;

        // 2. Get Image Source
        if (ocrState.currentFile.name.endsWith('.docx') || ocrState.currentFile.name.endsWith('.xlsx')) {
            // Non-image formats
            await processDocumentFile(ocrState.currentFile);
            return;
        }

        if (mode === 'crop' && ocrState.cropper) {
            // Get cropped canvas
            imageToScan = ocrState.cropper.getCroppedCanvas({ fillColor: '#fff' });
        } else if (ocrState.cropper) {
            // Get full canvas
            imageToScan = ocrState.cropper.element;
        } else {
            // Raw file fallback
            imageToScan = ocrState.currentFile;
        }

        // 3. Initialize Tesseract
        if (!ocrState.worker) {
            ocrState.worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        updateOCRProgress(m.progress * 100, `Scanning... ${Math.round(m.progress * 100)}%`);
                    } else {
                        updateOCRProgress(null, m.status);
                    }
                }
            });
        }

        // 4. Run Recognition
        const ret = await ocrState.worker.recognize(imageToScan);
        const text = ret.data.text;

        // 5. Display Results
        resultArea.value = text;
        localStorage.setItem('billApp_ocrText', text);
        parseSmartData(text);
        updateOCRProgress(100, 'Complete');
        setTimeout(() => document.getElementById('ocr-progress-container').style.display = 'none', 2000);

    } catch (error) {
        console.error(error);
        resultArea.value = "Error: " + error.message;
        updateOCRProgress(0, 'Failed');
    }
}

async function processDocumentFile(file) {
    const resultArea = document.getElementById('ocr-result');
    const fileType = file.name.split('.').pop().toLowerCase();
    let text = '';

    if (fileType === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        text = result.value;
    } else if (fileType.includes('xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        workbook.SheetNames.forEach(name => {
            text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        });
    }

    resultArea.value = text;
    localStorage.setItem('billApp_ocrText', text);
    parseSmartData(text);
    updateOCRProgress(100, 'Document Parsed');
}

/* --- INTELLIGENT FEATURES --- */

function updateOCRProgress(percent, text) {
    if (percent !== null) document.getElementById('ocr-progress-bar').style.width = percent + '%';
    if (text) document.getElementById('ocr-status-text').textContent = text;
}

// 1. Toggle Menu
function toggleFilterMenu() {
    const menu = document.getElementById('filter-menu');
    const btn = document.getElementById('btn-filter');
    if (!menu || !btn) return;

    // Toggle Display
    if (menu.style.display === 'none' || menu.style.display === '') {
        // Calculate Position relative to Viewport
        const rect = btn.getBoundingClientRect();

        menu.style.display = 'block';
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = rect.left + 'px';

        // Initialize sliders if first run
        if (!ocrState.originalImageSrc && ocrState.cropper) {
            ocrState.originalImageSrc = ocrState.cropper.url;
        }
    } else {
        menu.style.display = 'none';
    }
}

// 2. Real-time Filter Logic
function updateImageFilters() {
    if (!ocrState.cropper || !ocrState.originalImageSrc) return;

    const thresholdVal = parseInt(document.getElementById('slider-threshold').value);
    const contrastVal = parseInt(document.getElementById('slider-contrast').value);

    // Update Label Text
    document.getElementById('val-threshold').textContent = thresholdVal;
    document.getElementById('val-contrast').textContent = contrastVal;

    // Create an off-screen image to process the ORIGINAL pixels
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = ocrState.originalImageSrc;

    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Pre-calculate Contrast Factor
        // Factor formula: (259 * (contrast + 255)) / (255 * (259 - contrast))
        const factor = (259 * (contrastVal + 255)) / (255 * (259 - contrastVal));

        for (let i = 0; i < data.length; i += 4) {
            // 1. Grayscale
            let gray = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

            // 2. Apply Contrast
            gray = factor * (gray - 128) + 128;

            // 3. Apply Threshold (Binarization)
            // If slider is at 0, skip binarization (grayscale only)
            // If > 0, apply binary cutoff
            let finalVal = gray;
            if (thresholdVal > 0) {
                finalVal = gray > thresholdVal ? 255 : 0;
            }

            // Clamp values 0-255
            finalVal = Math.max(0, Math.min(255, finalVal));

            data[i] = finalVal;     // R
            data[i + 1] = finalVal;   // G
            data[i + 2] = finalVal;   // B
            // Alpha (data[i+3]) remains unchanged
        }

        ctx.putImageData(imgData, 0, 0);

        // Update Cropper
        canvas.toBlob((blob) => {
            const newUrl = URL.createObjectURL(blob);
            ocrState.cropper.replace(newUrl);
        });
    };
}

// 3. Reset Filters
function resetFilters() {
    document.getElementById('slider-threshold').value = 128;
    document.getElementById('slider-contrast').value = 0;

    // Trigger update
    updateImageFilters();
}

// Enhance Image (Simple Binarization filter)
function applyImageFilter() {
    if (!ocrState.cropper) {
        showNotification("Please upload an image first.", "error");
        return;
    }

    showNotification("Enhancing image for text clarity...", "info");

    // 1. Get the current image data from Cropper
    // using getCanvas() allows us to manipulate pixels
    const canvas = ocrState.cropper.getCroppedCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // 2. Loop through every pixel to apply filters
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // A. Grayscale Conversion (Human perception weighted)
        // This converts colors (like pink) to a shade of gray
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // B. Binarization (Thresholding)
        // If the gray value is lighter than 160, make it PURE WHITE (background).
        // If it's darker, make it PURE BLACK (text).
        // This removes the "pink" paper noise effectively.
        const threshold = 160;
        const val = gray > threshold ? 255 : 0;

        data[i] = val;     // Red
        data[i + 1] = val; // Green
        data[i + 2] = val; // Blue
    }

    // 3. Put the processed pixels back
    ctx.putImageData(imgData, 0, 0);

    // 4. Update the Cropper with the new "Clean" image
    canvas.toBlob((blob) => {
        const newUrl = URL.createObjectURL(blob);

        // This updates the visual in the workbench
        ocrState.cropper.replace(newUrl);

        showNotification("Enhancement Complete! Try scanning now.", "success");
    });
}
function parseSmartData(text) {
    const container = document.getElementById('ocr-smart-chips');
    container.innerHTML = '';

    const patterns = [
        { type: 'GSTIN', regex: /\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}/g, icon: 'badge' },
        { type: 'Date', regex: /\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b/g, icon: 'event' },
        { type: 'Amount', regex: /(?:Rs\.?|INR|₹)\s*[\d,]+\.?\d{0,2}\b/gi, icon: 'payments' },
        { type: 'Phone', regex: /[6-9]\d{9}\b/g, icon: 'call' },
        { type: 'Invoice', regex: /INV-?\d+/i, icon: 'receipt' }
    ];

    const uniqueMatches = new Set();

    patterns.forEach(p => {
        const matches = text.match(p.regex);
        if (matches) {
            matches.forEach(m => {
                const clean = m.trim();
                if (!uniqueMatches.has(clean) && clean.length > 2) {
                    uniqueMatches.add(clean);
                    createSmartChip(clean, p.type, p.icon, container);
                }
            });
        }
    });
}

function createSmartChip(text, type, icon, container) {
    const chip = document.createElement('div');
    chip.className = 'smart-chip';
    chip.innerHTML = `<span class="material-icons" style="font-size:14px;">${icon}</span> ${text}`;

    // Right Click (or Left Click) to open Magic Fill Menu
    chip.onclick = (e) => {
        openMagicFillMenu(e, text);
    };

    container.appendChild(chip);
}

/* --- MAGIC FILL SYSTEM --- */

function openMagicFillMenu(e, text) {
    e.stopPropagation();
    ocrState.extractedValue = text;

    const menu = document.getElementById('ocr-context-menu');
    menu.style.display = 'block';

    // Position menu at cursor
    // Adjust for scroll and viewport edges in a real app
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
}

// Function to handle SELECT dropdowns from Magic Menu (Main Window)
// Function to handle SELECT dropdowns (Executed in Main Window)
function magicSelect(elementId, value) {
    const el = document.getElementById(elementId);

    if (el) {
        // 1. Set Value
        el.value = value;

        // 2. Trigger Change Event (Important for listeners)
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // 3. Smart Toggling: Show container if currently hidden
        if (elementId === 'dimensionType') {
            const container = document.getElementById('dimension-inputs-container');
            if (container && container.style.display === 'none') {
                if (typeof toggleDimensionInputs === 'function') toggleDimensionInputs();
            }
        }

        if (elementId === 'convertUnit') {
            const convertSelect = document.getElementById('convertUnit');
            // Convert options might be hidden even if dimensions are shown
            if (convertSelect && convertSelect.style.display === 'none') {
                if (typeof toggleConvertOptions === 'function') toggleConvertOptions();
            }
        }

        if (elementId === 'discountType') {
            const container = document.getElementById('discount-inputs-container');
            if (container && container.style.display === 'none') {
                if (typeof toggleDiscountInputs === 'function') toggleDiscountInputs();
            }
        }

        // 4. Hide Menu (if triggered from main window)
        const menu = document.getElementById('magic-menu');
        if (menu) menu.style.display = 'none';

        showNotification(`Selected: ${value}`, 'success');
    } else {
        console.error(`Element #${elementId} not found in Main Window.`);
        showNotification(`Field '${elementId}' not found (Check Input Mode)`, 'error');
    }
}

// NEW: Handle Copy Operation
async function magicOperation(action) {
    const selection = window.magicSelectedText;

    try {
        if (action === 'copy') {
            if (selection) {
                await navigator.clipboard.writeText(selection);
                showNotification('Copied to clipboard', 'success');
            } else {
                showNotification('No text selected', 'warning');
            }
        }
        // Removed Paste/Cut handling logic as requested

        document.getElementById('magic-menu').style.display = 'none';
    } catch (err) {
        console.error('Clipboard error:', err);
        showNotification('Clipboard action failed', 'error');
    }
}

function magicFill(targetFieldId) {
    const val = ocrState.extractedValue;

    if (targetFieldId === 'copy') {
        navigator.clipboard.writeText(val);
        showNotification("Copied to clipboard", "success");
    } else {
        // Auto-detect mode (GST vs Regular)
        let finalId = targetFieldId;

        // Map generic IDs to specific mode IDs
        if (isGSTMode) {
            if (targetFieldId === 'custName') finalId = 'billToName'; // Span in GST view
            if (targetFieldId === 'custGSTIN') finalId = 'billToGstin';
            if (targetFieldId === 'billDate') finalId = 'bill-date-gst';
            if (targetFieldId === 'billNo') finalId = 'bill-invoice-no';

            // For spans, use textContent
            const el = document.getElementById(finalId);
            if (el) {
                el.textContent = val;
                // Also update hidden inputs if they exist for saving
                if (finalId === 'billToName') document.getElementById('consignee-name').value = val;
                showNotification(`Filled GST Field: ${val}`, "success");
            }
        } else {
            // Regular Mode (Inputs)
            const el = document.getElementById(targetFieldId);
            if (el) {
                el.value = val;
                // Trigger input events for auto-save/validation
                el.dispatchEvent(new Event('input'));
                showNotification(`Filled Field: ${val}`, "success");
            }
        }
    }

    document.getElementById('ocr-context-menu').style.display = 'none';
}

function copyOCRText() {
    const text = document.getElementById('ocr-result');
    text.select();
    navigator.clipboard.writeText(text.value);
    showNotification("All text copied!", "success");
}

/* ==========================================
   RIGHT-CLICK MAGIC FILL SYSTEM
   ========================================== */

let magicSelectedText = "";

document.addEventListener('DOMContentLoaded', () => {
    initOCRWindowManagement();
    initOCRDragAndDrop();
    loadOCRSettings();

    // 1. Context Menu Trigger
    document.addEventListener('contextmenu', (e) => {
        const selection = window.getSelection().toString().trim();
        const target = e.target;

        // Allow if text selected OR right-clicking an input/textarea inside OCR
        if ((selection.length > 0 || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.closest('#ocr-modal')) {
            e.preventDefault();
            magicSelectedText = selection;
            window.magicContextMenuTarget = target; // Save target for Paste/Cut
            showMagicMenu(e.clientX, e.clientY);
        }
    });

    // 2. Global Click Listener
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#ocr-context-menu')) document.getElementById('ocr-context-menu').style.display = 'none';
        if (!e.target.closest('#magic-menu')) document.getElementById('magic-menu').style.display = 'none';

        const filterMenu = document.getElementById('filter-menu');
        const filterBtn = document.getElementById('btn-filter');
        if (filterMenu && filterMenu.style.display === 'block') {
            if (!filterMenu.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
                filterMenu.style.display = 'none';
            }
        }
    });

    // 3. Smart Nested Submenu Positioning
    const magicItems = document.querySelectorAll('.magic-item');
    magicItems.forEach(item => {
        item.addEventListener('mouseenter', function () {
            const subMenu = this.querySelector('.magic-sub-menu');
            if (subMenu) {
                const rect = this.getBoundingClientRect();
                const winWidth = window.innerWidth;
                const winHeight = window.innerHeight;
                const subMenuWidth = 160;
                const subMenuHeight = subMenu.scrollHeight || 300;

                // --- A. Horizontal Logic (Cascading Flip) ---
                const parentMenu = this.closest('.magic-sub-menu');
                const isParentFlippedLeft = parentMenu && parentMenu.classList.contains('flip-left');

                // Default: Flip if hitting right edge OR if parent is already flipped left
                let shouldFlipLeft = isParentFlippedLeft || (rect.right + subMenuWidth > winWidth);

                // Safety: If flipping left puts it off-screen to the left, force right
                if (shouldFlipLeft && (rect.left - subMenuWidth < 0)) {
                    shouldFlipLeft = false;
                }

                if (shouldFlipLeft) {
                    subMenu.classList.add('flip-left');
                } else {
                    subMenu.classList.remove('flip-left');
                }

                // --- B. Vertical Logic (Flip Up) ---
                if (rect.top + subMenuHeight > winHeight) {
                    subMenu.classList.add('flip-up');
                } else {
                    subMenu.classList.remove('flip-up');
                }
            }
        });
    });

    // 4. Restore/Save Text
    const savedText = localStorage.getItem('billApp_ocrText');
    const textArea = document.getElementById('ocr-result');
    if (savedText && textArea) {
        textArea.value = savedText;
        if (window.ocrState) window.ocrState.extractedValue = savedText;
    }

    if (textArea) {
        textArea.addEventListener('input', () => {
            localStorage.setItem('billApp_ocrText', textArea.value);
        });
    }
});

function showMagicMenu(x, y) {
    const menu = document.getElementById('magic-menu');

    // 1. Reset display to measure dimensions
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    // 2. Horizontal Flip (Prevent right overflow)
    if (x + menuWidth > winWidth) {
        x = x - menuWidth;
    }

    // 3. Vertical Flip (Prevent bottom overflow) - NEW LOGIC
    if (y + menuHeight > winHeight) {
        y = y - menuHeight; // Position above the cursor
    }

    // 4. Apply positions
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.visibility = 'visible';
}
function magicFillField(elementId) {
    const element = document.getElementById(elementId);

    if (element) {
        // --- NEW: Handle Replace vs Append ---
        if (ocrState.isReplaceMode) {
            // Replace Mode: Overwrite value
            element.value = magicSelectedText;
        } else {
            // Append Mode: Add space + new text
            const currentVal = element.value;
            if (currentVal) {
                element.value = currentVal + ' ' + magicSelectedText;
            } else {
                element.value = magicSelectedText;
            }
        }
        // -------------------------------------

        // 2. Trigger Events (Important for calculations/autosave)
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // 3. Visual Feedback
        element.style.transition = "background-color 0.3s";
        element.style.backgroundColor = "#e8f5e9"; // Light green flash
        setTimeout(() => {
            element.style.backgroundColor = "";
        }, 500);

        // 4. Focus
        element.focus();

        // 5. Special Handlers
        if (elementId === 'itemNameManual') {
            if (typeof handleItemNameInput === 'function') {
                handleItemNameInput();
            }
        }

        showNotification(`${ocrState.isReplaceMode ? 'Replaced' : 'Appended'}: ${magicSelectedText}`, 'success');
    } else {
        showNotification(`Field not found (Open the modal first!)`, 'error');
    }
}

function toggleOCRWorkbench() {
    const workbench = document.getElementById('ocr-workbench');
    const chips = document.getElementById('ocr-smart-chips');
    const resHeader = document.querySelector('#ocr-results-panel .result-header');
    const progress = document.getElementById('ocr-progress-container');
    const resultsPanel = document.getElementById('ocr-results-panel');

    // NEW: Target the main modal header
    const mainHeader = document.getElementById('ocr-header');

    // Check current state (if workbench is visible, we go to Focus Mode)
    if (workbench.style.display !== 'none') {
        // --- ENTER FOCUS MODE ---
        workbench.style.display = 'none';
        if (chips) chips.style.display = 'none';
        if (resHeader) resHeader.style.display = 'none';
        if (progress) progress.style.display = 'none';
        if (mainHeader) mainHeader.style.display = 'none'; // Hide Header

        // Remove padding/border for clean full-window look
        if (resultsPanel) {
            resultsPanel.style.padding = '0';
            resultsPanel.style.borderLeft = 'none';
        }

        const btn = document.querySelector('button[onclick="toggleOCRWorkbench()"]');
        if (btn) btn.innerHTML = '<span class="material-icons">vertical_split</span> Split View';

    } else {
        // --- ENTER NORMAL MODE ---
        workbench.style.display = 'flex';
        if (chips) chips.style.display = 'flex';
        if (resHeader) resHeader.style.display = 'flex';
        if (progress) progress.style.display = '';
        if (mainHeader) mainHeader.style.display = 'flex'; // Show Header

        // Restore padding/border
        if (resultsPanel) {
            resultsPanel.style.padding = '15px';
            resultsPanel.style.borderLeft = '1px solid #ddd';
        }

        const btn = document.querySelector('button[onclick="toggleOCRWorkbench()"]');
        if (btn) btn.innerHTML = '<span class="material-icons">view_sidebar</span> Focus View';
    }
}

function toggleOCRReplaceMode() {
    ocrState.isReplaceMode = !ocrState.isReplaceMode;
    const btn = document.getElementById('btn-ocr-replace-mode');

    if (ocrState.isReplaceMode) {
        btn.innerHTML = '<span class="material-icons">find_replace</span> Replace: ON';
        btn.style.backgroundColor = '#e8f5e9'; // Light Green bg
        btn.style.color = '#27ae60'; // Green text
        btn.style.borderColor = '#27ae60';
    } else {
        btn.innerHTML = '<span class="material-icons">playlist_add</span> Replace: OFF';
        btn.style.backgroundColor = ''; // Default gray
        btn.style.color = '';
        btn.style.borderColor = '';
    }

    // NEW: Save to Local Storage immediately
    saveOCRSettings();
}

function saveOCRSettings() {
    const modal = document.getElementById('ocr-modal');
    if (!modal) return;

    const settings = {
        isReplaceMode: ocrState.isReplaceMode,
        width: modal.offsetWidth,
        height: modal.offsetHeight,
        left: modal.offsetLeft,
        top: modal.offsetTop
    };

    localStorage.setItem('billApp_ocrSettings', JSON.stringify(settings));
}

function loadOCRSettings() {
    const saved = localStorage.getItem('billApp_ocrSettings');
    if (saved) {
        const data = JSON.parse(saved);

        // Restore Logic State
        if (data.isReplaceMode !== undefined) {
            ocrState.isReplaceMode = data.isReplaceMode;
        }

        // Restore Visual State (Apply directly to Modal)
        const modal = document.getElementById('ocr-modal');
        if (modal) {
            if (data.width) modal.style.width = data.width + 'px';
            if (data.height) modal.style.height = data.height + 'px';

            // Only apply position if valid coordinates exist
            if (data.left && data.top) {
                modal.style.left = data.left + 'px';
                modal.style.top = data.top + 'px';
                modal.style.transform = 'none'; // Remove default centering
            }
        }

        // Update the Toggle Button UI immediately
        updateReplaceModeUI();
    }
}

// Helper to sync the button UI with the state
function updateReplaceModeUI() {
    const btn = document.getElementById('btn-ocr-replace-mode');
    if (!btn) return;

    if (ocrState.isReplaceMode) {
        btn.innerHTML = '<span class="material-icons">find_replace</span> Replace: ON';
        btn.style.backgroundColor = '#e8f5e9';
        btn.style.color = '#27ae60';
        btn.style.borderColor = '#27ae60';
    } else {
        btn.innerHTML = '<span class="material-icons">playlist_add</span> Replace: OFF';
        btn.style.backgroundColor = '';
        btn.style.color = '';
        btn.style.borderColor = '';
    }
}

function openOCRPopOut() {
    // 1. Create New Window
    const newWin = window.open('', 'OCR_PopOut', 'width=1000,height=700,menubar=no,toolbar=no,location=no,status=no');

    if (!newWin) {
        showNotification("Pop-up blocked! Please allow pop-ups.", "error");
        return;
    }

    newWin.document.open();

    // 2. Gather Styles
    let cssHtml = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
        cssHtml += node.outerHTML;
    });

    cssHtml += `
        <style>
            body { margin: 0; padding: 0; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
            #ocr-body { flex: 1; height: 100%; border: none; }
            .window-controls, .resize-handle { display: none !important; } 
            #ocr-header { border-radius: 0; cursor: default; }
            .magic-menu { position: fixed; z-index: 99999; }
        </style>
    `;

    // 3. Gather Content
    const headerContent = document.getElementById('ocr-header').innerHTML;
    const bodyContent = document.getElementById('ocr-body').innerHTML;
    const contextMenu = document.getElementById('ocr-context-menu').outerHTML;
    const magicMenu = document.getElementById('magic-menu').outerHTML;

    // 4. Construct Document
    newWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>OCR Assistant - Bill App</title>
            ${cssHtml}
            <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"><\/script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
            <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';<\/script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"><\/script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css" />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"><\/script>
            <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        </head>
        <body>
            <div id="ocr-header">${headerContent}</div>
            <div id="ocr-body">${bodyContent}</div>
            ${contextMenu}
            ${magicMenu}
            
            <script>
                window.ocrState = {
                    cropper: null, currentFile: null, worker: null,
                    extractedValue: '', originalImageSrc: null,
                    isReplaceMode: ${ocrState.isReplaceMode}
                };
                window.magicSelectedText = ""; 

                // Clone generic functions
                ${toggleOCRReplaceMode.toString()}
                ${handleOCRFile.toString()}
                ${ocrProcess.toString()}
                ${processDocumentFile.toString()}
                ${initCropper.toString()}
                ${updateOCRProgress.toString()}
                ${toggleFilterMenu.toString()}   
                ${updateImageFilters.toString()}
                ${resetFilters.toString()}
                ${applyImageFilter.toString()}
                ${parseSmartData.toString()}
                ${createSmartChip.toString()}
                ${openMagicFillMenu.toString()}
                ${copyOCRText.toString()}
                ${showMagicMenu.toString()}
                
                // Inject Toggle Logic
                ${toggleOCRWorkbench.toString()}

                // 3. SPECIAL: Proxy 'magicSelect' to Parent Window
                function magicSelect(targetFieldId, val) {
                    if (window.opener && !window.opener.closed) {
                        // Directly call the parent function
                        window.opener.magicSelect(targetFieldId, val);
                    } else {
                        alert("Main window is closed.");
                    }
                    document.getElementById('magic-menu').style.display = 'none';
                }

                async function magicOperation(action) {
                    const selection = window.magicSelectedText;
                    try {
                        if (action === 'copy') {
                            if (selection) {
                                await navigator.clipboard.writeText(selection);
                                showNotification('Copied to clipboard', 'success');
                            } else {
                                showNotification('No text selected', 'warning');
                            }
                        } 
                        document.getElementById('magic-menu').style.display = 'none';
                    } catch (err) {
                        console.error(err);
                        showNotification('Clipboard action failed', 'error');
                    }
                }

                function magicFillField(targetFieldId) {
                    fillParentField(targetFieldId, window.magicSelectedText);
                    document.getElementById('magic-menu').style.display = 'none';
                }

                function magicFill(targetFieldId) {
                    fillParentField(targetFieldId, window.ocrState.extractedValue);
                    document.getElementById('ocr-context-menu').style.display = 'none';
                }

                function fillParentField(targetFieldId, val) {
                    if (!window.opener || window.opener.closed) {
                        alert("Main Bill App window is closed.");
                        return;
                    }
                    if (targetFieldId === 'copy') {
                        navigator.clipboard.writeText(val);
                        return;
                    }

                    const parentDoc = window.opener.document;
                    const isGSTMode = window.opener.isGSTMode;
                    let finalId = targetFieldId;
                    
                    if (isGSTMode) {
                        if (targetFieldId === 'custName') finalId = 'billToName';
                        if (targetFieldId === 'custGSTIN') finalId = 'billToGstin';
                        if (targetFieldId === 'billDate') finalId = 'bill-date-gst';
                        if (targetFieldId === 'billNo') finalId = 'bill-invoice-no';
                        if (targetFieldId === 'custPhone') finalId = 'billToContact';
                        
                        const el = parentDoc.getElementById(finalId);
                        if (el) {
                            el.textContent = val;
                            if(finalId === 'billToName') {
                                const input = parentDoc.getElementById('consignee-name');
                                if(input) input.value = val;
                            }
                        } else {
                            const inputEl = parentDoc.getElementById(targetFieldId);
                            if(inputEl) updateInput(inputEl, val);
                        }
                    } else {
                        const el = parentDoc.getElementById(targetFieldId);
                        if (el) updateInput(el, val);
                    }
                }

                function updateInput(el, val) {
                    if (window.ocrState.isReplaceMode) {
                        el.value = val;
                    } else {
                        el.value = el.value ? el.value + ' ' + val : val;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    if (el.id === 'itemNameManual' && window.opener.handleItemNameInput) {
                        window.opener.handleItemNameInput();
                    }
                }

                document.addEventListener('DOMContentLoaded', () => {
                    const workbench = document.getElementById('ocr-workbench');
                    workbench.addEventListener('dragover', (e) => { e.preventDefault(); workbench.style.background='#444'; });
                    workbench.addEventListener('drop', (e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files.length) {
                            document.getElementById('ocr-file-input').files = e.dataTransfer.files;
                            handleOCRFile(document.getElementById('ocr-file-input'));
                        }
                    });

                    document.addEventListener('contextmenu', (e) => {
                        const selection = window.getSelection().toString().trim();
                        if (selection.length > 0) {
                            e.preventDefault();
                            window.magicSelectedText = selection; 
                            showMagicMenu(e.clientX, e.clientY);
                        }
                    });

                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('#ocr-context-menu')) {
                            document.getElementById('ocr-context-menu').style.display = 'none';
                        }
                        if (!e.target.closest('#magic-menu')) {
                            document.getElementById('magic-menu').style.display = 'none';
                        }
                        
                        const filterMenu = document.getElementById('filter-menu');
                        const filterBtn = document.getElementById('btn-filter');
                        if (filterMenu && filterMenu.style.display === 'block') {
                            if (!filterMenu.contains(e.target) && (!filterBtn || !filterBtn.contains(e.target))) {
                                filterMenu.style.display = 'none';
                            }
                        }
                    });
                    
                    const savedText = localStorage.getItem('billApp_ocrText');
                    const textArea = document.getElementById('ocr-result');
                    if(savedText && textArea) {
                        textArea.value = savedText;
                        window.ocrState.extractedValue = savedText; 
                        if(typeof parseSmartData === 'function') parseSmartData(savedText);
                    }
                    if(textArea) {
                        textArea.addEventListener('input', () => {
                            localStorage.setItem('billApp_ocrText', textArea.value);
                            window.ocrState.extractedValue = textArea.value;
                        });
                    }
                    
                    const btn = document.getElementById('btn-ocr-replace-mode');
                    if (window.ocrState.isReplaceMode) {
                        btn.style.backgroundColor = '#e8f5e9'; 
                        btn.style.color = '#27ae60';
                        btn.innerHTML = '<span class="material-icons">find_replace</span> Replace: ON';
                    } else {
                        btn.innerHTML = '<span class="material-icons">playlist_add</span> Replace: OFF';
                    }

                    // Nested Flip Logic
                    const magicItems = document.querySelectorAll('.magic-item');
                    magicItems.forEach(item => {
                        item.addEventListener('mouseenter', function() {
                            const subMenu = this.querySelector('.magic-sub-menu');
                            if (subMenu) {
                                const rect = this.getBoundingClientRect();
                                const winWidth = window.innerWidth;
                                const winHeight = window.innerHeight;
                                const subMenuWidth = 160; 
                                const subMenuHeight = subMenu.scrollHeight || 300; 

                                const parentMenu = this.closest('.magic-sub-menu');
                                const isParentFlippedLeft = parentMenu && parentMenu.classList.contains('flip-left');
                                let shouldFlipLeft = isParentFlippedLeft || (rect.right + subMenuWidth > winWidth);
                                
                                if (shouldFlipLeft && (rect.left - subMenuWidth < 0)) {
                                    shouldFlipLeft = false;
                                }

                                if (shouldFlipLeft) {
                                    subMenu.classList.add('flip-left');
                                } else {
                                    subMenu.classList.remove('flip-left');
                                }

                                if (rect.top + subMenuHeight > winHeight) {
                                    subMenu.classList.add('flip-up');
                                } else {
                                    subMenu.classList.remove('flip-up');
                                }
                            }
                        });
                    });
                });
                
                function showNotification(msg) { console.log(msg); }
            <\/script>
        </body>
        </html>
    `);

    newWin.document.close();
    newWin.focus();
    closeOCRModal();
}



/* ==========================================
   BUSINESS DASHBOARD LOGIC
   ========================================== */

let dashboardChartInstance = null;
let currentChartMode = 'sales'; // 'sales' or 'profit'

function openBusinessDashboard() {
    toggleSettingsSidebar(); // Close sidebar
    document.getElementById('dashboard-overlay').style.display = 'flex';
    refreshDashboard(); // Load data
}

function closeBusinessDashboard() {
    document.getElementById('dashboard-overlay').style.display = 'none';
}

function toggleChartType(mode) {
    currentChartMode = mode;
    // Update button states
    const buttons = document.querySelectorAll('.chart-btn');
    buttons.forEach(btn => {
        if (btn.textContent.toLowerCase() === mode) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    refreshDashboard();
}

async function refreshDashboard() {
    const days = parseInt(document.getElementById('dashboard-filter').value) || 30;
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - days);

    // 1. Fetch All Data
    const [salesBills, gstBills, purchaseBills, payments, stockItems] = await Promise.all([
        getAllFromDB('savedBills'),
        getAllFromDB('gstSavedBills'),
        getAllFromDB('vendorSavedBills'),
        getAllFromDB('customerPayments'),
        getAllFromDB('savedItems')
    ]);

    // 2. Filter by Date Range
    const filterDate = (itemDate) => {
        if (!itemDate) return false;
        // Parse dd-mm-yyyy or yyyy-mm-dd
        let d;
        if (itemDate.includes('-')) {
            const parts = itemDate.split('-');
            if (parts[0].length === 4) d = new Date(itemDate); // yyyy-mm-dd
            else d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // dd-mm-yyyy
        } else return false;
        return d >= startDate && d <= today;
    };

    // 3. Process Sales (Regular + GST)
    let totalSales = 0;
    let totalCost = 0; // For profit calc
    const dailySales = {};
    const dailyProfit = {};

    const processBill = (bill) => {
        const val = bill.value;
        const dateStr = val.date || val.invoiceDetails?.date;

        if (filterDate(dateStr)) {
            const amount = parseFloat(val.totalAmount || val.totals?.grandTotal || 0);
            totalSales += amount;

            // Group by Date for Chart
            if (!dailySales[dateStr]) dailySales[dateStr] = 0;
            dailySales[dateStr] += amount;

            // Estimate Cost (Profit Calc)
            let billCost = 0;
            const items = val.items || val.tableStructure || [];
            items.forEach(item => {
                // If we have item details, look up purchase rate
                if (item.type === 'item') {
                    // Try to find purchase rate in saved items or use a stored 'purchaseRate' if we saved it in bill
                    // Simple approximation: assuming 20% margin if cost unknown
                    const rate = parseFloat(item.rate);
                    const qty = parseFloat(item.quantity);
                    billCost += (rate * qty) * 0.8; // Fallback estimate
                }
            });
            totalCost += billCost;

            if (!dailyProfit[dateStr]) dailyProfit[dateStr] = 0;
            dailyProfit[dateStr] += (amount - billCost);
        }
    };

    salesBills.forEach(processBill);
    gstBills.forEach(processBill);

    // 4. Process Purchases (Expenses)
    let totalExpenses = 0;
    purchaseBills.forEach(bill => {
        const val = bill.value;
        if (filterDate(val.billDetails.date)) {
            totalExpenses += parseFloat(val.totalAmount || 0);
        }
    });

    // 5. Process Outstanding (Simplified: Total Sales - Total Payments)
    let totalPayments = 0;
    payments.forEach(p => totalPayments += parseFloat(p.value.amount || 0));
    // Note: Outstanding is cumulative (all time), not just selected period, usually. 
    // But for this view, let's keep it simple or calculate global outstanding.
    // Let's calculate GLOBAL outstanding for the card:
    let globalSales = 0;
    [...salesBills, ...gstBills].forEach(b => {
        globalSales += parseFloat(b.value.totalAmount || b.value.totals?.grandTotal || 0);
    });
    const outstanding = Math.max(0, globalSales - totalPayments);

    // 6. Update UI Cards
    document.getElementById('kpi-total-sales').textContent = `₹${totalSales.toLocaleString('en-IN')}`;
    document.getElementById('kpi-expenses').textContent = `₹${totalExpenses.toLocaleString('en-IN')}`;
    document.getElementById('kpi-outstanding').textContent = `₹${outstanding.toLocaleString('en-IN')}`;

    const profit = totalSales - totalCost; // Simplified profit
    document.getElementById('kpi-profit').textContent = `₹${profit.toLocaleString('en-IN')}`;
    const margin = totalSales > 0 ? ((profit / totalSales) * 100).toFixed(1) : 0;
    document.getElementById('trend-profit').textContent = `Margin: ${margin}%`;

    // 7. Render Chart
    renderChart(dailySales, dailyProfit);

    // 8. Render Lists
    renderLowStockList(stockItems);
    renderRecentActivity(salesBills, gstBills, purchaseBills);
}

function renderChart(salesData, profitData) {
    const ctx = document.getElementById('mainBusinessChart').getContext('2d');

    // Sort dates
    const labels = Object.keys(salesData).sort((a, b) => {
        const da = new Date(a.split('-').reverse().join('-'));
        const db = new Date(b.split('-').reverse().join('-'));
        return da - db;
    });

    const dataPoints = labels.map(date => currentChartMode === 'sales' ? salesData[date] : profitData[date]);

    if (dashboardChartInstance) dashboardChartInstance.destroy();

    const color = currentChartMode === 'sales' ? '#3498db' : '#2ecc71';
    const bg = currentChartMode === 'sales' ? 'rgba(52, 152, 219, 0.1)' : 'rgba(46, 204, 113, 0.1)';

    dashboardChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentChartMode === 'sales' ? 'Daily Sales (₹)' : 'Daily Profit (₹)',
                data: dataPoints,
                borderColor: color,
                backgroundColor: bg,
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderLowStockList(items) {
    const list = document.getElementById('dash-low-stock-list');
    list.innerHTML = '';

    // Filter items where stock <= minStock
    const lowStock = items.filter(i => {
        const stock = parseFloat(i.value.stockQuantity || 0);
        const min = parseFloat(i.value.minStock || 0);
        return stock <= min && min > 0;
    });

    if (lowStock.length === 0) {
        list.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">All items well stocked</div>';
        return;
    }

    lowStock.forEach(i => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div>
                <strong>${i.value.name}</strong><br>
                <small style="color:#777">Min: ${i.value.minStock}</small>
            </div>
            <span class="stock-badge">${i.value.stockQuantity} Left</span>
        `;
        list.appendChild(div);
    });
}

function renderRecentActivity(sales, gst, purchases) {
    const list = document.getElementById('dash-recent-list');
    list.innerHTML = '';

    // Combine and Sort
    const allTxn = [
        ...sales.map(s => ({ ...s.value, type: 'sale', dateStr: s.value.date })),
        ...gst.map(g => ({ ...g.value, type: 'sale', dateStr: g.value.invoiceDetails?.date })),
        ...purchases.map(p => ({ ...p.value, type: 'purchase', dateStr: p.value.billDetails?.date }))
    ];

    // Helper to parse date for sorting
    const parseD = (d) => {
        if (!d) return 0;
        const parts = d.split('-');
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
    };

    allTxn.sort((a, b) => parseD(b.dateStr) - parseD(a.dateStr));

    // Take top 10
    allTxn.slice(0, 10).forEach(t => {
        const isSale = t.type === 'sale';
        const name = isSale ? (t.customer?.name || t.customer?.billTo?.name) : t.vendor?.name;
        const amount = t.totalAmount || t.totals?.grandTotal;

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div>
                <strong>${name}</strong><br>
                <small style="color:#999">${t.dateStr}</small>
            </div>
            <span class="txn-amount ${isSale ? 'in' : 'out'}">
                ${isSale ? '+' : '-'}₹${parseFloat(amount).toLocaleString('en-IN')}
            </span>
        `;
        list.appendChild(div);
    });
}

/* ==========================================================================
   EXPENSE MANAGEMENT MODULE
   ========================================================================== */
const defaultExpenseCategories = [
    'Rent', 'Electricity', 'Salary', 'Transport', 'Food',
    'Marketing', 'Maintenance', 'Office Supplies', 'Other'
];

let expenseState = {
    expenses: [],
    currentFilter: {
        search: '',
        category: 'all',
        mode: 'all',
        startDate: '',
        endDate: '',
        sort: 'date-desc'
    },
    editingId: null,
    currentImage: null
};

// --- MODAL CONTROL ---

// [ADD THIS NEW FUNCTION]
/* --- UPDATED: Load Categories (Fixes Duplicates) --- */
async function loadExpenseCategories(selectedPayload = null) {
    const select = document.getElementById('exp-category');

    // [FIX] Clear existing options first to prevent duplicates
    select.innerHTML = '<option value="">Select Category</option>';

    try {
        let customCats = await getFromDB('settings', 'expenseCategories');
        if (!customCats) customCats = [];

        const allCats = [...new Set([...defaultExpenseCategories, ...customCats])];
        allCats.sort();

        allCats.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });

        if (selectedPayload) {
            select.value = selectedPayload;
        }

    } catch (e) {
        console.error("Error loading categories", e);
        defaultExpenseCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });
    }
}

// [ADD THIS NEW FUNCTION]
function addNewExpenseCategory() {
    const modal = document.getElementById('add-category-modal');
    const input = document.getElementById('new-category-name');

    // Reset input
    input.value = '';

    // Show modal
    modal.style.display = 'block';

    // Auto-focus input
    setTimeout(() => {
        input.focus();
    }, 100);
}
function closeAddCategoryModal() {
    document.getElementById('add-category-modal').style.display = 'none';
}

function openExpenseModal() {
    toggleSettingsSidebar();
    document.getElementById('expense-management-modal').style.display = 'block';

    // Set default date range (First to Last day of current month)
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // [FIX] Use helper to ensure inputs accept the value
    document.getElementById('exp-date-from').value = formatDateForInput(firstDay);
    document.getElementById('exp-date-to').value = formatDateForInput(lastDay);

    loadExpenses();
}


function closeExpenseModal() {
    document.getElementById('expense-management-modal').style.display = 'none';
}

function formatDateForInput(dateSource) {
    if (!dateSource) return '';
    const d = new Date(dateSource);
    if (isNaN(d.getTime())) return ''; // Invalid date
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
}

/* --- UPDATED: Add Modal (Fixes Today's Date) --- */
function openAddExpenseModal() {
    expenseState.editingId = null;
    expenseState.currentImage = null;

    document.getElementById('expense-modal-title').textContent = 'Add New Expense';
    document.getElementById('btn-save-expense').textContent = 'Save Expense';

    document.getElementById('exp-title').value = '';
    document.getElementById('exp-amount').value = '';

    // [FIX] Set Today's date correctly
    document.getElementById('exp-date').value = formatDateForInput(new Date());

    loadExpenseCategories();

    document.getElementById('exp-payment-mode').value = 'Cash';
    document.getElementById('exp-reference').value = '';
    document.getElementById('exp-notes').value = '';
    document.getElementById('exp-image').value = '';

    document.getElementById('exp-image-preview').innerHTML = '';
    document.getElementById('exp-image-preview').style.display = 'none';
    document.getElementById('btn-remove-exp-img').style.display = 'none';

    document.getElementById('add-expense-modal').style.display = 'block';
}

function closeAddExpenseModal() {
    document.getElementById('add-expense-modal').style.display = 'none';
}

async function saveNewCategory() {
    const input = document.getElementById('new-category-name');
    const categoryName = input.value.trim();

    if (!categoryName) {
        showNotification("Please enter a category name", "error");
        input.focus();
        return;
    }

    try {
        // Fetch existing custom categories
        let customCats = await getFromDB('settings', 'expenseCategories');
        if (!customCats) customCats = [];

        // Check duplicates (case insensitive)
        const exists = [...defaultExpenseCategories, ...customCats].some(
            c => c.toLowerCase() === categoryName.toLowerCase()
        );

        if (exists) {
            showNotification("Category already exists!", "warning");

            // Select it in the dropdown anyway
            const select = document.getElementById('exp-category');
            if (select) select.value = categoryName;

            closeAddCategoryModal();
            return;
        }

        // Save to DB
        customCats.push(categoryName);
        await setInDB('settings', 'expenseCategories', customCats);

        // Reload Dropdown & Select New Value
        await loadExpenseCategories(categoryName);

        showNotification(`Category "${categoryName}" added!`, "success");
        closeAddCategoryModal();

    } catch (e) {
        console.error("Error adding category", e);
        showNotification("Failed to save category", "error");
    }
}

function handleCategoryEnter(event) {
    if (event.key === 'Enter') {
        saveNewCategory();
    }
}

// --- IMAGE HANDLING ---

function handleExpenseImage(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Size Check (Max 3MB)
        if (file.size > 3 * 1024 * 1024) {
            showNotification('Image too large (Max 3MB)', 'error');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            expenseState.currentImage = e.target.result; // Base64

            // Show Preview
            const previewBox = document.getElementById('exp-image-preview');
            previewBox.style.display = 'flex';
            previewBox.innerHTML = `<img src="${e.target.result}" style="max-height:100px;">`;
            document.getElementById('btn-remove-exp-img').style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }
}

function removeExpenseImage() {
    expenseState.currentImage = null;
    document.getElementById('exp-image').value = '';
    document.getElementById('exp-image-preview').innerHTML = '';
    document.getElementById('exp-image-preview').style.display = 'none';
    document.getElementById('btn-remove-exp-img').style.display = 'none';
}

// --- CRUD OPERATIONS ---

async function saveExpense() {
    const title = document.getElementById('exp-title').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const date = document.getElementById('exp-date').value;
    const category = document.getElementById('exp-category').value;
    const mode = document.getElementById('exp-payment-mode').value;
    const ref = document.getElementById('exp-reference').value.trim();
    const notes = document.getElementById('exp-notes').value.trim();

    // Validation
    if (!title || isNaN(amount) || amount <= 0 || !date || !category || !mode) {
        showNotification('Please fill all required fields correctly', 'error');
        return;
    }

    const expenseObj = {
        id: expenseState.editingId || `exp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: title,
        amount: amount,
        category: category,
        paymentMode: mode,
        date: date,
        reference: ref,
        notes: notes,
        billImage: expenseState.currentImage,
        createdAt: Date.now()
    };

    try {
        await setInDB('expenses', expenseObj.id, expenseObj);
        showNotification(expenseState.editingId ? 'Expense Updated' : 'Expense Added', 'success');
        closeAddExpenseModal();
        loadExpenses(); // Refresh List
    } catch (e) {
        console.error("Save Expense Error:", e);
        showNotification('Failed to save expense', 'error');
    }
}

async function loadExpenses() {
    try {
        const allExpenses = await getAllFromDB('expenses');
        expenseState.expenses = allExpenses.map(e => e.value);
        filterExpenses(); // This triggers rendering
    } catch (e) {
        console.error("Load Expenses Error:", e);
    }
}

async function deleteExpense(id) {
    if (await showConfirm("Are you sure you want to delete this expense?")) {
        try {
            await removeFromDB('expenses', id);
            showNotification('Expense Deleted', 'success');
            loadExpenses();
        } catch (e) {
            showNotification('Deletion Failed', 'error');
        }
    }
}

/* --- UPDATED: Edit Modal (Fixes Date Loading) --- */
async function editExpense(id) {
    const exp = expenseState.expenses.find(e => e.id === id);
    if (!exp) return;

    openAddExpenseModal();

    expenseState.editingId = id;

    document.getElementById('expense-modal-title').textContent = 'Edit Expense';
    document.getElementById('btn-save-expense').textContent = 'Update Expense';

    document.getElementById('exp-title').value = exp.title;
    document.getElementById('exp-amount').value = exp.amount;

    // [FIX] Convert saved date string to Input format
    document.getElementById('exp-date').value = formatDateForInput(exp.date);

    await loadExpenseCategories(exp.category);

    document.getElementById('exp-payment-mode').value = exp.paymentMode;
    document.getElementById('exp-reference').value = exp.reference || '';
    document.getElementById('exp-notes').value = exp.notes || '';

    if (exp.billImage) {
        expenseState.currentImage = exp.billImage;
        const previewBox = document.getElementById('exp-image-preview');
        previewBox.style.display = 'flex';
        previewBox.innerHTML = `<img src="${exp.billImage}" style="max-height:100px;">`;
        document.getElementById('btn-remove-exp-img').style.display = 'inline-block';
    }
}

// --- FILTERING & RENDERING ---

function filterExpenses() {
    // 1. Get Filter Values
    const search = document.getElementById('exp-search').value.toLowerCase();
    const cat = document.getElementById('exp-filter-category').value;
    const mode = document.getElementById('exp-filter-mode').value;
    const fromDate = document.getElementById('exp-date-from').value;
    const toDate = document.getElementById('exp-date-to').value;
    const sortVal = document.getElementById('exp-sort').value;

    // 2. Filter Array
    let filtered = expenseState.expenses.filter(e => {
        // Search (Title, Ref, Notes)
        const matchSearch = e.title.toLowerCase().includes(search) ||
            (e.reference && e.reference.toLowerCase().includes(search)) ||
            (e.notes && e.notes.toLowerCase().includes(search));

        // Category
        const matchCat = cat === 'all' || e.category === cat;

        // Mode
        const matchMode = mode === 'all' || e.paymentMode === mode;

        // Date Range
        let matchDate = true;
        if (fromDate && toDate) {
            matchDate = e.date >= fromDate && e.date <= toDate;
        }

        return matchSearch && matchCat && matchMode && matchDate;
    });

    // 3. Sort Array
    filtered.sort((a, b) => {
        if (sortVal === 'date-desc') return new Date(b.date) - new Date(a.date);
        if (sortVal === 'date-asc') return new Date(a.date) - new Date(b.date);
        if (sortVal === 'amount-desc') return b.amount - a.amount;
        if (sortVal === 'amount-asc') return a.amount - b.amount;
        return 0;
    });

    // 4. Render
    renderExpenseTable(filtered);
    renderExpenseAnalytics(filtered);
}

function renderExpenseTable(data) {
    const tbody = document.getElementById('expense-list-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No expenses found</td></tr>';
        return;
    }

    data.forEach(exp => {
        const tr = document.createElement('tr');

        // Format Date (DD-MM-YYYY)
        const dateObj = new Date(exp.date);
        const displayDate = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${dateObj.getFullYear()}`;

        // View Bill Button if image exists
        let imgBtn = '';
        if (exp.billImage) {
            imgBtn = `<button class="action-btn" onclick="viewExpenseImage('${exp.id}')" title="View Bill"><span class="material-icons" style="font-size:16px; color:#3498db;">receipt</span></button>`;
        }

        tr.innerHTML = `
            <td>${displayDate}</td>
            <td>
                <div style="font-weight:600;">${exp.title}</div>
                ${exp.reference ? `<div style="font-size:0.85em; color:#666;">Ref: ${exp.reference}</div>` : ''}
            </td>
            <td><span class="stock-badge" style="background:#f0f0f0; color:#333;">${exp.category}</span></td>
            <td>${exp.paymentMode}</td>
            <td style="font-weight:bold; color:#e74c3c;">₹${exp.amount.toFixed(2)}</td>
            <td>
                <div class="action-buttons">
                    ${imgBtn}
                    <button class="action-btn" onclick="editExpense('${exp.id}')" title="Edit"><span class="material-icons" style="font-size:16px;">edit</span></button>
                    <button class="action-btn remove-btn" onclick="deleteExpense('${exp.id}')" title="Delete"><span class="material-icons" style="font-size:16px;">delete</span></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function viewExpenseImage(id) {
    const exp = expenseState.expenses.find(e => e.id === id);
    if (exp && exp.billImage) {
        // Reuse existing file viewer modal logic
        const modal = document.getElementById('file-viewer-modal');
        const img = document.getElementById('file-viewer-img');
        const iframe = document.getElementById('file-viewer-pdf');

        modal.style.display = 'flex';
        img.style.display = 'block';
        iframe.style.display = 'none';

        img.src = exp.billImage;
        initImageZoom(); // Reuse zoom logic
    }
}

// --- ANALYTICS ---

function renderExpenseAnalytics(data) {
    // 1. Calculate Summary Cards
    const totalAmount = data.reduce((sum, e) => sum + e.amount, 0);

    // Today's Expense
    const todayStr = new Date().toISOString().split('T')[0];
    const todayAmount = data.filter(e => e.date === todayStr).reduce((sum, e) => sum + e.amount, 0);

    // Last Expense
    const lastExp = data.length > 0 ? data[0] : null; // Data is already sorted if desc

    // Category Breakdown
    const catMap = {};
    data.forEach(e => {
        catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });

    // Find Top Category
    let topCat = '-';
    let topCatAmount = 0;
    Object.entries(catMap).forEach(([cat, amt]) => {
        if (amt > topCatAmount) {
            topCatAmount = amt;
            topCat = cat;
        }
    });

    // Update Cards
    document.getElementById('exp-summary-total').textContent = `₹${totalAmount.toLocaleString('en-IN')}`;
    document.getElementById('exp-summary-today').textContent = `₹${todayAmount.toLocaleString('en-IN')}`;
    document.getElementById('exp-summary-category').textContent = topCat;
    document.getElementById('exp-summary-last').textContent = lastExp ? `₹${lastExp.amount}` : '-';

    // 2. Render Bar Chart
    const chartContainer = document.getElementById('expense-chart-container');
    chartContainer.innerHTML = '';

    // Sort categories by amount desc
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    sortedCats.forEach(([cat, amt]) => {
        const percent = totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) : 0;

        // Define color based on category (Simple hash or fixed list)
        const colors = {
            'Rent': '#e74c3c', 'Electricity': '#f1c40f', 'Salary': '#2ecc71',
            'Food': '#3498db', 'Transport': '#9b59b6', 'Other': '#95a5a6'
        };
        const color = colors[cat] || '#34495e';

        const barHtml = `
            <div class="chart-bar-row">
                <div class="chart-bar-label">
                    <span>${cat}</span>
                    <span>₹${amt.toLocaleString('en-IN')} (${percent}%)</span>
                </div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="width: ${percent}%; background-color: ${color};"></div>
                </div>
            </div>
        `;
        chartContainer.innerHTML += barHtml;
    });
}

function exportExpensesPDF() {
    const element = document.querySelector('.expense-main-panel'); // Export the table view
    const opt = {
        margin: [10, 10, 10, 10],
        filename: `Expense_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Temporarily adjust styling for print
    const originalOverflow = element.querySelector('.expense-table-wrapper').style.overflow;
    element.querySelector('.expense-table-wrapper').style.overflow = 'visible';

    html2pdf().set(opt).from(element).save().then(() => {
        // Revert style
        element.querySelector('.expense-table-wrapper').style.overflow = originalOverflow;
    });
}


// ==========================================
// NEW SIDEBAR LOGIC
// ==========================================

function toggleSettingsSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('settings-overlay');

    // Check if currently open
    const isOpen = sidebar.classList.contains('open');

    if (isOpen) {
        // Close
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        closeSubMenu(); // Reset sub-menus
    } else {
        // Open
        sidebar.classList.add('open');
        overlay.classList.add('open');
    }
}

function toggleSubMenu(categoryId, btnElement) {
    const submenuContainer = document.getElementById('sidebar-submenus');
    const allGroups = document.querySelectorAll('.sub-menu-group');
    const allBtns = document.querySelectorAll('.sidebar-cat-btn');

    // 1. Reset all buttons
    allBtns.forEach(b => b.classList.remove('active'));

    // 2. Identify target group
    const targetGroup = document.getElementById('sub-' + categoryId);

    // 3. Logic: If clicking active category -> Close. If new -> Open.
    const isAlreadyOpen = submenuContainer.classList.contains('open') && targetGroup.classList.contains('active');

    if (isAlreadyOpen) {
        closeSubMenu();
    } else {
        // Open Submenu
        submenuContainer.classList.add('open');

        // Hide all groups
        allGroups.forEach(g => g.classList.remove('active'));

        // Show target group
        if (targetGroup) targetGroup.classList.add('active');

        // Highlight button
        if (btnElement) btnElement.classList.add('active');
    }
}

function closeSubMenu() {
    const submenuContainer = document.getElementById('sidebar-submenus');
    const allBtns = document.querySelectorAll('.sidebar-cat-btn');

    submenuContainer.classList.remove('open');
    allBtns.forEach(b => b.classList.remove('active'));
}

// Close sidebar when clicking overlay
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) {
        overlay.onclick = toggleSettingsSidebar;
    }
});

/* ==========================================
   PERSONALIZATION MODULE (Windows 11 Style)
   ========================================== */

const defaultPznState = {
    mode: 'solid',
    color: '#f9f9f9', // Default App Background Color
    image: null,
    fit: 'cover',
    brightness: 100,
    contrast: 100,
    blur: 0
};

let pznState = { ...defaultPznState };

const winColors = [
    '#f9f9f9', '#ffffff', '#e8f4fd', '#eafaf1', '#fdedec', 
    '#fef5e7', '#f5eef8', '#e0f7fa', '#333333', '#000000'
];

document.addEventListener('DOMContentLoaded', async () => {
    // ... existing init calls ...
    await loadPersonalizationState();
    initPznColorGrid();
});

// Initialize Color Dots in Modal
function initPznColorGrid() {
    const grid = document.getElementById('pzn-colorGrid');
    if(!grid) return;
    
    // Clear existing dots (except custom picker)
    const custom = grid.querySelector('.custom-color-wrapper');
    grid.innerHTML = '';
    if(custom) grid.appendChild(custom);

    winColors.forEach(c => {
        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.backgroundColor = c;
        dot.title = c;
        dot.onclick = () => handlePznColorSelect(c, dot);
        grid.insertBefore(dot, custom);
    });
}

function openPersonalizeModal() {
    toggleSettingsSidebar(); // Close sidebar
    document.getElementById('personalize-modal').style.display = 'block';
    
    // Sync UI Inputs with current state
    document.getElementById('pzn-bgTypeSelect').value = pznState.mode;
    document.getElementById('pzn-fitSelect').value = pznState.fit;
    document.getElementById('pzn-customColorPicker').value = pznState.color;
    
    document.getElementById('pzn-brightnessSlider').value = pznState.brightness;
    document.getElementById('pzn-contrastSlider').value = pznState.contrast;
    document.getElementById('pzn-blurSlider').value = pznState.blur;

    handlePznTypeChange(); // Show/Hide correct sections based on mode
    updatePznPreview();    // Render preview
}

function closePersonalizeModal() {
    document.getElementById('personalize-modal').style.display = 'none';
}

function handlePznTypeChange() {
    const mode = document.getElementById('pzn-bgTypeSelect').value;
    pznState.mode = mode;

    const picOpts = document.getElementById('pzn-pictureOptions');
    const fitOpts = document.getElementById('pzn-fitOptions');
    const solidOpts = document.getElementById('pzn-solidOptions');

    if (mode === 'picture') {
        picOpts.classList.remove('hidden');
        fitOpts.classList.remove('hidden');
        solidOpts.classList.add('hidden');
    } else {
        picOpts.classList.add('hidden');
        fitOpts.classList.add('hidden');
        solidOpts.classList.remove('hidden');
    }
    updatePznPreview();
}

function handlePznColorSelect(color, dotElement) {
    pznState.color = color;
    pznState.mode = 'solid'; // Force mode if clicking color
    document.getElementById('pzn-bgTypeSelect').value = 'solid';
    handlePznTypeChange();
    
    // Update active class visual
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    if(dotElement) dotElement.classList.add('active');
    
    document.getElementById('pzn-customColorPicker').value = color;
    updatePznPreview();
}

function handlePznColorInput(input) {
    pznState.color = input.value;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    updatePznPreview();
}

function handlePznImageUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            pznState.image = e.target.result;
            // Switch mode to picture automatically
            pznState.mode = 'picture';
            document.getElementById('pzn-bgTypeSelect').value = 'picture';
            handlePznTypeChange();
            updatePznPreview();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function updatePznPreview() {
    // Get current values from inputs
    const fit = document.getElementById('pzn-fitSelect').value;
    const b = document.getElementById('pzn-brightnessSlider').value;
    const c = document.getElementById('pzn-contrastSlider').value;
    const blur = document.getElementById('pzn-blurSlider').value;

    // Update State object
    pznState.fit = fit;
    pznState.brightness = b;
    pznState.contrast = c;
    pznState.blur = blur;

    // Update Slider Label Text
    document.getElementById('pzn-brightnessVal').textContent = b + '%';
    document.getElementById('pzn-contrastVal').textContent = c + '%';
    document.getElementById('pzn-blurVal').textContent = blur + 'px';

    // Apply to Preview Box
    const target = document.getElementById('pzn-previewScreen');
    applyStylesToTarget(target);
}

function applyStylesToTarget(target) {
    if (!target) return;

    let css = '';
    
    if (pznState.mode === 'picture' && pznState.image) {
        css += `background-image: url('${pznState.image}'); background-color: #333; `;
        
        switch(pznState.fit) {
            case 'cover': css += `background-size: cover; background-position: center; background-repeat: no-repeat;`; break;
            case 'contain': css += `background-size: contain; background-position: center; background-repeat: no-repeat;`; break;
            case '100% 100%': css += `background-size: 100% 100%; background-position: center; background-repeat: no-repeat;`; break;
            case 'repeat': css += `background-size: auto; background-position: top left; background-repeat: repeat;`; break;
            case 'auto': css += `background-size: auto; background-position: center; background-repeat: no-repeat;`; break;
        }
    } else {
        // Solid Color Mode
        css += `background-image: none; background-color: ${pznState.color};`;
    }

    // Apply Filters
    css += `filter: brightness(${pznState.brightness}%) contrast(${pznState.contrast}%) blur(${pznState.blur}px);`;
    
    // Scale correction for blur edges
    if (pznState.mode === 'picture' && pznState.fit === 'cover' && pznState.blur > 0) {
        css += `transform: scale(1.02);`;
    } else {
        css += `transform: scale(1);`;
    }

    target.style.cssText = css;
}

function saveAndApplyPersonalization() {
    // 1. Apply to the dedicated background layer
    const bgLayer = document.getElementById('app-background');
    if (bgLayer) {
        applyStylesToTarget(bgLayer);
    }

    // 2. Persist to Database
    setInDB('settings', 'personalization', pznState)
        .then(() => showNotification('Personalization saved!', 'success'))
        .catch(e => console.error("Save error", e));
        
    closePersonalizeModal();
}

function resetPersonalization() {
    // Revert to defaults
    pznState = { ...defaultPznState };
    
    // Update Inputs
    document.getElementById('pzn-bgTypeSelect').value = 'solid';
    document.getElementById('pzn-customColorPicker').value = defaultPznState.color;
    document.getElementById('pzn-brightnessSlider').value = 100;
    document.getElementById('pzn-contrastSlider').value = 100;
    document.getElementById('pzn-blurSlider').value = 0;
    
    // Reset Active Color Dots
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));

    handlePznTypeChange();
    updatePznPreview();
}

async function loadPersonalizationState() {
    // 1. Apply Defaults IMMEDIATELY (Visual feedback)
    const bgLayer = document.getElementById('app-background');
    if (bgLayer) {
        applyStylesToTarget(bgLayer);
    }

    try {
        // 2. Load Saved Settings (Overwrite defaults if found)
        const saved = await getFromDB('settings', 'personalization');
        if (saved) {
            pznState = { ...defaultPznState, ...saved };
            // Re-apply with saved settings
            if (bgLayer) {
                applyStylesToTarget(bgLayer);
            }
        }
    } catch (e) {
        console.error("Error loading personalization", e);
    }
}



/* ==========================================
   REGULAR BILL SYSTEM (Separate Modal)
   ========================================== */

let regBillConfig = {
    type: 'Estimate',
    prefix: 'EST',
    isLocked: true,
    viewMode: 'simple' // simple, bill_to, both
};

// Custom Types Storage
let regCustomTypes = JSON.parse(localStorage.getItem('regCustomTypes')) || [];

// 1. Open/Close Logic
function openRegularBillModal() {
    // 1. Close Sidebar Logic (Calling the function you requested)
    if (typeof toggleSettingsSidebar === 'function') {
        toggleSettingsSidebar();
    }
    
    // Also close submenus if needed
    if (typeof closeSubMenu === 'function') {
        closeSubMenu();
    }

    // 2. Open Modal Logic
    document.getElementById('regular-details-modal').style.display = 'block';
    
    // Initialize Defaults if needed
    if(!document.getElementById('reg-modal-date').value) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        document.getElementById('reg-modal-date').value = `${day}-${month}-${year}`;
    }
    
    initRegBillTypes(); // Load types
    handleRegTypeChange(); // Sync prefix
}

function closeRegularModal() {
    document.getElementById('regular-details-modal').style.display = 'none';
}

// 2. Bill Type & Prefix Logic
function initRegBillTypes() {
    const select = document.getElementById('reg-modal-type-select');
    
    regCustomTypes.forEach(ct => {
        if (![...select.options].some(o => o.value === ct.name)) {
            const opt = document.createElement('option');
            opt.value = ct.name;
            opt.textContent = ct.name;
            // Insert before 'Custom' (last option)
            select.insertBefore(opt, select.querySelector('option[value="Custom"]'));
        }
    });
}

/* Update this function to LOAD saved prefixes correctly */
function handleRegTypeChange() {
    const type = document.getElementById('reg-modal-type-select').value;
    const prefixInput = document.getElementById('reg-modal-prefix');
    const customPanel = document.getElementById('reg-custom-type-panel');
    const saveBtn = document.getElementById('reg-save-custom-btn');

    regBillConfig.type = type;

    // 1. Update the Main Bill Heading in the Background View
    // This removes the need for the manual input
    const mainHeader = document.querySelector('.invoice-title') || document.querySelector('h1.invoice-header');
    if (mainHeader) {
        mainHeader.textContent = type.toUpperCase();
        // Also update any hidden input if your legacy code relies on it
        const legacyInput = document.getElementById('regular-heading-input');
        if(legacyInput) legacyInput.value = type.toUpperCase();
    }

    if (type === 'Custom') {
        customPanel.style.display = 'block';
        saveBtn.style.display = 'block';
        prefixInput.value = '';
        prefixInput.disabled = false;
        regBillConfig.isLocked = false;
    } else {
        customPanel.style.display = 'none';
        saveBtn.style.display = 'none';
        
        // 2. Determine Prefix (Check Saved First, then Defaults)
        let newPrefix = '';
        const savedType = regCustomTypes.find(t => t.name === type);
        
        if (savedType) {
            newPrefix = savedType.prefix;
        } else {
            // Default Fallbacks if user hasn't customized them yet
            switch(type) {
                case 'Estimate': newPrefix = 'EST'; break;
                case 'Quotation': newPrefix = 'QTN'; break;
                case 'Purchase Order': newPrefix = 'PO'; break;
                case 'Work Order': newPrefix = 'WO'; break;
                default: newPrefix = '';
            }
        }
        
        prefixInput.value = newPrefix;
        regBillConfig.prefix = newPrefix;
        
        // Lock it by default when switching types
        regBillConfig.isLocked = true;
        prefixInput.disabled = true;
    }
    updateRegLockIcon();
}

/* Update this function to SAVE prefix when locking */
function toggleRegPrefixLock() {
    const input = document.getElementById('reg-modal-prefix');
    const currentType = document.getElementById('reg-modal-type-select').value;
    
    // Toggle Lock State
    regBillConfig.isLocked = !regBillConfig.isLocked;
    input.disabled = regBillConfig.isLocked;
    updateRegLockIcon();

    // LOGIC: If we just LOCKED it, save the new prefix for this Bill Type
    if (regBillConfig.isLocked) {
        const newPrefix = input.value.trim();
        
        // 1. Find if this type already exists in saved types
        const existingIndex = regCustomTypes.findIndex(t => t.name === currentType);
        
        if (existingIndex >= 0) {
            // Update existing
            regCustomTypes[existingIndex].prefix = newPrefix;
        } else {
            // Add new override for standard type (e.g. Estimate)
            regCustomTypes.push({ name: currentType, prefix: newPrefix });
        }
        
        // 2. Save to LocalStorage
        localStorage.setItem('regCustomTypes', JSON.stringify(regCustomTypes));
        regBillConfig.prefix = newPrefix;
        
        showNotification(`Prefix for ${currentType} updated to ${newPrefix}`, 'success');
    } else {
        // We just unlocked it, focus the input
        input.focus();
    }
}

function updateRegLockIcon() {
    const btn = document.getElementById('reg-prefix-lock-btn');
    const icon = btn.querySelector('.material-icons');
    if (regBillConfig.isLocked) {
        icon.textContent = 'lock';
        btn.classList.remove('unlocked');
    } else {
        icon.textContent = 'lock_open';
        btn.classList.add('unlocked');
    }
}

function saveRegCustomType() {
    const name = document.getElementById('reg-custom-name-input').value.trim();
    const prefix = document.getElementById('reg-custom-prefix-input').value.trim();
    if (!name) return alert('Enter Type Name');

    regCustomTypes.push({ name, prefix });
    localStorage.setItem('regCustomTypes', JSON.stringify(regCustomTypes));
    
    initRegBillTypes(); // Reload select
    
    // Auto-select
    document.getElementById('reg-modal-type-select').value = name;
    handleRegTypeChange();
}

// 3. Customer View Logic
function handleRegViewChange() {
    const view = document.getElementById('reg-modal-cust-view-select').value;
    regBillConfig.viewMode = view;

    const simpleSec = document.getElementById('reg-modal-simple-section');
    const advSec = document.getElementById('reg-modal-advanced-section');
    const shipCol = document.getElementById('reg-modal-ship-col');

    if (view === 'simple') {
        simpleSec.style.display = 'block';
        advSec.style.display = 'none';
    } else {
        simpleSec.style.display = 'none';
        advSec.style.display = 'block'; // Enable Flexbox
        
        if (view === 'both') {
            shipCol.style.display = 'block';
        } else {
            shipCol.style.display = 'none';
        }
    }
}

function copyRegBillToShip() {
    document.getElementById('reg-modal-ship-name').value = document.getElementById('reg-modal-bill-name').value;
    document.getElementById('reg-modal-ship-addr').value = document.getElementById('reg-modal-bill-addr').value;
    document.getElementById('reg-modal-ship-gst').value = document.getElementById('reg-modal-bill-gst').value;
    document.getElementById('reg-modal-ship-phone').value = document.getElementById('reg-modal-bill-phone').value;
    document.getElementById('reg-modal-ship-state').value = document.getElementById('reg-modal-bill-state').value;
    document.getElementById('reg-modal-ship-code').value = document.getElementById('reg-modal-bill-code').value;
}

// 4. Save & Update View Logic (MAIN FUNCTION)
/* ==========================================
   FINAL SAVE FUNCTION (With State Hiding)
   ========================================== */
function saveRegularBillDetails(isSilentLoad = false) {
    // 1. Get Data
    const typeEl = document.getElementById('reg-modal-type-select');
    const prefixEl = document.getElementById('reg-modal-prefix');
    const rawNoEl = document.getElementById('reg-modal-invoice-no');
    const dateEl = document.getElementById('reg-modal-date');

    const type = typeEl ? typeEl.value : '';
    const prefix = prefixEl ? prefixEl.value : '';
    const rawNo = rawNoEl ? rawNoEl.value : '';
    const date = dateEl ? dateEl.value : '';
    
    const formattedInvoiceNo = prefix ? `${prefix}/${rawNo}` : rawNo;

    // 2. Sync Heading
    if (typeof syncBillHeadingToSettings === 'function') {
        syncBillHeadingToSettings(type);
    }

    // 3. Update Global Meta
    const dispNo = document.getElementById('disp-reg-invoice-no');
    const dispDate = document.getElementById('disp-reg-date');
    if (dispNo) dispNo.textContent = formattedInvoiceNo;
    if (dispDate) dispDate.textContent = date;

    // 4. Update Table View (Prefix + Input)
    const prefixSpan = document.getElementById('billPrefixDisplay');
    const numberInput = document.getElementById('billNo');
    if (prefixSpan) prefixSpan.textContent = prefix ? `${prefix}/` : ''; 
    if (numberInput) numberInput.value = rawNo; 

    // 5. Handle View Switching
    const viewMode = regBillConfig.viewMode;
    const defaultView = document.getElementById('reg-default-view');
    const advancedView = document.getElementById('reg-advanced-view');
    const shipCol = document.getElementById('adv-ship-col');

    if (viewMode === 'simple') {
        // --- TABLE VIEW ---
        if(defaultView) defaultView.style.display = 'block';
        if(advancedView) advancedView.style.display = 'none';

        const custName = document.getElementById('custName');
        const custPhone = document.getElementById('custPhone');
        const custAddr = document.getElementById('custAddr');
        const billDate = document.getElementById('billDate');
        
        if(custName) custName.value = document.getElementById('reg-modal-simple-name').value;
        if(custPhone) custPhone.value = document.getElementById('reg-modal-simple-phone').value;
        if(custAddr) custAddr.value = document.getElementById('reg-modal-simple-addr').value;
        if(billDate) billDate.value = date;
        
        if(typeof saveToLocalStorage === 'function') saveToLocalStorage();

    } else {
        // --- ADVANCED VIEW ---
        if(defaultView) defaultView.style.display = 'none';
        if(advancedView) advancedView.style.display = 'block';

        const advNo = document.getElementById('adv-invoice-no');
        const advDate = document.getElementById('adv-bill-date');
        if(advNo) advNo.textContent = formattedInvoiceNo;
        if(advDate) advDate.textContent = date;

        // --- HELPER 1: Standard Fields ---
        const updateField = (viewId, modalId, hideParent = false) => {
            const el = document.getElementById(viewId);
            const val = document.getElementById(modalId).value.trim();
            
            if (!el) return;
            el.textContent = val || '-';

            const isEmpty = (val === '' || val === '-');
            const targetToHide = hideParent ? el.parentElement : el;
            
            if (isEmpty) {
                targetToHide.style.display = 'none';
            } else {
                targetToHide.style.display = hideParent ? '' : 'block'; 
            }
        };

        // --- HELPER 2: State Line (Special Case) ---
        const updateStateLine = (viewStateId, viewCodeId, modalStateId, modalCodeId) => {
            const stateVal = document.getElementById(modalStateId).value.trim();
            const codeVal = document.getElementById(modalCodeId).value.trim();
            const stateEl = document.getElementById(viewStateId);
            const codeEl = document.getElementById(viewCodeId);
            
            if(!stateEl || !codeEl) return;

            // Update text
            stateEl.textContent = stateVal;
            codeEl.textContent = codeVal;

            // Logic: Hide line ONLY if BOTH are empty
            const parentRow = stateEl.parentElement; // The div containing "State: ..."
            
            if (stateVal === '' && codeVal === '') {
                 parentRow.style.display = 'none';
            } else {
                 parentRow.style.display = ''; // Reset to default (block/flex)
            }
        };

        // --- BILL TO UPDATES ---
        updateField('adv-bill-name', 'reg-modal-bill-name', false);
        updateField('adv-bill-addr', 'reg-modal-bill-addr', false);
        updateField('adv-bill-gst', 'reg-modal-bill-gst', true);
        updateField('adv-bill-phone', 'reg-modal-bill-phone', true);
        // New State Logic
        updateStateLine('adv-bill-state', 'adv-bill-code', 'reg-modal-bill-state', 'reg-modal-bill-code');

        // --- SHIP TO UPDATES ---
        if (viewMode === 'both') {
            if(shipCol) shipCol.style.display = 'block';
            
            updateField('adv-ship-name', 'reg-modal-ship-name', false);
            updateField('adv-ship-addr', 'reg-modal-ship-addr', false);
            updateField('adv-ship-gst', 'reg-modal-ship-gst', true);
            updateField('adv-ship-phone', 'reg-modal-ship-phone', true);
            updateField('adv-ship-pos', 'reg-modal-ship-pos', true);
            // New State Logic
            updateStateLine('adv-ship-state', 'adv-ship-code', 'reg-modal-ship-state', 'reg-modal-ship-code');

        } else {
            if(shipCol) shipCol.style.display = 'none';
        }
    }

    // 6. Persist
    if(typeof saveRegularModalState === 'function') {
        saveRegularModalState(); 
    }

    if (!isSilentLoad) {
        closeRegularModal();
        if(typeof showNotification === 'function') showNotification('Bill details updated', 'success');
    }
}

function clearRegularModal() {
    // Clear all inputs inside the modal
    const inputs = document.querySelectorAll('#regular-details-modal input, #regular-details-modal textarea');
    inputs.forEach(i => i.value = '');
    
    // Reset defaults
    handleRegTypeChange(); // Resets prefix
    document.getElementById('reg-modal-cust-view-select').value = 'simple';
    handleRegViewChange();
}

// 5. Saved Bills Filtering
function updateSavedBillsFilterOptions(bills) {
    const select = document.getElementById('saved-prefix-filter');
    if(!select) return;
    select.innerHTML = '<option value="all">All Prefixes</option>';
    
    // Extract unique prefixes (Handle null/undefined)
    const prefixes = new Set(bills.map(b => b.prefix || 'None').filter(p => p));
    prefixes.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
    });
}

function applySavedBillsFilter() {
    const prefix = document.getElementById('saved-prefix-filter').value;
    const searchText = document.getElementById('saved-bills-search').value.toLowerCase();
    
    // Determine source array (Ensure variable compatibility)
    let source = (typeof gstSavedBills !== 'undefined' && currentBillsMode === 'gst' ? gstSavedBills : regularSavedBills);
    
    // Filter
    const filtered = source.filter(bill => {
        const matchesPrefix = (prefix === 'all') || ((bill.prefix || 'None') === prefix);
        const matchesSearch = (bill.billNo?.toString().toLowerCase().includes(searchText) || 
                               bill.custName?.toLowerCase().includes(searchText));
        return matchesPrefix && matchesSearch;
    });

    // Reuse your existing render function
    const listContainer = document.getElementById('saved-bills-list');
    listContainer.innerHTML = '';
    // Call your existing card creator
    if(typeof createSavedBillCard === 'function') {
        filtered.forEach(bill => createSavedBillCard(bill));
    }
}

/* ==========================================
   REAL-TIME SYNC LOGIC (View <-> Modal)
   ========================================== */

/* ==========================================
   UPDATED SYNC LOGIC (With Auto-Save)
   ========================================== */

function syncRegularData(source) {
    // 1. Define Elements (Main View)
    const viewName = document.getElementById('custName');
    const viewPhone = document.getElementById('custPhone');
    const viewAddr = document.getElementById('custAddr');
    const viewBillNo = document.getElementById('billNo');
    const viewDate = document.getElementById('billDate');
    const viewGST = document.getElementById('custGSTIN');

    // 2. Define Elements (Modal)
    const modalName = document.getElementById('reg-modal-simple-name');
    const modalPhone = document.getElementById('reg-modal-simple-phone');
    const modalAddr = document.getElementById('reg-modal-simple-addr');
    const modalInvoiceNo = document.getElementById('reg-modal-invoice-no');
    const modalDate = document.getElementById('reg-modal-date');
    
    // Modal Advanced Elements
    const modalBillName = document.getElementById('reg-modal-bill-name');
    const modalBillPhone = document.getElementById('reg-modal-bill-phone');
    const modalBillAddr = document.getElementById('reg-modal-bill-addr');
    const modalBillGST = document.getElementById('reg-modal-bill-gst');

    if (source === 'view') {
        // --- CASE A: User typing in MAIN VIEW ---
        
        // 1. Push values to Modal Inputs
        if(modalName) modalName.value = viewName.value;
        if(modalPhone) modalPhone.value = viewPhone.value;
        if(modalAddr) modalAddr.value = viewAddr.value;
        if(modalInvoiceNo) modalInvoiceNo.value = viewBillNo.value;
        if(modalDate) modalDate.value = viewDate.value;

        // 2. Push to Advanced Modal fields (backup)
        if(modalBillName) modalBillName.value = viewName.value;
        if(modalBillPhone) modalBillPhone.value = viewPhone.value;
        if(modalBillAddr) modalBillAddr.value = viewAddr.value;
        if(modalBillGST) modalBillGST.value = viewGST.value;

        // 3. NEW: Auto-Save the Modal State immediately!
        // This updates 'regularBillState' in localStorage as you type.
        if(typeof saveRegularModalState === 'function') {
            saveRegularModalState();
        }

    } else {
        // --- CASE B: User typing in MODAL ---
        
        // Push values to Main View Inputs
        if(viewName) viewName.value = modalName.value;
        if(viewPhone) viewPhone.value = modalPhone.value;
        if(viewAddr) viewAddr.value = modalAddr.value;
        if(viewBillNo) viewBillNo.value = modalInvoiceNo.value;
        if(viewDate) viewDate.value = modalDate.value;
        
        // Trigger existing legacy save logic if it exists
        if(typeof saveToLocalStorage === 'function') saveToLocalStorage();
        if(typeof handleRegularCustomerSearch === 'function') handleRegularCustomerSearch();
    }
}
// Helper Function to Sync & Save Heading
function syncBillHeadingToSettings(typeVal) {
    const text = typeVal.toUpperCase();
    
    // 1. Update the Input in the hidden Settings Modal
    const settingsInput = document.getElementById('regular-heading-input');
    if(settingsInput) {
        settingsInput.value = text;
    }

    // 2. Update the Visual Header on Page immediately
    const pageHeader = document.querySelector('.invoice-title') || document.querySelector('h1');
    if(pageHeader) pageHeader.textContent = text;

    // 3. Trigger the Save Logic to Persist it
    if(typeof saveBillHeadings === 'function') {
         // We wrap the existing save function to prevent it from closing the wrong modal
         // or throwing errors if the modal isn't open.
         const originalClose = window.closeBillHeadingModal;
         window.closeBillHeadingModal = function() { /* No-op to prevent error */ };
         
         saveBillHeadings(); 
         
         window.closeBillHeadingModal = originalClose; // Restore original function
    }
}

/* ==========================================
   STATE PERSISTENCE (Save/Load)
   ========================================== */

   document.addEventListener('DOMContentLoaded', () => {
    // ... your other init code ...
    initRegBillTypes();    // Load custom types options
    loadRegularModalState(); // Load state and apply to view
});

function saveRegularModalState() {
    const state = {
        // 1. Config
        type: document.getElementById('reg-modal-type-select').value,
        prefix: document.getElementById('reg-modal-prefix').value,
        invoiceNo: document.getElementById('reg-modal-invoice-no').value,
        date: document.getElementById('reg-modal-date').value,
        viewMode: document.getElementById('reg-modal-cust-view-select').value,
        isLocked: regBillConfig.isLocked,

        // 2. Simple Data
        simple: {
            name: document.getElementById('reg-modal-simple-name').value,
            phone: document.getElementById('reg-modal-simple-phone').value,
            addr: document.getElementById('reg-modal-simple-addr').value
        },

        // 3. Advanced Data
        billTo: {
            name: document.getElementById('reg-modal-bill-name').value,
            addr: document.getElementById('reg-modal-bill-addr').value,
            gst: document.getElementById('reg-modal-bill-gst').value,
            phone: document.getElementById('reg-modal-bill-phone').value,
            state: document.getElementById('reg-modal-bill-state').value,
            code: document.getElementById('reg-modal-bill-code').value,
            
        },
        shipTo: {
            name: document.getElementById('reg-modal-ship-name').value,
            addr: document.getElementById('reg-modal-ship-addr').value,
            gst: document.getElementById('reg-modal-ship-gst').value,
            phone: document.getElementById('reg-modal-ship-phone').value,
            state: document.getElementById('reg-modal-ship-state').value,
            code: document.getElementById('reg-modal-ship-code').value,
            pos: document.getElementById('reg-modal-ship-pos').value
        }
    };

    localStorage.setItem('regularBillState', JSON.stringify(state));
}

/* ==========================================
   FIXED LOAD FUNCTION (Respects Saved State)
   ========================================== */
function loadRegularModalState() {
    const savedJSON = localStorage.getItem('regularBillState');
    if (!savedJSON) return; // No saved state, keep defaults

    const state = JSON.parse(savedJSON);

    // 1. Restore Config
    if (state.type) {
        document.getElementById('reg-modal-type-select').value = state.type;
        handleRegTypeChange(); 
    }
    
    // Restore Prefix
    if (state.prefix !== undefined) {
        document.getElementById('reg-modal-prefix').value = state.prefix;
        regBillConfig.prefix = state.prefix;
    }
    
    // Restore Lock UI
    regBillConfig.isLocked = (state.isLocked !== undefined) ? state.isLocked : true;
    document.getElementById('reg-modal-prefix').disabled = regBillConfig.isLocked;
    updateRegLockIcon();

    // 2. Restore Common Fields
    document.getElementById('reg-modal-invoice-no').value = state.invoiceNo || '';
    document.getElementById('reg-modal-date').value = state.date || '';
    document.getElementById('reg-modal-cust-view-select').value = state.viewMode || 'simple';

    // 3. Restore Simple Data
    if (state.simple) {
        document.getElementById('reg-modal-simple-name').value = state.simple.name || '';
        document.getElementById('reg-modal-simple-phone').value = state.simple.phone || '';
        document.getElementById('reg-modal-simple-addr').value = state.simple.addr || '';
    }

    // 4. Restore Advanced Data (FIXED LOGIC HERE)
    if (state.billTo) {
        document.getElementById('reg-modal-bill-name').value = state.billTo.name || '';
        document.getElementById('reg-modal-bill-addr').value = state.billTo.addr || '';
        document.getElementById('reg-modal-bill-gst').value = state.billTo.gst || '';
        document.getElementById('reg-modal-bill-phone').value = state.billTo.phone || '';
        
        // Fix: Check if undefined so we don't overwrite saved empty strings with defaults
        document.getElementById('reg-modal-bill-state').value = (state.billTo.state !== undefined) ? state.billTo.state : 'Maharashtra';
        document.getElementById('reg-modal-bill-code').value = (state.billTo.code !== undefined) ? state.billTo.code : '27';
    }

    if (state.shipTo) {
        document.getElementById('reg-modal-ship-name').value = state.shipTo.name || '';
        document.getElementById('reg-modal-ship-addr').value = state.shipTo.addr || '';
        document.getElementById('reg-modal-ship-gst').value = state.shipTo.gst || '';
        document.getElementById('reg-modal-ship-phone').value = state.shipTo.phone || '';
        
        // Fix: Check if undefined
        document.getElementById('reg-modal-ship-state').value = (state.shipTo.state !== undefined) ? state.shipTo.state : 'Maharashtra';
        document.getElementById('reg-modal-ship-code').value = (state.shipTo.code !== undefined) ? state.shipTo.code : '27';
        document.getElementById('reg-modal-ship-pos').value = (state.shipTo.pos !== undefined) ? state.shipTo.pos : 'Maharashtra';
    }

    // 5. Trigger View Logic
    handleRegViewChange();

    // 6. Apply to Bill View (Silent Mode)
    saveRegularBillDetails(true); 
}
