/**
 * Calyndra Mapmaker - Book-Quality Rendering Effects
 * Post-processing and rendering enhancements for fantasy book-style maps
 * Parchment textures, hillshading, hand-drawn lines, aging effects
 */

import { SimplexNoise } from './noise.js';
import { clamp } from './utils.js';

// ── Parchment Paper Texture ─────────────────────────────────────────

/**
 * Generate a realistic parchment texture on a canvas
 */
export function renderParchmentTexture(ctx, width, height, seed = 42) {
    const noise = new SimplexNoise(seed + 777);
    const noise2 = new SimplexNoise(seed + 888);
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // Base parchment color range
    const baseR = 234, baseG = 218, baseB = 185;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pi = (y * width + x) * 4;

            // Large-scale color variation (stains)
            const n1 = noise.fbm(x / 300, y / 300, 3, 2.0, 0.5);
            // Medium-scale paper grain
            const n2 = noise.fbm(x / 80, y / 80, 4, 2.0, 0.4);
            // Fine grain texture
            const n3 = noise2.noise2D(x / 15, y / 15) * 0.5;
            // Very fine fibres
            const n4 = noise2.noise2D(x / 4, y / 4) * 0.15;

            const combined = n1 * 0.35 + n2 * 0.35 + n3 * 0.2 + n4 * 0.1;

            // Warm/cool variation
            const warmth = noise.noise2D(x / 400, y / 400) * 8;

            let r = baseR + combined * 30 + warmth;
            let g = baseG + combined * 25;
            let b = baseB + combined * 15 - warmth * 0.5;

            data[pi] = clamp(r, 0, 255);
            data[pi + 1] = clamp(g, 0, 255);
            data[pi + 2] = clamp(b, 0, 255);
            data[pi + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// ── Age Stains and Spots ────────────────────────────────────────────

/**
 * Add realistic aging effects: coffee stains, foxing spots, water damage
 */
export function renderAgeEffects(ctx, width, height, seed = 42, intensity = 0.5) {
    const noise = new SimplexNoise(seed + 999);

    ctx.save();

    // Coffee/tea stains (large, subtle circular discolorations)
    const stainCount = Math.floor(3 + intensity * 4);
    for (let i = 0; i < stainCount; i++) {
        const sx = noise.noise2D(i * 7.3, 0.5) * 0.5 + 0.5;
        const sy = noise.noise2D(0.5, i * 7.3) * 0.5 + 0.5;
        const sr = (0.05 + Math.abs(noise.noise2D(i * 3.1, i * 2.7)) * 0.15) * Math.min(width, height);

        const gradient = ctx.createRadialGradient(
            sx * width, sy * height, sr * 0.2,
            sx * width, sy * height, sr
        );
        gradient.addColorStop(0, `rgba(139, 109, 69, ${0.06 * intensity})`);
        gradient.addColorStop(0.5, `rgba(139, 109, 69, ${0.03 * intensity})`);
        gradient.addColorStop(1, 'rgba(139, 109, 69, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    // Foxing spots (tiny brown spots from aging)
    const spotCount = Math.floor(20 * intensity);
    for (let i = 0; i < spotCount; i++) {
        const fx = (noise.noise2D(i * 13.7, 1.3) * 0.5 + 0.5) * width;
        const fy = (noise.noise2D(1.3, i * 13.7) * 0.5 + 0.5) * height;
        const fr = 1 + Math.abs(noise.noise2D(i * 5.1, i * 3.3)) * 3;

        ctx.fillStyle = `rgba(120, 90, 50, ${0.1 + Math.random() * 0.1})`;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// ── Vignette Effect ─────────────────────────────────────────────────

export function renderVignette(ctx, width, height, strength = 0.4) {
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.25,
        width / 2, height / 2, Math.max(width, height) * 0.7
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(30, 20, 10, ${strength})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

// ── Hillshading (Northwest Directional Lighting) ────────────────────

/**
 * Renders hillshading overlay from a height map.
 * Light source from northwest (standard cartographic convention).
 */
export function renderHillshading(ctx, width, height, heightMap, options = {}) {
    const {
        lightAngle = -0.75 * Math.PI,  // NW
        lightElevation = 0.65,
        strength = 0.5,
        ambient = 0.3,
    } = options;

    const lx = Math.cos(lightAngle) * Math.cos(lightElevation);
    const ly = Math.sin(lightAngle) * Math.cos(lightElevation);
    const lz = Math.sin(lightElevation);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            // Compute surface normal using Sobel-like gradient
            const left = heightMap[y * width + (x - 1)];
            const right = heightMap[y * width + (x + 1)];
            const up = heightMap[(y - 1) * width + x];
            const down = heightMap[(y + 1) * width + x];

            // Normal vector (not normalized for performance)
            const nx = (left - right) * 2;
            const ny = (up - down) * 2;
            const nz = 0.1; // Controls steepness sensitivity

            // Normalize
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            const nnx = nx / len;
            const nny = ny / len;
            const nnz = nz / len;

            // Dot product with light direction
            const dot = nnx * lx + nny * ly + nnz * lz;
            const shade = clamp(ambient + (1 - ambient) * dot, 0, 1);

            const pi = (y * width + x) * 4;

            if (shade < 0.5) {
                // Shadow - darken
                const factor = shade / 0.5;
                const darken = (1 - factor) * strength;
                data[pi] = Math.max(0, data[pi] - data[pi] * darken);
                data[pi + 1] = Math.max(0, data[pi + 1] - data[pi + 1] * darken);
                data[pi + 2] = Math.max(0, data[pi + 2] - data[pi + 2] * darken);
            } else {
                // Highlight - lighten slightly
                const factor = (shade - 0.5) / 0.5;
                const lighten = factor * strength * 0.4;
                data[pi] = Math.min(255, data[pi] + (255 - data[pi]) * lighten);
                data[pi + 1] = Math.min(255, data[pi + 1] + (255 - data[pi + 1]) * lighten);
                data[pi + 2] = Math.min(255, data[pi + 2] + (255 - data[pi + 2]) * lighten);
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// ── Hand-Drawn Coastline ────────────────────────────────────────────

/**
 * Draw hand-drawn style coastlines with multiple strokes and wobble.
 * Creates the classic "inked" coastline look from fantasy maps.
 */
export function renderHandDrawnCoastline(ctx, width, height, heightMap, seaLevel, options = {}) {
    const {
        inkColor = 'rgba(35, 25, 15, 0.85)',
        lineWidth = 1.8,
        wobbleAmount = 1.5,
        hachureLines = true,
        hachureLength = 6,
        hachureDensity = 0.15,
    } = options;

    const noise = new SimplexNoise(12345);

    ctx.save();

    // Collect coastline points
    const coastPoints = [];
    for (let y = 2; y < height - 2; y += 1) {
        for (let x = 2; x < width - 2; x += 1) {
            const h = heightMap[y * width + x];
            const hR = heightMap[y * width + x + 1];
            const hD = heightMap[(y + 1) * width + x];

            const isCoast = (h >= seaLevel && (hR < seaLevel || hD < seaLevel)) ||
                           (h < seaLevel && (hR >= seaLevel || hD >= seaLevel));

            if (isCoast) {
                coastPoints.push({ x, y, h });
            }
        }
    }

    // Main coastline stroke with ink wobble
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    // Draw coastline segments as short strokes with slight randomness
    for (const pt of coastPoints) {
        const wobX = noise.noise2D(pt.x * 0.1, pt.y * 0.1) * wobbleAmount;
        const wobY = noise.noise2D(pt.x * 0.1 + 50, pt.y * 0.1 + 50) * wobbleAmount;

        ctx.globalAlpha = 0.6 + Math.abs(noise.noise2D(pt.x * 0.05, pt.y * 0.05)) * 0.4;
        ctx.fillStyle = inkColor;
        ctx.fillRect(pt.x + wobX - 0.5, pt.y + wobY - 0.5, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // Water hachure lines (short dashes pointing into the water)
    if (hachureLines) {
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 0.6;

        for (const pt of coastPoints) {
            if (Math.random() > hachureDensity) continue;

            // Find water direction (gradient of height map)
            const idx = pt.y * width + pt.x;
            const gx = (heightMap[idx + 1] || 0) - (heightMap[idx - 1] || 0);
            const gy = (heightMap[idx + width] || 0) - (heightMap[idx - width] || 0);
            const len = Math.sqrt(gx * gx + gy * gy) || 1;

            // Point toward water (downhill)
            const dx = -gx / len;
            const dy = -gy / len;

            const hLen = hachureLength * (0.5 + Math.random() * 0.5);

            ctx.globalAlpha = 0.3 + Math.random() * 0.3;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt.x + dx * hLen, pt.y + dy * hLen);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

// ── Water Wave Pattern ──────────────────────────────────────────────

/**
 * Render horizontal wave lines in water areas (classic map style)
 */
export function renderWaterWaves(ctx, width, height, heightMap, seaLevel, options = {}) {
    const {
        waveSpacing = 8,
        waveAmplitude = 2,
        waveColor = 'rgba(40, 60, 100, 0.2)',
        lineWidth = 0.5,
    } = options;

    const noise = new SimplexNoise(54321);

    ctx.save();
    ctx.strokeStyle = waveColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    for (let y = waveSpacing; y < height; y += waveSpacing) {
        ctx.beginPath();
        let drawing = false;
        let segmentLength = 0;

        for (let x = 0; x < width; x += 2) {
            const h = heightMap[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)];

            if (h < seaLevel - 0.02) {
                // In water - draw wave
                const depth = (seaLevel - h) / seaLevel;
                const waveY = y + Math.sin(x * 0.08 + noise.noise2D(x * 0.01, y * 0.01) * 3) * waveAmplitude * depth;

                // Fade near coast
                const coastFade = clamp((seaLevel - h) / 0.08, 0, 1);
                ctx.globalAlpha = coastFade * 0.35;

                if (!drawing) {
                    ctx.moveTo(x, waveY);
                    drawing = true;
                    segmentLength = 0;
                } else {
                    ctx.lineTo(x, waveY);
                    segmentLength++;
                }
            } else {
                if (drawing && segmentLength > 2) {
                    ctx.stroke();
                    ctx.beginPath();
                }
                drawing = false;
            }
        }
        if (drawing) ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

// ── Book-Style Mountain Rendering ───────────────────────────────────

/**
 * Draw a mountain in engraving/cross-hatch style
 */
export function drawBookMountain(ctx, x, y, size, options = {}) {
    const s = size;
    const snow = options.snow !== false;
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.85)';

    ctx.save();
    ctx.translate(x, y);

    // Mountain silhouette with ink outline
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.2;
    ctx.fillStyle = 'rgba(35, 25, 15, 0.05)';

    // Main peak shape - more organic with slight hand-drawn wobble
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.3);
    ctx.lineTo(-s * 0.35, s * 0.05);
    ctx.lineTo(-s * 0.15, -s * 0.3);
    ctx.lineTo(-s * 0.05, -s * 0.42);  // Summit
    ctx.lineTo(s * 0.05, -s * 0.35);
    ctx.lineTo(s * 0.15, -s * 0.2);
    ctx.lineTo(s * 0.3, s * 0.0);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shadow-side hatch lines (right side = shadow, NW light)
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.6;
    const hatchCount = Math.floor(s * 0.4);
    for (let i = 0; i < hatchCount; i++) {
        const t = i / hatchCount;
        const startX = s * 0.05 + t * s * 0.4;
        const startY = -s * 0.35 + t * s * 0.65;
        const endX = startX + s * 0.03;
        const endY = startY + s * 0.15;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    // Additional cross-hatching for deep shadow
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < Math.floor(hatchCount * 0.5); i++) {
        const t = i / (hatchCount * 0.5);
        const startX = s * 0.15 + t * s * 0.25;
        const startY = -s * 0.15 + t * s * 0.35;
        const endX = startX - s * 0.06;
        const endY = startY + s * 0.12;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Snow cap
    if (snow) {
        ctx.fillStyle = 'rgba(255, 250, 240, 0.9)';
        ctx.beginPath();
        ctx.moveTo(-s * 0.12, -s * 0.28);
        ctx.lineTo(-s * 0.05, -s * 0.42);
        ctx.lineTo(s * 0.05, -s * 0.35);
        ctx.lineTo(s * 0.08, -s * 0.22);
        ctx.quadraticCurveTo(0, -s * 0.18, -s * 0.12, -s * 0.28);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 0.6;
        ctx.stroke();
    }

    ctx.restore();
}

// ── Book-Style Tree Rendering ───────────────────────────────────────

export function drawBookTree(ctx, x, y, size, options = {}) {
    const s = size;
    const type = options.type || 'deciduous';
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.75)';

    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = inkColor;
    ctx.fillStyle = 'rgba(35, 25, 15, 0.08)';

    if (type === 'pine') {
        // Minimal pine - just a few strokes
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.25);
        ctx.lineTo(0, -s * 0.1);
        ctx.stroke();

        for (let i = 0; i < 3; i++) {
            const yPos = -s * 0.05 + i * s * 0.1;
            const w = s * (0.2 - i * 0.04);
            ctx.beginPath();
            ctx.moveTo(-w, yPos);
            ctx.lineTo(0, yPos - s * 0.15 + i * 0.02);
            ctx.lineTo(w, yPos);
            ctx.stroke();
        }
    } else {
        // Deciduous - small bumpy crown
        ctx.lineWidth = 0.8;

        // Trunk
        ctx.beginPath();
        ctx.moveTo(0, s * 0.2);
        ctx.lineTo(0, 0);
        ctx.stroke();

        // Crown - series of small bumps
        ctx.beginPath();
        ctx.arc(-s * 0.08, -s * 0.1, s * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.08, -s * 0.08, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -s * 0.18, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

// ── Book-Style City Icon ────────────────────────────────────────────

export function drawBookCity(ctx, x, y, size, options = {}) {
    const s = size;
    const isCapital = options.isCapital || false;
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.9)';

    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = inkColor;
    ctx.fillStyle = inkColor;

    if (isCapital) {
        // Star/castle symbol for capital
        ctx.lineWidth = 1.2;

        // Castle towers
        const towers = [-s * 0.3, -s * 0.1, s * 0.1, s * 0.3];
        for (const tx of towers) {
            ctx.fillRect(tx - s * 0.06, -s * 0.35, s * 0.12, s * 0.35);
            // Crenellations
            ctx.fillRect(tx - s * 0.08, -s * 0.42, s * 0.05, s * 0.07);
            ctx.fillRect(tx + s * 0.03, -s * 0.42, s * 0.05, s * 0.07);
        }

        // Wall between towers
        ctx.fillRect(-s * 0.3, -s * 0.2, s * 0.6, s * 0.2);

        // Gate
        ctx.fillStyle = 'rgba(234, 218, 185, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.07, Math.PI, 0);
        ctx.lineTo(s * 0.07, s * 0.0);
        ctx.lineTo(-s * 0.07, s * 0.0);
        ctx.closePath();
        ctx.fill();
    } else {
        // Simple building cluster for towns
        ctx.lineWidth = 1;

        // Main building
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, s * 0.05);
        ctx.lineTo(-s * 0.15, -s * 0.1);
        ctx.lineTo(0, -s * 0.25);
        ctx.lineTo(s * 0.15, -s * 0.1);
        ctx.lineTo(s * 0.15, s * 0.05);
        ctx.closePath();
        ctx.fill();

        // Church tower
        ctx.fillRect(s * 0.05, -s * 0.35, s * 0.06, s * 0.25);
        ctx.beginPath();
        ctx.moveTo(s * 0.05, -s * 0.35);
        ctx.lineTo(s * 0.08, -s * 0.42);
        ctx.lineTo(s * 0.11, -s * 0.35);
        ctx.fill();

        // Circle marker
        ctx.fillStyle = inkColor;
        ctx.beginPath();
        ctx.arc(0, s * 0.1, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// ── Ornate Book-Style Border ────────────────────────────────────────

export function drawBookBorder(ctx, width, height, options = {}) {
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.8)';
    const margin = Math.min(width, height) * 0.025;
    const innerMargin = margin * 2.2;
    const cornerSize = margin * 2;

    ctx.save();
    ctx.strokeStyle = inkColor;

    // Outer line (thick)
    ctx.lineWidth = 2.5;
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    // Inner line (thin)
    ctx.lineWidth = 0.8;
    ctx.strokeRect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2);

    // Middle decorative line
    const midMargin = (margin + innerMargin) / 2;
    ctx.lineWidth = 0.4;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(midMargin, midMargin, width - midMargin * 2, height - midMargin * 2);
    ctx.setLineDash([]);

    // Corner decorations (fleur-de-lis inspired)
    ctx.lineWidth = 1.2;
    const corners = [
        [innerMargin, innerMargin],
        [width - innerMargin, innerMargin],
        [innerMargin, height - innerMargin],
        [width - innerMargin, height - innerMargin],
    ];

    for (const [cx, cy] of corners) {
        ctx.save();
        ctx.translate(cx, cy);

        // Ornate corner knot
        const cs = cornerSize * 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, cs, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, cs * 0.5, 0, Math.PI * 2);
        ctx.stroke();

        // Small diamond in center
        ctx.fillStyle = inkColor;
        ctx.beginPath();
        ctx.moveTo(0, -cs * 0.25);
        ctx.lineTo(cs * 0.25, 0);
        ctx.lineTo(0, cs * 0.25);
        ctx.lineTo(-cs * 0.25, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    // Edge decoration (small diamonds along the border)
    ctx.fillStyle = inkColor;
    const diaSpacing = Math.min(width, height) * 0.08;
    const diaSize = 2.5;

    // Top and bottom edges
    for (let x = innerMargin + diaSpacing; x < width - innerMargin - diaSpacing / 2; x += diaSpacing) {
        for (const ey of [midMargin, height - midMargin]) {
            ctx.beginPath();
            ctx.moveTo(x, ey - diaSize);
            ctx.lineTo(x + diaSize, ey);
            ctx.lineTo(x, ey + diaSize);
            ctx.lineTo(x - diaSize, ey);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Left and right edges
    for (let y = innerMargin + diaSpacing; y < height - innerMargin - diaSpacing / 2; y += diaSpacing) {
        for (const ex of [midMargin, width - midMargin]) {
            ctx.beginPath();
            ctx.moveTo(ex, y - diaSize);
            ctx.lineTo(ex + diaSize, y);
            ctx.lineTo(ex, y + diaSize);
            ctx.lineTo(ex - diaSize, y);
            ctx.closePath();
            ctx.fill();
        }
    }

    ctx.restore();
}

// ── Book-Style Compass Rose ─────────────────────────────────────────

export function drawBookCompass(ctx, x, y, size, options = {}) {
    const s = size;
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.85)';

    ctx.save();
    ctx.translate(x, y);

    // Outer decorative circles
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    // Degree tick marks
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        const inner = i % 8 === 0 ? s * 0.35 : i % 4 === 0 ? s * 0.38 : s * 0.41;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * s * 0.44, Math.sin(angle) * s * 0.44);
        ctx.stroke();
    }

    // Cardinal points - large star
    const cardinals = [
        { angle: -Math.PI / 2, label: 'N', len: s * 0.38 },
        { angle: 0, label: 'O', len: s * 0.32 },
        { angle: Math.PI / 2, label: 'S', len: s * 0.32 },
        { angle: Math.PI, label: 'W', len: s * 0.32 },
    ];

    for (const c of cardinals) {
        const sideW = s * 0.06;

        // Dark half
        ctx.fillStyle = inkColor;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(c.angle - 0.08) * sideW, Math.sin(c.angle - 0.08) * sideW);
        ctx.lineTo(Math.cos(c.angle) * c.len, Math.sin(c.angle) * c.len);
        ctx.closePath();
        ctx.fill();

        // Light half
        ctx.fillStyle = 'rgba(35, 25, 15, 0.15)';
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(c.angle + 0.08) * sideW, Math.sin(c.angle + 0.08) * sideW);
        ctx.lineTo(Math.cos(c.angle) * c.len, Math.sin(c.angle) * c.len);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Intercardinal smaller points
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) + Math.PI / 4;
        const len = s * 0.2;
        const sideW = s * 0.04;

        ctx.fillStyle = 'rgba(35, 25, 15, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle - 0.06) * sideW, Math.sin(angle - 0.06) * sideW);
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.lineTo(Math.cos(angle + 0.06) * sideW, Math.sin(angle + 0.06) * sideW);
        ctx.closePath();
        ctx.fill();
    }

    // Direction labels
    ctx.fillStyle = inkColor;
    ctx.font = `bold ${s * 0.14}px "Palatino Linotype", "Book Antiqua", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const c of cardinals) {
        const dist = c.len + s * 0.12;
        ctx.fillText(c.label, Math.cos(c.angle) * dist, Math.sin(c.angle) * dist);
    }

    // Center ornament
    ctx.fillStyle = inkColor;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.03, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ── Book-Style Title Cartouche ──────────────────────────────────────

export function drawTitleCartouche(ctx, x, y, title, subtitle, options = {}) {
    const inkColor = options.inkColor || 'rgba(35, 25, 15, 0.9)';
    const fontSize = options.fontSize || 28;

    ctx.save();
    ctx.translate(x, y);

    // Measure text
    ctx.font = `bold ${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
    const titleWidth = ctx.measureText(title).width;
    const boxWidth = titleWidth + 60;
    const boxHeight = subtitle ? fontSize * 2.8 : fontSize * 1.8;

    // Decorative scroll/cartouche background
    ctx.fillStyle = 'rgba(234, 218, 185, 0.7)';
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.5;

    // Rounded rect
    const bx = -boxWidth / 2;
    const by = -boxHeight / 2;
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + boxWidth - r, by);
    ctx.quadraticCurveTo(bx + boxWidth, by, bx + boxWidth, by + r);
    ctx.lineTo(bx + boxWidth, by + boxHeight - r);
    ctx.quadraticCurveTo(bx + boxWidth, by + boxHeight, bx + boxWidth - r, by + boxHeight);
    ctx.lineTo(bx + r, by + boxHeight);
    ctx.quadraticCurveTo(bx, by + boxHeight, bx, by + boxHeight - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Decorative lines inside
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx + 4, by + 4, boxWidth - 8, boxHeight - 8);

    // Title text
    ctx.fillStyle = inkColor;
    ctx.font = `bold ${fontSize}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 0, subtitle ? -fontSize * 0.35 : 0);

    // Subtitle
    if (subtitle) {
        ctx.font = `italic ${fontSize * 0.45}px "Palatino Linotype", serif`;
        ctx.fillStyle = 'rgba(35, 25, 15, 0.7)';
        ctx.fillText(subtitle, 0, fontSize * 0.45);
    }

    // Small decorative divider between title and subtitle
    if (subtitle) {
        ctx.strokeStyle = 'rgba(35, 25, 15, 0.4)';
        ctx.lineWidth = 0.5;
        const divW = boxWidth * 0.3;
        ctx.beginPath();
        ctx.moveTo(-divW / 2, fontSize * 0.08);
        ctx.lineTo(divW / 2, fontSize * 0.08);
        ctx.stroke();
    }

    ctx.restore();
}
