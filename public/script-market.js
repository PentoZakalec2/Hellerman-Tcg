/* --- script-market.js: OBSŁUGA RYNKU --- */

// Główna funkcja otwierająca rynek
window.openMarket = async function() {
    const panel = document.getElementById('market-panel');
    if (panel) panel.classList.add('open');
    
    // Załaduj oferty
    loadMarketData();
};

window.closeMarket = function() {
    const panel = document.getElementById('market-panel');
    if (panel) panel.classList.remove('open');
};

// Pobieranie danych z serwera
async function loadMarketData() {
    const container = document.getElementById('market-list'); // Upewnij się że w HTML masz id="market-list"
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Ładowanie ofert...</p>';

    try {
        const res = await fetch('/market/list');
        const data = await res.json();

        if (data.success) {
            renderMarketListings(data.listings, data.currentUserId);
        } else {
            container.innerHTML = `<p style="color:red; text-align:center;">Błąd: ${data.error}</p>`;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red; text-align:center;">Błąd połączenia.</p>`;
    }
}

// Funkcja renderująca (TA KTÓREJ BRAKOWAŁO)
function renderMarketListings(listings, currentUserId) {
    const container = document.getElementById('market-list');
    container.innerHTML = '';

    if (listings.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#777; margin-top:50px;">Brak ofert na rynku.</p>';
        return;
    }

    listings.forEach(item => {
        // Główny kontener oferty
        const div = document.createElement('div');
        div.className = `market-item rarity-${item.rarity}`;
        if (item.is_numbered) div.classList.add('numbered');

        const isMine = (item.seller_id === currentUserId);
        
        // FIX: Pobieranie max_supply (jeśli brak w bazie, wyświetli '?')
        const maxSupplyDisplay = item.is_numbered ? (item.max_supply || '?') : '';

        // HTML Wewnętrzny
        div.innerHTML = `
            <div class="market-item-left">
                <div class="market-img-wrapper">
                    <img src="${item.image_url}" class="market-img">
                </div>
                
                <div class="market-info">
                    <div class="market-name" style="color:white; font-weight:bold; font-size:18px;">${item.card_name}</div>
                    <div class="market-seller" style="font-size:14px; color:#aaa;">
                        Sprzedawca: <span style="color:${isMine ? 'gold' : '#fff'}">${isMine ? 'Ty' : item.seller_name}</span>
                    </div>
                    
                    ${item.is_numbered ? 
                        `<div class="market-serial" style="color:${getTierColor(item.max_supply)}; font-weight:bold; margin-top:5px;">
                            № ${item.serial_number} / ${maxSupplyDisplay}
                         </div>` 
                        : ''}
                </div>
            </div>

            <div class="market-item-right" style="text-align:right;">
                <div class="market-price" style="font-size:24px; color:gold; font-weight:bold;">${item.price} HC</div>
                <div style="margin-bottom:10px; font-size:12px; color:#aaa;">Ilość: ${item.quantity}</div>
                
                ${isMine 
                    ? `<button class="action-btn red" onclick="cancelListing(${item.id})">ANULUJ</button>`
                    : `<button class="action-btn purple" onclick="buyListing(${item.id}, ${item.price}, '${item.card_name}')">KUP</button>`
                }
            </div>
        `;

        // Stylowanie kontenera w JS (dla pewności)
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '15px';
        div.style.margin = '10px 0';
        div.style.background = 'rgba(255,255,255,0.05)';
        div.style.border = '1px solid #444';
        div.style.borderRadius = '8px';

        // KLIKNIĘCIE W OBRAZEK -> PODGLĄD
        const imgWrapper = div.querySelector('.market-img-wrapper');
        const img = div.querySelector('.market-img');
        
        // Stylizacja obrazka
        img.style.width = '60px'; 
        img.style.height = '84px'; 
        img.style.objectFit = 'cover'; 
        img.style.borderRadius = '4px';
        img.style.cursor = 'pointer';
        // Dodanie ramki rzadkości do obrazka
        img.style.border = `2px solid ${getRarityColor(item.rarity)}`;

        img.onclick = () => {
            if (window.showPreview) {
                // Przekazujemy pełny obiekt do podglądu, w tym max_supply
                window.showPreview({
                    card_id: item.card_id, // <--- DODANO TO POLE (TO NAPRAWIA #?)
                    name: item.card_name,
                    image_url: item.image_url,
                    rarity: item.rarity,
                    is_numbered: item.is_numbered,
                    serial_number: item.serial_number,
                    max_supply: item.max_supply, 
                    description: "Oferta z rynku",
                    source: "market" // Opcjonalnie, żeby wiedzieć skąd przyszło
                });
            }
        };

        container.appendChild(div);
    });
}

// Funkcje pomocnicze do kolorów (żeby JS nie był zależny tylko od CSS)
function getRarityColor(rarity) {
    if(rarity === 'Common') return '#7f8c8d';
    if(rarity === 'Rare') return '#3498db';
    if(rarity === 'Epic') return '#9b59b6';
    if(rarity === 'Legendary') return '#f1c40f';
    return '#fff';
}

function getTierColor(max) {
    if(max == 50) return '#2ecc71'; // Emerald
    if(max == 25) return '#f1c40f'; // Gold
    if(max == 10) return '#ff00cc'; // Pink
    if(max == 5) return '#00d2ff';  // Blue
    if(max == 1) return '#ff0000';  // Red
    return 'gold';
}

// --- AKCJE KUPNA / ANULOWANIA ---

window.cancelListing = async function(listingId) {
    if(!confirm("Wycofać ofertę?")) return;
    try {
        const res = await fetch('/market/cancel', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ listingId })
        });
        const data = await res.json();
        if(data.success) {
            alert("Oferta anulowana.");
            loadMarketData(); // Odśwież listę
            if(window.updateWallet) window.updateWallet();
        } else {
            alert(data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
};

window.buyListing = async function(listingId, price, name) {
    if(!confirm(`Kupić ${name} za ${price} HC?`)) return;
    try {
        const res = await fetch('/market/buy', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ listingId, amount: 1 })
        });
        const data = await res.json();
        if(data.success) {
            alert("Zakup udany!");
            loadMarketData();
            if(window.updateWallet) window.updateWallet();
        } else {
            alert("Błąd: " + data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
};

// Funkcja filtrowania (opcjonalna, jeśli masz inputy w HTML)
window.filterMarket = function() {
    // Tu można dodać logikę filtrowania listy po stronie klienta
    // na razie zostawmy puste lub proste odświeżenie
    loadMarketData();
};