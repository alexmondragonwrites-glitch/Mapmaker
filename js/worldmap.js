/**
 * Calyndra Mapmaker - World/Land Map Generator
 * Generates procedural fantasy world maps with terrain, rivers, cities, and labels
 */

import { SimplexNoise } from './noise.js';
import { NameGenerator, PALETTES, SeededRandom, clamp, smoothstep, distance, lerpColor } from './utils.js';
import { drawMountain, drawVolcano, drawTree, drawRiver, drawCastle, drawCompassRose, drawMapBorder, drawScaleBar } from './assets.js';

export class WorldMapGenerator {
    static id = 'worldmap';
    static label = 'Weltkarte';
    static icon = '🗺️';

    constructor() {
        this.defaultConfig = {
            seed: Math.floor(Math.random() * 100000),
            width: 1200,
            height: 800,
            scale: 3.5,
            seaLevel: 0.38,
            mountainLevel: 0.68,
            snowLevel: 0.82,
            forestDensity: 0.6,
            riverCount: 5,
            cityCount: 8,
            showGrid: false,
            showLabels: true,
            showCompass: true,
            showBorder: true,
            showScaleBar: true,
            mapStyle: 'colored', // 'colored' | 'parchment'
            continentShape: 'natural', // 'natural' | 'island' | 'pangaea'
        };
    }

    getControls() {
        return [
            { type: 'number', key: 'seed', label: 'Seed', min: 0, max: 999999 },
            { type: 'select', key: 'width', label: 'Breite', options: [
                { value: 800, label: '800px' }, { value: 1200, label: '1200px' },
                { value: 1920, label: '1920px (HD)' }, { value: 2560, label: '2560px (QHD)' },
                { value: 3840, label: '3840px (4K)' }
            ]},
            { type: 'select', key: 'height', label: 'Höhe', options: [
                { value: 600, label: '600px' }, { value: 800, label: '800px' },
                { value: 1080, label: '1080px (HD)' }, { value: 1440, label: '1440px (QHD)' },
                { value: 2160, label: '2160px (4K)' }
            ]},
            { type: 'range', key: 'scale', label: 'Maßstab', min: 1, max: 8, step: 0.5 },
            { type: 'range', key: 'seaLevel', label: 'Meeresspiegel', min: 0.1, max: 0.7, step: 0.02 },
            { type: 'range', key: 'mountainLevel', label: 'Berghöhe', min: 0.5, max: 0.9, step: 0.02 },
            { type: 'range', key: 'forestDensity', label: 'Walddichte', min: 0, max: 1, step: 0.1 },
            { type: 'range', key: 'riverCount', label: 'Flüsse', min: 0, max: 15, step: 1 },
            { type: 'range', key: 'cityCount', label: 'Städte', min: 0, max: 20, step: 1 },
            { type: 'select', key: 'mapStyle', label: 'Stil', options: [
                { value: 'colored', label: 'Farbig' },
                { value: 'parchment', label: 'Pergament' },
            ]},
            { type: 'select', key: 'continentShape', label: 'Kontinentform', options: [
                { value: 'natural', label: 'Natürlich' },
                { value: 'island', label: 'Insel' },
                { value: 'pangaea', label: 'Pangäa' },
            ]},
            { type: 'checkbox', key: 'showLabels', label: 'Beschriftungen' },
            { type: 'checkbox', key: 'showCompass', label: 'Kompassrose' },
            { type: 'checkbox', key: 'showBorder', label: 'Kartenrand' },
            { type: 'checkbox', key: 'showScaleBar', label: 'Maßstabsleiste' },
        ];
    }

    generate(canvas, config = {}) {
        const cfg = { ...this.defaultConfig, ...config };
        canvas.width = cfg.width;
        canvas.height = cfg.height;
        const ctx = canvas.getContext('2d');

        const noise = new SimplexNoise(cfg.seed);
        const noise2 = new SimplexNoise(cfg.seed + 1000);
        const rng = new SeededRandom(cfg.seed);
        const names = new NameGenerator(cfg.seed);

        // Generate height map
        const heightMap = this._generateHeightMap(cfg, noise, noise2);

        // Generate moisture map
        const moistureMap = this._generateMoistureMap(cfg, noise2);

        // Render terrain
        if (cfg.mapStyle === 'parchment') {
            this._renderParchmentStyle(ctx, cfg, heightMap, moistureMap);
        } else {
            this._renderColoredStyle(ctx, cfg, heightMap, moistureMap);
        }

        // Generate and render rivers
        const rivers = this._generateRivers(cfg, heightMap, rng);
        this._renderRivers(ctx, cfg, rivers, cfg.mapStyle);

        // Generate and render forests
        this._renderForests(ctx, cfg, heightMap, moistureMap, noise, rng);

        // Generate and render mountains
        this._renderMountainIcons(ctx, cfg, heightMap, rng);

        // Generate cities
        const cities = this._generateCities(cfg, heightMap, rivers, rng, names);
        this._renderCities(ctx, cfg, cities);

        // Render roads between cities
        this._renderRoads(ctx, cfg, cities, heightMap);

        // Labels
        if (cfg.showLabels) {
            this._renderLabels(ctx, cfg, cities, rivers, names, rng);
        }

        // Decorations
        if (cfg.showBorder) drawMapBorder(ctx, cfg.width, cfg.height, 'ornate');
        if (cfg.showCompass) drawCompassRose(ctx, cfg.width - 80, cfg.height - 80, 60);
        if (cfg.showScaleBar) drawScaleBar(ctx, cfg.width * 0.05, cfg.height - 40, cfg.width);

        // Title
        this._renderTitle(ctx, cfg, names);
    }

    _generateHeightMap(cfg, noise, noise2) {
        const { width, height, scale, continentShape } = cfg;
        const map = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = x / width * scale;
                const ny = y / height * scale;

                // Layered noise
                let h = noise.fbm(nx, ny, 6, 2.0, 0.5) * 0.6;
                h += noise.ridgeNoise(nx * 1.5, ny * 1.5, 4) * 0.3;
                h += noise2.warpedNoise(nx, ny, 0.8, 0.4) * 0.1;

                // Normalize to 0-1
                h = (h + 1) * 0.5;

                // Apply continent shape
                if (continentShape === 'island') {
                    const dx = (x / width - 0.5) * 2;
                    const dy = (y / height - 0.5) * 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    h -= smoothstep(0.3, 0.9, dist) * 0.6;
                } else if (continentShape === 'pangaea') {
                    const dx = (x / width - 0.5) * 2;
                    const dy = (y / height - 0.5) * 2;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    h -= smoothstep(0.5, 1.0, dist) * 0.4;
                    h += 0.1;
                } else {
                    // Natural - soften edges
                    const edgeFade = 0.05;
                    const ex = smoothstep(0, edgeFade, x / width) * smoothstep(0, edgeFade, 1 - x / width);
                    const ey = smoothstep(0, edgeFade, y / height) * smoothstep(0, edgeFade, 1 - y / height);
                    h *= ex * ey * 0.3 + 0.7;
                }

                map[y * width + x] = clamp(h, 0, 1);
            }
        }

        return map;
    }

    _generateMoistureMap(cfg, noise) {
        const { width, height, scale } = cfg;
        const map = new Float32Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const nx = x / width * scale * 1.5 + 100;
                const ny = y / height * scale * 1.5 + 100;
                map[y * width + x] = (noise.fbm(nx, ny, 4) + 1) * 0.5;
            }
        }

        return map;
    }

    _renderColoredStyle(ctx, cfg, heightMap, moistureMap) {
        const { width, height, seaLevel, mountainLevel, snowLevel } = cfg;
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;
        const pal = PALETTES.terrain;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const h = heightMap[idx];
                const m = moistureMap[idx];
                const pi = idx * 4;

                let r, g, b;

                if (h < seaLevel * 0.6) {
                    // Deep water
                    const c = this._hexToRgbFast(pal.deepWater);
                    r = c[0]; g = c[1]; b = c[2];
                } else if (h < seaLevel * 0.85) {
                    // Water
                    const t = (h - seaLevel * 0.6) / (seaLevel * 0.25);
                    const c1 = this._hexToRgbFast(pal.deepWater);
                    const c2 = this._hexToRgbFast(pal.water);
                    r = c1[0] + (c2[0] - c1[0]) * t;
                    g = c1[1] + (c2[1] - c1[1]) * t;
                    b = c1[2] + (c2[2] - c1[2]) * t;
                } else if (h < seaLevel) {
                    // Shallow water
                    const t = (h - seaLevel * 0.85) / (seaLevel * 0.15);
                    const c1 = this._hexToRgbFast(pal.water);
                    const c2 = this._hexToRgbFast(pal.shallowWater);
                    r = c1[0] + (c2[0] - c1[0]) * t;
                    g = c1[1] + (c2[1] - c1[1]) * t;
                    b = c1[2] + (c2[2] - c1[2]) * t;
                } else if (h < seaLevel + 0.03) {
                    // Beach/sand
                    const c = this._hexToRgbFast(pal.sand);
                    r = c[0]; g = c[1]; b = c[2];
                } else if (h < mountainLevel) {
                    // Land - varies by moisture
                    const landT = (h - seaLevel) / (mountainLevel - seaLevel);
                    if (m > 0.65) {
                        const c = this._hexToRgbFast(landT > 0.5 ? pal.denseForest : pal.forest);
                        r = c[0]; g = c[1]; b = c[2];
                    } else if (m > 0.35) {
                        const c1 = this._hexToRgbFast(pal.grass);
                        const c2 = this._hexToRgbFast(pal.darkGrass);
                        const t = landT;
                        r = c1[0] + (c2[0] - c1[0]) * t;
                        g = c1[1] + (c2[1] - c1[1]) * t;
                        b = c1[2] + (c2[2] - c1[2]) * t;
                    } else if (m > 0.2) {
                        const c1 = this._hexToRgbFast(pal.grass);
                        const c2 = this._hexToRgbFast(pal.sand);
                        r = c1[0] * 0.7 + c2[0] * 0.3;
                        g = c1[1] * 0.7 + c2[1] * 0.3;
                        b = c1[2] * 0.7 + c2[2] * 0.3;
                    } else {
                        const c = this._hexToRgbFast(pal.desert);
                        r = c[0]; g = c[1]; b = c[2];
                    }

                    // Altitude shading
                    const shade = 1 - landT * 0.2;
                    r *= shade; g *= shade; b *= shade;
                } else if (h < snowLevel) {
                    // Mountains
                    const t = (h - mountainLevel) / (snowLevel - mountainLevel);
                    const c1 = this._hexToRgbFast(pal.mountain);
                    const c2 = this._hexToRgbFast(pal.highMountain);
                    r = c1[0] + (c2[0] - c1[0]) * t;
                    g = c1[1] + (c2[1] - c1[1]) * t;
                    b = c1[2] + (c2[2] - c1[2]) * t;
                } else {
                    // Snow
                    const c = this._hexToRgbFast(pal.snow);
                    r = c[0]; g = c[1]; b = c[2];
                }

                data[pi] = clamp(r, 0, 255);
                data[pi + 1] = clamp(g, 0, 255);
                data[pi + 2] = clamp(b, 0, 255);
                data[pi + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }

    _renderParchmentStyle(ctx, cfg, heightMap, moistureMap) {
        const { width, height, seaLevel, mountainLevel } = cfg;
        const pal = PALETTES.parchment;

        // Fill with parchment background
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, width, height);

        // Draw coastlines and terrain with parchment style
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const h = heightMap[idx];
                const pi = idx * 4;

                if (h < seaLevel) {
                    // Water - blue tint on parchment
                    const c = this._hexToRgbFast(pal.water);
                    const bgC = this._hexToRgbFast(pal.bg);
                    const t = 0.3 + (seaLevel - h) * 0.5;
                    data[pi] = bgC[0] * (1 - t) + c[0] * t;
                    data[pi + 1] = bgC[1] * (1 - t) + c[1] * t;
                    data[pi + 2] = bgC[2] * (1 - t) + c[2] * t;
                } else {
                    // Land - parchment base with subtle height shading
                    const c = this._hexToRgbFast(pal.bg);
                    const shade = 1 - (h - seaLevel) * 0.15;
                    data[pi] = c[0] * shade;
                    data[pi + 1] = c[1] * shade;
                    data[pi + 2] = c[2] * shade;
                }
                data[pi + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        // Draw coastline contour
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.5;
        this._drawContourLine(ctx, cfg, heightMap, seaLevel);
    }

    _drawContourLine(ctx, cfg, heightMap, level) {
        const { width, height } = cfg;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const h = heightMap[y * width + x];
                const hR = heightMap[y * width + x + 1];
                const hD = heightMap[(y + 1) * width + x];

                if ((h >= level && hR < level) || (h < level && hR >= level) ||
                    (h >= level && hD < level) || (h < level && hD >= level)) {
                    ctx.fillStyle = 'rgba(42, 26, 10, 0.6)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    }

    _generateRivers(cfg, heightMap, rng) {
        const { width, height, seaLevel, mountainLevel, riverCount } = cfg;
        const rivers = [];

        for (let r = 0; r < riverCount; r++) {
            let attempts = 0;
            let startX, startY;

            // Find a mountain start point
            do {
                startX = rng.nextInt(width * 0.1, width * 0.9);
                startY = rng.nextInt(height * 0.1, height * 0.9);
                attempts++;
            } while (heightMap[startY * width + startX] < mountainLevel * 0.85 && attempts < 200);

            if (attempts >= 200) continue;

            const points = [{ x: startX, y: startY }];
            let cx = startX, cy = startY;

            // Flow downhill
            for (let step = 0; step < 500; step++) {
                const currentH = heightMap[Math.floor(cy) * width + Math.floor(cx)];
                if (currentH < seaLevel) break;

                let bestX = cx, bestY = cy, bestH = currentH;

                // Check neighbors with some randomness
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dx = -3; dx <= 3; dx++) {
                        const nx = Math.floor(cx + dx);
                        const ny = Math.floor(cy + dy);
                        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                        const nh = heightMap[ny * width + nx] + rng.nextFloat(0, 0.005);
                        if (nh < bestH) {
                            bestH = nh;
                            bestX = nx;
                            bestY = ny;
                        }
                    }
                }

                if (bestX === cx && bestY === cy) break;
                cx = bestX;
                cy = bestY;

                // Don't add every single point - subsample
                if (step % 3 === 0) {
                    points.push({ x: cx, y: cy });
                }
            }

            if (points.length > 5) {
                rivers.push(points);
            }
        }

        return rivers;
    }

    _renderRivers(ctx, cfg, rivers, style) {
        const color = style === 'parchment' ? PALETTES.parchment.water : '#4a90c4';

        for (const river of rivers) {
            // River gets wider as it flows
            for (let i = 0; i < river.length - 1; i++) {
                const t = i / river.length;
                const width = 1 + t * 3;
                drawRiver(ctx, [river[i], river[i + 1]], width, color);
            }
        }
    }

    _renderForests(ctx, cfg, heightMap, moistureMap, noise, rng) {
        const { width, height, seaLevel, mountainLevel, forestDensity } = cfg;
        const treeSpacing = 12;

        for (let y = treeSpacing; y < height - treeSpacing; y += treeSpacing) {
            for (let x = treeSpacing; x < width - treeSpacing; x += treeSpacing) {
                const idx = y * width + x;
                const h = heightMap[idx];
                const m = moistureMap[idx];

                if (h <= seaLevel || h >= mountainLevel * 0.9) continue;
                if (m < 0.45) continue;

                const forestChance = (m - 0.45) * 2 * forestDensity;
                if (rng.next() > forestChance) continue;

                const offsetX = rng.nextFloat(-4, 4);
                const offsetY = rng.nextFloat(-4, 4);
                const size = rng.nextFloat(6, 10);
                const type = rng.next() > 0.4 ? 'deciduous' : 'pine';

                drawTree(ctx, x + offsetX, y + offsetY, size, { type });
            }
        }
    }

    _renderMountainIcons(ctx, cfg, heightMap, rng) {
        const { width, height, mountainLevel } = cfg;
        const spacing = 20;

        for (let y = spacing; y < height - spacing; y += spacing) {
            for (let x = spacing; x < width - spacing; x += spacing) {
                const h = heightMap[y * width + x];
                if (h < mountainLevel) continue;

                const offsetX = rng.nextFloat(-5, 5);
                const offsetY = rng.nextFloat(-5, 5);
                const size = 12 + (h - mountainLevel) * 40;

                // Small chance of volcano
                if (h > mountainLevel + 0.15 && rng.next() > 0.92) {
                    drawVolcano(ctx, x + offsetX, y + offsetY, size * 1.3);
                } else {
                    drawMountain(ctx, x + offsetX, y + offsetY, size, { snow: h > 0.78 });
                }
            }
        }
    }

    _generateCities(cfg, heightMap, rivers, rng, names) {
        const { width, height, seaLevel, mountainLevel, cityCount } = cfg;
        const cities = [];

        for (let i = 0; i < cityCount; i++) {
            let bestX = 0, bestY = 0, bestScore = -Infinity;

            for (let attempt = 0; attempt < 100; attempt++) {
                const x = rng.nextInt(width * 0.08, width * 0.92);
                const y = rng.nextInt(height * 0.08, height * 0.92);
                const h = heightMap[y * width + x];

                if (h < seaLevel + 0.02 || h > mountainLevel * 0.85) continue;

                // Score: prefer coastal, near rivers, away from other cities
                let score = 0;

                // Coastal bonus
                for (let dy = -15; dy <= 15; dy += 5) {
                    for (let dx = -15; dx <= 15; dx += 5) {
                        const nx = clamp(x + dx, 0, width - 1);
                        const ny = clamp(y + dy, 0, height - 1);
                        if (heightMap[ny * width + nx] < seaLevel) score += 2;
                    }
                }

                // River proximity bonus
                for (const river of rivers) {
                    for (const pt of river) {
                        const d = distance(x, y, pt.x, pt.y);
                        if (d < 30) score += 5;
                    }
                }

                // Distance from other cities
                let minCityDist = Infinity;
                for (const city of cities) {
                    const d = distance(x, y, city.x, city.y);
                    minCityDist = Math.min(minCityDist, d);
                }
                if (minCityDist < 80) score -= 100;
                else score += Math.min(minCityDist * 0.1, 20);

                if (score > bestScore) {
                    bestScore = score;
                    bestX = x;
                    bestY = y;
                }
            }

            if (bestScore > -50) {
                const isCapital = i === 0;
                cities.push({
                    x: bestX,
                    y: bestY,
                    name: names.generate('city'),
                    size: isCapital ? 'large' : (rng.next() > 0.6 ? 'medium' : 'small'),
                    isCapital,
                });
            }
        }

        return cities;
    }

    _renderCities(ctx, cfg, cities) {
        for (const city of cities) {
            if (city.isCapital || city.size === 'large') {
                drawCastle(ctx, city.x, city.y, 18);
            } else {
                const s = city.size === 'medium' ? 6 : 4;
                ctx.fillStyle = '#2a1a0a';
                ctx.beginPath();
                ctx.arc(city.x, city.y, s, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#f4e4c1';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    _renderRoads(ctx, cfg, cities, heightMap) {
        if (cities.length < 2) return;

        ctx.strokeStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.road : '#8a7a5a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        // Connect nearby cities
        for (let i = 0; i < cities.length; i++) {
            let closest = null;
            let closestDist = Infinity;

            for (let j = 0; j < cities.length; j++) {
                if (i === j) continue;
                const d = distance(cities[i].x, cities[i].y, cities[j].x, cities[j].y);
                if (d < closestDist && d < cfg.width * 0.35) {
                    closestDist = d;
                    closest = cities[j];
                }
            }

            if (closest) {
                ctx.beginPath();
                ctx.moveTo(cities[i].x, cities[i].y);
                // Slight curve
                const midX = (cities[i].x + closest.x) / 2 + (Math.random() - 0.5) * 20;
                const midY = (cities[i].y + closest.y) / 2 + (Math.random() - 0.5) * 20;
                ctx.quadraticCurveTo(midX, midY, closest.x, closest.y);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    }

    _renderLabels(ctx, cfg, cities, rivers, names, rng) {
        const isParchment = cfg.mapStyle === 'parchment';
        const textColor = isParchment ? PALETTES.parchment.ink : '#1a1a1a';
        const shadowColor = isParchment ? 'transparent' : 'rgba(255,255,255,0.7)';

        // City labels
        for (const city of cities) {
            const fontSize = city.isCapital ? 14 : (city.size === 'medium' ? 11 : 9);
            ctx.font = `${city.isCapital ? 'bold ' : ''}${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';

            if (shadowColor !== 'transparent') {
                ctx.strokeStyle = shadowColor;
                ctx.lineWidth = 3;
                ctx.strokeText(city.name, city.x, city.y + (city.isCapital ? 14 : 8));
            }

            ctx.fillStyle = textColor;
            ctx.fillText(city.name, city.x, city.y + (city.isCapital ? 14 : 8));
        }

        // River labels
        for (const river of rivers) {
            if (river.length < 10) continue;
            const midIdx = Math.floor(river.length * 0.4);
            const pt = river[midIdx];
            const riverName = names.generate('river');

            ctx.save();
            ctx.font = 'italic 9px "Palatino Linotype", serif';
            ctx.fillStyle = isParchment ? PALETTES.parchment.water : '#2a5a8a';
            ctx.textAlign = 'center';

            // Calculate angle
            const nextPt = river[Math.min(midIdx + 3, river.length - 1)];
            const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
            ctx.translate(pt.x, pt.y);
            ctx.rotate(angle);
            ctx.fillText(riverName, 0, -5);
            ctx.restore();
        }
    }

    _renderTitle(ctx, cfg, names) {
        const title = 'Calyndra';
        const fontSize = Math.max(20, cfg.width * 0.025);

        ctx.font = `bold ${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const x = cfg.width / 2;
        const y = cfg.height * 0.02 + 15;

        // Shadow
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 4;
        ctx.strokeText(title, x, y);

        // Text
        ctx.fillStyle = cfg.mapStyle === 'parchment' ? PALETTES.parchment.ink : '#1a1a0a';
        ctx.fillText(title, x, y);

        // Subtitle
        ctx.font = `italic ${fontSize * 0.5}px "Palatino Linotype", serif`;
        ctx.fillText('~ Eine Fantasywelt ~', x, y + fontSize + 4);
    }

    _hexToRgbFast(hex) {
        return [
            parseInt(hex.slice(1, 3), 16),
            parseInt(hex.slice(3, 5), 16),
            parseInt(hex.slice(5, 7), 16),
        ];
    }
}
