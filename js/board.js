// Seeded PRNG so the same level always gives the same layout (restart = same obstacles)
function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
    };
}

// Board/World class
class Board {
    constructor(width, height, tileSize = 40) {
        this.width = width;
        this.height = height;
        this.tileSize = tileSize;
        this.obstacles = []; // Array of {x, y} positions with obstacles
        this.cover = []; // Array of {x, y} positions with cover (defensive bonus)
        
        // Initialize empty board
        this.grid = Array(height).fill(null).map(() => Array(width).fill(null));
    }

    addObstacle(x, y) {
        if (this.isValidPosition(x, y)) {
            this.obstacles.push({ x, y });
            this.grid[y][x] = 'obstacle';
        }
    }

    addCover(x, y) {
        if (this.isValidPosition(x, y)) {
            this.cover.push({ x, y });
        }
    }

    isValidPosition(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    hasObstacle(x, y) {
        return this.grid[y] && this.grid[y][x] === 'obstacle';
    }

    hasCover(x, y) {
        return this.cover.some(c => c.x === x && c.y === y);
    }

    getTileColor(x, y, isDark) {
        if (this.hasObstacle(x, y)) {
            return '#3a3a3a';
        }
        if (this.hasCover(x, y)) {
            return isDark ? '#3d5c3d' : '#4a6a4a';
        }
        return isDark ? '#5c4033' : '#c4a574';
    }

    // Convert world coordinates to board coordinates
    worldToBoard(worldX, worldY) {
        return {
            x: Math.floor(worldX / this.tileSize),
            y: Math.floor(worldY / this.tileSize)
        };
    }

    // Convert board coordinates to world coordinates (center of tile)
    boardToWorld(boardX, boardY) {
        return {
            x: boardX * this.tileSize + this.tileSize / 2,
            y: boardY * this.tileSize + this.tileSize / 2
        };
    }

    // Spawn zones: top 2 rows (enemy), bottom 2 rows (player) - no obstacles/cover there
    static getSpawnZoneForbidden(width, height) {
        const forbidden = [];
        for (let x = 0; x < width; x++) {
            forbidden.push({ x, y: 0 });
            forbidden.push({ x, y: 1 });
            forbidden.push({ x, y: height - 2 });
            forbidden.push({ x, y: height - 1 });
        }
        return forbidden;
    }

    // Middle band: rows 2 .. height-3 (ensure some obstacles so not a clear corridor)
    static getMiddleBand(height) {
        return { minY: 2, maxY: Math.max(2, height - 3) };
    }

    // Generate level layout. shape: 'normal' | 'arena' | 'tutorial' (tutorial: no obstacles). seed = deterministic.
    // Balanced obstacles: 6–16% of playable area by difficulty, cap 18%. Never flood or leave too open.
    static generateLevel(width, height, difficulty = 1, seed = null, shape = 'normal') {
        const board = new Board(width, height);
        if (shape === 'tutorial') return board;
        const rnd = seed != null ? seededRandom(seed || 0) : () => Math.random();

        const playableRows = Math.max(0, height - 4);
        const playableArea = playableRows * width;

        if (shape === 'arena') {
            for (let y = 2; y < height - 2; y++) {
                if (width > 2) {
                    board.addObstacle(0, y);
                    board.addObstacle(width - 1, y);
                }
            }
        }

        // Target obstacle fraction: 6% at low difficulty up to 16% at high, hard cap 18%
        const targetFraction = Math.min(0.18, 0.06 + (difficulty || 0) * 0.02);
        const obstacleCount = Math.min(
            Math.max(2, Math.floor(playableArea * targetFraction)),
            Math.max(2, Math.floor(playableArea * 0.18))
        );

        let placed = 0;
        const maxAttempts = obstacleCount * 4;
        for (let a = 0; a < maxAttempts && placed < obstacleCount; a++) {
            const x = Math.floor(rnd() * width);
            const y = 2 + Math.floor(rnd() * playableRows);
            if (y >= height - 2) continue;
            if (!board.hasObstacle(x, y)) {
                board.addObstacle(x, y);
                placed++;
            }
        }

        // Cover: light touch, 2–6% of playable area
        const coverFraction = Math.min(0.06, 0.02 + (difficulty || 0) * 0.008);
        const coverCount = Math.min(
            Math.floor(playableArea * coverFraction),
            Math.max(0, playableArea - board.obstacles.length - 1)
        );
        for (let i = 0; i < coverCount; i++) {
            const x = Math.floor(rnd() * width);
            const y = 2 + Math.floor(rnd() * playableRows);
            if (y >= height - 2) continue;
            if (!board.hasObstacle(x, y) && !board.hasCover(x, y)) board.addCover(x, y);
        }

        return board;
    }

    // Check if a pawn at (x,y) has a clear forward tile (player: -y, enemy: +y)
    static isPawnSpawnValid(board, x, y, isPlayerUnit) {
        const forwardY = isPlayerUnit ? y - 1 : y + 1;
        if (forwardY < 0 || forwardY >= board.height) return false;
        return !board.hasObstacle(x, forwardY);
    }
}
