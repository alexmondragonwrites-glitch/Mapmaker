/**
 * Calyndra Mapmaker - Lore Manager
 * Import/export world lore data from book projects
 * Provides data to map generators for consistent world-building
 */

// ── Lore Data Schema ────────────────────────────────────────────────

/**
 * @typedef {Object} LoreWorld
 * @property {string} name - World name
 * @property {string} description - World description
 * @property {LoreRegion[]} regions - Major regions/continents
 * @property {LoreCity[]} cities - All cities
 * @property {LoreLandmark[]} landmarks - Mountains, forests, lakes, etc.
 * @property {LoreRiver[]} rivers - Rivers
 * @property {LoreRoad[]} roads - Major trade routes
 * @property {LoreFaction[]} factions - Political factions
 * @property {LoreNPC[]} npcs - Important NPCs
 * @property {Object} meta - Metadata
 */

const EMPTY_LORE = {
    name: 'Calyndra',
    description: '',
    meta: {
        author: '',
        version: '1.0',
        lastModified: null,
    },
    regions: [],
    cities: [],
    landmarks: [],
    rivers: [],
    roads: [],
    factions: [],
    npcs: [],
};

const LANDMARK_TYPES = ['mountain', 'volcano', 'forest', 'lake', 'swamp', 'desert', 'ruins', 'tower', 'cave', 'island'];
const CITY_SIZES = ['village', 'town', 'city', 'metropolis', 'capital'];
const BUILDING_STYLES = ['human', 'elven', 'dwarven', 'mixed', 'orcish', 'ancient'];

export class LoreManager {
    constructor() {
        this.lore = this._deepCopy(EMPTY_LORE);
        this.listeners = new Set();
        this._loadFromStorage();
    }

    // ── Core Data Access ────────────────────────────────────────────

    getLore() {
        return this.lore;
    }

    getWorldName() {
        return this.lore.name || 'Unbenannte Welt';
    }

    getRegions() {
        return this.lore.regions || [];
    }

    getCities() {
        return this.lore.cities || [];
    }

    getCitiesInRegion(regionId) {
        return this.lore.cities.filter(c => c.regionId === regionId);
    }

    getLandmarks() {
        return this.lore.landmarks || [];
    }

    getLandmarksInRegion(regionId) {
        return this.lore.landmarks.filter(l => l.regionId === regionId);
    }

    getRivers() {
        return this.lore.rivers || [];
    }

    getRoads() {
        return this.lore.roads || [];
    }

    getFactions() {
        return this.lore.factions || [];
    }

    getNPCs() {
        return this.lore.npcs || [];
    }

    getNPCsInCity(cityId) {
        return this.lore.npcs.filter(n => n.cityId === cityId);
    }

    getRegionById(id) {
        return this.lore.regions.find(r => r.id === id);
    }

    getCityById(id) {
        return this.lore.cities.find(c => c.id === id);
    }

    // ── Data Modification ───────────────────────────────────────────

    setWorldName(name) {
        this.lore.name = name;
        this._save();
    }

    setWorldDescription(desc) {
        this.lore.description = desc;
        this._save();
    }

    addRegion(region) {
        region.id = region.id || this._genId('region');
        this.lore.regions.push(region);
        this._save();
        return region;
    }

    updateRegion(id, updates) {
        const region = this.lore.regions.find(r => r.id === id);
        if (region) Object.assign(region, updates);
        this._save();
    }

    removeRegion(id) {
        this.lore.regions = this.lore.regions.filter(r => r.id !== id);
        this.lore.cities = this.lore.cities.filter(c => c.regionId !== id);
        this.lore.landmarks = this.lore.landmarks.filter(l => l.regionId !== id);
        this._save();
    }

    addCity(city) {
        city.id = city.id || this._genId('city');
        this.lore.cities.push(city);
        this._save();
        return city;
    }

    updateCity(id, updates) {
        const city = this.lore.cities.find(c => c.id === id);
        if (city) Object.assign(city, updates);
        this._save();
    }

    removeCity(id) {
        this.lore.cities = this.lore.cities.filter(c => c.id !== id);
        this.lore.npcs = this.lore.npcs.filter(n => n.cityId !== id);
        this._save();
    }

    addLandmark(landmark) {
        landmark.id = landmark.id || this._genId('landmark');
        this.lore.landmarks.push(landmark);
        this._save();
        return landmark;
    }

    updateLandmark(id, updates) {
        const lm = this.lore.landmarks.find(l => l.id === id);
        if (lm) Object.assign(lm, updates);
        this._save();
    }

    removeLandmark(id) {
        this.lore.landmarks = this.lore.landmarks.filter(l => l.id !== id);
        this._save();
    }

    addRiver(river) {
        river.id = river.id || this._genId('river');
        this.lore.rivers.push(river);
        this._save();
        return river;
    }

    removeRiver(id) {
        this.lore.rivers = this.lore.rivers.filter(r => r.id !== id);
        this._save();
    }

    addRoad(road) {
        road.id = road.id || this._genId('road');
        this.lore.roads.push(road);
        this._save();
        return road;
    }

    removeRoad(id) {
        this.lore.roads = this.lore.roads.filter(r => r.id !== id);
        this._save();
    }

    addFaction(faction) {
        faction.id = faction.id || this._genId('faction');
        this.lore.factions.push(faction);
        this._save();
        return faction;
    }

    removeFaction(id) {
        this.lore.factions = this.lore.factions.filter(f => f.id !== id);
        this._save();
    }

    addNPC(npc) {
        npc.id = npc.id || this._genId('npc');
        this.lore.npcs.push(npc);
        this._save();
        return npc;
    }

    removeNPC(id) {
        this.lore.npcs = this.lore.npcs.filter(n => n.id !== id);
        this._save();
    }

    // ── Import/Export ────────────────────────────────────────────────

    importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this._validateLore(data);
            this.lore = this._mergeLore(this._deepCopy(EMPTY_LORE), data);
            this.lore.meta.lastModified = new Date().toISOString();
            this._save();
            this._notify();
            return { success: true, message: `"${this.lore.name}" importiert: ${this.lore.regions.length} Regionen, ${this.lore.cities.length} Städte, ${this.lore.landmarks.length} Landmarken` };
        } catch (err) {
            return { success: false, message: `Import-Fehler: ${err.message}` };
        }
    }

    exportToJSON() {
        this.lore.meta.lastModified = new Date().toISOString();
        return JSON.stringify(this.lore, null, 2);
    }

    exportToFile() {
        const json = this.exportToJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.lore.name.toLowerCase().replace(/\s+/g, '-')}-lore.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async importFromFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = this.importFromJSON(e.target.result);
                resolve(result);
            };
            reader.onerror = () => {
                resolve({ success: false, message: 'Datei konnte nicht gelesen werden' });
            };
            reader.readAsText(file);
        });
    }

    clearAll() {
        this.lore = this._deepCopy(EMPTY_LORE);
        this._save();
        this._notify();
    }

    // ── Lore-to-Generator Bridge ────────────────────────────────────

    /**
     * Returns world map generation hints from lore data.
     * The world map generator uses this to place cities, landmarks, etc.
     * at approximately correct relative positions.
     */
    getWorldMapHints() {
        const hints = {
            worldName: this.lore.name,
            worldDescription: this.lore.description,
            cities: [],
            landmarks: [],
            rivers: [],
            roads: [],
            regions: [],
        };

        for (const region of this.lore.regions) {
            hints.regions.push({
                id: region.id,
                name: region.name,
                description: region.description,
                climate: region.climate,
                terrain: region.terrain,
                // Relative position (0-1 range) on world map
                relX: region.relX ?? 0.5,
                relY: region.relY ?? 0.5,
                relRadius: region.relRadius ?? 0.2,
            });
        }

        for (const city of this.lore.cities) {
            hints.cities.push({
                id: city.id,
                name: city.name,
                size: city.size || 'town',
                style: city.style || 'human',
                isCapital: city.isCapital || false,
                regionId: city.regionId,
                relX: city.relX ?? null,
                relY: city.relY ?? null,
                description: city.description,
                population: city.population,
            });
        }

        for (const lm of this.lore.landmarks) {
            hints.landmarks.push({
                id: lm.id,
                name: lm.name,
                type: lm.type,
                regionId: lm.regionId,
                relX: lm.relX ?? null,
                relY: lm.relY ?? null,
                description: lm.description,
            });
        }

        for (const river of this.lore.rivers) {
            hints.rivers.push({
                id: river.id,
                name: river.name,
                startRegionId: river.startRegionId,
                endRegionId: river.endRegionId,
                description: river.description,
            });
        }

        for (const road of this.lore.roads) {
            hints.roads.push({
                id: road.id,
                name: road.name,
                fromCityId: road.fromCityId,
                toCityId: road.toCityId,
                description: road.description,
            });
        }

        return hints;
    }

    /**
     * Returns city generation hints for a specific city.
     */
    getCityMapHints(cityId) {
        const city = this.getCityById(cityId);
        if (!city) return null;

        return {
            name: city.name,
            size: city.size || 'medium',
            style: city.style || 'human',
            hasWalls: city.hasWalls ?? true,
            hasRiver: city.hasRiver ?? false,
            hasCastle: city.hasCastle ?? false,
            description: city.description,
            population: city.population,
            districts: city.districts || [],
            landmarks: city.landmarks || [],
            npcs: this.getNPCsInCity(cityId),
            faction: city.factionId ? this.lore.factions.find(f => f.id === city.factionId) : null,
        };
    }

    // ── Change Listeners ────────────────────────────────────────────

    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _notify() {
        for (const cb of this.listeners) {
            try { cb(this.lore); } catch (e) { console.error('Lore listener error:', e); }
        }
    }

    // ── Persistence (localStorage) ──────────────────────────────────

    _save() {
        try {
            localStorage.setItem('calyndra-lore', JSON.stringify(this.lore));
        } catch (e) {
            console.warn('Could not save lore to localStorage:', e);
        }
        this._notify();
    }

    _loadFromStorage() {
        try {
            const stored = localStorage.getItem('calyndra-lore');
            if (stored) {
                const data = JSON.parse(stored);
                this.lore = this._mergeLore(this._deepCopy(EMPTY_LORE), data);
            }
        } catch (e) {
            console.warn('Could not load lore from localStorage:', e);
        }
    }

    // ── Validation ──────────────────────────────────────────────────

    _validateLore(data) {
        if (typeof data !== 'object' || data === null) {
            throw new Error('Ungültiges JSON-Format: Objekt erwartet');
        }
        if (data.cities && !Array.isArray(data.cities)) {
            throw new Error('Ungültiges Format: "cities" muss ein Array sein');
        }
        if (data.regions && !Array.isArray(data.regions)) {
            throw new Error('Ungültiges Format: "regions" muss ein Array sein');
        }
    }

    _mergeLore(base, imported) {
        const result = { ...base };
        for (const key of Object.keys(imported)) {
            if (key in result) {
                if (Array.isArray(result[key]) && Array.isArray(imported[key])) {
                    result[key] = imported[key];
                } else if (typeof result[key] === 'object' && typeof imported[key] === 'object' && !Array.isArray(result[key])) {
                    result[key] = { ...result[key], ...imported[key] };
                } else {
                    result[key] = imported[key];
                }
            }
        }
        return result;
    }

    // ── Helpers ─────────────────────────────────────────────────────

    _genId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    _deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // ── Statistics ──────────────────────────────────────────────────

    getStats() {
        return {
            regions: this.lore.regions.length,
            cities: this.lore.cities.length,
            landmarks: this.lore.landmarks.length,
            rivers: this.lore.rivers.length,
            roads: this.lore.roads.length,
            factions: this.lore.factions.length,
            npcs: this.lore.npcs.length,
        };
    }

    hasLore() {
        const s = this.getStats();
        return s.regions > 0 || s.cities > 0 || s.landmarks > 0;
    }
}

export { LANDMARK_TYPES, CITY_SIZES, BUILDING_STYLES, EMPTY_LORE };
