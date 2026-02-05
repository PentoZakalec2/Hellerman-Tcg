/* --- script-ruletka.js (NO PULSE & MULTI BET) --- */

const wheelOrder = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
    5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let currentChip = 10;
let pendingBets = {}; // Klucz to ID pola (np. 'number_5'), Wartość to kwota
let currentRotation = 0;
let isSpinning = false;
let lastHistoryJSON = ""; // Do fixu pulsowania
let globalStatus = 'betting';

window.onload = () => {
    initWheel();
    initTable();
    updateBalance(); // <--- TO MUSI TU BYĆ
    setInterval(syncGame, 1000);
    requestAnimationFrame(trackWheel);
    
    document.querySelector('.betting-section').addEventListener('contextmenu', event => event.preventDefault());
};

/* --- SYSTEM OBSTAWIANIA (LEWY / PRAWY) --- */

function handleBetClick(event, type, val) {
    event.preventDefault(); // Blokuje menu kontekstowe
    if (isSpinning) return;

    const key = `${type}_${val}`;
    
    // Lewy przycisk (0) - Dodaj
    if (event.button === 0) {
        if (!pendingBets[key]) pendingBets[key] = 0;
        pendingBets[key] += currentChip;
    } 
    // Prawy przycisk (2) - Cofnij/Usuń
    else if (event.button === 2) {
        if (pendingBets[key]) {
            delete pendingBets[key]; // Całkowite usunięcie zakładu z pola
            // Opcjonalnie: pendingBets[key] -= currentChip; (gdybyś chciał odejmować po trochu)
        }
    }

    renderPendingBets();
}

function renderPendingBets() {
    // 1. Wyczyść stare oznaczenia
    document.querySelectorAll('.bet-chip-marker').forEach(e => e.remove());
    document.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));

    let totalBet = 0;

    // 2. Rysuj nowe
    for (const [key, amount] of Object.entries(pendingBets)) {
        if (amount <= 0) continue;
        totalBet += amount;

        const [type, val] = key.split('_');
        
        // Znajdź element w DOM
        let el;
        if (type === 'number') {
            // Szukamy po tekście wewnątrz diva (trochę hack, ale działa przy obecnej strukturze)
            const cells = document.querySelectorAll('.bet-cell');
            for(let c of cells) { if(c.innerText == val) { el = c; break; } }
        } else {
            // Szukamy przycisków specjalnych
            // Tutaj musimy polegać na atrybucie onclick w HTML, ale lepiej dodać ID.
            // Dla uproszczenia: dodajemy logikę mapowania w initTable, ale tu użyjemy dataset.
            // SZYBKI FIX: W initTable dodajemy data-key
        }
        
        // Jeśli nie znaleziono przez pętlę wyżej (bo to specjale), szukamy po data-bet-key
        if (!el) {
            el = document.querySelector(`[data-bet-key="${key}"]`);
        }

        if (el) {
            el.classList.add('selected');
            // Dodaj wizualny żeton
            const marker = document.createElement('div');
            marker.className = 'bet-chip-marker';
            marker.innerText = amount;
            el.appendChild(marker);
        }
    }

    // Info o sumie
    const infoBox = document.getElementById('selection-info');
    if (totalBet > 0) {
        infoBox.innerHTML = `Suma stawek: <span style="color:gold">${totalBet} HC</span> <span style="font-size:12px; color:#aaa;">(Prawy przycisk usuwa)</span>`;
    } else {
        infoBox.innerHTML = "Wybierz pola...";
    }
}

// Zaktualizowana funkcja potwierdzenia
async function confirmBet() {
    const betsArray = [];
    for (const [key, amount] of Object.entries(pendingBets)) {
        if (amount > 0) {
            const [type, val] = key.split('_');
            // Konwersja value na liczbę jeśli to number, string jeśli kolor
            const finalVal = type === 'number' ? parseInt(val) : val;
            betsArray.push({ type, value: finalVal, amount });
        }
    }

    if (betsArray.length === 0) { alert("Stół jest pusty!"); return; }
    if (isSpinning) { alert("Zakłady zamknięte!"); return; }

    try {
        const res = await fetch('/api/casino/roulette/bet', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ bets: betsArray })
        });
        const data = await res.json();
        
        if (data.success) {
            updateBalance();
            document.getElementById('selection-info').innerHTML = "<span style='color:#2ecc71'>ZAKŁAD PRZYJĘTY!</span>";
            pendingBets = {}; // Czyścimy stół po wysłaniu
            renderPendingBets();
            
            const btn = document.getElementById('btn-postaw');
            btn.classList.add('disabled');
            setTimeout(() => btn.classList.remove('disabled'), 1000);
        } else {
            alert(data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
}

/* --- INICJALIZACJA UI Z OBSŁUGĄ KLIKNIĘĆ --- */

function initTable() {
    const container = document.getElementById('numbers-container');
    container.innerHTML = ''; // Czyścimy, żeby nie dublować przy reloadach

    for (let i = 1; i <= 36; i++) {
        const cell = document.createElement('div');
        const isRed = reds.includes(i);
        cell.className = `bet-cell ${isRed ? 'num-red' : 'num-black'}`;
        cell.innerText = i;
        cell.dataset.betKey = `number_${i}`; // ID do szukania
        
        // NOWA OBSŁUGA KLIKNIĘCIA
        cell.onmousedown = (e) => handleBetClick(e, 'number', i);
        
        container.appendChild(cell);
    }

    // Przypisz handlery do przycisków specjalnych (musimy je znaleźć w HTML)
    // UWAGA: Musisz dodać data-bet-key w HTML lub zrobić to tutaj dynamicznie.
    // Zrobimy to dynamicznie dla istniejących w HTML.
    setupSpecialBtn('red', 'color', 'red');
    setupSpecialBtn('black', 'color', 'black');
    setupSpecialBtn('even', 'parity', 'even');
    setupSpecialBtn('odd', 'parity', 'odd'); // Uwaga na nazwy klas w HTML
    
    // Zero
    const zero = document.querySelector('.bet-cell.zero');
    if(zero) {
        zero.dataset.betKey = `number_0`;
        zero.onmousedown = (e) => handleBetClick(e, 'number', 0);
        zero.onclick = null; // Usuń stary onclick z HTML
    }
}

function setupSpecialBtn(classNameCheck, type, val) {
    // Znajduje przycisk po fragmencie klasy (np. 'spec-btn red')
    const btns = document.querySelectorAll('.spec-btn');
    btns.forEach(btn => {
        if (btn.classList.contains(classNameCheck) || (classNameCheck === 'even' && btn.innerText === 'EVEN') || (classNameCheck === 'odd' && btn.innerText === 'ODD')) {
            btn.dataset.betKey = `${type}_${val}`;
            btn.onmousedown = (e) => handleBetClick(e, type, val);
            btn.removeAttribute('onclick'); // Usuń stary handler inline
        }
    });
}

/* --- RESZTA LOGIKI (TRACKING, SYNC, ANIMACJA) --- */

/* --- script-ruletka.js : FIX SPOILERÓW W HISTORII --- */

async function syncGame() {
    try {
        const res = await fetch('/api/casino/roulette/state');
        if(!res.ok) return;
        const state = await res.json();
        globalStatus = state.status;

        document.getElementById('timer').innerText = `00:${state.timeLeft < 10 ? '0'+state.timeLeft : state.timeLeft}`;
        const statusEl = document.getElementById('status-text');
        const btn = document.getElementById('btn-postaw');

        // Zmienna pomocnicza do historii
        let historyToShow = [];

        if (state.status === 'betting') {
            statusEl.innerText = "POSTAW ZAKŁAD";
            statusEl.style.color = "#2ecc71";
            isSpinning = false;
            btn.classList.remove('disabled');
            
            // W fazie obstawiania pokazujemy wszystko (ostatni wynik już jest znany)
            historyToShow = state.history.slice(0, 8);

        } else {
            statusEl.innerText = "LOSOWANIE...";
            statusEl.style.color = "#e74c3c";
            btn.classList.add('disabled');
            
            if (!isSpinning) spinTo(state.lastResult);

            // ANTY-SPOILER: W fazie kręcenia UKRYWAMY najnowszy wynik (index 0).
            // Pokazujemy wyniki od 1 do 9 (czyli te starsze), żeby gracz nie widział
            // co wypadło, zanim koło się nie zatrzyma.
            historyToShow = state.history.slice(1, 9);
        }

        // Renderowanie Historii (Tylko jeśli się zmieniła - Fix pulsowania)
        const currentJSON = JSON.stringify(historyToShow);
        
        if (currentJSON !== lastHistoryJSON) {
            lastHistoryJSON = currentJSON;
            const histDiv = document.getElementById('history');
            histDiv.innerHTML = '';
            
            historyToShow.forEach(num => {
                const ball = document.createElement('div');
                ball.className = 'last-res';
                ball.innerText = num;
                // Kolorowanie kulek
                ball.style.background = num === 0 ? '#27ae60' : (reds.includes(num) ? '#c0392b' : '#222');
                ball.style.color = 'white';
                histDiv.appendChild(ball);
            });
        }

    } catch(e) {}
}

// ... (funkcje trackWheel, updatePreviewBox, spinTo, setChip, updateBalance, initWheel - BEZ ZMIAN z poprzedniego pliku) ...
// SKOPIUJ JE STĄD DLA KOMPLETNOŚCI:

function trackWheel() {
    const wheel = document.getElementById('wheel-spinner');
    const style = window.getComputedStyle(wheel);
    const matrix = new WebKitCSSMatrix(style.transform);
    let currentAngle = Math.atan2(matrix.m12, matrix.m11) * (180 / Math.PI);
    if (currentAngle < 0) currentAngle += 360;
    const segmentAngle = 360 / 37;
    const normalizedAngle = (360 - currentAngle) % 360;
    let index = Math.floor((normalizedAngle + (segmentAngle/2)) / segmentAngle);
    if (index >= 37) index = 0;
    updatePreviewBox(wheelOrder[index]);
    requestAnimationFrame(trackWheel);
}

function updatePreviewBox(num) {
    const box = document.getElementById('zoom-number');
    const boxContainer = document.getElementById('result-zoom');
    if (num === undefined) return;
    box.innerText = num;
    box.className = 'zoom-number';
    if (num === 0) {
        box.classList.add('text-green');
        boxContainer.style.borderColor = '#2ecc71';
    } else if (reds.includes(num)) {
        box.classList.add('text-red');
        boxContainer.style.borderColor = '#e74c3c';
    } else {
        box.classList.add('text-black');
        boxContainer.style.borderColor = '#bdc3c7';
    }
}

function initWheel() {
    const wheel = document.getElementById('wheel-spinner');
    const segmentAngle = 360 / 37;
    let gradient = 'conic-gradient(';
    wheelOrder.forEach((num, index) => {
        let color = num === 0 ? '#27ae60' : (reds.includes(num) ? '#c0392b' : '#222');
        let start = index * segmentAngle;
        let end = (index + 1) * segmentAngle;
        gradient += `${color} ${start}deg ${end}deg,`;
        const wrapper = document.createElement('div');
        wrapper.className = 'wheel-number';
        wrapper.style.transform = `translate(-50%, -50%) rotate(${start + (segmentAngle/2)}deg)`;
        const text = document.createElement('div');
        text.className = 'wheel-num-text';
        text.innerText = num;
        wrapper.appendChild(text);
        wheel.appendChild(wrapper);
    });
    gradient = gradient.slice(0, -1) + ')';
    wheel.style.background = gradient;
}

function setChip(val, el) {
    currentChip = val;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
}

function spinTo(winningNumber) {
    isSpinning = true;
    const wheel = document.getElementById('wheel-spinner');
    const segmentAngle = 360 / 37;
    const index = wheelOrder.indexOf(winningNumber);
    const targetRotation = -(index * segmentAngle); 
    const totalRotation = currentRotation + 1440 + (targetRotation - (currentRotation % 360));
    wheel.style.transform = `rotate(${totalRotation}deg)`;
    currentRotation = totalRotation;
    setTimeout(updateBalance, 8500);
}

async function updateBalance() {
    try {
        const res = await fetch('/wallet');
        const data = await res.json();
        
        if(data.success) {
            const el = document.getElementById('balance');
            if (el) {
                // Parsujemy do float i ucinamy do 2 miejsc po przecinku
                const val = parseFloat(data.wallet.hellerman_coins);
                el.innerText = val.toFixed(2); // Np. "10500.50"
            }
        }
    } catch(e) {
        console.error("Błąd aktualizacji portfela:", e);
    }
}
/* --- OBSŁUGA HISTORII GRACZA --- */

function toggleHistoryPanel() {
    const p = document.getElementById('history-panel');
    p.classList.toggle('open');
    if (p.classList.contains('open')) {
        loadUserHistory();
    }
}

/* --- script-ruletka.js (POPRAWIONA FUNKCJA HISTORII) --- */

async function loadUserHistory() {
    const container = document.getElementById('history-list-content');
    
    // Nie czyścimy kontenera od razu, żeby nie mrugało przy odświeżaniu,
    // ale jeśli to pierwsze otwarcie, można dać loader.
    if(container.innerHTML.trim() === "") {
        container.innerHTML = '<p style="text-align:center; color:#888;">Pobieranie...</p>';
    }

    try {
        const res = await fetch('/api/casino/history');
        const data = await res.json();

        if (data.success) {
            container.innerHTML = '';
            
            // Kopia tablicy historii
            let historyData = [...data.history];

            // ANTY-SPOILER:
            // Jeśli koło się kręci, usuwamy najnowszy wpis (indeks 0),
            // bo to jest ten wynik, który właśnie jest losowany!
            if (globalStatus === 'spinning' && historyData.length > 0) {
                historyData.shift(); // Usuwa pierwszy element
            }

            if (historyData.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666;">Brak zakończonych gier.</p>';
                return;
            }

            historyData.forEach(row => {
                // Obliczanie czy wygrana (zysk > 0)
                // W bazie mamy total_win (wypłata) i total_bet (wkład).
                // Jeśli wypłata > 0 to znaczy że coś trafiliśmy.
                const winAmount = parseFloat(row.total_win);
                const betAmount = parseFloat(row.total_bet);
                
                // Definicja: Czy to była "dobra" runda? 
                // Zazwyczaj w ruletce jak cokolwiek wygrasz to jest na zielono.
                const isWin = winAmount > 0;
                
                // Zysk netto (może być ujemny)
                const netProfit = winAmount - betAmount;
                const profitStr = netProfit >= 0 ? `+${winAmount}` : `-${betAmount}`;

                const div = document.createElement('div');
                div.className = `hist-entry ${isWin ? 'win' : 'loss'}`;
                
                const date = new Date(row.created_at).toLocaleTimeString();

                div.innerHTML = `
                    <div class="hist-top">
                        <span>${date}</span>
                        <span>Stawka: ${betAmount}</span>
                    </div>
                    <div class="hist-res">${row.result_info}</div>
                    <div class="hist-bet">${row.bet_summary}</div>
                    <div class="hist-profit">${profitStr}</div>
                `;
                container.appendChild(div);
            });
        }
    } catch(e) {
        container.innerHTML = '<p style="text-align:center; color:red;">Błąd sieci.</p>';
    }
}