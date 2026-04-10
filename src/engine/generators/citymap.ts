/**
 * Calyndra Mapmaker - City Map Generator
 * Generates detailed fantasy city layouts with districts, buildings, walls, and landmarks
 */

import { SimplexNoise } from '../noise';
import { NameGenerator, PALETTES, SeededRandom, clamp, distance } from '../../utils';
import { drawHumanHouse, drawElvenHouse, drawDwarvenHouse, drawTower, drawTemple, drawTavern, drawCastle, drawTree, drawMapBorder } from '../assets';

// Lore integration - set externally
let _loreManager = null;
export function setCityMapLore(lore) { _loreManager = lore; }

export class CityMapGenerator {
    static id = 'citymap';
    static label = 'Stadtkarte';
    static icon = '🏰';

    constructor() {
        this.defaultConfig = {
            seed: Math.floor(Math.random() * 100000),
            width: 1200,
            height: 900,
            citySize: 'medium',       // small | medium | large | metropolis
            style: 'human',           // human | elven | dwarven | mixed
            hasWalls: true,
            hasRiver: true,
            hasCastle: true,
            districtCount: 5,
            buildingDensity: 0.7,
            showLabels: true,
            showBorder: true,
        };
    }

    getControls() {
        return [
            { type: 'number', key: 'seed', label: 'Seed', min: 0, max: 999999 },
            { type: 'select', key: 'width', label: 'Breite', options: [
                { value: 800, label: '800px' }, { value: 1200, label: '1200px' },
                { value: 1920, label: '1920px (HD)' }, { value: 3840, label: '3840px (4K)' },
            ]},
            { type: 'select', key: 'height', label: 'Höhe', options: [
                { value: 600, label: '600px' }, { value: 900, label: '900px' },
                { value: 1080, label: '1080px (HD)' }, { value: 2160, label: '2160px (4K)' },
            ]},
            { type: 'select', key: 'citySize', label: 'Stadtgröße', options: [
                { value: 'small', label: 'Klein (Dorf)' },
                { value: 'medium', label: 'Mittel (Stadt)' },
                { value: 'large', label: 'Groß (Großstadt)' },
                { value: 'metropolis', label: 'Metropole' },
            ]},
            { type: 'select', key: 'style', label: 'Baustil', options: [
                { value: 'human', label: 'Menschen' },
                { value: 'elven', label: 'Elfen' },
                { value: 'dwarven', label: 'Zwerge' },
                { value: 'mixed', label: 'Gemischt' },
            ]},
            { type: 'checkbox', key: 'hasWalls', label: 'Stadtmauer' },
            { type: 'checkbox', key: 'hasRiver', label: 'Fluss' },
            { type: 'checkbox', key: 'hasCastle', label: 'Burg/Schloss' },
            { type: 'range', key: 'districtCount', label: 'Bezirke', min: 2, max: 10, step: 1 },
            { type: 'range', key: 'buildingDensity', label: 'Gebäudedichte', min: 0.3, max: 1.0, step: 0.1 },
            { type: 'checkbox', key: 'showLabels', label: 'Beschriftungen' },
            { type: 'checkbox', key: 'showBorder', label: 'Kartenrand' },
        ];
    }

    generate(canvas, config = {}) {
        const cfg = { ...this.defaultConfig, ...config };

        // Apply lore hints if a lore city ID is set
        if (cfg.loreCityId && _loreManager) {
            const hints = _loreManager.getCityMapHints(cfg.loreCityId);
            if (hints) {
                cfg.citySize = hints.size || cfg.citySize;
                cfg.style = hints.style || cfg.style;
                cfg.hasWalls = hints.hasWalls ?? cfg.hasWalls;
                cfg.hasRiver = hints.hasRiver ?? cfg.hasRiver;
                cfg.hasCastle = hints.hasCastle ?? cfg.hasCastle;
                cfg._loreName = hints.name;
                cfg._loreDistricts = hints.districts;
                cfg._loreNPCs = hints.npcs;
                cfg._loreFaction = hints.faction;
            }
        }

        canvas.width = cfg.width;
        canvas.height = cfg.height;
        const ctx = canvas.getContext('2d');

        const noise = new SimplexNoise(cfg.seed);
        const rng = new SeededRandom(cfg.seed);
        const names = new NameGenerator(cfg.seed);

        const cityName = cfg._loreName || names.generate('city');
        const cityRadius = this._getCityRadius(cfg);
        const centerX = cfg.width / 2;
        const centerY = cfg.height / 2;

        // Background - grass/terrain
        this._renderBackground(ctx, cfg, noise);

        // River
        let riverPoints = [];
        if (cfg.hasRiver) {
            riverPoints = this._generateRiver(cfg, rng);
            this._renderRiver(ctx, cfg, riverPoints);
        }

        // Generate districts using Voronoi-like regions
        const districts = this._generateDistricts(cfg, rng, names, centerX, centerY, cityRadius);

        // City walls
        if (cfg.hasWalls) {
            this._renderWalls(ctx, cfg, centerX, centerY, cityRadius, rng, noise);
        }

        // Roads (radial + ring)
        const roads = this._generateRoads(cfg, centerX, centerY, cityRadius, rng, districts);
        this._renderRoads(ctx, cfg, roads);

        // Buildings per district
        this._renderBuildings(ctx, cfg, districts, roads, riverPoints, centerX, centerY, cityRadius, rng, noise);

        // Landmarks
        this._renderLandmarks(ctx, cfg, centerX, centerY, cityRadius, rng, names, districts);

        // Castle
        if (cfg.hasCastle) {
            drawCastle(ctx, centerX, centerY - cityRadius * 0.3, Math.max(24, cityRadius * 0.12));
        }

        // Surrounding trees
        this._renderSurroundingTrees(ctx, cfg, centerX, centerY, cityRadius, rng);

        // Labels
        if (cfg.showLabels) {
            this._renderLabels(ctx, cfg, districts, cityName, centerX, centerY);
        }

        // Border
        if (cfg.showBorder) {
            drawMapBorder(ctx, cfg.width, cfg.height, 'ornate');
        }
    }

    _getCityRadius(cfg) {
        const base = Math.min(cfg.width, cfg.height) * 0.35;
        switch (cfg.citySize) {
            case 'small': return base * 0.5;
            case 'medium': return base * 0.7;
            case 'large': return base * 0.85;
            case 'metropolis': return base * 1.0;
            default: return base * 0.7;
        }
    }

    _renderBackground(ctx, cfg, noise) {
        const { width, height } = cfg;
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const n = (noise.fbm(x / 150, y / 150, 3) + 1) * 0.5;
                const pi = (y * width + x) * 4;

                const r = 70 + n * 40;
                const g = 120 + n * 30;
                const b = 50 + n * 20;

                data[pi] = r;
                data[pi + 1] = g;
                data[pi + 2] = b;
                data[pi + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    _generateRiver(cfg, rng) {
        const { width, height } = cfg;
        const points = [];
        const startSide = rng.nextInt(0, 1); // 0 = left-right, 1 = top-bottom

        if (startSide === 0) {
            let y = height * rng.nextFloat(0.3, 0.7);
            for (let x = 0; x <= width; x += 8) {
                y += rng.nextFloat(-5, 5);
                y = clamp(y, height * 0.15, height * 0.85);
                points.push({ x, y });
            }
        } else {
            let x = width * rng.nextFloat(0.3, 0.7);
            for (let y = 0; y <= height; y += 8) {
                x += rng.nextFloat(-5, 5);
                x = clamp(x, width * 0.15, width * 0.85);
                points.push({ x, y });
            }
        }

        return points;
    }

    _renderRiver(ctx, cfg, points) {
        if (points.length < 2) return;

        // River body
        ctx.save();
        ctx.strokeStyle = PALETTES.city.water;
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();

        // Lighter center
        ctx.strokeStyle = '#6aa0c0';
        ctx.lineWidth = 12;
        ctx.stroke();

        ctx.restore();
    }

    _generateDistricts(cfg, rng, names, centerX, centerY, cityRadius) {
        const districts = [];
        const districtTypes = ['markt', 'wohn', 'handwerk', 'adel', 'hafen', 'tempel', 'garten', 'armen', 'akademie', 'kaserne'];
        const districtNames = {
            markt: 'Marktviertel', wohn: 'Wohnviertel', handwerk: 'Handwerkerviertel',
            adel: 'Adelsviertel', hafen: 'Hafenviertel', tempel: 'Tempelviertel',
            garten: 'Gartenviertel', armen: 'Armenviertel', akademie: 'Akademieviertel',
            kaserne: 'Kasernenviertel'
        };

        const count = Math.min(cfg.districtCount, districtTypes.length);
        const shuffled = rng.shuffle(districtTypes).slice(0, count);

        const angleStep = (Math.PI * 2) / count;
        for (let i = 0; i < count; i++) {
            const angle = angleStep * i + rng.nextFloat(-0.3, 0.3);
            const dist = cityRadius * rng.nextFloat(0.2, 0.55);
            districts.push({
                x: centerX + Math.cos(angle) * dist,
                y: centerY + Math.sin(angle) * dist,
                type: shuffled[i],
                name: districtNames[shuffled[i]],
                radius: cityRadius * rng.nextFloat(0.2, 0.35),
                angle,
            });
        }

        return districts;
    }

    _renderWalls(ctx, cfg, centerX, centerY, radius, rng, noise) {
        ctx.save();

        // Wall path (irregular circle)
        const wallPoints = [];
        const segments = 60;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const wobble = noise.noise2D(Math.cos(angle) * 2, Math.sin(angle) * 2) * radius * 0.08;
            const r = radius + wobble;
            wallPoints.push({
                x: centerX + Math.cos(angle) * r,
                y: centerY + Math.sin(angle) * r,
            });
        }

        // Wall shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 10;
        this._drawPath(ctx, wallPoints);

        // Wall body
        ctx.strokeStyle = PALETTES.city.wall;
        ctx.lineWidth = 6;
        this._drawPath(ctx, wallPoints);

        // Wall top
        ctx.strokeStyle = PALETTES.city.wallTop;
        ctx.lineWidth = 3;
        this._drawPath(ctx, wallPoints);

        // Towers along walls
        const towerInterval = Math.floor(segments / 8);
        for (let i = 0; i < segments; i += towerInterval) {
            const pt = wallPoints[i];
            drawTower(ctx, pt.x, pt.y, 14);
        }

        // Gate (south)
        const gateIdx = Math.floor(segments * 0.5);
        const gate = wallPoints[gateIdx];
        ctx.fillStyle = PALETTES.city.wall;
        ctx.fillRect(gate.x - 8, gate.y - 4, 16, 8);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(gate.x - 4, gate.y - 3, 8, 6);

        // North gate
        const northGateIdx = 0;
        const northGate = wallPoints[northGateIdx];
        ctx.fillStyle = PALETTES.city.wall;
        ctx.fillRect(northGate.x - 8, northGate.y - 4, 16, 8);
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(northGate.x - 4, northGate.y - 3, 8, 6);

        ctx.restore();
    }

    _drawPath(ctx, points) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    _generateRoads(cfg, centerX, centerY, cityRadius, rng, districts) {
        const roads = [];

        // Main radial roads from center to edges
        const roadCount = Math.max(4, districts.length);
        for (let i = 0; i < roadCount; i++) {
            const angle = (i / roadCount) * Math.PI * 2;
            roads.push({
                type: 'radial',
                points: [
                    { x: centerX, y: centerY },
                    { x: centerX + Math.cos(angle) * cityRadius * 1.1, y: centerY + Math.sin(angle) * cityRadius * 1.1 },
                ],
                width: 4,
            });
        }

        // Ring roads
        const ringRadii = [cityRadius * 0.35, cityRadius * 0.65];
        for (const r of ringRadii) {
            const ringPoints = [];
            for (let a = 0; a <= Math.PI * 2; a += 0.1) {
                ringPoints.push({
                    x: centerX + Math.cos(a) * r,
                    y: centerY + Math.sin(a) * r,
                });
            }
            roads.push({ type: 'ring', points: ringPoints, width: 3 });
        }

        return roads;
    }

    _renderRoads(ctx, cfg, roads) {
        ctx.save();

        for (const road of roads) {
            // Road shadow
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = road.width + 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(road.points[0].x, road.points[0].y);
            for (let i = 1; i < road.points.length; i++) {
                ctx.lineTo(road.points[i].x, road.points[i].y);
            }
            ctx.stroke();

            // Road surface
            ctx.strokeStyle = PALETTES.city.road;
            ctx.lineWidth = road.width;
            ctx.beginPath();
            ctx.moveTo(road.points[0].x, road.points[0].y);
            for (let i = 1; i < road.points.length; i++) {
                ctx.lineTo(road.points[i].x, road.points[i].y);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderBuildings(ctx, cfg, districts, roads, riverPoints, centerX, centerY, cityRadius, rng, noise) {
        const { buildingDensity, style } = cfg;
        const spacing = style === 'elven' ? 18 : 12;

        for (const district of districts) {
            const buildingCount = Math.floor((district.radius * 2 / spacing) ** 2 * buildingDensity);

            for (let i = 0; i < buildingCount; i++) {
                const angle = rng.nextFloat(0, Math.PI * 2);
                const dist = rng.nextFloat(0, district.radius);
                const bx = district.x + Math.cos(angle) * dist;
                const by = district.y + Math.sin(angle) * dist;

                // Skip if outside city
                if (distance(bx, by, centerX, centerY) > cityRadius * 0.95) continue;

                // Skip if on road
                let onRoad = false;
                for (const road of roads) {
                    for (const pt of road.points) {
                        if (distance(bx, by, pt.x, pt.y) < 8) {
                            onRoad = true;
                            break;
                        }
                    }
                    if (onRoad) break;
                }
                if (onRoad) continue;

                // Skip if in river
                let inRiver = false;
                for (const pt of riverPoints) {
                    if (distance(bx, by, pt.x, pt.y) < 15) {
                        inRiver = true;
                        break;
                    }
                }
                if (inRiver) continue;

                const buildingSize = rng.nextFloat(8, 14);
                const buildingStyle = style === 'mixed' ? rng.pick(['human', 'elven', 'dwarven']) : style;

                switch (buildingStyle) {
                    case 'elven':
                        drawElvenHouse(ctx, bx, by, buildingSize);
                        break;
                    case 'dwarven':
                        drawDwarvenHouse(ctx, bx, by, buildingSize);
                        break;
                    default:
                        drawHumanHouse(ctx, bx, by, buildingSize);
                }
            }
        }
    }

    _renderLandmarks(ctx, cfg, centerX, centerY, cityRadius, rng, names, districts) {
        // Find temple district
        const templeDistrict = districts.find(d => d.type === 'tempel');
        if (templeDistrict) {
            drawTemple(ctx, templeDistrict.x, templeDistrict.y, 22);
        }

        // Find market district - draw market square
        const marketDistrict = districts.find(d => d.type === 'markt');
        if (marketDistrict) {
            ctx.fillStyle = PALETTES.city.plaza;
            ctx.beginPath();
            ctx.ellipse(marketDistrict.x, marketDistrict.y, 25, 20, 0, 0, Math.PI * 2);
            ctx.fill();

            // Market stalls
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const sx = marketDistrict.x + Math.cos(angle) * 15;
                const sy = marketDistrict.y + Math.sin(angle) * 12;
                ctx.fillStyle = rng.pick(['#c4a44a', '#8b4513', '#6b4423']);
                ctx.fillRect(sx - 3, sy - 3, 6, 6);
            }
        }

        // Taverns in various districts
        const tavernCount = Math.min(3, districts.length);
        for (let i = 0; i < tavernCount; i++) {
            const d = districts[i];
            const tx = d.x + rng.nextFloat(-d.radius * 0.3, d.radius * 0.3);
            const ty = d.y + rng.nextFloat(-d.radius * 0.3, d.radius * 0.3);
            drawTavern(ctx, tx, ty, 14);
        }

        // Garden district
        const gardenDistrict = districts.find(d => d.type === 'garten');
        if (gardenDistrict) {
            ctx.fillStyle = PALETTES.city.garden;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.ellipse(gardenDistrict.x, gardenDistrict.y, 30, 25, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;

            for (let i = 0; i < 8; i++) {
                const angle = rng.nextFloat(0, Math.PI * 2);
                const dist = rng.nextFloat(0, 20);
                drawTree(ctx, gardenDistrict.x + Math.cos(angle) * dist, gardenDistrict.y + Math.sin(angle) * dist, 6);
            }
        }
    }

    _renderSurroundingTrees(ctx, cfg, centerX, centerY, cityRadius, rng) {
        const { width, height } = cfg;
        const margin = 30;

        for (let i = 0; i < 200; i++) {
            const x = rng.nextFloat(margin, width - margin);
            const y = rng.nextFloat(margin, height - margin);

            if (distance(x, y, centerX, centerY) < cityRadius * 1.15) continue;

            const type = rng.next() > 0.5 ? 'pine' : 'deciduous';
            drawTree(ctx, x, y, rng.nextFloat(6, 10), { type });
        }
    }

    _renderLabels(ctx, cfg, districts, cityName, centerX, centerY) {
        // City title
        ctx.font = 'bold 22px "Palatino Linotype", "Book Antiqua", Palatino, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 4;
        ctx.strokeText(cityName, centerX, 20);
        ctx.fillStyle = '#2a1a0a';
        ctx.fillText(cityName, centerX, 20);

        // Faction subtitle (from lore)
        if (cfg._loreFaction) {
            ctx.font = 'italic 12px "Palatino Linotype", serif';
            ctx.fillStyle = '#5a4a3a';
            ctx.fillText(`${cfg._loreFaction.name}`, centerX, 46);
        }

        // District labels
        ctx.font = 'italic 10px "Palatino Linotype", serif';
        for (const district of districts) {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 3;
            ctx.strokeText(district.name, district.x, district.y + district.radius * 0.5);
            ctx.fillStyle = '#3a2a1a';
            ctx.fillText(district.name, district.x, district.y + district.radius * 0.5);
        }

        // NPC markers (from lore)
        if (cfg._loreNPCs && cfg._loreNPCs.length > 0) {
            const rng = new SeededRandom(cfg.seed + 999);
            ctx.save();
            for (const npc of cfg._loreNPCs) {
                // Place NPCs in random district areas
                const d = districts[rng.nextInt(0, districts.length - 1)];
                const nx = d.x + rng.nextFloat(-d.radius * 0.4, d.radius * 0.4);
                const ny = d.y + rng.nextFloat(-d.radius * 0.4, d.radius * 0.4);

                // NPC marker
                ctx.fillStyle = '#aa8a2a';
                ctx.beginPath();
                ctx.arc(nx, ny, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#2a1a0a';
                ctx.lineWidth = 1;
                ctx.stroke();

                // NPC name
                ctx.font = 'bold 8px "Palatino Linotype", serif';
                ctx.textAlign = 'center';
                ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                ctx.lineWidth = 2;
                ctx.strokeText(npc.name, nx, ny - 8);
                ctx.fillStyle = '#4a2a0a';
                ctx.fillText(npc.name, nx, ny - 8);
            }
            ctx.restore();
        }
    }
}
