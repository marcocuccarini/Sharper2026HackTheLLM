let sessionId = null;
let currentLevel = 1;
let selectedStartLevel = 1;
let gameComplete = false;
let levelProgress = {};  // livelli superati, es. {"1": true, "2": false, "3": false}
let sending = false;

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goHome() {
    sessionId = null;
    document.getElementById('nickname').value = '';
    document.getElementById('startErr').textContent = '';
    pickStartLevel(1);
    showScreen('screen-landing');
}

function toggleToolkitInline() {
    let el = document.getElementById('toolkitInline');
    el.style.display = el.style.display === 'none' ? 'grid' : 'none';
}

// ---------- Scelta del livello di partenza (schermata iniziale) ----------
function pickStartLevel(level) {
    selectedStartLevel = level;
    document.querySelectorAll('#levelPicker .lvl-option').forEach(btn => {
        const on = Number(btn.dataset.level) === level;
        btn.classList.toggle('selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
}

document.querySelectorAll('#levelPicker .lvl-option').forEach(btn => {
    btn.addEventListener('click', () => pickStartLevel(Number(btn.dataset.level)));
});

// ---------- Cambio livello durante la partita ----------
function updateLevelTabs(progress) {
    if (progress) levelProgress = progress;
    document.querySelectorAll('#levelTabs .lvl-tab').forEach(btn => {
        const lvl = Number(btn.dataset.level);
        btn.classList.toggle('current', lvl === currentLevel);
        if (progress) btn.classList.toggle('done', !!progress[String(lvl)]);
    });
}

function setTabsDisabled(disabled) {
    document.querySelectorAll('#levelTabs .lvl-tab').forEach(btn => { btn.disabled = disabled; });
    document.getElementById('skipBtn').disabled = disabled;
}

// Salta il livello corrente: va al prossimo livello non ancora superato
// (es. dal 3 torna all'1). Il livello saltato resta da fare per la classifica.
function skipLevel() {
    if (!sessionId || sending) return;
    const order = [1, 2, 3].map(i => ((currentLevel - 1 + i) % 3) + 1);  // es. dal 2: 3, 1, 2
    const next = order.find(l => l !== currentLevel && !levelProgress[String(l)]);
    if (!next) {
        appendMsg('system', 'È l\'ultimo livello che ti manca: non puoi saltarlo!');
        return;
    }
    selectLevel(next);
}

function setInputDisabled(disabled) {
    document.getElementById('userInput').disabled = disabled;
    document.getElementById('sendBtn').disabled = disabled;
}

async function selectLevel(level) {
    if (!sessionId || sending || level === currentLevel) return;
    try {
        const res = await fetch('/select_level', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, level })
        });
        const json = await res.json();
        if (!json.response) { appendMsg('system', '❌ ' + (json.message || 'Errore.')); return; }

        loadLevel(json.level, json.progress);
        document.getElementById('attemptCount').textContent = json.attempts_this_level;
        if (json.solved) {
            appendMsg('system', '✅ Hai già superato questo livello: scegline un altro.');
            setInputDisabled(true);
        }
    } catch (e) {
        appendMsg('system', '❌ Errore di connessione al server.');
    }
}

document.querySelectorAll('#levelTabs .lvl-tab').forEach(btn => {
    btn.addEventListener('click', () => selectLevel(Number(btn.dataset.level)));
});

async function startGame() {
    let name = document.getElementById('nickname').value.trim();
    let errEl = document.getElementById('startErr');
    if (!name) { errEl.textContent = 'Inserisci un nickname per iniziare.'; return; }
    errEl.textContent = '';

    try {
        const res = await fetch('/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, level: selectedStartLevel })
        });
        const json = await res.json();
        if (!json.response) { errEl.textContent = json.message || 'Errore.'; return; }

        sessionId = json.session_id;
        gameComplete = false;
        loadLevel(json.level, json.progress);
        showScreen('screen-game');
    } catch (e) {
        errEl.textContent = 'Errore di connessione al server.';
    }
}

function loadLevel(level, progress) {
    currentLevel = level.number;
    document.getElementById('lvlTitle').textContent = level.title;
    document.getElementById('lvlMission').textContent = level.mission;
    document.getElementById('attemptCount').textContent = '0';
    document.getElementById('terminal').innerHTML = '';
    document.getElementById('flagBanner').classList.remove('show');
    setInputDisabled(false);
    updateLevelTabs(progress);
    appendMsg('system', `Sessione avviata su ProfBot. Obiettivo: ${level.mission}`);
}

const PROFBOT_AVATAR = "/static/profbot-avatar.svg";

function appendMsg(role, text) {
    let term = document.getElementById('terminal');
    let wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    if (role === 'bot') {
        let img = document.createElement('img');
        img.className = 'avatar';
        img.src = PROFBOT_AVATAR;
        img.alt = 'ProfBot';
        wrap.appendChild(img);
    }
    let bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    term.appendChild(wrap);
    term.scrollTop = term.scrollHeight;
    return wrap;
}

async function sendMessage() {
    if (sending) return;
    let input = document.getElementById('userInput');
    let text = input.value.trim();
    if (!text) return;

    appendMsg('user', text);
    input.value = '';
    sending = true;
    setInputDisabled(true);
    setTabsDisabled(true);

    const typing = appendMsg('bot', 'sto pensando');
    typing.classList.add('typing');

    let solved = false;
    try {
        const res = await fetch('/message', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, message: text })
        });
        const json = await res.json();
        typing.remove();

        if (!json.response) {
            appendMsg('system', '❌ ' + (json.message || 'Errore.'));
        } else {
            appendMsg('bot', json.reply);
            document.getElementById('attemptCount').textContent = json.attempts_this_level;
            updateLevelTabs(json.progress);

            if (json.solved) {
                solved = true;
                gameComplete = json.game_complete;
                document.getElementById('badgeName').textContent = json.badge;
                document.getElementById('flagBanner').classList.add('show');
                document.getElementById('advanceBtn').textContent =
                    json.game_complete ? 'Vedi la classifica →' : 'Livello successivo →';
            }
        }
    } catch (e) {
        typing.remove();
        appendMsg('system', '❌ Errore di connessione al server.');
    }

    sending = false;
    setTabsDisabled(false);
    setInputDisabled(solved);  // livello superato: si passa a un altro
    if (!solved) input.focus();
}

document.getElementById('userInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function advance() {
    if (gameComplete) {
        gameComplete = false;
        showLeaderboard();
        return;
    }
    try {
        const res = await fetch('/next_level', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        const json = await res.json();
        if (json.response) {
            loadLevel(json.level, json.progress);
        } else {
            appendMsg('system', json.message || 'Errore.');
        }
    } catch (e) {
        appendMsg('system', '❌ Errore di connessione al server.');
    }
}

async function showLeaderboard() {
    showScreen('screen-leaderboard');
    const tbody = document.getElementById('lbBody');
    tbody.innerHTML = '<tr><td colspan="4">Caricamento...</td></tr>';
    try {
        const res = await fetch('/leaderboard');
        const json = await res.json();
        const entries = json.entries || [];
        if (!entries.length) {
            tbody.innerHTML = '<tr><td colspan="4">Nessun punteggio ancora. Sii il primo!</td></tr>';
            return;
        }
        tbody.innerHTML = entries.map((e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${e.name}</td>
        <td>${e.total_attempts}</td>
        <td class="badges">${e.badges.join(' · ')}</td>
      </tr>`).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4">Errore nel caricamento della classifica.</td></tr>';
    }
}