/* --- script-helper.js --- */

let globalTies = []; // Potrzebne, żeby modal widział co edytuje
let globalMachines = [];
let globalMachineProducts = [];
let calcItemsMap = {}; 
let currentCalcMode = 'simple';

// ==========================================
// 1. TABS & AUTO-CALC
// ==========================================
window.switchHelperTab = function(tabName) {
    document.getElementById('view-pakowanie').style.display = 'none';
    document.getElementById('view-maszyny').style.display = 'none';
    document.getElementById('view-kalkulator').style.display = 'none';
    document.getElementById('tab-btn-pakowanie').classList.remove('active');
    document.getElementById('tab-btn-maszyny').classList.remove('active');
    document.getElementById('tab-btn-kalkulator').classList.remove('active');

    if (tabName === 'pakowanie') {
        document.getElementById('view-pakowanie').style.display = 'block';
        document.getElementById('tab-btn-pakowanie').classList.add('active');
    } else if (tabName === 'maszyny') {
        document.getElementById('view-maszyny').style.display = 'block';
        document.getElementById('tab-btn-maszyny').classList.add('active');
        loadMachinesData();
    } else if (tabName === 'kalkulator') {
        document.getElementById('view-kalkulator').style.display = 'block';
        document.getElementById('tab-btn-kalkulator').classList.add('active');
        loadCalculatorData();
    }
}

window.calcPallet = function(prefix, changedField) {
    const sztKartonInput = document.getElementById(`${prefix}-karton`);
    const sztPaletaInput = document.getElementById(`${prefix}-paleta-szt`);
    const kartonyPaletaInput = document.getElementById(`${prefix}-paleta-kartony`);

    const sztKarton = parseInt(sztKartonInput.value) || 0;
    if (sztKarton <= 0) return;

    if (changedField === 'kartony' || changedField === 'karton') {
        const kartony = parseInt(kartonyPaletaInput.value) || 0;
        sztPaletaInput.value = kartony * sztKarton;
    } else if (changedField === 'szt') {
        const sztPaleta = parseInt(sztPaletaInput.value) || 0;
        kartonyPaletaInput.value = Math.floor(sztPaleta / sztKarton);
    }
};

// ==========================================
// 2. TRYTYTKI (DODAJ/EDYTUJ/USUŃ)
// ==========================================
window.submitTie = async function() {
    const data = {
        oznaczenie: document.getElementById('t-oznaczenie').value, numer_detalu: document.getElementById('t-detal').value,
        szt_w_worku: document.getElementById('t-worek').value, szt_w_kartonie: document.getElementById('t-karton').value,
        szt_na_palecie: document.getElementById('t-paleta-szt').value, kartony_na_palecie: document.getElementById('t-paleta-kartony').value,
        norma: document.getElementById('t-norma').value, trudnosc: document.getElementById('t-trudnosc').value,
        dopisek: document.getElementById('t-dopisek').value, uwaga: document.getElementById('t-uwaga').value,
        woda: document.getElementById('t-woda').value, probka: document.getElementById('t-probka').value,
        ozn_worka: document.getElementById('t-ozn-worek').value, ozn_kartonu: document.getElementById('t-ozn-karton').value
    };

    if (!data.oznaczenie || !data.numer_detalu) return alert("Wypełnij Oznaczenie i Numer Detalu!");

    try {
        const res = await fetch('/api/helper/add-tie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await res.json();
        if (result.success) { alert("Dodano Trytytkę!"); loadTies(); } else alert(result.error);
    } catch(e) { alert("Błąd połączenia z serwerem."); }
}

window.loadTies = async function() {
    const tbody = document.getElementById('ties-table-body');
    try {
        const res = await fetch('/api/helper/ties');
        const data = await res.json();
        if (data.success) {
            globalTies = data.ties; // Przypisujemy do globalnej, żeby edycja miała skąd brać dane
            tbody.innerHTML = '';
            if (globalTies.length === 0) return tbody.innerHTML = '<tr><td colspan="7">Brak danych.</td></tr>';

            globalTies.forEach(t => {
                let pakowanie = `W: ${t.sztuki_w_worku > 0 ? t.sztuki_w_worku : 'Brak'} <span style="color:#aaa">(${t.oznaczenie_worka||'-'})</span><br>
                                 K: ${t.sztuki_w_kartonie} <span style="color:#aaa">(${t.oznaczenie_kartonu||'-'})</span><br>
                                 P: ${t.sztuki_na_palecie} <span style="color:#888">(${t.kartony_na_palecie} k.)</span>`;
                
                let parametry = `💧 Woda: <span style="color:#3498db">${t.woda_ml > 0 ? t.woda_ml+' ml' : 'Brak'}</span><br>
                                 ⚖️ Próbka: <span style="color:#f1c40f">${t.probka > 0 ? t.probka+' szt' : 'Brak'}</span>`;
                
                let diffClass = t.trudnosc_poziom === '💀' ? 'diff-skull' : '';
                let uwagaHtml = `<span class="${diffClass}">${t.trudnosc_poziom}</span><br>
                                 <span style="font-size:11px; color:#aaa;">${t.trudnosc_dopisek||''}</span>`;
                if (t.uwaga) uwagaHtml += `<br><span style="color:#888; font-style:italic;">"${t.uwaga}"</span>`;

                tbody.innerHTML += `<tr>
                    <td style="color:#f1c40f; font-weight:bold;">${t.oznaczenie}</td><td>${t.numer_detalu}</td>
                    <td style="font-size: 12px; line-height: 1.4; text-align:left;">${pakowanie}</td>
                    <td style="font-size: 12px; line-height: 1.4; text-align:left;">${parametry}</td>
                    <td style="color:#2ecc71; font-weight:bold;">${t.norma_h_osoba}</td>
                    <td style="font-size: 12px; text-align:left;">${uwagaHtml}</td>
                    <td style="width: 80px;">
                        <button class="action-btn gold" style="padding: 5px; font-size: 12px; min-width: 30px;" onclick="openEditTie(${t.id})">✏️</button>
                        <button class="action-btn red" style="padding: 5px; font-size: 12px; min-width: 30px;" onclick="deleteTie(${t.id})">🗑️</button>
                    </td>
                </tr>`;
            });
        }
    } catch(e) { tbody.innerHTML = '<tr><td colspan="7" style="color:red;">Błąd ładowania</td></tr>'; }
}

window.deleteTie = async function(id) {
    if(!confirm("⚠️ Czy na pewno chcesz usunąć tę pozycję z bazy? Tej operacji nie można cofnąć!")) return;
    try {
        const res = await fetch(`/api/helper/ties/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) { alert("Pomyślnie usunięto!"); loadTies(); }
        else alert(result.error);
    } catch(e) { alert("Błąd połączenia"); }
}

window.openEditTie = function(id) {
    const tie = globalTies.find(t => t.id === id);
    if(!tie) return;

    document.getElementById('e-t-id').value = tie.id;
    document.getElementById('e-t-oznaczenie').value = tie.oznaczenie;
    document.getElementById('e-t-detal').value = tie.numer_detalu;
    document.getElementById('e-t-worek').value = tie.sztuki_w_worku;
    document.getElementById('e-t-karton').value = tie.sztuki_w_kartonie;
    document.getElementById('e-t-paleta-szt').value = tie.sztuki_na_palecie;
    document.getElementById('e-t-paleta-kartony').value = tie.kartony_na_palecie;
    document.getElementById('e-t-woda').value = tie.woda_ml;
    document.getElementById('e-t-probka').value = tie.probka;
    document.getElementById('e-t-ozn-worek').value = tie.oznaczenie_worka;
    document.getElementById('e-t-ozn-karton').value = tie.oznaczenie_kartonu;
    document.getElementById('e-t-norma').value = tie.norma_h_osoba;
    document.getElementById('e-t-trudnosc').value = tie.trudnosc_poziom;
    document.getElementById('e-t-dopisek').value = tie.trudnosc_dopisek;
    document.getElementById('e-t-uwaga').value = tie.uwaga;

    document.getElementById('edit-tie-modal').style.display = 'flex';
}

window.submitEditTie = async function() {
    const id = document.getElementById('e-t-id').value;
    const data = {
        oznaczenie: document.getElementById('e-t-oznaczenie').value, numer_detalu: document.getElementById('e-t-detal').value,
        szt_w_worku: document.getElementById('e-t-worek').value, szt_w_kartonie: document.getElementById('e-t-karton').value,
        szt_na_palecie: document.getElementById('e-t-paleta-szt').value, kartony_na_palecie: document.getElementById('e-t-paleta-kartony').value,
        norma: document.getElementById('e-t-norma').value, trudnosc: document.getElementById('e-t-trudnosc').value,
        dopisek: document.getElementById('e-t-dopisek').value, uwaga: document.getElementById('e-t-uwaga').value,
        woda: document.getElementById('e-t-woda').value, probka: document.getElementById('e-t-probka').value,
        ozn_worka: document.getElementById('e-t-ozn-worek').value, ozn_kartonu: document.getElementById('e-t-ozn-karton').value
    };

    try {
        const res = await fetch(`/api/helper/ties/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await res.json();
        if (result.success) {
            alert("Pomyślnie zaktualizowano!");
            document.getElementById('edit-tie-modal').style.display = 'none';
            loadTies();
        } else alert(result.error);
    } catch(e) { alert("Błąd połączenia z serwerem."); }
}

// ==========================================
// 3. MASZYNY (Bez zmian w logice)
// ==========================================
window.loadMachinesData = async function() {
    try {
        const res = await fetch('/api/helper/machines');
        const data = await res.json();
        if(data.success) {
            globalMachines = data.machines;
            globalMachineProducts = data.products;
            const select = document.getElementById('machine-select');
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Wybierz maszynę --</option>';
            globalMachines.forEach(m => { select.innerHTML += `<option value="${m.id}">${m.oznaczenie_maszyny}</option>`; });
            if(currentVal) select.value = currentVal;
            renderMachineProducts();
        }
    } catch(e) { console.error("Błąd ładowania maszyn"); }
}

window.promptAddMachine = async function() {
    const name = prompt("Podaj oznaczenie nowej maszyny (np. F4):");
    if(!name || name.trim() === '') return;
    try {
        const res = await fetch('/api/helper/add-machine', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name: name.trim() }) });
        if (!res.ok) return alert(`Błąd serwera. Włącz i wyłącz server.js.`);
        const data = await res.json();
        if(data.success) { alert(`Maszyna ${name.toUpperCase()} dodana!`); loadMachinesData(); } 
        else alert(data.error);
    } catch(e) { alert("Błąd sieci!"); }
}

window.renderMachineProducts = function() {
    const machineId = document.getElementById('machine-select').value;
    const addPanel = document.getElementById('machine-add-panel');
    const tableWrapper = document.getElementById('machine-table-wrapper');
    const tbody = document.getElementById('machine-table-body');
    const nameSpan = document.getElementById('selected-machine-name');

    if (!machineId) { addPanel.style.display = 'none'; tableWrapper.style.display = 'none'; return; }

    const machine = globalMachines.find(m => m.id == machineId);
    nameSpan.innerText = machine ? machine.oznaczenie_maszyny : "";
    const products = globalMachineProducts.filter(p => p.machine_id == machineId);

    tbody.innerHTML = '';
    if (products.length === 0) tbody.innerHTML = '<tr><td colspan="6">Brak przypisanych detali.</td></tr>';
    else {
        products.forEach(p => {
            let pakowanie = `W: ${p.sztuki_w_worku > 0 ? p.sztuki_w_worku : 'Brak'} <span style="color:#aaa">(${p.oznaczenie_worka||'-'})</span><br>
                             K: ${p.sztuki_w_kartonie} <span style="color:#aaa">(${p.oznaczenie_kartonu||'-'})</span><br>
                             P: ${p.sztuki_na_palecie} <span style="color:#888">(${p.kartony_na_palecie} k.)</span>`;
            
            let parametry = `💧 Woda: <span style="color:#3498db">${p.woda_ml > 0 ? p.woda_ml+' ml' : 'Brak'}</span><br>
                             ⚖️ Próbka: <span style="color:#f1c40f">${p.probka > 0 ? p.probka+' szt' : 'Brak'}</span>`;
            
            let diffClass = p.trudnosc_poziom === '💀' ? 'diff-skull' : '';
            let uwagaHtml = `<span class="${diffClass}">${p.trudnosc_poziom}</span><br><span style="font-size:11px; color:#aaa;">${p.trudnosc_dopisek||''}</span>`;
            if (p.uwaga) uwagaHtml += `<br><span style="color:#888; font-style:italic;">"${p.uwaga}"</span>`;

            tbody.innerHTML += `<tr>
                <td style="color:#3498db; font-weight:bold;">${p.oznaczenie}</td><td>${p.numer_detalu}</td>
                <td style="font-size: 12px; line-height: 1.4; text-align:left;">${pakowanie}</td>
                <td style="font-size: 12px; line-height: 1.4; text-align:left;">${parametry}</td>
                <td style="color:#2ecc71; font-weight:bold;">${p.norma_h_osoba}</td>
                <td style="font-size: 12px; text-align:left;">${uwagaHtml}</td>
            </tr>`;
        });
    }
    addPanel.style.display = 'block'; tableWrapper.style.display = 'block';
};

window.submitMachineProduct = async function() {
    const machineId = document.getElementById('machine-select').value;
    if(!machineId) return alert("Wybierz maszynę z listy!");

    const data = {
        machine_id: machineId,
        oznaczenie: document.getElementById('m-oznaczenie').value, numer_detalu: document.getElementById('m-detal').value,
        szt_w_worku: document.getElementById('m-worek').value, szt_w_kartonie: document.getElementById('m-karton').value,
        szt_na_palecie: document.getElementById('m-paleta-szt').value, kartony_na_palecie: document.getElementById('m-paleta-kartony').value,
        norma: document.getElementById('m-norma').value, trudnosc: document.getElementById('m-trudnosc').value,
        dopisek: document.getElementById('m-dopisek').value, uwaga: document.getElementById('m-uwaga').value,
        woda: document.getElementById('m-woda').value, probka: document.getElementById('m-probka').value,
        ozn_worka: document.getElementById('m-ozn-worek').value, ozn_kartonu: document.getElementById('m-ozn-karton').value
    };

    if (!data.oznaczenie || !data.numer_detalu) return alert("Wypełnij Oznaczenie i Numer Detalu!");

    try {
        const res = await fetch('/api/helper/add-machine-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const result = await res.json();
        if (result.success) { alert("Dodano detal!"); await loadMachinesData(); } 
        else alert(result.error);
    } catch(e) { alert("Błąd połączenia z serwerem."); }
}

// ==========================================
// 4. KALKULATOR (Bez zmian w logice)
// ==========================================
window.loadCalculatorData = async function() {
    const select = document.getElementById('calc-item');
    select.innerHTML = '<option value="">Ładowanie...</option>';
    try {
        const [resTies, resMach] = await Promise.all([fetch('/api/helper/ties'), fetch('/api/helper/machines')]);
        const dataTies = await resTies.json(); const dataMach = await resMach.json();

        select.innerHTML = '<option value="">-- Wybierz produkt / czynność --</option>';
        calcItemsMap = {}; 
        calcItemsMap['gitter'] = { name: 'Gitter-boxy', norma: 9, w: 0, k: 0, p: 0, type: 'gitter' };
        select.innerHTML += `<optgroup label="Inne"><option value="gitter">📦 Gitter-boxy (Norma stała: 9/h)</option></optgroup>`;

        if (dataTies.success && dataTies.ties.length > 0) {
            let html = '<optgroup label="Pakowanie Trytytek">';
            dataTies.ties.forEach(t => {
                const key = `tie_${t.id}`;
                calcItemsMap[key] = { norma: t.norma_h_osoba, w: t.sztuki_w_worku, k: t.sztuki_w_kartonie, p: t.sztuki_na_palecie, type: 'standard' };
                html += `<option value="${key}">${t.oznaczenie} (${t.numer_detalu})</option>`;
            });
            html += '</optgroup>'; select.innerHTML += html;
        }

        if (dataMach.success && dataMach.products.length > 0) {
            let html = '<optgroup label="Produkcja na Maszynie">';
            dataMach.products.forEach(p => {
                const m = dataMach.machines.find(mac => mac.id === p.machine_id);
                const mName = m ? m.oznaczenie_maszyny : '?';
                const key = `mach_${p.id}`;
                calcItemsMap[key] = { norma: p.norma_h_osoba, w: p.sztuki_w_worku, k: p.sztuki_w_kartonie, p: p.sztuki_na_palecie, type: 'standard' };
                html += `<option value="${key}">[${mName}] - ${p.oznaczenie}</option>`;
            });
            html += '</optgroup>'; select.innerHTML += html;
        }
        runCurrentCalc(); 
    } catch (e) { select.innerHTML = '<option value="">Błąd połączenia z bazą</option>'; }
}

window.switchCalcMode = function(mode) {
    currentCalcMode = mode;
    document.getElementById('mode-btn-simple').classList.remove('active');
    document.getElementById('mode-btn-adv').classList.remove('active');
    document.getElementById('calc-simple-view').style.display = 'none';
    document.getElementById('calc-adv-view').style.display = 'none';
    if (mode === 'simple') { document.getElementById('mode-btn-simple').classList.add('active'); document.getElementById('calc-simple-view').style.display = 'block'; } 
    else { document.getElementById('mode-btn-adv').classList.add('active'); document.getElementById('calc-adv-view').style.display = 'block'; }
    runCurrentCalc(); 
}

function getFloatFromInput(id) {
    let val = document.getElementById(id).value.toString().replace(',', '.');
    return parseFloat(val) || 0;
}

window.runCurrentCalc = function() {
    const itemKey = document.getElementById('calc-item').value;
    if (!itemKey) { document.getElementById('calc-results').style.display = 'none'; document.getElementById('adv-inputs-container').style.display = 'none'; return; }
    if (currentCalcMode === 'simple') calculateSimple();
    else calculateAdvanced('init'); 
}

function calculateSimple() {
    const itemKey = document.getElementById('calc-item').value;
    const item = calcItemsMap[itemKey];
    if (!item) return;

    const pct = getFloatFromInput('calc-percent'); const hrs = getFloatFromInput('calc-hours'); const ppl = getFloatFromInput('calc-people');
    const total100 = Math.ceil(item.norma * hrs * ppl);
    const totalTarget = Math.ceil(total100 * (pct / 100));

    const formatTotals = (totalPieces) => {
        let p = item.p > 0 ? parseFloat((totalPieces / item.p).toFixed(2)) : 0;
        let k = item.k > 0 ? parseFloat((totalPieces / item.k).toFixed(2)) : 0;
        let w = item.w > 0 ? parseFloat((totalPieces / item.w).toFixed(2)) : 0;
        return { p, k, w, total: totalPieces };
    };

    const targetData = formatTotals(totalTarget); const hundredData = formatTotals(total100);

    document.getElementById('res-title-pct').innerText = pct;
    document.getElementById('res-total').innerText = targetData.total;
    
    const boxesContainer = document.getElementById('res-boxes-container');
    if (item.type === 'gitter') {
        boxesContainer.style.display = 'none'; document.getElementById('res-100-str').innerText = `${hundredData.total} sztuk`;
    } else {
        boxesContainer.style.display = 'flex';
        document.getElementById('res-p').innerText = targetData.p; document.getElementById('res-k').innerText = targetData.k; document.getElementById('res-w').innerText = targetData.w;
        document.getElementById('res-100-str').innerText = `${hundredData.w} w / ${hundredData.k} k / ${hundredData.p} p / ${hundredData.total} szt.`;
    }
    document.getElementById('calc-results').style.display = 'block';
}

window.calculateAdvanced = function(sourceField) {
    const itemKey = document.getElementById('calc-item').value;
    if (!itemKey) return;
    const item = calcItemsMap[itemKey];

    document.getElementById('adv-inputs-container').style.display = 'block';

    if (item.type === 'gitter') {
        document.getElementById('adv-p').disabled = true; document.getElementById('adv-p').value = '-';
        document.getElementById('adv-k').disabled = true; document.getElementById('adv-k').value = '-';
        document.getElementById('adv-w').disabled = true; document.getElementById('adv-w').value = '-';
        if (sourceField !== 'szt') return; 
    } else {
        document.getElementById('adv-p').disabled = false; document.getElementById('adv-k').disabled = false; document.getElementById('adv-w').disabled = false;
    }

    let totalPieces = 0;
    if (sourceField === 'szt') totalPieces = getFloatFromInput('adv-szt');
    else if (sourceField === 'p') totalPieces = getFloatFromInput('adv-p') * (item.p || 0);
    else if (sourceField === 'k') totalPieces = getFloatFromInput('adv-k') * (item.k || 0);
    else if (sourceField === 'w') totalPieces = getFloatFromInput('adv-w') * (item.w || 0);
    else if (sourceField === 'init') totalPieces = getFloatFromInput('adv-szt');

    if (item.type !== 'gitter') {
        if (sourceField !== 'szt') document.getElementById('adv-szt').value = totalPieces;
        if (sourceField !== 'p') document.getElementById('adv-p').value = item.p > 0 ? parseFloat((totalPieces / item.p).toFixed(2)) : 0;
        if (sourceField !== 'k') document.getElementById('adv-k').value = item.k > 0 ? parseFloat((totalPieces / item.k).toFixed(2)) : 0;
        if (sourceField !== 'w') document.getElementById('adv-w').value = item.w > 0 ? parseFloat((totalPieces / item.w).toFixed(2)) : 0;
    }

    const pct = getFloatFromInput('calc-percent'); const hrs = getFloatFromInput('calc-hours'); const ppl = getFloatFromInput('calc-people');
    const total100 = Math.ceil(item.norma * hrs * ppl);
    let currentPct = 0;
    if (total100 > 0) currentPct = ((totalPieces / total100) * 100).toFixed(1);

    document.getElementById('adv-hrs-display').innerText = hrs;
    document.getElementById('adv-target-display').innerText = pct;
    
    let color = "#e74c3c"; 
    if (currentPct >= pct) color = "#2ecc71"; 
    else if (currentPct >= pct * 0.8) color = "#f1c40f"; 

    document.getElementById('adv-progress-text').innerHTML = `Wykonano: <span style="color:${color}">${currentPct}%</span> normy`;
};

window.addEventListener('load', loadTies);