// Unit/Character class
class Unit {
    constructor(x, y, pieceType, isPlayerUnit = true, id = null) {
        this.x = x;
        this.y = y;
        this.pieceType = pieceType; // pawn, rook, bishop, knight, queen, king
        this.isPlayerUnit = isPlayerUnit;
        this.id = id || `unit_${Date.now()}_${Math.random()}`;
        
        // Strategy game stats
        this.maxActionPoints = this.getMaxAP();
        this.actionPoints = this.maxActionPoints;
        this.health = this.getMaxHealth();
        this.maxHealth = this.getMaxHealth();
        this.attack = this.getAttack();
        this.defense = this.getDefense();
        
        // State
        this.hasMoved = false;
        this.hasActed = false;
        this.hasDoneFreeColorSwitch = false;
        this.hasDoneFreeRetreat = false;
        this.selected = false;
        this.isBoss = false;
    }

    getMaxAP() {
        // Different units have different action point costs
        const apMap = {
            'pawn': 2,
            'rook': 3,
            'bishop': 3,
            'knight': 2,
            'queen': 4,
            'king': 2
        };
        return apMap[this.pieceType.toLowerCase()] || 2;
    }

    getMaxHealth() {
        const healthMap = {
            'pawn': 3,
            'rook': 5,
            'bishop': 4,
            'knight': 4,
            'queen': 6,
            'king': 5
        };
        return healthMap[this.pieceType.toLowerCase()] || 3;
    }

    getAttack() {
        const attackMap = {
            'pawn': 1,
            'rook': 2,
            'bishop': 2,
            'knight': 3,
            'queen': 3,
            'king': 2
        };
        return attackMap[this.pieceType.toLowerCase()] || 1;
    }

    getDefense() {
        const defenseMap = {
            'pawn': 0,
            'rook': 1,
            'bishop': 0,
            'knight': 1,
            'queen': 1,
            'king': 1
        };
        return defenseMap[this.pieceType.toLowerCase()] || 0;
    }

    // Per-piece costs: move and attack (balanced so pawns are cheap, king/queen expensive)
    getMoveCost() {
        const moveMap = {
            'pawn': 1,
            'rook': 2,
            'bishop': 2,
            'knight': 2,
            'queen': 3,
            'king': 4
        };
        return moveMap[this.pieceType.toLowerCase()] ?? 2;
    }

    getAttackCost() {
        const attackMap = {
            'pawn': 1,
            'rook': 3,
            'bishop': 3,
            'knight': 3,
            'queen': 4,
            'king': 5
        };
        return attackMap[this.pieceType.toLowerCase()] ?? 2;
    }

    canMove() {
        return this.actionPoints >= this.getMoveCost() && !this.hasMoved;
    }

    canAttack() {
        return this.actionPoints >= this.getAttackCost() && !this.hasActed;
    }

    resetTurn() {
        this.actionPoints = this.maxActionPoints;
        this.hasMoved = false;
        this.hasActed = false;
        this.hasDoneFreeColorSwitch = false;
        this.hasDoneFreeRetreat = false;
    }

    takeDamage(damage) {
        const actualDamage = Math.max(1, damage - this.defense);
        this.health = Math.max(0, this.health - actualDamage);
        return actualDamage;
    }

    isAlive() {
        return this.health > 0;
    }

    getValidMoves(boardWidth, boardHeight, board) {
        let moves = ChessMoves.getMoves(
            this.pieceType,
            this.x,
            this.y,
            boardWidth,
            boardHeight,
            board,
            this.isPlayerUnit
        );
        // Shadow bishop: normal move only on same diagonal color as current square (free color-switch is handled in engine)
        if (this.shadowBishop && (this.pieceType || '').toLowerCase() === 'bishop') {
            const myColor = (this.x + this.y) % 2;
            moves = moves.filter(m => (m.x + m.y) % 2 === myColor);
        }
        return moves;
    }

    getAttackRange(boardWidth, boardHeight, board) {
        let range = ChessMoves.getAttackRange(
            this.pieceType,
            this.x,
            this.y,
            boardWidth,
            boardHeight,
            board,
            this.isPlayerUnit
        );
        if (this.shadowBishop && (this.pieceType || '').toLowerCase() === 'bishop' && this.bishopDiagonalParity !== undefined) {
            const parity = this.bishopDiagonalParity;
            range = range.filter(m => (m.x + m.y) % 2 === parity);
        }
        return range;
    }

    moveTo(x, y) {
        const cost = this.getMoveCost();
        if (this.actionPoints >= cost) {
            this.x = x;
            this.y = y;
            this.actionPoints -= cost;
            this.hasMoved = true;
            return true;
        }
        return false;
    }

    attack(target) {
        const cost = this.getAttackCost();
        if (this.actionPoints >= cost) {
            this.actionPoints -= cost;
            this.hasActed = true;
            const damage = target.takeDamage(this.attack);
            return damage;
        }
        return 0;
    }
}
