/* --- game.js - LOGIKA PVP --- */

const gamesListEl = document.getElementById('games-list');
const statOnline = document.getElementById('stat-online');
const statPlaying = document.getElementById('stat-playing');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNum = document.getElementById('countdown-number');

let myCurrentGameId = null;
let isMatchFound = false;

document.addEventListener('DOMContentLoaded', () => {
    refreshLobby();
    // Odświeżaj listę co 2 sekundy
    setInterval(refreshLobby, 2000);
    // Sprawdzaj czy gra wystartowała co 1 sekundę
    setInterval(checkGameStart, 1000);
});

// 1. POBIERANIE LISTY I STATUSÓW
async function refreshLobby() {
    if(isMatchFound) return; // Jeśli odlicza, nie odświeżaj listy

    try {
        const res = await fetch('/api/lobby/list');
        const data = await res.json();

        if (data.success) {
            statOnline.innerText = data.online;
            statPlaying.innerText = data.playing;
            renderGamesList(data.games, data.myUserId);
            
            // Jeśli stworzyłem grę i czekam, zablokuj formularz tworzenia
            if (data.myCurrentGame && data.myCurrentGame.status === 'waiting') {
                document.querySelector('.create-game-box').style.opacity = '0.5';
                document.querySelector('.create-game-box').style.pointerEvents = 'none';
                myCurrentGameId = data.myCurrentGame.id;
            } else {
                document.querySelector('.create-game-box').style.opacity = '1';
                document.querySelector('.create-game-box').style.pointerEvents = 'auto';
                myCurrentGameId = null;
            }
        }
    } catch (e) { console.error(e); }
}

function renderGamesList(games, myId) {
    gamesListEl.innerHTML = '';

    if (games.length === 0) {
        gamesListEl.innerHTML = '<div style="text-align:center; color:#555; margin-top:50px;">Brak aktywnych gier.<br>Stwórz własną!</div>';
        return;
    }

    games.forEach(game => {
        const div = document.createElement('div');
        div.className = 'game-row';
        
        const rankBadge = game.is_ranked ? '<span class="rank-badge">🏆 RANKED</span>' : '<span style="color:#777; margin-left:10px;">🛡️ CASUAL</span>';
        
        // Logika przycisków i statusów
        let actionHtml = '';
        let playersCount = '1/2';

        if (game.status === 'playing') {
            playersCount = '2/2';
            actionHtml = `<span class="status-playing">W TRAKCIE...</span>`;
        } else {
            // Jeśli to moja gra -> Przycisk USUŃ
            if (game.host_id === myId) {
                actionHtml = `<button class="btn-delete" onclick="cancelGame()">USUŃ</button>`;
            } else {
                // Jeśli nie moja -> Przycisk DOŁĄCZ
                actionHtml = `<button class="btn-join" onclick="joinGame(${game.id})">DOŁĄCZ</button>`;
            }
        }

        div.innerHTML = `
            <div class="game-info">
                <h4>${game.room_name} ${rankBadge}</h4>
                <p>Host: <span style="color:white;">${game.host_name}</span> | Graczy: <span style="color:gold;">${playersCount}</span></p>
            </div>
            <div class="game-action">
                ${actionHtml}
            </div>
        `;
        gamesListEl.appendChild(div);
    });
}

// 2. TWORZENIE GRY
async function createGame() {
    const name = document.getElementById('room-name').value;
    const isRanked = document.getElementById('is-ranked').checked;
    
    try {
        const res = await fetch('/api/lobby/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: name, isRanked })
        });
        const data = await res.json();
        
        if (data.success) {
            refreshLobby();
        } else {
            alert(data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
}

// 3. DOŁĄCZANIE
async function joinGame(gameId) {
    if(!confirm("Czy na pewno chcesz dołączyć? (Wymagana talia 18 kart)")) return;

    try {
        const res = await fetch('/api/lobby/join', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ gameId })
        });
        const data = await res.json();

        if (data.success) {
            // Sukces! Zaraz funkcja checkGameStart wykryje zmianę statusu
            console.log("Dołączono! Czekam na start...");
        } else {
            alert(data.error);
        }
    } catch(e) { alert("Błąd sieci"); }
}

// 4. ANULOWANIE WŁASNEJ GRY
async function cancelGame() {
    if(!confirm("Rozwiązać lobby?")) return;
    await fetch('/api/lobby/cancel', { method: 'POST' });
    refreshLobby();
}

// 5. SPRAWDZANIE STARTU (Polling)
async function checkGameStart() {
    if(isMatchFound) return; // Już odlicza

    try {
        const res = await fetch('/api/lobby/my-status');
        const data = await res.json();

        if (data.inGame) {
            // GRA WYSTARTOWAŁA!
            isMatchFound = true;
            startCountdown();
        }
    } catch(e) {}
}

// 6. ODLICZANIE
function startCountdown() {
    countdownOverlay.style.display = 'flex';
    let count = 5;
    countdownNum.innerText = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNum.innerText = count;
        } else {
            countdownNum.innerText = "START!";
            clearInterval(interval);
            
            // TU NASTĄPI PRZEKIEROWANIE DO WŁAŚCIWEGO STOŁU GRY (W PRZYSZŁOŚCI)
            setTimeout(() => {
                window.location.href = '/duel'; // <-- To nas przeniesie na stół gry!
                // Na razie resetujemy dla testów:
                isMatchFound = false;
                countdownOverlay.style.display = 'none';
            }, 1000);
        }
    }, 1000);
}

// Szybka gra (na razie proste przekierowanie do join)
async function quickJoin() {
    alert("Szukanie...");
    // Tutaj można dodać logikę /api/lobby/quick-join z poprzedniego kroku
}