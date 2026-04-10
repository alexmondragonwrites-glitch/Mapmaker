/**
 * Calyndra Mapmaker - Battle Map Generator
 * Generates grid-based tactical maps with terrain and enemy token placement
 */

import { SimplexNoise } from '../noise';
import { PALETTES, ENEMY_TYPES, SeededRandom, clamp, distance } from '../../utils';
import { drawTree, drawToken } from '../assets';

export class BattleMapGenerator {
    static id = 'battlemap';
    static label = 'Kampfkarte';
    static icon = '⚔️';

    constructor() {
        this.defaultConfig = {
            seed: Math.floor(Math.random() * 100000),
            width: 1200,
            height: 900,
            gridSize: 40,
            gridCols: 30,
            gridRows: 22,
            terrain: 'grassland',     // grassland | forest | dungeon | cave | desert | snow | swamp
            showGrid: true,
            showCoordinates: true,
            wallDensity: 0.0,
            treeDensity: 0.1,
            waterFeature: 'none',     // none | stream | pond | river
            tokens: [],               // placed tokens
        };
        this.placedTokens = [];
        this.hoveredCell = null;
        this.selectedEnemyType = null;
        this.interactiveCanvas = null;
        this.interactiveConfig = null;
    }

    getControls() {
        return [
            { type: 'number', key: 'seed', label: 'Seed', min: 0, max: 999999 },
            { type: 'range', key: 'gridSize', label: 'Rastergröße (px)', min: 20, max: 80, step: 5 },
            { type: 'range', key: 'gridCols', label: 'Spalten', min: 10, max: 50, step: 1 },
            { type: 'range', key: 'gridRows', label: 'Zeilen', min: 10, max: 40, step: 1 },
            { type: 'select', key: 'terrain', label: 'Gelände', options: [
                { value: 'grassland', label: 'Grasland' },
                { value: 'forest', label: 'Wald' },
                { value: 'dungeon', label: 'Dungeon' },
                { value: 'cave', label: 'Höhle' },
                { value: 'desert', label: 'Wüste' },
                { value: 'snow', label: 'Schnee' },
                { value: 'swamp', label: 'Sumpf' },
            ]},
            { type: 'select', key: 'waterFeature', label: 'Wasser', options: [
                { value: 'none', label: 'Keins' },
                { value: 'stream', label: 'Bach' },
                { value: 'pond', label: 'Teich' },
                { value: 'river', label: 'Fluss' },
            ]},
            { type: 'range', key: 'treeDensity', label: 'Baumdichte', min: 0, max: 0.5, step: 0.05 },
            { type: 'range', key: 'wallDensity', label: 'Mauern/Wände', min: 0, max: 0.3, step: 0.05 },
            { type: 'checkbox', key: 'showGrid', label: 'Raster anzeigen' },
            { type: 'checkbox', key: 'showCoordinates', label: 'Koordinaten' },
            { type: 'custom', key: 'tokenPalette', label: 'Gegner platzieren', renderer: 'tokenPalette' },
        ];
    }

    generate(canvas, config = {}) {
        const cfg = { ...this.defaultConfig, ...config };
        cfg.width = cfg.gridCols * cfg.gridSize;
        cfg.height = cfg.gridRows * cfg.gridSize;
        canvas.width = cfg.width;
        canvas.height = cfg.height;

        const ctx = canvas.getContext('2d');
        const noise = new SimplexNoise(cfg.seed);
        const rng = new SeededRandom(cfg.seed);

        // Generate terrain data
        const terrainGrid = this._generateTerrain(cfg, noise, rng);

        // Render base terrain
        this._renderTerrain(ctx, cfg, terrainGrid, noise);

        // Render water features
        if (cfg.waterFeature !== 'none') {
            this._renderWater(ctx, cfg, noise, rng);
        }

        // Render walls (dungeon/cave)
        if (cfg.wallDensity > 0) {
            this._renderWalls(ctx, cfg, terrainGrid, noise, rng);
        }

        // Render trees/vegetation
        this._renderVegetation(ctx, cfg, terrainGrid, rng);

        // Render grid
        if (cfg.showGrid) {
            this._renderGrid(ctx, cfg);
        }

        // Render coordinates
        if (cfg.showCoordinates) {
            this._renderCoordinates(ctx, cfg);
        }

        // Render placed tokens
        this._renderTokens(ctx, cfg);

        // Store for interactive mode
        this.interactiveCanvas = canvas;
        this.interactiveConfig = cfg;
    }

    _generateTerrain(cfg, noise, rng) {
        const { gridCols, gridRows } = cfg;
        const grid = [];

        for (let row = 0; row < gridRows; row++) {
            grid[row] = [];
            for (let col = 0; col < gridCols; col++) {
                const n = noise.fbm(col / 8, row / 8, 3);
                let type = 'ground';

                if (cfg.terrain === 'dungeon' || cfg.terrain === 'cave') {
                    // Dungeon/cave: carve rooms and corridors
                    const roomNoise = noise.noise2D(col / 4, row / 4);
                    type = roomNoise > -0.2 ? 'ground' : 'wall';
                }

                grid[row][col] = {
                    type,
                    elevation: (n + 1) * 0.5,
                    hasTree: false,
                    hasWall: false,
                    token: null,
                };
            }
        }

        // Add trees
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                if (grid[row][col].type === 'ground' && rng.next() < cfg.treeDensity) {
                    grid[row][col].hasTree = true;
                }
            }
        }

        return grid;
    }

    _renderTerrain(ctx, cfg, terrainGrid, noise) {
        const { gridSize, gridCols, gridRows, terrain } = cfg;
        const pal = PALETTES.battle;

        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const x = col * gridSize;
                const y = row * gridSize;
                const cell = terrainGrid[row][col];
                const n = noise.noise2D(col / 3 + 50, row / 3 + 50) * 0.1;

                if (cell.type === 'wall') {
                    // Wall/rock
                    const shade = 40 + n * 20;
                    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
                    ctx.fillRect(x, y, gridSize, gridSize);

                    // Stone texture
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(x + 2, y + 2, gridSize - 4, gridSize - 4);
                    continue;
                }

                let baseColor;
                switch (terrain) {
                    case 'grassland':
                        const gr = 60 + n * 30 + cell.elevation * 20;
                        const gg = 110 + n * 20 + cell.elevation * 15;
                        const gb = 35 + n * 15;
                        baseColor = `rgb(${gr}, ${gg}, ${gb})`;
                        break;
                    case 'forest':
                        const fr = 40 + n * 20;
                        const fg = 80 + n * 30 + cell.elevation * 20;
                        const fb = 25 + n * 10;
                        baseColor = `rgb(${fr}, ${fg}, ${fb})`;
                        break;
                    case 'dungeon':
                        const dr = 70 + n * 20;
                        const dg = 65 + n * 15;
                        const db = 55 + n * 15;
                        baseColor = `rgb(${dr}, ${dg}, ${db})`;
                        break;
                    case 'cave':
                        const cr = 55 + n * 25;
                        const cg = 50 + n * 20;
                        const cb = 45 + n * 15;
                        baseColor = `rgb(${cr}, ${cg}, ${cb})`;
                        break;
                    case 'desert':
                        const desr = 180 + n * 30;
                        const desg = 155 + n * 25;
                        const desb = 90 + n * 20;
                        baseColor = `rgb(${desr}, ${desg}, ${desb})`;
                        break;
                    case 'snow':
                        const sr = 210 + n * 30;
                        const sg = 215 + n * 25;
                        const sb = 220 + n * 20;
                        baseColor = `rgb(${sr}, ${sg}, ${sb})`;
                        break;
                    case 'swamp':
                        const swr = 55 + n * 20;
                        const swg = 75 + n * 25 + cell.elevation * 10;
                        const swb = 35 + n * 15;
                        baseColor = `rgb(${swr}, ${swg}, ${swb})`;
                        break;
                    default:
                        baseColor = pal.grass;
                }

                ctx.fillStyle = baseColor;
                ctx.fillRect(x, y, gridSize, gridSize);

                // Subtle texture variation
                if (terrain === 'dungeon' || terrain === 'cave') {
                    // Stone floor cracks
                    if (noise.noise2D(col * 5, row * 5) > 0.5) {
                        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(x + gridSize * 0.2, y + gridSize * 0.3);
                        ctx.lineTo(x + gridSize * 0.7, y + gridSize * 0.8);
                        ctx.stroke();
                    }
                } else {
                    // Grass/terrain detail dots
                    if (noise.noise2D(col * 7, row * 7) > 0.3) {
                        ctx.fillStyle = 'rgba(0,0,0,0.05)';
                        ctx.beginPath();
                        ctx.arc(x + gridSize * 0.5, y + gridSize * 0.5, gridSize * 0.15, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    }

    _renderWater(ctx, cfg, noise, rng) {
        const { gridSize, gridCols, gridRows, waterFeature } = cfg;

        ctx.save();
        ctx.fillStyle = PALETTES.battle.water;
        ctx.globalAlpha = 0.7;

        if (waterFeature === 'pond') {
            const cx = gridCols * gridSize * rng.nextFloat(0.3, 0.7);
            const cy = gridRows * gridSize * rng.nextFloat(0.3, 0.7);
            const rx = gridSize * rng.nextFloat(2, 4);
            const ry = gridSize * rng.nextFloat(1.5, 3);

            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, rng.nextFloat(0, Math.PI), 0, Math.PI * 2);
            ctx.fill();

            // Shore
            ctx.strokeStyle = '#6a9a6a';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (waterFeature === 'stream' || waterFeature === 'river') {
            const width = waterFeature === 'river' ? gridSize * 1.5 : gridSize * 0.6;
            const startX = rng.next() > 0.5;

            ctx.strokeStyle = PALETTES.battle.water;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            if (startX) {
                let y = gridRows * gridSize * rng.nextFloat(0.3, 0.7);
                ctx.moveTo(0, y);
                for (let x = 0; x <= gridCols * gridSize; x += gridSize) {
                    y += noise.noise2D(x / 100, 0) * gridSize * 0.5;
                    y = clamp(y, gridSize, (gridRows - 1) * gridSize);
                    ctx.lineTo(x, y);
                }
            } else {
                let x = gridCols * gridSize * rng.nextFloat(0.3, 0.7);
                ctx.moveTo(x, 0);
                for (let y = 0; y <= gridRows * gridSize; y += gridSize) {
                    x += noise.noise2D(0, y / 100) * gridSize * 0.5;
                    x = clamp(x, gridSize, (gridCols - 1) * gridSize);
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderWalls(ctx, cfg, terrainGrid, noise, rng) {
        const { gridSize, gridCols, gridRows, wallDensity, terrain } = cfg;

        if (terrain !== 'dungeon' && terrain !== 'cave') {
            // For outdoor maps: stone walls, fences
            ctx.fillStyle = '#6a6a6a';
            for (let row = 0; row < gridRows; row++) {
                for (let col = 0; col < gridCols; col++) {
                    if (rng.next() < wallDensity) {
                        const x = col * gridSize;
                        const y = row * gridSize;

                        // Horizontal or vertical wall segment
                        if (rng.next() > 0.5) {
                            ctx.fillRect(x, y + gridSize * 0.4, gridSize, gridSize * 0.2);
                        } else {
                            ctx.fillRect(x + gridSize * 0.4, y, gridSize * 0.2, gridSize);
                        }
                    }
                }
            }
        }
    }

    _renderVegetation(ctx, cfg, terrainGrid, rng) {
        const { gridSize, gridCols, gridRows, terrain } = cfg;

        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                if (!terrainGrid[row][col].hasTree) continue;

                const x = col * gridSize + gridSize / 2;
                const y = row * gridSize + gridSize / 2;
                const treeSize = gridSize * 0.35;

                let treeType = 'deciduous';
                if (terrain === 'snow') treeType = 'pine';
                else if (terrain === 'forest') treeType = rng.next() > 0.3 ? 'pine' : 'deciduous';
                else if (terrain === 'swamp') treeType = 'deciduous';

                if (terrain === 'dungeon' || terrain === 'cave') {
                    // Mushrooms/stalagmites instead of trees
                    ctx.fillStyle = terrain === 'cave' ? '#6a5a4a' : '#5a4a3a';
                    ctx.beginPath();
                    ctx.moveTo(x - treeSize * 0.3, y + treeSize * 0.4);
                    ctx.lineTo(x, y - treeSize * 0.3);
                    ctx.lineTo(x + treeSize * 0.3, y + treeSize * 0.4);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    drawTree(ctx, x, y, treeSize, { type: treeType });
                }
            }
        }
    }

    _renderGrid(ctx, cfg) {
        const { gridSize, gridCols, gridRows } = cfg;
        const totalW = gridCols * gridSize;
        const totalH = gridRows * gridSize;

        ctx.strokeStyle = PALETTES.battle.grid;
        ctx.lineWidth = 1;

        for (let col = 0; col <= gridCols; col++) {
            const x = col * gridSize;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, totalH);
            ctx.stroke();
        }

        for (let row = 0; row <= gridRows; row++) {
            const y = row * gridSize;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(totalW, y);
            ctx.stroke();
        }
    }

    _renderCoordinates(ctx, cfg) {
        const { gridSize, gridCols, gridRows } = cfg;
        ctx.font = `${Math.max(8, gridSize * 0.22)}px sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let col = 0; col < gridCols; col++) {
            for (let row = 0; row < gridRows; row++) {
                const label = String.fromCharCode(65 + col) + (row + 1);
                ctx.fillText(label, col * gridSize + 2, row * gridSize + 2);
            }
        }
    }

    _renderTokens(ctx, cfg) {
        const { gridSize } = cfg;

        for (const token of this.placedTokens) {
            const enemyType = ENEMY_TYPES.find(e => e.id === token.typeId);
            if (!enemyType) continue;

            const x = token.col * gridSize + gridSize / 2;
            const y = token.row * gridSize + gridSize / 2;

            drawToken(ctx, x, y, gridSize * 0.8, {
                color: enemyType.color,
                symbol: enemyType.symbol,
                tokenSize: enemyType.size,
            });
        }
    }

    // ── Interactive Token Placement ─────────────────────────────────

    setupInteraction(canvas, regenerateCallback) {
        canvas.addEventListener('click', (e) => {
            if (!this.selectedEnemyType) return;

            const rect = canvas.getBoundingClientRect();
            const cfg = this.interactiveConfig;
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            const col = Math.floor(x / cfg.gridSize);
            const row = Math.floor(y / cfg.gridSize);

            if (col < 0 || col >= cfg.gridCols || row < 0 || row >= cfg.gridRows) return;

            // Check if token already exists at this position
            const existingIdx = this.placedTokens.findIndex(t => t.col === col && t.row === row);
            if (existingIdx >= 0) {
                // Remove existing token
                this.placedTokens.splice(existingIdx, 1);
            } else {
                // Add new token
                this.placedTokens.push({
                    typeId: this.selectedEnemyType,
                    col,
                    row,
                });
            }

            regenerateCallback();
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!this.selectedEnemyType) {
                canvas.style.cursor = 'default';
                return;
            }

            canvas.style.cursor = 'crosshair';
            const rect = canvas.getBoundingClientRect();
            const cfg = this.interactiveConfig;
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            const col = Math.floor(x / cfg.gridSize);
            const row = Math.floor(y / cfg.gridSize);

            if (this.hoveredCell?.col !== col || this.hoveredCell?.row !== row) {
                this.hoveredCell = { col, row };
                regenerateCallback();

                // Draw hover highlight
                const ctx = canvas.getContext('2d');
                if (col >= 0 && col < cfg.gridCols && row >= 0 && row < cfg.gridRows) {
                    ctx.fillStyle = PALETTES.battle.gridHover;
                    ctx.fillRect(col * cfg.gridSize, row * cfg.gridSize, cfg.gridSize, cfg.gridSize);
                }
            }
        });
    }

    clearTokens() {
        this.placedTokens = [];
    }

    getTokenList() {
        return this.placedTokens.map(t => {
            const type = ENEMY_TYPES.find(e => e.id === t.typeId);
            return {
                ...t,
                name: type?.name || 'Unbekannt',
                position: String.fromCharCode(65 + t.col) + (t.row + 1),
            };
        });
    }
}
