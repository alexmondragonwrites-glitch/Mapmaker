/**
 * Calyndra Mapmaker - Main Application
 * Plugin-based architecture for extensible map generators
 */

import { exportCanvasAsPNG, ENEMY_TYPES } from './utils.js';
import { WorldMapGenerator } from './worldmap.js';
import { CityMapGenerator } from './citymap.js';
import { BattleMapGenerator } from './battlemap.js';

// ── Generator Registry (Plugin System) ──────────────────────────────

class GeneratorRegistry {
    constructor() {
        this.generators = new Map();
    }

    register(GeneratorClass) {
        const instance = new GeneratorClass();
        this.generators.set(GeneratorClass.id, {
            id: GeneratorClass.id,
            label: GeneratorClass.label,
            icon: GeneratorClass.icon,
            instance,
            controls: instance.getControls(),
        });
    }

    get(id) {
        return this.generators.get(id);
    }

    getAll() {
        return Array.from(this.generators.values());
    }
}

// ── Application ─────────────────────────────────────────────────────

class CalyndraApp {
    constructor() {
        this.registry = new GeneratorRegistry();
        this.activeGenerator = null;
        this.config = {};
        this.canvas = null;
        this.isGenerating = false;

        // Register built-in generators
        this.registry.register(WorldMapGenerator);
        this.registry.register(CityMapGenerator);
        this.registry.register(BattleMapGenerator);
    }

    init() {
        this.canvas = document.getElementById('map-canvas');
        this._buildUI();
        this._setupEventListeners();

        // Activate first generator
        const firstGen = this.registry.getAll()[0];
        if (firstGen) {
            this.switchGenerator(firstGen.id);
        }
    }

    switchGenerator(id) {
        const gen = this.registry.get(id);
        if (!gen) return;

        this.activeGenerator = gen;
        this.config = { ...gen.instance.defaultConfig };

        // Update UI
        this._updateTabs();
        this._buildControls();
        this.generate();

        // Setup battle map interaction
        if (id === 'battlemap') {
            gen.instance.setupInteraction(this.canvas, () => this.generate());
        }
    }

    generate() {
        if (!this.activeGenerator || this.isGenerating) return;

        this.isGenerating = true;
        const statusEl = document.getElementById('status');
        statusEl.textContent = 'Generiere Karte...';
        statusEl.classList.add('active');

        // Use requestAnimationFrame for smooth UI
        requestAnimationFrame(() => {
            try {
                this.activeGenerator.instance.generate(this.canvas, this.config);
                statusEl.textContent = `${this.activeGenerator.label} generiert (${this.canvas.width}×${this.canvas.height}px)`;
            } catch (err) {
                statusEl.textContent = `Fehler: ${err.message}`;
                console.error('Generation error:', err);
            }
            statusEl.classList.remove('active');
            this.isGenerating = false;
        });
    }

    randomize() {
        this.config.seed = Math.floor(Math.random() * 100000);
        this._updateControlValue('seed', this.config.seed);
        this.generate();
    }

    export() {
        const genLabel = this.activeGenerator?.label || 'karte';
        const filename = `calyndra-${genLabel.toLowerCase()}-${this.config.seed}.png`;
        exportCanvasAsPNG(this.canvas, filename);
    }

    // ── UI Construction ─────────────────────────────────────────────

    _buildUI() {
        const tabBar = document.getElementById('tab-bar');
        tabBar.innerHTML = '';

        for (const gen of this.registry.getAll()) {
            const tab = document.createElement('button');
            tab.className = 'tab-btn';
            tab.dataset.id = gen.id;
            tab.innerHTML = `<span class="tab-icon">${gen.icon}</span> ${gen.label}`;
            tab.addEventListener('click', () => this.switchGenerator(gen.id));
            tabBar.appendChild(tab);
        }

        // Action buttons
        document.getElementById('btn-generate').addEventListener('click', () => this.generate());
        document.getElementById('btn-random').addEventListener('click', () => this.randomize());
        document.getElementById('btn-export').addEventListener('click', () => this.export());
    }

    _updateTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.id === this.activeGenerator.id);
        });
    }

    _buildControls() {
        const container = document.getElementById('controls-content');
        container.innerHTML = '';

        const controls = this.activeGenerator.controls;

        for (const ctrl of controls) {
            if (ctrl.type === 'custom' && ctrl.renderer === 'tokenPalette') {
                this._buildTokenPalette(container);
                continue;
            }

            const group = document.createElement('div');
            group.className = 'control-group';

            const label = document.createElement('label');
            label.textContent = ctrl.label;
            label.setAttribute('for', `ctrl-${ctrl.key}`);

            let input;

            switch (ctrl.type) {
                case 'number':
                    input = document.createElement('input');
                    input.type = 'number';
                    input.min = ctrl.min;
                    input.max = ctrl.max;
                    input.value = this.config[ctrl.key] ?? '';
                    input.id = `ctrl-${ctrl.key}`;
                    input.addEventListener('change', () => {
                        this.config[ctrl.key] = parseInt(input.value);
                        this.generate();
                    });
                    break;

                case 'range':
                    const rangeWrap = document.createElement('div');
                    rangeWrap.className = 'range-wrap';

                    input = document.createElement('input');
                    input.type = 'range';
                    input.min = ctrl.min;
                    input.max = ctrl.max;
                    input.step = ctrl.step;
                    input.value = this.config[ctrl.key] ?? 0;
                    input.id = `ctrl-${ctrl.key}`;

                    const valueDisplay = document.createElement('span');
                    valueDisplay.className = 'range-value';
                    valueDisplay.textContent = input.value;

                    input.addEventListener('input', () => {
                        const val = parseFloat(input.value);
                        this.config[ctrl.key] = val;
                        valueDisplay.textContent = Number.isInteger(val) ? val : val.toFixed(2);
                    });
                    input.addEventListener('change', () => {
                        this.generate();
                    });

                    rangeWrap.appendChild(input);
                    rangeWrap.appendChild(valueDisplay);
                    group.appendChild(label);
                    group.appendChild(rangeWrap);
                    container.appendChild(group);
                    continue;

                case 'select':
                    input = document.createElement('select');
                    input.id = `ctrl-${ctrl.key}`;
                    for (const opt of ctrl.options) {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.label;
                        option.selected = this.config[ctrl.key] == opt.value;
                        input.appendChild(option);
                    }
                    input.addEventListener('change', () => {
                        const val = isNaN(input.value) ? input.value : parseFloat(input.value);
                        this.config[ctrl.key] = val;
                        this.generate();
                    });
                    break;

                case 'checkbox':
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = this.config[ctrl.key] ?? false;
                    input.id = `ctrl-${ctrl.key}`;
                    input.addEventListener('change', () => {
                        this.config[ctrl.key] = input.checked;
                        this.generate();
                    });
                    break;
            }

            group.appendChild(label);
            group.appendChild(input);
            container.appendChild(group);
        }
    }

    _buildTokenPalette(container) {
        const section = document.createElement('div');
        section.className = 'token-palette';

        const title = document.createElement('h3');
        title.textContent = 'Gegner & Tokens';
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'token-grid';

        const gen = this.activeGenerator.instance;

        for (const enemy of ENEMY_TYPES) {
            const btn = document.createElement('button');
            btn.className = 'token-btn';
            btn.title = enemy.name;
            btn.dataset.id = enemy.id;
            btn.innerHTML = `<span class="token-symbol" style="background:${enemy.color}">${enemy.symbol}</span><span class="token-name">${enemy.name}</span>`;

            btn.addEventListener('click', () => {
                document.querySelectorAll('.token-btn').forEach(b => b.classList.remove('selected'));

                if (gen.selectedEnemyType === enemy.id) {
                    gen.selectedEnemyType = null;
                } else {
                    btn.classList.add('selected');
                    gen.selectedEnemyType = enemy.id;
                }
            });

            grid.appendChild(btn);
        }

        section.appendChild(grid);

        // Clear tokens button
        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn btn-danger';
        clearBtn.textContent = 'Alle Tokens entfernen';
        clearBtn.addEventListener('click', () => {
            gen.clearTokens();
            this.generate();
        });
        section.appendChild(clearBtn);

        // Token list
        const tokenListEl = document.createElement('div');
        tokenListEl.id = 'token-list';
        tokenListEl.className = 'token-list';
        section.appendChild(tokenListEl);

        container.appendChild(section);
    }

    _updateControlValue(key, value) {
        const el = document.getElementById(`ctrl-${key}`);
        if (el) el.value = value;
    }

    _setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

            switch (e.key) {
                case 'r':
                case 'R':
                    e.preventDefault();
                    this.randomize();
                    break;
                case 'e':
                case 'E':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.export();
                    }
                    break;
                case 'g':
                case 'G':
                    e.preventDefault();
                    this.generate();
                    break;
            }
        });
    }
}

// ── Bootstrap ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const app = new CalyndraApp();
    app.init();

    // Expose for console/debugging
    window.calyndra = app;
});
