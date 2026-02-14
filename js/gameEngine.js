// Main game engine
class GameEngine {
    constructor(canvas, board, units = [], options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.board = board;
        this.units = units;
        this.isBoss = !!(options && options.isBoss);
        this.isTutorial = !!(options && options.isTutorial);
        this.tutorialPageIndex = (options && options.tutorialPageIndex != null) ? options.tutorialPageIndex : -1;
        this.surviveTurns = (options && options.surviveTurns != null) ? options.surviveTurns : null;
        this.maxEnemyActionPoints = (options && options.enemyAP != null) ? options.enemyAP : 12;
        this.enemyActionPoints = 0;

        this.selectedUnit = null;
        this.validMoves = [];
        this.attackRange = [];
        this.hoveredTile = null;

        this.turn = 1;
        this.isPlayerTurn = true;
        this.gameState = 'playing'; // playing, victory, defeat

        // Score tracking
        this.totalAPSpent = 0;
        this.playerUnitsLost = [];

        // Shared action points per turn (for whole team)
        this.maxPlayerActionPoints = 12;
        this.playerActionPoints = this.maxPlayerActionPoints;
        // Enemy team shared AP (higher on boss levels via options.enemyAP)
        // Attack effect (projectile or slash)
        this.attackEffect = null;
        this.attackEffectAnimationId = null;
        this.areaBlastEffect = null;
        this.enemyPreview = null;

        this.setupCanvas();
        this.setupEventListeners();
    }

    setupCanvas() {
        const sidePadding = 40;
        this.topStrip = this.isBoss ? 56 : 0;
        this.bottomStrip = this.isBoss ? 56 : 0;
        this.offsetX = sidePadding;
        this.offsetY = this.topStrip;
        this.logicalContentWidth = sidePadding * 2 + this.board.width * this.board.tileSize;
        this.logicalContentHeight = this.topStrip + this.board.height * this.board.tileSize + this.bottomStrip;

        const container = this.canvas.parentElement;
        if (container && container.clientWidth > 0 && container.clientHeight > 0) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            const scale = Math.min(
                this.canvas.width / this.logicalContentWidth,
                this.canvas.height / this.logicalContentHeight
            );
            this.scale = scale;
            this.drawOffsetX = (this.canvas.width - this.logicalContentWidth * scale) / 2;
            this.drawOffsetY = (this.canvas.height - this.logicalContentHeight * scale) / 2;
        } else {
            this.canvas.width = this.logicalContentWidth;
            this.canvas.height = this.logicalContentHeight;
            this.scale = 1;
            this.drawOffsetX = 0;
            this.drawOffsetY = 0;
        }
    }

    setupEventListeners() {
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('resize', () => {
            if (this.canvas.parentElement) {
                this.setupCanvas();
                this.render();
            }
        });
    }

    eventToLogical(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const logicalX = (clientX - rect.left - this.drawOffsetX) / this.scale;
        const logicalY = (clientY - rect.top - this.drawOffsetY) / this.scale;
        return { x: logicalX, y: logicalY };
    }

    handleClick(e) {
        if (this.gameState !== 'playing' || !this.isPlayerTurn) return;

        const { x: logicalX, y: logicalY } = this.eventToLogical(e.clientX, e.clientY);
        const boardPixelX = logicalX - this.offsetX;
        const boardPixelY = logicalY - this.offsetY;
        const boardPos = this.board.worldToBoard(boardPixelX, boardPixelY);
        
        if (!this.board.isValidPosition(boardPos.x, boardPos.y)) return;

        // Check if clicking on a unit
        const clickedUnit = this.getUnitAt(boardPos.x, boardPos.y);
        
        if (clickedUnit) {
            if (clickedUnit.isPlayerUnit) {
                // Select player unit
                this.selectUnit(clickedUnit);
            } else if (this.selectedUnit) {
                // Attack only if target is in this unit's chess-valid attack range
                const canAttackHere = this.attackRange.some(
                    r => r.x === boardPos.x && r.y === boardPos.y
                );
                if (canAttackHere) {
                    this.attackUnit(this.selectedUnit, clickedUnit);
                }
            }
        } else if (this.selectedUnit) {
            // Try to move selected unit
            const isValidMove = this.validMoves.some(
                m => m.x === boardPos.x && m.y === boardPos.y
            );
            
            if (isValidMove && !this.getUnitAt(boardPos.x, boardPos.y)) {
                this.moveUnit(this.selectedUnit, boardPos.x, boardPos.y);
            } else {
                // Deselect if clicking empty invalid space
                this.selectedUnit = null;
                this.validMoves = [];
                this.attackRange = [];
            }
        }
        
        this.render();
    }

    handleMouseMove(e) {
        const { x: logicalX, y: logicalY } = this.eventToLogical(e.clientX, e.clientY);
        const boardPixelX = logicalX - this.offsetX;
        const boardPixelY = logicalY - this.offsetY;
        const boardPos = this.board.worldToBoard(boardPixelX, boardPixelY);
        
        if (this.board.isValidPosition(boardPos.x, boardPos.y)) {
            this.hoveredTile = boardPos;
        } else {
            this.hoveredTile = null;
        }
        
        this.render();
    }

    selectUnit(unit) {
        if (!unit.isPlayerUnit || !unit.isAlive()) return;
        
        this.selectedUnit = unit;
        unit.selected = true;
        
        // Get valid moves (filter out positions with obstacles or any unit - no moving onto units)
        const allMoves = unit.getValidMoves(this.board.width, this.board.height, this.board.grid);
        this.validMoves = allMoves.filter(move => {
            if (this.board.hasObstacle(move.x, move.y)) return false;
            const unitAtPos = this.getUnitAt(move.x, move.y);
            if (unitAtPos) return false; // cannot move onto any unit
            return true;
        });
        
        // Get attack range (tiles with enemies only); block line-of-sight through obstacles; respect unit.canAttack
        const allAttacks = (unit.canAttack !== false) ? unit.getAttackRange(this.board.width, this.board.height, this.board.grid) : [];
        this.attackRange = allAttacks.filter(attack => {
            const unitAtPos = this.getUnitAt(attack.x, attack.y);
            if (!unitAtPos || unitAtPos.isPlayerUnit || !unitAtPos.isAlive()) return false;
            // Rook, bishop, queen: must have clear line of sight (no obstacles between)
            if (['rook', 'bishop', 'queen'].includes(unit.pieceType.toLowerCase())) {
                if (!this.hasLineOfSight(unit.x, unit.y, attack.x, attack.y)) return false;
            }
            return true;
        });
        
        this.updateUnitInfo();
    }

    // Returns true if no obstacle on the line between (ax,ay) and (bx,by); excludes endpoints
    hasLineOfSight(ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps <= 0) return true;
        const stepX = dx / steps;
        const stepY = dy / steps;
        for (let i = 1; i < steps; i++) {
            const tx = Math.round(ax + stepX * i);
            const ty = Math.round(ay + stepY * i);
            if (this.board.hasObstacle(tx, ty)) return false;
        }
        return true;
    }

    // True if any unit (alive) is on the line between (ax,ay) and (bx,by), excluding those cells
    hasUnitInBetween(ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps <= 1) return false;
        const stepX = dx / steps;
        const stepY = dy / steps;
        for (let i = 1; i < steps; i++) {
            const tx = Math.round(ax + stepX * i);
            const ty = Math.round(ay + stepY * i);
            if (this.getUnitAt(tx, ty)) return true;
        }
        return false;
    }

    moveUnit(unit, x, y) {
        const cost = unit.getMoveCost();
        if (this.playerActionPoints < cost) return false;
        
        this.playerActionPoints -= cost;
        this.totalAPSpent += cost;
        unit.x = x;
        unit.y = y;
        
        this.selectedUnit = null;
        this.validMoves = [];
        this.attackRange = [];
        this.updateUnitInfo();
        this.updateUI();
        return true;
    }

    attackUnit(attacker, target) {
        if (target.isPlayerUnit || !target.isAlive()) return;
        
        const cost = attacker.getAttackCost();
        if (this.playerActionPoints < cost) return;
        
        this.playerActionPoints -= cost;
        this.totalAPSpent += cost;
        const damage = Math.max(1, attacker.attack - target.defense);
        target.health = Math.max(0, target.health - damage);
        
        this.showAttackEffect(attacker, target);
        
        if (!target.isAlive()) {
            if ((target.pieceType || '').toLowerCase() === 'king') {
                this.units = this.units.filter(u => u.id !== target.id);
                this.gameState = 'victory';
                document.getElementById('victory-screen').classList.remove('hidden');
                if (typeof onVictory === 'function') onVictory();
                return;
            }
            this.units = this.units.filter(u => u.id !== target.id);
        }
        
        this.selectedUnit = null;
        this.validMoves = [];
        this.attackRange = [];
        this.updateUnitInfo();
        this.updateUI();
        this.checkGameState();
    }

    isRangedAttacker(pieceType) {
        return ['rook', 'bishop', 'queen'].includes((pieceType || '').toLowerCase());
    }

    showAttackEffect(attacker, target) {
        const from = this.board.boardToWorld(attacker.x, attacker.y);
        const to = this.board.boardToWorld(target.x, target.y);
        const dx = Math.abs(attacker.x - target.x);
        const dy = Math.abs(attacker.y - target.y);
        // Chess rules: adjacent = orthogonally or diagonally beside (Chebyshev <= 1) = slash
        // Knight only attacks L-shape (never adjacent), so always projectile
        const isAdjacent = Math.max(dx, dy) <= 1;
        const isMelee = isAdjacent && (attacker.pieceType || '').toLowerCase() !== 'knight';
        this.attackEffect = {
            from: { x: from.x + this.offsetX, y: from.y + this.offsetY },
            to: { x: to.x + this.offsetX, y: to.y + this.offsetY },
            isRanged: !isMelee,
            startTime: Date.now(),
            duration: isMelee ? 280 : 360
        };
        const self = this;
        function tick() {
            if (!self.attackEffect) return;
            self.render();
            if (Date.now() - self.attackEffect.startTime < self.attackEffect.duration) {
                self.attackEffectAnimationId = requestAnimationFrame(tick);
            } else {
                self.attackEffect = null;
                self.attackEffectAnimationId = null;
            }
        }
        if (this.attackEffectAnimationId) cancelAnimationFrame(this.attackEffectAnimationId);
        this.attackEffectAnimationId = requestAnimationFrame(tick);
    }

    showAreaBlastEffect(cx, cy) {
        const world = this.board.boardToWorld(cx, cy);
        this.areaBlastEffect = {
            cx: world.x + this.offsetX,
            cy: world.y + this.offsetY,
            startTime: Date.now(),
            duration: 400
        };
        const self = this;
        function tick() {
            if (!self.areaBlastEffect) return;
            self.render();
            if (Date.now() - self.areaBlastEffect.startTime < self.areaBlastEffect.duration) {
                requestAnimationFrame(tick);
            } else {
                self.areaBlastEffect = null;
            }
        }
        requestAnimationFrame(tick);
    }

    getUnitAt(x, y) {
        return this.units.find(u => u.x === x && u.y === y && u.isAlive());
    }

    // Tiles that any alive player unit can attack (for boss retreat AI)
    getThreatenedTiles() {
        const threatened = new Set();
        const playerUnits = this.units.filter(u => u.isPlayerUnit && u.isAlive());
        for (const p of playerUnits) {
            const range = p.getAttackRange(this.board.width, this.board.height, this.board.grid);
            for (const r of range) {
                if (['rook', 'bishop', 'queen'].includes((p.pieceType || '').toLowerCase()) &&
                    !this.hasLineOfSight(p.x, p.y, r.x, r.y)) continue;
                threatened.add(r.x + ',' + r.y);
            }
        }
        return threatened;
    }

    // All 8 adjacent tiles to (x,y)
    static getAdjacent8(x, y) {
        const out = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
                if (dx !== 0 || dy !== 0) out.push({ x: x + dx, y: y + dy });
        return out;
    }

    // After a boss attacks, they get one free move (no AP) to escape. Doesn't count as their normal move.
    doBossRetreat(enemy, enemyUnits) {
        if (enemy.hasDoneFreeRetreat) {
            setTimeout(() => this.processNextEnemyAction(enemyUnits), GameEngine.ENEMY_AFTER_ACTION_MS);
            return;
        }
        const playerUnits = this.units.filter(u => u.isPlayerUnit && u.isAlive());
        const threatened = this.isBoss ? this.getThreatenedTiles() : null;
        const moves = enemy.getValidMoves(this.board.width, this.board.height, this.board.grid);
        const isKnight = (enemy.pieceType || '').toLowerCase() === 'knight';
        const validMoves = moves.filter(m => {
            if (m.x < 0 || m.x >= this.board.width || m.y < 0 || m.y >= this.board.height) return false;
            if (this.board.hasObstacle(m.x, m.y)) return false;
            if (this.getUnitAt(m.x, m.y)) return false;
            if (!isKnight && this.hasUnitInBetween(enemy.x, enemy.y, m.x, m.y)) return false;
            return true;
        });
        const ref = enemy.assignedTarget && enemy.assignedTarget.isAlive() ? enemy.assignedTarget : playerUnits[0];
        let best = null;
        let bestScore = -1e9;
        for (const m of validMoves) {
            const distFromRef = ref ? Math.abs(m.x - ref.x) + Math.abs(m.y - ref.y) : 0;
            const safe = !threatened || !threatened.has(m.x + ',' + m.y);
            let score = distFromRef;
            if (threatened && safe) score += 500;
            if (threatened && threatened.has(enemy.x + ',' + enemy.y) && safe) score += 300;
            if (score > bestScore) { bestScore = score; best = m; }
        }
        if (best) {
            enemy.hasDoneFreeRetreat = true;
            this.enemyPreview = { type: 'move', enemy, dest: best };
            this.render();
            this.updateUI();
            setTimeout(() => {
                this.enemyPreview = null;
                enemy.x = best.x;
                enemy.y = best.y;
                this.render();
                this.updateUI();
                setTimeout(() => this.processNextEnemyAction(enemyUnits), GameEngine.ENEMY_AFTER_ACTION_MS);
            }, GameEngine.ENEMY_PREVIEW_MS);
        } else {
            setTimeout(() => this.processNextEnemyAction(enemyUnits), GameEngine.ENEMY_AFTER_ACTION_MS);
        }
    }

    endTurn() {
        if (!this.isPlayerTurn || this.gameState !== 'playing') return;
        
        this.isPlayerTurn = false;
        this.selectedUnit = null;
        this.validMoves = [];
        this.attackRange = [];
        this.updateTurnStatus();
        this.updateUI();
        this.render();
        
        setTimeout(() => this.processEnemyTurn(), 400);
    }

    static ENEMY_ACTION_DELAY_MS = 720;
    static ENEMY_PREVIEW_MS = 780;
    static ENEMY_AFTER_ACTION_MS = 520;

    processEnemyTurn() {
        // Defend tutorial (page 2): enemies must act. Other tutorial pages: skip enemy turn.
        if (this.isTutorial && this.tutorialPageIndex !== 2) {
            setTimeout(() => this.finishEnemyTurn(), 500);
            return;
        }
        const enemyUnits = this.units.filter(u => !u.isPlayerUnit && u.isAlive());
        let playerUnits = this.units.filter(u => u.isPlayerUnit && u.isAlive());
        if (playerUnits.length === 0) {
            this.finishEnemyTurn();
            return;
        }
        this.enemyActionPoints = this.maxEnemyActionPoints;
        const targetCount = {};
        playerUnits.forEach(p => { targetCount[p.id] = 0; });
        for (const enemy of enemyUnits) {
            const sorted = [...playerUnits].sort((a, b) => {
                const da = Math.abs(enemy.x - a.x) + Math.abs(enemy.y - a.y);
                const db = Math.abs(enemy.x - b.x) + Math.abs(enemy.y - b.y);
                const na = targetCount[a.id] || 0;
                const nb = targetCount[b.id] || 0;
                return (da + 60 * na) - (db + 60 * nb);
            });
            if (sorted.length === 0) enemy.assignedTarget = null;
            else {
                const chosen = sorted[0];
                enemy.assignedTarget = chosen;
                targetCount[chosen.id] = (targetCount[chosen.id] || 0) + 1;
            }
        }
        for (const u of enemyUnits) {
            u.resetTurn();
            if (u.shadowBishop && (u.pieceType || '').toLowerCase() === 'bishop') {
                const target = u.assignedTarget && u.assignedTarget.isAlive() ? u.assignedTarget : playerUnits[0];
                if (target) {
                    u.bishopDiagonalParity = (target.x + target.y) % 2;
                } else {
                    const healthRatio = u.health / u.maxHealth;
                    u.bishopDiagonalParity = (this.turn % 2 + (healthRatio < 0.5 ? 1 : 0)) % 2;
                }
            }
        }
        this.processNextEnemyAction(enemyUnits);
    }

    processNextEnemyAction(enemyUnits) {
        let playerUnits = this.units.filter(u => u.isPlayerUnit && u.isAlive());
        if (playerUnits.length === 0) {
            this.finishEnemyTurn();
            return;
        }
        if (this.enemyActionPoints <= 0) {
            this.finishEnemyTurn();
            return;
        }

        // Valdris (shadow bishop): one free adjacent step to switch diagonal color per turn (no AP, doesn't count as move)
        for (const enemy of enemyUnits) {
            if (!enemy.isAlive() || !enemy.shadowBishop || (enemy.pieceType || '').toLowerCase() !== 'bishop') continue;
            if (enemy.hasDoneFreeColorSwitch) continue;
            const target = enemy.assignedTarget && enemy.assignedTarget.isAlive() ? enemy.assignedTarget : playerUnits[0];
            if (!target) continue;
            const myParity = (enemy.x + enemy.y) % 2;
            const targetParity = (target.x + target.y) % 2;
            if (myParity === targetParity) continue;
            const adj = GameEngine.getAdjacent8(enemy.x, enemy.y);
            const freeSwitches = adj.filter(a => {
                if (a.x < 0 || a.x >= this.board.width || a.y < 0 || a.y >= this.board.height) return false;
                if (this.board.hasObstacle(a.x, a.y)) return false;
                if (this.getUnitAt(a.x, a.y)) return false;
                if ((a.x + a.y) % 2 === myParity) return false;
                return true;
            });
            if (freeSwitches.length === 0) continue;
            freeSwitches.sort((a, b) => {
                const da = Math.abs(a.x - target.x) + Math.abs(a.y - target.y);
                const db = Math.abs(b.x - target.x) + Math.abs(b.y - target.y);
                return da - db;
            });
            const dest = freeSwitches[0];
            this.enemyPreview = { type: 'move', enemy, dest };
            this.render();
            this.updateUI();
            setTimeout(() => {
                this.enemyPreview = null;
                enemy.x = dest.x;
                enemy.y = dest.y;
                enemy.hasDoneFreeColorSwitch = true;
                enemy.bishopDiagonalParity = targetParity;
                this.render();
                this.updateUI();
                setTimeout(() => this.processNextEnemyAction(enemyUnits), GameEngine.ENEMY_AFTER_ACTION_MS);
            }, GameEngine.ENEMY_PREVIEW_MS);
            return;
        }

        // Boss-only: Rook/Queen area blast (all 8 adjacent tiles, player units only, one-shot)
        if (this.isBoss) {
            for (const enemy of enemyUnits) {
                if (!enemy.isAlive() || !enemy.isBoss || enemy.hasActed) continue;
                const pt = (enemy.pieceType || '').toLowerCase();
                if (pt !== 'rook' && pt !== 'queen') continue;
                const cost = enemy.getAttackCost();
                if (this.enemyActionPoints < cost) continue;
                const adj = GameEngine.getAdjacent8(enemy.x, enemy.y);
                const playersInAdj = playerUnits.filter(p => adj.some(a => a.x === p.x && a.y === p.y));
                if (playersInAdj.length === 0) continue;
                this.enemyPreview = { type: 'attack', enemy, target: playersInAdj[0], area: true };
                this.render();
                this.updateUI();
                setTimeout(() => {
                    this.enemyPreview = null;
                    this.enemyActionPoints -= cost;
                    enemy.hasActed = true;
                    for (const p of playersInAdj) {
                        this.playerUnitsLost.push((p.pieceType || 'pawn').toLowerCase());
                        p.health = 0;
                        this.units = this.units.filter(u => u.id !== p.id);
                    }
                    this.showAreaBlastEffect(enemy.x, enemy.y);
                    this.render();
                    this.updateUI();
                    this.checkGameState();
                    const afterMs = 400 + GameEngine.ENEMY_AFTER_ACTION_MS;
                    if (enemy.isBoss && !enemy.hasDoneFreeRetreat) {
                        setTimeout(() => this.doBossRetreat(enemy, enemyUnits), afterMs);
                    } else {
                        setTimeout(() => this.processNextEnemyAction(enemyUnits), afterMs);
                    }
                }, GameEngine.ENEMY_PREVIEW_MS);
                return;
            }
            // Boss King: line attack (one cardinal direction; hits all units in line - player and enemy in way)
            for (const enemy of enemyUnits) {
                if (!enemy.isAlive() || !enemy.isBoss || enemy.hasActed) continue;
                if ((enemy.pieceType || '').toLowerCase() !== 'king') continue;
                const cost = enemy.getAttackCost();
                if (this.enemyActionPoints < cost) continue;
                const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
                let bestLine = [];
                for (const d of dirs) {
                    const line = [];
                    for (let i = 1; i < Math.max(this.board.width, this.board.height); i++) {
                        const nx = enemy.x + d.dx * i, ny = enemy.y + d.dy * i;
                        if (nx < 0 || nx >= this.board.width || ny < 0 || ny >= this.board.height) break;
                        if (this.board.hasObstacle(nx, ny)) break;
                        const u = this.getUnitAt(nx, ny);
                        if (u) line.push(u);
                    }
                    if (line.some(u => u.isPlayerUnit) && line.length > bestLine.length) bestLine = line;
                }
                if (bestLine.length > 0) {
                    const firstPlayer = bestLine.find(u => u.isPlayerUnit);
                    this.enemyPreview = { type: 'attack', enemy, target: firstPlayer || bestLine[0] };
                    this.render();
                    this.updateUI();
                    setTimeout(() => {
                        this.enemyPreview = null;
                        this.enemyActionPoints -= cost;
                        enemy.hasActed = true;
                        for (const u of bestLine) {
                            if (u.isPlayerUnit) this.playerUnitsLost.push((u.pieceType || 'pawn').toLowerCase());
                            u.health = 0;
                            this.units = this.units.filter(unit => unit.id !== u.id);
                        }
                        const last = bestLine[bestLine.length - 1];
                        this.showAttackEffect(enemy, last);
                        this.render();
                        this.updateUI();
                        this.checkGameState();
                        const afterMs = 400 + GameEngine.ENEMY_AFTER_ACTION_MS;
                        if (enemy.isBoss && !enemy.hasDoneFreeRetreat) {
                            setTimeout(() => this.doBossRetreat(enemy, enemyUnits), afterMs);
                        } else {
                            setTimeout(() => this.processNextEnemyAction(enemyUnits), afterMs);
                        }
                    }, GameEngine.ENEMY_PREVIEW_MS);
                    return;
                }
            }
        }

        const attacks = [];
        for (const enemy of enemyUnits) {
            if (!enemy.isAlive() || enemy.hasActed) continue;
            const cost = enemy.getAttackCost();
            if (this.enemyActionPoints < cost) continue;
            const attackRange = enemy.getAttackRange(this.board.width, this.board.height, this.board.grid);
            const needLOS = this.isRangedAttacker(enemy.pieceType);
            for (const p of playerUnits) {
                if (!attackRange.some(a => a.x === p.x && a.y === p.y)) continue;
                if (needLOS && !this.hasLineOfSight(enemy.x, enemy.y, p.x, p.y)) continue;
                const damage = enemy.isBoss ? p.health : Math.max(1, enemy.attack - p.defense);
                const wouldKill = p.health <= damage;
                let score = wouldKill ? 1000 - p.health : (100 - p.health);
                if (enemy.assignedTarget && p.id === enemy.assignedTarget.id) score += 250;
                attacks.push({ enemy, target: p, cost, score, damage });
            }
        }
        if (attacks.length > 0) {
            attacks.sort((a, b) => b.score - a.score);
            const chosen = attacks[0];
            const { enemy, target, cost, damage } = chosen;
            this.enemyPreview = { type: 'attack', enemy, target };
            this.render();
            this.updateUI();
            setTimeout(() => {
                this.enemyPreview = null;
                this.enemyActionPoints -= cost;
                enemy.hasActed = true;
                const actualDamage = damage != null ? damage : (enemy.isBoss ? target.health : Math.max(1, enemy.attack - target.defense));
                target.health = Math.max(0, target.health - actualDamage);
                this.showAttackEffect(enemy, target);
                if (!target.isAlive()) {
                    this.playerUnitsLost.push((target.pieceType || 'pawn').toLowerCase());
                    this.units = this.units.filter(u => u.id !== target.id);
                }
                this.render();
                this.updateUI();
                this.checkGameState();
                const afterMs = 380 + GameEngine.ENEMY_AFTER_ACTION_MS;
                if (enemy.isBoss && !enemy.hasDoneFreeRetreat) {
                    setTimeout(() => this.doBossRetreat(enemy, enemyUnits), afterMs);
                } else {
                    setTimeout(() => this.processNextEnemyAction(enemyUnits), afterMs);
                }
            }, GameEngine.ENEMY_PREVIEW_MS);
            return;
        }

        const threatened = this.isBoss ? this.getThreatenedTiles() : null;
        let bestMove = null;
        let bestScore = -1e9;
        for (const enemy of enemyUnits) {
            const targetPlayer = enemy.assignedTarget && enemy.assignedTarget.isAlive() ? enemy.assignedTarget : null;
            if (!targetPlayer || !enemy.isAlive() || enemy.hasMoved) continue;
            const moveCost = enemy.getMoveCost();
            if (this.enemyActionPoints < moveCost) continue;
            const moves = enemy.getValidMoves(this.board.width, this.board.height, this.board.grid);
            const isKnight = (enemy.pieceType || '').toLowerCase() === 'knight';
            const validMoves = moves.filter(m => {
                if (this.board.hasObstacle(m.x, m.y)) return false;
                if (this.getUnitAt(m.x, m.y)) return false;
                if (!isKnight && this.hasUnitInBetween(enemy.x, enemy.y, m.x, m.y)) return false;
                return true;
            });
            const currentDist = Math.abs(enemy.x - targetPlayer.x) + Math.abs(enemy.y - targetPlayer.y);
            const currentThreatened = threatened && threatened.has(enemy.x + ',' + enemy.y);
            for (const m of validMoves) {
                const newDist = Math.abs(m.x - targetPlayer.x) + Math.abs(m.y - targetPlayer.y);
                const destSafe = !threatened || !threatened.has(m.x + ',' + m.y);
                let score = currentDist - newDist;
                if (enemy.isBoss && threatened) {
                    if (destSafe && currentThreatened) score += 400;
                    else if (destSafe) score += 150;
                    else score -= 300;
                } else if (!enemy.isBoss) {
                    score = -newDist;
                    const rangeFromDest = ChessMoves.getAttackRange(enemy.pieceType, m.x, m.y, this.board.width, this.board.height, this.board.grid, false);
                    const canAttackFromHere = playerUnits.some(p => rangeFromDest.some(r => r.x === p.x && r.y === p.y));
                    if (canAttackFromHere) score += 550;
                    const alliesNear = enemyUnits.filter(o => o !== enemy && o.isAlive() && !o.hasMoved && Math.abs(o.x - m.x) <= 2 && Math.abs(o.y - m.y) <= 2).length;
                    score -= 40 * alliesNear;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = { enemy, dest: m, cost: moveCost };
                }
            }
        }
        if (bestMove) {
            const { enemy, dest, cost } = bestMove;
            this.enemyPreview = { type: 'move', enemy, dest };
            this.render();
            this.updateUI();
            setTimeout(() => {
                this.enemyPreview = null;
                if (!this.getUnitAt(dest.x, dest.y)) {
                    this.enemyActionPoints -= cost;
                    enemy.x = dest.x;
                    enemy.y = dest.y;
                    enemy.hasMoved = true;
                }
                this.render();
                this.updateUI();
                setTimeout(() => this.processNextEnemyAction(enemyUnits), GameEngine.ENEMY_AFTER_ACTION_MS);
            }, GameEngine.ENEMY_PREVIEW_MS);
            return;
        }

        // Ensure we never end turn with an attack still possible (avoid stalemate)
        const attacksRetry = [];
        for (const enemy of enemyUnits) {
            if (!enemy.isAlive() || enemy.hasActed) continue;
            const cost = enemy.getAttackCost();
            if (this.enemyActionPoints < cost) continue;
            const attackRange = enemy.getAttackRange(this.board.width, this.board.height, this.board.grid);
            const needLOS = this.isRangedAttacker(enemy.pieceType);
            for (const p of playerUnits) {
                if (!attackRange.some(a => a.x === p.x && a.y === p.y)) continue;
                if (needLOS && !this.hasLineOfSight(enemy.x, enemy.y, p.x, p.y)) continue;
                const damage = enemy.isBoss ? p.health : Math.max(1, enemy.attack - p.defense);
                const wouldKill = p.health <= damage;
                let score = wouldKill ? 1000 - p.health : (100 - p.health);
                if (enemy.assignedTarget && p.id === enemy.assignedTarget.id) score += 250;
                attacksRetry.push({ enemy, target: p, cost, score, damage });
            }
        }
        if (attacksRetry.length > 0) {
            attacksRetry.sort((a, b) => b.score - a.score);
            const chosen = attacksRetry[0];
            const { enemy, target, cost, damage } = chosen;
            this.enemyPreview = { type: 'attack', enemy, target };
            this.render();
            this.updateUI();
            setTimeout(() => {
                this.enemyPreview = null;
                this.enemyActionPoints -= cost;
                enemy.hasActed = true;
                const actualDamage = damage != null ? damage : (enemy.isBoss ? target.health : Math.max(1, enemy.attack - target.defense));
                target.health = Math.max(0, target.health - actualDamage);
                this.showAttackEffect(enemy, target);
                if (!target.isAlive()) {
                    this.playerUnitsLost.push((target.pieceType || 'pawn').toLowerCase());
                    this.units = this.units.filter(u => u.id !== target.id);
                }
                this.render();
                this.updateUI();
                this.checkGameState();
                const afterMs = 380 + GameEngine.ENEMY_AFTER_ACTION_MS;
                if (enemy.isBoss && !enemy.hasDoneFreeRetreat) {
                    setTimeout(() => this.doBossRetreat(enemy, enemyUnits), afterMs);
                } else {
                    setTimeout(() => this.processNextEnemyAction(enemyUnits), afterMs);
                }
            }, GameEngine.ENEMY_PREVIEW_MS);
            return;
        }

        this.finishEnemyTurn();
    }

    finishEnemyTurn() {
        this.enemyPreview = null;
        this.turn++;
        this.isPlayerTurn = true;
        this.playerActionPoints = this.maxPlayerActionPoints;
        this.units.filter(u => u.isPlayerUnit).forEach(u => u.resetTurn());
        if (this.surviveTurns != null && this.turn > this.surviveTurns) {
            this.gameState = 'victory';
            document.getElementById('victory-screen').classList.remove('hidden');
            if (typeof onVictory === 'function') onVictory();
        } else {
            this.checkGameState();
        }
        this.render();
        this.updateUI();
    }

    checkGameState() {
        const playerUnits = this.units.filter(u => u.isPlayerUnit && u.isAlive());
        const enemyUnits = this.units.filter(u => !u.isPlayerUnit && u.isAlive());
        const bossAlive = this.isBoss && enemyUnits.some(u => u.isBoss);

        if (playerUnits.length === 0) {
            this.gameState = 'defeat';
            document.getElementById('defeat-screen').classList.remove('hidden');
        } else if (this.isBoss ? !bossAlive : enemyUnits.length === 0) {
            // Boss level: win when boss is dead. Non-boss: win when all enemies dead (or king already handled in playerAttack).
            this.gameState = 'victory';
            document.getElementById('victory-screen').classList.remove('hidden');
        }
    }

    static UNIT_VALUE = { pawn: 1, knight: 2, bishop: 2, rook: 3, queen: 5, king: 10 };

    getScoreResult() {
        const lostValue = this.playerUnitsLost.reduce((sum, type) => sum + (GameEngine.UNIT_VALUE[type] || 1), 0);
        const movePenalty = this.turn * 10;
        const apPenalty = this.totalAPSpent * 2;
        const score = Math.max(0, 1000 - movePenalty - apPenalty - lostValue);
        return {
            turns: this.turn,
            totalAPSpent: this.totalAPSpent,
            unitsLost: this.playerUnitsLost.slice(),
            unitsLostValue: lostValue,
            score
        };
    }

    updateUnitInfo() {
        const unitInfo = document.getElementById('unit-details');
        if (this.selectedUnit) {
            const moveCost = this.selectedUnit.getMoveCost();
            const attackCost = this.selectedUnit.getAttackCost();
            const canMove = this.playerActionPoints >= moveCost;
            const attackInRange = this.attackRange.length > 0;
            const enoughAPForAttack = this.playerActionPoints >= attackCost;
            const canAttack = attackInRange && enoughAPForAttack;
            const attackStatus = canAttack ? '✓' : (!enoughAPForAttack ? '(not enough)' : '(not available)');
            unitInfo.innerHTML = `
                <div class="unit-stat">
                    <span>Type:</span>
                    <span>${this.selectedUnit.pieceType.toUpperCase()}</span>
                </div>
                <div class="unit-stat">
                    <span>Health:</span>
                    <span>${this.selectedUnit.health}/${this.selectedUnit.maxHealth}</span>
                </div>
                <div class="unit-stat">
                    <span>Attack:</span>
                    <span>${this.selectedUnit.attack}</span>
                </div>
                <div class="unit-stat">
                    <span>Defense:</span>
                    <span>${this.selectedUnit.defense}</span>
                </div>
                <div class="unit-stat">
                    <span>Move cost:</span>
                    <span>${moveCost} AP ${canMove ? '✓' : '(not enough)'}</span>
                </div>
                <div class="unit-stat">
                    <span>Attack cost:</span>
                    <span>${attackCost} AP ${attackStatus}</span>
                </div>
            `;
        } else {
            unitInfo.innerHTML = '<p>No unit selected</p>';
        }
    }

    updateTurnStatus() {
        const el = document.getElementById('turn-status');
        if (!el) return;
        if (this.gameState !== 'playing') {
            el.textContent = '';
            return;
        }
        if (this.isPlayerTurn) {
            el.textContent = 'Your turn';
        } else {
            el.textContent = 'Enemy turn';
        }
    }

    updateUI() {
        const turnEl = document.getElementById('current-turn');
        const apEl = document.getElementById('ap-display');
        const enemyStatsEl = document.getElementById('enemy-stats-content');
        if (turnEl) turnEl.textContent = this.turn;
        if (apEl) apEl.textContent = `${this.playerActionPoints}/${this.maxPlayerActionPoints}`;
        if (enemyStatsEl) {
            const enemies = this.units.filter(u => !u.isPlayerUnit && u.isAlive());
            if (enemies.length === 0) {
                enemyStatsEl.textContent = '—';
            } else {
                enemyStatsEl.innerHTML = enemies.map(u => {
                    const name = (u.bossDisplayName || (u.pieceType || '').charAt(0).toUpperCase() + (u.pieceType || '').slice(1));
                    return `<div class="enemy-stat-line">${name}: ATK ${u.attack} DEF ${u.defense}</div>`;
                }).join('');
            }
        }
        this.updateTurnStatus();
        const endBtn = document.getElementById('end-turn-btn');
        if (endBtn) endBtn.disabled = !this.isPlayerTurn || this.gameState !== 'playing';
    }

    render() {
        // Clear canvas (device pixels)
        this.ctx.fillStyle = '#0a0a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.translate(this.drawOffsetX, this.drawOffsetY);
        this.ctx.scale(this.scale, this.scale);

        // Draw board
        for (let y = 0; y < this.board.height; y++) {
            for (let x = 0; x < this.board.width; x++) {
                const isDark = (x + y) % 2 === 0;
                const worldPos = this.board.boardToWorld(x, y);
                
                // Draw tile
                this.ctx.fillStyle = this.board.getTileColor(x, y, isDark);
                this.ctx.fillRect(
                    worldPos.x - this.board.tileSize / 2 + this.offsetX,
                    worldPos.y - this.board.tileSize / 2 + this.offsetY,
                    this.board.tileSize,
                    this.board.tileSize
                );
                
                // Draw cover indicator
                if (this.board.hasCover(x, y)) {
                    this.ctx.fillStyle = 'rgba(100, 200, 100, 0.3)';
                    this.ctx.fillRect(
                        worldPos.x - this.board.tileSize / 2 + this.offsetX,
                        worldPos.y - this.board.tileSize / 2 + this.offsetY,
                        this.board.tileSize,
                        this.board.tileSize
                    );
                }
                
                // Draw hover effect
                if (this.hoveredTile && this.hoveredTile.x === x && this.hoveredTile.y === y) {
                    this.ctx.strokeStyle = '#ffd700';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(
                        worldPos.x - this.board.tileSize / 2 + this.offsetX,
                        worldPos.y - this.board.tileSize / 2 + this.offsetY,
                        this.board.tileSize,
                        this.board.tileSize
                    );
                }
            }
        }
        
        // Draw valid moves (high-contrast cyan + outline so they stand out from board)
        for (const move of this.validMoves) {
            const worldPos = this.board.boardToWorld(move.x, move.y);
            const tx = worldPos.x - this.board.tileSize / 2 + this.offsetX;
            const ty = worldPos.y - this.board.tileSize / 2 + this.offsetY;
            this.ctx.fillStyle = 'rgba(34, 211, 238, 0.75)';
            this.ctx.fillRect(tx, ty, this.board.tileSize, this.board.tileSize);
            this.ctx.strokeStyle = 'rgba(6, 182, 212, 1)';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(tx, ty, this.board.tileSize, this.board.tileSize);
        }

        // Draw attack range (strong red + outline)
        for (const attack of this.attackRange) {
            const worldPos = this.board.boardToWorld(attack.x, attack.y);
            const tx = worldPos.x - this.board.tileSize / 2 + this.offsetX;
            const ty = worldPos.y - this.board.tileSize / 2 + this.offsetY;
            this.ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
            this.ctx.fillRect(tx, ty, this.board.tileSize, this.board.tileSize);
            this.ctx.strokeStyle = 'rgba(220, 38, 38, 1)';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(tx, ty, this.board.tileSize, this.board.tileSize);
        }
        
        // Draw units
        for (const unit of this.units) {
            if (!unit.isAlive()) continue;

            const worldPos = this.board.boardToWorld(unit.x, unit.y);
            const size = this.board.tileSize * 0.8;
            const cx = worldPos.x + this.offsetX;
            const cy = worldPos.y + this.offsetY;
            const isBossUnit = this.isBoss && unit.isBoss;

            // Boss-only: golden glow behind the unit
            if (isBossUnit) {
                this.ctx.save();
                this.ctx.shadowColor = 'rgba(212, 175, 55, 0.9)';
                this.ctx.shadowBlur = 14;
                this.ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, size / 2 + 6, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }

            // Draw unit base (gold for boss enemy, else normal colors)
            this.ctx.fillStyle = unit.isPlayerUnit ? '#4a90e2' : (isBossUnit ? '#c9a227' : '#e24a4a');
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
            this.ctx.fill();

            // Boss: subtle gold outline so they stand out
            if (isBossUnit) {
                this.ctx.strokeStyle = '#e6c84a';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }

            // Draw selection indicator
            if (unit.selected) {
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
            }

            // Draw unit type symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = `${size * 0.5}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const symbol = this.getUnitSymbol(unit.pieceType);
            this.ctx.fillText(symbol, cx, cy);

            // Health bar beside unit: all units in normal levels; in boss levels only non-boss enemies (boss gets top bar)
            const showUnitBar = !this.isBoss || !unit.isBoss;
            if (showUnitBar) {
                this.drawUnitHealthBar(unit, worldPos.x + this.offsetX, worldPos.y + this.offsetY, size);
            }
        }

        // Enemy action preview: show where they're moving or who they're attacking before it happens
        if (this.enemyPreview) {
            const p = this.enemyPreview;
            if (p.type === 'move' && p.dest) {
                const worldPos = this.board.boardToWorld(p.dest.x, p.dest.y);
                const tx = worldPos.x - this.board.tileSize / 2 + this.offsetX;
                const ty = worldPos.y - this.board.tileSize / 2 + this.offsetY;
                this.ctx.fillStyle = 'rgba(167, 139, 250, 0.6)';
                this.ctx.fillRect(tx, ty, this.board.tileSize, this.board.tileSize);
                this.ctx.strokeStyle = '#a78bfa';
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(tx, ty, this.board.tileSize, this.board.tileSize);
            } else if (p.type === 'attack' && p.target) {
                const worldPos = this.board.boardToWorld(p.target.x, p.target.y);
                const cx = worldPos.x + this.offsetX;
                const cy = worldPos.y + this.offsetY;
                const r = this.board.tileSize * 0.55;
                this.ctx.strokeStyle = 'rgba(251, 146, 60, 0.95)';
                this.ctx.lineWidth = 5;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.strokeStyle = 'rgba(251, 146, 60, 0.5)';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        // Boss levels only: single boss bar at top (only unit with isBoss), player bars at bottom
        if (this.isBoss) {
            const bossUnits = this.units.filter(u => !u.isPlayerUnit && u.isAlive() && u.isBoss);
            if (bossUnits.length > 0) {
                this.drawBossHealthStrip(bossUnits, 0, this.topStrip);
            }
            this.drawHealthStrip(this.units.filter(u => u.isPlayerUnit && u.isAlive()), this.offsetY + this.board.height * this.board.tileSize, this.bottomStrip, false);
        }

        // Area blast effect (boss Rook/Queen) — in logical space
        if (this.areaBlastEffect) {
            const e = this.areaBlastEffect;
            const elapsed = Date.now() - e.startTime;
            const t = Math.min(1, elapsed / e.duration);
            const r = this.board.tileSize * (0.3 + t * 0.5);
            this.ctx.strokeStyle = `rgba(255, 180, 80, ${1 - t})`;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(e.cx, e.cy, r, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.fillStyle = `rgba(255, 200, 100, ${0.3 * (1 - t)})`;
            this.ctx.fill();
        }

        // Attack effect: projectile (ranged) or slash (melee) — in logical space
        if (this.attackEffect) {
            const e = this.attackEffect;
            const elapsed = Date.now() - e.startTime;
            const t = Math.min(1, elapsed / e.duration);
            if (e.isRanged) {
                const x = e.from.x + (e.to.x - e.from.x) * t;
                const y = e.from.y + (e.to.y - e.from.y) * t;
                this.ctx.fillStyle = t < 0.92 ? 'rgba(255, 220, 100, 0.95)' : 'rgba(255, 180, 50, 0.7)';
                this.ctx.beginPath();
                this.ctx.arc(x, y, this.board.tileSize * 0.22, 0, Math.PI * 2);
                this.ctx.fill();
                if (t >= 0.98) {
                    this.ctx.fillStyle = 'rgba(255, 200, 80, 0.8)';
                    this.ctx.beginPath();
                    this.ctx.arc(e.to.x, e.to.y, this.board.tileSize * 0.35, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            } else {
                const cx = e.to.x;
                const cy = e.to.y;
                const len = this.board.tileSize * 0.5;
                const angle = Math.atan2(e.to.y - e.from.y, e.to.x - e.from.x);
                const slashOpacity = t < 0.5 ? t * 2 : 2 - t * 2;
                this.ctx.strokeStyle = `rgba(255, 80, 80, ${slashOpacity})`;
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(cx - Math.cos(angle) * len, cy - Math.sin(angle) * len);
                this.ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
                this.ctx.stroke();
            }
        }

        this.ctx.restore();
    }

    drawUnitHealthBar(unit, centerX, centerY, unitSize) {
        const barWidth = unitSize;
        const barHeight = 4;
        const healthPercent = unit.health / unit.maxHealth;
        const x = centerX - barWidth / 2;
        const y = centerY + unitSize / 2 + 2;
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, barWidth, barHeight);
        this.ctx.fillStyle = healthPercent > 0.5 ? '#4ade80' : healthPercent > 0.25 ? '#fbbf24' : '#ef4444';
        this.ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
    }

    drawBossHealthStrip(units, stripY, stripHeight) {
        if (units.length === 0) return;
        const pad = 6;
        const nameHeight = 14;
        const barHeight = 12;
        const contentHeight = nameHeight + 4 + barHeight;
        const contentTop = stripY + (stripHeight - contentHeight) / 2;
        const fixedBarW = 80;
        const gap = 12;
        const totalW = units.length * fixedBarW + (units.length - 1) * gap;
        let startX = (this.logicalContentWidth - totalW) / 2;
        if (startX < pad) startX = pad;
        this.ctx.font = '11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            const x = startX + i * (fixedBarW + gap);
            const bossName = (u.bossDisplayName != null && u.bossDisplayName !== '') ? u.bossDisplayName : ('Boss ' + (u.pieceType.charAt(0).toUpperCase() + u.pieceType.slice(1)));
            this.ctx.fillStyle = '#d4af37';
            this.ctx.fillText(bossName, x + fixedBarW / 2, contentTop + nameHeight / 2);
            const barY = contentTop + nameHeight + 4;
            const healthPercent = u.health / u.maxHealth;
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(x, barY, fixedBarW, barHeight);
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4ade80' : healthPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(x, barY, fixedBarW * healthPercent, barHeight);
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, barY, fixedBarW, barHeight);
        }
    }

    drawHealthStrip(units, stripY, stripHeight, isEnemy) {
        if (units.length === 0) return;
        const pad = 6;
        const symW = 16;
        const barHeight = Math.min(14, stripHeight - pad * 2);
        const fixedBarW = 70;
        const gap = 10;
        const totalW = units.length * (symW + fixedBarW) + (units.length - 1) * gap;
        let startX = (this.logicalContentWidth - totalW) / 2;
        if (startX < pad) startX = pad;
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            const slotX = startX + i * (symW + fixedBarW + gap);
            const barX = slotX + symW;
            const y = stripY + (stripHeight - barHeight) / 2;
            const healthPercent = u.health / u.maxHealth;
            this.ctx.fillStyle = '#222';
            this.ctx.fillRect(barX, y, fixedBarW, barHeight);
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4ade80' : healthPercent > 0.25 ? '#fbbf24' : '#ef4444';
            this.ctx.fillRect(barX, y, fixedBarW * healthPercent, barHeight);
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(barX, y, fixedBarW, barHeight);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(this.getUnitSymbol(u.pieceType), slotX + symW / 2, y + barHeight / 2);
        }
    }

    getUnitSymbol(pieceType) {
        const symbols = {
            'pawn': '♟',
            'rook': '♜',
            'bishop': '♝',
            'knight': '♞',
            'queen': '♛',
            'king': '♚'
        };
        return symbols[pieceType.toLowerCase()] || '?';
    }
}
