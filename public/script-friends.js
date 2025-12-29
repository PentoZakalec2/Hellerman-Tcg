/* --- script-friends.js: SYSTEM ZNAJOMYCH (NAPRAWIONY) --- */

const friendsPanel = document.getElementById('friends-panel');
let currentFriendId = null;

// 1. OTWIERANIE / ZAMYKANIE
window.openFriendsPanel = function() {
    if(friendsPanel) {
        friendsPanel.classList.add('open');
        loadFriendsList();     // Ładuj listę znajomych
        loadPrivacySettings(); // Ładuj ustawienia
    }
};

window.closeFriendsPanel = function() {
    if(friendsPanel) friendsPanel.classList.remove('open');
};

// 2. ZAKŁADKI (Poprawione przełączanie)
window.switchFriendTab = function(tabName) {
    // Resetuj style przycisków
    document.querySelectorAll('.f-tab').forEach(b => b.classList.remove('active'));
    // Ukryj treści
    document.getElementById('friend-tab-list').style.display = 'none';
    document.getElementById('friend-tab-search').style.display = 'none';
    
    if(tabName === 'list') {
        // Zakładka Lista
        const btn = document.querySelector('.f-tab:nth-child(1)');
        if(btn) btn.classList.add('active');
        document.getElementById('friend-tab-list').style.display = 'block';
        loadFriendsList(); 
    } else {
        // Zakładka Szukaj
        const btn = document.querySelector('.f-tab:nth-child(2)');
        if(btn) btn.classList.add('active');
        document.getElementById('friend-tab-search').style.display = 'block';
        
        // AUTOMATYCZNIE ŁADUJ LISTĘ WSZYSTKICH GRACZY NA START
        searchUsers(''); 
    }
};

// 3. POBIERANIE LISTY ZNAJOMYCH I ZAPROSZEŃ
async function loadFriendsList() {
    const listContainer = document.getElementById('friends-list-container');
    const reqContainer = document.getElementById('friend-requests-container');
    
    listContainer.innerHTML = '<p style="color:#888;">Ładowanie...</p>';
    reqContainer.innerHTML = '';

    try {
        const res = await fetch('/api/friends/list');
        const data = await res.json();

        if(data.success) {
            listContainer.innerHTML = '';
            
            // A. ZAPROSZENIA
            if(data.requests && data.requests.length > 0) {
                reqContainer.innerHTML = '<div class="f-list-header" style="color:#f1c40f">ZAPROSZENIA</div>';
                data.requests.forEach(req => {
                    const div = document.createElement('div');
                    div.className = 'friend-item request';
                    div.innerHTML = `
                        <div>
                            <div class="f-name">${req.username}</div>
                            <div class="f-status">Chce Cię dodać</div>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button class="action-btn green small" style="padding:5px 10px;" onclick="respondFriend(${req.id}, true)">✔</button>
                            <button class="action-btn red small" style="padding:5px 10px;" onclick="respondFriend(${req.id}, false)">✖</button>
                        </div>
                    `;
                    reqContainer.appendChild(div);
                });
            }

            // B. ZNAJOMI
            if(!data.friends || data.friends.length === 0) {
                listContainer.innerHTML = '<p style="color:#666; text-align:center;">Brak znajomych. Znajdź kogoś!</p>';
            } else {
                data.friends.forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'friend-item';
                    div.innerHTML = `
                        <div onclick="selectFriend(${f.id}, '${f.username}')" style="cursor:pointer; flex:1;">
                            <div class="f-name">${f.username}</div>
                            <div class="f-status" style="color:#2ecc71">Znajomy</div>
                        </div>
                        <div style="font-size:20px; cursor:pointer;" title="Opcje" onclick="selectFriend(${f.id}, '${f.username}')">⚙️</div>
                    `;
                    listContainer.appendChild(div);
                });
            }
        } else {
            listContainer.innerHTML = `<p style="color:red;">Błąd: ${data.error}</p>`;
        }
    } catch(e) { 
        console.error(e);
        listContainer.innerHTML = '<p style="color:red;">Błąd sieci.</p>'; 
    }
}

// 4. WYSZUKIWANIE (Obsługuje pusty string jako "pokaż wszystkich")
window.searchUsers = async function(forceQuery) {
    // Jeśli podano argument (np. puste ''), użyj go. Jeśli nie, weź z inputa.
    let query = forceQuery !== undefined ? forceQuery : document.getElementById('friend-search-input').value;
    
    const container = document.getElementById('search-results-container');
    container.innerHTML = '<p style="color:#888;">Szukanie...</p>';

    try {
        const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if(data.success) {
            container.innerHTML = '';
            if(data.users.length === 0) {
                container.innerHTML = '<p>Brak wyników.</p>';
                return;
            }
            
            data.users.forEach(u => {
                let actionBtn = `<button class="action-btn purple small" style="padding:5px 10px; font-size:12px;" onclick="sendFriendRequest(${u.id})">➕ Dodaj</button>`;
                
                if (u.is_friend) actionBtn = `<span style="color:#2ecc71; font-size:12px;">Znajomy</span>`;
                else if (u.request_sent) actionBtn = `<span style="color:#f1c40f; font-size:12px;">Wysłano</span>`;
                else if (u.request_received) actionBtn = `<span style="color:#f1c40f; font-size:12px;">Zaprasza Cię</span>`;

                const div = document.createElement('div');
                div.className = 'friend-item';
                div.innerHTML = `
                    <div class="f-name">${u.username}</div>
                    <div>${actionBtn}</div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = `<p style="color:red;">Błąd: ${data.error}</p>`;
        }
    } catch(e) { 
        console.error(e);
        container.innerHTML = '<p style="color:red;">Błąd sieci.</p>'; 
    }
};

// 5. AKCJE
window.sendFriendRequest = async function(targetId) {
    await fetch('/api/friends/request', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ targetId })
    });
    // Odśwież listę wyszukiwania, żeby pokazać "Wysłano"
    searchUsers(); 
};

window.respondFriend = async function(friendshipId, accept) {
    await fetch('/api/friends/respond', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ friendshipId, accept })
    });
    loadFriendsList();
};

window.removeFriend = async function() {
    if(!currentFriendId || !confirm("Usunąć znajomego?")) return;
    await fetch('/api/friends/remove', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ targetId: currentFriendId })
    });
    document.getElementById('friend-preview-area').style.display = 'none';
    loadFriendsList();
};

// 6. PRYWATNOŚĆ
async function loadPrivacySettings() {
    try {
        const res = await fetch('/api/user/privacy');
        const data = await res.json();
        if(data.success) {
            document.getElementById('priv-inv').checked = !!data.settings.public_inventory;
            document.getElementById('priv-coll').checked = !!data.settings.public_collection;
            document.getElementById('priv-deck').checked = !!data.settings.public_decks;
        }
    } catch(e) {}
}

window.updatePrivacy = async function() {
    const settings = {
        public_inventory: document.getElementById('priv-inv').checked,
        public_collection: document.getElementById('priv-coll').checked,
        public_decks: document.getElementById('priv-deck').checked
    };
    await fetch('/api/user/privacy', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify(settings)
    });
};

// 7. PODGLĄD
window.selectFriend = function(id, name) {
    currentFriendId = id;
    document.getElementById('friend-preview-area').style.display = 'block';
    document.getElementById('preview-friend-name').innerText = name;
    document.getElementById('friend-data-display').innerHTML = '<p style="color:#888;">Wybierz co chcesz zobaczyć...</p>';
};

window.viewFriendData = async function(type) {
    if(!currentFriendId) return;
    const container = document.getElementById('friend-data-display');
    container.innerHTML = '<p style="color:#aaa;">Ładowanie danych...</p>';

    try {
        const res = await fetch(`/api/friends/view/${currentFriendId}/${type}`);
        const data = await res.json();

        if(data.success) {
            container.innerHTML = '';
            if(!data.items || data.items.length === 0) {
                container.innerHTML = '<p>Pusto (lub ukryte).</p>';
                return;
            }
            
            // Renderowanie kart
            data.items.forEach(item => {
                const img = document.createElement('div');
                // Dodajemy klasę rarity (dla ramki)
                img.className = `mini-friend-card rarity-${item.rarity} ${item.is_numbered ? 'numbered' : ''}`;
                img.style.backgroundImage = `url('${item.image_url}')`;
                
                // Tooltip
                let title = item.name;
                if(item.is_numbered) title += ` #${item.serial_number}`;
                img.title = title;

                // Licznik ilości (jeśli > 1)
                if (item.quantity > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'mini-qty-badge';
                    badge.innerText = `x${item.quantity}`;
                    img.appendChild(badge);
                }

                // Kliknięcie -> Podgląd
                img.onclick = () => {
                   if(window.showPreview) {
                       window.showPreview({
                           ...item,
                           card_id: item.card_id, // Upewniamy się, że to pole jest przekazane
                           source: 'friend_view'  // Żeby nie pokazywało panelu dropu
                       });
                   }
                };

                container.appendChild(img);
            });
        } else {
            container.innerHTML = `<p style="color:#e74c3c;">🔒 ${data.error}</p>`;
        }
    } catch(e) { container.innerHTML = 'Błąd sieci'; }
};