# sudoku-3d

A React + TypeScript + Vite application featuring a 3D cube/Sudoku hybrid puzzle game.

## Project Structure

```
sudoku-3d/
├── src/
│   ├── main.tsx          # Entry point (React DOM render)
│   ├── App.tsx           # Main app component
│   ├── game.ts           # Core puzzle logic (generator, solver, rules)
│   ├── App.css           # Styles
│   ├── index.css         # Global styles
│   ├── CubeView.tsx      # 3D cube view (lazy-loaded)
│   ├── game.ts           # Game logic
│   └── ...
├── vite.config.ts        # Vite configuration
├── package.json          # Dependencies & scripts
└── .oxlintrc.json        # Oxlint configuration
```

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation

1. **Clone/Install the project**
   ```bash
   cd sudoku-3d
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```
   This starts the Vite development server on http://localhost:5173 (or similar).

3. **Build for production**
   ```bash
   npm run build
   ```
   This creates a production build in the `dist/` directory.

4. **Lint the code**
   ```bash
   npm run lint
   ```

### Running the App

- **Development**: `npm run dev`
- **Preview**: `npm run preview`
- **Production build**: `npm run build`

## Features

- **3D Cube View**: Interactive 3D representation of the puzzle
- **2D Board**: Classic grid view for playing
- **Multiple Sizes**: Support for N×N puzzles (default 7×7)
- **Modes**: Switch between 2D board and 3D cube view
- **Auto-X**: Automatically places X marks based on the current position
- **Undo/Reset**: Track changes and reset the game
- **Hints**: Get hints to reveal unflagged solution cells
- **Heart System**: Limited lives (3 hearts) – lose all and the level ends
- **Conflict Highlighting**: Visual indication of conflicting flag placements

## Development

- **Oxlint**: Type-aware linting with Oxc (Oxygen CSS) rules
  - Install: `oxlint-tsgolint`
  - Configure: Edit `.oxlintrc.json`
  - Run: `npm run lint`

## Configuration

### Vite (`vite.config.ts`)

Uses `@vitejs/plugin-react` for React support.

### Oxlint (`.oxlintrc.json`)

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

## License

This is a community-driven project. Feel free to contribute!
