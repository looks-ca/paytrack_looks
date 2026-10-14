// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyAyiV6IYnCnY9-Fz18irolm1lvty2EVTq0",
    authDomain: "paytrack-looks.firebaseapp.com",
    projectId: "paytrack-looks",
    storageBucket: "paytrack-looks.firebasestorage.app",
    messagingSenderId: "1055504735615",
    appId: "1:1055504735615:web:deaf7c1ba336c6f99c4e4a",
    measurementId: "G-GNF5MEGTHD"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// ==========================================
// ESTADO Y VARIABLES DE LA APLICACIÓN
// ==========================================
let users = [
    { user: 'admin', pass: '1234', role: 'admin' }
];

let payments = [];
let casheaRecords = [];

let currentUser = null;
let pendingDeleteCallback = null;
let activeTabName = 'history';
let chartsInstance = { methods: null, cashea: null };
let pendingMobileImage = null; // Imagen recibida vía PeerJS

let pcPeer = null;
let currentPeerId = null;

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

    // Detectar si estamos en modo de subida móvil por QR (?upload=true&peer=...)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('upload') === 'true') {
        const landing = document.getElementById('landing-container');
        const uploadPage = document.getElementById('client-upload-page');
        if (landing) landing.classList.add('hidden');
        if (uploadPage) uploadPage.classList.remove('hidden');
        setupMobilePeerUpload(urlParams.get('peer'));
        return;
    }

    setupDniAutocomplete('modal-client-dni', 'modal-client-dni-type', 'modal-client-input', 'modal-client-phone');
    setupDniAutocomplete('cashea-dni', 'cashea-dni-type', 'cashea-client', 'cashea-phone');
    setupFilters();
    setupQrGenerator();
    initFirebaseListeners();
});

// Inicializar PeerJS en la PC para recibir la foto del celular directamente
function initPcPeer() {
    if (pcPeer) return; // Ya está activo

    pcPeer = new Peer(); // Genera un ID aleatorio en los servidores públicos de PeerJS

    pcPeer.on('open', (id) => {
        currentPeerId = id;
    });

    pcPeer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data && data.type === 'RECEIPT_IMAGE') {
                pendingMobileImage = data.image;
                showToast('¡Comprobante recibido del celular por PeerJS!', 'success');

                const statusDiv = document.getElementById('mobile-img-status');
                if (statusDiv) statusDiv.classList.remove('hidden');

                const qrContainer = document.getElementById('qr-code-generator-container');
                if (qrContainer) qrContainer.classList.add('hidden');
            }
        });
    });
}

// Lógica del cel cuando escanea el QR y envía la foto vía PeerJS a la PC
function setupMobilePeerUpload(pcPeerId) {
    const form = document.getElementById('mobile-upload-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('mobile-file');
        if (!fileInput || !fileInput.files[0]) return;

        form.classList.add('hidden');
        document.getElementById('client-loading-msg').classList.remove('hidden');

        compressImage(fileInput.files[0], 800, 0.7, (compressedBase64) => {
            const mobilePeer = new Peer();

            mobilePeer.on('open', () => {
                const conn = mobilePeer.connect(pcPeerId);

                conn.on('open', () => {
                    // Enviar imagen directamente a la PC por internet (P2P)
                    conn.send({
                        type: 'RECEIPT_IMAGE',
                        image: compressedBase64
                    });

                    document.getElementById('client-loading-msg').classList.add('hidden');
                    document.getElementById('client-success-msg').classList.remove('hidden');
                });

                conn.on('error', (err) => {
                    console.error("Error PeerJS conexión:", err);
                    alert("No se pudo conectar directamente con la PC. Intenta de nuevo.");
                    document.getElementById('client-loading-msg').classList.add('hidden');
                    form.classList.remove('hidden');
                });
            });
        });
    });
}

// Configuración de Generación de QR con PeerJS
function setupQrGenerator() {
    const generateQrBtn = document.getElementById('generate-qr-btn');
    const qrContainer = document.getElementById('qr-code-generator-container');
    const closeQrGenBtn = document.getElementById('close-qr-gen-btn');

    if (generateQrBtn && qrContainer) {
        generateQrBtn.addEventListener('click', () => {
            initPcPeer(); // Iniciar servidor Peer de la PC

            const checkPeerReady = setInterval(() => {
                if (currentPeerId) {
                    clearInterval(checkPeerReady);
                    qrContainer.classList.remove('hidden');
                    const qrcodeDiv = document.getElementById('qrcode');
                    qrcodeDiv.innerHTML = '';
                    
                    const uploadUrl = `${window.location.origin}${window.location.pathname}?upload=true&peer=${currentPeerId}`;
                    new QRCode(qrcodeDiv, {
                        text: uploadUrl,
                        width: 160,
                        height: 160
                    });
                }
            }, 200);
        });
    }

    if (closeQrGenBtn && qrContainer) {
        closeQrGenBtn.addEventListener('click', () => {
            qrContainer.classList.add('hidden');
        });
    }

    const generateCasheaQrBtn = document.getElementById('generate-cashea-qr-btn');
    const casheaQrContainer = document.getElementById('cashea-qr-container');
    const closeCasheaQrBtn = document.getElementById('close-cashea-qr-btn');

    if (generateCasheaQrBtn && casheaQrContainer) {
        generateCasheaQrBtn.addEventListener('click', () => {
            initPcPeer();

            const checkPeerReady = setInterval(() => {
                if (currentPeerId) {
                    clearInterval(checkPeerReady);
                    casheaQrContainer.classList.remove('hidden');
                    const qrcodeDiv = document.getElementById('cashea-qrcode');
                    qrcodeDiv.innerHTML = '';
                    
                    const uploadUrl = `${window.location.origin}${window.location.pathname}?upload=true&peer=${currentPeerId}`;
                    new QRCode(qrcodeDiv, {
                        text: uploadUrl,
                        width: 160,
                        height: 160
                    });
                }
            }, 200);
        });
    }

    if (closeCasheaQrBtn && casheaQrContainer) {
        closeCasheaQrBtn.addEventListener('click', () => {
            casheaQrContainer.classList.add('hidden');
        });
    }
}

// Sincronización en tiempo real con Firestore
function initFirebaseListeners() {
    onSnapshot(collection(db, "payments"), (snapshot) => {
        payments = snapshot.docs.map(doc => ({ idDoc: doc.id, ...doc.data() }));
        if (currentUser) setupDashboard();
    });

    onSnapshot(collection(db, "casheaRecords"), (snapshot) => {
        casheaRecords = snapshot.docs.map(doc => ({ idDoc: doc.id, ...doc.data() }));
        if (currentUser) setupDashboard();
    });
}

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

// Elementos de la UI y Navegación
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

        const foundUser = users.find(u => u.user.toLowerCase() === userInput.toLowerCase() && u.pass === passInput);

        if (foundUser) {
            currentUser = foundUser;
            landingContainer.classList.add('hidden');
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');

            document.getElementById('user-display').textContent = currentUser.user;
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

        const exists = users.some(u => u.user.toLowerCase() === regUser.toLowerCase());
        if (exists) {
            showToast('El nombre de usuario ya existe', 'error');
            return;
        }

        users.push({ user: regUser, pass: regPass, role: 'admin' });
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
        confirmModal.classList.add('hidden');
        pendingDeleteCallback = null;
    });
}

if (confirmAcceptBtn) {
    confirmAcceptBtn.addEventListener('click', () => {
        if (pendingDeleteCallback) pendingDeleteCallback();
        confirmModal.classList.add('hidden');
        pendingDeleteCallback = null;
    });
}

function openPaymentModalForNew() {
    document.getElementById('payment-modal-title').innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> Registrar Nuevo Pago';
    document.getElementById('edit-payment-id').value = '';
    paymentForm.reset();
    pendingMobileImage = null;
    const statusDiv = document.getElementById('mobile-img-status');
    if (statusDiv) statusDiv.classList.add('hidden');
    document.getElementById('modal-client-dni-type').value = 'V';
    paymentModal.classList.remove('hidden');
}

if (closeModalBtn) closeModalBtn.addEventListener('click', () => paymentModal.classList.add('hidden'));
if (closeViewerBtn) closeViewerBtn.addEventListener('click', () => imageViewerModal.classList.add('hidden'));

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

        const fileInput = paymentFileInput;

        if (pendingMobileImage) {
            savePaymentData(editId, targetUser, dni, phone, method, status, amount, ref, pendingMobileImage);
            pendingMobileImage = null;
        } else if (fileInput && fileInput.files && fileInput.files[0]) {
            compressImage(fileInput.files[0], 800, 0.7, (compressedBase64) => {
                savePaymentData(editId, targetUser, dni, phone, method, status, amount, ref, compressedBase64);
            });
        } else {
            let existingImage = '';
            if (editId) {
                const existing = payments.find(p => p.idDoc === editId);
                existingImage = existing ? existing.image : '';
            }
            savePaymentData(editId, targetUser, dni, phone, method, status, amount, ref, existingImage);
        }
    });
}

// Función auxiliar para comprimir imágenes y evitar superar el límite de tamaño de Firestore
function compressImage(file, maxWidth, quality, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            callback(compressedDataUrl);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

async function savePaymentData(editId, user, dni, phone, method, status, amount, ref, image) {
    const now = new Date();
    const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    try {
        if (editId) {
            const paymentRef = doc(db, "payments", editId);
            await updateDoc(paymentRef, { user, dni, phone, method, status, amount, ref, image });
            showToast('Pago actualizado en Firebase', 'success');
        } else {
            await addDoc(collection(db, "payments"), {
                user, dni, phone, method, amount, ref, status,
                datetime: formattedDateTime,
                image
            });
            showToast('Pago guardado en Firebase con éxito', 'success');
        }
        paymentModal.classList.add('hidden');
        paymentForm.reset();
    } catch (error) {
        console.error("Error al guardar pago:", error);
        showToast('Error al guardar en la base de datos', 'error');
    }
}

if (closeCasheaModalBtn) closeCasheaModalBtn.addEventListener('click', () => casheaModal.classList.add('hidden'));
if (cancelCasheaBtn) cancelCasheaBtn.addEventListener('click', () => casheaModal.classList.add('hidden'));
if (closeAbonoModalBtn) closeAbonoModalBtn.addEventListener('click', () => casheaAbonoModal.classList.add('hidden'));
if (cancelAbonoBtn) cancelAbonoBtn.addEventListener('click', () => casheaAbonoModal.classList.add('hidden'));
if (closeUnpaidModalBtn) closeUnpaidModalBtn.addEventListener('click', () => unpaidModal.classList.add('hidden'));
if (closeUnpaidModalFooterBtn) closeUnpaidModalFooterBtn.addEventListener('click', () => unpaidModal.classList.add('hidden'));

if (casheaForm) {
    casheaForm.addEventListener('submit', async (e) => {
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

        try {
            await addDoc(collection(db, "casheaRecords"), {
                orderId, user, dni, phone, totalAmount, discountPercent, downPaymentPercent,
                paidAmount: clientDownPaymentAmount,
                totalInstallments,
                paidInstallments: 0,
                nextDate,
                status: 'En Proceso',
                settlementStatus: 'En Tránsito',
                datetime: formattedDateTime
            });

            if (clientDownPaymentAmount > 0) {
                await addDoc(collection(db, "payments"), {
                    user, dni, phone,
                    method: casheaMethod,
                    amount: clientDownPaymentAmount,
                    ref: `Inicial Ord #${orderId}`,
                    status: 'Pagado',
                    datetime: formattedDateTime,
                    image: ''
                });
            }

            casheaModal.classList.add('hidden');
            casheaForm.reset();
            document.getElementById('cashea-dni-type').value = 'V';
            showToast(`Orden Cashea #${orderId} guardada en Firebase`, 'success');
        } catch (error) {
            console.error("Error al registrar orden Cashea:", error);
            showToast('Error al registrar la orden', 'error');
        }
    });
}

if (casheaAbonoForm) {
    casheaAbonoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const idDoc = document.getElementById('abono-cashea-id').value;
        const amount = parseFloat(document.getElementById('abono-amount').value);
        const abonoMethod = document.getElementById('abono-payment-method').value;
        const nextDate = document.getElementById('abono-next-date').value;

        const record = casheaRecords.find(c => c.idDoc === idDoc);
        if (record) {
            const newPaidAmount = record.paidAmount + amount;
            const newPaidInstallments = record.paidInstallments + 1;
            const finalPrice = record.totalAmount * (1 - (record.discountPercent / 100));
            
            let status = record.status;
            let settlementStatus = record.settlementStatus;

            if (newPaidAmount >= finalPrice) {
                status = 'Pagado';
                settlementStatus = 'Liquidado';
            }

            try {
                const casheaRef = doc(db, "casheaRecords", idDoc);
                await updateDoc(casheaRef, {
                    paidAmount: newPaidAmount,
                    paidInstallments: newPaidInstallments,
                    nextDate: nextDate,
                    status,
                    settlementStatus
                });

                const now = new Date();
                const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
                
                await addDoc(collection(db, "payments"), {
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

                casheaAbonoModal.classList.add('hidden');
                casheaAbonoForm.reset();
                showToast('Abono registrado en Firebase', 'success');
            } catch (error) {
                console.error("Error al registrar abono:", error);
                showToast('Error al registrar el abono', 'error');
            }
        }
    });
}

function exportTableToExcel(filename, tableType) {
    let csv = [];
    if (tableType === 'payments') {
        csv.push(["FechaHora", "Cliente", "Cedula", "Telefono", "Metodo", "Monto", "Referencia", "Estado"].join(";"));
        payments.forEach(p => {
            csv.push([
                `"${p.datetime || ''}"`,
                `"${(p.user || '').replace(/"/g, '""')}"`,
                `"${p.dni || ''}"`,
                `"${p.phone || ''}"`,
                `"${p.method || ''}"`,
                p.amount,
                `"${(p.ref || '').replace(/"/g, '""')}"`,
                `"${p.status || ''}"`
            ].join(";"));
        });
    } else if (tableType === 'cashea') {
        csv.push(["Orden", "FechaHora", "Cliente", "Cedula", "Telefono", "MontoTotal", "DescuentoPct", "InicialPct", "Abonado", "Estado", "Liquidacion"].join(";"));
        casheaRecords.forEach(c => {
            csv.push([
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
            ].join(";"));
        });
    }

    let blob = new Blob(["\uFEFF" + csv.join("\n")], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
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
                    <button class="btn-icon-action" title="Editar Pago" onclick="openEditPayment('${p.idDoc}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon-action btn-icon-delete" title="Eliminar" onclick="deletePayment('${p.idDoc}')"><i class="fa-solid fa-trash"></i></button>
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
                    ${remaining > 0 ? `<button class="btn-icon-action btn-cashea-yellow" title="Abonar Cuota" onclick="openAbonoModal('${c.idDoc}')"><i class="fa-solid fa-credit-card"></i></button>` : ''}
                    <button class="btn-icon-action btn-icon-delete" title="Eliminar" onclick="deleteCashea('${c.idDoc}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        casheaTableBody.appendChild(tr);
    });
}

function renderMetrics() {
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

    document.getElementById('kpi-total-amount').textContent = `$${totalCaja.toFixed(2)}`;
    document.getElementById('kpi-volume').textContent = `$${totalVolume.toFixed(2)}`;
    document.getElementById('kpi-cashea-commission').textContent = `$${totalCasheaCommission7.toFixed(2)}`;
    document.getElementById('kpi-cashea-init-commission').textContent = `$${totalCasheaCommissionInit4.toFixed(2)}`;
    document.getElementById('kpi-cashea-transit').textContent = `$${transitTotal.toFixed(2)}`;
    document.getElementById('kpi-cashea-collected').textContent = `$${collectedCashea.toFixed(2)}`;

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
    document.getElementById('viewer-full-image').src = imgSrc;
    imageViewerModal.classList.remove('hidden');
};

window.openEditPayment = function(idDoc) {
    const p = payments.find(item => item.idDoc === idDoc);
    if (!p) return;

    document.getElementById('payment-modal-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Pago';
    document.getElementById('edit-payment-id').value = p.idDoc;
    document.getElementById('modal-client-input').value = p.user || '';
    document.getElementById('modal-client-phone').value = p.phone || '';

    if (p.dni && p.dni.includes('-')) {
        const parts = p.dni.split('-');
        document.getElementById('modal-client-dni-type').value = parts[0] || 'V';
        document.getElementById('modal-client-dni').value = parts[1] || '';
    }

    const row = document.querySelector('.payment-row');
    row.querySelector('.pay-method').value = p.method.includes('Cashea') ? 'Pago Móvil' : p.method;
    row.querySelector('.pay-status').value = p.status;
    row.querySelector('.pay-amount').value = p.amount;
    row.querySelector('.pay-ref').value = p.ref;

    paymentModal.classList.remove('hidden');
};

window.deletePayment = function(idDoc) {
    showConfirmModal('¿Estás seguro de eliminar este pago de Firebase?', async () => {
        try {
            await deleteDoc(doc(db, "payments", idDoc));
            showToast('Pago eliminado de Firebase', 'success');
        } catch (error) {
            console.error("Error al eliminar pago:", error);
            showToast('No se pudo eliminar', 'error');
        }
    });
};

window.deleteCashea = function(idDoc) {
    showConfirmModal('¿Estás seguro de eliminar este registro Cashea?', async () => {
        try {
            await deleteDoc(doc(db, "casheaRecords", idDoc));
            showToast('Registro Cashea eliminado', 'success');
        } catch (error) {
            console.error("Error al eliminar orden Cashea:", error);
            showToast('No se pudo eliminar', 'error');
        }
    });
};

window.openAbonoModal = function(idDoc) {
    const record = casheaRecords.find(c => c.idDoc === idDoc);
    if (!record) return;

    document.getElementById('abono-cashea-id').value = record.idDoc;
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