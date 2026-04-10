/**
 * Shared Utilities for Calyndra Mapmaker
 * Color palettes, name generation, export, and helper functions
 */

// ── Fantasy Name Generator ──────────────────────────────────────────

const NAME_PARTS = {
    prefixes: [
        'Ael', 'Bal', 'Cal', 'Dor', 'El', 'Fal', 'Gol', 'Har', 'Ith', 'Jar',
        'Kal', 'Lor', 'Mor', 'Nor', 'Or', 'Pel', 'Qar', 'Ral', 'Sal', 'Tar',
        'Ul', 'Val', 'War', 'Xan', 'Yar', 'Zal', 'Ash', 'Bri', 'Cyr', 'Dun',
        'Ehr', 'Fen', 'Grim', 'Hel', 'Ild', 'Jor', 'Kael', 'Lyn', 'Mael', 'Nyr',
        'Orl', 'Pyr', 'Rael', 'Syl', 'Thal', 'Und', 'Vael', 'Wyr', 'Xyl', 'Zeph'
    ],
    suffixes: [
        'heim', 'burg', 'holm', 'thal', 'stein', 'wald', 'berg', 'gart', 'hain', 'brück',
        'dor', 'mir', 'gard', 'rath', 'wind', 'haven', 'mere', 'dale', 'ford', 'gate',
        'hold', 'keep', 'reach', 'fall', 'crest', 'spire', 'watch', 'mark', 'moor', 'glen',
        'rion', 'aris', 'enna', 'oria', 'anth', 'iel', 'ion', 'ath', 'orn', 'en'
    ],
    riverPrefixes: [
        'Sil', 'Lor', 'And', 'Cel', 'Nim', 'Gal', 'Ith', 'Mor', 'Ael', 'Wyn',
        'Tir', 'Bel', 'Dun', 'Fen', 'Har', 'Kir', 'Mel', 'Nar', 'Ril', 'Tal'
    ],
    riverSuffixes: [
        'uin', 'eth', 'wyn', 'duin', 'iel', 'ath', 'or', 'in', 'as', 'iel',
        'enn', 'ith', 'oth', 'an', 'ir', 'ur', 'on', 'al', 'is', 'os'
    ],
    mountainPrefixes: [
        'Dor', 'Gor', 'Kar', 'Thr', 'Orm', 'Zan', 'Bor', 'Mor', 'Dur', 'Grim',
        'Ard', 'Fel', 'Hag', 'Iron', 'Krag', 'Storm', 'Thunder', 'Drake', 'Frost', 'Shadow'
    ],
    mountainSuffixes: [
        'peak', 'horn', 'fang', 'crag', 'spire', 'crown', 'tooth', 'reach', 'height', 'mount',
        'gol', 'gor', 'mak', 'dul', 'rim', 'rak', 'bar', 'zan', 'dak', 'nar'
    ]
};

export class NameGenerator {
    constructor(seed = 42) {
        this.seed = seed;
        this.usedNames = new Set();
    }

    _random() {
        this.seed = (this.seed * 16807 + 0) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    _pick(arr) {
        return arr[Math.floor(this._random() * arr.length)];
    }

    generate(type = 'city') {
        let name;
        let attempts = 0;
        do {
            switch (type) {
                case 'river':
                    name = this._pick(NAME_PARTS.riverPrefixes) + this._pick(NAME_PARTS.riverSuffixes);
                    break;
                case 'mountain':
                    name = this._pick(NAME_PARTS.mountainPrefixes) + this._pick(NAME_PARTS.mountainSuffixes);
                    break;
                case 'forest':
                    name = this._pick(NAME_PARTS.prefixes) + this._pick(NAME_PARTS.suffixes) + ' Wald';
                    break;
                default:
                    name = this._pick(NAME_PARTS.prefixes) + this._pick(NAME_PARTS.suffixes);
            }
            attempts++;
        } while (this.usedNames.has(name) && attempts < 50);

        this.usedNames.add(name);
        return name;
    }

    reset() {
        this.usedNames.clear();
    }
}

// ── Color Palettes ──────────────────────────────────────────────────

export const PALETTES = {
    terrain: {
        deepWater:    '#1a3a5c',
        water:        '#2a6496',
        shallowWater: '#4a90c4',
        sand:         '#d4b868',
        grass:        '#5a8a3c',
        darkGrass:    '#3d6b2e',
        forest:       '#2d5016',
        denseForest:  '#1a3a0e',
        hills:        '#8b7355',
        mountain:     '#6b6b6b',
        highMountain: '#9a9a9a',
        snow:         '#e8e8e8',
        desert:       '#c4a44a',
        swamp:        '#4a5a2a',
        tundra:       '#8a9a7a',
    },
    parchment: {
        bg:           '#f4e4c1',
        bgDark:       '#d4c4a1',
        ink:          '#2a1a0a',
        inkLight:     '#5a4a3a',
        accent:       '#8b4513',
        water:        '#6a8caf',
        forest:       '#4a6a3a',
        mountain:     '#7a6a5a',
        road:         '#8a7a6a',
    },
    battle: {
        grass:        '#4a7a2e',
        dirt:         '#8b7355',
        stone:        '#7a7a7a',
        wood:         '#6b4423',
        water:        '#3a6a9a',
        sand:         '#c4a44a',
        lava:         '#cc3300',
        ice:          '#aaccee',
        grid:         'rgba(0, 0, 0, 0.15)',
        gridHover:    'rgba(255, 255, 100, 0.3)',
    },
    city: {
        road:         '#b0a080',
        building:     '#8b7355',
        buildingRoof: '#6b4423',
        wall:         '#5a5a5a',
        wallTop:      '#7a7a7a',
        market:       '#c4a44a',
        temple:       '#9a8a6a',
        tavern:       '#7a5a3a',
        water:        '#4a80b0',
        grass:        '#5a8a3c',
        plaza:        '#c4b488',
        garden:       '#3d6b2e',
    },
    ui: {
        bgDark:       '#1a1412',
        bgPanel:      '#2a2218',
        bgInput:      '#3a3228',
        border:       '#5a4a3a',
        borderLight:  '#7a6a5a',
        text:         '#e8d8c8',
        textMuted:    '#9a8a7a',
        accent:       '#c4873a',
        accentHover:  '#d4974a',
        danger:       '#a03030',
        success:      '#3a8a3a',
    }
};

// ── Enemy/Token Definitions ─────────────────────────────────────────

export const ENEMY_TYPES = [
    { id: 'goblin',    name: 'Goblin',        color: '#4a8a2a', symbol: 'G', size: 1 },
    { id: 'orc',       name: 'Ork',           color: '#2a6a2a', symbol: 'O', size: 1 },
    { id: 'skeleton',  name: 'Skelett',       color: '#c8c8c8', symbol: 'S', size: 1 },
    { id: 'zombie',    name: 'Zombie',        color: '#6a7a5a', symbol: 'Z', size: 1 },
    { id: 'wolf',      name: 'Wolf',          color: '#6a6a6a', symbol: 'W', size: 1 },
    { id: 'spider',    name: 'Riesenspinne',  color: '#3a2a2a', symbol: 'Sp', size: 1 },
    { id: 'bandit',    name: 'Bandit',        color: '#5a3a2a', symbol: 'B', size: 1 },
    { id: 'troll',     name: 'Troll',         color: '#4a6a4a', symbol: 'T', size: 2 },
    { id: 'ogre',      name: 'Oger',          color: '#7a6a3a', symbol: 'Og', size: 2 },
    { id: 'dragon',    name: 'Drache',        color: '#aa2a2a', symbol: 'D', size: 3 },
    { id: 'demon',     name: 'Dämon',         color: '#8a1a3a', symbol: 'Dm', size: 2 },
    { id: 'lich',      name: 'Lich',          color: '#5a2a7a', symbol: 'L', size: 1 },
    { id: 'elemental', name: 'Elementar',     color: '#2a6a9a', symbol: 'E', size: 2 },
    { id: 'golem',     name: 'Golem',         color: '#8a7a6a', symbol: 'Go', size: 2 },
    { id: 'player',    name: 'Spieler',       color: '#2a5aaa', symbol: 'P', size: 1 },
    { id: 'npc',       name: 'NPC',           color: '#aa8a2a', symbol: 'N', size: 1 },
];

// ── Seeded Random ───────────────────────────────────────────────────

export class SeededRandom {
    constructor(seed = 42) {
        this.seed = seed;
        this.initial = seed;
    }

    next() {
        this.seed = (this.seed * 16807 + 0) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }

    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }

    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }

    shuffle(arr) {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    reset() {
        this.seed = this.initial;
    }
}

// ── Canvas Export ────────────────────────────────────────────────────

export function exportCanvasAsPNG(canvas, filename = 'calyndra-map.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

export function createHighResCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// ── Math Helpers ────────────────────────────────────────────────────

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

export function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

export function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = Math.round(clamp(x, 0, 255)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

export function lerpColor(color1, color2, t) {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);
    return rgbToHex(
        lerp(c1.r, c2.r, t),
        lerp(c1.g, c2.g, t),
        lerp(c1.b, c2.b, t)
    );
}
