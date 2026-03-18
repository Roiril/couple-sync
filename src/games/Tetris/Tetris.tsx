import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './Tetris.module.css';
import { fetchHighScore, updateHighScore } from '../highScoreApi';

const PixelLeft = () => (
  <svg viewBox="0 0 15 15" width="36" height="36" fill="currentColor" shapeRendering="crispEdges">
    <rect x="6" y="5" width="7" height="4" />
    <rect x="5" y="3" width="1" height="8" />
    <rect x="4" y="4" width="1" height="6" />
    <rect x="3" y="5" width="1" height="4" />
    <rect x="2" y="6" width="1" height="2" />
  </svg>
);

const PixelRight = () => (
  <svg viewBox="0 0 15 15" width="36" height="36" fill="currentColor" shapeRendering="crispEdges">
    <rect x="2" y="5" width="7" height="4" />
    <rect x="9" y="3" width="1" height="8" />
    <rect x="10" y="4" width="1" height="6" />
    <rect x="11" y="5" width="1" height="4" />
    <rect x="12" y="6" width="1" height="2" />
  </svg>
);

const PixelDown = () => (
  <svg viewBox="0 0 15 15" width="36" height="36" fill="currentColor" shapeRendering="crispEdges">
    <rect x="5" y="2" width="4" height="7" />
    <rect x="3" y="9" width="8" height="1" />
    <rect x="4" y="10" width="6" height="1" />
    <rect x="5" y="11" width="4" height="1" />
    <rect x="6" y="12" width="2" height="1" />
  </svg>
);

const PixelRotate = () => (
  <svg viewBox="0 0 15 15" width="36" height="36" fill="currentColor" shapeRendering="crispEdges">
    <rect x="5" y="2" width="3" height="2" />
    <rect x="3" y="3" width="2" height="2" />
    <rect x="2" y="5" width="2" height="4" />
    <rect x="3" y="9" width="2" height="2" />
    <rect x="5" y="10" width="4" height="2" />
    <rect x="9" y="9" width="2" height="2" />
    <rect x="10" y="7" width="2" height="2" />
    <rect x="7" y="6" width="8" height="1" />
    <rect x="8" y="5" width="6" height="1" />
    <rect x="9" y="4" width="4" height="1" />
    <rect x="10" y="3" width="2" height="1" />
  </svg>
);

const PixelPause = () => (
  <svg viewBox="0 0 15 15" width="24" height="24" fill="currentColor" shapeRendering="crispEdges">
    <rect x="4" y="3" width="2" height="9" />
    <rect x="9" y="3" width="2" height="9" />
  </svg>
);

const PixelPlay = () => (
  <svg viewBox="0 0 15 15" width="24" height="24" fill="currentColor" shapeRendering="crispEdges">
    <rect x="4" y="2" width="1" height="11" />
    <rect x="5" y="3" width="1" height="9" />
    <rect x="6" y="4" width="1" height="7" />
    <rect x="7" y="5" width="1" height="5" />
    <rect x="8" y="6" width="1" height="3" />
    <rect x="9" y="7" width="1" height="1" />
  </svg>
);

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

const TETROMINOS: Record<TetrominoType, { shape: number[][], color: string }> = {
  // Use visual rotation for 'I' mostly
  I: { shape: [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]], color: 'colorI' },
  J: { shape: [[0, 1, 0], [0, 1, 0], [1, 1, 0]], color: 'colorJ' },
  L: { shape: [[0, 1, 0], [0, 1, 0], [0, 1, 1]], color: 'colorL' },
  O: { shape: [[1, 1], [1, 1]], color: 'colorO' },
  S: { shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: 'colorS' },
  T: { shape: [[0, 0, 0], [1, 1, 1], [0, 1, 0]], color: 'colorT' },
  Z: { shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: 'colorZ' },
};

const randomTetromino = () => {
  const types: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
  const randType = types[Math.floor(Math.random() * types.length)];
  return TETROMINOS[randType];
};

const createEmptyBoard = () => Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(null));

interface TetrisProps {
  onBack: () => void;
}

const Tetris: React.FC<TetrisProps> = ({ onBack }) => {
  const [board, setBoard] = useState<(string | null)[][]>(createEmptyBoard());
  const [playerInfo, setPlayerInfo] = useState({
    pos: { x: 0, y: 0 },
    tetromino: TETROMINOS.I.shape,
    color: TETROMINOS.I.color,
    score: 0,
    gameOver: false,
  });
  const [isPaused, setIsPaused] = useState(false);
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [highScore, setHighScore] = useState<number>(0);

  const savedCallback = useRef<() => void>(undefined);

  const checkCollision = (piece: number[][], targetPos: { x: number, y: number }, currentBoard: (string | null)[][]) => {
    for (let y = 0; y < piece.length; y++) {
      for (let x = 0; x < piece[y].length; x++) {
        if (piece[y][x]) {
          const boardY = y + targetPos.y;
          const boardX = x + targetPos.x;
          if (
            boardY < 0 ||
            boardX < 0 ||
            boardX >= BOARD_WIDTH ||
            boardY >= BOARD_HEIGHT ||
            (currentBoard[boardY] && currentBoard[boardY][boardX])
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const mergeToBoard = useCallback((overridePos?: { x: number, y: number }) => {
    const posToUse = overridePos || playerInfo.pos;
    const newBoard = board.map(row => [...row]);
    playerInfo.tetromino.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          if (y + posToUse.y >= 0 && y + posToUse.y < BOARD_HEIGHT) {
            newBoard[y + posToUse.y][x + posToUse.x] = playerInfo.color;
          }
        }
      });
    });

    let scoreObj = 0;
    const sweptBoard = newBoard.reduce((ack, row) => {
      if (row.findIndex(cell => cell === null) === -1) {
        scoreObj += 100; // Increased base score per line
        ack.unshift(new Array(BOARD_WIDTH).fill(null));
        return ack;
      }
      ack.push(row);
      return ack;
    }, [] as (string | null)[][]);

    setBoard(sweptBoard);

    const nextTetromino = randomTetromino();
    const startX = Math.floor(BOARD_WIDTH / 2) - Math.floor(nextTetromino.shape[0].length / 2);

    if (checkCollision(nextTetromino.shape, { x: startX, y: 0 }, sweptBoard)) {
      const finalScore = playerInfo.score + scoreObj;
      setPlayerInfo(prev => ({ ...prev, score: finalScore, gameOver: true }));
      setDropTime(null);
      // ハイスコア更新
      setHighScore(prev => {
        if (finalScore > prev) {
          void updateHighScore('tetris', finalScore);
          return finalScore;
        }
        return prev;
      });
    } else {
      setPlayerInfo(prev => ({
        ...prev,
        pos: { x: startX, y: 0 },
        tetromino: nextTetromino.shape,
        color: nextTetromino.color,
        score: prev.score + scoreObj
      }));
    }
  }, [board, playerInfo.pos, playerInfo.tetromino, playerInfo.color]);

  const updatePlayerPos = useCallback((offset: { x: number, y: number }) => {
    const newPos = { x: playerInfo.pos.x + offset.x, y: playerInfo.pos.y + offset.y };
    if (!checkCollision(playerInfo.tetromino, newPos, board)) {
      setPlayerInfo(prev => ({ ...prev, pos: newPos }));
    } else if (offset.y > 0) {
      mergeToBoard();
    }
  }, [board, playerInfo.pos, playerInfo.tetromino, mergeToBoard, isPaused, playerInfo.gameOver]);

  const drop = useCallback(() => {
    updatePlayerPos({ x: 0, y: 1 });
  }, [updatePlayerPos]);

  const hardDrop = useCallback(() => {
    if (playerInfo.gameOver) return;
    let newY = playerInfo.pos.y;
    while (!checkCollision(playerInfo.tetromino, { x: playerInfo.pos.x, y: newY + 1 }, board)) {
      newY += 1;
    }
    mergeToBoard({ x: playerInfo.pos.x, y: newY });
  }, [playerInfo, board, mergeToBoard]);

  // Handle speed increase
  useEffect(() => {
    if (playerInfo.score > 0) {
      const speedMultiplier = Math.pow(1.1, playerInfo.score / 500);
      setDropTime(1000 / Math.min(speedMultiplier, 2));
    }
  }, [playerInfo.score]);

  useEffect(() => {
    savedCallback.current = drop;
  }, [drop]);

  useEffect(() => {
    if (dropTime !== null && !isPaused && !playerInfo.gameOver) {
      const id = setInterval(() => {
        savedCallback.current && savedCallback.current();
      }, dropTime);
      return () => clearInterval(id);
    }
  }, [dropTime, isPaused, playerInfo.gameOver]);

  const rotate = useCallback(() => {
    if (playerInfo.gameOver) return;
    const rotated = playerInfo.tetromino[0].map((_, index) =>
      playerInfo.tetromino.map(col => col[index]).reverse()
    );
    if (!checkCollision(rotated, playerInfo.pos, board)) {
      setPlayerInfo(prev => ({ ...prev, tetromino: rotated }));
    }
  }, [playerInfo, board, isPaused]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (playerInfo.gameOver || isPaused) return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        updatePlayerPos({ x: -1, y: 0 });
        break;
      case 'ArrowRight':
        e.preventDefault();
        updatePlayerPos({ x: 1, y: 0 });
        break;
      case 'ArrowDown':
        e.preventDefault();
        updatePlayerPos({ x: 0, y: 1 });
        break;
      case 'ArrowUp':
        e.preventDefault();
        rotate();
        break;
      case ' ':
        e.preventDefault();
        hardDrop();
        break;
      default:
        break;
    }
  }, [playerInfo.gameOver, isPaused, updatePlayerPos, rotate, hardDrop]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  const startGame = () => {
    setBoard(createEmptyBoard());
    const nextTetromino = randomTetromino();
    const startX = Math.floor(BOARD_WIDTH / 2) - Math.floor(nextTetromino.shape[0].length / 2);
    setPlayerInfo({
      pos: { x: startX, y: 0 },
      tetromino: nextTetromino.shape,
      color: nextTetromino.color,
      score: 0,
      gameOver: false,
    });
    setDropTime(1000);
    setIsPaused(false);
  };

  useEffect(() => {
    startGame();
    fetchHighScore('tetris').then(s => setHighScore(s)).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    // スワイプ戻る・ハードウェア戻るキーへの対応
    // マウント時に一度だけ履歴を追加する
    window.history.pushState({ page: 'tetris' }, '', window.location.href);
    
    const handlePopState = () => {
      onBackRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []); // 空の依存配列で一度だけ実行を担保

  const handleBackAction = useCallback(() => {
    window.history.back();
  }, []);

  // 連続入力（DAS/ARR）の制御
  const useRepeatAction = (action: () => void) => {
    const actionRef = useRef(action);
    actionRef.current = action;
    const timerRef = useRef<number | null>(null);
    const intervalRef = useRef<number | null>(null);

    const stop = useCallback(() => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      timerRef.current = null;
      intervalRef.current = null;
    }, []);

    const start = useCallback((e: React.PointerEvent) => {
      if (playerInfo.gameOver || isPaused) return;
      e.preventDefault();
      stop();
      actionRef.current();
      timerRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          actionRef.current();
        }, 60); // ARR: 60ms
      }, 200); // DAS: 200ms
    }, [stop, playerInfo.gameOver, isPaused]);

    useEffect(() => stop, [stop]);

    return {
      onPointerDown: start,
      onPointerUp: stop,
      onPointerLeave: stop,
      onPointerCancel: stop,
    };
  };

  const leftHandlers = useRepeatAction(() => updatePlayerPos({ x: -1, y: 0 }));
  const rightHandlers = useRepeatAction(() => updatePlayerPos({ x: 1, y: 0 }));
  const downHandlers = useRepeatAction(drop);
  const rotateHandlers = useRepeatAction(rotate);

  const renderGrid = () => {
    const grid = board.map(row => [...row]);
    if (!playerInfo.gameOver) {
      playerInfo.tetromino.forEach((row, y) => {
        row.forEach((value, x) => {
          if (value) {
            const gridY = y + playerInfo.pos.y;
            const gridX = x + playerInfo.pos.x;
            if (gridY >= 0 && gridY < BOARD_HEIGHT && gridX >= 0 && gridX < BOARD_WIDTH) {
              grid[gridY][gridX] = playerInfo.color;
            }
          }
        });
      });
    }

    return grid.map((row, y) =>
      row.map((cell, x) => (
        <div
          key={`${y}-${x}`}
          className={`${styles.cell} ${cell ? styles.cellFilled : styles.cellEmpty} ${cell ? styles[cell] : ''}`}
        />
      ))
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <button className={styles.backBtn} onClick={handleBackAction}>
            &lt;
          </button>
          <div className={styles.title}>Tetris</div>
          <button className={styles.pauseBtn} onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? <PixelPlay /> : <PixelPause />}
          </button>
        </div>
        <div className={styles.scoreRow}>
          <div className={styles.scoreContainer}>
            <div className={styles.scoreLabel}>SCORE</div>
            <div className={styles.scoreValue}>{playerInfo.score}</div>
          </div>
          <div className={styles.scoreContainer}>
            <div className={styles.scoreLabel}>BEST</div>
            <div className={styles.scoreValue}>{highScore}</div>
          </div>
        </div>
      </div>

      <div className={styles.boardContainer}>
        <div className={styles.board}>
          {renderGrid()}
        </div>
      </div>

      {playerInfo.gameOver && (
        <div className={styles.overlay}>
          <div className={styles.gameOverText}>Game Over</div>
          <div className={styles.finalScore}>Score: {playerInfo.score}</div>
          <button className={styles.restartBtn} onClick={startGame}>&lt;&lt; RESTART &gt;&gt;</button>
          <button className={styles.quitBtn} onClick={handleBackAction}>&lt;&lt; QUIT &gt;&gt;</button>
        </div>
      )}

      <div className={styles.controls}>
        <button
          className={`${styles.btn} ${styles.btnLeft}`}
          {...leftHandlers}
        >
          <PixelLeft />
        </button>
        <button
          className={`${styles.btn} ${styles.btnDown}`}
          {...downHandlers}
        >
          <PixelDown />
        </button>
        <button
          className={`${styles.btn} ${styles.btnRight}`}
          {...rightHandlers}
        >
          <PixelRight />
        </button>
        <button
          className={`${styles.btn} ${styles.btnRotate}`}
          {...rotateHandlers}
        >
          <PixelRotate />
        </button>
      </div>
    </div>
  );
};

export default Tetris;
