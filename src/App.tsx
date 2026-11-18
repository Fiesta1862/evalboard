import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { Stockfish, type Analysis } from './engine/stockfish'
import { evalToPercent, formatEval, markFor, clamp, type Mark } from './lib/analysis'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

type HistMove = { san: string; color: 'w' | 'b' }

export default function App() {
  const [moves, setMoves] = useState<HistMove[]>([])
  const [index, setIndex] = useState(0) // position index: 0 = start, i = after move i
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [evals, setEvals] = useState<Record<string, number>>({})
  const [bests, setBests] = useState<Record<string, Analysis['best']>>({})
  const [engineOn, setEngineOn] = useState(true)
  const [depth, setDepth] = useState(12)
  const [engineStatus, setEngineStatus] = useState('starting')
  const [pgnText, setPgnText] = useState('')
  const [boardWidth, setBoardWidth] = useState(560)
  const [analyzingAll, setAnalyzingAll] = useState(false)

  const engineRef = useRef<Stockfish | null>(null)
  const busyRef = useRef(false)

  const positions = useMemo(() => {
    const list = [START]
    const c = new Chess()
    for (const m of moves) {
      c.move(m.san)
      list.push(c.fen())
    }
    return list
  }, [moves])

  const fen = positions[index]
  const turn = fen.split(' ')[1] === 'w' ? 'White' : 'Black'

  const status = useMemo(() => {
    const c = new Chess(fen)
    if (c.isCheckmate()) return (turn === 'White' ? 'Black' : 'White') + ' wins by checkmate'
    if (c.isDraw()) return 'Draw'
    if (c.isCheck()) return turn + ' is in check'
    return turn + ' to move'
  }, [fen, turn])

  // ---- engine lifecycle -------------------------------------------------
  useEffect(() => {
    if (!engineOn) return
    const engine = engineRef.current ?? new Stockfish()
    engineRef.current = engine
    setEngineStatus('loading…')
    engine
      .waitForReady()
      .then(() => setEngineStatus('ready'))
      .catch(() => setEngineStatus('error'))
    return () => {
      engine.quit()
      engineRef.current = null
      busyRef.current = false
    }
  }, [engineOn])

  // ---- analyze currently viewed position --------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engineOn || !engine || busyRef.current || analyzingAll) return
    if (evals[fen] !== undefined) {
      setEngineStatus('ready')
      return
    }
    busyRef.current = true
    setEngineStatus('analyzing depth ' + depth + '…')
    engine
      .analyze(fen, depth)
      .then((a) => {
        setEvals((e) => ({ ...e, [fen]: a.cp }))
        if (a.best) setBests((b) => ({ ...b, [fen]: a.best }))
        setEngineStatus('ready')
      })
      .catch(() => setEngineStatus('error'))
      .finally(() => {
        busyRef.current = false
      })
  }, [fen, engineOn, depth, evals, positions, analyzingAll])

  // ---- analyze whole game sequentially ----------------------------------
  const analyzeAll = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || analyzingAll) return
    setAnalyzingAll(true)
    try {
      for (let i = 0; i < positions.length; i++) {
        const f = positions[i]
        if (evals[f] !== undefined) continue
        setEngineStatus('analyzing game ' + (i + 1) + '/' + positions.length + '…')
        const a = await engine.analyze(f, depth)
        setEvals((e) => ({ ...e, [f]: a.cp }))
        if (a.best) setBests((b) => ({ ...b, [f]: a.best }))
      }
      setEngineStatus('ready')
    } catch {
      setEngineStatus('error')
    } finally {
      setAnalyzingAll(false)
    }
  }, [positions, evals, depth, analyzingAll])

  const clearAnalysis = useCallback(() => {
    if (analyzingAll) return
    setEvals({})
    setBests({})
  }, [analyzingAll])

  // ---- moves -------------------------------------------------------------
  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      const c = new Chess(fen)
      const piece = c.get(from as Square)
      const promo =
        piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined
      let m
      try {
        m = promo
          ? c.move({ from, to, promotion: promo })
          : c.move({ from, to })
      } catch {
        return false
      }
      if (!m) return false
      setMoves((mv) => [...mv.slice(0, index), { san: m.san, color: m.color as 'w' | 'b' }])
      setIndex(index + 1)
      return true
    },
    [fen, index],
  )

  const reset = useCallback(() => {
    if (analyzingAll) return
    setMoves([])
    setIndex(0)
  }, [analyzingAll])

  const loadPgn = useCallback(() => {
    if (analyzingAll) return
    try {
      const parsed = new Chess()
      parsed.loadPgn(pgnText.trim(), { strict: false })
      let headerFen: string | undefined
      try {
        headerFen = (parsed as unknown as { getHeaders?: () => Record<string, string> })
          .getHeaders?.().FEN
      } catch {
        /* ignore */
      }
      const base = headerFen ? new Chess(headerFen) : new Chess()
      const list: HistMove[] = []
      for (const mv of parsed.history({ verbose: true })) {
        base.move(mv.san)
        list.push({ san: mv.san, color: mv.color as 'w' | 'b' })
      }
      setMoves(list)
      setIndex(0)
    } catch {
      alert('Could not parse that PGN.')
    }
  }, [pgnText, analyzingAll])

  const exportPgn = useCallback(() => {
    const c = new Chess()
    for (const m of moves) c.move(m.san)
    const pgn = c.pgn({ maxWidth: 80, newline: '\n' })
    const blob = new Blob([pgn], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'evalboard.pgn'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [moves])

  // ---- derived analysis ---------------------------------------------------
  const marks = useMemo(() => {
    const out: Record<number, Mark> = {}
    for (let i = 1; i < positions.length; i++) {
      const before = evals[positions[i - 1]]
      const after = evals[positions[i]]
      if (before === undefined || after === undefined) continue
      const moverWhite = moves[i - 1].color === 'w'
      const drop = moverWhite ? before - after : after - before
      out[i] = markFor(drop)
    }
    return out
  }, [positions, evals, moves])

  const currentEval = evals[fen]

  // ---- responsive board ---------------------------------------------------
  useEffect(() => {
    const update = () =>
      setBoardWidth(clamp(window.innerWidth - 64, 280, 560))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ---- keyboard nav -------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setIndex((i) => clamp(i - 1, 0, positions.length - 1))
      if (e.key === 'ArrowRight') setIndex((i) => clamp(i + 1, 0, positions.length - 1))
      if (e.key === 'Home') setIndex(0)
      if (e.key === 'End') setIndex(positions.length - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [positions.length])

  const arrow = !analyzingAll && bests[fen] ? [bests[fen]!] : undefined

  return (
    <div className="app">
      <header className="header">
        <h1>♞ Evalboard</h1>
        <span className="status">{status}</span>
        <span className={'engine ' + (engineOn ? 'on' : 'off')}>engine: {engineOn ? engineStatus : 'off'}</span>
      </header>

      <div className="toolbar">
        <button onClick={() => setIndex(0)} title="Start (Home)">⏮</button>
        <button onClick={() => setIndex((i) => clamp(i - 1, 0, positions.length - 1))} title="Previous (←)">◀</button>
        <button onClick={() => setIndex((i) => clamp(i + 1, 0, positions.length - 1))} title="Next (→)">▶</button>
        <button onClick={() => setIndex(positions.length - 1)} title="End (End)">⏭</button>
        <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>⇅ Flip</button>
        <button onClick={reset} disabled={analyzingAll}>New game</button>
        <label>
          depth{' '}
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
            {[8, 10, 12, 14, 16, 18].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={engineOn} onChange={(e) => setEngineOn(e.target.checked)} />
          engine
        </label>
        <button onClick={analyzeAll} disabled={!engineOn || analyzingAll}>
          {analyzingAll ? 'Analyzing…' : 'Analyze game'}
        </button>
        <button onClick={clearAnalysis} disabled={!engineOn || analyzingAll}>Re-analyze</button>
      </div>

      <div className="row">
        <div className="evalbar" style={{ height: boardWidth }}>
          <div className="evalbar-white" style={{ height: (evalToPercent(currentEval ?? 0) * 100) + '%' }} />
          <span className="evalbar-label">{currentEval === undefined ? '—' : formatEval(currentEval)}</span>
        </div>
        <div className="board-col">
          <Chessboard
            position={fen}
            boardWidth={boardWidth}
            boardOrientation={orientation}
            onPieceDrop={(from: string, to: string) => tryMove(from, to)}
            customArrows={arrow as [Square, Square, string][] | undefined}
            customBoardStyle={{ borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)' }}
          />
          {index !== positions.length - 1 && (
            <button className="live-btn" onClick={() => setIndex(positions.length - 1)}>
              viewing move {index}/{Math.max(positions.length - 1, 0)} — jump to latest ▶
            </button>
          )}
        </div>

        <div className="side">
          <h2>Moves</h2>
          <div className="moves">
            <table>
              <tbody>
                {Array.from({ length: Math.ceil(moves.length / 2) }, (_, r) => (
                  <tr key={r}>
                    <td className="num">{r + 1}.</td>
                    {[2 * r, 2 * r + 1].map((j) =>
                      j < moves.length ? (
                        <td
                          key={j}
                          className={
                            'ply' + (index === j + 1 ? ' current' : '') + (marks[j + 1] ? ' marked' : '')
                          }
                          onClick={() => setIndex(j + 1)}
                        >
                          {moves[j].san}
                          <span className="mark">{marks[j + 1] ?? ''}</span>
                        </td>
                      ) : (
                        <td key={j} />
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {moves.length === 0 && <p className="hint">Play moves on the board or load a PGN below.</p>}
          </div>

          <h2>PGN</h2>
          <textarea
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            placeholder="Paste PGN here…"
            rows={5}
          />
          <div className="pgn-btns">
            <button onClick={loadPgn} disabled={analyzingAll}>Load PGN</button>
            <button onClick={exportPgn}>Download PGN</button>
          </div>
        </div>
      </div>

      <h2>Evaluation graph</h2>
      <svg
        className="graph"
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        onClick={(e) => {
          const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect()
          const i = Math.round(((e.clientX - rect.left) / rect.width) * (positions.length - 1))
          setIndex(clamp(i, 0, positions.length - 1))
        }}
      >
        <line x1="0" y1="100" x2="1000" y2="100" stroke="#555" strokeWidth="1" />
        {positions.length > 1 && (
          <polyline
            fill="none"
            stroke="#9fe8ff"
            strokeWidth="2"
            points={positions
              .map((f, i) => {
                const cp = evals[f]
                if (cp === undefined) return null
                const x = (i / (positions.length - 1)) * 1000
                const y = 100 - (clamp(cp, -600, 600) / 600) * 90
                return x.toFixed(1) + ',' + y.toFixed(1)
              })
              .filter(Boolean)
              .join(' ')}
          />
        )}
        {positions.map((f, i) => {
          if (!marks[i]) return null
          const cp = evals[f]
          if (cp === undefined) return null
          const x = (i / Math.max(positions.length - 1, 1)) * 1000
          const y = 100 - (clamp(cp, -600, 600) / 600) * 90
          return (
            <circle key={i} cx={x} cy={y} r="7" fill={marks[i] === '??' ? '#ff4d5e' : '#ffb54d'}>
              <title>{'move ' + Math.ceil(i / 2) + (moves[i - 1]?.color === 'w' ? '.' : '… ') + moves[i - 1]?.san + ' ' + marks[i]}</title>
            </circle>
          )
        })}
      </svg>
      <p className="legend">
        <span className="dot red" /> blunder (≥3 pawns) <span className="dot orange" /> mistake/dubious — click graph or move list to jump
      </p>
    </div>
  )
}
