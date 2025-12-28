/* --- script-shop.js --- */

const shopPanel = document.getElementById('shop-panel');
const buyModal = document.getElementById('buy-modal');

// Zmienne do zakupu
let selectedOfferId = null;
let selectedCost = 0;
let selectedCurrency = '';
let currentInvTab = 'cards'; // Domyślnie karty

// =========================================
// 1. OTWIERANIE I ZAMYKANIE SKLEPU
// =========================================

// Funkcje wywoływane przez HTML (onclick="openShop()")
window.openShop = function() {
    shopPanel.classList.add('open');
    loadDailyInfo();
};

window.closeShop = function() {
    shopPanel.classList.remove('open');
};

// Funkcje pomocnicze dla API (opcjonalne, ale zachowajmy dla porządku)
window.openShopAPI = window.openShop;
window.closeShopAPI = window.closeShop;

// =========================================
// 2. DAILY REWARDS
// =========================================

async function loadDailyInfo() {
    try {
        const res = await fetch('/shop/daily-info');
        const data = await res.json();
        
        if(data.success) {
            renderDailyBox('today', data.todayReward, data.canClaim);
            renderDailyBox('tom', data.tomorrowReward, false);
        }
    } catch(e) { console.error("Błąd daily:", e); }
}

function renderDailyBox(idSuffix, reward, active) {
    const iconEl = document.getElementById(`daily-icon-${idSuffix}`);
    const valEl = document.getElementById(`daily-val-${idSuffix}`);
    const btn = document.getElementById('daily-claim-btn');

    if(reward.type === 'pack') iconEl.innerHTML = '📦'; 
    else iconEl.innerHTML = '💰';

    valEl.innerText = reward.label;

    if(idSuffix === 'today') {
        if(active) {
            btn.innerText = "ODBIERZ";
            btn.disabled = false;
            btn.style.background = "#2ecc71";
            btn.style.cursor = "pointer";
        } else {
            btn.innerText = "ODEBRANO";
            btn.disabled = true;
            btn.style.background = "#555";
            btn.style.cursor = "not-allowed";
        }
    }
}

async function claimDaily() {
    try {
        const res = await fetch('/shop/claim-daily', { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            if (window.spawnConfetti) window.spawnConfetti('center', 50);
            alert(`Odebrano: ${data.reward.label}`);
            loadDailyInfo();
            if (window.updateWallet) window.updateWallet(); 
            // Jeśli EQ otwarte na paczkach - odśwież
            if (currentInvTab === 'packs' && window.openInventory) window.openInventory();
        } else {
            alert(data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
}

// =========================================
// 3. KUPOWANIE PRZEDMIOTÓW
// =========================================

window.buyItem = function(offerId, cost, currency) {
    selectedOfferId = offerId;
    selectedCost = cost;
    selectedCurrency = currency;

    document.getElementById('buy-name').innerText = offerId.replace(/_/g, ' ').toUpperCase();
    let priceText = cost;
    if (typeof cost === 'object') priceText = `${cost.common} Com / ${cost.rare} Rare`;
    else priceText += currency === 'coins' ? ' HC' : ' Shards';
    
    document.getElementById('buy-price').innerText = `${priceText} (za 1 szt.)`;
    document.getElementById('buy-amount').value = 1;
    buyModal.style.display = 'flex';
};

window.closeBuyModal = function() { buyModal.style.display = 'none'; };

window.confirmBuy = async function() {
    const amount = parseInt(document.getElementById('buy-amount').value);
    if(amount < 1) return;

    try {
        const res = await fetch('/shop/buy', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ offerId: selectedOfferId, amount: amount })
        });
        const data = await res.json();

        if(data.success) {
            alert("Zakup udany!");
            window.closeBuyModal();
            if (window.updateWallet) window.updateWallet();
            // Jeśli EQ otwarte na paczkach - odśwież
            if (selectedOfferId.includes('pack') && currentInvTab === 'packs' && window.openInventory) {
                window.openInventory();
            }
        } else {
            alert("Błąd: " + data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
};

// =========================================
// 5. WYŚWIETLANIE EKWIPUNKU
// =========================================

