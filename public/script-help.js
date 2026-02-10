/* --- script-help.js : OBSŁUGA SYSTEMU POMOCY (FIXED) --- */

const helpModal = document.getElementById('help-modal');
const helpMenuMain = document.getElementById('help-menu-main');

// Sekcje pomocy
const sections = {
    rates: document.getElementById('help-section-rates'),
    report: document.getElementById('help-section-report'),
    suggest: document.getElementById('help-section-suggest'),
    admin: document.getElementById('help-section-admin')
};

// Otwieranie Menu
function openHelpMenu() {
    if(helpModal) helpModal.style.display = 'flex';
    backToHelpMain(); 
    
    // Sprawdź czy użytkownik jest adminem
    if (window.isAdmin === true) {
        const adminBtn = document.getElementById('admin-reports-btn');
        if (adminBtn) adminBtn.style.display = 'block';
    }
}

function closeHelpMenu() {
    if(helpModal) helpModal.style.display = 'none';
}

function backToHelpMain() {
    // Ukryj wszystkie sekcje
    Object.values(sections).forEach(s => {
        if(s) s.style.display = 'none';
    });
    // Pokaż menu główne
    if(helpMenuMain) helpMenuMain.style.display = 'block';
}

// --- 1. PROCENTOWE SZANSE (DYNAMICZNE OBLICZANIE) ---
async function showDropRates() {
    if(helpMenuMain) helpMenuMain.style.display = 'none';
    const section = document.getElementById('help-section-rates');
    if(section) section.style.display = 'block';
    
    const list = document.getElementById('rates-list');
    if(!list) return;
    
    list.innerHTML = '<li>Ładowanie...</li>';

    try {
        const res = await fetch('/help/drop-rates');
        const data = await res.json();
        
        let html = '';
        
        // 1. STANDARDOWE RZADKOŚCI
        html += `<h4 style="margin:5px 0; color:#ddd; border-bottom:1px solid #444;">Standardowe Karty</h4>`;
        if (data.rarity) {
            for (const [rarity, chance] of Object.entries(data.rarity)) {
                let color = '#fff';
                if(rarity === 'Rare') color = '#3498db';
                if(rarity === 'Epic') color = '#9b59b6';
                if(rarity === 'Legendary') color = '#f1c40f';

                html += `<li><span style="color:${color}">${rarity}</span> <span class="rate-val">${(chance * 100).toFixed(0)}%</span></li>`;
            }
        }
        
        // 2. KARTY NUMEROWANE
        const numChance = (data.numbered_base_chance * 100).toFixed(1);
        
        html += `<h4 style="margin:15px 0 5px 0; color:gold; border-bottom:1px solid #444;">Karty Limitowane</h4>`;
        html += `<li><span style="color:cyan;">Szansa na trafienie:</span> <span class="rate-val">${numChance}%</span></li>`;
        
        html += `<div style="font-size:11px; color:#aaa; margin-top:8px; margin-bottom:4px;">Rozkład wariantów (jeśli trafisz limitowaną):</div>`;
        
        // 3. OBLICZANIE SZANS NA KONKRETNY TIER
        let totalWeight = 0;
        if (data.tiers) {
            for (const w of Object.values(data.tiers)) {
                totalWeight += w;
            }

            const tierInfo = {
                '50': { name: 'Emerald', color: '#2ecc71' },
                '25': { name: 'Gold', color: '#f1c40f' },
                '10': { name: 'Pink Sapphire', color: '#ff00cc' },
                '5':  { name: 'Blue Sapphire', color: '#00d2ff' },
                '1':  { name: 'Red Sapphire', color: '#ff0000' }
            };

            const sortedTiers = Object.keys(data.tiers).sort((a,b) => parseInt(b) - parseInt(a));

            for (const tierKey of sortedTiers) {
                const weight = data.tiers[tierKey];
                const percent = (weight / totalWeight) * 100;
                let percentStr = percent < 1 ? percent.toFixed(2) : percent.toFixed(1);
                
                const info = tierInfo[tierKey] || { name: `Nakład /${tierKey}`, color: '#fff' };

                html += `
                    <li style="display:flex; justify-content:space-between; padding: 2px 0;">
                        <span>
                            <span style="color:${info.color}; font-weight:bold;">${info.name}</span> 
                            <span style="font-size:10px; color:#666;">(1/${tierKey})</span>
                        </span>
                        <span class="rate-val" style="color:#ddd;">${percentStr}%</span>
                    </li>`;
            }
        }

        list.innerHTML = html; // Wstawienie wygenerowanego HTML do listy
        
    } catch(e) { 
        console.error(e);
        list.innerHTML = '<li style="color:red">Błąd danych</li>'; 
    }
}

// --- 2. ZGŁOŚ PROBLEM ---
function showReportForm() {
    if(helpMenuMain) helpMenuMain.style.display = 'none';
    if(sections.report) sections.report.style.display = 'block';
}

async function submitProblem() {
    const nick = document.getElementById('rep-nick').value;
    const email = document.getElementById('rep-email').value;
    const subject = document.getElementById('rep-subject').value;
    const desc = document.getElementById('rep-desc').value;

    if(!nick || !email || !subject || !desc) { alert("Wypełnij wszystkie pola!"); return; }

    try {
        const res = await fetch('/help/submit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: 'problem',
                nickname: nick, email: email, subject: subject, description: desc
            })
        });
        const data = await res.json();
        if(data.success) {
            alert("Zgłoszenie wysłane! Dziękujemy.");
            backToHelpMain();
            document.getElementById('rep-desc').value = '';
            document.getElementById('rep-subject').value = '';
        } else alert("Błąd serwera");
    } catch(e) { alert("Błąd połączenia"); }
}

// --- 3. ZASUGERUJ KARTĘ ---
function showSuggestForm() {
    if(helpMenuMain) helpMenuMain.style.display = 'none';
    if(sections.suggest) sections.suggest.style.display = 'block';
}

async function submitSuggestion() {
    const nick = document.getElementById('sug-nick').value;
    const name = document.getElementById('sug-name').value;
    const rarity = document.getElementById('sug-rarity').value;
    const type = document.getElementById('sug-type').value;
    const stats = document.getElementById('sug-stats').value;
    const desc = document.getElementById('sug-desc').value;
    const img = document.getElementById('sug-img').value;

    if(!nick || !name || !stats || !desc) { alert("Wypełnij wymagane pola (Nick, Nazwa, Staty, Opis)!"); return; }

    try {
        const res = await fetch('/help/submit', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: 'suggestion',
                nickname: nick,
                description: desc,
                cardData: { name, rarity, type, stats, image: img }
            })
        });
        if((await res.json()).success) {
            alert("Sugestia wysłana! Może ta karta trafi do gry?");
            backToHelpMain();
            document.getElementById('sug-name').value = '';
            document.getElementById('sug-desc').value = '';
        } else alert("Błąd serwera");
    } catch(e) { alert("Błąd połączenia"); }
}

// --- 4. PANEL ADMINA ---
async function showAdminReports() {
    if(helpMenuMain) helpMenuMain.style.display = 'none';
    if(sections.admin) sections.admin.style.display = 'block';
    
    const container = document.getElementById('admin-reports-list');
    if(!container) return;

    // Przełącznik nawigacji
    const existingNav = document.getElementById('admin-nav-buttons');
    if (existingNav) existingNav.remove();

    const nav = document.createElement('div');
    nav.id = 'admin-nav-buttons';
    nav.style.marginBottom = '15px';
    nav.innerHTML = `
        <button class="action-btn purple" onclick="loadReportsList()">Raporty</button>
        <button class="action-btn gold" onclick="loadPendingUsers()">Nowe Konta</button>
    `;
    
    container.parentNode.insertBefore(nav, container);
    loadReportsList();
}

async function loadReportsList() {
    const container = document.getElementById('admin-reports-list');
    container.innerHTML = 'Pobieranie zgłoszeń...';
    try {
        const res = await fetch('/admin/reports');
        const data = await res.json();
        if(data.success) {
            container.innerHTML = '';
            if(!data.reports || data.reports.length === 0) {
                container.innerHTML = '<p>Brak zgłoszeń.</p>';
            } else {
                data.reports.forEach(rep => {
                    const div = document.createElement('div');
                    div.className = `report-item ${rep.type || 'problem'}`;
                    div.innerHTML = `<div><strong>${rep.nickname}</strong>: ${rep.subject || 'Sugestia'}</div><div style="font-size:12px; color:#aaa;">${rep.description}</div>`;
                    container.appendChild(div);
                });
            }
        }
    } catch(e) { container.innerHTML = 'Błąd sieci.'; }
}

async function loadPendingUsers() {
    const container = document.getElementById('admin-reports-list');
    container.innerHTML = 'Pobieranie nowych kont...';
    
    try {
        const res = await fetch('/admin/pending-users');
        const data = await res.json();
        
        if (data.success) {
            container.innerHTML = '';
            if (!data.users || data.users.length === 0) {
                container.innerHTML = '<p style="color:#2ecc71;">Brak nowych kont do zatwierdzenia.</p>';
                return;
            }

            data.users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'report-item';
                div.style.borderLeftColor = '#3498db';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:16px; color:#fff;">${u.username}</strong>
                            <div style="font-size:12px; color:#aaa;">ID: ${u.id} | Data: ${new Date(u.created_at).toLocaleString()}</div>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <button class="action-btn green" style="padding:5px 10px; font-size:12px;" onclick="approveUser(${u.id})">✔</button>
                            <button class="action-btn red" style="padding:5px 10px; font-size:12px;" onclick="rejectUser(${u.id})">✖</button>
                        </div>
                    </div>
                `;
                container.appendChild(div);
            });
        }
    } catch(e) { container.innerHTML = 'Błąd sieci.'; }
}

async function approveUser(id) {
    if(!confirm("Zatwierdzić gracza?")) return;
    await fetch('/admin/approve-user', { 
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({targetId: id}) 
    });
    loadPendingUsers();
}

async function rejectUser(id) {
    if(!confirm("USUNĄĆ to konto trwale?")) return;
    await fetch('/admin/reject-user', { 
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({targetId: id}) 
    });
    loadPendingUsers();
}