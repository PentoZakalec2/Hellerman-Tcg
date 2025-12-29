/* --- script.js - WERSJA POPRAWIONA (FIX INDEXU KART) --- */

// =========================================================
// 1. ZMIENNE I ELEMENTY DOM
// =========================================================

const CLICKS_TO_OPEN = 6;
let clickCount = 0;
let fetchedCards = [];
let currentCardIndex = 0;
let isOpening = false; 
let availablePacksCount = 0;

// Auth / Admin
let isAdmin = false;
let isLoggedIn = false;

// Elementy Gry i Boostera
const boosterSection = document.getElementById('booster-section');
const boosterWrapper = document.getElementById('booster-wrapper');
const statusText = document.getElementById('status-text');
const cardStack = document.getElementById('card-stack');
const confettiContainer = document.getElementById('confetti-container');
const limitMsg = document.getElementById('limit-message');

// Panele Główne
const adminPanel = document.getElementById('admin-panel');
const invPanel = document.getElementById('inventory-panel');
const invGrid = document.getElementById('inv-grid');
const dbPanel = document.getElementById('deck-builder-panel');
const walletContainer = document.getElementById('wallet-container');

// Elementy Deck Buildera
const currentDeckGrid = document.getElementById('current-deck-grid');
const collectionGrid = document.getElementById('collection-grid');
const deckCounter = document.getElementById('deck-counter');
const collCounter = document.getElementById('collection-counter');
const deckNameInput = document.getElementById('deck-name-input');
const deckSlotsList = document.getElementById('deck-slots-list');

// Admin Inputs
const adminUnlimitedCheck = document.getElementById('admin-unlimited');
const adminCountInput = document.getElementById('admin-count');
const adminRaritySelect = document.getElementById('admin-rarity');

// Modal Podglądu i Niszczenia (Smash)
const previewModal = document.getElementById('card-preview-modal');
const previewContainer = document.getElementById('preview-card-container');
const smashBtn = document.getElementById('smash-btn');
const previewMsg = document.getElementById('preview-msg');
const smashControls = document.getElementById('smash-controls');
const smashInput = document.getElementById('smash-amount');
const smashMaxText = document.getElementById('smash-max-text');

// Zmienne Stanu
let myAllCards = [];
let currentDeck = [];
let currentDeckIndex = 1;
let savedDecksData = {};
let currentPreviewCard = null; 
const DECK_LIMIT = 18;


// =========================================================
// 2. START APLIKACJI (AUTH)
// =========================================================

(async function start() {
    await checkAuth(); 
    if (isLoggedIn) {
        initGame(); 
    } else {
        statusText.innerText = "Zaloguj się, aby grać!";
        boosterSection.style.display = 'none';
    }
})();
/* --- ZAKTUALIZOWANA FUNKCJA AUTH --- */
async function checkAuth() {
    try {
        const res = await fetch('/check-auth');
        const data = await res.json();
        
        const welcomeScreen = document.getElementById('welcome-screen');
        const uiContainer = document.getElementById('ui-container');
        const wallet = document.getElementById('wallet-container');
        const userDisplay = document.getElementById('username-display');

        if (data.isLoggedIn) {
            isLoggedIn = true;
            isAdmin = data.isAdmin;
            window.isAdmin = data.isAdmin;
            
            userDisplay.innerText = data.username;
            
            // UKRYJ EKRAN POWITALNY, POKAŻ GRĘ
            if(welcomeScreen) welcomeScreen.style.display = 'none';
            if(uiContainer) uiContainer.style.display = 'flex';
            if(wallet) wallet.style.display = 'flex';

            // Odkrywanie przycisków
            document.getElementById('inventory-wrapper').style.display = 'flex';
            document.getElementById('deckbuilder-wrapper').style.display = 'flex';
            document.getElementById('shop-wrapper').style.display = 'flex';
            document.getElementById('market-wrapper').style.display = 'flex'; 
            document.getElementById('collection-wrapper').style.display = 'flex';
            document.getElementById('play-wrapper').style.display = 'flex';

            if (isAdmin) {
                const adminP = document.getElementById('admin-panel');
                if(adminP) { adminP.style.display = 'block'; adminP.classList.add('collapsed'); }
            }

            updateWallet();
            initGame(); // Inicjalizacja paczek
        } else {
            // POKAŻ EKRAN POWITALNY
            if(welcomeScreen) welcomeScreen.style.display = 'flex';
            if(uiContainer) uiContainer.style.display = 'none';
            if(wallet) wallet.style.display = 'none';
        }
    } catch (e) { console.error("Auth error:", e); }
}

async function updateWallet() {
    try {
        const res = await fetch('/wallet');
        const data = await res.json();
        if(data.success) {
            const w = data.wallet;
            document.getElementById('coin-amount').innerText = w.hellerman_coins;
            document.getElementById('shard-display').innerHTML = `
                <span class="s-common">${w.shard_common}</span>/
                <span class="s-rare">${w.shard_rare}</span>/
                <span class="s-epic">${w.shard_epic}</span>/
                <span class="s-legendary">${w.shard_legendary}</span>/
                <span class="s-secret">${w.shard_secret}</span>
            `;
        }
    } catch(e) {}
}

async function initGame() {
    resetBoosterVisuals();
    try {
        const res = await fetch('/pack-status');
        const data = await res.json();

        let packsLeft = 0;
        if (data.canOpen) {
             packsLeft = 5 - (data.packsOpened || 0);
        }
        
        if (isAdmin && document.getElementById('admin-unlimited').checked) packsLeft = 5;

        availablePacksCount = packsLeft;
        renderPacksUI(); 

        if (availablePacksCount > 0) {
            statusText.innerText = "Wybierz paczkę!";
            limitMsg.style.display = 'none';
        } else {
            statusText.innerText = "Brak paczek na dziś.";
            boosterSection.style.display = 'none';
            limitMsg.style.display = 'block';
        }

    } catch (e) { console.error(e); statusText.innerText = "Błąd połączenia"; }
}

function renderPacksUI() {
    const activeContainer = document.getElementById('active-pack-container');
    const stackContainer = document.getElementById('pack-stack-container');
    
    activeContainer.innerHTML = '';
    activeContainer.style.opacity = '1';
    activeContainer.style.pointerEvents = 'auto'; // ODBLOKOWANIE KLIKANIA
    
    stackContainer.innerHTML = '';

    if (availablePacksCount <= 0) return;

    // Renderuj Aktywną Paczkę
    const activePack = document.createElement('img');
    activePack.src = 'booster.png';
    activePack.id = 'active-pack-img';
    
    // PRZYPISANIE KLIKNIĘCIA
    activeContainer.onclick = function() { 
        triggerPackOpeningSequence(activePack); 
    };
    
    activeContainer.appendChild(activePack);

    // Renderuj Stos
    const stackCount = availablePacksCount - 1;
    for (let i = 0; i < stackCount; i++) {
        const div = document.createElement('div');
        div.className = 'stack-pack';
        div.innerHTML = `<img src="booster.png">`;
        stackContainer.appendChild(div);
    }
}

// =========================================================
// 3. SEKWENCJA OTWIERANIA (LOT, BOOSTER, KARTY)
// =========================================================

async function triggerPackOpeningSequence(packElement) {
    if (isOpening) return; 
    isOpening = true; 
    
    // 1. Pozycja startowa (paczka na dole)
    const startRect = packElement.getBoundingClientRect();
    
    // 2. POZYCJA DOCELOWA (Mierzymy prawdziwy booster na stole)
    // Musimy go na chwilę włączyć w tle, żeby przeglądarka obliczyła wymiary
    boosterSection.style.display = 'flex';
    boosterSection.style.opacity = '0';
    // Ważne: upewnij się, że booster nie ma transformacji w tym momencie
    const boosterImg = document.getElementById('booster-img');
    const targetRect = boosterImg.getBoundingClientRect(); 

    // Ukrywamy z powrotem
    boosterSection.style.display = 'none';

    // 3. Tworzymy latającą paczkę
    const flyer = document.createElement('img');
    flyer.src = 'booster.png';
    flyer.className = 'pack-transfer-anim'; // Klasa z CSS (musi mieć transition: all)
    
    // Ustawiamy start (dokładnie tam gdzie kliknięto)
    flyer.style.left = startRect.left + 'px';
    flyer.style.top = startRect.top + 'px';
    flyer.style.width = startRect.width + 'px';
    flyer.style.height = startRect.height + 'px';
    
    document.body.appendChild(flyer);

    // Ukrywamy oryginał na dole
    const activeContainer = document.getElementById('active-pack-container');
    activeContainer.style.opacity = '0';
    activeContainer.style.pointerEvents = 'none';

    // Wymuszamy przeliczenie stylu (Reflow), żeby start zadziałał
    void flyer.offsetWidth;

    // 4. LOT DO CELU (Używamy zmierzonych wymiarów targetRect)
    flyer.style.left = targetRect.left + 'px';
    flyer.style.top = targetRect.top + 'px';
    flyer.style.width = targetRect.width + 'px';
    flyer.style.height = targetRect.height + 'px';
    
    // 5. Koniec animacji (0.6s - musi pasować do CSS .pack-transfer-anim)
    setTimeout(async () => {
        flyer.remove();
        
        // Pokaż prawdziwy stół
        boosterSection.style.display = 'flex';
        boosterSection.style.opacity = 1;
        
        // Włączamy promienie
        boosterSection.classList.add('active-glow');
        
        // Reset transformacji boostera
        const wrapper = document.getElementById('booster-wrapper');
        wrapper.style.transform = 'none';
        
        setupBoosterInteractions(); 
        isOpening = false; 
        
    }, 600);
}

function setupBoosterInteractions() {
    localClickCount = 0; // Reset licznika kliknięć
    
    // Usuń stare listenery (dla bezpieczeństwa) i dodaj nowy
    boosterWrapper.onclick = null;
    boosterWrapper.onclick = handleBoosterClick;
    
    // Obsługa ruszania myszką (efekt 3D)
    boosterWrapper.onmousemove = handleBoosterTilt;
    boosterWrapper.onmouseleave = resetBoosterTilt;
}

/* --- DODAJ TĘ FUNKCJĘ (BRAKOWAŁO JEJ) --- */
window.triggerInventoryPackOpen = function(startRect) {
    if (isOpening) return;
    isOpening = true; // Blokujemy interfejs

    // 1. Zamknij panele
    if(window.closeInventory) window.closeInventory();
    if(window.closeShopAPI) window.closeShopAPI();

    // 2. Pobierz dokładny cel (Booster na środku)
    // Pokazujemy go na chwilę niewidocznie, żeby pobrać wymiary
    boosterSection.style.display = 'flex';
    boosterSection.style.opacity = '0';
    const boosterImg = document.getElementById('booster-img');
    const targetRect = boosterImg.getBoundingClientRect();
    boosterSection.style.display = 'none';

    // 3. Stwórz latającą paczkę
    const flyer = document.createElement('img');
    flyer.src = 'booster.png';
    flyer.className = 'pack-transfer-anim'; // Klasa z CSS (0.6s)
    
    // Pozycja startowa (z EQ)
    flyer.style.left = startRect.left + 'px';
    flyer.style.top = startRect.top + 'px';
    flyer.style.width = startRect.width + 'px';
    flyer.style.height = startRect.height + 'px';
    
    document.body.appendChild(flyer);

    // Wymuś reflow (żeby przeglądarka zarejestrowała start)
    void flyer.offsetWidth;

    // 4. Lot do celu
    flyer.style.left = targetRect.left + 'px';
    flyer.style.top = targetRect.top + 'px';
    flyer.style.width = targetRect.width + 'px';
    flyer.style.height = targetRect.height + 'px';

    // 5. Po dolocie (0.6s) -> Otwórz
    setTimeout(async () => {
        flyer.remove();
        
        // Pokaż booster i efekty
        resetBoosterVisuals();
        boosterSection.style.display = 'flex';
        boosterSection.style.opacity = 1;
        boosterSection.classList.add('active-glow');
        limitMsg.style.display = 'none';

        // Wywołaj funkcję otwierania (z flagą useInventory=true)
        // Drugi parametr 'true' oznacza, że otwieramy z EQ
        await attemptOpenPack(false, true); 

    }, 600); // Czas musi pasować do CSS .pack-transfer-anim
};

function handleBoosterClick(e) {
    if (isOpening) return;

    localClickCount++;
    const boosterSec = document.getElementById('booster-section');
    const boosterImg = document.getElementById('booster-img');
    
    // --- DOPAMINA ---
    // 1. Małe konfetti w miejscu kliknięcia (lub losowo wokół paczki)
    spawnConfetti('center', 15); // Mały wybuch (15 cząsteczek)
    
    // 2. Efekt uderzenia (skala i jasność)
    boosterImg.classList.remove('click-punch'); 
    void boosterImg.offsetWidth; // Reset animacji CSS
    boosterImg.classList.add('click-punch');

    // 3. Efekt trzęsienia
    boosterSec.classList.add('shaking');
    setTimeout(() => boosterSec.classList.remove('shaking'), 100);

    // 4. Skalowanie progresywne (coraz większa paczka)
    const progress = localClickCount / CLICKS_TO_OPEN;
    boosterWrapper.style.setProperty('--scale-factor', 1 + (progress * 0.15));

    // Jeśli kliknięto wystarczająco razy -> Wywołaj finalne otwarcie
    if(localClickCount >= CLICKS_TO_OPEN) {
        // Wyłączamy "Boskie Promienie" przy wybuchu
        boosterSection.classList.remove('active-glow');
        finishOpening(); 
    }
}

async function finishOpening() {
    // 1. Zablokuj klikanie
    isOpening = true; 
    document.getElementById('status-text').innerText = "Losowanie...";
    boosterWrapper.onclick = null; 

    try {
        const bodyData = {}; 
        
        const unlimitedCheck = document.getElementById('admin-unlimited');
        if(isAdmin && unlimitedCheck && unlimitedCheck.checked) {
            bodyData.adminUnlimited = true;
        }

        // 2. Zapytanie do serwera
        const res = await fetch('/open-pack', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(bodyData)
        });
        const data = await res.json();

        if(data.success) {
            fetchedCards = data.cards;
            
            // 3. Efekt wybuchu
            const bSection = document.getElementById('booster-section');
            bSection.classList.add('explode');
            spawnConfetti('center', 50);
            
            // 4. Po wybuchu (0.5s) schowaj paczkę i pokaż karty
            setTimeout(() => {
                bSection.style.display = 'none';
                bSection.classList.remove('explode');
                bSection.style.opacity = 0; 
                
                // Pokaż karty na stole
                document.getElementById('card-stack').style.display = 'flex';
                renderStack(); 
                
                document.getElementById('status-text').innerText = "";
            }, 500);

        } else {
            alert("Błąd: " + data.error);
            isOpening = false;
            document.getElementById('booster-section').style.display = 'none';
            renderPacksUI(); 
            
            if (data.error === "LIMIT_REACHED") {
                document.getElementById('limit-message').style.display = 'block';
                document.getElementById('status-text').innerText = "Wróć jutro!";
            }
        }
    } catch(e) { 
        console.error(e); 
        alert("Błąd połączenia");
        isOpening = false; 
        renderPacksUI();
    }
}

// ZAKTUALIZOWANA funkcja otwierania (obsługuje inventory - stara wersja, zostawiona dla kompatybilności)
// ZAKTUALIZOWANA funkcja otwierania (obsługuje inventory i nowe opcje admina)
async function attemptOpenPack(isForcedTest = false, fromInventory = false) {
    if(isOpening && !fromInventory) return;
    
    isOpening = true;
    statusText.innerText = "Losowanie...";
    statusText.style.opacity = 1;
    
    const bodyData = {};
    
    if (fromInventory) {
        bodyData.useInventory = true;
    }

    if (isAdmin) {
        const adminUnlimitedCheck = document.getElementById('admin-unlimited');
        if (adminUnlimitedCheck && adminUnlimitedCheck.checked) bodyData.adminUnlimited = true;
        
        if (isForcedTest) {
            bodyData.customCount = document.getElementById('admin-count').value;
            bodyData.guaranteedRarity = document.getElementById('admin-rarity').value;
            
            // --- NOWE PARAMETRY ADMINA ---
            const forceNumCheck = document.getElementById('admin-force-numbered');
            if (forceNumCheck && forceNumCheck.checked) {
                bodyData.adminForceNumbered = true;
                bodyData.adminForceTier = document.getElementById('admin-force-tier').value;
            }
        }
    }

    try {
        const res = await fetch('/open-pack', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });
        const data = await res.json();
        
        if (data.success) {
            fetchedCards = data.cards;
            openBoosterAnimation();
        } else if (data.error === "LIMIT_REACHED") {
            boosterSection.style.display = 'none';
            limitMsg.style.display = 'block';
            isOpening = false;
        } else {
            alert("Błąd: " + data.error);
            resetBoosterVisuals();
        }
    } catch (e) {
        alert("Błąd serwera");
        resetBoosterVisuals();
    }
}

function openBoosterAnimation() {
    statusText.innerText = ""; boosterSection.classList.add('explode'); spawnConfetti('center', 50);
    setTimeout(() => { 
        boosterSection.style.opacity = 0; boosterSection.style.display = 'none'; cardStack.style.display = 'flex'; 
        renderStack(); 
    }, 500);
}

// =========================================================
// 4. RENDEROWANIE KART (Stack na stole)
// =========================================================

function renderStack() {
    // >>> KLUCZOWA POPRAWKA: RESET INDEXU <<<
    currentCardIndex = 0; 
    // =======================================

    cardStack.innerHTML = '';
    fetchedCards.slice().reverse().forEach((card, reverseIndex) => {
        const realIndex = fetchedCards.length - 1 - reverseIndex;
        const el = createCardElement(card, realIndex);
        cardStack.appendChild(el);
    });
    updateInteractiveCard();
}

/* --- script.js - POPRAWKA RENDEROWANIA KARTY --- */
function createCardElement(card, index) {
    const wrapper = document.createElement('div');
    wrapper.className = `card-wrapper rarity-${card.rarity}`;
    
    // Klasy tierów (tylko jeśli jest max_supply)
    if (card.is_numbered && card.max_supply) {
        wrapper.classList.add('numbered');
        wrapper.classList.add(`tier-${card.max_supply}`);
    }
    
    wrapper.id = `card-${index}`; 
    wrapper.style.zIndex = 100 - index; 
    wrapper.dataset.rarity = card.rarity;
    
    wrapper.addEventListener('mousemove', handleCardTilt);
    wrapper.addEventListener('mouseleave', resetCardTilt);

    // FIX: Wyświetlanie "undefined"
    let overlay = '';
    if (card.is_numbered) {
        // Jeśli max_supply istnieje to pokaż, jeśli nie to znak zapytania
        const max = card.max_supply ? card.max_supply : '?';
        overlay = `<div class="serial-overlay">№ ${card.serial_number} / ${max}</div>`;
    }

    wrapper.innerHTML = `
        <div class="card-inner">
            <div class="card-face card-back"></div>
            <div class="card-face card-front">
                <img src="${card.image_url}">
                ${overlay}
            </div>
        </div>
    `;
    return wrapper;
}

function updateInteractiveCard() {
    if (currentCardIndex >= fetchedCards.length) {
        // KONIEC KART W PACZCE
        onPackFinished(); 
        return;
    }
    
    const currentCard = document.getElementById(`card-${currentCardIndex}`);
    
    currentCard.onclick = function() {
        if (!currentCard.classList.contains('flipped')) {
            currentCard.classList.add('flipped');
            // efekty...
        } else {
            currentCard.classList.add('slide-out');
            currentCardIndex++;
            setTimeout(updateInteractiveCard, 200);
        }
    };
}

async function onPackFinished() {
    // Ukryj stos kart
    setTimeout(() => { document.getElementById('card-stack').style.display = 'none'; }, 500);
    
    // Zmniejsz licznik dostępnych paczek
    availablePacksCount--;
    
    // Przenieś następną paczkę ze stosu
    await animateNextPackFromStack();

    // DOPIERO TERAZ ODBLOKUJEMY GRĘ
    isOpening = false; 
    
    // Sprawdź czy koniec
    if (availablePacksCount <= 0) {
        document.getElementById('limit-message').style.display = 'block';
        statusText.innerText = "Wróć jutro!";
    } else {
        statusText.innerText = "Wybierz kolejną paczkę!";
    }
}

function animateNextPackFromStack() {
    return new Promise(resolve => {
        const stackContainer = document.getElementById('pack-stack-container');
        const activeContainer = document.getElementById('active-pack-container');
        
        // Sytuacja: Brak paczek na stosie -> nic nie spada, nic się nie wysuwa
        if (stackContainer.children.length === 0) {
            activeContainer.innerHTML = ''; 
            activeContainer.style.opacity = 1;
            activeContainer.style.pointerEvents = 'none';
            resolve();
            return;
        }

        // 1. ANIMACJA SPADANIA ZE STOSU (DROP DOWN)
        const nextPack = stackContainer.lastElementChild; 
        
        // Dodajemy klasę lub styl inline, żeby spadła
        nextPack.style.transition = 'transform 0.5s ease-in, opacity 0.3s ease-in';
        nextPack.style.transform = 'translateY(300px) rotate(10deg)'; // Spada w dół i lekko się obraca
        nextPack.style.opacity = '0';

        // Czekamy aż spadnie (0.5s)
        setTimeout(() => {
            nextPack.remove(); // Usuwamy ze stosu

            // 2. PRZYGOTOWANIE NOWEJ PACZKI (WYSUNIĘCIE Z DOŁU)
            // Renderujemy UI, ale musimy przechwycić nową paczkę ZANIM się pokaże
            renderPacksUI(); 
            
            // activeContainer ma teraz nową paczkę w środku.
            // Ustawiamy jej pozycję startową (schowana w dole)
            activeContainer.style.transition = 'none'; // Wyłączamy animacje na moment ustawiania
            activeContainer.style.transform = 'translateX(-50%) translateY(300px)'; // Schowana pod ekranem
            activeContainer.style.opacity = '0';

            // Wymuszamy Reflow (żeby przeglądarka "łyknęła" pozycję startową)
            void activeContainer.offsetWidth;

            // 3. ANIMACJA WYJAZDU (SLIDE UP)
            activeContainer.style.transition = 'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.6s ease-out';
            activeContainer.style.transform = 'translateX(-50%) translateY(0)'; // Wjeżdża na swoje miejsce
            activeContainer.style.opacity = '1';

            // Po zakończeniu wjazdu (0.6s)
            setTimeout(() => {
                // Czyścimy style inline transition, żeby hover w CSS działał poprawnie
                activeContainer.style.transition = ''; 
                activeContainer.style.transform = ''; 
                resolve();
            }, 600);

        }, 400); // Czas spadania
    });
}

function resetBoosterVisuals() {
    clickCount = 0; isOpening = false; currentCardIndex = 0;
    boosterSection.classList.remove('explode', 'click-bounce', 'shaking');
    boosterWrapper.style.setProperty('--scale-factor', 1); boosterSection.style.setProperty('--glow-opacity', 0); resetBoosterTilt();
}

/* --- script.js - FIX PODGLĄDU, PRZYCISKÓW I ALERTÓW --- */

// 1. NOWY SYSTEM ALERTÓW
window.showCustomAlert = function(msg) {
    const el = document.getElementById('custom-alert');
    const txt = document.getElementById('custom-alert-msg');
    if(el && txt) {
        txt.innerText = msg;
        el.style.display = 'flex';
    } else {
        alert(msg); // Fallback
    }
};

/* --- script.js: TOTALNY FIX PODGLĄDU --- */
window.showPreview = function(cardData) {
    const modal = document.getElementById('card-preview-modal');
    const container = document.getElementById('preview-card-container');
    const msg = document.getElementById('preview-msg');
    
    if (!modal || !container) return;

    currentPreviewCard = cardData;
    container.innerHTML = ''; 

    // SPRAWDZENIE ŹRÓDŁA
    const isCollection = (cardData.source === 'collection');

    // Tworzymy główny wrapper
    const mainWrapper = document.createElement('div');
    // Przypisujemy klasę w zależności od trybu (CSS to obsłuży)
    mainWrapper.className = isCollection ? 'preview-layout-split' : 'preview-layout-center';

    // =========================================================
    // CZĘŚĆ 1: PANEL BOCZNY (Tylko dla Kolekcji!)
    // =========================================================
    if (isCollection) {
        const infoPanel = document.createElement('div');
        infoPanel.className = 'preview-info-panel';
        
        infoPanel.innerHTML = `<div class="info-header">Dostępność Karty</div>`;

        let html = '';
        
        // 1. Wersja Nienumerowana
        const hasUnnumbered = !cardData.is_only_numbered && !cardData.IS_ONLY_NUMBERED;
        if (hasUnnumbered) {
            html += `
            <div class="info-row">
                <span style="color:#aaa;">Nienumerowana</span>
                <span class="count-box">∞</span>
            </div>`;
        }

        // 2. Wersje Numerowane (Tiery)
        const tiersStr = cardData.allowed_tiers || cardData.ALLOWED_TIERS || "";
        if (tiersStr) {
            const tiers = tiersStr.split(',').map(t => t.trim());
            tiers.forEach(tier => {
                // Kolory dla tekstów
                let color = '#fff';
                if(tier == '50') color = '#2ecc71'; // Emerald
                if(tier == '25') color = '#ffd700'; // Gold
                if(tier == '10') color = '#ff00cc'; // Pink
                if(tier == '5') color = '#00d2ff';  // Blue
                if(tier == '1') color = '#ff0000';  // Red

                // ID dla licznika
                const cId = cardData.id || cardData.card_id;
                const countId = `count-${cId}-${tier}`;

                html += `
                <div class="info-row">
                    <span style="color:${color}; font-weight:bold;">Numerowana 1/${tier}</span>
                    <span id="${countId}" class="count-box">.../${tier}</span>
                </div>`;
            });
        }

        infoPanel.innerHTML += html;

        // Opis
        if (cardData.description) {
            infoPanel.innerHTML += `
                <div class="info-header" style="margin-top:20px; font-size:14px; border:none; color:#777;">Opis</div>
                <div style="font-size:13px; color:#bbb; font-style:italic;">"${cardData.description}"</div>
            `;
        }

        mainWrapper.appendChild(infoPanel);
    }

    // =========================================================
    // CZĘŚĆ 2: SAMA KARTA (Dla obu trybów)
    // =========================================================
    // Tworzymy kontener na kartę
    const cardContainer = document.createElement('div');
    // Ważne: to centruje kartę w jej kolumnie
    cardContainer.style.display = 'flex';
    cardContainer.style.flexDirection = 'column';
    cardContainer.style.alignItems = 'center';

    // Generowanie HTML karty 3D (Standardowa struktura)
    const wrapper = document.createElement('div');
    
    // Klasy CSS
    let classes = `collection-card preview-big rarity-${cardData.rarity}`;
    if (cardData.is_numbered) classes += ' numbered';
    if (cardData.max_supply) classes += ` tier-${cardData.max_supply}`;
    wrapper.className = classes;

    // Struktura wewnętrzna
    const inner = document.createElement('div');
    inner.className = 'collection-card-inner';

    const img = document.createElement('img');
    img.src = cardData.image_url || cardData.IMAGE_URL;
    img.className = 'collection-card-img';

    const shine = document.createElement('div');
    shine.className = 'collection-shine';

    inner.appendChild(img);
    inner.appendChild(shine);
    wrapper.appendChild(inner);

    // ID pod kartą
    const idLabel = document.createElement('div');
    idLabel.className = 'collection-card-id';
    let idTxt = `#${cardData.card_id || cardData.id || '?'}`;
    
    // Jeśli mamy numer seryjny (Ekwipunek) to go pokazujemy
    if (cardData.serial_number) {
        idTxt += ` [${cardData.serial_number}/${cardData.max_supply}]`;
        idLabel.style.color = 'gold';
        idLabel.style.borderColor = 'gold';
    }
    idLabel.innerText = idTxt;

    // Logika 3D Tilt (Myszka)
    wrapper.onmousemove = (e) => {
        const r = wrapper.getBoundingClientRect();
        const x = e.clientX - r.left; const y = e.clientY - r.top;
        const rx = ((y - r.height/2) / (r.height/2)) * -10; // Max 10 stopni
        const ry = ((x - r.width/2) / (r.width/2)) * 10;
        inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.02)`;
        shine.style.backgroundPosition = `${x/r.width*100}% ${y/r.height*100}%`;
        shine.style.opacity = 1;
    };
    wrapper.onmouseleave = () => {
        inner.style.transform = `rotateX(0) rotateY(0) scale(1)`;
        shine.style.opacity = 0;
    };

    // Składanie karty
    cardContainer.appendChild(wrapper);
    cardContainer.appendChild(idLabel);

    // Dodanie do głównego wrappera
    mainWrapper.appendChild(cardContainer);

    // WRZUCENIE DO MODALA
    container.appendChild(mainWrapper);

    if (msg) msg.innerText = "";
    
    // Obsługa przycisków
    if (typeof setupPreviewButtons === 'function') {
        setupPreviewButtons(cardData);
    }
    
    modal.style.display = 'flex';

    // =========================================================
    // CZĘŚĆ 3: POBIERANIE LICZNIKÓW (Tylko Kolekcja + Tiery)
    // =========================================================
    if (isCollection) {
        const tiersStr = cardData.allowed_tiers || cardData.ALLOWED_TIERS;
        const cId = cardData.id || cardData.card_id;
        
        if (tiersStr && typeof fetchCardDropStats === 'function') {
            fetchCardDropStats(cId, tiersStr);
        }
    }
};

async function fetchCardDropStats(cardId, tiersStr) {
    const tiers = tiersStr.split(',').map(t => t.trim());

    try {
        const res = await fetch(`/card-stats?cardId=${cardId}`);
        const data = await res.json();

        if (data.success) {
            tiers.forEach(tier => {
                const el = document.getElementById(`count-${cardId}-${tier}`);
                if (el) {
                    // data.stats[tier] to liczba pozostałych kart (np. 13)
                    const remaining = data.stats[tier] !== undefined ? data.stats[tier] : 0;
                    
                    // Kolorowanie: 0 = Czerwony, >0 = Zielony
                    if (remaining <= 0) {
                        el.style.color = '#e74c3c';
                        el.innerText = `0/${tier}`;
                    } else {
                        el.style.color = '#2ecc71';
                        el.innerText = `${remaining}/${tier}`;
                    }
                }
            });
        }
    } catch (e) {
        console.log("Błąd pobierania statystyk dropu");
    }
}

// 4. NAPRAWIONA LOGIKA PRZYCISKÓW (ZAMKNIJ / SMASH)
/* --- script.js: POPRAWIONA OBSŁUGA PRZYCISKÓW PODGLĄDU --- */
function setupPreviewButtons(cardData) {
    const actions = document.querySelector('#card-preview-modal .preview-actions');
    const smashControls = document.getElementById('smash-controls');
    
    // Pobieramy przyciski. W HTML masz ID dla Smash, resztę łapiemy po klasach
    const smashBtn = document.getElementById('smash-btn'); 
    // Market to środkowy (gray), Close to czerwony (red)
    const marketBtn = actions.querySelector('.action-btn.gray') || actions.querySelector('.action-btn:nth-child(2)');
    const closeBtn = actions.querySelector('.action-btn.red');

    // Reset widoku
    if (smashControls) smashControls.style.display = 'none';
    if (actions) actions.style.display = 'flex';

    // 1. OBSŁUGA "ZAMKNIJ"
    if (closeBtn) {
        // Klonujemy, żeby usunąć stare listenery i przywrócić czysty stan
        const newClose = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newClose.onclick = function() {
            closePreview();
        };
    }

    // 2. LOGIKA PRZYCISKÓW AKCJI
    const isCollectionMode = (cardData.quantity === undefined || cardData.source === 'collection');

    // -- BUTTON SMASH --
    if (smashBtn) {
        const newSmash = smashBtn.cloneNode(true);
        smashBtn.parentNode.replaceChild(newSmash, smashBtn);

        if (isCollectionMode) {
            newSmash.style.display = 'none';
        } else {
            newSmash.style.display = 'block';
            if (cardData.quantity > 1) {
                newSmash.disabled = false;
                newSmash.className = 'action-btn purple'; // Reset klasy
                newSmash.innerText = "WYMIEŃ NA SHARDY";
                newSmash.onclick = () => {
                    actions.style.display = 'none';
                    if (smashControls) {
                        smashControls.style.display = 'flex';
                        const inp = document.getElementById('smash-amount');
                        const maxTxt = document.getElementById('smash-max-text');
                        if (inp) {
                            inp.value = 1;
                            inp.max = cardData.quantity - 1;
                        }
                        if (maxTxt) maxTxt.innerText = `/ ${cardData.quantity - 1}`;
                    }
                };
            } else {
                newSmash.disabled = true;
                newSmash.className = 'action-btn gray';
                newSmash.innerText = "WYMAGANE 2+ SZTUKI";
            }
        }
    }
    window.closePreview = function() { 
    const modal = document.getElementById('card-preview-modal');
    const container = document.getElementById('preview-card-container');
    if(modal) modal.style.display = 'none'; 
    if(container) container.innerHTML = ''; 
    currentPreviewCard = null;
};

    // -- BUTTON MARKET --
    if (marketBtn) {
        const newMarket = marketBtn.cloneNode(true);
        marketBtn.parentNode.replaceChild(newMarket, marketBtn);

        if (isCollectionMode) {
            newMarket.style.display = 'none';
        } else {
            newMarket.style.display = 'block';
            newMarket.className = 'action-btn'; // Reset klasy (usuwa gray)
            newMarket.style.background = '#e67e22'; // Pomarańczowy
            newMarket.innerText = "WYSTAW NA RYNKU";
            newMarket.disabled = false;
            newMarket.onclick = () => {
                if (window.openSellModal) window.openSellModal(cardData);
            };
        }
    }
}

// =========================================================
// 7. DECK BUILDER & ADMIN TOOLS
// =========================================================

window.openDeckBuilder = async function() { dbPanel.classList.add('open'); loadDeckData(); };
window.closeDeckBuilder = function() { dbPanel.classList.remove('open'); };

async function loadDeckData() {
    try {
        const res = await fetch('/deck-data');
        const data = await res.json();
        if(data.success) {
            myAllCards = data.allCards;
            savedDecksData = {};
            
            data.savedDecks.forEach(d => { 
                // PARSOWANIE JSON: Czasami baza zwraca string, czasami obiekt
                let cards = d.cards_json;
                if (typeof cards === 'string') {
                    try { cards = JSON.parse(cards); } catch(e) { cards = []; }
                }
                d.cards_json = cards; // Zapisz naprawione
                savedDecksData[d.deck_index] = d; 
            });
            
            renderDeckSlots(); 
            selectDeckSlot(1); 
        }
    } catch(e) { console.error("Deck load error:", e); }
}

/* --- ADMIN UI HELPERS --- */
window.toggleAdminTierSelect = function() {
    const check = document.getElementById('admin-force-numbered');
    const wrapper = document.getElementById('admin-tier-wrapper');
    if (check.checked) {
        wrapper.style.display = 'block';
    } else {
        wrapper.style.display = 'none';
    }
};

function renderDeckSlots() {
    deckSlotsList.innerHTML = '';
    for(let i=1; i<=6; i++) {
        const div = document.createElement('div');
        div.className = `deck-slot ${i === currentDeckIndex ? 'active' : ''}`;
        div.innerText = savedDecksData[i] ? savedDecksData[i].name : `Pusty Slot ${i}`;
        div.onclick = () => selectDeckSlot(i);
        deckSlotsList.appendChild(div);
    }
}

function selectDeckSlot(index) {
    currentDeckIndex = index;
    renderDeckSlots();
    currentDeck = [];
    if(savedDecksData[index]) {
        deckNameInput.value = savedDecksData[index].name;
        savedDecksData[index].cards_json.forEach(id => {
            const cardObj = myAllCards.find(c => c.user_card_id === id);
            if(cardObj) currentDeck.push(cardObj);
        });
    } else { deckNameInput.value = `Talia ${index}`; }
    refreshDeckBuilderUI();
}

function refreshDeckBuilderUI() {
    currentDeckGrid.innerHTML = '';
    currentDeck.forEach(card => {
        const el = createDbCard(card, 'deck');
        currentDeckGrid.appendChild(el);
    });
    deckCounter.innerText = `${currentDeck.length} / ${DECK_LIMIT}`;
    deckCounter.style.color = currentDeck.length > DECK_LIMIT ? 'red' : '#9b59b6';

    const deckIds = currentDeck.map(c => c.user_card_id);
    const availableCards = myAllCards.filter(c => !deckIds.includes(c.user_card_id));
    const groupedCollection = groupCards(availableCards);

    collectionGrid.innerHTML = '';
    groupedCollection.forEach(group => {
        const el = createDbCard(group.cards[0], 'collection', group.count);
        collectionGrid.appendChild(el);
    });
    collCounter.innerText = `${availableCards.length} / ${myAllCards.length}`;
}

function groupCards(cards) {
    const groups = {};
    cards.forEach(c => {
        const key = `${c.card_id}_${c.is_numbered}`;
        if(!groups[key]) groups[key] = { cards: [], count: 0 };
        groups[key].cards.push(c);
        groups[key].count++;
    });
    return Object.values(groups);
}

function createDbCard(card, location, count = 1) {
    const div = document.createElement('div');
    div.className = `db-card rarity-${card.rarity}`;
    div.draggable = true;
    if(card.is_numbered) div.style.border = '2px solid gold';
    div.innerHTML = `<img src="${card.image_url}">`;
    if(count > 1) div.innerHTML += `<div class="qty">x${count}</div>`;
    div.ondblclick = () => { location === 'collection' ? moveToDeck(card) : removeFromDeck(card); };
    div.ondragstart = (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ id: card.user_card_id, origin: location })); div.classList.add('dragging'); };
    div.ondragend = () => { div.classList.remove('dragging'); };
    return div;
}

function moveToDeck(card) {
    if(currentDeck.length >= DECK_LIMIT) { alert("Limit talii!"); return; }
    currentDeck.push(card); refreshDeckBuilderUI();
}
function removeFromDeck(card) {
    const idx = currentDeck.findIndex(c => c.user_card_id === card.user_card_id);
    if(idx > -1) { currentDeck.splice(idx, 1); refreshDeckBuilderUI(); }
}

window.saveCurrentDeck = async function() {
    const cardIds = currentDeck.map(c => c.user_card_id);
    const name = deckNameInput.value;
    try {
        const res = await fetch('/save-deck', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ deckIndex: currentDeckIndex, deckName: name, cardIds: cardIds })
        });
        const data = await res.json();
        if(data.success) {
            alert("Zapisano!");
            savedDecksData[currentDeckIndex] = { deck_index: currentDeckIndex, name: name, cards_json: cardIds };
            renderDeckSlots();
        } else alert("Błąd zapisu");
    } catch(e) { alert("Błąd sieci"); }
};

const zoneDeck = document.getElementById('drop-zone-deck');
const zoneColl = document.getElementById('drop-zone-collection');
[zoneDeck, zoneColl].forEach(zone => {
    zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
    zone.ondragleave = () => zone.classList.remove('drag-over');
    zone.ondrop = (e) => {
        e.preventDefault(); zone.classList.remove('drag-over');
        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const cardObj = myAllCards.find(c => c.user_card_id === data.id);
            if(!cardObj) return;
            if(zone === zoneDeck && data.origin === 'collection') moveToDeck(cardObj);
            else if (zone === zoneColl && data.origin === 'deck') removeFromDeck(cardObj);
        } catch(e){}
    };
});

window.toggleAdminPanel = function() {
    const p = document.getElementById('admin-panel');
    const btn = document.getElementById('admin-toggle-btn');
    p.classList.toggle('collapsed');
    btn.innerText = p.classList.contains('collapsed') ? "➤" : "◀";
};

window.adminOpenPack = async function() {
    if (!isAdmin) return;
    cardStack.style.display = 'none'; cardStack.innerHTML = '';
    await attemptOpenPack(true);
};

window.adminAddResources = async function() {
    const user = document.getElementById('admin-target-user').value;
    const type = document.getElementById('admin-resource-type').value;
    const amount = document.getElementById('admin-resource-amount').value;
    if(!user) { alert("Login!"); return; }
    try {
        const res = await fetch('/admin/add-resource', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ targetUsername: user, resourceType: type, amount: amount })
        });
        const data = await res.json();
        if(data.success) { alert("Dodano!"); updateWallet(); } else alert(data.error);
    } catch(e) { alert("Błąd"); }
};

// =========================================================
// 8. UTILS (EFEKTY)
// =========================================================

window.spawnConfetti = function(mode, count) {
    const colors = ['#f00', '#0f0', '#00f', 'gold', 'purple', '#0ff'];
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div'); p.className = 'confetti'; p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        let sx, sy, tx, ty;
        if (mode === 'center') { sx='50%'; sy='50%'; } else if (mode === 'top') { sx=Math.random()*100+'%'; sy='-10%'; } else if (mode === 'legendary') { const e = Math.floor(Math.random()*4); if(e===0){sx=Math.random()*100+'%';sy='-10%';} if(e===1){sx=Math.random()*100+'%';sy='110%';} if(e===2){sx='-10%';sy=Math.random()*100+'%';} if(e===3){sx='110%';sy=Math.random()*100+'%';} }
        p.style.left=sx; p.style.top=sy; const ang=Math.random()*360; const dist=200+Math.random()*400;
        if(mode==='top'){tx=(Math.random()-0.5)*200+'px';ty='100vh';} else if(mode==='legendary'){tx=(Math.random()-0.5)*500+'px';ty=(Math.random()-0.5)*500+'px';} else{tx=Math.cos(ang)*dist+'px';ty=Math.sin(ang)*dist+'px';}
        p.style.setProperty('--tx',tx); p.style.setProperty('--ty',ty); confettiContainer.appendChild(p); setTimeout(()=>p.remove(),1500);
    }
};

function handleBoosterTilt(e) { if(isOpening||boosterSection.classList.contains('peeking'))return; const r=boosterWrapper.getBoundingClientRect(); boosterWrapper.style.transform=`perspective(1000px) rotateX(${((e.clientY-r.top-r.height/2)/15)*-1}deg) rotateY(${(e.clientX-r.left-r.width/2)/15}deg)`; }
function resetBoosterTilt() { boosterWrapper.style.transform=`perspective(1000px) rotateX(0) rotateY(0)`; }
function handleCardTilt(e) { if(!e.currentTarget.classList.contains('flipped'))return; const r=e.currentTarget.getBoundingClientRect(); e.currentTarget.style.transform=`perspective(1000px) rotateX(${((e.clientY-r.top-r.height/2)/10)*-1}deg) rotateY(${(e.clientX-r.left-r.width/2)/10}deg) scale(1.05)`; }
function resetCardTilt(e) { e.currentTarget.style.transform=`perspective(1000px) rotateX(0) rotateY(0) scale(1)`; }
/* --- SCRIPT.JS: OBSŁUGA RESETU --- */
async function adminResetDaily() {
    if(!confirm("Czy na pewno chcesz wyzerować swój licznik otwartych paczek?")) return;

    try {
        const res = await fetch('/admin/reset-daily', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            alert("Licznik zresetowany! Masz znowu 0/5 otwartych.");
            
            // Natychmiastowe odświeżenie UI
            availablePacksCount = 5; 
            renderPacksUI();
            
            // Odkryj sekcję boostera, jeśli była ukryta przez limit
            document.getElementById('status-text').innerText = "Wybierz paczkę!";
            document.getElementById('limit-message').style.display = 'none';
            document.getElementById('booster-section').style.display = 'flex';
            
            // Reset wizualny boostera
            resetBoosterVisuals();
        } else {
            alert("Błąd: " + data.error);
        }
    } catch(e) { 
        alert("Błąd połączenia z serwerem."); 
    }
}
/* --- script.js: MODUŁ SPRZEDAŻY (Brakujące funkcje) --- */

/* --- script.js: POPRAWIONE OKNO SPRZEDAŻY --- */

window.openSellModal = function(card) {
    const modal = document.getElementById('sell-modal');
    if (!modal) return;

    // Ukryj duży podgląd, jeśli jest otwarty
    const previewModal = document.getElementById('card-preview-modal');
    if(previewModal) previewModal.style.display = 'none';

    // Wypełnij dane
    const serialInfo = card.is_numbered ? ` (#${card.serial_number})` : '';
    document.getElementById('sell-card-name').innerText = `${card.name}${serialInfo}`;
    
    const amountInput = document.getElementById('sell-amount');
    const maxText = document.getElementById('sell-max-text');
    const priceInput = document.getElementById('sell-price');
    
    amountInput.value = 1;
    priceInput.value = 100;
    
    const maxQty = card.quantity || 1;
    amountInput.max = maxQty;
    maxText.innerText = `/ ${maxQty}`;

    // --- NAPRAWA PRZYCISKÓW ---
    
    // 1. Przycisk WYSTAW
    const confirmBtn = modal.querySelector('.action-btn.purple');
    if (confirmBtn) {
        const newConfirm = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        newConfirm.onclick = () => confirmSell(card);
    }

    // 2. Przycisk ANULUJ (To nie działało)
    const cancelBtn = modal.querySelector('.action-btn.red');
    if (cancelBtn) {
        const newCancel = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
        newCancel.onclick = function() {
            closeSellModal();
        };
    }

    modal.style.display = 'flex';
};

window.closeSellModal = function() {
    const modal = document.getElementById('sell-modal');
    if(modal) modal.style.display = 'none';
    
    // Opcjonalnie: przywróć podgląd, jeśli chcesz wrócić do karty
    // document.getElementById('card-preview-modal').style.display = 'flex';
};

// 5. UPDATE CONFIRM SELL (Używa showCustomAlert)
async function confirmSell(card) {
    // ... pobieranie inputów (bez zmian) ...
    // ... ale podmień alert() na showCustomAlert() wewnątrz tej funkcji ...
    
    // Poniżej skrócona wersja z nowym alertem:
    const amount = parseInt(document.getElementById('sell-amount').value);
    const price = parseInt(document.getElementById('sell-price').value);

    // Zamiast arguments, używamy zmiennej 'currentPreviewCard' jeśli 'card' nie jest przekazane przez onclick
    // Ale w openSellModal przekazujemy 'card', więc powinno być ok. 
    // Uwaga: jeśli confirmSell jest wywoływane z HTML onclick="confirmSell()", to argument 'card' jest pusty.
    // Musimy to obsłużyć. 
    
    // W poprzednim kodzie openSellModal robił: newBtn.onclick = () => confirmSell(card);
    // Więc 'card' jest dostępne.
    
    if (amount < 1 || price < 1) { showCustomAlert("Błędna ilość lub cena!"); return; }

    const payload = {
        cardId: card.card_id, 
        isNumbered: card.is_numbered,
        amount: amount,
        price: price
    };

    try {
        const res = await fetch('/market/sell', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if(data.success) {
            showCustomAlert("Wystawiono ofertę na rynku!"); // <--- NOWY ALERT
            closeSellModal();
            if (window.openInventory) window.openInventory();
        } else {
            showCustomAlert("Błąd: " + data.error);
        }
    } catch(e) { showCustomAlert("Błąd sieci"); }
}
/* --- script.js: LOGIKA WYMIANY (SMASH) --- */
window.confirmSmash = async function() {
    // currentPreviewCard musi być ustawione przez showPreview
    if(!currentPreviewCard) return;

    const input = document.getElementById('smash-amount');
    const amount = parseInt(input.value);

    if (isNaN(amount) || amount < 1) {
        showCustomAlert("Podaj poprawną ilość!");
        return;
    }
    
    if (amount >= currentPreviewCard.quantity) {
        showCustomAlert("Musisz zachować przynajmniej jedną kopię karty!");
        return;
    }

    // Pytanie
    if (!confirm(`Czy na pewno chcesz wymienić ${amount} szt. "${currentPreviewCard.name}" na Shardy?`)) return;

    try {
        const res = await fetch('/smash-card', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                cardId: currentPreviewCard.card_id, 
                isNumbered: currentPreviewCard.is_numbered, 
                amount: amount 
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showCustomAlert(`Sukces! Otrzymano ${data.shardsAdded} shardów.`);
            closePreview(); // Zamknij wszystko
            if(window.openInventory) window.openInventory(); // Odśwież EQ
            if(window.updateWallet) window.updateWallet();   // Odśwież walutę
        } else {
            showCustomAlert("Błąd: " + (data.error === "LAST_COPY" ? "Musisz zachować 1 kopię!" : data.error));
        }
    } catch(e) { 
        console.error(e);
        showCustomAlert("Błąd połączenia."); 
    }
};