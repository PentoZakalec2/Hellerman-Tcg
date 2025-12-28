/* --- duel.js - POZIOMY, DRAW ANIMATION, GRAVEYARD --- */

let gameState = null;
let myId = null;
let pollingInterval = null;

// Stan lokalny
let selectedHandCard = null;
let activeAttackerIndex = null;
let isTargetingMode = false;
let currentCardContext = null;

// Nowe zmienne dla Tribute Summon
let isTributingMode = false;
let tributesNeeded = 0;
let selectedTributes = []; // Indeksy potworów do poświęcenia
let pendingSummon = null;  // Karta, którą chcemy przyzwać po poświęceniu

// Zmienna do wykrywania drawu
let lastHandSize = -1;

document.addEventListener('DOMContentLoaded', () => initDuel());

// =============================================================
// 1. INICJALIZACJA
// =============================================================

async function initDuel() {
    try {
        const res = await fetch('/api/duel/state');
        const data = await res.json();
        if (data.success) {
            myId = data.myId;
            gameState = data.state;
            
            // Init hand size
            const me = gameState.players[myId];
            lastHandSize = me.hand.length;

            if (!gameState.phase) gameState.phase = 'MAIN 1';
            if (!gameState.turnData) gameState.turnData = { normalSummonUsed: false, attacksDeclared: [] };

            renderBoard();
            if (!pollingInterval) pollingInterval = setInterval(gameLoop, 1000);
        } else {
            if (data.error === "Brak aktywnej gry.") window.location.href = '/play';
        }
    } catch (e) { console.error(e); }
}

async function gameLoop() {
    try {
        const pollRes = await fetch('/api/duel/poll');
        const pollData = await pollRes.json();

        if (pollData.gameEnded) {
            clearInterval(pollingInterval);
            alert("KONIEC GRY: " + pollData.result.toUpperCase());
            window.location.href = '/play';
            return;
        }

        const stateRes = await fetch('/api/duel/state');
        const stateData = await stateRes.json();
        
        if (stateData.success && stateData.state) {
            // DETEKCJA DOBRANIA KARTY (ANIMACJA)
            const me = stateData.state.players[myId];
            if (me.hand.length > lastHandSize) {
                // Ktoś dobrał kartę (zakładamy że to Draw Phase lub efekt)
                // Uruchom animację tylko jeśli to my dobraliśmy (lub można dodać logikę dla wroga)
                playDrawAnimation();
            }
            lastHandSize = me.hand.length;

            if (JSON.stringify(stateData.state) !== JSON.stringify(gameState)) {
                gameState = stateData.state;
                renderBoard();
            }
        }
    } catch(e) {}
}

// =============================================================
// 2. RENDEROWANIE
// =============================================================

function renderBoard() {
    if (!gameState || !gameState.players[myId]) return;
    const me = gameState.players[myId];
    const opponentId = Object.keys(gameState.players).find(id => id != myId);
    const opp = gameState.players[opponentId];

    updateText('my-hp', me.hp);
    updateWidth('.hp-bar-fill.me', me.hp);
    updateText('deck-count', me.deck.length);

    if (opp) {
        updateText('opp-hp', opp.hp);
        updateWidth('.hp-bar-fill:not(.me)', opp.hp);
        
        renderOpponentHand(opp.hand.length);
        renderZone('opp-monsters', opp.monsters, false, 'monster');
        renderZone('opp-spells', opp.spells, false, 'spell');
        renderGraveyard('opp-gy', opp.gy);
    }

    renderMyHand(me.hand);
    renderZone('my-monsters', me.monsters, true, 'monster');
    renderZone('my-spells', me.spells, true, 'spell');
    renderGraveyard('my-gy', me.gy);

    renderPhaseButton();
}

// NOWE: Renderowanie Cmentarza
function renderGraveyard(elementId, gyCards) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = ''; // Czyść

    if (gyCards.length > 0) {
        const topCard = gyCards[gyCards.length - 1]; // Ostatnia karta
        const img = document.createElement('img');
        img.src = topCard.image_url;
        img.className = 'gy-card'; // Klasa z CSS (szarość)
        img.title = topCard.name;
        container.appendChild(img);
    }
}

/* --- ZAKTUALIZOWANA FUNKCJA RENDERZONE --- */
function renderZone(id, cards, isMine, type) {
    const container = document.getElementById(id);
    if(!container) return;
    const slots = container.children;

    for (let i = 0; i < 5; i++) {
        if(!slots[i]) break;
        const slot = slots[i];
        slot.innerHTML = '';
        const card = cards[i];

        if (card) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = "width:100%; height:100%; position:relative;";
            
            const img = document.createElement('img');
            img.src = card.image_url;
            img.className = 'field-card';
            if (card.position === 'DEF') img.classList.add('def');
            if (isTargetingMode && !isMine && type === 'monster') img.classList.add('target-highlight');
            if (isTributingMode && isMine && type === 'monster') img.classList.add('tribute-candidate');

            // 1. POZIOM NA KARCIE (Prawy Górny)
            if (card.card_type === 'Unit') {
                const lvlBadge = document.createElement('div');
                lvlBadge.className = 'on-card-level';
                lvlBadge.innerHTML = `<span>⭐${card.level || 1}</span>`;
                wrapper.appendChild(lvlBadge);
            }

            // 2. Ikonka Typu
            const icon = document.createElement('div');
            icon.className = 'type-icon';
            if(card.card_type === 'Unit') { icon.innerHTML = '💀'; icon.style.borderColor='#e74c3c'; }
            else if(card.card_type === 'Spell') { icon.innerHTML = '📜'; icon.style.borderColor='#2ecc71'; }
            else { icon.innerHTML = '🕸️'; icon.style.borderColor='#9b59b6'; }

            // 3. STATYSTYKI (DEF po lewej, ATK po prawej)
            const stats = document.createElement('div');
            stats.className = 'card-stats-overlay';
            // Tutaj spełniamy prośbę: Niebieski DEF | Czerwony ATK
            stats.innerHTML = `
                <span class="stat-val def">${card.defense}</span>
                <span style="color:#555">/</span>
                <span class="stat-val atk">${card.attack}</span>
            `;

            wrapper.appendChild(img);
            wrapper.appendChild(icon);
            wrapper.appendChild(stats);

            // OBSŁUGA PODGLĄDU (Hover + Click)
            // onmouseenter -> Pokaż info w lewym panelu
            wrapper.onmouseenter = () => showCardInfo(card);

            if (isMine) {
                wrapper.onclick = (e) => {
                    e.stopPropagation();
                    showCardInfo(card); // Klik też odświeża panel
                    if (isTributingMode) handleTributeSelection(i);
                    else if (type === 'monster') openActionPopup(i, card, e);
                };
            } else {
                wrapper.onclick = (e) => {
                    e.stopPropagation();
                    showCardInfo(card); // Klik we wroga też pokazuje info
                    if (isTargetingMode) handleAttackTarget(i, card);
                };
            }
            slot.appendChild(wrapper);
        } else {
            if (isMine && gameState.phase.includes('MAIN')) {
                slot.onclick = () => placeCardAttempt(i, type);
            } else {
                slot.onclick = null;
            }
            // Reset panelu po najechaniu na pusty slot (opcjonalne)
            slot.onmouseenter = () => {}; 
        }
    }
}

/* --- NOWA FUNKCJA: WYŚWIETLANIE INFO W PANELU --- */
/* --- duel.js: ZAKTUALIZOWANA FUNKCJA PODGLĄDU --- */
function showCardInfo(card) {
    if (!card) return;

    const box = document.getElementById('card-preview-box');
    const nameEl = document.getElementById('preview-name');
    const attrEl = document.getElementById('preview-attr');
    const imgEl = document.getElementById('preview-image');
    const atkEl = document.getElementById('preview-atk');
    const defEl = document.getElementById('preview-def');
    const descEl = document.getElementById('preview-desc');
    const typeLineEl = document.getElementById('preview-type-line');
    const starsContainer = document.getElementById('preview-level-stars');

    // 1. Podstawowe dane
    nameEl.innerText = card.name;
    
    // NAPRAWA ATTR: Teraz bierzemy z obiektu card (dzięki poprawce w server.js)
    attrEl.innerText = card.attribute ? card.attribute.toUpperCase() : "???";
    
    // Kolor atrybutu (opcjonalny bajer)
    if(attrEl.innerText === 'EARTH') attrEl.style.color = '#d35400'; // Brąz
    else if(attrEl.innerText === 'LIGHT') attrEl.style.color = '#f1c40f'; // Złoty
    else if(attrEl.innerText === 'DARK') attrEl.style.color = '#8e44ad'; // Fiolet
    else attrEl.style.color = '#fff';

    imgEl.src = card.image_url;
    atkEl.innerText = card.attack;
    defEl.innerText = card.defense;
    descEl.innerText = card.description || "Brak opisu karty.";

    // 2. Obsługa Rzadkości i Koloru Ramki
    // Baza danych zwraca np. "Epic", "Rare". Zamieniamy na małe litery.
    const rarity = (card.rarity || 'common').toLowerCase(); 
    
    // Reset klas i dodanie nowych
    box.className = `card-preview-box rarity-${rarity}`;

    // 3. Typ i Level
    let typeText = `[ ${card.card_type} ]`;
    if (card.card_type === 'Unit') {
        typeText = `[ ${card.attribute || 'Unit'} / Level ${card.level || 1} ]`;
    }
    typeLineEl.innerText = typeText;

    // 4. Gwiazdki (Rysowane pod kartą)
    starsContainer.innerHTML = '';
    if (card.card_type === 'Unit') {
        const lvl = card.level || 1;
        for(let i=0; i<lvl; i++) {
            const s = document.createElement('span');
            s.className = 'star-icon';
            s.innerHTML = '&#9733;'; // Symbol gwiazdy
            starsContainer.appendChild(s);
        }
    }
}

/* --- POPRAWIONA FUNKCJA RENDEROWANIA RĘKI --- */
function renderMyHand(hand) {
    const container = document.getElementById('my-hand');
    if(!container) return;
    container.innerHTML = ''; // Wyczyść poprzedni stan
    
    hand.forEach((card, index) => {
        // Główny kontener karty
        const div = document.createElement('div');
        div.className = 'hand-card';
        div.style.backgroundImage = `url('${card.image_url}')`;
        
        // Klasa zaznaczenia (jeśli kliknięto)
        if (selectedHandCard === index) div.classList.add('selected');
        
        // NOWOŚĆ: Wskaźnik poziomu (mała kulka z liczbą)
        // Pokazujemy tylko dla Jednostek (Unit), które mają level > 0
        if (card.card_type === 'Unit' && card.level) {
            const lvlBadge = document.createElement('div');
            lvlBadge.className = 'level-indicator'; // Styl z CSS
            lvlBadge.innerText = card.level;
            div.appendChild(lvlBadge);
        }

        // --- INTERAKCJE ---
        
        // 1. Najazd myszką -> Pokaż info w panelu bocznym
        div.onmouseenter = () => showCardInfo(card);

        // 2. Kliknięcie -> Wybierz kartę
        div.onclick = () => {
            // Jeśli jesteśmy w trakcie poświęcania (Tribute), kliknięcie w rękę jest błędem (trzeba klikać stół)
            if(isTributingMode) { 
                alert("Dokończ składanie ofiary (kliknij potwory na stole) lub anuluj akcję!"); 
                return; 
            }
            
            // Zaznacz lub odznacz
            selectedHandCard = (selectedHandCard === index) ? null : index;
            
            // Odśwież rękę, żeby pokazać żółtą ramkę zaznaczenia
            renderMyHand(gameState.players[myId].hand);
            
            // Pokaż info też przy kliknięciu
            showCardInfo(card);
        };

        container.appendChild(div);
    });
}

function renderOpponentHand(count) {
    const container = document.getElementById('opp-hand');
    if(!container) return;
    container.innerHTML = '';
    for(let i=0; i<count; i++) {
        const div = document.createElement('div');
        div.className = 'hand-card'; 
        div.style.backgroundImage = `url('card_back.png')`;
        container.appendChild(div);
    }
}

// =============================================================
// 3. LOGIKA SUMMONING (Z TRIBUTE SYSTEM)
// =============================================================

// Zmieniona nazwa - to jest próba położenia karty
async function placeCardAttempt(slotIndex, type) {
    if (selectedHandCard === null) return;
    if (gameState.turnPlayer != myId) { alert("Nie Twoja tura!"); return; }

    const me = gameState.players[myId];
    const card = me.hand[selectedHandCard];
    const isUnit = (card.card_type === 'Unit');

    // Walidacja typów
    if (type === 'monster' && !isUnit) { alert("Tu tylko jednostki!"); return; }
    if (type === 'spell' && isUnit) { alert("Tu tylko magia!"); return; }

    // Walidacja Limitów (Normal Summon)
    if (isUnit) {
        if (!gameState.turnData) gameState.turnData = { normalSummonUsed: false };
        if (gameState.turnData.normalSummonUsed) { alert("Limit przywołań!"); return; }
    }

    // --- LOGIKA POZIOMÓW (TRIBUTE) ---
    if (isUnit) {
        const level = card.level || 1;
        
        if (level >= 5) {
            // Wymaga ofiar
            const needed = (level >= 7) ? 2 : 1;
            
            // Sprawdź czy mamy dość potworów
            const myMonstersCount = me.monsters.filter(m => m !== null).length;
            if (myMonstersCount < needed) {
                alert(`Ta karta ma poziom ${level}. Wymaga ${needed} ofiar(y), a masz za mało potworów.`);
                return;
            }

            // Rozpocznij tryb poświęcania
            startTributeMode(needed, slotIndex);
            return; // ZATRZYMUJEMY SIĘ TUTAJ, czekamy na klikanie potworów
        }
    }

    // Zwykłe wystawienie (Level 1-4 lub Magia)
    finalizeSummon(slotIndex, type, []);
}

function startTributeMode(needed, targetSlot) {
    isTributingMode = true;
    tributesNeeded = needed;
    selectedTributes = [];
    pendingSummon = { 
        handIndex: selectedHandCard, 
        targetSlot: targetSlot 
    };
    
    alert(`Wybierz ${needed} potwora(y) do poświęcenia!`);
    renderBoard(); // Odśwież, by pokazać podświetlenia (klasa .tribute-candidate)
}

// Obsługa kliknięcia w swojego potwora podczas Tribute Mode
function handleTributeSelection(slotIndex) {
    // Nie można poświęcić pustego pola (zabezpieczone w renderZone, bo nie ma onclick)
    // Nie można wybrać tego samego 2 razy
    if (selectedTributes.includes(slotIndex)) return;

    selectedTributes.push(slotIndex);

    if (selectedTributes.length >= tributesNeeded) {
        // Mamy komplet ofiar -> wykonaj summon
        if(confirm("Poświęcić wybrane karty i wezwać potwora?")) {
            finalizeSummon(pendingSummon.targetSlot, 'monster', selectedTributes);
        }
        // Reset trybu
        isTributingMode = false;
        tributesNeeded = 0;
        selectedTributes = [];
        pendingSummon = null;
    } else {
        alert(`Wybrano ${selectedTributes.length}/${tributesNeeded}. Wybierz kolejnego.`);
    }
}

// Finalizacja ruchu (wysłanie do serwera)
async function finalizeSummon(slotIndex, type, tributeSlots) {
    const me = gameState.players[myId];
    
    // 1. Obsługa Ofiar (Wyslij na cmentarz)
    if (tributeSlots.length > 0) {
        tributeSlots.forEach(idx => {
            const victim = me.monsters[idx];
            me.gy.push(victim); // Dodaj do GY
            me.monsters[idx] = null; // Usuń z planszy
        });
    }

    // 2. Wstaw nową kartę
    // Uwaga: selectedHandCard mogło się zmienić, bierzemy z pending jeśli było tribute
    const handIdx = (pendingSummon) ? pendingSummon.handIndex : selectedHandCard;
    const card = me.hand[handIdx];

    if (type === 'monster') me.monsters[slotIndex] = card;
    else me.spells[slotIndex] = card;

    // 3. Usuń z ręki
    me.hand.splice(handIdx, 1);

    // 4. Oznacz użycie summona
    if (card.card_type === 'Unit') {
        gameState.turnData.normalSummonUsed = true;
    }

    // Reset UI
    selectedHandCard = null;
    
    await sendAction({ newState: gameState });
    renderBoard();
}

// =============================================================
// 4. ANIMACJA DOBIERANIA (VISUAL)
// =============================================================

function playDrawAnimation() {
    // Stwórz element latający
    const deckEl = document.getElementById('my-deck');
    const handEl = document.getElementById('my-hand');
    
    if(!deckEl || !handEl) return;

    const rectDeck = deckEl.getBoundingClientRect();
    const rectHand = handEl.getBoundingClientRect();

    const flyer = document.createElement('div');
    flyer.className = 'drawing-card'; // Styl z CSS
    
    // Start: na talii
    flyer.style.top = rectDeck.top + 'px';
    flyer.style.left = rectDeck.left + 'px';
    
    document.body.appendChild(flyer);

    // Wymuś reflow
    flyer.offsetWidth;

    // Meta: na ręce
    // Oblicz środek ręki
    const handX = rectHand.left + (rectHand.width / 2) - 42; // - połowa szerokości karty
    const handY = rectHand.top;

    flyer.style.top = handY + 'px';
    flyer.style.left = handX + 'px';
    flyer.style.transform = "rotateY(180deg) scale(1.2)"; // Obrót (odkrycie)

    // Po zakończeniu animacji usuń
    setTimeout(() => {
        flyer.remove();
        renderBoard(); // Upewnij się, że nowa karta jest widoczna w ręce
    }, 800); // Czas zgodny z transition w CSS
}

// =============================================================
// 5. RESZTA (Fazy, Walka - bez zmian, skopiowane dla spójności)
// =============================================================

function renderPhaseButton() {
    const btn = document.getElementById('phase-btn');
    
    // Zabezpieczenie: jeśli elementu nie ma lub gra niezaładowana -> stop
    if (!btn || !gameState || !gameState.players) return;

    // Szukamy etykiety wewnątrz przycisku
    const label = btn.querySelector('.phase-label');
    const subLabel = btn.querySelector('.phase-sub');

    // 1. CZYJA TURA?
    if (gameState.turnPlayer != myId) {
        btn.className = 'phase-btn disabled'; // Szary styl
        if (label) label.innerText = "TURA WROGA";
        if (subLabel) subLabel.innerText = "CZEKAJ";
        return;
    }
    
    // 2. AKTUALIZACJA TEKSTU I KOLORU
    // Pobieramy nazwę fazy, np. "MAIN 1", "BATTLE"
    const currentPhase = (gameState.phase || "MAIN 1").trim().toUpperCase();

    // Reset klasy (żeby usunąć np. .battle jeśli wróciliśmy do Main 2)
    btn.className = 'phase-btn';

    // Ustaw tekst
    if (label) label.innerText = currentPhase;
    if (subLabel) subLabel.innerText = "ZMIEŃ";

    // Specjalny styl dla Battle Phase (czerwony)
    if (currentPhase.includes('BATTLE')) {
        btn.classList.add('battle');
    }
}

/* --- Wklej to w miejsce starej funkcji togglePhaseMenu w duel.js --- */

/* --- NOWA OBSŁUGA OVERLAYU FAZ --- */
/* --- duel.js: WYSUWANE MENU FAZ --- */

/* --- duel.js: POPRAWIONA LOGIKA FAZ --- */

function togglePhaseMenu() {
    if (!gameState || !gameState.players) return;
    if (gameState.turnPlayer != myId) return;

    const overlay = document.getElementById('phase-bar-overlay');
    const track = document.getElementById('phase-track-content');
    
    // Toggle (Zamknij jeśli otwarte)
    if (overlay.classList.contains('visible')) {
        overlay.classList.remove('visible');
        return;
    }

    // Normalizacja nazwy fazy
    let rawPhase = (gameState.phase || "MAIN 1").trim().toUpperCase();
    let currentPhaseID = rawPhase;
    if (rawPhase === 'MAIN' || rawPhase === 'MAIN1') currentPhaseID = 'MAIN 1';
    if (rawPhase === 'MAIN2') currentPhaseID = 'MAIN 2';
    if (rawPhase === 'SP') currentPhaseID = 'STANDBY';

    // Definicja wszystkich możliwych faz
    const phases = [
        { id: 'DRAW', name: 'DRAW' },
        { id: 'STANDBY', name: 'SP' },
        { id: 'MAIN 1', name: 'MAIN 1' },
        { id: 'BATTLE', name: 'BATTLE' },
        { id: 'MAIN 2', name: 'MAIN 2' },
        { id: 'END', name: 'END' }
    ];

    track.innerHTML = ''; // Czyść stare

    phases.forEach(p => {
        const node = document.createElement('div');
        node.className = 'phase-node';
        node.innerText = p.name;

        // Logika Aktywności
        if (p.id === currentPhaseID) {
            node.classList.add('current');
        } 
        else {
            // Logika Przejść
            let isClickable = false;
            if ((currentPhaseID === 'DRAW' || currentPhaseID === 'STANDBY') && p.id === 'MAIN 1') isClickable = true;
            else if (currentPhaseID === 'MAIN 1' && (p.id === 'BATTLE' || p.id === 'END')) isClickable = true;
            else if (currentPhaseID === 'BATTLE' && (p.id === 'MAIN 2' || p.id === 'END')) isClickable = true;
            else if (currentPhaseID === 'MAIN 2' && p.id === 'END') isClickable = true;

            if (isClickable) {
                node.classList.add('clickable');
                
                // --- TUTAJ BYŁA ZMIANA: używamy onclick ---
                node.onclick = function(e) {
                    e.stopPropagation(); // Zapobiega dziwnym zachowaniom
                    console.log("Kliknięto fazę:", p.id);
                    changePhase(p.id); // Wywołaj zmianę
                };
            } else {
                node.classList.add('disabled');
            }
        }
        track.appendChild(node);
    });

    overlay.classList.add('visible');
}

async function changePhase(newPhase) {
    // 1. ZAMKNIJ NOWY OVERLAY (To naprawia błąd!)
    const overlay = document.getElementById('phase-bar-overlay');
    if (overlay) overlay.classList.remove('visible');

    console.log("Przetwarzanie zmiany fazy na:", newPhase);

    // 2. LOGIKA KONIEC TURY (END TURN)
    if (newPhase === 'END') {
        const oppId = Object.keys(gameState.players).find(id => id != myId);
        
        // Reset flag
        gameState.turnData = { normalSummonUsed: false, attacksDeclared: [] };
        gameState.phase = 'DRAW'; 
        gameState.turnPlayer = oppId; // Zmieniamy lokalnie dla UI
        
        await fetch('/api/duel/action', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ newState: gameState, nextTurnPlayerId: oppId })
        });
        
    } else {
        // 3. LOGIKA ZWYKŁEJ ZMIANY FAZY
        gameState.phase = newPhase;
        
        await sendAction({ newState: gameState });
        renderBoard(); // Odśwież widok
        addLog(`>>> Faza: ${newPhase}`);
    }
}

// --- WALKA (Skrócona wersja, pełna jest wyżej w poprzednich odpowiedziach, ale tutaj wklejam kluczowe funkcje) ---
function openActionPopup(index, card, e) {
    if (gameState.turnPlayer != myId) return;
    closeActionPopup();
    currentCardContext = { index, card };
    const popup = document.getElementById('card-action-popup');
    const rect = e.target.getBoundingClientRect();
    
    const btnAtk = popup.querySelector('.attack');
    const btnPos = popup.querySelector('.pos');

    if (gameState.phase === 'BATTLE' && card.position === 'ATK') {
        btnAtk.style.display = 'block';
        if (gameState.turnData.attacksDeclared && gameState.turnData.attacksDeclared.includes(card.uid)) {
            btnAtk.disabled = true; btnAtk.innerText = "JUŻ ATAKOWAŁ";
        } else {
            btnAtk.disabled = false; btnAtk.innerText = "⚔️ ATAKUJ";
        }
    } else { btnAtk.style.display = 'none'; }

    if (gameState.phase.includes('MAIN')) btnPos.style.display = 'block';
    else btnPos.style.display = 'none';

    popup.style.top = (rect.top - 110) + 'px'; popup.style.left = rect.left + 'px';
    popup.style.display = 'flex';
}

function closeActionPopup() { document.getElementById('card-action-popup').style.display = 'none'; }
function actionAttack() { closeActionPopup(); activeAttackerIndex = currentCardContext.index; isTargetingMode = true; alert("Wybierz cel!"); renderBoard(); }
async function actionPosition() { 
    closeActionPopup(); 
    const me = gameState.players[myId]; 
    const card = me.monsters[currentCardContext.index]; 
    card.position = (card.position==='ATK')?'DEF':'ATK'; 
    await sendAction({newState:gameState}); renderBoard(); 
}

async function handleAttackTarget(targetIndex, targetCard) {
    if (!isTargetingMode) return;
    const me = gameState.players[myId];
    const oppId = Object.keys(gameState.players).find(id => id != myId);
    const opp = gameState.players[oppId];
    const attacker = me.monsters[activeAttackerIndex];
    const defender = targetCard;

    addLog(`⚔️ ${attacker.name} vs ${defender.name}`);
    let damage = 0; let destroyAttacker = false; let destroyDefender = false;

    if (defender.position === 'ATK') {
        if (attacker.attack > defender.attack) { damage = attacker.attack - defender.attack; destroyDefender = true; }
        else if (attacker.attack === defender.attack) { destroyAttacker = true; destroyDefender = true; }
        else { me.hp -= (defender.attack - attacker.attack); destroyAttacker = true; }
    } else {
        if (attacker.attack > defender.defense) destroyDefender = true;
        else if (attacker.attack < defender.defense) me.hp -= (defender.defense - attacker.attack);
    }

    if (damage > 0) opp.hp -= damage;
    
    // Cmentarz Logic
    if (destroyDefender) { opp.gy.push(opp.monsters[targetIndex]); opp.monsters[targetIndex] = null; }
    if (destroyAttacker) { me.gy.push(me.monsters[activeAttackerIndex]); me.monsters[activeAttackerIndex] = null; }

    if (!gameState.turnData.attacksDeclared) gameState.turnData.attacksDeclared = [];
    gameState.turnData.attacksDeclared.push(attacker.uid);

    isTargetingMode = false; activeAttackerIndex = null;
    await sendAction({ newState: gameState }); renderBoard();
}

async function handleDirectAttack() {
    // (Ta sama logika co w poprzednim pliku)
    if (!isTargetingMode) return;
    const oppId = Object.keys(gameState.players).find(id => id != myId);
    const opp = gameState.players[oppId];
    if (opp.monsters.some(m => m !== null)) { alert("Wróg ma potwory!"); return; }
    const me = gameState.players[myId];
    const attacker = me.monsters[activeAttackerIndex];
    opp.hp -= attacker.attack;
    if (!gameState.turnData.attacksDeclared) gameState.turnData.attacksDeclared = [];
    gameState.turnData.attacksDeclared.push(attacker.uid);
    isTargetingMode = false; activeAttackerIndex = null;
    await sendAction({ newState: gameState }); renderBoard();
}

function updateText(id, val) { const el = document.getElementById(id); if(el) el.innerText = val; }
function updateWidth(s, hp) { const el = document.querySelector(s); if(el) el.style.width = Math.max(0, hp/8000*100)+'%'; }
function addLog(msg) { const log = document.getElementById('game-log'); if(log) { const p = document.createElement('p'); p.innerText = msg; log.prepend(p); } }
async function sendAction(body) { await fetch('/api/duel/action', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }); }

window.surrenderGame = () => document.getElementById('surrender-modal').style.display='flex';
window.confirmSurrender = async () => { document.getElementById('surrender-modal').style.display='none'; await fetch('/api/duel/surrender', { method: 'POST' }); };
window.offerDraw = () => document.getElementById('offer-draw-modal').style.display='flex';
window.confirmOfferDraw = async () => { document.getElementById('offer-draw-modal').style.display='none'; await fetch('/api/duel/draw/offer', { method: 'POST' }); };
window.respondDraw = async (acc) => { document.getElementById('draw-offer-modal').style.display='none'; await fetch('/api/duel/draw/respond', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({accept:acc}) }); };
window.closeModal = (id) => document.getElementById(id).style.display='none';