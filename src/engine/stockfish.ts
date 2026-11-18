export type Analysis = {
  /** Eval in centipawns, white's point of view. Mate is +/- 10000. */
  cp: number
  /** Engine's best move as squares, e.g. { from: 'e2', to: 'e4' }. */
  best?: { from: string; to: string }
}

const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'

export class Stockfish {
  private worker: Worker
  private resolvePending: ((a: Analysis) => void) | null = null
  private rejectPending: ((e: Error) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastCp = 0
  private lastPv = ''
  private pendingFen = ''
  private readyResolve: (() => void) | null = null

  constructor() {
    // Classic worker (blob) lets us importScripts a cross-origin engine build.
    const src = `importScripts('${ENGINE_URL}');`
    this.worker = new Worker(
      URL.createObjectURL(new Blob([src], { type: 'application/javascript' })),
    )
    this.worker.onmessage = (e) => this.handle(String(e.data))
    this.worker.onerror = () => {
      this.rejectPending?.(new Error('Engine failed to load (network/CDN blocked?)'))
      this.rejectPending = null
    }
    this.send('uci')
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private handle(line: string) {
    if (line.startsWith('uciok')) {
      this.send('isready')
      return
    }
    if (line.startsWith('readyok')) {
      this.readyResolve?.()
      this.readyResolve = null
      return
    }
    if (line.startsWith('info') && line.includes(' score ')) {
      const m = line.match(/score (cp|mate) (-?\d+)/)
      if (m) {
        this.lastCp =
          m[1] === 'cp' ? Number(m[2]) : Number(m[2]) > 0 ? 10000 : -10000
      }
      const pv = line.match(/ pv ([a-h][1-8][a-h][1-8])/)
      if (pv) this.lastPv = pv[1]
      return
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1] ?? ''
      const mv = (this.lastPv || best).slice(0, 4)
      const stm = this.pendingFen.split(' ')[1] === 'w'
      const whiteCp = stm ? this.lastCp : -this.lastCp
      const analysis: Analysis = {
        cp: whiteCp,
        best:
          mv.length >= 4 ? { from: mv.slice(0, 2), to: mv.slice(2, 4) } : undefined,
      }
      if (this.timer) clearTimeout(this.timer)
      const resolve = this.resolvePending
      this.resolvePending = null
      this.rejectPending = null
      resolve?.(analysis)
    }
  }

  waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.readyResolve) {
        this.readyResolve = resolve
      } else {
        resolve()
      }
    })
  }

  analyze(fen: string, depth = 12): Promise<Analysis> {
    // One request at a time; caller serializes.
    return new Promise((resolve, reject) => {
      this.resolvePending = resolve
      this.rejectPending = reject
      this.pendingFen = fen
      this.lastCp = 0
      this.lastPv = ''
      this.timer = setTimeout(() => {
        reject(new Error('Engine timed out'))
        this.resolvePending = null
        this.rejectPending = null
      }, 30_000)
      this.send('position fen ' + fen)
      this.send('go depth ' + depth)
    })
  }

  quit() {
    this.worker.terminate()
  }
}
