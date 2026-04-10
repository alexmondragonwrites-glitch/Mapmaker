/**
 * Calyndra Mapmaker - Main Application
 * Plugin-based architecture for extensible map generators
 * With Lore Management and Zoomable Map Navigation
 */

import { exportCanvasAsPNG, ENEMY_TYPES } from './utils.js';
import { WorldMapGenerator, setWorldMapLore, setWorldMapZoom } from './worldmap.js';
import { CityMapGenerator, setCityMapLore } from './citymap.js';
import { BattleMapGenerator } from './battlemap.js';
import { LoreManager, LANDMARK_TYPES, CITY_SIZES, BUILDING_STYLES } from './lore.js';
import { ZoomController } from './zoomable.js';

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
        this.activePanel = 'generator'; // 'generator' | 'lore'

        // Lore Manager
        this.lore = new LoreManager();

        // Register built-in generators
        this.registry.register(WorldMapGenerator);
        this.registry.register(CityMapGenerator);
        this.registry.register(BattleMapGenerator);
    }

    init() {
        this.canvas = document.getElementById('map-canvas');

        // Initialize zoom controller
        this.zoom = new ZoomController(this.canvas, this);
        this.zoom.onChange((event, data) => this._handleZoomEvent(event, data));

        // Wire lore to generators
        setWorldMapLore(this.lore);
        setWorldMapZoom(this.zoom);
        setCityMapLore(this.lore);

        // Lore change listener
        this.lore.onChange(() => this._updateLoreStats());

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
        this.activePanel = 'generator';

        // Reset zoom when switching generators
        this.zoom.resetToWorld();
        this.zoom.setEnabled(id === 'worldmap');

        // Update UI
        this._updateTabs();
        this._showGeneratorPanel();
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

        requestAnimationFrame(() => {
            try {
                this.activeGenerator.instance.generate(this.canvas, this.config);
                const loreLabel = this.lore.hasLore() ? ' [Lore aktiv]' : '';
                statusEl.textContent = `${this.activeGenerator.label} generiert (${this.canvas.width}×${this.canvas.height}px)${loreLabel}`;
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

    // ── Zoom Event Handling ─────────────────────────────────────────

    _handleZoomEvent(event, data) {
        if (event === 'zoomIn') {
            if (data.level === 'city') {
                // Switch to city map generator with city data
                const gen = this.registry.get('citymap');
                if (!gen) return;

                this.activeGenerator = gen;
                this.config = {
                    ...gen.instance.defaultConfig,
                    seed: data.data.seed || this.config.seed,
                    citySize: this._mapCitySize(data.data.size),
                    style: data.data.style || 'human',
                    loreCityId: data.data.id,
                };

                this._updateTabs();
                this._buildControls();
                this.generate();
            } else if (data.level === 'region') {
                // Regenerate world map zoomed into region
                // For now: recenter/rescale based on region data
                this.generate();
            }
        } else if (event === 'zoomOut' || event === 'jumpTo' || event === 'reset') {
            if (data.level === 'world') {
                this.switchGenerator('worldmap');
            }
        }
    }

    _mapCitySize(size) {
        const map = { small: 'small', medium: 'medium', large: 'large', 'village': 'small', 'town': 'medium', 'city': 'large', 'metropolis': 'metropolis', 'capital': 'metropolis' };
        return map[size] || 'medium';
    }

    // ── UI Construction ─────────────────────────────────────────────

    _buildUI() {
        const tabBar = document.getElementById('tab-bar');
        tabBar.innerHTML = '';

        // Generator tabs
        for (const gen of this.registry.getAll()) {
            const tab = document.createElement('button');
            tab.className = 'tab-btn';
            tab.dataset.id = gen.id;
            tab.innerHTML = `<span class="tab-icon">${gen.icon}</span> ${gen.label}`;
            tab.addEventListener('click', () => this.switchGenerator(gen.id));
            tabBar.appendChild(tab);
        }

        // Lore tab
        const loreTab = document.createElement('button');
        loreTab.className = 'tab-btn';
        loreTab.dataset.id = 'lore';
        loreTab.innerHTML = `<span class="tab-icon">📖</span> Lore`;
        loreTab.addEventListener('click', () => this._showLorePanel());
        tabBar.appendChild(loreTab);

        // Action buttons
        document.getElementById('btn-generate').addEventListener('click', () => this.generate());
        document.getElementById('btn-random').addEventListener('click', () => this.randomize());
        document.getElementById('btn-export').addEventListener('click', () => this.export());
    }

    _updateTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (this.activePanel === 'lore') {
                btn.classList.toggle('active', btn.dataset.id === 'lore');
            } else {
                btn.classList.toggle('active', btn.dataset.id === this.activeGenerator?.id);
            }
        });
    }

    _showGeneratorPanel() {
        this.activePanel = 'generator';
        this._updateTabs();
        document.querySelector('.controls-header').textContent = 'Einstellungen';
        document.getElementById('controls-content').classList.remove('lore-panel-active');
    }

    _showLorePanel() {
        this.activePanel = 'lore';
        this._updateTabs();
        document.querySelector('.controls-header').textContent = 'Lore-Verwaltung';
        this._buildLoreUI();
    }

    // ── Lore UI ─────────────────────────────────────────────────────

    _buildLoreUI() {
        const container = document.getElementById('controls-content');
        container.innerHTML = '';
        container.classList.add('lore-panel-active');

        // ── Import/Export Section ──
        const importSection = this._createSection('Import / Export');

        // File upload
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'lore-upload-area';
        uploadWrap.innerHTML = `
            <div class="upload-icon">📁</div>
            <div class="upload-text">JSON-Datei hierher ziehen<br>oder klicken</div>
            <input type="file" accept=".json" class="upload-input" id="lore-file-input">
        `;
        uploadWrap.addEventListener('click', () => document.getElementById('lore-file-input').click());
        uploadWrap.addEventListener('dragover', (e) => { e.preventDefault(); uploadWrap.classList.add('dragover'); });
        uploadWrap.addEventListener('dragleave', () => uploadWrap.classList.remove('dragover'));
        uploadWrap.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadWrap.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this._handleLoreImport(e.dataTransfer.files[0]);
        });
        document.getElementById('lore-file-input')?.addEventListener?.('change', () => {});
        importSection.appendChild(uploadWrap);

        // We need to add the listener after the element is in the DOM
        setTimeout(() => {
            const fileInput = document.getElementById('lore-file-input');
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) this._handleLoreImport(e.target.files[0]);
                });
            }
        }, 0);

        // Export buttons
        const exportRow = document.createElement('div');
        exportRow.className = 'lore-btn-row';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn';
        exportBtn.textContent = 'JSON exportieren';
        exportBtn.addEventListener('click', () => this.lore.exportToFile());

        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn btn-danger-small';
        clearBtn.textContent = 'Alles löschen';
        clearBtn.addEventListener('click', () => {
            if (confirm('Alle Lore-Daten löschen?')) {
                this.lore.clearAll();
                this._buildLoreUI();
            }
        });

        exportRow.appendChild(exportBtn);
        exportRow.appendChild(clearBtn);
        importSection.appendChild(exportRow);

        // Import status message
        const statusMsg = document.createElement('div');
        statusMsg.id = 'lore-status';
        statusMsg.className = 'lore-status';
        importSection.appendChild(statusMsg);

        container.appendChild(importSection);

        // ── Stats ──
        const stats = this.lore.getStats();
        const statsSection = this._createSection('Übersicht');
        const statsGrid = document.createElement('div');
        statsGrid.className = 'lore-stats';
        statsGrid.innerHTML = `
            <div class="stat"><span class="stat-num">${stats.regions}</span><span class="stat-label">Regionen</span></div>
            <div class="stat"><span class="stat-num">${stats.cities}</span><span class="stat-label">Städte</span></div>
            <div class="stat"><span class="stat-num">${stats.landmarks}</span><span class="stat-label">Landmarken</span></div>
            <div class="stat"><span class="stat-num">${stats.rivers}</span><span class="stat-label">Flüsse</span></div>
            <div class="stat"><span class="stat-num">${stats.roads}</span><span class="stat-label">Straßen</span></div>
            <div class="stat"><span class="stat-num">${stats.factions}</span><span class="stat-label">Fraktionen</span></div>
            <div class="stat"><span class="stat-num">${stats.npcs}</span><span class="stat-label">NPCs</span></div>
        `;
        statsSection.appendChild(statsGrid);
        container.appendChild(statsSection);

        // ── World Name ──
        const worldSection = this._createSection('Weltname');
        const nameInput = this._createTextInput('world-name', this.lore.getWorldName(), (val) => {
            this.lore.setWorldName(val);
        });
        worldSection.appendChild(nameInput);

        const descInput = this._createTextarea('world-desc', this.lore.getLore().description || '', 'Beschreibung der Welt...', (val) => {
            this.lore.setWorldDescription(val);
        });
        worldSection.appendChild(descInput);
        container.appendChild(worldSection);

        // ── Regions ──
        const regionsSection = this._createSection('Regionen');
        this._buildLoreList(regionsSection, this.lore.getRegions(), 'region', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
                { key: 'climate', label: 'Klima', type: 'select', options: ['gemäßigt', 'tropisch', 'arktisch', 'wüste', 'mediterran'] },
                { key: 'terrain', label: 'Terrain', type: 'select', options: ['flachland', 'hügel', 'gebirge', 'wald', 'küste', 'sumpf'] },
                { key: 'relX', label: 'Position X (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
                { key: 'relY', label: 'Position Y (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
                { key: 'relRadius', label: 'Größe (0-0.5)', type: 'number', min: 0.05, max: 0.5, step: 0.05 },
            ],
            onAdd: () => this.lore.addRegion({ name: 'Neue Region', relX: 0.5, relY: 0.5, relRadius: 0.15 }),
            onUpdate: (id, updates) => this.lore.updateRegion(id, updates),
            onRemove: (id) => this.lore.removeRegion(id),
        });
        container.appendChild(regionsSection);

        // ── Cities ──
        const citiesSection = this._createSection('Städte');
        const regionOptions = this.lore.getRegions().map(r => ({ value: r.id, label: r.name }));
        this._buildLoreList(citiesSection, this.lore.getCities(), 'city', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
                { key: 'size', label: 'Größe', type: 'select', options: CITY_SIZES },
                { key: 'style', label: 'Baustil', type: 'select', options: BUILDING_STYLES },
                { key: 'isCapital', label: 'Hauptstadt', type: 'checkbox' },
                { key: 'hasWalls', label: 'Stadtmauer', type: 'checkbox' },
                { key: 'hasRiver', label: 'Fluss', type: 'checkbox' },
                { key: 'hasCastle', label: 'Burg', type: 'checkbox' },
                { key: 'regionId', label: 'Region', type: 'select', options: [{ value: '', label: '(keine)' }, ...regionOptions] },
                { key: 'relX', label: 'Position X (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
                { key: 'relY', label: 'Position Y (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
                { key: 'population', label: 'Einwohner', type: 'number', min: 0, max: 1000000, step: 100 },
            ],
            onAdd: () => this.lore.addCity({ name: 'Neue Stadt', size: 'town', style: 'human' }),
            onUpdate: (id, updates) => this.lore.updateCity(id, updates),
            onRemove: (id) => this.lore.removeCity(id),
        });
        container.appendChild(citiesSection);

        // ── Landmarks ──
        const landmarksSection = this._createSection('Landmarken');
        this._buildLoreList(landmarksSection, this.lore.getLandmarks(), 'landmark', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'type', label: 'Typ', type: 'select', options: LANDMARK_TYPES },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
                { key: 'regionId', label: 'Region', type: 'select', options: [{ value: '', label: '(keine)' }, ...regionOptions] },
                { key: 'relX', label: 'Position X (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
                { key: 'relY', label: 'Position Y (0-1)', type: 'number', min: 0, max: 1, step: 0.05 },
            ],
            onAdd: () => this.lore.addLandmark({ name: 'Neue Landmarke', type: 'mountain' }),
            onUpdate: (id, updates) => this.lore.updateLandmark(id, updates),
            onRemove: (id) => this.lore.removeLandmark(id),
        });
        container.appendChild(landmarksSection);

        // ── Rivers ──
        const riversSection = this._createSection('Flüsse');
        this._buildLoreList(riversSection, this.lore.getRivers(), 'river', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
            ],
            onAdd: () => this.lore.addRiver({ name: 'Neuer Fluss' }),
            onUpdate: (id, updates) => { /* rivers use addRiver */ },
            onRemove: (id) => this.lore.removeRiver(id),
        });
        container.appendChild(riversSection);

        // ── Roads ──
        const roadsSection = this._createSection('Handelsrouten');
        const cityOptions = this.lore.getCities().map(c => ({ value: c.id, label: c.name }));
        this._buildLoreList(roadsSection, this.lore.getRoads(), 'road', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'fromCityId', label: 'Von', type: 'select', options: [{ value: '', label: '(wählen)' }, ...cityOptions] },
                { key: 'toCityId', label: 'Nach', type: 'select', options: [{ value: '', label: '(wählen)' }, ...cityOptions] },
            ],
            onAdd: () => this.lore.addRoad({ name: 'Neue Route' }),
            onUpdate: (id, updates) => { },
            onRemove: (id) => this.lore.removeRoad(id),
        });
        container.appendChild(roadsSection);

        // ── Factions ──
        const factionsSection = this._createSection('Fraktionen');
        this._buildLoreList(factionsSection, this.lore.getFactions(), 'faction', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
                { key: 'color', label: 'Farbe', type: 'text' },
            ],
            onAdd: () => this.lore.addFaction({ name: 'Neue Fraktion' }),
            onUpdate: (id, updates) => { },
            onRemove: (id) => this.lore.removeFaction(id),
        });
        container.appendChild(factionsSection);

        // ── NPCs ──
        const npcsSection = this._createSection('NPCs');
        this._buildLoreList(npcsSection, this.lore.getNPCs(), 'npc', {
            fields: [
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'role', label: 'Rolle', type: 'text' },
                { key: 'description', label: 'Beschreibung', type: 'textarea' },
                { key: 'cityId', label: 'Stadt', type: 'select', options: [{ value: '', label: '(keine)' }, ...cityOptions] },
            ],
            onAdd: () => this.lore.addNPC({ name: 'Neuer NPC' }),
            onUpdate: (id, updates) => { },
            onRemove: (id) => this.lore.removeNPC(id),
        });
        container.appendChild(npcsSection);
    }

    // ── Lore UI Helpers ─────────────────────────────────────────────

    _createSection(title) {
        const section = document.createElement('div');
        section.className = 'lore-section';
        const header = document.createElement('h3');
        header.className = 'lore-section-title';
        header.textContent = title;
        section.appendChild(header);
        return section;
    }

    _createTextInput(id, value, onChange) {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.className = 'lore-input';
        input.value = value;
        input.addEventListener('change', () => onChange(input.value));
        return input;
    }

    _createTextarea(id, value, placeholder, onChange) {
        const textarea = document.createElement('textarea');
        textarea.id = id;
        textarea.className = 'lore-textarea';
        textarea.value = value;
        textarea.placeholder = placeholder;
        textarea.rows = 3;
        textarea.addEventListener('change', () => onChange(textarea.value));
        return textarea;
    }

    _buildLoreList(container, items, type, opts) {
        const list = document.createElement('div');
        list.className = 'lore-list';

        for (const item of items) {
            const card = this._createLoreCard(item, type, opts);
            list.appendChild(card);
        }

        container.appendChild(list);

        // Add button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn lore-add-btn';
        addBtn.textContent = '+ Hinzufügen';
        addBtn.addEventListener('click', () => {
            opts.onAdd();
            this._buildLoreUI(); // Rebuild UI
        });
        container.appendChild(addBtn);
    }

    _createLoreCard(item, type, opts) {
        const card = document.createElement('div');
        card.className = 'lore-card';

        // Header with name and delete
        const header = document.createElement('div');
        header.className = 'lore-card-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'lore-card-name';
        nameSpan.textContent = item.name || '(unbenannt)';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'lore-card-delete';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Entfernen';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            opts.onRemove(item.id);
            card.remove();
        });

        header.appendChild(nameSpan);
        header.appendChild(deleteBtn);
        card.appendChild(header);

        // Expandable details
        const details = document.createElement('div');
        details.className = 'lore-card-details';
        details.style.display = 'none';

        for (const field of opts.fields) {
            const group = document.createElement('div');
            group.className = 'lore-field';

            const label = document.createElement('label');
            label.textContent = field.label;
            group.appendChild(label);

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 2;
                input.value = item[field.key] || '';
            } else if (field.type === 'select') {
                input = document.createElement('select');
                const options = Array.isArray(field.options)
                    ? field.options.map(o => typeof o === 'string' ? { value: o, label: o } : o)
                    : [];
                for (const opt of options) {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    option.selected = item[field.key] === opt.value;
                    input.appendChild(option);
                }
            } else if (field.type === 'checkbox') {
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = item[field.key] || false;
            } else if (field.type === 'number') {
                input = document.createElement('input');
                input.type = 'number';
                input.min = field.min ?? '';
                input.max = field.max ?? '';
                input.step = field.step ?? 1;
                input.value = item[field.key] ?? '';
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = item[field.key] || '';
            }

            input.className = 'lore-input';
            input.addEventListener('change', () => {
                let val;
                if (field.type === 'checkbox') val = input.checked;
                else if (field.type === 'number') val = parseFloat(input.value);
                else val = input.value;

                item[field.key] = val;
                opts.onUpdate(item.id, { [field.key]: val });

                // Update card name if name field changed
                if (field.key === 'name') {
                    nameSpan.textContent = val || '(unbenannt)';
                }
            });

            group.appendChild(input);
            details.appendChild(group);
        }

        card.appendChild(details);

        // Toggle expand
        header.addEventListener('click', () => {
            const isHidden = details.style.display === 'none';
            details.style.display = isHidden ? 'block' : 'none';
            card.classList.toggle('expanded', isHidden);
        });

        return card;
    }

    async _handleLoreImport(file) {
        const result = await this.lore.importFromFile(file);
        const statusEl = document.getElementById('lore-status');
        if (statusEl) {
            statusEl.textContent = result.message;
            statusEl.className = `lore-status ${result.success ? 'success' : 'error'}`;
        }
        if (result.success) {
            this._buildLoreUI();
            // Regenerate current map with new lore
            if (this.activeGenerator) this.generate();
        }
    }

    _updateLoreStats() {
        // If lore panel is active, refresh stats
        if (this.activePanel === 'lore') {
            // Stats are rebuilt with _buildLoreUI, but we can update in-place
        }
    }

    // ── Generator Controls ──────────────────────────────────────────

    _buildControls() {
        const container = document.getElementById('controls-content');
        container.innerHTML = '';
        container.classList.remove('lore-panel-active');

        const controls = this.activeGenerator.controls;

        // Show zoom navigation hint if on world map with lore
        if (this.activeGenerator.id === 'worldmap' && this.lore.hasLore()) {
            const hint = document.createElement('div');
            hint.className = 'zoom-hint';
            hint.innerHTML = `📖 <strong>Lore aktiv</strong> — Klicke auf Städte in der Karte um hineinzuzoomen`;
            container.appendChild(hint);
        }

        // Show zoom-back button if zoomed in
        if (this.zoom.isZoomed()) {
            const backBtn = document.createElement('button');
            backBtn.className = 'btn zoom-back-btn';
            backBtn.innerHTML = '← Zurück zur Weltkarte';
            backBtn.addEventListener('click', () => this.zoom.resetToWorld());
            container.appendChild(backBtn);
        }

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

        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn btn-danger';
        clearBtn.textContent = 'Alle Tokens entfernen';
        clearBtn.addEventListener('click', () => {
            gen.clearTokens();
            this.generate();
        });
        section.appendChild(clearBtn);

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
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

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
                case 'Escape':
                    if (this.zoom.isZoomed()) {
                        this.zoom.resetToWorld();
                    }
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
