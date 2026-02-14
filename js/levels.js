// Level definitions: roster of unit types; spawn positions are chosen after board is generated
class LevelManager {
    constructor() {
        this.currentLevel = 1;
        this.levels = this.defineLevels();
    }

    defineLevels() {
        const objAll = ['Eliminate all enemy units.'];
        const objBoss = ['Defeat the boss.'];
        const opt = (text, type, value) => ({ text, type, value });
        return [
            { name: "The Knight's Trial", width: 8, height: 6, difficulty: 0, shape: 'arena', isBoss: true, bossType: 'knight', bossName: 'Rourke the Knight of Asteria', playerRoster: ['pawn', 'pawn', 'knight'], enemyRoster: ['knight', 'pawn', 'pawn'], objectives: objBoss, optionalObjectives: [opt('Eliminate all enemy units', 'eliminateAll', true), opt('Complete in 6 turns or fewer', 'maxTurns', 6)] },
            { name: "First Steps", width: 9, height: 7, difficulty: 1, shape: 'normal', playerRoster: ['pawn', 'knight'], enemyRoster: ['pawn', 'pawn', 'pawn', 'knight', 'knight'], objectives: objAll, optionalObjectives: [opt('Complete in 8 turns or fewer', 'maxTurns', 8), opt('No units lost', 'noUnitsLost', true)] },
            { name: "Reinforcements", width: 11, height: 8, difficulty: 1, shape: 'normal', playerRoster: ['pawn', 'knight', 'bishop'], enemyRoster: ['pawn', 'pawn', 'knight', 'knight', 'bishop', 'pawn'], objectives: objAll, optionalObjectives: [opt('Complete in 10 turns or fewer', 'maxTurns', 10)] },
            { name: "The Bishop's Gambit", width: 10, height: 8, difficulty: 2, shape: 'arena', isBoss: true, bossType: 'bishop', bossName: 'Valdris the Shadow Bishop', playerRoster: ['pawn', 'knight', 'bishop'], enemyRoster: ['bishop', 'pawn', 'pawn', 'knight'], objectives: objBoss, optionalObjectives: [opt('Eliminate all enemy units', 'eliminateAll', true), opt('No units lost', 'noUnitsLost', true)] },
            { name: "Hold the Line", width: 13, height: 9, difficulty: 2, shape: 'normal', playerRoster: ['pawn', 'pawn', 'knight', 'bishop'], enemyRoster: ['pawn', 'pawn', 'pawn', 'knight', 'knight', 'bishop', 'bishop'], objectives: objAll, optionalObjectives: [opt('Complete in 12 turns or fewer', 'maxTurns', 12)] },
            { name: "Heavy Support", width: 15, height: 10, difficulty: 2, shape: 'normal', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook'], enemyRoster: ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'bishop', 'rook', 'pawn'], objectives: objAll, optionalObjectives: [opt('Complete in 14 turns or fewer', 'maxTurns', 14), opt('No units lost', 'noUnitsLost', true)] },
            { name: "Tower's Wrath", width: 12, height: 9, difficulty: 3, shape: 'arena', isBoss: true, bossType: 'rook', bossName: 'Torvald the Iron Tower', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook'], enemyRoster: ['rook', 'rook', 'bishop', 'pawn', 'pawn', 'knight'], objectives: objBoss, optionalObjectives: [opt('Eliminate all enemy units', 'eliminateAll', true), opt('Complete in 10 turns or fewer', 'maxTurns', 10)] },
            { name: "Royal Power", width: 17, height: 11, difficulty: 3, shape: 'normal', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen'], enemyRoster: ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook', 'rook', 'queen', 'pawn'], objectives: objAll, optionalObjectives: [opt('Complete in 15 turns or fewer', 'maxTurns', 15)] },
            { name: "Crown Guard", width: 19, height: 12, difficulty: 3, shape: 'normal', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'], enemyRoster: ['pawn', 'pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'queen', 'king', 'pawn'], objectives: objAll, optionalObjectives: [opt('No units lost', 'noUnitsLost', true)] },
            { name: "The Queen's Fury", width: 14, height: 10, difficulty: 4, shape: 'arena', isBoss: true, bossType: 'queen', bossName: 'Morana the Crimson Queen', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'], enemyRoster: ['queen', 'rook', 'bishop', 'knight', 'pawn', 'pawn'], objectives: objBoss, optionalObjectives: [opt('Eliminate all enemy units', 'eliminateAll', true), opt('Complete in 12 turns or fewer', 'maxTurns', 12)] },
            { name: "The King's Decree", width: 8, height: 10, difficulty: 5, shape: 'normal', isBoss: true, bossType: 'king', bossName: 'Aldric the Eternal King', enemyFormation: 'chess', playerRoster: ['pawn', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'], enemyRoster: [], objectives: objBoss, optionalObjectives: [opt('Eliminate all enemy units', 'eliminateAll', true)] }
        ];
    }

    getLevel(levelNumber) {
        const levelIndex = levelNumber - 1;
        if (levelIndex >= 0 && levelIndex < this.levels.length) {
            return this.levels[levelIndex];
        }
        return null;
    }

    // Pick spawn positions: pawns and key units get center columns first so they're useful; edges last.
    static pickSpawns(board, playerRoster, enemyRoster) {
        const w = board.width;
        const h = board.height;
        const centerX = (w - 1) / 2;
        const distFromCenter = (c) => (c.x - centerX) * (c.x - centerX);

        // Player zone: bottom 2 rows. Prefer slots near center for pawns and other units.
        const playerCells = [];
        for (let y = h - 1; y >= h - 2; y--) {
            for (let x = 0; x < w; x++) {
                if (!board.hasObstacle(x, y)) playerCells.push({ x, y });
            }
        }
        const playerPawnSlots = playerCells.filter(c => Board.isPawnSpawnValid(board, c.x, c.y, true));
        const playerOtherSlots = playerCells.filter(c => !playerPawnSlots.some(p => p.x === c.x && p.y === c.y));
        playerPawnSlots.sort((a, b) => distFromCenter(a) - distFromCenter(b));
        playerOtherSlots.sort((a, b) => distFromCenter(a) - distFromCenter(b));
        const playerUnits = [];
        let pawnIdx = 0, otherIdx = 0;
        for (const type of playerRoster) {
            if (type === 'pawn' && pawnIdx < playerPawnSlots.length) {
                const s = playerPawnSlots[pawnIdx++];
                playerUnits.push({ x: s.x, y: s.y, type: 'pawn' });
            } else if (otherIdx < playerOtherSlots.length) {
                const s = playerOtherSlots[otherIdx++];
                playerUnits.push({ x: s.x, y: s.y, type: type });
            } else if (pawnIdx < playerPawnSlots.length) {
                const s = playerPawnSlots[pawnIdx++];
                playerUnits.push({ x: s.x, y: s.y, type: type });
            }
        }

        // Enemy zone: top 2 rows, same center-first order
        const enemyCells = [];
        for (let y = 0; y <= 1; y++) {
            for (let x = 0; x < w; x++) {
                if (!board.hasObstacle(x, y)) enemyCells.push({ x, y });
            }
        }
        const enemyPawnSlots = enemyCells.filter(c => Board.isPawnSpawnValid(board, c.x, c.y, false));
        const enemyOtherSlots = enemyCells.filter(c => !enemyPawnSlots.some(p => p.x === c.x && p.y === c.y));
        enemyPawnSlots.sort((a, b) => distFromCenter(a) - distFromCenter(b));
        enemyOtherSlots.sort((a, b) => distFromCenter(a) - distFromCenter(b));
        const enemyUnits = [];
        pawnIdx = 0;
        otherIdx = 0;
        for (const type of enemyRoster) {
            if (type === 'pawn' && pawnIdx < enemyPawnSlots.length) {
                const s = enemyPawnSlots[pawnIdx++];
                enemyUnits.push({ x: s.x, y: s.y, type: 'pawn' });
            } else if (otherIdx < enemyOtherSlots.length) {
                const s = enemyOtherSlots[otherIdx++];
                enemyUnits.push({ x: s.x, y: s.y, type: type });
            } else if (pawnIdx < enemyPawnSlots.length) {
                const s = enemyPawnSlots[pawnIdx++];
                enemyUnits.push({ x: s.x, y: s.y, type: type });
            }
        }

        return { playerUnits, enemyUnits };
    }

    // Full chess starting setup for enemy: back row R,N,B,Q,K,B,N,R and 8 pawns in front.
    static getChessFormationEnemies(board) {
        const w = board.width;
        if (w < 8) return [];
        const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        const enemies = [];
        let i = 0;
        for (let x = 0; x < 8; x++) {
            if (!board.hasObstacle(x, 0)) {
                enemies.push({ x, y: 0, type: back[x] });
                i++;
            }
        }
        for (let x = 0; x < 8; x++) {
            if (!board.hasObstacle(x, 1)) {
                enemies.push({ x, y: 1, type: 'pawn' });
                i++;
            }
        }
        return enemies;
    }

    // Tutorial pages: 0 = Close Range Combat, 1 = Ranged Combat, 2 = Defend
    static getTutorialPages() {
        return [
            { id: 0, name: 'Close Range Combat', symbol: '♟', objectives: ['Attack the enemy pawn on the diagonal.', 'Eliminate all enemies.'] },
            { id: 1, name: 'Ranged Combat', symbol: '♞', objectives: ['Use your knight\'s L-shape attack to hit the enemy from range.', 'Eliminate the enemy knight.'] },
            { id: 2, name: 'Defend', symbol: '♜', objectives: ['Survive for 5 turns. Your rook can only move (no attack). Use obstacles to avoid the knights\' L-shaped attacks.'] }
        ];
    }

    loadTutorial(pageIndex) {
        const pages = LevelManager.getTutorialPages();
        const page = pages[pageIndex];
        const name = page ? page.name : 'Training Grounds';

        if (pageIndex === 0) {
            // Close Range Combat: one player pawn, one enemy pawn on diagonal
            const width = 6, height = 6;
            const board = Board.generateLevel(width, height, 0, 0, 'tutorial');
            const playerUnits = [{ x: 2, y: 5, type: 'pawn' }];
            const enemyUnits = [{ x: 3, y: 4, type: 'pawn' }];
            const playerUnitInstances = playerUnits.map((u, i) =>
                new Unit(u.x, u.y, u.type, true, `player_${i}`)
            );
            const enemyUnitInstances = enemyUnits.map((u, i) =>
                new Unit(u.x, u.y, u.type, false, `enemy_${i}`)
            );
            const pages = LevelManager.getTutorialPages();
            return {
                board,
                units: [...playerUnitInstances, ...enemyUnitInstances],
                name,
                objectives: (pages[0] && pages[0].objectives) ? pages[0].objectives : ['Eliminate all enemies.'],
                isBoss: false,
                enemyAP: 12,
                isTutorial: true,
                tutorialPageIndex: 0
            };
        }

        if (pageIndex === 1) {
            // Ranged Combat: knight vs knight — projectiles / L-shape attack
            const width = 8, height = 6;
            const board = Board.generateLevel(width, height, 0, 0, 'tutorial');
            const playerUnits = [{ x: 2, y: 5, type: 'knight' }];
            const enemyUnits = [{ x: 4, y: 3, type: 'knight' }];
            const playerUnitInstances = playerUnits.map((u, i) =>
                new Unit(u.x, u.y, u.type, true, `player_${i}`)
            );
            const enemyUnitInstances = enemyUnits.map((u, i) =>
                new Unit(u.x, u.y, u.type, false, `enemy_${i}`)
            );
            const pages = LevelManager.getTutorialPages();
            return {
                board,
                units: [...playerUnitInstances, ...enemyUnitInstances],
                name,
                objectives: (pages[1] && pages[1].objectives) ? pages[1].objectives : ['Eliminate all enemies.'],
                isBoss: false,
                enemyAP: 12,
                isTutorial: true,
                tutorialPageIndex: 1
            };
        }

        if (pageIndex === 2) {
            // Defend: survive 5 turns; rook cannot attack. Enemies are knights (L-shape); obstacles give the rook cover to hide behind.
            const width = 8, height = 6;
            const board = Board.generateLevel(width, height, 0, 0, 'tutorial');
            // Obstacles in the middle so the rook can break lines and hide; knights must path around to get L-attack range
            board.addObstacle(2, 2);
            board.addObstacle(4, 2);
            board.addObstacle(3, 3);
            board.addObstacle(5, 3);
            board.addObstacle(2, 4);
            board.addObstacle(4, 4);
            const playerUnits = [{ x: 4, y: 5, type: 'rook' }];
            const enemyUnits = [
                { x: 1, y: 0, type: 'knight' },
                { x: 6, y: 0, type: 'knight' }
            ];
            const playerUnitInstances = playerUnits.map((u, i) => {
                const unit = new Unit(u.x, u.y, u.type, true, `player_${i}`);
                if (i === 0) unit.canAttack = false;
                return unit;
            });
            const enemyUnitInstances = enemyUnits.map((u, i) =>
                new Unit(u.x, u.y, u.type, false, `enemy_${i}`)
            );
            const pages = LevelManager.getTutorialPages();
            return {
                board,
                units: [...playerUnitInstances, ...enemyUnitInstances],
                name,
                objectives: (pages[2] && pages[2].objectives) ? pages[2].objectives : ['Survive for 5 turns.'],
                isBoss: false,
                enemyAP: 12,
                isTutorial: true,
                tutorialPageIndex: 2,
                surviveTurns: 5
            };
        }

        return null;
    }

    loadLevel(levelNumber) {
        const levelData = this.getLevel(levelNumber);
        if (!levelData) return null;

        const shape = levelData.shape === 'arena' ? 'arena' : 'normal';
        const board = Board.generateLevel(
            levelData.width,
            levelData.height,
            levelData.difficulty,
            levelNumber,
            shape
        );

        let playerUnits, enemyUnits;
        if (levelData.enemyFormation === 'chess') {
            const picked = LevelManager.pickSpawns(board, levelData.playerRoster, []);
            playerUnits = picked.playerUnits;
            enemyUnits = LevelManager.getChessFormationEnemies(board);
        } else {
            const picked = LevelManager.pickSpawns(board, levelData.playerRoster, levelData.enemyRoster);
            playerUnits = picked.playerUnits;
            enemyUnits = picked.enemyUnits;
        }

        // 3) Create unit instances
        const playerUnitInstances = playerUnits.map((u, i) =>
            new Unit(u.x, u.y, u.type, true, `player_${i}`)
        );
        const enemyUnitInstances = enemyUnits.map((u, i) =>
            new Unit(u.x, u.y, u.type, false, `enemy_${i}`)
        );

        // 4) Boss levels: mark exactly one enemy as the boss (first matching bossType) and boost its stats
        const bossType = levelData.bossType && levelData.isBoss ? String(levelData.bossType).toLowerCase() : null;
        if (bossType) {
            const bossUnit = enemyUnitInstances.find(u => (u.pieceType || '').toLowerCase() === bossType);
            if (bossUnit) {
                bossUnit.isBoss = true;
                if (levelData.bossName) bossUnit.bossDisplayName = levelData.bossName;
                bossUnit.maxHealth = Math.max(12, Math.ceil(bossUnit.maxHealth * 3.5));
                bossUnit.health = bossUnit.maxHealth;
                bossUnit.attack = Math.min(8, bossUnit.attack + 3);
                bossUnit.defense = Math.min(4, bossUnit.defense + 2);
                if (bossType === 'bishop' && levelData.bossName && levelData.bossName.toLowerCase().includes('valdris')) {
                    bossUnit.shadowBishop = true;
                    bossUnit.bishopDiagonalParity = 0;
                }
            }
        }

        return {
            board,
            units: [...playerUnitInstances, ...enemyUnitInstances],
            name: levelData.name,
            isBoss: !!levelData.isBoss,
            enemyAP: levelData.isBoss ? 18 : 12,
            objectives: levelData.objectives || ['Eliminate all enemy units.'],
            optionalObjectives: levelData.optionalObjectives || []
        };
    }

    hasNextLevel() {
        return this.currentLevel < this.levels.length;
    }

    nextLevel() {
        if (this.hasNextLevel()) {
            this.currentLevel++;
            return this.loadLevel(this.currentLevel);
        }
        return null;
    }
}
