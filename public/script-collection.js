/* --- script-collection.js (Wersja: Sortowanie + ID + Fix Statystyk) --- */

// Zmienne globalne do przechowywania danych (potrzebne do sortowania bez ponownego pobierania)
let loadedAllCards = [];
let loadedOwnedIds = [];

window.openCollection = function() {
    const p = document.getElementById('collection-panel');
    if(p) {
        p.classList.add('open');
        loadCollectionData();
    }
};

window.closeCollection = function() {
    const p = document.getElementById('collection-panel');
    if(p) p.classList.remove('open');
};

async function loadCollectionData() {
    const grid = document.getElementById('main-collection-grid');
    if (!grid) return;

    grid.innerHTML = '<p style="color:gray; width:100%; text-align:center; padding-top:50px;">Ładowanie księgi...</p>';
    
    // Reset stylów kontenera
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.justifyContent = 'center';
    grid.style.gap = '15px';
    grid.style.paddingBottom = '50px';

    try {
        const res = await fetch('/collection/data');
        const data = await res.json();

        if (data.success) {
            // Zapisz dane do zmiennych globalnych
            loadedAllCards = data.allCards;
            loadedOwnedIds = data.ownedIds.map(id => parseInt(id));

            // Domyślne sortowanie (po ID) i renderowanie
            sortCollection(); 
            calculateStats(loadedAllCards, loadedOwnedIds);
        } else {
            grid.innerHTML = `<p style="color:red; text-align:center;">Błąd: ${data.error}</p>`;
        }
    } catch (e) {
        console.error(e);
        grid.innerHTML = `<p style="color:red; text-align:center;">Błąd sieci.</p>`;
    }
}

// NOWA FUNKCJA SORTOWANIA
window.sortCollection = function() {
    const sortType = document.getElementById('collection-sort').value;
    
    // Kopia tablicy, żeby nie psuć oryginału
    let sortedCards = [...loadedAllCards];

    // Definicja wag rzadkości do sortowania
    const rarityOrder = { 'Legendary': 4, 'Epic': 3, 'Rare': 2, 'Common': 1 };

    sortedCards.sort((a, b) => {
        switch (sortType) {
            case 'rarity':
                // Od najwyższej rzadkości do najniższej
                return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
            
            case 'atk':
                // Od najwyższego ataku
                return (b.attack || 0) - (a.attack || 0);
            
            case 'def':
                // Od najwyższej obrony
                return (b.defense || 0) - (a.defense || 0);
            
            case 'name':
                // Alfabetycznie A-Z
                return a.name.localeCompare(b.name);
            
            case 'id':
            default:
                // Domyślnie po ID rosnąco
                return a.id - b.id;
        }
    });

    renderCollection(sortedCards, loadedOwnedIds);
};

/* --- script-collection.js: RENDEROWANIE Z EFEKTAMI 3D --- */

function renderCollection(cardsToRender, ownedIds) {
    const grid = document.getElementById('main-collection-grid');
    grid.innerHTML = '';

    cardsToRender.forEach(card => {
        const cId = parseInt(card.id);
        const isOwned = ownedIds.includes(cId);
        
        // Główny kontener (scena 3D)
        const wrapper = document.createElement('div');
        wrapper.className = `collection-card rarity-${card.rarity} ${isOwned ? '' : 'unowned'}`;
        
        // Wewnętrzna warstwa (to ona się obraca)
        const inner = document.createElement('div');
        inner.className = 'collection-card-inner';
        
        if (isOwned) {
            // Obrazek
            const img = document.createElement('img');
            img.src = card.image_url;
            img.className = 'collection-card-img';
            inner.appendChild(img);

            // Warstwa połysku (Shine)
            const shine = document.createElement('div');
            shine.className = 'collection-shine';
            inner.appendChild(shine);

            // LOGIKA 3D TILT
            wrapper.onmousemove = (e) => {
                const rect = wrapper.getBoundingClientRect();
                const x = e.clientX - rect.left; // X wewnątrz elementu
                const y = e.clientY - rect.top;  // Y wewnątrz elementu
                
                // Środek karty
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                // Oblicz rotację (max 15 stopni)
                const rotateX = ((y - centerY) / centerY) * -15; 
                const rotateY = ((x - centerX) / centerX) * 15;

                // Aplikuj styl
                inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
                
                // Przesuń połysk (Shine) przeciwnie do myszki
                shine.style.backgroundPosition = `${50 + (x/rect.width)*50}% ${50 + (y/rect.height)*50}%`;
                shine.style.opacity = 1;
            };

            wrapper.onmouseleave = () => {
                inner.style.transform = `rotateX(0) rotateY(0) scale(1)`; // Reset
                shine.style.opacity = 0;
            };

            // Kliknięcie -> Podgląd
            wrapper.onclick = () => {
                if (window.showPreview) {
                    window.showPreview({ 
                        ...card, 
                        quantity: undefined, 
                        is_numbered: false,
                        source: 'collection' 
                    });
                }
            };

        } else {
            // Karta nieposiadana (Kłódka)
            inner.innerHTML = `<span style="font-size:40px;">🔒</span>`;
            wrapper.title = "Nie posiadasz: " + card.name;
        }

        // Dodaj ID pod kartą
        const idLabel = document.createElement('div');
        idLabel.className = 'collection-card-id';
        idLabel.innerText = `#${card.id}`;

        wrapper.appendChild(inner);
        wrapper.appendChild(idLabel); // ID jest poza inner, więc się nie obraca (czytelność)
        
        grid.appendChild(wrapper);
    });
}

/* --- FIX: STATYSTYKI BEZ SECRET --- */
function calculateStats(allCards, ownedIds) {
    const totalEl = document.getElementById('collection-total');
    const tooltipEl = document.getElementById('collection-tooltip');
    
    if(!totalEl) return;

    // Unikalne posiadane (dla bezpieczeństwa Set)
    const uniqueOwned = new Set(ownedIds).size;
    
    totalEl.innerText = `${uniqueOwned} / ${allCards.length}`;

    if (tooltipEl) {
        // USUNIĘTO 'Secret' z tablicy
        const rarities = ['Common', 'Rare', 'Epic', 'Legendary'];
        let html = '';

        rarities.forEach(rarity => {
            const totalRarity = allCards.filter(c => c.rarity === rarity).length;
            const ownedRarity = allCards.filter(c => c.rarity === rarity && ownedIds.includes(parseInt(c.id))).length;
            
            let color = '#ccc';
            if(rarity === 'Rare') color = '#3498db';
            if(rarity === 'Epic') color = '#9b59b6';
            if(rarity === 'Legendary') color = '#f1c40f';

            html += `
                <div class="stat-row">
                    <span style="color:${color}">${rarity}:</span>
                    <span style="color:white;">${ownedRarity} / ${totalRarity}</span>
                </div>
            `;
        });

        const percent = allCards.length > 0 ? Math.floor((uniqueOwned / allCards.length) * 100) : 0;
        html += `<div style="text-align:center; margin-top:10px; color:gold; border-top:1px solid #555; padding-top:5px;">Postęp: ${percent}%</div>`;

        tooltipEl.innerHTML = html;
    }
}