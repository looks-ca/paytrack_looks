let users = JSON.parse(sessionStorage.getItem('paytrack_users')) || [
    { user: 'admin', pass: '1234', role: 'admin' }
];

let payments = JSON.parse(sessionStorage.getItem('paytrack_payments')) || [];
let casheaRecords = JSON.parse(sessionStorage.getItem('paytrack_cashea_records')) || [];

let currentUser = null;
let pendingDeleteCallback = null;
let activeTabName = 'history';
let chartsInstance = { methods: null, cashea: null };
let qrCodeInstance = null;

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    sessionStorage.setItem('paytrack_theme', theme);
    document.querySelectorAll('.btn-theme').forEach(btn => {
        btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    });
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = sessionStorage.getItem('paytrack_theme') || 'dark';
    applyTheme(savedTheme);

    document.querySelectorAll('.btn-theme').forEach(btn => {
        btn.addEventListener('click', toggleTheme);
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upload') === 'true') {
        document.getElementById('landing-container').classList.add('hidden');
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.add('hidden');
        document.getElementById('client-upload-page').classList.remove('hidden');
        setupMobileUploadHandler();
        return;
    }

    setupDniAutocomplete('modal-client-dni', 'modal-client-dni-type', 'modal-client-input', 'modal-client-phone');
    setupDniAutocomplete('cashea-dni', 'cashea-dni-type', 'cashea-client', 'cashea-phone');
    setupQrGeneratorControls();
    setupFilters();
});

function setupFilters() {
    const searchInput = document.getElementById('search-input');
    const filterDateInput = document.getElementById('filter-date-input');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    if (searchInput) searchInput.addEventListener('input', () => renderTable());
    if (filterDateInput) filterDateInput.addEventListener('change', () => renderTable());
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (filterDateInput) filterDateInput.value = '';
            renderTable();
        });
    }

    const filterMetricsBtn = document.getElementById('filter-metrics-btn');
    const resetMetricsBtn = document.getElementById('reset-metrics-btn');

    if (filterMetricsBtn) filterMetricsBtn.addEventListener('click', () => renderMetrics());
    if (resetMetricsBtn) {
        resetMetricsBtn.addEventListener('click', () => {
            document.getElementById('metrics-start-date').value = '';
            document.getElementById('metrics-end-date').value = '';
            renderMetrics();
        });
    }
}

function setupMobileUploadHandler() {
    const mobileForm = document.getElementById('mobile-upload-form');
    if (!mobileForm) return;

    mobileForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const fileInput = document.getElementById('mobile-file');

        if (fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const base64Image = event.target.result;
                let existingPayments = JSON.parse(sessionStorage.getItem('paytrack_payments')) || [];
                
                const now = new Date();
                const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

                existingPayments.push({
                    id: Date.now() + Math.random(),
                    user: 'Cliente (Vía QR Móvil)',
                    dni: 'V-00000000',
                    phone: '04140000000',
                    method: 'Pago Móvil',
                    amount: 0.00,
                    ref: 'QR Móvil',
                    status: 'Proceso',
                    datetime: formattedDateTime,
                    image: base64Image
                });

                sessionStorage.setItem('paytrack_payments', JSON.stringify(existingPayments));

                mobileForm.classList.add('hidden');
                document.getElementById('client-success-msg').classList.remove('hidden');
            };
            reader.readAsDataURL(fileInput.files[0]);
        }
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${type === 'success' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-xmark"></i>'} ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setupDniAutocomplete(dniInputId, typeSelectId, nameInputId, phoneInputId) {
    const dniInput = document.getElementById(dniInputId);
    if (!dniInput) return;

    dniInput.addEventListener('blur', (e) => {
        const queryNum = e.target.value.trim();
        const typeSelect = document.getElementById(typeSelectId);
        const fullDni = `${typeSelect ? typeSelect.value : 'V'}-${queryNum}`.toLowerCase();

        if (queryNum.length < 5) return;

        const foundPayment = payments.find(p => p.dni && p.dni.toLowerCase() === fullDni);
        const foundCashea = casheaRecords.find(c => c.dni && c.dni.toLowerCase() === fullDni);
        const match = foundPayment || foundCashea;

        if (match) {
            const nameInput = document.getElementById(nameInputId);
            const phoneInput = document.getElementById(phoneInputId);

            if (nameInput && !nameInput.value) nameInput.value = match.user;
            if (phoneInput && !phoneInput.value) phoneInput.value = match.phone;
        }
    });
}

function setupQrGeneratorControls() {
    const setupQRForContainer = (btnId, containerId, elId) => {
        const generateQrBtn = document.getElementById(btnId);
        const qrContainer = document.getElementById(containerId);
        const qrElement = document.getElementById(elId);

        if (generateQrBtn && qrContainer && qrElement) {
            generateQrBtn.addEventListener('click', () => {
                qrContainer.classList.remove('hidden');
                qrElement.innerHTML = ''; 

                const cleanUrl = window.location.href.split('?')[0];
                const uploadPageUrl = cleanUrl + '?upload=true';
                
                new QRCode(qrElement, {
                    text: uploadPageUrl,
                    width: 170,
                    height: 170,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });

                showToast('QR generado correctamente', 'success');
            });
        }
    };

    setupQRForContainer('generate-qr-btn', 'qr-code-generator-container', 'qrcode');
    setupQRForContainer('generate-cashea-qr-btn', 'cashea-qr-container', 'cashea-qrcode');

    const closeQrGenBtn = document.getElementById('close-qr-gen-btn');
    if (closeQrGenBtn) {
        closeQrGenBtn.addEventListener('click', () => {
            const container = document.getElementById('qr-code-generator-container');
            if (container) container.classList.add('hidden');
        });
    }

    const closeCasheaQrBtn = document.getElementById('close-cashea-qr-btn');
    if (closeCasheaQrBtn) {
        closeCasheaQrBtn.addEventListener('click', () => {
            const container = document.getElementById('cashea-qr-container');
            if (container) container.classList.add('hidden');
        });
    }
}

const landingContainer = document.getElementById('landing-container');
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');

const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const appSidebar = document.getElementById('app-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

const navLoginBtn = document.getElementById('nav-login-btn');
const navRegisterBtn = document.getElementById('nav-register-btn');
const heroGetStarted = document.getElementById('hero-get-started');
const backToLanding = document.getElementById('back-to-landing');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

const tabHistoryBtn = document.getElementById('tab-history-btn');
const tabCasheaBtn = document.getElementById('tab-cashea-btn');
const tabConciliacionBtn = document.getElementById('tab-conciliacion-btn');
const tabSummaryBtn = document.getElementById('tab-summary-btn');

const viewHistory = document.getElementById('view-history');
const viewCashea = document.getElementById('view-cashea');
const viewConciliacion = document.getElementById('view-conciliacion');
const viewSummary = document.getElementById('view-summary');

const floatPaymentBtn = document.getElementById('float-payment-btn');
const floatCasheaBtn = document.getElementById('float-cashea-btn');
const floatUnpaidBtn = document.getElementById('float-unpaid-btn');

const paymentModal = document.getElementById('payment-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const paymentForm = document.getElementById('payment-form');
const paymentFileInput = document.getElementById('payment-file-input');

const casheaModal = document.getElementById('cashea-modal');
const closeCasheaModalBtn = document.getElementById('close-cashea-modal-btn');
const cancelCasheaBtn = document.getElementById('cancel-cashea-btn');
const casheaForm = document.getElementById('cashea-form');

const casheaAbonoModal = document.getElementById('cashea-abono-modal');
const closeAbonoModalBtn = document.getElementById('close-abono-modal-btn');
const cancelAbonoBtn = document.getElementById('cancel-abono-btn');
const casheaAbonoForm = document.getElementById('cashea-abono-form');

const unpaidModal = document.getElementById('unpaid-modal');
const closeUnpaidModalBtn = document.getElementById('close-unpaid-modal-btn');
const closeUnpaidModalFooterBtn = document.getElementById('close-unpaid-modal-footer-btn');

const confirmModal = document.getElementById('confirm-modal');
const confirmMessage = document.getElementById('confirm-message');
const confirmAcceptBtn = document.getElementById('confirm-accept-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

const imageViewerModal = document.getElementById('image-viewer-modal');
const closeViewerBtn = document.getElementById('close-viewer-btn');

function openSidebar() { 
    if (appSidebar && sidebarOverlay) {
        appSidebar.classList.add('open'); 
        sidebarOverlay.classList.remove('hidden'); 
    }
}

function closeSidebar() { 
    if (appSidebar && sidebarOverlay) {
        appSidebar.classList.remove('open'); 
        sidebarOverlay.classList.add('hidden'); 
    }
}

if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', openSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

function updateFloatingButtons() {
    if (floatPaymentBtn) floatPaymentBtn.classList.add('hidden');
    if (floatCasheaBtn) floatCasheaBtn.classList.add('hidden');
    if (floatUnpaidBtn) floatUnpaidBtn.classList.add('hidden');

    if (activeTabName === 'history') {
        if (floatPaymentBtn) floatPaymentBtn.classList.remove('hidden');
    } else if (activeTabName === 'cashea') {
        if (floatCasheaBtn) floatCasheaBtn.classList.remove('hidden');
        if (floatUnpaidBtn) floatUnpaidBtn.classList.remove('hidden');
    }
}

function switchTab(activeBtn, activeView, tabName) {
    [tabHistoryBtn, tabCasheaBtn, tabConciliacionBtn, tabSummaryBtn].forEach(btn => btn && btn.classList.remove('active'));
    [viewHistory, viewCashea, viewConciliacion, viewSummary].forEach(view => view && view.classList.add('hidden'));

    if (activeBtn) activeBtn.classList.add('active');
    if (activeView) activeView.classList.remove('hidden');
    activeTabName = tabName;

    updateFloatingButtons();

    if (activeView === viewHistory) renderTable();
    if (activeView === viewCashea) renderCasheaTable();
    if (activeView === viewConciliacion) renderConciliacionView();
    if (activeView === viewSummary) renderMetrics();
    closeSidebar();
}

if (tabHistoryBtn) tabHistoryBtn.addEventListener('click', (e) => { e.preventDefault(); switchTab(tabHistoryBtn, viewHistory, 'history'); });
if (tabCasheaBtn) tabCasheaBtn.addEventListener('click', (e) => { e.preventDefault(); switchTab(tabCasheaBtn, viewCashea, 'cashea'); });
if (tabConciliacionBtn) tabConciliacionBtn.addEventListener('click', (e) => { e.preventDefault(); switchTab(tabConciliacionBtn, viewConciliacion, 'conciliacion'); });
if (tabSummaryBtn) tabSummaryBtn.addEventListener('click', (e) => { e.preventDefault(); switchTab(tabSummaryBtn, viewSummary, 'summary'); });

if (floatPaymentBtn) floatPaymentBtn.addEventListener('click', () => openPaymentModalForNew());
if (floatCasheaBtn) floatCasheaBtn.addEventListener('click', () => { if (casheaModal) casheaModal.classList.remove('hidden'); });
if (floatUnpaidBtn) floatUnpaidBtn.addEventListener('click', () => { renderUnpaidList(); if (unpaidModal) unpaidModal.classList.remove('hidden'); });

function goToAuth(showRegister = false) {
    if (landingContainer && authContainer) {
        landingContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        if (showRegister) {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        } else {
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        }
    }
}

if (navLoginBtn) navLoginBtn.addEventListener('click', () => goToAuth(false));
if (navRegisterBtn) navRegisterBtn.addEventListener('click', () => goToAuth(true));
if (heroGetStarted) heroGetStarted.addEventListener('click', () => goToAuth(true));
if (backToLanding) backToLanding.addEventListener('click', () => { 
    authContainer.classList.add('hidden'); 
    landingContainer.classList.remove('hidden'); 
});

if (showRegisterLink) showRegisterLink.addEventListener('click', (e) => { 
    e.preventDefault(); 
    loginForm.classList.add('hidden'); 
    registerForm.classList.remove('hidden'); 
});

if (showLoginLink) showLoginLink.addEventListener('click', (e) => { 
    e.preventDefault(); 
    registerForm.classList.add('hidden'); 
    loginForm.classList.remove('hidden'); 
});

if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userInput = document.getElementById('login-user').value.trim();
        const passInput = document.getElementById('login-pass').value.trim();

        const currentUsers = JSON.parse(sessionStorage.getItem('paytrack_users')) || users;
        const foundUser = currentUsers.find(u => u.user.toLowerCase() === userInput.toLowerCase() && u.pass === passInput);

        if (foundUser) {
            currentUser = foundUser;
            landingContainer.classList.add('hidden');
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');

            const displaySpan = document.getElementById('user-display');
            if (displaySpan) displaySpan.textContent = currentUser.user;

            showToast(`Bienvenido a Paytrack, ${currentUser.user}`, 'success');
            setupDashboard();
        } else {
            showToast('Usuario o contraseña incorrectos', 'error');
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const regUser = document.getElementById('reg-user').value.trim();
        const regPass = document.getElementById('reg-pass').value.trim();

        let currentUsers = JSON.parse(sessionStorage.getItem('paytrack_users')) || users;
        const exists = currentUsers.some(u => u.user.toLowerCase() === regUser.toLowerCase());

        if (exists) {
            showToast('El nombre de usuario ya existe', 'error');
            return;
        }

        const newUser = { user: regUser, pass: regPass, role: 'admin' };
        currentUsers.push(newUser);
        users = currentUsers;
        sessionStorage.setItem('paytrack_users', JSON.stringify(currentUsers));

        showToast('Cuenta creada con éxito. ¡Inicia sesión!', 'success');
        registerForm.reset();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('login-user').value = regUser;
    });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        appContainer.classList.add('hidden');
        landingContainer.classList.remove('hidden');
        showToast('Sesión cerrada correctamente', 'success');
    });
}

function showConfirmModal(message, callback) {
    if (confirmMessage && confirmModal) {
        confirmMessage.textContent = message;
        pendingDeleteCallback = callback;
        confirmModal.classList.remove('hidden');
    }
}

if (confirmCancelBtn) {
    confirmCancelBtn.addEventListener('click', () => {
        if (confirmModal) confirmModal.classList.add('hidden');
        pendingDeleteCallback = null;
    });
}

if (confirmAcceptBtn) {
    confirmAcceptBtn.addEventListener('click', () => {
        if (pendingDeleteCallback) pendingDeleteCallback();
        if (confirmModal) confirmModal.classList.add('hidden');
        pendingDeleteCallback = null;
    });
}

function openPaymentModalForNew() {
    document.getElementById('payment-modal-title').innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> Registrar Nuevo Pago';
    document.getElementById('edit-payment-id').value = '';
    paymentForm.reset();
    document.getElementById('modal-client-dni-type').value = 'V';
    if (paymentModal) paymentModal.classList.remove('hidden');
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => paymentModal && paymentModal.classList.add('hidden'));
if (closeViewerBtn) closeViewerBtn.addEventListener('click', () => imageViewerModal && imageViewerModal.classList.add('hidden'));

if (paymentForm) {
    paymentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('edit-payment-id').value;
        const targetUser = document.getElementById('modal-client-input').value.trim();
        
        const dniType = document.getElementById('modal-client-dni-type').value;
        const dniNum = document.getElementById('modal-client-dni').value.trim();
        const dni = `${dniType}-${dniNum}`;

        const phone = document.getElementById('modal-client-phone').value.trim();
        
        const row = document.querySelector('.payment-row');
        const method = row.querySelector('.pay-method').value;
        const status = row.querySelector('.pay-status').value;
        const amount = parseFloat(row.querySelector('.pay-amount').value);
        const ref = row.querySelector('.pay-ref').value;

        let imageBase64 = '';
        const fileInput = paymentFileInput;
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = function(uploadEvent) {
                imageBase64 = uploadEvent.target.result;
                savePaymentData(editId, targetUser, dni, phone, method, status, amount, ref, imageBase64);
            };
            reader.readAsDataURL(fileInput.files[0]);
        } else {
            if (editId) {
                const existing = payments.find(p => p.id == editId);
                imageBase64 = existing ? existing.image : '';
            }
            savePaymentData(editId, targetUser, dni, phone, method, status, amount, ref, imageBase64);
        }
    });
}

function savePaymentData(editId, user, dni, phone, method, status, amount, ref, image) {
    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    if (editId) {
        payments = payments.map(p => {
            if (p.id == editId) {
                return { ...p, user, dni, phone, method, status, amount, ref, image: image || p.image };
            }
            return p;
        });
        showToast('Pago actualizado correctamente', 'success');
    } else {
        payments.push({
            id: Date.now() + Math.random(),
            user, dni, phone, method, amount, ref, status,
            datetime: formattedDateTime,
            image
        });
        showToast('Pago registrado con fecha y hora automática', 'success');
    }

    sessionStorage.setItem('paytrack_payments', JSON.stringify(payments));
    paymentModal.classList.add('hidden');
    paymentForm.reset();
    setupDashboard();
}

if (closeCasheaModalBtn) closeCasheaModalBtn.addEventListener('click', () => casheaModal && casheaModal.classList.add('hidden'));
if (cancelCasheaBtn) cancelCasheaBtn.addEventListener('click', () => casheaModal && casheaModal.classList.add('hidden'));

if (closeAbonoModalBtn) closeAbonoModalBtn.addEventListener('click', () => casheaAbonoModal && casheaAbonoModal.classList.add('hidden'));
if (cancelAbonoBtn) cancelAbonoBtn.addEventListener('click', () => casheaAbonoModal && casheaAbonoModal.classList.add('hidden'));

if (closeUnpaidModalBtn) closeUnpaidModalBtn.addEventListener('click', () => unpaidModal && unpaidModal.classList.add('hidden'));
if (closeUnpaidModalFooterBtn) closeUnpaidModalFooterBtn.addEventListener('click', () => unpaidModal && unpaidModal.classList.add('hidden'));

if (casheaForm) {
    casheaForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const orderId = document.getElementById('cashea-order-id').value.trim();
        const user = document.getElementById('cashea-client').value.trim();
        
        const dniType = document.getElementById('cashea-dni-type').value;
        const dniNum = document.getElementById('cashea-dni').value.trim();
        const dni = `${dniType}-${dniNum}`;

        const phone = document.getElementById('cashea-phone').value.trim();
        const totalAmount = parseFloat(document.getElementById('cashea-total-amount').value);
        const discountPercent = parseFloat(document.getElementById('cashea-discount-percent').value) || 0;
        const downPaymentPercent = parseFloat(document.getElementById('cashea-down-payment-percent').value) || 0;
        const casheaMethod = document.getElementById('cashea-payment-method').value;
        const totalInstallments = parseInt(document.getElementById('cashea-total-installments').value);
        const nextDate = document.getElementById('cashea-next-date').value;

        const orderExists = casheaRecords.some(c => c.orderId.toLowerCase() === orderId.toLowerCase());
        if (orderExists) {
            showToast('Ese Número de Orden de Cashea ya existe', 'error');
            return;
        }

        const discountAmount = totalAmount * (discountPercent / 100.0);
        const finalPrice = totalAmount - discountAmount;
        const clientDownPaymentAmount = finalPrice * (downPaymentPercent / 100.0);

        const now = new Date();
        const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        const newCashea = {
            id: Date.now() + Math.random(),
            orderId,
            user, dni, phone,
            totalAmount,
            discountPercent,
            downPaymentPercent,
            paidAmount: clientDownPaymentAmount,
            totalInstallments,
            paidInstallments: 0,
            nextDate,
            status: 'En Proceso',
            settlementStatus: 'En Tránsito',
            datetime: formattedDateTime
        };

        casheaRecords.push(newCashea);
        sessionStorage.setItem('paytrack_cashea_records', JSON.stringify(casheaRecords));

        if (clientDownPaymentAmount > 0) {
            payments.push({
                id: Date.now() + Math.random(),
                user, dni, phone,
                method: casheaMethod,
                amount: clientDownPaymentAmount,
                ref: `Inicial Ord #${orderId}`,
                status: 'Pagado',
                datetime: formattedDateTime,
                image: ''
            });
            sessionStorage.setItem('paytrack_payments', JSON.stringify(payments));
        }

        casheaModal.classList.add('hidden');
        casheaForm.reset();
        document.getElementById('cashea-dni-type').value = 'V';
        showToast(`Orden Cashea #${orderId} registrada correctamente`, 'success');
        setupDashboard();
    });
}

if (casheaAbonoForm) {
    casheaAbonoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseFloat(document.getElementById('abono-cashea-id').value);
        const amount = parseFloat(document.getElementById('abono-amount').value);
        const abonoMethod = document.getElementById('abono-payment-method').value;
        const nextDate = document.getElementById('abono-next-date').value;

        const record = casheaRecords.find(c => c.id === id);
        if (record) {
            record.paidAmount += amount;
            record.paidInstallments += 1;
            record.nextDate = nextDate;

            const finalPrice = record.totalAmount * (1 - (record.discountPercent / 100));
            
            if (record.paidAmount >= finalPrice) {
                record.status = 'Pagado';
                record.settlementStatus = 'Liquidado';
            }

            sessionStorage.setItem('paytrack_cashea_records', JSON.stringify(casheaRecords));

            const now = new Date();
            const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
            
            payments.push({
                id: Date.now() + Math.random(),
                user: record.user,
                dni: record.dni,
                phone: record.phone,
                method: abonoMethod,
                amount: amount,
                ref: `Cuota Ord #${record.orderId}`,
                status: 'Pagado',
                datetime: formattedDateTime,
                image: ''
            });
            sessionStorage.setItem('paytrack_payments', JSON.stringify(payments));

            casheaAbonoModal.classList.add('hidden');
            casheaAbonoForm.reset();
            showToast('Abono registrado con éxito', 'success');
            setupDashboard();
        }
    });
}

function exportTableToExcel(filename, tableType) {
    let csv = [];
    
    if (tableType === 'payments') {
        csv.push(["FechaHora", "Cliente", "Cedula", "Telefono", "Metodo", "Monto", "Referencia", "Estado"].join(";"));
        payments.forEach(p => {
            let row = [
                `"${p.datetime || ''}"`,
                `"${(p.user || '').replace(/"/g, '""')}"`,
                `"${p.dni || ''}"`,
                `"${p.phone || ''}"`,
                `"${p.method || ''}"`,
                p.amount,
                `"${(p.ref || '').replace(/"/g, '""')}"`,
                `"${p.status || ''}"`
            ];
            csv.push(row.join(";"));
        });
    } else if (tableType === 'cashea') {
        csv.push(["Orden", "FechaHora", "Cliente", "Cedula", "Telefono", "MontoTotal", "DescuentoPct", "InicialPct", "Abonado", "Estado", "Liquidacion"].join(";"));
        casheaRecords.forEach(c => {
            let row = [
                `"${c.orderId || ''}"`,
                `"${c.datetime || ''}"`,
                `"${(c.user || '').replace(/"/g, '""')}"`,
                `"${c.dni || ''}"`,
                `"${c.phone || ''}"`,
                c.totalAmount,
                c.discountPercent,
                c.downPaymentPercent,
                c.paidAmount,
                `"${c.status || ''}"`,
                `"${c.settlementStatus || ''}"`
            ];
            csv.push(row.join(";"));
        });
    }

    let csvContent = "\uFEFF" + csv.join("\n");
    let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    let url = URL.createObjectURL(blob);
    
    let link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Archivo Excel exportado con éxito', 'success');
}

const exportPaymentsExcelBtn = document.getElementById('export-payments-excel');
if (exportPaymentsExcelBtn) {
    exportPaymentsExcelBtn.addEventListener('click', () => exportTableToExcel('historial_pagos_paytrack.csv', 'payments'));
}

const exportCasheaExcelBtn = document.getElementById('export-cashea-excel');
if (exportCasheaExcelBtn) {
    exportCasheaExcelBtn.addEventListener('click', () => exportTableToExcel('mod_cashea_paytrack.csv', 'cashea'));
}

const verifyOrderBtn = document.getElementById('verify-order-btn');
if (verifyOrderBtn) {
    verifyOrderBtn.addEventListener('click', () => {
        const orderIdVal = document.getElementById('verify-order-id').value.trim().toLowerCase();
        const container = document.getElementById('verify-result-container');
        if (!orderIdVal || !container) return;

        const found = casheaRecords.find(c => c.orderId.toLowerCase() === orderIdVal);
        container.classList.remove('hidden');

        if (found) {
            const finalPrice = found.totalAmount * (1 - (found.discountPercent / 100));
            const commission7 = finalPrice * 0.07;
            const netReceived = finalPrice - commission7;

            container.innerHTML = `
                <h5 style="color: var(--success); margin-bottom: 8px;"><i class="fa-solid fa-circle-check"></i> Orden Encontrada</h5>
                <p><strong>Cliente:</strong> ${found.user} (${found.dni})</p>
                <p><strong>Monto Compra Neto:</strong> $${finalPrice.toFixed(2)}</p>
                <p><strong>Comisión Cashea (7% Semanal):</strong> -$${commission7.toFixed(2)}</p>
                <p><strong>Neto a Recibir:</strong> <strong style="color: var(--primary);">$${netReceived.toFixed(2)}</strong></p>
                <p><strong>Estado:</strong> <span class="badge ${found.settlementStatus === 'Liquidado' ? 'status-pagado' : 'status-proceso'}">${found.settlementStatus}</span></p>
            `;
        } else {
            container.innerHTML = `<h5 style="color: var(--danger);"><i class="fa-solid fa-circle-xmark"></i> No se encontró la orden "${orderIdVal}"</h5>`;
        }
    });
}

function renderConciliacionView() {
    const tbody = document.getElementById('conciliacion-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (casheaRecords.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No hay órdenes Cashea.</td></tr>`;
        return;
    }

    casheaRecords.forEach(c => {
        const finalPrice = c.totalAmount * (1 - (c.discountPercent / 100));
        const commission7 = finalPrice * 0.07;
        const netReceived = finalPrice - commission7;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${c.orderId}</strong></td>
            <td>${c.user}</td>
            <td>$${finalPrice.toFixed(2)}</td>
            <td style="color: var(--danger);">-$${commission7.toFixed(2)}</td>
            <td><strong>$${netReceived.toFixed(2)}</strong></td>
            <td><span class="badge ${c.settlementStatus === 'Liquidado' ? 'status-pagado' : 'status-proceso'}">${c.settlementStatus}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function setupDashboard() {
    renderTable();
    renderCasheaTable();
    renderConciliacionView();
    renderMetrics();
}

function renderTable() {
    const paymentTableBody = document.getElementById('payment-table-body');
    if (!paymentTableBody) return;
    paymentTableBody.innerHTML = '';

    const searchQuery = document.getElementById('search-input') ? document.getElementById('search-input').value.trim().toLowerCase() : '';
    const filterDate = document.getElementById('filter-date-input') ? document.getElementById('filter-date-input').value : '';

    const filteredPayments = payments.filter(p => {
        const matchesSearch = !searchQuery || 
            (p.user && p.user.toLowerCase().includes(searchQuery)) ||
            (p.dni && p.dni.toLowerCase().includes(searchQuery)) ||
            (p.ref && p.ref.toLowerCase().includes(searchQuery));

        const paymentDateOnly = p.datetime ? p.datetime.split(' ')[0] : '';
        const matchesDate = !filterDate || paymentDateOnly === filterDate;

        return matchesSearch && matchesDate;
    });

    if (filteredPayments.length === 0) {
        paymentTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;">No se encontraron transacciones.</td></tr>`;
        return;
    }
    
    filteredPayments.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="date-cell">${p.datetime || 'N/A'}</td>
            <td><strong>${p.user}</strong></td>
            <td>${p.dni || 'N/A'}</td>
            <td>${p.phone || 'N/A'}</td>
            <td>${p.image ? `<img src="${p.image}" class="thumb-img" onclick="openImageViewer('${p.image}')">` : '<span class="no-img-text">Sin foto</span>'}</td>
            <td><span class="badge">${p.method}</span></td>
            <td><strong>$${Number(p.amount).toFixed(2)}</strong></td>
            <td>${p.ref}</td>
            <td><span class="badge status-${p.status === 'Pagado' ? 'pagado' : 'proceso'}">${p.status}</span></td>
            <td>
                <div class="action-buttons-group">
                    <button class="btn-icon-action" title="Editar Pago" onclick="openEditPayment(${p.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon-action btn-icon-delete" title="Eliminar" onclick="deletePayment(${p.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        paymentTableBody.appendChild(tr);
    });
}

function renderCasheaTable() {
    const casheaTableBody = document.getElementById('cashea-table-body');
    if (!casheaTableBody) return;
    casheaTableBody.innerHTML = '';

    casheaRecords.forEach(c => {
        const finalPrice = c.totalAmount * (1 - (c.discountPercent / 100));
        const clientInitialAmount = finalPrice * (c.downPaymentPercent / 100);
        const remaining = finalPrice - c.paidAmount;
        const installmentAmount = c.totalInstallments > 0 ? remaining / c.totalInstallments : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${c.orderId}</strong></td>
            <td>${c.user}</td>
            <td>${c.dni}<br><small>${c.phone}</small></td>
            <td>$${c.totalAmount.toFixed(2)}</td>
            <td>$${clientInitialAmount.toFixed(2)} (${c.downPaymentPercent}%)</td>
            <td><strong>$${installmentAmount.toFixed(2)}</strong> <small>(${c.totalInstallments} cuotas)</small></td>
            <td style="color: ${remaining > 0 ? 'var(--status-no-registrado)' : 'var(--status-pagado)'};"><strong>$${remaining.toFixed(2)}</strong></td>
            <td>${c.paidInstallments} / ${c.totalInstallments}</td>
            <td class="date-cell">${c.nextDate}</td>
            <td><span class="badge ${c.settlementStatus === 'Liquidado' ? 'status-pagado' : 'status-proceso'}">${c.settlementStatus}</span></td>
            <td>
                <div class="action-buttons-group">
                    ${remaining > 0 ? `<button class="btn-icon-action btn-cashea-yellow" title="Abonar Cuota" onclick="openAbonoModal(${c.id})"><i class="fa-solid fa-credit-card"></i></button>` : ''}
                    <button class="btn-icon-action btn-icon-delete" title="Eliminar" onclick="deleteCashea(${c.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        casheaTableBody.appendChild(tr);
    });
}

function renderMetrics() {
    const totalAmountElem = document.getElementById('kpi-total-amount');
    const volumeElem = document.getElementById('kpi-volume');
    const casheaCommissionElem = document.getElementById('kpi-cashea-commission');
    const casheaInitCommissionElem = document.getElementById('kpi-cashea-init-commission');
    const casheaTransitElem = document.getElementById('kpi-cashea-transit');
    const casheaCollectedElem = document.getElementById('kpi-cashea-collected');
    
    const startDate = document.getElementById('metrics-start-date') ? document.getElementById('metrics-start-date').value : '';
    const endDate = document.getElementById('metrics-end-date') ? document.getElementById('metrics-end-date').value : '';

    const filteredPayments = payments.filter(p => {
        if (!p.datetime) return true;
        const pDate = p.datetime.split(' ')[0];
        if (startDate && pDate < startDate) return false;
        if (endDate && pDate > endDate) return false;
        return true;
    });

    let totalCaja = 0;
    let totalVolume = 0;
    let totalCasheaCommission7 = 0;
    let totalCasheaCommissionInit4 = 0;

    const payerTotals = {};
    const buyerCounts = {};

    filteredPayments.forEach(p => {
        totalVolume += p.amount;
        if (p.status === 'Pagado') totalCaja += p.amount;

        if (p.user) {
            payerTotals[p.user] = (payerTotals[p.user] || 0) + p.amount;
            buyerCounts[p.user] = (buyerCounts[p.user] || 0) + 1;
        }
    });

    let transitTotal = 0;
    let collectedCashea = 0;

    casheaRecords.forEach(c => {
        const finalPrice = c.totalAmount * (1 - (c.discountPercent / 100));
        const remaining = finalPrice - c.paidAmount;

        collectedCashea += c.paidAmount;
        totalCasheaCommission7 += finalPrice * 0.07;

        const clientInitialAmt = finalPrice * (c.downPaymentPercent / 100);
        totalCasheaCommissionInit4 += clientInitialAmt * 0.04;

        if (c.settlementStatus === 'En Tránsito') {
            transitTotal += remaining;
        }
    });

    let topPayer = 'N/A';
    let maxPaid = -1;
    for (const [user, amount] of Object.entries(payerTotals)) {
        if (amount > maxPaid) {
            maxPaid = amount;
            topPayer = `${user} ($${amount.toFixed(2)})`;
        }
    }

    let topBuyer = 'N/A';
    let maxCount = -1;
    for (const [user, count] of Object.entries(buyerCounts)) {
        if (count > maxCount) {
            maxCount = count;
            topBuyer = `${user} (${count} compras)`;
        }
    }

    if (totalAmountElem) totalAmountElem.textContent = `$${totalCaja.toFixed(2)}`;
    if (volumeElem) volumeElem.textContent = `$${totalVolume.toFixed(2)}`;
    if (casheaCommissionElem) casheaCommissionElem.textContent = `$${totalCasheaCommission7.toFixed(2)}`;
    if (casheaInitCommissionElem) casheaInitCommissionElem.textContent = `$${totalCasheaCommissionInit4.toFixed(2)}`;
    if (casheaTransitElem) casheaTransitElem.textContent = `$${transitTotal.toFixed(2)}`;
    if (casheaCollectedElem) casheaCollectedElem.textContent = `$${collectedCashea.toFixed(2)}`;

    document.getElementById('top-payer-container').textContent = topPayer;
    document.getElementById('top-buyer-container').textContent = topBuyer;

    renderCharts(filteredPayments);
}

function renderCharts(activePayments) {
    const ctxMethods = document.getElementById('paymentMethodsChart');
    if (ctxMethods) {
        if (chartsInstance.methods) chartsInstance.methods.destroy();

        let pmCount = activePayments.filter(p => p.method === 'Pago Móvil').length;
        let pvCount = activePayments.filter(p => p.method === 'Punto de Venta').length;
        let zelleCount = activePayments.filter(p => p.method === 'Zelle').length;
        let efCount = activePayments.filter(p => p.method === 'Efectivo').length;
        
        let casheaPm = activePayments.filter(p => p.method === 'Cashea/Pago Móvil').length;
        let casheaPv = activePayments.filter(p => p.method === 'Cashea/Punto de Venta').length;
        let casheaZelle = activePayments.filter(p => p.method === 'Cashea/Zelle').length;
        let casheaEf = activePayments.filter(p => p.method === 'Cashea/Efectivo').length;

        chartsInstance.methods = new Chart(ctxMethods, {
            type: 'pie',
            data: {
                labels: ['Pago Móvil', 'Punto de Venta', 'Zelle', 'Efectivo', 'Cashea/P.Móvil', 'Cashea/P.Venta', 'Cashea/Zelle', 'Cashea/Efectivo'],
                datasets: [{
                    data: [pmCount, pvCount, zelleCount, efCount, casheaPm, casheaPv, casheaZelle, casheaEf],
                    backgroundColor: ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b']
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { color: document.documentElement.getAttribute('data-theme') === 'light' ? '#111' : '#fff' } } }
            }
        });
    }

    const ctxCashea = document.getElementById('casheaStatusChart');
    if (ctxCashea) {
        if (chartsInstance.cashea) chartsInstance.cashea.destroy();

        let inTransit = casheaRecords.filter(c => c.settlementStatus === 'En Tránsito').length;
        let liquidated = casheaRecords.filter(c => c.settlementStatus === 'Liquidado').length;

        chartsInstance.cashea = new Chart(ctxCashea, {
            type: 'doughnut',
            data: {
                labels: ['En Tránsito', 'Liquidado'],
                datasets: [{
                    data: [inTransit, liquidated],
                    backgroundColor: ['#f59e0b', '#10b981']
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { color: document.documentElement.getAttribute('data-theme') === 'light' ? '#111' : '#fff' } } }
            }
        });
    }
}

window.openImageViewer = function(imgSrc) {
    const viewer = document.getElementById('image-viewer-modal');
    const fullImg = document.getElementById('viewer-full-image');
    if (viewer && fullImg) {
        fullImg.src = imgSrc;
        viewer.classList.remove('hidden');
    }
};

window.openEditPayment = function(id) {
    const p = payments.find(item => item.id == id);
    if (!p) return;

    document.getElementById('payment-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Pago';
    document.getElementById('edit-payment-id').value = p.id;
    document.getElementById('modal-client-input').value = p.user || '';
    document.getElementById('modal-client-phone').value = p.phone || '';

    if (p.dni && p.dni.includes('-')) {
        const parts = p.dni.split('-');
        document.getElementById('modal-client-dni-type').value = parts[0] || 'V';
        document.getElementById('modal-client-dni').value = parts[1] || '';
    } else {
        document.getElementById('modal-client-dni-type').value = 'V';
        document.getElementById('modal-client-dni').value = p.dni || '';
    }

    const row = document.querySelector('.payment-row');
    row.querySelector('.pay-method').value = p.method.includes('Cashea') ? 'Pago Móvil' : p.method;
    row.querySelector('.pay-status').value = p.status;
    row.querySelector('.pay-amount').value = p.amount;
    row.querySelector('.pay-ref').value = p.ref;

    paymentModal.classList.remove('hidden');
};

window.deletePayment = function(id) {
    showConfirmModal('¿Estás seguro de eliminar este pago?', () => {
        payments = payments.filter(p => p.id !== id);
        sessionStorage.setItem('paytrack_payments', JSON.stringify(payments));
        renderTable();
        showToast('Pago eliminado', 'success');
    });
};

window.deleteCashea = function(id) {
    showConfirmModal('¿Estás seguro de eliminar este registro de Cashea?', () => {
        casheaRecords = casheaRecords.filter(c => c.id !== id);
        sessionStorage.setItem('paytrack_cashea_records', JSON.stringify(casheaRecords));
        renderCasheaTable();
        showToast('Registro Cashea eliminado', 'success');
    });
};

window.openAbonoModal = function(id) {
    const record = casheaRecords.find(c => c.id === id);
    if (-record) return;

    document.getElementById('abono-cashea-id').value = record.id;
    document.getElementById('abono-client-name').value = `${record.user} (Orden #${record.orderId})`;

    const finalPrice = record.totalAmount * (1 - (record.discountPercent / 100));
    const remaining = finalPrice - record.paidAmount;
    const installmentsLeft = record.totalInstallments - record.paidInstallments;
    const suggestedInstallment = installmentsLeft > 0 ? remaining / installmentsLeft : remaining;

    document.getElementById('abono-amount').value = suggestedInstallment.toFixed(2);
    casheaAbonoModal.classList.remove('hidden');
};

function renderUnpaidList() {
    const tbody = document.getElementById('unpaid-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const unpaid = casheaRecords.filter(c => c.status !== 'Pagado');
    if (unpaid.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No hay deudores pendientes 🎉</td></tr>`;
        return;
    }

    unpaid.forEach(c => {
        const finalPrice = c.totalAmount * (1 - (c.discountPercent / 100));
        const remaining = finalPrice - c.paidAmount;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${c.user}</strong></td>
            <td>${c.dni} <br><small>${c.phone}</small></td>
            <td style="color: var(--status-no-registrado);"><strong>$${remaining.toFixed(2)}</strong></td>
            <td class="date-cell">${c.nextDate}</td>
            <td><span class="badge status-proceso">${c.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}