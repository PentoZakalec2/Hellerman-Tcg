/* =========================================================
   script-inventory.js
   Obsługa Ekwipunku: Karty, Paczki, Sortowanie, Renderowanie
   ========================================================= */

// Zmienne lokalne dla ekwipunku
let loadedInventoryData = [];
let inventoryPacksCount = 0;

// 1. OTWIERANIE I ZAMYKANIE
window.openInventory = async function() {
    const p = document.getElementById('inventory-panel');
    p.classList.add('open');
    
    // Domyślnie resetuj do zakładki KARTY
    const tabs = document.querySelectorAll('.inv-tab');
    if(tabs[0]) tabs[0].classList.add('active');
    if(tabs[1]) tabs[1].classList.remove('active');
    
    document.getElementById('inventory-sort').style.display = 'block';

    const grid = document.getElementById('inv-grid');
    grid.innerHTML = '<p style="color:gray;text-align:center; padding-top:50px;">Ładowanie ekwipunku...</p>';
    grid.style.display = 'flex'; 

    try {
        const res = await fetch('/my-inventory');
        const data = await res.json();
        
        if(data.success) {
            // Zapisz dane
            loadedInventoryData = data.inventory;
            
            // Zapisz paczki
            if (data.packs) {
                inventoryPacksCount = data.packs.pack_karzel_count || 0;
            } else {
                inventoryPacksCount = 0;
            }

            // Wyrenderuj domyślny widok
            sortInventory();
        } else {
            grid.innerHTML = `<p style="color:red;">Błąd: ${data.error}</p>`;
        }
    } catch(e) { 
        console.error(e);
        grid.innerHTML = `<p style="color:red;">Błąd sieci.</p>`; 
    }
};

window.closeInventory = function() { 
    document.getElementById('inventory-panel').classList.remove('open'); 
};

// 2. PRZEŁĄCZANIE ZAKŁADEK (KARTY vs PACZKI)
window.switchInvTab = function(tabName) {
    const grid = document.getElementById('inv-grid');
    const sortSelect = document.getElementById('inventory-sort');
    const tabs = document.querySelectorAll('.inv-tab');

    // Reset wizualny
    tabs.forEach(t => t.classList.remove('active'));

    if (tabName === 'cards') {
        // --- WIDOK KART ---
        if(tabs[0]) tabs[0].classList.add('active');
        if(sortSelect) sortSelect.style.display = 'block';
        grid.style.display = 'flex';
        grid.style.justifyContent = 'center';
        
        // Renderuj z pamięci
        sortInventory(); 

    } else if (tabName === 'packs') {
        // --- WIDOK PACZEK ---
        if(tabs[1]) tabs[1].classList.add('active');
        if(sortSelect) sortSelect.style.display = 'none';
        grid.innerHTML = ''; 
        
        // Budujemy widok paczki
        const packWrapper = document.createElement('div');
        packWrapper.style.width = "100%";
        packWrapper.style.display = "flex";
        packWrapper.style.flexDirection = "column";
        packWrapper.style.alignItems = "center";
        packWrapper.style.marginTop = "50px";

        if (inventoryPacksCount > 0) {
            packWrapper.innerHTML = `
                <div style="position:relative; cursor:pointer; transition:transform 0.2s;" 
                     onmouseover="this.style.transform='scale(1.05)'" 
                     onmouseout="this.style.transform='scale(1)'" 
                     onclick="usePackFromInventory()">
                    <img src="booster.png" style="width:200px; filter: drop-shadow(0 0 20px gold);">
                    <div style="position:absolute; top:-10px; right:-10px; background:red; color:white; border-radius:50%; width:40px; height:40px; display:flex; justify-content:center; align-items:center; font-weight:bold; border:2px solid white; box-shadow: 0 2px 5px black;">${inventoryPacksCount}</div>
                </div>
                <h3 style="margin-top: 20px; color: gold; font-size: 24px;">Karzeł Pack</h3>
                <button class="action-btn purple" style="margin-top:20px;" onclick="usePackFromInventory()">OTWÓRZ</button>
            `;
        } else {
            packWrapper.innerHTML = `
                <div style="opacity: 0.4; text-align: center;">
                    <img src="booster.png" style="width:150px; filter: grayscale(1);">
                    <h3 style="color: #777; margin-top:10px;">Brak paczek</h3>
                    <p style="color: #555;">Kup więcej w sklepie!</p>
                    <button class="action-btn" style="margin-top:15px; background:#333;" onclick="if(window.openShop) window.openShop()">IDŹ DO SKLEPU</button>
                </div>
            `;
        }
        grid.appendChild(packWrapper);
    }
};

// 3. SORTOWANIE (ATK/DEF FIX)
window.sortInventory = function() {
    const sortType = document.getElementById('inventory-sort').value;
    const grid = document.getElementById('inv-grid');
    
    if (!loadedInventoryData || loadedInventoryData.length === 0) {
        grid.innerHTML = '<p style="color:#aaa; text-align:center; margin-top:50px;">Twój ekwipunek jest pusty.</p>';
        return;
    }

    let sorted = [...loadedInventoryData];
    const rarityOrder = { 'Legendary': 4, 'Epic': 3, 'Rare': 2, 'Common': 1 };

    sorted.sort((a, b) => {
        const atkA = parseInt(a.attack) || 0;
        const atkB = parseInt(b.attack) || 0;
        const defA = parseInt(a.defense) || 0;
        const defB = parseInt(b.defense) || 0;

        switch (sortType) {
            case 'rarity': return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0) || (a.card_id - b.card_id);
            case 'atk': return atkB - atkA;
            case 'def': return defB - defA;
            case 'qty': return (b.quantity || 1) - (a.quantity || 1);
            default: return a.card_id - b.card_id;
        }
    });

    renderInventory3D(sorted);
};

// 4. RENDEROWANIE KART (3D + Licznik na dole)
function renderInventory3D(cards) {
    const grid = document.getElementById('inv-grid');
    grid.innerHTML = '';

    cards.forEach(card => {
        const wrapper = document.createElement('div');
        let classes = `collection-card rarity-${card.rarity}`;
        if (card.is_numbered) {
            classes += ' numbered';
            if (card.max_supply) classes += ` tier-${card.max_supply}`;
        }
        wrapper.className = classes;
        wrapper.style.cursor = "pointer";

        const inner = document.createElement('div');
        inner.className = 'collection-card-inner';

        const img = document.createElement('img');
        img.src = card.image_url;
        img.className = 'collection-card-img';
        
        const shine = document.createElement('div');
        shine.className = 'collection-shine';

        inner.appendChild(img);
        inner.appendChild(shine);
        wrapper.appendChild(inner);

        // ID Karty
        const idLabel = document.createElement('div');
        idLabel.className = 'collection-card-id';
        if (card.is_numbered) {
            idLabel.innerText = `#${card.card_id} [${card.serial_number}/${card.max_supply}]`;
            idLabel.style.color = "gold"; 
            idLabel.style.borderColor = "gold";
        } else {
            idLabel.innerText = `#${card.card_id}`;
        }
        wrapper.appendChild(idLabel);

        // Licznik Ilości (Prawy Dolny Róg KARTY)
        if (card.quantity > 1) {
            const badge = document.createElement('div');
            badge.className = 'card-qty-badge'; // Stylizowane w CSS
            badge.innerText = `x${card.quantity}`;
            wrapper.appendChild(badge);
        }

        // Tilt Effect
        wrapper.onmousemove = (e) => {
            const rect = wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const rx = ((y - cy) / cy) * -15; 
            const ry = ((x - cx) / cx) * 15;
            inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.05)`;
            shine.style.backgroundPosition = `${50 + (x/rect.width)*50}% ${50 + (y/rect.height)*50}%`;
            shine.style.opacity = 1;
        };
        wrapper.onmouseleave = () => {
            inner.style.transform = `rotateX(0) rotateY(0) scale(1)`;
            shine.style.opacity = 0;
        };

        wrapper.onclick = () => { if(window.showPreview) window.showPreview(card); };
        grid.appendChild(wrapper);
    });
}

// 5. UŻYCIE PACZKI Z EKWIPUNKU
window.usePackFromInventory = async function() {
    // Sprawdź czy gra nie jest zajęta (zmienna globalna w script.js)
    if (window.isOpening) return;
    
    // Zamknij okno
    closeInventory();
    
    // Uruchom animację otwierania (funkcja z script.js)
    const rect = { left: window.innerWidth/2, top: window.innerHeight/2, width: 0, height: 0 };
    if(window.triggerInventoryPackOpen) {
        window.triggerInventoryPackOpen(rect);
    }
};