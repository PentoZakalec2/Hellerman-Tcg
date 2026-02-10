const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');

const app = express();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hellerman_tcg',
    port: process.env.DB_PORT || 3306,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false 
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'tajny_klucz_hellermana_final',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

/* =========================================
   KONFIGURACJA DROPÓW (NOWA - ZAKTUALIZOWANA)
   ========================================= */
const RARITY_CHANCE = { 
    Common: 0.70,    
    Rare: 0.18,      
    Epic: 0.10,      
    Legendary: 0.02  
};

// ZMIANA: Szansa na numerowaną zmniejszona z 0.10 na 0.05 (5%)
const BASE_NUMBERED_CHANCE = 0.05; 

// Wagi tierów (im mniej, tym rzadziej)
const TIER_WEIGHTS = {
    50: 100,  // Najczęstszy
    25: 50,
    10: 20,
    5:  5,
    1:  1     // Najrzadszy
};

// SKLEP - Konfiguracja
const SHOP_OFFERS = {
    'coin_pack': { type: 'pack', cost: 100, currency: 'coins', name: 'Karzeł Pack' },
    'shard_common_pack': { type: 'pack', cost: 10, currency: 'shard_common', name: 'Karzeł Pack (Common)' },
    'shard_rare_pack': { type: 'pack', cost: 4, currency: 'shard_rare', name: 'Karzeł Pack (Rare)' },
};

/* =========================================
   1. AUTORYZACJA
   ========================================= */
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) return res.json({ success: false, message: "Nazwa zajęta!" });
        const hashedPassword = await bcrypt.hash(password, 10);
        await connection.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.message }); } finally { connection.end(); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [users] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) return res.json({ success: false, message: "Błąd danych." });
        const user = users[0];

        // --- NOWOŚĆ: Sprawdzenie akceptacji ---
        // Admin (id=1) wchodzi zawsze, reszta musi mieć is_approved = 1
        if (user.is_approved === 0 && user.id !== 1) {
            return res.json({ success: false, message: "Konto czeka na akceptację Administratora." });
        }
        // --------------------------------------

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.json({ success: false, message: "Błąd danych." });

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = (user.id === 1);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: "Błąd serwera." }); } finally { connection.end(); }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/'); // Przekierowanie na stronę główną zamiast JSON
    });
});

app.get('/check-auth', (req, res) => {
    if (req.session.userId) res.json({ isLoggedIn: true, username: req.session.username, isAdmin: req.session.isAdmin });
    else res.json({ isLoggedIn: false });
});

/* =========================================
   2. GAMEPLAY & PACZKI
   ========================================= */
app.get('/pack-status', async (req, res) => {
    if (!req.session.userId) return res.json({ isLoggedIn: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [users] = await connection.query('SELECT daily_packs_opened, last_opened_date FROM users WHERE id = ?', [req.session.userId]);
        const user = users[0];
        const today = new Date().toLocaleDateString('en-CA');
        let lastDate = user.last_opened_date ? new Date(user.last_opened_date).toLocaleDateString('en-CA') : null;
        let packsOpened = user.daily_packs_opened;
        if (lastDate !== today) packsOpened = 0;
        const canOpen = (packsOpened < 5) || req.session.isAdmin;
        res.json({ isLoggedIn: true, canOpen: canOpen, packsOpened: packsOpened });
    } catch (e) { res.status(500).json({ error: e.message }); } finally { connection.end(); }
});

/* --- ENDPOINT: OTWIERANIE PACZKI (Z UPDATE ADMINA) --- */
/* --- POPRAWIONY /OPEN-PACK (Ograniczenie Admina do Bazy Danych) --- */
/* --- NAPRAWIONY ENDPOINT /OPEN-PACK (Z LIMITEM DZIENNYM I OPCJAMI ADMINA) --- */
app.post('/open-pack', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false, error: "Niezalogowany" });

    const { userId, isAdmin } = req.session;
    // Pobieramy wszystkie opcje (standardowe i admina)
    const { adminUnlimited, customCount, guaranteedRarity, useInventory, adminForceNumbered, adminForceTier } = req.body;

    const connection = await mysql.createConnection(dbConfig);

    try {
        await connection.beginTransaction();

        // ============================================================
        // 1. SPRAWDZANIE KOSZTÓW I LIMITÓW (TUTAJ BYŁ BŁĄD)
        // ============================================================
        if (useInventory) {
            // --- Otwieranie z Ekwipunku (Płatne paczkami) ---
            const [rows] = await connection.query('SELECT pack_karzel_count FROM users WHERE id = ? FOR UPDATE', [userId]);
            if (rows.length === 0 || rows[0].pack_karzel_count < 1) {
                await connection.rollback(); return res.json({ success: false, error: "Brak paczek w ekwipunku!" });
            }
            await connection.query('UPDATE users SET pack_karzel_count = pack_karzel_count - 1 WHERE id = ?', [userId]);
        
        } else {
            // --- Otwieranie Darmowe (Daily Limit) ---
            // Jeśli NIE JESTEŚ adminem lub NIE ZAZNACZYŁEŚ opcji "nielimitowane", sprawdzamy limit
            if (!(isAdmin && adminUnlimited)) {
                const [users] = await connection.query('SELECT daily_packs_opened, last_opened_date FROM users WHERE id = ? FOR UPDATE', [userId]);
                
                const today = new Date().toLocaleDateString('en-CA');
                let lastDate = users[0].last_opened_date ? new Date(users[0].last_opened_date).toLocaleDateString('en-CA') : null;
                let packsOpened = users[0].daily_packs_opened;

                // Reset licznika jeśli nowy dzień
                if (lastDate !== today) {
                    packsOpened = 0;
                    await connection.query('UPDATE users SET daily_packs_opened = 0, last_opened_date = ? WHERE id = ?', [today, userId]);
                }

                // Sprawdzenie limitu (5)
                if (packsOpened >= 5) {
                    await connection.rollback();
                    return res.json({ success: false, error: "LIMIT_REACHED" });
                }
                
                // Zwiększ licznik daily (To właśnie nie działało wcześniej)
                await connection.query('UPDATE users SET daily_packs_opened = daily_packs_opened + 1 WHERE id = ?', [userId]);
            }
        }

        // ============================================================
        // 2. LOSOWANIE KART (LOGIKA Z TIERAMI I ADMINEM)
        // ============================================================
        let cardsInPack = [];
        const cardsToDraw = (isAdmin && customCount) ? parseInt(customCount) : 5;

        for (let i = 0; i < cardsToDraw; i++) {
            
            // A. Rzadkość
            let rarity = 'Common';
            if (isAdmin && !useInventory && guaranteedRarity && guaranteedRarity !== 'Random') {
                rarity = guaranteedRarity;
            } else {
                const rand = Math.random();
                let cumulative = 0;
                for (const [r, chance] of Object.entries(RARITY_CHANCE)) {
                    cumulative += chance;
                    if (rand < cumulative) { rarity = r; break; }
                }
            }

            // B. Pobierz pulę kart
            const [pool] = await connection.query('SELECT * FROM cards WHERE rarity = ?', [rarity]);
            if (pool.length === 0) { i--; continue; }

            let cardTemplate = pool[Math.floor(Math.random() * pool.length)];
            
            // C. System Numerowany
            let isNumbered = false;
            let serialNumber = 0;
            let maxSupply = 0;

            const tiersStr = cardTemplate.allowed_tiers || "";
            const allowedTiers = tiersStr ? tiersStr.split(',').map(Number) : [];

            let forceNumbered = (isAdmin && !useInventory && adminForceNumbered);
            
            // Zabezpieczenie: Admin nie może wymusić numerowanej, jeśli karta nie ma tierów
            if (forceNumbered && allowedTiers.length === 0 && !cardTemplate.is_only_numbered) {
                forceNumbered = false;
            }

            const shouldBeNumbered = forceNumbered || cardTemplate.is_only_numbered || (Math.random() < BASE_NUMBERED_CHANCE);

            if (shouldBeNumbered && (allowedTiers.length > 0 || cardTemplate.is_only_numbered)) {
                let selectedTier = 0;

                if (forceNumbered && adminForceTier && adminForceTier !== 'Random') {
                    const reqTier = parseInt(adminForceTier);
                    if (allowedTiers.includes(reqTier)) selectedTier = reqTier;
                }

                if (selectedTier === 0 && allowedTiers.length > 0) {
                    let availableTiers = allowedTiers.filter(t => TIER_WEIGHTS[t] !== undefined);
                    if(availableTiers.length > 0) {
                        let totalWeight = availableTiers.reduce((sum, t) => sum + TIER_WEIGHTS[t], 0);
                        let tierRand = Math.random() * totalWeight;
                        selectedTier = availableTiers[0];
                        for (let t of availableTiers) {
                            if (tierRand < TIER_WEIGHTS[t]) { selectedTier = t; break; }
                            tierRand -= TIER_WEIGHTS[t];
                        }
                    }
                }

                if (selectedTier > 0) {
                    const [rows] = await connection.query(
                        'SELECT MAX(serial_number) as max_serial FROM user_cards WHERE card_id = ? AND is_numbered = 1 AND max_supply = ?', 
                        [cardTemplate.id, selectedTier]
                    );
                    let currentMax = rows[0].max_serial || 0;

                    if (currentMax < selectedTier || forceNumbered) {
                        isNumbered = true;
                        maxSupply = selectedTier;
                        serialNumber = currentMax + 1;
                    } else {
                        if (cardTemplate.is_only_numbered) { i--; continue; }
                    }
                }
            }

            cardsInPack.push({
                user_id: userId,
                card_id: cardTemplate.id,
                is_numbered: isNumbered,
                serial_number: isNumbered ? serialNumber : null,
                max_supply: isNumbered ? maxSupply : 0,
                name: cardTemplate.name,
                rarity: cardTemplate.rarity,
                image_url: cardTemplate.image_url
            });
        }

        // 3. ZAPIS DO BAZY
        for (let card of cardsInPack) {
            await connection.query(
                'INSERT INTO user_cards (user_id, card_id, is_numbered, serial_number, max_supply) VALUES (?, ?, ?, ?, ?)',
                [card.user_id, card.card_id, card.is_numbered, card.serial_number, card.max_supply]
            );
        }

        await connection.commit();
        res.json({ success: true, cards: cardsInPack });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    } finally { connection.end(); }
});

/* --- AKTUALIZACJA HELP (DROP RATES) --- */
app.get('/help/drop-rates', (req, res) => {
    res.json({ 
        rarity: RARITY_CHANCE, 
        numbered_base_chance: BASE_NUMBERED_CHANCE,
        tiers: TIER_WEIGHTS
    }); 
});

/* =========================================
   3. EKWIPUNEK (NAPRAWIONY)
   ========================================= */
/* --- server.js: POPRAWIONY EKWIPUNEK (NAPRAWA SORTOWANIA) --- */
app.get('/my-inventory', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // ZMIANA: Dodaliśmy 'c.attack, c.defense' do SELECT i GROUP BY
        const sqlCards = `
            SELECT c.name, c.rarity, c.image_url, c.attack, c.defense,
                   uc.card_id, uc.is_numbered, uc.serial_number, uc.max_supply, 
                   COUNT(*) as quantity
            FROM user_cards uc 
            JOIN cards c ON uc.card_id = c.id 
            WHERE uc.user_id = ?
            GROUP BY uc.card_id, uc.is_numbered, uc.serial_number, uc.max_supply, c.attack, c.defense
            ORDER BY c.rarity DESC
        `;
        const sqlPacks = `SELECT pack_karzel_count FROM users WHERE id = ?`;

        const [cards] = await connection.query(sqlCards, [req.session.userId]);
        const [packs] = await connection.query(sqlPacks, [req.session.userId]);

        res.json({ success: true, inventory: cards, packs: packs[0] });
    } catch (e) { 
        res.json({ success: false, error: e.message }); 
    } finally { 
        connection.end(); 
    }
});

/* =========================================
   4. WALUTY, SMASH & SKLEP
   ========================================= */
app.get('/wallet', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query('SELECT hellerman_coins, shard_common, shard_rare, shard_epic, shard_legendary, shard_secret FROM users WHERE id = ?', [req.session.userId]);
        res.json({ success: true, wallet: rows[0] });
    } catch (e) { res.json({ success: false }); } finally { connection.end(); }
});

app.post('/smash-card', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Niezalogowany" });
    const { cardId, isNumbered, amount } = req.body; 
    const userId = req.session.userId;
    const quantityToSmash = parseInt(amount) || 1;
    if (quantityToSmash < 1) return res.json({ success: false, error: "Błędna ilość" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();
        const checkSql = `SELECT count(*) as total FROM user_cards WHERE user_id = ? AND card_id = ? AND is_numbered = ?`;
        const [rows] = await connection.query(checkSql, [userId, cardId, isNumbered]);
        const totalOwned = rows[0].total;
        if (totalOwned - quantityToSmash < 1) { await connection.rollback(); return res.json({ success: false, error: "LAST_COPY" }); }
        const [cardInfo] = await connection.query('SELECT rarity FROM cards WHERE id = ?', [cardId]);
        const rarity = cardInfo[0].rarity;
        await connection.query(`DELETE FROM user_cards WHERE user_id = ? AND card_id = ? AND is_numbered = ? LIMIT ?`, [userId, cardId, isNumbered, quantityToSmash]);
        const shardColumn = `shard_${rarity.toLowerCase()}`;
        const validColumns = ['shard_common', 'shard_rare', 'shard_epic', 'shard_legendary', 'shard_secret'];
        if (validColumns.includes(shardColumn)) { await connection.query(`UPDATE users SET ${shardColumn} = ${shardColumn} + ? WHERE id = ?`, [quantityToSmash, userId]); }
        await connection.commit();
        res.json({ success: true, shardsAdded: quantityToSmash });
    } catch (e) { await connection.rollback(); res.json({ success: false, error: "Błąd serwera" }); } finally { connection.end(); }
});

// SKLEP - KUPNO
app.post('/shop/buy', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    const { offerId, amount } = req.body;
    const qty = parseInt(amount) || 1;
    if (qty < 1) return res.json({ success: false, error: "Błędna ilość" });
    const offer = SHOP_OFFERS[offerId];
    if (!offer) return res.json({ success: false, error: "Nieznana oferta" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();
        const [user] = await connection.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        const u = user[0];
        let costQuery = ""; let costParams = [];
        if (offer.currency === 'coins') {
            const totalCost = offer.cost * qty;
            if (u.hellerman_coins < totalCost) throw new Error("Za mało monet!");
            costQuery = "UPDATE users SET hellerman_coins = hellerman_coins - ? WHERE id = ?";
            costParams = [totalCost, u.id];
        } else if (offer.currency.startsWith('shard_')) {
            const totalCost = offer.cost * qty;
            if (u[offer.currency] < totalCost) throw new Error("Za mało shardów!");
            costQuery = `UPDATE users SET ${offer.currency} = ${offer.currency} - ? WHERE id = ?`;
            costParams = [totalCost, u.id];
        }
        await connection.query(costQuery, costParams);
        if (offer.type === 'pack') { await connection.query('UPDATE users SET pack_karzel_count = pack_karzel_count + ? WHERE id = ?', [qty, u.id]); }
        await connection.commit();
        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

// DAILY REWARDS
function getDailyRewardForDate(dateString) {
    let hash = 0; for (let i = 0; i < dateString.length; i++) { hash = ((hash << 5) - hash) + dateString.charCodeAt(i); hash |= 0; }
    const seed = Math.abs(hash) % 100;
    if (seed < 15) return { type: 'pack', amount: 1, label: 'Karzeł Pack' };
    if (seed < 45) return { type: 'coins', amount: 150, label: '150 HC' };
    if (seed < 75) return { type: 'coins', amount: 100, label: '100 HC' };
    return { type: 'coins', amount: 50, label: '50 HC' };
}

app.get('/shop/daily-info', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query('SELECT last_daily_claim FROM users WHERE id = ?', [req.session.userId]);
        const todayStr = new Date().toLocaleDateString('en-CA');
        const tomStr = new Date(new Date().setDate(new Date().getDate() + 1)).toLocaleDateString('en-CA');
        const lastClaim = rows[0].last_daily_claim ? new Date(rows[0].last_daily_claim).toLocaleDateString('en-CA') : null;
        res.json({ success: true, canClaim: (lastClaim !== todayStr), todayReward: getDailyRewardForDate(todayStr), tomorrowReward: getDailyRewardForDate(tomStr) });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

app.post('/shop/claim-daily', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT last_daily_claim FROM users WHERE id = ? FOR UPDATE', [req.session.userId]);
        const todayStr = new Date().toLocaleDateString('en-CA');
        if ((rows[0].last_daily_claim ? new Date(rows[0].last_daily_claim).toLocaleDateString('en-CA') : null) === todayStr) throw new Error("Już odebrano!");
        const reward = getDailyRewardForDate(todayStr);
        if (reward.type === 'coins') await connection.query('UPDATE users SET hellerman_coins = hellerman_coins + ?, last_daily_claim = ? WHERE id = ?', [reward.amount, todayStr, req.session.userId]);
        else await connection.query('UPDATE users SET pack_karzel_count = pack_karzel_count + ?, last_daily_claim = ? WHERE id = ?', [reward.amount, todayStr, req.session.userId]);
        await connection.commit();
        res.json({ success: true, reward });
    } catch (e) { await connection.rollback(); res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

/* =========================================
   5. DECK BUILDER & ADMIN & HELP
   ========================================= */
app.get('/deck-data', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [allCards] = await connection.query(`SELECT uc.id as user_card_id, uc.card_id, c.name, c.rarity, c.image_url, uc.is_numbered, uc.serial_number FROM user_cards uc JOIN cards c ON uc.card_id = c.id WHERE uc.user_id = ?`, [req.session.userId]);
        const [decks] = await connection.query('SELECT deck_index, name, cards_json FROM decks WHERE user_id = ?', [req.session.userId]);
        res.json({ success: true, allCards: allCards, savedDecks: decks });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

app.post('/save-deck', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const { deckIndex, deckName, cardIds } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.query(`INSERT INTO decks (user_id, deck_index, name, cards_json) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), cards_json = VALUES(cards_json)`, [req.session.userId, deckIndex, deckName, JSON.stringify(cardIds)]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: "Błąd zapisu" }); } finally { connection.end(); }
});

app.post('/admin/add-resource', async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ success: false, error: "Brak uprawnień" });
    const { targetUsername, resourceType, amount } = req.body;
    const val = parseInt(amount);
    let dbColumn = resourceType === 'coins' ? 'hellerman_coins' : resourceType;
    const valid = ['hellerman_coins', 'shard_common', 'shard_rare', 'shard_epic', 'shard_legendary', 'shard_secret'];
    if (!valid.includes(dbColumn)) return res.json({ success: false, error: "Zły zasób" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [users] = await connection.query('SELECT id FROM users WHERE username = ?', [targetUsername]);
        if (users.length === 0) return res.json({ success: false, error: "Nie znaleziono gracza" });
        await connection.query(`UPDATE users SET ${dbColumn} = ${dbColumn} + ? WHERE id = ?`, [val, users[0].id]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: "Błąd bazy" }); } finally { connection.end(); }
});

/* --- SERVER.JS: RESET LICZNIKA --- */
app.post('/admin/reset-daily', async (req, res) => {
    // Sprawdź czy to admin
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ success: false, error: "Brak uprawnień" });
    }
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Ustawiamy licznik otwartych paczek na 0 dla tego użytkownika
        await connection.query('UPDATE users SET daily_packs_opened = 0 WHERE id = ?', [req.session.userId]);
        res.json({ success: true });
    } catch (e) { 
        res.json({ success: false, error: "Błąd bazy: " + e.message }); 
    } finally { 
        connection.end(); 
    }
});

// HELP SYSTEM
app.get('/help/drop-rates', (req, res) => { res.json({ rarity: RARITY_CHANCE, numbered: NUMBERED_CHANCE }); });
app.post('/help/submit', async (req, res) => {
    const { type, nickname, email, subject, description, cardData } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        if (type === 'problem') await connection.query(`INSERT INTO reports (type, nickname, email, subject, description) VALUES (?, ?, ?, ?, ?)`, ['problem', nickname, email, subject, description]);
        else await connection.query(`INSERT INTO reports (type, nickname, description, card_name, card_stats, card_rarity, card_type, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ['suggestion', nickname, description, cardData.name, cardData.stats, cardData.rarity, cardData.type, cardData.image]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: "Błąd bazy" }); } finally { connection.end(); }
});
app.get('/admin/reports', async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ success: false, error: "Brak uprawnień" });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query('SELECT * FROM reports ORDER BY created_at DESC');
        res.json({ success: true, reports: rows });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

/* =========================================
   RYNEK (MARKETPLACE)
   ========================================= */

// 1. Pobierz oferty z rynku
/* --- POPRAWIONY RYNEK LISTA --- */
app.get('/market/list', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Pobieramy też max_supply z user_cards (dołączając tabelę, jeśli market_listings tego nie ma, 
        // ale lepiej byłoby zapisać max_supply w market_listings.
        // Zakładamy, że przy wystawianiu nie zapisywaliśmy max_supply. 
        // Pobierzemy je dynamicznie z tabeli cards poprzez logikę tieru lub...
        // Najprościej: Dodać kolumnę max_supply do market_listings w SQL, ale żeby nie robić migracji teraz:
        // Pobierzemy to z JOINa do cards (ale cards ma allowed_tiers jako string).
        // Rozwiązanie szybkie: Rynek pokazuje 1/LIMIT, gdzie LIMIT wyliczamy lub bierzemy z nowej kolumny w market_listings.
        
        // ZALECAM: Dodać kolumnę max_supply do market_listings w SQL.
        // ALTER TABLE market_listings ADD COLUMN max_supply INT DEFAULT 0;
        
        // Jeśli nie chcesz SQL, pobierzemy to "na oko", ale lepiej dodać do SQL.
        // Zakładam, że w poprzednim kroku user_cards ma max_supply. Przy wystawianiu (sell) musimy to przenieść.
        
        const sql = `
            SELECT m.*, c.name as card_name, c.rarity, c.image_url, u.username as seller_name
            FROM market_listings m
            JOIN cards c ON m.card_id = c.id
            JOIN users u ON m.seller_id = u.id
            WHERE m.quantity > 0
            ORDER BY m.created_at DESC
        `;
        const [listings] = await connection.query(sql);
        res.json({ success: true, listings: listings, currentUserId: req.session.userId });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

// 2. Wystaw przedmiot na rynek
app.post('/market/sell', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    const { cardId, isNumbered, amount, price } = req.body;
    const userId = req.session.userId;
    const qty = parseInt(amount);
    const cost = parseInt(price);

    if (qty < 1 || cost < 1) return res.json({ success: false, error: "Błędne dane" });

    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();

        // 1. Pobierz dane karty (w tym max_supply!) przed usunięciem
        // Pobieramy konkretne egzemplarze (LIMIT qty)
        const [cardsToSell] = await connection.query(
            `SELECT id, serial_number, max_supply FROM user_cards 
             WHERE user_id = ? AND card_id = ? AND is_numbered = ? 
             LIMIT ? FOR UPDATE`, 
            [userId, cardId, isNumbered, qty]
        );

        if (cardsToSell.length < qty) {
            await connection.rollback();
            return res.json({ success: false, error: "Nie masz tylu kart!" });
        }

        // 2. Przenieś każdą sztukę na rynek
        for (const card of cardsToSell) {
            // Usuń z ekwipunku
            await connection.query('DELETE FROM user_cards WHERE id = ?', [card.id]);

            // Dodaj na rynek (ZAPISUJEMY MAX_SUPPLY!)
            await connection.query(`
                INSERT INTO market_listings (seller_id, card_id, is_numbered, serial_number, max_supply, quantity, price)
                VALUES (?, ?, ?, ?, ?, 1, ?)
            `, [userId, cardId, isNumbered, card.serial_number, card.max_supply, cost]);
        }

        await connection.commit();
        res.json({ success: true });

    } catch (e) { await connection.rollback(); res.json({ success: false, error: "Błąd serwera: " + e.message }); } finally { connection.end(); }
});

// 3. Kup przedmiot z rynku
app.post('/market/buy', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    const { listingId } = req.body; // Kupujemy konkretną ofertę (sztukę)
    const buyerId = req.session.userId;

    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();

        const [listings] = await connection.query('SELECT * FROM market_listings WHERE id = ? FOR UPDATE', [listingId]);
        if (listings.length === 0) throw new Error("Oferta nieaktualna");
        const offer = listings[0];

        if (offer.seller_id === buyerId) throw new Error("Nie możesz kupić od siebie");

        const [buyers] = await connection.query('SELECT hellerman_coins FROM users WHERE id = ?', [buyerId]);
        if (buyers[0].hellerman_coins < offer.price) throw new Error("Za mało monet!");

        // Przelew
        await connection.query('UPDATE users SET hellerman_coins = hellerman_coins - ? WHERE id = ?', [offer.price, buyerId]);
        await connection.query('UPDATE users SET hellerman_coins = hellerman_coins + ? WHERE id = ?', [offer.price, offer.seller_id]);

        // Usuń z rynku
        await connection.query('DELETE FROM market_listings WHERE id = ?', [listingId]);

        // Dodaj do ekwipunku kupującego (PRZYWRACAMY MAX_SUPPLY)
        await connection.query(`
            INSERT INTO user_cards (user_id, card_id, is_numbered, serial_number, max_supply)
            VALUES (?, ?, ?, ?, ?)
        `, [buyerId, offer.card_id, offer.is_numbered, offer.serial_number, offer.max_supply]);

        await connection.commit();
        res.json({ success: true });

    } catch (e) { await connection.rollback(); res.json({ success: false, error: e.message }); } finally { connection.end(); }
});
app.post('/market/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    const { listingId } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();

        const [listings] = await connection.query('SELECT * FROM market_listings WHERE id = ? FOR UPDATE', [listingId]);
        if (listings.length === 0) throw new Error("Oferta nie istnieje");
        const item = listings[0];

        if (item.seller_id !== req.session.userId) throw new Error("To nie Twoja oferta");

        // Usuń z rynku
        await connection.query('DELETE FROM market_listings WHERE id = ?', [listingId]);

        // Oddaj do ekwipunku (PRZYWRACAMY MAX_SUPPLY)
        await connection.query(`
            INSERT INTO user_cards (user_id, card_id, is_numbered, serial_number, max_supply)
            VALUES (?, ?, ?, ?, ?)
        `, [item.seller_id, item.card_id, item.is_numbered, item.serial_number, item.max_supply]);

        await connection.commit();
        res.json({ success: true });
    } catch (e) { await connection.rollback(); res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

/* --- TO MUSI BYĆ W SERVER.JS (np. przed app.listen) --- */
app.get('/collection/data', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        // 1. Pobieramy WSZYSTKIE karty
        const [allCards] = await connection.query('SELECT * FROM cards ORDER BY id ASC');
        
        // 2. Pobieramy karty gracza
        const [userCards] = await connection.query('SELECT DISTINCT card_id FROM user_cards WHERE user_id = ?', [req.session.userId]);
        const ownedIds = userCards.map(row => row.card_id);

        res.json({ success: true, allCards: allCards, ownedIds: ownedIds });
    } catch (e) {
        console.error("Błąd kolekcji:", e);
        res.json({ success: false, error: e.message });
    } finally {
        connection.end();
    }
});

/* =========================================
   6. SYSTEM PVP (MATCHMAKING) - UPDATE
   ========================================= */

// Pomocnicza funkcja sprawdzania talii
async function hasValidDeck(userId, connection) {
    const [decks] = await connection.query('SELECT cards_json FROM decks WHERE user_id = ? AND deck_index = 1', [userId]);
    if (decks.length === 0 || !decks[0].cards_json) return false;
    
    let cards = [];
    try { cards = JSON.parse(decks[0].cards_json); } catch(e) {}
    
    // WYMAGAMY 18 KART (Zmień jeśli limit jest inny)
    return cards.length === 18; 
}

app.get('/play', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// LISTA GIER
app.get('/api/lobby/list', async (req, res) => {
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Usuń stare wiszące gry
        await connection.query("DELETE FROM active_games WHERE created_at < NOW() - INTERVAL 1 HOUR AND status = 'waiting'");

        // Pobierz gry
        const [games] = await connection.query(`
            SELECT g.id, g.room_name, g.is_ranked, g.status, g.host_id, u.username as host_name 
            FROM active_games g 
            JOIN users u ON g.host_id = u.id 
            WHERE g.status != 'finished'
            ORDER BY g.created_at DESC
        `);

        // Statystyki
        const [online] = await connection.query("SELECT COUNT(*) as c FROM users");
        const [playing] = await connection.query("SELECT COUNT(*) as c FROM active_games WHERE status = 'playing'");

        // Sprawdź czy JA jestem w jakiejś grze
        const [myGame] = await connection.query("SELECT id, status, host_id FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status != 'finished'", [req.session.userId, req.session.userId]);

        res.json({ 
            success: true, 
            games, 
            online: online[0].c, 
            playing: playing[0].c,
            myUserId: req.session.userId,
            myCurrentGame: myGame[0] || null // Zwraca info, jeśli już gdzieś jestem
        });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

// TWORZENIE GRY
app.post('/api/lobby/create', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        // 1. Sprawdź talię
        if (!(await hasValidDeck(req.session.userId, connection))) {
            return res.json({ success: false, error: "Musisz mieć pełną talię (18 kart) w slocie 1!" });
        }

        // 2. Sprawdź czy już nie gra
        const [existing] = await connection.query("SELECT id FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status != 'finished'", [req.session.userId, req.session.userId]);
        if (existing.length > 0) return res.json({ success: false, error: "Już jesteś w grze!" });

        const { roomName, isRanked } = req.body;
        await connection.query(
            "INSERT INTO active_games (host_id, room_name, is_ranked, status) VALUES (?, ?, ?, 'waiting')",
            [req.session.userId, roomName || `Stół gracza ${req.session.username}`, isRanked ? 1 : 0]
        );
        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

// DOŁĄCZANIE DO GRY
app.post('/api/lobby/join', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Zaloguj się" });
    const { gameId } = req.body;

    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.beginTransaction();

        // 1. Sprawdź talię
        if (!(await hasValidDeck(req.session.userId, connection))) {
            await connection.rollback();
            return res.json({ success: false, error: "Wymagana pełna talia (18 kart)!" });
        }

        // 2. Pobierz grę (blokujemy wiersz do edycji)
        const [game] = await connection.query("SELECT * FROM active_games WHERE id = ? FOR UPDATE", [gameId]);
        
        if (game.length === 0) throw new Error("Gra nie istnieje");
        if (game[0].status !== 'waiting') throw new Error("Gra już się zaczęła");
        if (game[0].host_id === req.session.userId) throw new Error("Nie możesz dołączyć do siebie");

        // 3. Dołącz
        await connection.query("UPDATE active_games SET guest_id = ?, status = 'playing' WHERE id = ?", [req.session.userId, gameId]);
        
        await connection.commit();
        res.json({ success: true });
    } catch (e) { 
        await connection.rollback();
        res.json({ success: false, error: e.message }); 
    } finally { connection.end(); }
});

// ANULOWANIE / OPUSZCZANIE LOBBY
app.post('/api/lobby/cancel', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Usuwamy grę tylko jeśli jesteśmy hostem i status jest waiting
        await connection.query("DELETE FROM active_games WHERE host_id = ? AND status = 'waiting'", [req.session.userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// STATUS MOJEJ GRY (POLLING)
// To najważniejszy endpoint - pyta "Czy gra się zaczęła?"
app.get('/api/lobby/my-status', async (req, res) => {
    if (!req.session.userId) return res.json({ inGame: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query(
            "SELECT * FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status = 'playing'", 
            [req.session.userId, req.session.userId]
        );
        if(rows.length > 0) {
            res.json({ inGame: true, game: rows[0] });
        } else {
            res.json({ inGame: false });
        }
    } catch(e) { res.json({ inGame: false }); } finally { connection.end(); }
});

/* =========================================
   7. ROZGRYWKA (WERSJA DEBUG - NAPRAWIONA)
   ========================================= */

app.get('/duel', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'duel.html'));
});

/* --- server.js: Poprawiona funkcja pobierania talii --- */
async function getDeckForPlayer(userId, connection) {
    try {
        const [decks] = await connection.query('SELECT cards_json FROM decks WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [userId]);
        
        if (decks.length === 0 || !decks[0].cards_json) return []; 

        let cardIds = [];
        try {
            cardIds = (typeof decks[0].cards_json === 'string') ? JSON.parse(decks[0].cards_json) : decks[0].cards_json;
        } catch(e) { return []; }

        if (!Array.isArray(cardIds) || cardIds.length === 0) return [];

        const placeholders = cardIds.map(() => '?').join(',');
        
        // DODANO: c.attribute (To naprawia "???") oraz upewniono się o c.rarity
        const sql = `
            SELECT uc.id as uid, c.name, c.image_url, c.rarity, c.attack, c.defense, c.card_type, c.level, c.attribute 
            FROM user_cards uc 
            JOIN cards c ON uc.card_id = c.id 
            WHERE uc.id IN (${placeholders})
        `;
        
        const [cardsData] = await connection.query(sql, cardIds);

        return cardsData.map(c => ({
            uid: c.uid,             
            name: c.name,
            image_url: c.image_url,
            rarity: c.rarity,       // Przekazujemy rzadkość
            attack: c.attack,
            defense: c.defense,
            level: c.level || 1,
            attribute: c.attribute || 'UNKNOWN', // Przekazujemy atrybut
            card_type: c.card_type || 'Unit',
            position: 'ATK',        
            canAttack: true         
        }));
    } catch (e) {
        console.error("Błąd getDeckForPlayer:", e);
        return [];
    }
}

// ENDPOINT: STAN GRY
app.get('/api/duel/state', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Brak sesji" });
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        console.log(`[GAME] User ${req.session.userId} pyta o stan gry...`);

        // 1. Szukamy gry
        const [games] = await connection.query(
            "SELECT * FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status != 'finished' ORDER BY id DESC LIMIT 1", 
            [req.session.userId, req.session.userId]
        );
        
        if (games.length === 0) {
            console.log(`[GAME] Nie znaleziono aktywnej gry dla User ${req.session.userId}`);
            return res.json({ success: false, error: "Brak aktywnej gry." });
        }
        
        const game = games[0];

        // 2. INICJALIZACJA (Jeśli gra jest nowa - board_state NULL)
        if (!game.board_state) {
            console.log(`[GAME] Gra ID ${game.id} jest nowa. INICJALIZACJA...`);

            const hostDeck = await getDeckForPlayer(game.host_id, connection);
            const guestDeck = await getDeckForPlayer(game.guest_id, connection);

            // Walidacja
            if (hostDeck.length < 5 || guestDeck.length < 5) {
                console.error("[GAME] BŁĄD: Jeden z graczy ma za mało kart (<5)!");
                // W ramach ratunku: nie przerywamy, gramy tym co mamy (nawet puste)
            }

            // Tasowanie
            const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
            shuffle(hostDeck);
            shuffle(guestDeck);

            // Rozdanie
            const hostHand = hostDeck.splice(0, 5);
            const guestHand = guestDeck.splice(0, 5);

            console.log(`[GAME] Rozdano: Host ma ${hostHand.length} kart, Gość ma ${guestHand.length} kart.`);

            const initialState = {
                players: {
                    [game.host_id]: { 
                        id: game.host_id, hp: 8000, hand: hostHand, deck: hostDeck, 
                        monsters: [null,null,null,null,null], spells: [null,null,null,null,null], gy: [] 
                    },
                    [game.guest_id]: { 
                        id: game.guest_id, hp: 8000, hand: guestHand, deck: guestDeck, 
                        monsters: [null,null,null,null,null], spells: [null,null,null,null,null], gy: [] 
                    }
                },
                turn: 1,
                phase: 'MAIN',
                turnPlayer: game.host_id,
                
                // NOWE POLE: Śledzenie akcji w turze
                turnData: {
                    normalSummonUsed: false
                }
            };

            await connection.query(
                "UPDATE active_games SET board_state = ?, current_turn_player_id = ? WHERE id = ?", 
                [JSON.stringify(initialState), game.host_id, game.id]
            );

            return res.json({ success: true, state: initialState, myId: req.session.userId });
        }

        // 3. GRA TRWA
        res.json({ 
            success: true, 
            state: JSON.parse(game.board_state),
            myId: req.session.userId 
        });

    } catch (e) { 
        console.error("[GAME] Błąd endpointu:", e);
        res.json({ success: false, error: e.message }); 
    } finally { connection.end(); }
});

// WYKONAJ RUCH
/* --- server.js: ULEPSZONY ACTION ENDPOINT --- */
app.post('/api/duel/action', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const { newState, nextTurnPlayerId } = req.body;

    const connection = await mysql.createConnection(dbConfig);
    try {
        const [games] = await connection.query(
            "SELECT * FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status = 'playing' ORDER BY id DESC LIMIT 1",
            [req.session.userId, req.session.userId]
        );
        if (games.length === 0) return res.json({ success: false });
        const game = games[0];

        // Przygotuj stan do zapisu
        let stateToSave = newState;

        // --- LOGIKA ZMIANY TURY (DRAW PHASE) ---
        if (nextTurnPlayerId) {
            // Parsujemy stan, żeby wykonać operacje na serwerze
            // (W prawdziwej produkcji state powinien byc tylko na serwerze, tu robimy hybrydę)
            // Ale my ufamy clientowi co do stanu planszy, dodajemy tylko draw.
            
            // Logika: Jeśli tura przechodzi do gracza X, dobierz mu kartę
            const nextPid = nextTurnPlayerId;
            const playerObj = stateToSave.players[nextPid];
            
            if (playerObj.deck.length > 0) {
                // Dobierz kartę (Draw)
                const card = playerObj.deck.shift(); // Usuń z góry talii
                playerObj.hand.push(card);           // Dodaj do ręki
                console.log(`[GAME] Gracz ${nextPid} dobrał kartę: ${card.name}`);
            } else {
                // Opcjonalnie: Przegrana przez brak kart (Deckout)
                console.log(`[GAME] Gracz ${nextPid} nie ma kart w talii!`);
            }
            
            // Ustaw fazę na MAIN 1 dla nowego gracza
            stateToSave.phase = 'MAIN 1';
            stateToSave.turnData = { normalSummonUsed: false, attacksDeclared: [] };
        }

        let sql = "UPDATE active_games SET board_state = ?";
        const params = [JSON.stringify(stateToSave)];

        if (nextTurnPlayerId) {
            sql += ", current_turn_player_id = ?";
            params.push(nextTurnPlayerId);
        }
        sql += " WHERE id = ?";
        params.push(game.id);

        await connection.query(sql, params);
        res.json({ success: true });
    } catch (e) { 
        console.error(e);
        res.json({ success: false }); 
    } finally { connection.end(); }
});

// PODDAJ SIĘ
app.post('/api/duel/surrender', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [games] = await connection.query("SELECT * FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status='playing' ORDER BY id DESC LIMIT 1", [req.session.userId, req.session.userId]);
        if(games.length === 0) return res.json({ success: false });
        
        const game = games[0];
        const winnerId = (game.host_id === req.session.userId) ? game.guest_id : game.host_id;

        await connection.query("UPDATE active_games SET status='finished', winner_id=? WHERE id=?", [winnerId, game.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// POLLING
app.get('/api/duel/poll', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [games] = await connection.query(
            "SELECT * FROM active_games WHERE (host_id = ? OR guest_id = ?) AND status != 'waiting' ORDER BY id DESC LIMIT 1", 
            [req.session.userId, req.session.userId]
        );
        
        if (games.length === 0) return res.json({ success: false, gameEnded: true }); 
        const game = games[0];

        if (game.status === 'finished') {
            const result = (game.winner_id === req.session.userId) ? 'win' : (game.winner_id === null ? 'draw' : 'loss');
            return res.json({ success: true, gameEnded: true, result: result });
        }
        
        let drawOffer = false;
        if (game.draw_offered_by && game.draw_offered_by !== req.session.userId) drawOffer = true;

        res.json({ success: true, gameEnded: false, drawOffer: drawOffer });
    } catch (e) { res.json({ success: false }); } finally { connection.end(); }
});

// REMIS (OFFER)
app.post('/api/duel/draw/offer', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Dodano LIMIT 1 dla bezpieczeństwa
        await connection.query("UPDATE active_games SET draw_offered_by=? WHERE (host_id=? OR guest_id=?) AND status='playing' ORDER BY id DESC LIMIT 1", [req.session.userId, req.session.userId, req.session.userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// REMIS (RESPOND)
app.post('/api/duel/draw/respond', async (req, res) => {
    const { accept } = req.body;
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        if (accept) {
            await connection.query("UPDATE active_games SET status='finished', winner_id=NULL WHERE (host_id=? OR guest_id=?) AND status='playing' ORDER BY id DESC LIMIT 1", [req.session.userId, req.session.userId]);
        } else {
            await connection.query("UPDATE active_games SET draw_offered_by=NULL WHERE (host_id=? OR guest_id=?) AND status='playing' ORDER BY id DESC LIMIT 1", [req.session.userId, req.session.userId]);
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});


/* --- NAPRAWIONY ENDPOINT: Statystyki dostępności kart --- */
app.get('/card-stats', async (req, res) => {
    // Sprawdzamy czy użytkownik zalogowany
    if (!req.session.userId) return res.json({ success: false });
    
    const cardId = req.query.cardId;
    if (!cardId) return res.json({ success: false });

    // Tworzymy połączenie (tak jak w reszcie Twojego kodu)
    const connection = await mysql.createConnection(dbConfig);

    try {
        // 1. Pobierz definicję karty (allowed_tiers)
        const [cardRows] = await connection.query('SELECT allowed_tiers FROM cards WHERE id = ?', [cardId]);
        
        if (cardRows.length === 0) return res.json({ success: false });
        
        const tiersStr = cardRows[0].allowed_tiers;
        if (!tiersStr) return res.json({ success: true, stats: {} });

        const tiers = tiersStr.split(',').map(t => parseInt(t.trim()));
        const stats = {};

        // 2. Policz ile kart już wypadło
        for (const tier of tiers) {
            const [countRows] = await connection.query(
                'SELECT COUNT(*) as count FROM user_cards WHERE card_id = ? AND max_supply = ?', 
                [cardId, tier]
            );
            const droppedCount = countRows[0].count;
            
            // Oblicz ile zostało (Max - Wydropione)
            let remaining = tier - droppedCount;
            if (remaining < 0) remaining = 0;

            stats[tier] = remaining;
        }

        res.json({ success: true, stats: stats });

    } catch (e) {
        console.error("Błąd stats:", e);
        res.json({ success: false });
    } finally {
        connection.end(); // Bardzo ważne: zamknij połączenie!
    }
});

/* --- ADMIN: ZARZĄDZANIE UŻYTKOWNIKAMI --- */

// Pobierz listę niezatwierdzonych
app.get('/admin/pending-users', async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Pobieramy ID, Nick, Datę i IP (jeśli dodałeś kolumnę IP wcześniej, jak nie to usuń registration_ip z zapytania)
        const [rows] = await connection.query('SELECT id, username, created_at FROM users WHERE is_approved = 0');
        res.json({ success: true, users: rows });
    } catch (e) { res.json({ success: false, error: e.message }); } finally { connection.end(); }
});

// Zatwierdź gracza
app.post('/admin/approve-user', async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ success: false });
    const { targetId } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.query('UPDATE users SET is_approved = 1 WHERE id = ?', [targetId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); } finally { connection.end(); }
});

// Odrzuć (Usuń) gracza
app.post('/admin/reject-user', async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ success: false });
    const { targetId } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.query('DELETE FROM users WHERE id = ?', [targetId]);
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); } finally { connection.end(); }
});

/* =========================================
   7. SYSTEM ZNAJOMYCH I PRYWATNOŚCI (NAPRAWIONY)
   ========================================= */

// 1. Pobierz listę znajomych i zaproszeń
app.get('/api/friends/list', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const me = req.session.userId;
    
    // Używamy dbConfig zamiast pool, żeby zachować spójność z resztą Twojego pliku
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Zaproszenia otrzymane
        const [requests] = await connection.query(`
            SELECT f.id, u.username, u.id as user_id 
            FROM friendships f 
            JOIN users u ON f.user_id_1 = u.id 
            WHERE f.user_id_2 = ? AND f.status = 'pending'
        `, [me]);

        // Znajomi (z zaakceptowanym statusem)
        // Skomplikowane zapytanie, bo znajomy może być w kolumnie user_1 LUB user_2
        const [friends] = await connection.query(`
            SELECT u.id, u.username 
            FROM friendships f
            JOIN users u ON (CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END) = u.id
            WHERE (f.user_id_1 = ? OR f.user_id_2 = ?) AND f.status = 'accepted'
        `, [me, me, me]);

        res.json({ success: true, requests, friends });
    } catch (e) { 
        console.error("Błąd friends list:", e);
        res.json({ success: false, error: e.message }); 
    } finally { connection.end(); }
});

// 2. Szukaj graczy (lub pokaż listę wszystkich)
app.get('/api/friends/search', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const me = req.session.userId;
    const query = req.query.q || ''; // Jeśli puste, szukaj wszystkich
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        let users;
        if (query.length > 0) {
            // Szukaj po nicku
            const [rows] = await connection.query(`
                SELECT id, username FROM users 
                WHERE username LIKE ? AND id != ? LIMIT 20
            `, [`%${query}%`, me]);
            users = rows;
        } else {
            // Pokaż ostatnich 20 graczy (jeśli nic nie wpisano)
            const [rows] = await connection.query(`
                SELECT id, username FROM users 
                WHERE id != ? ORDER BY created_at DESC LIMIT 20
            `, [me]);
            users = rows;
        }

        const results = [];
        for(let u of users) {
            // Sprawdź czy już jest jakaś relacja
            const [rel] = await connection.query(`
                SELECT * FROM friendships 
                WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)
            `, [me, u.id, u.id, me]);
            
            let statusObj = { id: u.id, username: u.username, is_friend: false, request_sent: false, request_received: false };
            
            if(rel.length > 0) {
                const r = rel[0];
                if(r.status === 'accepted') statusObj.is_friend = true;
                else if(r.user_id_1 === me) statusObj.request_sent = true;
                else statusObj.request_received = true; // To znaczy, że on zaprosił mnie
            }
            results.push(statusObj);
        }
        res.json({ success: true, users: results });
    } catch (e) { 
        console.error("Błąd search:", e);
        res.json({ success: false, error: "Błąd bazy danych" }); 
    } finally { connection.end(); }
});

// 3. Wyślij zaproszenie
app.post('/api/friends/request', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const me = req.session.userId;
    const { targetId } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        // Sprawdź czy już nie ma relacji
        const [exists] = await connection.query(`SELECT id FROM friendships WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)`, [me, targetId, targetId, me]);
        if(exists.length === 0) {
            await connection.query(`INSERT INTO friendships (user_id_1, user_id_2, status) VALUES (?, ?, 'pending')`, [me, targetId]);
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// 4. Odpowiedz na zaproszenie
app.post('/api/friends/respond', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const { friendshipId, accept } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        if(accept) {
            await connection.query(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [friendshipId]);
        } else {
            await connection.query(`DELETE FROM friendships WHERE id = ?`, [friendshipId]);
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// 5. Usuń znajomego
app.post('/api/friends/remove', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const me = req.session.userId;
    const { targetId } = req.body;
    
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.query(`DELETE FROM friendships WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)`, [me, targetId, targetId, me]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// 6. Zarządzanie Prywatnością (Get/Set)
app.get('/api/user/privacy', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query('SELECT public_inventory, public_collection, public_decks FROM users WHERE id = ?', [req.session.userId]);
        res.json({ success: true, settings: rows[0] });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

app.post('/api/user/privacy', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const { public_inventory, public_collection, public_decks } = req.body;
    const connection = await mysql.createConnection(dbConfig);
    try {
        await connection.query('UPDATE users SET public_inventory=?, public_collection=?, public_decks=? WHERE id=?', [public_inventory, public_collection, public_decks, req.session.userId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// 7. PODGLĄD DANYCH ZNAJOMEGO
// 7. PODGLĄD DANYCH ZNAJOMEGO (NAPRAWIONY ID)
app.get('/api/friends/view/:friendId/:type', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    const me = req.session.userId;
    const friendId = req.params.friendId;
    const type = req.params.type; 

    const connection = await mysql.createConnection(dbConfig);
    try {
        // A. Sprawdź czy to znajomy
        const [check] = await connection.query(`
            SELECT status FROM friendships 
            WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?))
            AND status = 'accepted'
        `, [me, friendId, friendId, me]);

        if(check.length === 0) return res.json({ success: false, error: "To nie jest Twój znajomy!" });

        // B. Sprawdź prywatność
        const [settings] = await connection.query('SELECT public_inventory, public_collection, public_decks FROM users WHERE id = ?', [friendId]);
        const s = settings[0];

        if (type === 'inventory' && !s.public_inventory) return res.json({ success: false, error: "Ekwipunek ukryty." });
        if (type === 'collection' && !s.public_collection) return res.json({ success: false, error: "Kolekcja ukryta." });
        if (type === 'deck' && !s.public_decks) return res.json({ success: false, error: "Talie ukryte." });

        // C. Pobierz dane
        let items = [];

        if (type === 'inventory') {
            // TU BYŁ BŁĄD: Dodano c.id as card_id
            const sql = `
                SELECT c.id as card_id, c.name, c.image_url, c.rarity, c.description, c.allowed_tiers, uc.is_numbered, uc.serial_number, COUNT(*) as quantity 
                FROM user_cards uc 
                JOIN cards c ON uc.card_id = c.id 
                WHERE uc.user_id = ?
                GROUP BY uc.card_id, uc.is_numbered, uc.serial_number, c.id, c.name, c.image_url, c.rarity, c.description, c.allowed_tiers
                ORDER BY c.rarity DESC
            `;
            const [rows] = await connection.query(sql, [friendId]);
            items = rows;
        } 
        else if (type === 'collection') {
            // TU TEŻ: Dodano c.id as card_id
            const sql = `
                SELECT DISTINCT c.id as card_id, c.name, c.image_url, c.rarity, c.description, c.allowed_tiers, 0 as is_numbered, 1 as quantity
                FROM user_cards uc 
                JOIN cards c ON uc.card_id = c.id 
                WHERE uc.user_id = ? 
                GROUP BY c.id, c.name, c.image_url, c.rarity, c.description, c.allowed_tiers
                ORDER BY c.id ASC
            `;
            const [rows] = await connection.query(sql, [friendId]);
            items = rows;
        }
        else if (type === 'deck') {
            // Deck
            const [decks] = await connection.query('SELECT cards_json FROM decks WHERE user_id = ? AND deck_index = 1', [friendId]);
            if (decks.length > 0 && decks[0].cards_json) {
                let cardIds = [];
                try { cardIds = JSON.parse(decks[0].cards_json); } catch(e) {}
                if (cardIds.length > 0) {
                    const placeholders = cardIds.map(() => '?').join(',');
                    // TU TEŻ: Dodano c.id as card_id
                    const sql = `
                        SELECT c.id as card_id, c.name, c.image_url, c.rarity, c.description, c.allowed_tiers, uc.is_numbered, uc.serial_number, 1 as quantity
                        FROM user_cards uc
                        JOIN cards c ON uc.card_id = c.id
                        WHERE uc.id IN (${placeholders})
                    `;
                    const [cards] = await connection.query(sql, cardIds);
                    items = cards;
                }
            }
        }

        res.json({ success: true, items });

    } catch(e) { 
        console.error(e);
        res.json({ success: false, error: "Błąd serwera" }); 
    } finally { connection.end(); }
});
/* --- ZMIANA NA DOLE PLIKU server.js --- */

// Render (i inne chmury) podają port w zmiennej process.env.PORT
const PORT = process.env.PORT || 3000; 

/* =========================================
   8. SYSTEM KASYNA (RULETKA - OPTIMIZED & HISTORY)
   ========================================= */

let rouletteState = {
    status: 'betting', 
    timeLeft: 20,      
    lastResult: 0,     
    history: []        
};

let activeBets = {}; 
let lastActivity = Date.now(); // Czas ostatniej interakcji gracza

// Pomocnicze: Sprawdź wygraną
function checkWin(bet, resultNum) {
    if (bet.type === 'number' && parseInt(bet.value) === resultNum) return bet.amount * 36;
    
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const isRed = reds.includes(resultNum);
    const isBlack = !isRed && resultNum !== 0; 
    const isEven = (resultNum !== 0 && resultNum % 2 === 0);
    const isOdd = (resultNum !== 0 && resultNum % 2 !== 0);

    if (bet.type === 'color') {
        if (bet.value === 'red' && isRed) return bet.amount * 2;
        if (bet.value === 'black' && isBlack) return bet.amount * 2;
    }
    if (bet.type === 'parity') {
        if (bet.value === 'even' && isEven) return bet.amount * 2;
        if (bet.value === 'odd' && isOdd) return bet.amount * 2;
    }
    return 0;
}

// Rozliczanie i Zapis Historii
async function processPayouts(winningNumber) {
    console.log(`[KASYNO] Wynik: ${winningNumber}. Rozliczam...`);
    const connection = await mysql.createConnection(dbConfig);
    
    // Ustalanie koloru wyniku dla zapisu tekstowego
    const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const resColor = winningNumber === 0 ? 'Zielone' : (reds.includes(winningNumber) ? 'Czerwone' : 'Czarne');
    const resultStr = `${winningNumber} (${resColor})`;

    try {
        for (const [userId, bets] of Object.entries(activeBets)) {
            let totalWin = 0;
            let totalBet = 0;
            let betSummary = [];

            // Oblicz wygrane i przygotuj opis
            for (const bet of bets) {
                const win = checkWin(bet, winningNumber);
                totalWin += win;
                totalBet += bet.amount;
                
                // Formatowanie opisu: "Liczba 5 (100)" lub "Czerwone (50)"
                let typeName = bet.type === 'number' ? `Liczba ${bet.value}` : 
                               (bet.value === 'red' ? 'Czerwone' : 
                               (bet.value === 'black' ? 'Czarne' : 
                               (bet.value === 'even' ? 'Parzyste' : 'Nieparz.')));
                betSummary.push(`${typeName} [${bet.amount}]`);
            }

            // Wypłata
            if (totalWin > 0) {
                await connection.query('UPDATE users SET hellerman_coins = hellerman_coins + ? WHERE id = ?', [totalWin, userId]);
            }

            // Zapisz do historii
            const summaryStr = betSummary.join(', ');
            await connection.query(
                `INSERT INTO casino_history (user_id, bet_summary, result_info, total_bet, total_win) VALUES (?, ?, ?, ?, ?)`,
                [userId, summaryStr, resultStr, totalBet, totalWin]
            );
        }
    } catch(e) { console.error("Błąd kasyna:", e); } 
    finally { 
        connection.end(); 
        activeBets = {}; 
    }
}

// GŁÓWNA PĘTLA GRY (Z OPTYMALIZACJĄ)
setInterval(() => {
    // 1. Sprawdź czy ktoś gra
    const now = Date.now();
    const hasActiveBets = Object.keys(activeBets).length > 0;
    const isInactive = (now - lastActivity > 15000); // 15 sekund bez aktywności

    // Jeśli nikt nie gra I nie ma zakładów na stole -> STOP (nie odejmuj czasu)
    if (isInactive && !hasActiveBets && rouletteState.status === 'betting') {
        return; 
    }

    // 2. Standardowe odliczanie
    rouletteState.timeLeft--;

    if (rouletteState.timeLeft <= 0) {
        if (rouletteState.status === 'betting') {
            rouletteState.status = 'spinning';
            rouletteState.timeLeft = 10;
            
            const winNum = Math.floor(Math.random() * 37);
            rouletteState.lastResult = winNum;
            rouletteState.history.unshift(winNum);
            if(rouletteState.history.length > 8) rouletteState.history.pop();

            processPayouts(winNum);
            
        } else {
            console.log("[KASYNO] Nowa runda. Czas na zakłady.");
            rouletteState.status = 'betting';
            
            rouletteState.timeLeft = 15; 
            
            activeBets = {};
        }
    }
}, 1000);

// API: Stan gry (Aktualizuje aktywność!)
app.get('/api/casino/roulette/state', (req, res) => {
    lastActivity = Date.now(); // Ktoś pobrał stan -> gra jest aktywna
    res.json(rouletteState);
});

// API: Historia gracza
app.get('/api/casino/history', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.query(
            `SELECT * FROM casino_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 15`, 
            [req.session.userId]
        );
        res.json({ success: true, history: rows });
    } catch(e) { res.json({ success: false }); } finally { connection.end(); }
});

// API: Zakład (Aktualizuje aktywność!)
app.post('/api/casino/roulette/bet', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    lastActivity = Date.now(); // Aktywność!

    const { bets } = req.body; 
    if (rouletteState.status !== 'betting') return res.json({ success: false, error: "Zakłady zamknięte!" });
    if (!bets || bets.length === 0) return res.json({ success: false, error: "Pusty zakład" });

    const connection = await mysql.createConnection(dbConfig);
    try {
        let totalCost = 0;
        bets.forEach(b => totalCost += b.amount);

        const [user] = await connection.query('SELECT hellerman_coins FROM users WHERE id = ?', [req.session.userId]);
        if (!user[0] || user[0].hellerman_coins < totalCost) return res.json({ success: false, error: "Brak środków!" });

        await connection.query('UPDATE users SET hellerman_coins = hellerman_coins - ? WHERE id = ?', [totalCost, req.session.userId]);

        if (!activeBets[req.session.userId]) activeBets[req.session.userId] = [];
        activeBets[req.session.userId].push(...bets);

        res.json({ success: true });
    } catch (e) { res.json({ success: false, error: "Błąd bazy" }); } finally { connection.end(); }
});
/* =========================================
   9. SYSTEM DZIENNYCH NAGRÓD (DAILY LOGIN)
   ========================================= */

// KONFIGURACJA NAGRÓD (Dzień 1-14)
const DAILY_REWARDS = {
    1:  { type: 'coins', val: 50,  desc: "50 HC" },
    2:  { type: 'coins', val: 100, desc: "100 HC" },
    3:  { type: 'card',  val: 6,   desc: "Karta: Cichy Karzeł" }, // ID 6 (Common)
    4:  { type: 'coins', val: 150, desc: "150 HC" },
    5:  { type: 'pack',  val: 1,   desc: "1x Karzeł Pack" },
    6:  { type: 'coins', val: 200, desc: "200 HC" },
    7:  { type: 'card',  val: 5,   desc: "Karta: Karzeł Kowboj (Rare)" }, // ID 5 (Rare)
    8:  { type: 'coins', val: 100, desc: "100 HC" },
    9:  { type: 'coins', val: 250, desc: "250 HC" },
    10: { type: 'pack',  val: 1,   desc: "1x Karzeł Pack" },
    11: { type: 'coins', val: 300, desc: "300 HC" },
    12: { type: 'card',  val: 7,   desc: "Karta: Policjant (Epic)" }, // ID 7 (Epic)
    13: { type: 'coins', val: 500, desc: "500 HC" },
    14: { type: 'coins', val: 1000, desc: "JACKPOT: 1000 HC" }
};
/* --- server.js : POPRAWIONY ENDPOINT DATY --- */

app.get('/api/daily-rewards', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false });
    const connection = await mysql.createConnection(dbConfig);
    try {
        // ZAPYTANIE SQL:
        // days_since_last -> ile dni minęło od ostatniego kliknięcia (do resetu serii)
        // is_today -> czy ostatnie kliknięcie było DZISIAJ (1 = tak, 0 = nie)
        const [rows] = await connection.query(
            `SELECT daily_login_day, last_daily_claim, 
             DATEDIFF(CURDATE(), DATE(last_daily_claim)) as days_since_last,
             (DATE(last_daily_claim) = CURDATE()) as is_today
             FROM users WHERE id = ?`, 
            [req.session.userId]
        );
        let user = rows[0];
        
        // 1. Logika resetu serii (jeśli minęło więcej niż 1 dzień, a nie jest to pierwsze wejście)
        // Sprawdzamy czy last_daily_claim nie jest nullem
        if (user.last_daily_claim && user.days_since_last > 1) {
            console.log(`[DAILY] Reset serii dla ${req.session.userId}`);
            await connection.query('UPDATE users SET daily_login_day = 1 WHERE id = ?', [req.session.userId]);
            user.daily_login_day = 1;
        }

        // 2. Czy można odebrać?
        // Można, jeśli ostatnie odbieranie NIE było dzisiaj (is_today === 0)
        // Jeśli last_daily_claim jest NULL (nowe konto), to is_today będzie 0/null -> czyli można.
        const claimedToday = (user.is_today === 1);
        const canClaim = !claimedToday;
        
        res.json({ 
            success: true, 
            day: user.daily_login_day, 
            canClaim: canClaim,
            rewards: DAILY_REWARDS 
        });
    } catch(e) { 
        console.error(e);
        res.json({ success: false }); 
    } finally { 
        connection.end(); 
    }
});

// API: Odbierz nagrodę
app.post('/api/daily-rewards/claim', async (req, res) => {
    if (!req.session.userId) return res.json({ success: false, error: "Zaloguj się" });
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        // 1. Sprawdź czy można odebrać
        const [rows] = await connection.query(
            'SELECT daily_login_day, last_daily_claim, CURDATE() as today FROM users WHERE id = ?', 
            [req.session.userId]
        );
        const user = rows[0];
        const lastClaim = user.last_daily_claim ? new Date(user.last_daily_claim).toISOString().split('T')[0] : null;
        const today = new Date(user.today).toISOString().split('T')[0];

        if (lastClaim === today) {
            return res.json({ success: false, error: "Wróć jutro!" });
        }

        // 2. Pobierz nagrodę dla aktualnego dnia
        let currentDay = user.daily_login_day;
        if (currentDay > 14) currentDay = 1; // Reset pętli po 14 dniach (zabezpieczenie)
        
        const reward = DAILY_REWARDS[currentDay];
        if (!reward) return res.json({ success: false, error: "Błąd nagrody" });

        // 3. Przyznaj nagrodę
        let msg = "";
        if (reward.type === 'coins') {
            await connection.query('UPDATE users SET hellerman_coins = hellerman_coins + ? WHERE id = ?', [reward.val, req.session.userId]);
            msg = `Otrzymano ${reward.val} HC!`;
        } 
        else if (reward.type === 'pack') {
            await connection.query('UPDATE users SET pack_karzel_count = pack_karzel_count + ? WHERE id = ?', [reward.val, req.session.userId]);
            msg = `Otrzymano ${reward.val}x Karzeł Pack!`;
        }
        else if (reward.type === 'card') {
            // Dodaj kartę do ekwipunku
            await connection.query(
                'INSERT INTO user_cards (user_id, card_id, is_numbered, obtained_at) VALUES (?, ?, 0, NOW())', 
                [req.session.userId, reward.val]
            );
            msg = `Otrzymano nową kartę!`;
        }

        // 4. Zaktualizuj licznik dnia i datę
        // Jeśli to był 14 dzień, resetujemy na 1, w przeciwnym razie +1
        const nextDay = currentDay >= 14 ? 1 : currentDay + 1;
        
        await connection.query(
            'UPDATE users SET last_daily_claim = NOW(), daily_login_day = ? WHERE id = ?', 
            [nextDay, req.session.userId]
        );

        res.json({ success: true, message: msg, newDay: nextDay });

    } catch(e) { 
        console.error(e);
        res.json({ success: false, error: "Błąd serwera" }); 
    } finally { 
        connection.end(); 
    }
});

app.listen(PORT, () => { 
    console.log(`Serwer działa na porcie ${PORT}`); 
});