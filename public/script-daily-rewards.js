/* --- script-daily-rewards.js (NEW SYSTEM) --- */

// Globalne funkcje dostępne dla HTML
window.openDailyRewards = async function() {
    const modal = document.getElementById('daily-modal');
    if(modal) {
        modal.classList.add('open');
        await renderDailyGrid();
    }
};

window.closeDailyModal = function(e) {
    // Zamyka jeśli kliknięto w tło lub przycisk
    if (!e || e.target.id === 'daily-modal' || e.target.classList.contains('close-daily-btn')) {
        document.getElementById('daily-modal').classList.remove('open');
    }
};

// Główna funkcja renderująca
async function renderDailyGrid() {
    const container = document.getElementById('daily-grid-container');
    if(!container) return;
    
    container.innerHTML = '<p style="color:#888;">Sprawdzanie kalendarza...</p>';

    try {
        const res = await fetch('/api/daily-rewards');
        const data = await res.json();

        if(!data.success) {
            container.innerHTML = '<p style="color:red;">Błąd systemu nagród.</p>';
            return;
        }

        container.innerHTML = '';
        
        // DANE Z SERWERA:
        // day = numer dnia, który teraz "obrabiamy" (np. 2)
        // canClaim = czy możemy go odebrać (true/false)
        const currentLevel = parseInt(data.day);
        const canClaim = data.canClaim;

        for (let i = 1; i <= 14; i++) {
            const reward = data.rewards[i];
            const div = document.createElement('div');
            
            // Domyślne klasy
            let classes = ['day-box'];
            let overlayHtml = '';
            let clickAction = null;

            // --- LOGIKA STANÓW ---

            // STAN 1: PRZESZŁOŚĆ (Dni mniejsze niż Twój poziom)
            // Zawsze odebrane.
            if (i < currentLevel) {
                classes.push('claimed'); 
            }
            
            // STAN 2: TERAŹNIEJSZOŚĆ (Twój aktualny poziom)
            else if (i === currentLevel) {
                if (canClaim) {
                    // Masz prawo odebrać -> Stan AKTYWNY
                    classes.push('active');
                    clickAction = () => claimRewardAction();
                } else {
                    // Już odebrałeś dzisiaj -> Stan COOLDOWN (Czekaj na jutro)
                    classes.push('cooldown');
                    // Dodajemy nakładkę tekstową
                    overlayHtml = '<div class="cooldown-text">JUTRO</div>';
                }
            }
            
            // STAN 3: PRZYSZŁOŚĆ (Dni większe niż Twój poziom)
            // Zablokowane.
            else {
                classes.push('locked');
            }

            // Dni specjalne (7 i 14)
            if (i === 7 || i === 14) classes.push('special');

            // --- RENDEROWANIE HTML ---
            
            // Wybór ikony
            let iconSrc = 'coin_icon.png';
            if (reward.type === 'pack') iconSrc = 'booster.png';
            if (reward.type === 'card') {
                if(reward.val === 5) iconSrc = 'cowboy.png';
                else if(reward.val === 6) iconSrc = 'dwarf.png';
                else iconSrc = 'cards_icon.png';
            }

            div.className = classes.join(' ');
            if (clickAction) div.onclick = clickAction;

            div.innerHTML = `
                <span class="day-num">Dzień ${i}</span>
                <img src="${iconSrc}" class="day-reward-img" onerror="this.src='coin_icon.png'">
                <span class="day-val">${reward.desc}</span>
                ${overlayHtml}
            `;
            
            container.appendChild(div);
        }

        // Obsługa kropki powiadomień w menu głównym
        const dot = document.getElementById('daily-notification');
        if(dot) {
            dot.style.display = (canClaim) ? 'flex' : 'none';
        }

    } catch(e) {
        console.error(e);
        container.innerHTML = '<p style="color:red;">Błąd połączenia.</p>';
    }
}

// Funkcja wykonawcza (kliknięcie)
async function claimRewardAction() {
    const container = document.getElementById('daily-grid-container');
    // Lekka blokada wizualna na czas requestu
    container.style.opacity = '0.5';
    
    try {
        const res = await fetch('/api/daily-rewards/claim', { method: 'POST' });
        const data = await res.json();
        
        container.style.opacity = '1';

        if (data.success) {
            alert(data.message); // Można zamienić na ładny modal
            if(window.updateWallet) window.updateWallet(); // Odśwież kasę
            
            // Przeładuj grid, aby pokazać nowy stan (Cooldown lub kolejny dzień)
            await renderDailyGrid();
        } else {
            alert(data.error);
        }
    } catch(e) {
        alert("Błąd sieci");
        container.style.opacity = '1';
    }
}

// Autostart: Sprawdź kropkę przy ładowaniu strony
window.addEventListener('load', () => {
    // Wywołujemy "ciche" sprawdzenie tylko po to, by zapalić kropkę
    // RenderDailyGrid robi fetch, więc można go użyć, ale nie musi renderować HTML jeśli modal zamknięty
    // Dla uproszczenia:
    fetch('/api/daily-rewards').then(r=>r.json()).then(d => {
        const dot = document.getElementById('daily-notification');
        if(dot && d.success && d.canClaim) {
            dot.style.display = 'flex';
        }
    }).catch(e=>{});
});