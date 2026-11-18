# evalboard

Chess analysis app — an interactive analysis board with a Stockfish engine, live evaluation bar, evaluation graph, and blunder detection.

![stack](https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-blue)

## Features

- **Interactive board** — play moves legally (auto-queen promotion), flip the board, keyboard navigation (`←`/`→`/`Home`/`End`)
- **Stockfish engine** — live evaluation of the viewed position via Stockfish.js (WASM), best-move arrow on the board, depth selector (8–18)
- **Eval bar** — win-probability bar next to the board
- **Eval graph** — evaluation curve across the whole game; click to jump to any position
- **Blunder detection** — moves that swing the eval are flagged (`?!` dubious, `?` mistake, `??` blunder) in the move list and marked on the graph
- **PGN import/export** — paste a game or download the current one

## Getting started

```sh
npm install
npm run dev      # dev server
npm run build    # production build → dist/
npm run preview  # serve the production build
```

> **Termux note:** if `npm run` can't find `vite` (shebang issue), run
> `node node_modules/vite/bin/vite.js build` directly.

## Tech stack

- [Vite](https://vite.dev) + [React 18](https://react.dev) + TypeScript
- [chess.js](https://github.com/jhlywa/chess.js) — move generation/legality
- [react-chessboard](https://github.com/Clariity/react-chessboard) — board UI
- [Stockfish.js 10](https://npmjs.com/package/stockfish.js) — engine, loaded in a Web Worker
