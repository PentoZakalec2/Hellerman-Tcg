/* --- script-shop.js (CLEANED) --- */

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
    // USUNIĘTO: loadDailyInfo(); - stary system już nie jest ładowany
};

window.closeShop = function() {
    shopPanel.classList.remove('open');
};

// Funkcje pomocnicze dla API
window.openShopAPI = window.openShop;
window.closeShopAPI = window.closeShop;

// =========================================
// 2. KUPOWANIE PRZEDMIOTÓW
// =========================================

window.buyItem = function(offerId, cost, currency) {
    selectedOfferId = offerId;
    selectedCost = cost;
    selectedCurrency = currency;

    document.getElementById('buy-name').innerText = offerId.replace(/_/g, ' ').toUpperCase();
    
    let priceText = cost;
    if (typeof cost === 'object') {
        priceText = `${cost.common} Com / ${cost.rare} Rare`;
    } else {
        priceText += currency === 'coins' ? ' HC' : ' Shards';
    }
    
    document.getElementById('buy-price').innerText = `${priceText} (za 1 szt.)`;
    document.getElementById('buy-amount').value = 1;
    
    if(buyModal) buyModal.style.display = 'flex';
};

window.closeBuyModal = function() { 
    if(buyModal) buyModal.style.display = 'none'; 
};

window.confirmBuy = async function() {
    const amountInput = document.getElementById('buy-amount');
    const amount = parseInt(amountInput.value);
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
            
            // Odśwież portfel w głównym skrypcie
            if (typeof window.updateWallet === 'function') window.updateWallet();
            
            // Jeśli EQ otwarte na paczkach - odśwież je
            if (selectedOfferId.includes('pack') && currentInvTab === 'packs' && typeof window.openInventory === 'function') {
                window.openInventory();
            }
        } else {
            alert("Błąd: " + data.error);
        }
    } catch(e) { 
        console.error(e);
        alert("Błąd sieci"); 
    }
};