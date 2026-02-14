// Main entry point
const STORAGE_KEY = 'chessStrategy_maxUnlockedLevel';
const STORAGE_KEY_TUTORIAL = 'chessStrategy_tutorialCompleted';
const STORAGE_KEY_ATTEMPTED_LEVELS = 'chessStrategy_attemptedLevels';
const STORAGE_KEY_ATTEMPTED_TUTORIAL = 'chessStrategy_attemptedTutorial';
const STORAGE_KEY_HIGH_SCORES = 'chessStrategy_highScores';
const STORAGE_KEY_PERFECT_LEVELS = 'chessStrategy_perfectLevels';

let gameEngine = null;
let levelManager = null;
let tutorialMode = false;
let currentTutorialPageIndex = 0;

function getTutorialCompletedPages() {
    const s = localStorage.getItem(STORAGE_KEY_TUTORIAL) || '';
    if (!s) return [];
    return s.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 2);
}

function getTutorialAttemptedPages() {
    const s = localStorage.getItem(STORAGE_KEY_ATTEMPTED_TUTORIAL) || '';
    if (!s) return [];
    return s.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 2);
}

function setTutorialPageAttempted(pageIndex) {
    const attempted = getTutorialAttemptedPages();
    if (attempted.indexOf(pageIndex) === -1) {
        attempted.push(pageIndex);
        attempted.sort((a, b) => a - b);
        localStorage.setItem(STORAGE_KEY_ATTEMPTED_TUTORIAL, attempted.join(','));
    }
}

function getAttemptedLevels() {
    const s = localStorage.getItem(STORAGE_KEY_ATTEMPTED_LEVELS) || '';
    if (!s) return [];
    return s.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 1);
}

function setLevelAttempted(levelNumber) {
    const attempted = getAttemptedLevels();
    if (attempted.indexOf(levelNumber) === -1) {
        attempted.push(levelNumber);
        attempted.sort((a, b) => a - b);
        localStorage.setItem(STORAGE_KEY_ATTEMPTED_LEVELS, attempted.join(','));
    }
}

function getCompletedLevels() {
    const max = getMaxUnlockedLevel();
    if (max < 1) return [];
    const list = [];
    for (let i = 1; i < max; i++) list.push(i);
    return list;
}

function getHighScore(levelNumber) {
    const raw = localStorage.getItem(STORAGE_KEY_HIGH_SCORES);
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        const n = obj[String(levelNumber)];
        return typeof n === 'number' ? n : null;
    } catch (_) { return null; }
}

function setHighScore(levelNumber, score) {
    const raw = localStorage.getItem(STORAGE_KEY_HIGH_SCORES) || '{}';
    let obj = {};
    try { obj = JSON.parse(raw); } catch (_) {}
    const prev = obj[String(levelNumber)];
    if (typeof score === 'number' && (prev == null || score > prev)) {
        obj[String(levelNumber)] = score;
        localStorage.setItem(STORAGE_KEY_HIGH_SCORES, JSON.stringify(obj));
    }
}

function getPerfectLevels() {
    const s = localStorage.getItem(STORAGE_KEY_PERFECT_LEVELS) || '';
    if (!s) return [];
    return s.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 1);
}

function setPerfectLevel(levelNumber, isPerfect) {
    const perfect = getPerfectLevels();
    const idx = perfect.indexOf(levelNumber);
    if (isPerfect && idx === -1) {
        perfect.push(levelNumber);
        perfect.sort((a, b) => a - b);
        localStorage.setItem(STORAGE_KEY_PERFECT_LEVELS, perfect.join(','));
    } else if (!isPerfect && idx !== -1) {
        perfect.splice(idx, 1);
        localStorage.setItem(STORAGE_KEY_PERFECT_LEVELS, perfect.join(','));
    }
}

function setTutorialPageComplete(pageIndex) {
    const completed = getTutorialCompletedPages();
    if (completed.indexOf(pageIndex) === -1) {
        completed.push(pageIndex);
        completed.sort((a, b) => a - b);
        localStorage.setItem(STORAGE_KEY_TUTORIAL, completed.join(','));
    }
}

function hasCompletedAllTutorials() {
    const completed = getTutorialCompletedPages();
    return completed.length >= 3;
}

function getMaxUnlockedLevel() {
    if (!hasCompletedAllTutorials()) return 0;
    const n = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    return isNaN(n) || n < 1 ? 1 : Math.min(n, levelManager ? levelManager.levels.length : 10);
}

function setMaxUnlockedLevel(levelNumber) {
    const current = getMaxUnlockedLevel();
    if (levelNumber > current) {
        localStorage.setItem(STORAGE_KEY, String(levelNumber));
    }
}

function showScreen(screenId) {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('levels-screen').classList.add('hidden');
    document.getElementById('tutorial-screen').classList.add('hidden');
    document.getElementById('game-container').classList.add('hidden');
    const el = document.getElementById(screenId);
    if (el) el.classList.remove('hidden');
}

function showLevelsScreen() {
    showScreen('levels-screen');
    renderLevelsList();
}

function showTutorialScreen() {
    showScreen('tutorial-screen');
    renderTutorialList();
}

function renderTutorialList() {
    const list = document.getElementById('tutorial-list');
    if (!list || !levelManager) return;
    const pages = LevelManager.getTutorialPages();
    const completed = getTutorialCompletedPages();
    const attempted = getTutorialAttemptedPages();
    list.innerHTML = '';
    pages.forEach((page) => {
        const done = completed.indexOf(page.id) !== -1;
        const tried = attempted.indexOf(page.id) !== -1;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'level-card level-card-tutorial card-centered' +
            (done ? ' completed' : tried ? ' attempted' : ' not-started');
        card.innerHTML = '<span class="level-symbol">' + page.symbol + '</span><span class="level-name">' + page.name + '</span>';
        card.addEventListener('click', () => startTutorialPage(page.id));
        list.appendChild(card);
    });
}

function getLevelSymbol(levelName) {
    if (!levelName) return '♟';
    const n = levelName.toLowerCase();
    if (n.includes('knight')) return '♞';
    if (n.includes('bishop')) return '♝';
    if (n.includes('rook') || n.includes('tower')) return '♜';
    if (n.includes('queen')) return '♛';
    if (n.includes('king') || n.includes('crown')) return '♚';
    return '♟';
}

function renderLevelsList() {
    const list = document.getElementById('levels-list');
    if (!list || !levelManager) return;
    const maxUnlocked = getMaxUnlockedLevel();
    const levels = levelManager.levels;
    list.innerHTML = '';

    // Training Grounds: gold when all 3 tutorial done, red when any attempted but not all done, else green
    const tutorialCompleted = hasCompletedAllTutorials();
    const tutorialAttempted = getTutorialAttemptedPages().length > 0;
    const tutorialCard = document.createElement('button');
    tutorialCard.type = 'button';
    tutorialCard.className = 'level-card level-card-tutorial card-centered' +
        (tutorialCompleted ? ' completed' : tutorialAttempted ? ' attempted' : ' not-started');
    tutorialCard.innerHTML = '<span class="level-symbol">♟</span><span class="level-name">Training Grounds</span>';
    tutorialCard.addEventListener('click', () => showTutorialScreen());
    list.appendChild(tutorialCard);

    const completedLevels = getCompletedLevels();
    const attemptedLevels = getAttemptedLevels();
    const perfectLevels = getPerfectLevels();

    levels.forEach((level, index) => {
        const levelNum = index + 1;
        const locked = levelNum > maxUnlocked;
        const completed = completedLevels.indexOf(levelNum) !== -1;
        const attempted = attemptedLevels.indexOf(levelNum) !== -1;
        const hasOptionals = level.optionalObjectives && level.optionalObjectives.length > 0;
        const allOptionalsDone = !hasOptionals || perfectLevels.indexOf(levelNum) !== -1;
        const completedClass = completed
            ? (hasOptionals && !allOptionalsDone ? ' completed-partial' : ' completed')
            : (attempted ? ' attempted' : ' not-started');
        const sym = getLevelSymbol(level.name);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'level-card card-centered' + (locked ? ' locked' : '') + completedClass;
        const hi = getHighScore(levelNum);
        const hiStr = hi != null ? 'Best: ' + hi : '';
        card.innerHTML = '<span class="level-symbol">' + sym + '</span><span class="level-name">' + level.name + '</span><span class="level-desc">Level ' + levelNum + (hiStr ? ' · ' + hiStr : '') + '</span>';
        if (!locked) {
            card.addEventListener('click', () => startLevel(levelNum));
        }
        list.appendChild(card);
    });
}

function startTutorialPage(pageIndex) {
    currentTutorialPageIndex = pageIndex;
    tutorialMode = true;
    setTutorialPageAttempted(pageIndex);
    showScreen('game-container');
    loadTutorial(pageIndex);
}

function startLevel(levelNumber) {
    tutorialMode = false;
    setLevelAttempted(levelNumber);
    showScreen('game-container');
    levelManager.currentLevel = levelNumber;
    loadLevel(levelNumber);
}

function updateObjectives(objectives, optionalObjectives) {
    const list = document.getElementById('objectives-list');
    if (!list) return;
    const prim = objectives && objectives.length > 0 ? objectives : ['Eliminate all enemies.'];
    const opt = optionalObjectives && optionalObjectives.length > 0 ? optionalObjectives : [];
    list.innerHTML =
        prim.map(o => '<li>' + o + '</li>').join('') +
        (opt.length ? '<li class="objectives-optional-label">Optional:</li>' + opt.map(o => '<li class="objectives-optional">' + (o.text || o) + '</li>').join('') : '');
}

function loadTutorial(pageIndex) {
    const levelData = levelManager.loadTutorial(pageIndex);
    if (!levelData) return;
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('defeat-screen').classList.add('hidden');
    document.getElementById('current-turn').textContent = '1';
    const headerNum = document.getElementById('header-level-num');
    if (headerNum) headerNum.textContent = '—';
    updateObjectives(levelData.objectives, levelData.optionalObjectives);
    const canvas = document.getElementById('game-canvas');
    gameEngine = new GameEngine(canvas, levelData.board, levelData.units, {
        isBoss: false,
        enemyAP: 12,
        isTutorial: true,
        tutorialPageIndex: levelData.tutorialPageIndex,
        surviveTurns: levelData.surviveTurns || null
    });
    gameEngine.render();
    gameEngine.updateUI();
    gameEngine.updateUnitInfo();
    const titleEl = document.getElementById('header-level-title');
    if (titleEl) titleEl.textContent = levelData.name || 'Training Grounds';
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) { highScoreEl.textContent = ''; highScoreEl.style.display = 'none'; }
    const instructionsEl = document.getElementById('instructions');
    if (instructionsEl) instructionsEl.style.display = '';
    requestAnimationFrame(() => {
        if (gameEngine && gameEngine.canvas.parentElement) {
            gameEngine.setupCanvas();
            gameEngine.render();
        }
    });
}

function loadLevel(levelNumber) {
    const levelData = levelManager.loadLevel(levelNumber);
    if (!levelData) {
        console.error('Failed to load level', levelNumber);
        return;
    }

    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('defeat-screen').classList.add('hidden');

    document.getElementById('current-turn').textContent = '1';
    const headerNum = document.getElementById('header-level-num');
    if (headerNum) headerNum.textContent = levelNumber;
    updateObjectives(levelData.objectives, levelData.optionalObjectives);

    const instructionsEl = document.getElementById('instructions');
    if (instructionsEl) instructionsEl.style.display = 'none';

    const canvas = document.getElementById('game-canvas');
    gameEngine = new GameEngine(canvas, levelData.board, levelData.units, {
        isBoss: levelData.isBoss,
        enemyAP: levelData.enemyAP != null ? levelData.enemyAP : 12,
        isTutorial: false
    });

    gameEngine.render();
    gameEngine.updateUI();
    gameEngine.updateUnitInfo();

    requestAnimationFrame(() => {
        if (gameEngine && gameEngine.canvas.parentElement) {
            gameEngine.setupCanvas();
            gameEngine.render();
        }
    });

    const titleEl = document.getElementById('header-level-title');
    if (titleEl) {
        titleEl.textContent = tutorialMode ? 'Tutorial' : levelData.name;
    }
    const highScoreEl = document.getElementById('high-score-display');
    if (highScoreEl) {
        const hi = tutorialMode ? null : getHighScore(levelNumber);
        highScoreEl.textContent = hi != null ? 'High score: ' + hi : 'High score: —';
        highScoreEl.style.display = 'block';
    }
}

function onVictory() {
    if (tutorialMode) {
        setTutorialPageComplete(currentTutorialPageIndex);
        if (hasCompletedAllTutorials()) setMaxUnlockedLevel(1);
    } else {
        const next = levelManager.currentLevel + 1;
        setMaxUnlockedLevel(next);
    }
    const nextBtn = document.getElementById('next-level-btn');
    const hasNext = !tutorialMode && levelManager.hasNextLevel();
    nextBtn.style.display = hasNext ? 'inline-block' : 'none';
    const backToTrainingBtn = document.getElementById('victory-back-to-training-btn');
    if (backToTrainingBtn) backToTrainingBtn.style.display = tutorialMode ? 'inline-block' : 'none';

    const statsEl = document.getElementById('victory-stats');
    if (statsEl && gameEngine && typeof gameEngine.getScoreResult === 'function') {
        const r = gameEngine.getScoreResult();
        const lostStr = r.unitsLost.length ? r.unitsLost.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ') : 'None';
        const levelData = !tutorialMode && levelManager ? levelManager.getLevel(levelManager.currentLevel) : null;
        const apPenalty = r.totalAPSpent * 2;
        const perfectTurnLimit = (levelData && levelData.optionalObjectives)
            ? (levelData.optionalObjectives.find(o => o.type === 'maxTurns') || {}).value
            : null;
        const effectiveTurnLimit = (typeof perfectTurnLimit === 'number' && perfectTurnLimit >= 1) ? perfectTurnLimit : 1;
        const turnPenalty = r.turns <= effectiveTurnLimit ? 0 : (r.turns - effectiveTurnLimit) * 10;
        const score = Math.max(0, 1000 - turnPenalty - apPenalty - (r.unitsLostValue || 0));
        if (!tutorialMode && levelManager) setHighScore(levelManager.currentLevel, score);
        const base = 1000;
        let optHtml = '';
        let allOptionalsDone = true;
        if (levelData) {
            const optList = levelData.optionalObjectives ? levelData.optionalObjectives : [];
            const allEnemiesDead = gameEngine.units && gameEngine.units.filter(u => !u.isPlayerUnit && u.isAlive()).length === 0;
            for (const o of optList) {
                const text = o.text || '';
                let done = false;
                if (o.type === 'defeatBoss') done = !!levelData.isBoss;
                else if (o.type === 'eliminateAll') done = allEnemiesDead;
                else if (o.type === 'noUnitsLost') done = r.unitsLost.length === 0;
                else if (o.type === 'maxTurns') done = r.turns <= (o.value || 999);
                if (!done) allOptionalsDone = false;
                optHtml += '<br><span class="optional-result">' + text + ' ' + (done ? '✓' : '✗') + '</span>';
            }
            if (!tutorialMode && levelManager) {
                setPerfectLevel(levelManager.currentLevel, optList.length === 0 || allOptionalsDone);
            }
        }
        statsEl.innerHTML =
            'Turns: ' + r.turns + (turnPenalty ? ' (−' + turnPenalty + ')' : ' (perfect)') + '<br>AP spent: ' + r.totalAPSpent + ' (−' + apPenalty + ')' +
            '<br>Units lost: ' + lostStr + (r.unitsLostValue ? ' (−' + r.unitsLostValue + ')' : '') +
            '<br>Base ' + base + ' − ' + turnPenalty + ' − ' + apPenalty + ' − ' + (r.unitsLostValue || 0) + ' = <span class="score-line">' + score + '</span>' +
            optHtml;
    }
}

function initGame() {
    levelManager = new LevelManager();

    // Start screen
    showScreen('start-screen');
    document.getElementById('start-game-btn').addEventListener('click', () => showLevelsScreen());
    document.getElementById('back-from-levels-btn').addEventListener('click', () => showScreen('start-screen'));
    document.getElementById('back-from-tutorial-btn').addEventListener('click', () => showLevelsScreen());

    // In-game buttons
    document.getElementById('end-turn-btn').addEventListener('click', () => {
        if (!gameEngine) return;
        gameEngine.endTurn();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        if (tutorialMode) loadTutorial(currentTutorialPageIndex);
        else loadLevel(levelManager.currentLevel);
    });

    document.getElementById('level-select-btn').addEventListener('click', () => {
        if (tutorialMode) showTutorialScreen();
        else showLevelsScreen();
    });

    document.getElementById('next-level-btn').addEventListener('click', () => {
        const next = levelManager.nextLevel();
        if (next) {
            document.getElementById('victory-screen').classList.add('hidden');
            loadLevel(levelManager.currentLevel);
        } else {
            document.getElementById('victory-screen').classList.add('hidden');
            showLevelsScreen();
        }
    });

    document.getElementById('victory-back-to-training-btn').addEventListener('click', () => {
        document.getElementById('victory-screen').classList.add('hidden');
        showTutorialScreen();
    });
    document.getElementById('victory-level-select-btn').addEventListener('click', () => {
        document.getElementById('victory-screen').classList.add('hidden');
        showLevelsScreen();
    });

    document.getElementById('retry-btn').addEventListener('click', () => {
        if (tutorialMode) loadTutorial(currentTutorialPageIndex);
        else loadLevel(levelManager.currentLevel);
        document.getElementById('defeat-screen').classList.add('hidden');
    });
    document.getElementById('defeat-level-select-btn').addEventListener('click', () => {
        document.getElementById('defeat-screen').classList.add('hidden');
        if (tutorialMode) showTutorialScreen();
        else showLevelsScreen();
    });
}

// Hook into game engine victory so we can unlock next level
const _checkGameState = GameEngine.prototype.checkGameState;
GameEngine.prototype.checkGameState = function () {
    _checkGameState.apply(this);
    if (this.gameState === 'victory' && typeof onVictory === 'function') {
        onVictory();
    }
};

window.addEventListener('DOMContentLoaded', initGame);
