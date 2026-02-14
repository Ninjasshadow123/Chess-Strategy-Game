// Chess piece movement patterns
class ChessMoves {
    // Get all valid moves for a piece type from a given position
    static getMoves(pieceType, x, y, boardWidth, boardHeight, board, isPlayerUnit = true) {
        switch (pieceType.toLowerCase()) {
            case 'pawn':
                return this.getPawnMoves(x, y, boardWidth, boardHeight, board, isPlayerUnit);
            case 'rook':
                return this.getRookMoves(x, y, boardWidth, boardHeight, board);
            case 'bishop':
                return this.getBishopMoves(x, y, boardWidth, boardHeight, board);
            case 'knight':
                return this.getKnightMoves(x, y, boardWidth, boardHeight, board);
            case 'queen':
                return this.getQueenMoves(x, y, boardWidth, boardHeight, board);
            case 'king':
                return this.getKingMoves(x, y, boardWidth, boardHeight, board);
            default:
                return [];
        }
    }

    // Pawn moves: 1 square forward or backward (can travel back), diagonal attack in all 4 diagonals
    static getPawnMoves(x, y, boardWidth, boardHeight, board, isPlayerUnit) {
        const moves = [];

        // Straight move: 1 square in either direction (so pawns stay useful after reaching the end)
        for (const dy of [-1, 1]) {
            const ny = y + dy;
            if (ny >= 0 && ny < boardHeight && !board[ny][x]) {
                moves.push({ x, y: ny });
            }
        }

        // Diagonal attacks: all 4 diagonals (can attack any adjacent diagonal)
        const attackMoves = [
            { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
            { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 }
        ];
        for (const move of attackMoves) {
            if (move.x >= 0 && move.x < boardWidth && move.y >= 0 && move.y < boardHeight) {
                moves.push(move);
            }
        }

        return moves;
    }

    // Rook moves: horizontal and vertical lines
    static getRookMoves(x, y, boardWidth, boardHeight, board) {
        const moves = [];
        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 0, dy: 1 },  // Down
            { dx: -1, dy: 0 }, // Left
            { dx: 1, dy: 0 }   // Right
        ];

        for (const dir of directions) {
            for (let i = 1; i < Math.max(boardWidth, boardHeight); i++) {
                const newX = x + (dir.dx * i);
                const newY = y + (dir.dy * i);

                if (newX < 0 || newX >= boardWidth || newY < 0 || newY >= boardHeight) {
                    break;
                }

                moves.push({ x: newX, y: newY });

                // Stop if we hit an obstacle
                if (board[newY][newX]) {
                    break;
                }
            }
        }

        return moves;
    }

    // Bishop moves: diagonal lines
    static getBishopMoves(x, y, boardWidth, boardHeight, board) {
        const moves = [];
        const directions = [
            { dx: -1, dy: -1 }, // Up-left
            { dx: 1, dy: -1 },  // Up-right
            { dx: -1, dy: 1 },  // Down-left
            { dx: 1, dy: 1 }    // Down-right
        ];

        for (const dir of directions) {
            for (let i = 1; i < Math.max(boardWidth, boardHeight); i++) {
                const newX = x + (dir.dx * i);
                const newY = y + (dir.dy * i);

                if (newX < 0 || newX >= boardWidth || newY < 0 || newY >= boardHeight) {
                    break;
                }

                moves.push({ x: newX, y: newY });

                // Stop if we hit an obstacle
                if (board[newY][newX]) {
                    break;
                }
            }
        }

        return moves;
    }

    // Knight moves: L-shaped
    static getKnightMoves(x, y, boardWidth, boardHeight, board) {
        const moves = [];
        const knightMoves = [
            { dx: -2, dy: -1 }, { dx: -2, dy: 1 },
            { dx: -1, dy: -2 }, { dx: -1, dy: 2 },
            { dx: 1, dy: -2 }, { dx: 1, dy: 2 },
            { dx: 2, dy: -1 }, { dx: 2, dy: 1 }
        ];

        for (const move of knightMoves) {
            const newX = x + move.dx;
            const newY = y + move.dy;

            if (newX >= 0 && newX < boardWidth && newY >= 0 && newY < boardHeight) {
                moves.push({ x: newX, y: newY });
            }
        }

        return moves;
    }

    // Queen moves: combination of rook and bishop
    static getQueenMoves(x, y, boardWidth, boardHeight, board) {
        return [
            ...this.getRookMoves(x, y, boardWidth, boardHeight, board),
            ...this.getBishopMoves(x, y, boardWidth, boardHeight, board)
        ];
    }

    // King moves: one square in any direction
    static getKingMoves(x, y, boardWidth, boardHeight, board) {
        const moves = [];
        const directions = [
            { dx: -1, dy: -1 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 },
            { dx: -1, dy: 0 },                     { dx: 1, dy: 0 },
            { dx: -1, dy: 1 },  { dx: 0, dy: 1 }, { dx: 1, dy: 1 }
        ];

        for (const dir of directions) {
            const newX = x + dir.dx;
            const newY = y + dir.dy;

            if (newX >= 0 && newX < boardWidth && newY >= 0 && newY < boardHeight) {
                moves.push({ x: newX, y: newY });
            }
        }

        return moves;
    }

    // Get attack range (for visualization)
    static getAttackRange(pieceType, x, y, boardWidth, boardHeight, board, isPlayerUnit = true) {
        switch (pieceType.toLowerCase()) {
            case 'pawn':
                return [
                    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
                    { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 }
                ].filter(m => m.x >= 0 && m.x < boardWidth && m.y >= 0 && m.y < boardHeight);
            case 'knight':
            case 'king':
                return this.getMoves(pieceType, x, y, boardWidth, boardHeight, board, isPlayerUnit);
            default:
                // For rook, bishop, queen - attack range is same as move range
                return this.getMoves(pieceType, x, y, boardWidth, boardHeight, board, isPlayerUnit);
        }
    }
}
