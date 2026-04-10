/**
 * Calyndra Mapmaker - Advanced Terrain Generation Engine
 * Produces natural-looking terrain with geographic logic
 *
 * Key improvements over basic noise:
 * - Multi-pass domain warping for organic continent shapes
 * - Tectonic plate ridges for realistic mountain ranges
 * - Hydraulic erosion simulation for natural valleys/coastlines
 * - Temperature gradient (latitude + altitude) for biome distribution
 * - River tributary merging for proper drainage systems
 * - Per-pixel color micro-variation within biomes
 * - Poisson disk sampling for natural feature placement
 */

import { SimplexNoise } from './noise.js';
import { clamp, smoothstep } from './utils.js';

// ── Advanced Height Map Generation ──────────────────────────────────

/**
 * Generate a height map with multiple geological passes
 */
export function generateAdvancedHeightMap(width, height, config) {
    const {
        seed = 42,
        scale = 3.5,
        continentShape = 'natural',
        seaLevel = 0.38,
    } = config;

    const noise = new SimplexNoise(seed);
    const noise2 = new SimplexNoise(seed + 1337);
    const noise3 = new SimplexNoise(seed + 2674);
    const noise4 = new SimplexNoise(seed + 4011);

    const map = new Float32Array(width * height);

    // ── Pass 1: Continental shelf (large-scale land/water distribution) ──
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width * scale;
            const ny = y / height * scale;

            // Deep domain warping for irregular continent shapes
            // This creates peninsulas, bays, and interesting coastlines
            const warp1x = noise2.fbm(nx * 0.7 + 3.1, ny * 0.7 + 7.2, 3, 2.0, 0.5);
            const warp1y = noise2.fbm(nx * 0.7 + 8.5, ny * 0.7 + 2.9, 3, 2.0, 0.5);
            const warpedX = nx + warp1x * 0.8;
            const warpedY = ny + warp1y * 0.8;

            // Second warp pass for even more complexity
            const warp2x = noise3.fbm(warpedX * 0.5 + 1.7, warpedY * 0.5 + 4.3, 2, 2.0, 0.5);
            const warp2y = noise3.fbm(warpedX * 0.5 + 6.1, warpedY * 0.5 + 9.2, 2, 2.0, 0.5);
            const wx = warpedX + warp2x * 0.3;
            const wy = warpedY + warp2y * 0.3;

            // Base continental shelf
            let h = noise.fbm(wx, wy, 5, 2.0, 0.5) * 0.55;

            // Add medium-scale terrain variation
            h += noise2.fbm(nx * 1.8 + 50, ny * 1.8 + 50, 4, 2.0, 0.45) * 0.25;

            // Fine detail
            h += noise4.fbm(nx * 4, ny * 4, 3, 2.5, 0.35) * 0.08;

            map[y * width + x] = (h + 1) * 0.5;
        }
    }

    // ── Pass 2: Tectonic plate ridges (mountain ranges) ──
    _addTectonicRidges(map, width, height, seed, scale);

    // ── Pass 3: Continent shape masking ──
    _applyContinent(map, width, height, continentShape, noise3);

    // ── Pass 4: Coastal erosion (create interesting coastlines) ──
    _erodeCoastline(map, width, height, seaLevel, seed);

    // ── Pass 5: Hydraulic erosion (carve valleys, create drainage) ──
    _simulateErosion(map, width, height, seaLevel, 3);

    // Normalize to [0, 1]
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < map.length; i++) {
        if (map[i] < min) min = map[i];
        if (map[i] > max) max = map[i];
    }
    const range = max - min || 1;
    for (let i = 0; i < map.length; i++) {
        map[i] = (map[i] - min) / range;
    }

    return map;
}

/**
 * Add tectonic plate ridges - creates connected mountain ranges
 * instead of random mountain blobs
 */
function _addTectonicRidges(map, width, height, seed, scale) {
    const noise = new SimplexNoise(seed + 5000);
    const noise2 = new SimplexNoise(seed + 6000);

    // Generate 2-4 tectonic plate boundaries (curved lines across the map)
    const ridgeCount = 2 + Math.floor((noise.noise2D(0, 0) + 1) * 1.5);

    for (let r = 0; r < ridgeCount; r++) {
        // Each ridge is a warped line
        const baseAngle = noise.noise2D(r * 7.1, 0.5) * Math.PI;
        const startX = (noise.noise2D(r * 3.3, 1.2) * 0.5 + 0.5);
        const startY = (noise.noise2D(1.2, r * 3.3) * 0.5 + 0.5);
        const ridgeStrength = 0.12 + Math.abs(noise.noise2D(r * 5.5, 3.3)) * 0.1;
        const ridgeWidth = 0.03 + Math.abs(noise2.noise2D(r * 4.1, 2.2)) * 0.04;

        // Trace the ridge as a warped path
        for (let t = -0.3; t <= 1.3; t += 0.002) {
            // Base position along the ridge
            let rx = startX + Math.cos(baseAngle) * (t - 0.5) * 1.2;
            let ry = startY + Math.sin(baseAngle) * (t - 0.5) * 1.2;

            // Warp the ridge path to make it curvy
            rx += noise.fbm(t * 3 + r * 10, 0.5, 3, 2.0, 0.5) * 0.15;
            ry += noise.fbm(0.5, t * 3 + r * 10, 3, 2.0, 0.5) * 0.15;

            // Apply height to pixels near the ridge
            const px = Math.floor(rx * width);
            const py = Math.floor(ry * height);
            const radiusPx = Math.floor(ridgeWidth * Math.min(width, height));

            for (let dy = -radiusPx; dy <= radiusPx; dy++) {
                for (let dx = -radiusPx; dx <= radiusPx; dx++) {
                    const nx = px + dx;
                    const ny = py + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    const dist = Math.sqrt(dx * dx + dy * dy) / radiusPx;
                    if (dist > 1) continue;

                    // Ridge profile: sharp peak with smooth falloff
                    const profile = Math.pow(1 - dist, 2);

                    // Add some noise to the ridge height
                    const noiseVal = noise2.noise2D(nx / 30, ny / 30) * 0.3 + 0.7;

                    map[ny * width + nx] += ridgeStrength * profile * noiseVal;
                }
            }
        }
    }
}

/**
 * Apply continent shape with more interesting masks
 */
function _applyContinent(map, width, height, shape, noise) {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width;
            const ny = y / height;
            const idx = y * width + x;

            if (shape === 'island') {
                // Multi-center island with irregular shape
                const dx = (nx - 0.5) * 2;
                const dy = (ny - 0.5) * 2;
                let dist = Math.sqrt(dx * dx + dy * dy);

                // Warp the distance field for irregular coastline
                dist += noise.fbm(nx * 4, ny * 4, 3) * 0.15;

                const fade = smoothstep(0.25, 0.85, dist);
                map[idx] -= fade * 0.6;

                // Add some small outlying islands
                const islandNoise = noise.ridgeNoise(nx * 6, ny * 6, 3, 2.0, 0.5);
                if (dist > 0.5 && dist < 0.8 && islandNoise > 0.7) {
                    map[idx] += 0.15;
                }

            } else if (shape === 'pangaea') {
                const dx = (nx - 0.5) * 2;
                const dy = (ny - 0.5) * 2;
                let dist = Math.sqrt(dx * dx + dy * dy);
                dist += noise.fbm(nx * 3 + 20, ny * 3 + 20, 3) * 0.2;
                map[idx] -= smoothstep(0.5, 1.0, dist) * 0.4;
                map[idx] += 0.12;

            } else {
                // Natural - create interesting edge with potential peninsulas
                const edgeFade = 0.08;
                const ex = smoothstep(0, edgeFade, nx) * smoothstep(0, edgeFade, 1 - nx);
                const ey = smoothstep(0, edgeFade, ny) * smoothstep(0, edgeFade, 1 - ny);

                // Warp the edge mask for irregular coastlines at edges
                const edgeWarp = noise.fbm(nx * 5, ny * 5, 3) * 0.05;
                const edgeMask = clamp(ex * ey + edgeWarp, 0, 1);

                map[idx] *= edgeMask * 0.35 + 0.65;
            }
        }
    }
}

/**
 * Coastal erosion - creates small islands, fjords, bays, and archipelagos
 */
function _erodeCoastline(map, width, height, seaLevel, seed) {
    const noise = new SimplexNoise(seed + 7777);
    const threshold = 0.035; // How close to sea level we affect

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = map[idx];
            const diff = h - seaLevel;

            // Only modify terrain near sea level
            if (Math.abs(diff) > threshold) continue;

            // High-frequency noise to break up coastline
            const n = noise.fbm(x / 15, y / 15, 4, 2.5, 0.5);

            // Push some coastal land underwater and some shallow water above
            map[idx] += n * threshold * 0.8;
        }
    }
}

/**
 * Simple hydraulic erosion - carves valleys and creates natural drainage
 */
function _simulateErosion(map, width, height, seaLevel, iterations) {
    for (let iter = 0; iter < iterations; iter++) {
        const eroded = new Float32Array(map);

        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                const idx = y * width + x;
                const h = map[idx];

                // Skip water
                if (h < seaLevel) continue;

                // Find steepest downhill neighbor
                let minH = h;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nh = map[(y + dy) * width + (x + dx)];
                        if (nh < minH) minH = nh;
                    }
                }

                // Erode based on slope
                const slope = h - minH;
                if (slope > 0.005) {
                    eroded[idx] -= slope * 0.08;
                }

                // Slight smoothing with neighbors (thermal erosion)
                let avg = 0;
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        avg += map[(y + dy) * width + (x + dx)];
                        count++;
                    }
                }
                avg /= count;
                eroded[idx] = eroded[idx] * 0.85 + avg * 0.15;
            }
        }

        map.set(eroded);
    }
}

// ── Temperature Map ─────────────────────────────────────────────────

/**
 * Generate temperature map based on latitude and altitude
 * Creates climate zones for proper biome distribution
 */
export function generateTemperatureMap(width, height, heightMap, seaLevel, seed = 42) {
    const noise = new SimplexNoise(seed + 3000);
    const temp = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const h = heightMap[idx];

            // Latitude effect: warmer near center (equator), colder at top/bottom
            const lat = Math.abs(y / height - 0.5) * 2; // 0 = equator, 1 = poles
            let t = 1.0 - lat * 0.9;

            // Altitude effect: higher = colder
            if (h > seaLevel) {
                const altitude = (h - seaLevel) / (1 - seaLevel);
                t -= altitude * 0.5;
            }

            // Noise variation for local climate
            t += noise.fbm(x / 200 + 100, y / 200 + 100, 3) * 0.12;

            // Ocean moderates temperature
            if (h < seaLevel) {
                t = t * 0.7 + 0.4 * 0.3; // Pull toward moderate
            }

            temp[idx] = clamp(t, 0, 1);
        }
    }

    return temp;
}

// ── Advanced Moisture Map ───────────────────────────────────────────

/**
 * Generate moisture map that accounts for coastal proximity and wind patterns
 */
export function generateAdvancedMoistureMap(width, height, heightMap, seaLevel, seed = 42) {
    const noise = new SimplexNoise(seed + 4000);
    const moisture = new Float32Array(width * height);

    // First: calculate distance from water for each land pixel
    const waterDist = new Float32Array(width * height);
    waterDist.fill(999);

    // Simple BFS-like spread from water
    const queue = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (heightMap[y * width + x] < seaLevel) {
                waterDist[y * width + x] = 0;
                queue.push(y * width + x);
            }
        }
    }

    // Spread distance (limited iterations for performance)
    const maxSpread = Math.min(80, Math.floor(Math.min(width, height) * 0.08));
    for (let dist = 1; dist <= maxSpread; dist++) {
        const nextQueue = [];
        for (const idx of queue) {
            const x = idx % width;
            const y = Math.floor(idx / width);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const nIdx = ny * width + nx;
                    if (waterDist[nIdx] > dist) {
                        waterDist[nIdx] = dist;
                        if (dist < maxSpread) nextQueue.push(nIdx);
                    }
                }
            }
        }
        queue.length = 0;
        queue.push(...nextQueue);
    }

    // Generate moisture from water proximity + noise
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;

            // Coastal moisture
            const coastalMoisture = 1.0 - clamp(waterDist[idx] / maxSpread, 0, 1);

            // Noise-based variation
            const noiseMoisture = (noise.fbm(x / 150 + 200, y / 150 + 200, 4) + 1) * 0.5;

            // Rain shadow effect: mountains block moisture
            const h = heightMap[idx];
            const altFactor = h > seaLevel ? clamp(1 - (h - seaLevel) * 2, 0, 1) : 1;

            moisture[idx] = clamp(
                coastalMoisture * 0.5 + noiseMoisture * 0.35 + 0.15 * altFactor,
                0, 1
            );
        }
    }

    return moisture;
}

// ── River System with Tributaries ────────────────────────────────────

/**
 * Generate river systems where rivers merge into tributaries
 */
export function generateRiverSystems(width, height, heightMap, seaLevel, mountainLevel, rng, count = 5) {
    const rivers = [];
    const riverMap = new Int16Array(width * height); // Track which pixels have rivers
    riverMap.fill(-1);

    for (let r = 0; r < count; r++) {
        let attempts = 0;
        let startX, startY;

        // Find a mountain/hill start point
        do {
            startX = rng.nextInt(Math.floor(width * 0.08), Math.floor(width * 0.92));
            startY = rng.nextInt(Math.floor(height * 0.08), Math.floor(height * 0.92));
            attempts++;
        } while (heightMap[startY * width + startX] < mountainLevel * 0.8 && attempts < 300);

        if (attempts >= 300) continue;

        const points = [{ x: startX, y: startY, width: 0.8 }];
        let cx = startX, cy = startY;
        let mergedInto = -1;

        for (let step = 0; step < 800; step++) {
            const cIdx = Math.floor(cy) * width + Math.floor(cx);
            const currentH = heightMap[cIdx];
            if (currentH < seaLevel) break;

            // Check if we've hit another river (tributary merge)
            if (riverMap[cIdx] >= 0 && riverMap[cIdx] !== r) {
                mergedInto = riverMap[cIdx];
                break;
            }

            // Mark river on map
            riverMap[cIdx] = r;

            // Find downhill direction with momentum
            let bestX = cx, bestY = cy, bestH = currentH;
            const searchRadius = 3;

            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                    const nx = Math.floor(cx + dx);
                    const ny = Math.floor(cy + dy);
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

                    let nh = heightMap[ny * width + nx];

                    // Slight random perturbation for natural-looking meanders
                    nh += rng.nextFloat(0, 0.003);

                    // Prefer to not go straight back
                    if (points.length > 2) {
                        const prev = points[points.length - 2];
                        const backDx = prev.x - cx;
                        const backDy = prev.y - cy;
                        const fwdDx = dx;
                        const fwdDy = dy;
                        const dot = backDx * fwdDx + backDy * fwdDy;
                        if (dot > 0) nh += 0.002; // Penalize going backward
                    }

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

            // River gets wider as it flows (accumulates water)
            const flow = Math.min(step / 100, 3);

            // Subsample points for smooth curves
            if (step % 2 === 0) {
                points.push({ x: cx, y: cy, width: 0.8 + flow });
            }
        }

        if (points.length > 8) {
            rivers.push({
                points,
                mergedInto,
                index: r,
            });
        }
    }

    return rivers;
}

// ── Biome Classification with Smooth Blending ───────────────────────

/**
 * Classify biome for each pixel using temperature and moisture
 * Returns biome ID and blend factor for smooth transitions
 */
export function classifyBiome(height, moisture, temperature, seaLevel, mountainLevel) {
    if (height < seaLevel * 0.55) return { biome: 'deepWater', t: 0 };
    if (height < seaLevel * 0.85) return { biome: 'water', t: (height - seaLevel * 0.55) / (seaLevel * 0.3) };
    if (height < seaLevel) return { biome: 'shallowWater', t: (height - seaLevel * 0.85) / (seaLevel * 0.15) };

    if (height < seaLevel + 0.025) return { biome: 'beach', t: (height - seaLevel) / 0.025 };

    if (height > mountainLevel + 0.15) return { biome: 'snow', t: 0 };
    if (height > mountainLevel) {
        const t = (height - mountainLevel) / 0.15;
        return { biome: 'mountain', t };
    }

    // Land biomes based on temperature + moisture
    if (temperature < 0.2) {
        return moisture > 0.4
            ? { biome: 'taiga', t: temperature / 0.2 }
            : { biome: 'tundra', t: temperature / 0.2 };
    }

    if (temperature > 0.75) {
        if (moisture < 0.2) return { biome: 'desert', t: 0 };
        if (moisture < 0.45) return { biome: 'savanna', t: (moisture - 0.2) / 0.25 };
        return { biome: 'tropicalForest', t: 0 };
    }

    // Temperate zone
    if (moisture < 0.25) return { biome: 'dryScrub', t: moisture / 0.25 };
    if (moisture < 0.45) return { biome: 'grassland', t: (moisture - 0.25) / 0.2 };
    if (moisture < 0.65) return { biome: 'temperateForest', t: (moisture - 0.45) / 0.2 };
    return { biome: 'denseForest', t: 0 };
}

// ── Biome Color Palette (natural, blended) ──────────────────────────

export const BIOME_COLORS = {
    deepWater:       { r: 22, g: 50, b: 82 },
    water:           { r: 35, g: 82, b: 130 },
    shallowWater:    { r: 62, g: 120, b: 170 },
    beach:           { r: 210, g: 190, b: 140 },
    tundra:          { r: 150, g: 165, b: 140 },
    taiga:           { r: 50, g: 75, b: 50 },
    dryScrub:        { r: 165, g: 150, b: 100 },
    grassland:       { r: 95, g: 138, b: 62 },
    savanna:         { r: 170, g: 155, b: 80 },
    desert:          { r: 195, g: 170, b: 95 },
    temperateForest: { r: 45, g: 100, b: 35 },
    denseForest:     { r: 25, g: 65, b: 18 },
    tropicalForest:  { r: 20, g: 80, b: 25 },
    mountain:        { r: 105, g: 100, b: 90 },
    snow:            { r: 230, g: 232, b: 228 },
};

/**
 * Get blended biome color with per-pixel micro-variation
 */
export function getBiomeColor(biome, noiseVal) {
    const base = BIOME_COLORS[biome] || BIOME_COLORS.grassland;

    // Per-pixel variation: noise shifts each channel slightly
    const variation = noiseVal * 12;
    return {
        r: clamp(base.r + variation, 0, 255),
        g: clamp(base.g + variation * 0.8, 0, 255),
        b: clamp(base.b + variation * 0.6, 0, 255),
    };
}

// ── Poisson Disk Sampling ───────────────────────────────────────────

/**
 * Generate naturally-spaced points using Poisson disk sampling
 * Much more organic than grid-based placement
 */
export function poissonDiskSample(width, height, minDist, rng, maxAttempts = 30) {
    const cellSize = minDist / Math.SQRT2;
    const gridW = Math.ceil(width / cellSize);
    const gridH = Math.ceil(height / cellSize);
    const grid = new Array(gridW * gridH).fill(-1);
    const points = [];
    const active = [];

    function gridIndex(x, y) {
        return Math.floor(y / cellSize) * gridW + Math.floor(x / cellSize);
    }

    // Seed with first point
    const firstX = width * 0.5;
    const firstY = height * 0.5;
    points.push({ x: firstX, y: firstY });
    active.push(0);
    grid[gridIndex(firstX, firstY)] = 0;

    while (active.length > 0 && points.length < 5000) {
        const activeIdx = Math.floor(rng.next() * active.length);
        const point = points[active[activeIdx]];
        let found = false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const angle = rng.next() * Math.PI * 2;
            const dist = minDist + rng.next() * minDist;
            const nx = point.x + Math.cos(angle) * dist;
            const ny = point.y + Math.sin(angle) * dist;

            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

            // Check neighbors
            const gi = Math.floor(nx / cellSize);
            const gj = Math.floor(ny / cellSize);
            let tooClose = false;

            for (let di = -2; di <= 2 && !tooClose; di++) {
                for (let dj = -2; dj <= 2 && !tooClose; dj++) {
                    const ci = gi + di;
                    const cj = gj + dj;
                    if (ci < 0 || ci >= gridW || cj < 0 || cj >= gridH) continue;
                    const neighborIdx = grid[cj * gridW + ci];
                    if (neighborIdx < 0) continue;
                    const neighbor = points[neighborIdx];
                    const ddx = nx - neighbor.x;
                    const ddy = ny - neighbor.y;
                    if (ddx * ddx + ddy * ddy < minDist * minDist) {
                        tooClose = true;
                    }
                }
            }

            if (!tooClose) {
                const newIdx = points.length;
                points.push({ x: nx, y: ny });
                active.push(newIdx);
                grid[gridIndex(nx, ny)] = newIdx;
                found = true;
                break;
            }
        }

        if (!found) {
            active.splice(activeIdx, 1);
        }
    }

    return points;
}

// ── Mountain Range Detection ────────────────────────────────────────

/**
 * Find connected mountain regions and generate render points along ridgelines
 * instead of placing mountains on a grid
 */
export function findMountainRidges(width, height, heightMap, mountainLevel, rng) {
    const ridgePoints = [];
    const visited = new Uint8Array(width * height);

    // Find local maxima along mountain ridges
    for (let y = 4; y < height - 4; y += 3) {
        for (let x = 4; x < width - 4; x += 3) {
            const idx = y * width + x;
            const h = heightMap[idx];

            if (h < mountainLevel || visited[idx]) continue;

            // Check if this is a local maximum or ridge point
            const hL = heightMap[y * width + (x - 3)];
            const hR = heightMap[y * width + (x + 3)];
            const hU = heightMap[(y - 3) * width + x];
            const hD = heightMap[(y + 3) * width + x];

            // Ridge: high in one axis, drops in the perpendicular axis
            const isRidgeH = h > hL && h > hR;
            const isRidgeV = h > hU && h > hD;
            const isPeak = h > hL && h > hR && h > hU && h > hD;

            if (isPeak || isRidgeH || isRidgeV) {
                const size = 12 + (h - mountainLevel) * 60;
                const jitterX = rng.nextFloat(-2, 2);
                const jitterY = rng.nextFloat(-2, 2);

                ridgePoints.push({
                    x: x + jitterX,
                    y: y + jitterY,
                    size,
                    height: h,
                    isPeak,
                });

                // Mark neighborhood as visited
                for (let dy = -6; dy <= 6; dy++) {
                    for (let dx = -6; dx <= 6; dx++) {
                        const vx = x + dx;
                        const vy = y + dy;
                        if (vx >= 0 && vx < width && vy >= 0 && vy < height) {
                            visited[vy * width + vx] = 1;
                        }
                    }
                }
            }
        }
    }

    return ridgePoints;
}
