/**
 * Calyndra Mapmaker - Programmatic Asset Renderer
 * Draws map icons (buildings, terrain features, creatures) directly on canvas
 * All assets are resolution-independent and procedurally generated
 */

// ── Building Assets ─────────────────────────────────────────────────

export function drawHumanHouse(ctx, x, y, size, options = {}) {
    const s = size;
    const color = options.color || '#8b7355';
    const roofColor = options.roofColor || '#6b3320';

    ctx.save();
    ctx.translate(x, y);

    // Wall
    ctx.fillStyle = color;
    ctx.fillRect(-s * 0.4, -s * 0.2, s * 0.8, s * 0.5);

    // Door
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(-s * 0.08, s * 0.05, s * 0.16, s * 0.25);

    // Windows
    ctx.fillStyle = '#c4a44a';
    ctx.fillRect(-s * 0.3, -s * 0.05, s * 0.12, s * 0.12);
    ctx.fillRect(s * 0.18, -s * 0.05, s * 0.12, s * 0.12);

    // Roof
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.2);
    ctx.lineTo(0, -s * 0.55);
    ctx.lineTo(s * 0.5, -s * 0.2);
    ctx.closePath();
    ctx.fill();

    // Chimney
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(s * 0.15, -s * 0.5, s * 0.1, s * 0.2);

    ctx.restore();
}

export function drawElvenHouse(ctx, x, y, size, options = {}) {
    const s = size;
    const color = options.color || '#5a7a4a';
    const roofColor = options.roofColor || '#2d5016';

    ctx.save();
    ctx.translate(x, y);

    // Trunk/base (organic, tree-like)
    ctx.fillStyle = '#6b5035';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.15, s * 0.15, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main structure (curved, organic)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.1, s * 0.3, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leaf roof (layered)
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.35, s * 0.35, s * 0.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a4010';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.42, s * 0.25, s * 0.15, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Elven window (arch-shaped)
    ctx.fillStyle = '#aaccaa';
    ctx.beginPath();
    ctx.arc(0, -s * 0.1, s * 0.08, Math.PI, 0);
    ctx.lineTo(s * 0.08, s * 0.05);
    ctx.lineTo(-s * 0.08, s * 0.05);
    ctx.closePath();
    ctx.fill();

    // Vine details
    ctx.strokeStyle = '#3a6a2a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(-s * 0.25, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.35, s * 0.1, -s * 0.2, s * 0.3);
    ctx.stroke();

    ctx.restore();
}

export function drawDwarvenHouse(ctx, x, y, size, options = {}) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Stone base (wider, shorter)
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.45);

    // Stone texture lines
    ctx.strokeStyle = '#5a5a5a';
    ctx.lineWidth = s * 0.015;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.15 + i * s * 0.15);
        ctx.lineTo(s * 0.45, -s * 0.15 + i * s * 0.15);
        ctx.stroke();
    }

    // Heavy door (arched)
    ctx.fillStyle = '#4a3520';
    ctx.beginPath();
    ctx.arc(0, s * 0.05, s * 0.12, Math.PI, 0);
    ctx.lineTo(s * 0.12, s * 0.3);
    ctx.lineTo(-s * 0.12, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Door rivets
    ctx.fillStyle = '#8a8a6a';
    ctx.beginPath(); ctx.arc(-s * 0.06, s * 0.1, s * 0.02, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.06, s * 0.1, s * 0.02, 0, Math.PI * 2); ctx.fill();

    // Flat stone roof
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.15);
    ctx.lineTo(-s * 0.3, -s * 0.35);
    ctx.lineTo(s * 0.3, -s * 0.35);
    ctx.lineTo(s * 0.5, -s * 0.15);
    ctx.closePath();
    ctx.fill();

    // Forge chimney with smoke
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(s * 0.15, -s * 0.55, s * 0.15, s * 0.25);

    ctx.restore();
}

export function drawTower(ctx, x, y, size, options = {}) {
    const s = size;
    const color = options.color || '#7a7a7a';

    ctx.save();
    ctx.translate(x, y);

    // Tower body
    ctx.fillStyle = color;
    ctx.fillRect(-s * 0.2, -s * 0.3, s * 0.4, s * 0.7);

    // Crenellations
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
        ctx.fillRect(-s * 0.25 + i * s * 0.18, -s * 0.42, s * 0.12, s * 0.12);
    }

    // Windows (arrow slits)
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-s * 0.03, -s * 0.15, s * 0.06, s * 0.15);
    ctx.fillRect(-s * 0.03, s * 0.1, s * 0.06, s * 0.15);

    ctx.restore();
}

export function drawTemple(ctx, x, y, size, options = {}) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Steps
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(-s * 0.5, s * 0.2, s, s * 0.1);
    ctx.fillRect(-s * 0.45, s * 0.1, s * 0.9, s * 0.1);

    // Pillars
    ctx.fillStyle = '#c4b488';
    ctx.fillRect(-s * 0.4, -s * 0.3, s * 0.08, s * 0.4);
    ctx.fillRect(s * 0.32, -s * 0.3, s * 0.08, s * 0.4);
    ctx.fillRect(-s * 0.1, -s * 0.3, s * 0.08, s * 0.4);
    ctx.fillRect(s * 0.02, -s * 0.3, s * 0.08, s * 0.4);

    // Roof (triangular pediment)
    ctx.fillStyle = '#8a7a5a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.3);
    ctx.lineTo(0, -s * 0.6);
    ctx.lineTo(s * 0.5, -s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Symbol circle in pediment
    ctx.strokeStyle = '#c4a44a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.arc(0, -s * 0.38, s * 0.08, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

export function drawTavern(ctx, x, y, size, options = {}) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Main building (wider)
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.45);

    // Half-timber details
    ctx.strokeStyle = '#4a3020';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, 0); ctx.lineTo(s * 0.45, 0);
    ctx.moveTo(0, -s * 0.15); ctx.lineTo(0, s * 0.3);
    ctx.moveTo(-s * 0.45, -s * 0.15); ctx.lineTo(0, s * 0.3);
    ctx.moveTo(s * 0.45, -s * 0.15); ctx.lineTo(0, s * 0.3);
    ctx.stroke();

    // Roof
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.15);
    ctx.lineTo(0, -s * 0.5);
    ctx.lineTo(s * 0.55, -s * 0.15);
    ctx.closePath();
    ctx.fill();

    // Sign
    ctx.fillStyle = '#c4a44a';
    ctx.fillRect(s * 0.35, -s * 0.05, s * 0.2, s * 0.15);
    ctx.strokeStyle = '#4a3020';
    ctx.lineWidth = s * 0.01;
    ctx.strokeRect(s * 0.35, -s * 0.05, s * 0.2, s * 0.15);

    // Warm window glow
    ctx.fillStyle = '#e8c060';
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-s * 0.35, -s * 0.05, s * 0.15, s * 0.12);
    ctx.fillRect(s * 0.1, -s * 0.05, s * 0.15, s * 0.12);
    ctx.globalAlpha = 1.0;

    ctx.restore();
}

// ── Terrain Assets ──────────────────────────────────────────────────

export function drawMountain(ctx, x, y, size, options = {}) {
    const s = size;
    const snow = options.snow !== false;

    ctx.save();
    ctx.translate(x, y);

    // Mountain body
    ctx.fillStyle = '#6a6a5a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.3);
    ctx.lineTo(-s * 0.1, -s * 0.4);
    ctx.lineTo(s * 0.05, -s * 0.3);
    ctx.lineTo(s * 0.2, -s * 0.45);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Shading
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(s * 0.2, -s * 0.45);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.lineTo(s * 0.05, s * 0.3);
    ctx.lineTo(s * 0.05, -s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Snow cap
    if (snow) {
        ctx.fillStyle = '#e8e8e8';
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.4);
        ctx.lineTo(-s * 0.02, -s * 0.25);
        ctx.lineTo(s * 0.05, -s * 0.3);
        ctx.lineTo(s * 0.2, -s * 0.45);
        ctx.lineTo(s * 0.12, -s * 0.32);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

export function drawVolcano(ctx, x, y, size, options = {}) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Mountain body (darker)
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.3);
    ctx.lineTo(-s * 0.12, -s * 0.35);
    ctx.lineTo(s * 0.12, -s * 0.35);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Crater
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.35, s * 0.12, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lava glow
    ctx.fillStyle = '#cc3300';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.35, s * 0.08, s * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lava streams
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = s * 0.03;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(-s * 0.03, -s * 0.3);
    ctx.quadraticCurveTo(-s * 0.15, 0, -s * 0.25, s * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.05, -s * 0.32);
    ctx.quadraticCurveTo(s * 0.2, 0, s * 0.3, s * 0.3);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Smoke
    ctx.fillStyle = 'rgba(80,80,80,0.4)';
    ctx.beginPath(); ctx.arc(-s * 0.05, -s * 0.5, s * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.05, -s * 0.58, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-s * 0.02, -s * 0.7, s * 0.1, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
}

export function drawTree(ctx, x, y, size, options = {}) {
    const s = size;
    const type = options.type || 'deciduous';

    ctx.save();
    ctx.translate(x, y);

    // Trunk
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-s * 0.06, s * 0.0, s * 0.12, s * 0.3);

    if (type === 'pine') {
        // Pine tree layers
        ctx.fillStyle = options.color || '#1a4a1a';
        for (let i = 0; i < 3; i++) {
            const w = s * (0.35 - i * 0.08);
            const yOff = -s * 0.15 - i * s * 0.18;
            ctx.beginPath();
            ctx.moveTo(-w, yOff + s * 0.2);
            ctx.lineTo(0, yOff);
            ctx.lineTo(w, yOff + s * 0.2);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        // Deciduous tree crown
        ctx.fillStyle = options.color || '#2d6016';
        ctx.beginPath();
        ctx.arc(0, -s * 0.15, s * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-s * 0.12, -s * 0.05, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.12, -s * 0.05, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

export function drawRiver(ctx, points, width = 3, color = '#4a90c4') {
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    ctx.restore();
}

export function drawBridge(ctx, x, y, size, angle = 0) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Bridge planks
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(-s * 0.4, -s * 0.15, s * 0.8, s * 0.3);

    // Railings
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = s * 0.04;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, -s * 0.15);
    ctx.lineTo(s * 0.4, -s * 0.15);
    ctx.moveTo(-s * 0.4, s * 0.15);
    ctx.lineTo(s * 0.4, s * 0.15);
    ctx.stroke();

    // Posts
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(-s * 0.4, -s * 0.25, s * 0.06, s * 0.1);
    ctx.fillRect(s * 0.34, -s * 0.25, s * 0.06, s * 0.1);
    ctx.fillRect(-s * 0.4, s * 0.15, s * 0.06, s * 0.1);
    ctx.fillRect(s * 0.34, s * 0.15, s * 0.06, s * 0.1);

    ctx.restore();
}

// ── Map Decorations ─────────────────────────────────────────────────

export function drawCompassRose(ctx, x, y, size) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Outer circle
    ctx.strokeStyle = '#5a4a3a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal points
    const directions = ['N', 'O', 'S', 'W'];
    const points = [
        { angle: -Math.PI / 2, primary: true },
        { angle: 0, primary: true },
        { angle: Math.PI / 2, primary: true },
        { angle: Math.PI, primary: true },
    ];

    // Main star
    for (let i = 0; i < 4; i++) {
        const angle = points[i].angle;
        const len = s * 0.4;
        const sideLen = s * 0.1;

        ctx.fillStyle = i % 2 === 0 ? '#2a1a0a' : '#8b7355';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            Math.cos(angle - 0.15) * sideLen,
            Math.sin(angle - 0.15) * sideLen
        );
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.lineTo(
            Math.cos(angle + 0.15) * sideLen,
            Math.sin(angle + 0.15) * sideLen
        );
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = i % 2 === 0 ? '#5a4a3a' : '#c4a44a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            Math.cos(angle + 0.15) * sideLen,
            Math.sin(angle + 0.15) * sideLen
        );
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.lineTo(
            Math.cos(angle - 0.15) * sideLen,
            Math.sin(angle - 0.15) * sideLen
        );
        ctx.closePath();
        ctx.fill();
    }

    // Intercardinal points (smaller)
    for (let i = 0; i < 4; i++) {
        const angle = points[i].angle + Math.PI / 4;
        const len = s * 0.25;
        const sideLen = s * 0.06;

        ctx.fillStyle = '#5a4a3a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle - 0.1) * sideLen, Math.sin(angle - 0.1) * sideLen);
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.lineTo(Math.cos(angle + 0.1) * sideLen, Math.sin(angle + 0.1) * sideLen);
        ctx.closePath();
        ctx.fill();
    }

    // Direction labels
    ctx.fillStyle = '#2a1a0a';
    ctx.font = `bold ${s * 0.12}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
        const angle = points[i].angle;
        const dist = s * 0.52;
        ctx.fillText(
            directions[i],
            Math.cos(angle) * dist,
            Math.sin(angle) * dist
        );
    }

    // Center dot
    ctx.fillStyle = '#c4a44a';
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.03, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

export function drawMapBorder(ctx, width, height, style = 'ornate') {
    ctx.save();

    if (style === 'ornate') {
        const borderWidth = Math.min(width, height) * 0.02;

        // Outer border
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth);

        // Inner border
        ctx.strokeStyle = '#8b7355';
        ctx.lineWidth = borderWidth * 0.5;
        const offset = borderWidth * 2;
        ctx.strokeRect(offset, offset, width - offset * 2, height - offset * 2);

        // Corner decorations
        const cornerSize = borderWidth * 4;
        const corners = [
            [offset, offset],
            [width - offset, offset],
            [offset, height - offset],
            [width - offset, height - offset],
        ];

        ctx.fillStyle = '#8b7355';
        for (const [cx, cy] of corners) {
            ctx.beginPath();
            ctx.arc(cx, cy, cornerSize * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy, cornerSize * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = '#c4a44a';
            ctx.fill();
            ctx.fillStyle = '#8b7355';
        }
    } else {
        // Simple border
        ctx.strokeStyle = '#5a4a3a';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, width - 4, height - 4);
    }

    ctx.restore();
}

export function drawScaleBar(ctx, x, y, mapWidth, unitLabel = 'Meilen') {
    const barWidth = mapWidth * 0.15;
    const barHeight = 6;

    ctx.save();
    ctx.translate(x, y);

    // Bar segments
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#2a1a0a' : '#f4e4c1';
        ctx.fillRect(i * (barWidth / 4), 0, barWidth / 4, barHeight);
    }

    // Border
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, barWidth, barHeight);

    // Labels
    ctx.fillStyle = '#2a1a0a';
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('0', 0, barHeight + 14);
    ctx.fillText(`50 ${unitLabel}`, barWidth / 2, barHeight + 14);
    ctx.fillText(`100 ${unitLabel}`, barWidth, barHeight + 14);

    ctx.restore();
}

// ── Token/Marker Rendering ──────────────────────────────────────────

export function drawToken(ctx, x, y, size, options = {}) {
    const color = options.color || '#aa2a2a';
    const symbol = options.symbol || '?';
    const tokenSize = options.tokenSize || 1;
    const radius = (size * tokenSize) / 2;

    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(2, 2, radius, 0, Math.PI * 2);
    ctx.fill();

    // Token body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = radius * 0.1;
    ctx.stroke();

    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(-radius * 0.2, -radius * 0.2, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Symbol
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${radius * 0.9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 0, 1);

    ctx.restore();
}

// ── Castle / Fortress ───────────────────────────────────────────────

export function drawCastle(ctx, x, y, size) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);

    // Main keep
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.5);

    // Towers (4 corners)
    const towerPositions = [
        [-s * 0.4, -s * 0.3],
        [s * 0.3, -s * 0.3],
        [-s * 0.4, s * 0.15],
        [s * 0.3, s * 0.15],
    ];

    for (const [tx, ty] of towerPositions) {
        ctx.fillStyle = '#6a6a6a';
        ctx.fillRect(tx, ty, s * 0.15, s * 0.25);
        // Crenellations
        ctx.fillRect(tx - s * 0.02, ty - s * 0.06, s * 0.06, s * 0.06);
        ctx.fillRect(tx + s * 0.08, ty - s * 0.06, s * 0.06, s * 0.06);
    }

    // Walls
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(-s * 0.4, -s * 0.15, s * 0.2, s * 0.08);
    ctx.fillRect(s * 0.2, -s * 0.15, s * 0.15, s * 0.08);
    ctx.fillRect(-s * 0.4, s * 0.2, s * 0.2, s * 0.08);
    ctx.fillRect(s * 0.2, s * 0.2, s * 0.15, s * 0.08);

    // Gate
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.08, Math.PI, 0);
    ctx.lineTo(s * 0.08, s * 0.3);
    ctx.lineTo(-s * 0.08, s * 0.3);
    ctx.closePath();
    ctx.fill();

    // Banner
    ctx.fillStyle = '#aa2a2a';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.45);
    ctx.lineTo(s * 0.1, -s * 0.35);
    ctx.lineTo(s * 0.1, -s * 0.25);
    ctx.lineTo(s * 0.05, -s * 0.28);
    ctx.lineTo(0, -s * 0.25);
    ctx.closePath();
    ctx.fill();

    // Flagpole
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = s * 0.02;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.45);
    ctx.lineTo(0, -s * 0.2);
    ctx.stroke();

    ctx.restore();
}

// ── City-Specific Buildings ─────────────────────────────────────────

export function drawForge(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#5a5050'; ctx.fillRect(-s*0.45, -s*0.1, s*0.9, s*0.4);
    ctx.fillStyle = '#4a3020'; ctx.beginPath();
    ctx.moveTo(-s*0.5,-s*0.1); ctx.lineTo(0,-s*0.35); ctx.lineTo(s*0.5,-s*0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3030'; ctx.fillRect(s*0.1, -s*0.6, s*0.2, s*0.35);
    ctx.fillStyle = '#dd6600'; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(-s*0.2, s*0.1, s*0.08, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(-s*0.2, s*0.1, s*0.04, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(s*0.28, s*0.12, s*0.16, s*0.04); ctx.fillRect(s*0.3, s*0.15, s*0.12, s*0.1);
    ctx.restore();
}

export function drawChurch(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#b0a080'; ctx.fillRect(-s*0.35, -s*0.1, s*0.7, s*0.4);
    ctx.fillStyle = '#6b4423'; ctx.beginPath();
    ctx.moveTo(-s*0.4,-s*0.1); ctx.lineTo(0,-s*0.35); ctx.lineTo(s*0.4,-s*0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b0a080'; ctx.fillRect(-s*0.1, -s*0.55, s*0.2, s*0.3);
    ctx.fillStyle = '#6b4423'; ctx.beginPath();
    ctx.moveTo(-s*0.12,-s*0.55); ctx.lineTo(0,-s*0.78); ctx.lineTo(s*0.12,-s*0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c4a44a'; ctx.lineWidth = s*0.025; ctx.beginPath();
    ctx.moveTo(0,-s*0.85); ctx.lineTo(0,-s*0.73);
    ctx.moveTo(-s*0.04,-s*0.8); ctx.lineTo(s*0.04,-s*0.8); ctx.stroke();
    ctx.fillStyle = '#4a3020'; ctx.beginPath();
    ctx.arc(0, s*0.1, s*0.07, Math.PI, 0);
    ctx.lineTo(s*0.07, s*0.3); ctx.lineTo(-s*0.07, s*0.3); ctx.closePath(); ctx.fill();
    ctx.restore();
}

export function drawGuildHall(ctx, x, y, size, options = {}) {
    const s = size; const bannerColor = options.bannerColor || '#aa2a2a';
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#9a8a70'; ctx.fillRect(-s*0.45, -s*0.2, s*0.9, s*0.5);
    ctx.fillStyle = '#5a3a1a'; ctx.beginPath();
    ctx.moveTo(-s*0.52,-s*0.2); ctx.lineTo(0,-s*0.55); ctx.lineTo(s*0.52,-s*0.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4a44a'; ctx.globalAlpha = 0.7;
    for (let i=0;i<4;i++) ctx.fillRect(-s*0.35+i*s*0.2, -s*0.12, s*0.12, s*0.1);
    ctx.globalAlpha = 1; ctx.fillStyle = '#4a3020'; ctx.fillRect(-s*0.08, s*0.05, s*0.16, s*0.15);
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = s*0.02; ctx.beginPath();
    ctx.moveTo(-s*0.35,-s*0.55); ctx.lineTo(-s*0.35,-s*0.2); ctx.stroke();
    ctx.fillStyle = bannerColor; ctx.beginPath();
    ctx.moveTo(-s*0.35,-s*0.55); ctx.lineTo(-s*0.2,-s*0.48); ctx.lineTo(-s*0.2,-s*0.38);
    ctx.lineTo(-s*0.25,-s*0.41); ctx.lineTo(-s*0.35,-s*0.38); ctx.closePath(); ctx.fill();
    ctx.restore();
}

export function drawWarehouse(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#7a6a5a'; ctx.fillRect(-s*0.5, -s*0.15, s*1.0, s*0.45);
    ctx.fillStyle = '#5a4a3a'; ctx.beginPath();
    ctx.moveTo(-s*0.55,-s*0.15); ctx.lineTo(0,-s*0.3); ctx.lineTo(s*0.55,-s*0.15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(-s*0.15, 0, s*0.3, s*0.3);
    ctx.fillStyle = '#6b4423'; ctx.fillRect(s*0.3, s*0.1, s*0.1, s*0.1); ctx.fillRect(s*0.35, 0, s*0.1, s*0.1);
    ctx.restore();
}

export function drawWell(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#6a6a6a'; ctx.lineWidth = s*0.12;
    ctx.beginPath(); ctx.arc(0, 0, s*0.25, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#2a3a4a'; ctx.beginPath(); ctx.arc(0, 0, s*0.2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = s*0.04; ctx.beginPath();
    ctx.moveTo(-s*0.2,-s*0.1); ctx.lineTo(-s*0.2,-s*0.4);
    ctx.moveTo(s*0.2,-s*0.1); ctx.lineTo(s*0.2,-s*0.4); ctx.stroke();
    ctx.fillStyle = '#5a3a1a'; ctx.beginPath();
    ctx.moveTo(-s*0.3,-s*0.4); ctx.lineTo(0,-s*0.55); ctx.lineTo(s*0.3,-s*0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
}

export function drawFountain(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#9a9a8a'; ctx.beginPath();
    for (let i=0;i<8;i++) { const a=(i/8)*Math.PI*2; ctx[i===0?'moveTo':'lineTo'](Math.cos(a)*s*0.35,Math.sin(a)*s*0.35); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a90b0'; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, s*0.28, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#8a8a7a'; ctx.fillRect(-s*0.04, -s*0.15, s*0.08, s*0.3);
    ctx.fillStyle = '#c4a44a'; ctx.beginPath(); ctx.arc(0, -s*0.18, s*0.05, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

export function drawMarketStall(ctx, x, y, size, options = {}) {
    const s = size; const color = options.color || '#c4873a';
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#6b4423'; ctx.fillRect(-s*0.35, s*0.0, s*0.7, s*0.15);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(-s*0.4,-s*0.25); ctx.lineTo(s*0.4,-s*0.25); ctx.lineTo(s*0.35,s*0.05); ctx.lineTo(-s*0.35,s*0.05);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = s*0.03; ctx.beginPath();
    ctx.moveTo(-s*0.35,-s*0.25); ctx.lineTo(-s*0.35,s*0.15);
    ctx.moveTo(s*0.35,-s*0.25); ctx.lineTo(s*0.35,s*0.15); ctx.stroke();
    ctx.restore();
}

export function drawWindmill(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#b0a080'; ctx.beginPath();
    ctx.moveTo(-s*0.2,s*0.3); ctx.lineTo(-s*0.12,-s*0.25); ctx.lineTo(s*0.12,-s*0.25); ctx.lineTo(s*0.2,s*0.3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a4a3a'; ctx.beginPath();
    ctx.moveTo(-s*0.15,-s*0.25); ctx.lineTo(0,-s*0.4); ctx.lineTo(s*0.15,-s*0.25); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b5a4a'; ctx.lineWidth = s*0.03; const bl = s*0.45;
    for (let i=0;i<4;i++) { const a=(i/4)*Math.PI*2+0.3; ctx.beginPath(); ctx.moveTo(0,-s*0.3);
        ctx.lineTo(Math.cos(a)*bl, -s*0.3+Math.sin(a)*bl); ctx.stroke(); }
    ctx.fillStyle = '#4a3020'; ctx.fillRect(-s*0.06, s*0.12, s*0.12, s*0.18);
    ctx.restore();
}

export function drawStatue(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#8a8a7a'; ctx.fillRect(-s*0.15, s*0.05, s*0.3, s*0.2);
    ctx.fillRect(-s*0.2, s*0.2, s*0.4, s*0.08);
    ctx.fillStyle = '#7a7a6a'; ctx.fillRect(-s*0.06, -s*0.2, s*0.12, s*0.25);
    ctx.beginPath(); ctx.arc(0, -s*0.28, s*0.07, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#aaa89a'; ctx.lineWidth = s*0.02; ctx.beginPath();
    ctx.moveTo(s*0.06,-s*0.12); ctx.lineTo(s*0.22,-s*0.45); ctx.stroke();
    ctx.restore();
}

export function drawBarracks(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#6a5a4a'; ctx.fillRect(-s*0.55, -s*0.1, s*1.1, s*0.35);
    ctx.fillStyle = '#4a3a2a'; ctx.beginPath();
    ctx.moveTo(-s*0.6,-s*0.1); ctx.lineTo(-s*0.3,-s*0.3); ctx.lineTo(s*0.3,-s*0.3); ctx.lineTo(s*0.6,-s*0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3a3a';
    for (let i=0;i<5;i++) ctx.fillRect(-s*0.45+i*s*0.2, 0, s*0.08, s*0.08);
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = s*0.02; ctx.beginPath();
    ctx.moveTo(s*0.4,-s*0.5); ctx.lineTo(s*0.4,-s*0.1); ctx.stroke();
    ctx.fillStyle = '#cc3333'; ctx.fillRect(s*0.4, -s*0.5, s*0.15, s*0.1);
    ctx.restore();
}

export function drawLibrary(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#a09080'; ctx.fillRect(-s*0.4, -s*0.15, s*0.8, s*0.45);
    ctx.fillStyle = '#c0b090';
    for (const px of [-0.35,-0.15,0.09,0.29]) ctx.fillRect(px*s, -s*0.15, s*0.06, s*0.35);
    ctx.fillStyle = '#8a7a6a'; ctx.beginPath();
    ctx.moveTo(-s*0.42,-s*0.15); ctx.lineTo(0,-s*0.4); ctx.lineTo(s*0.42,-s*0.15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4a44a'; ctx.fillRect(-s*0.06, -s*0.28, s*0.12, s*0.08);
    ctx.restore();
}

export function drawDock(ctx, x, y, size, angle = 0) {
    const s = size; ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.fillStyle = '#6b4423'; ctx.fillRect(-s*0.1, 0, s*0.2, s*0.8);
    ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = s*0.015;
    for (let i = 0; i < 6; i++) {
        const py = s*0.08 + i*s*0.12;
        ctx.beginPath(); ctx.moveTo(-s*0.12, py); ctx.lineTo(s*0.12, py); ctx.stroke();
    }
    ctx.fillStyle = '#5a3a1a';
    for (const [px, py] of [[-s*0.1,0],[s*0.1,0],[-s*0.1,s*0.8],[s*0.1,s*0.8]]) {
        ctx.beginPath(); ctx.arc(px, py, s*0.04, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

export function drawShack(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#6b5a4a';
    ctx.fillRect(-s*0.3, -s*0.1, s*0.6, s*0.35);
    ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = s*0.015;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-s*0.3, -s*0.05 + i*s*0.1);
        ctx.lineTo(s*0.3, -s*0.05 + i*s*0.1);
        ctx.stroke();
    }
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath();
    ctx.moveTo(-s*0.35, -s*0.1);
    ctx.lineTo(-s*0.05, -s*0.28);
    ctx.lineTo(s*0.3, -s*0.15);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(-s*0.06, s*0.05, s*0.1, s*0.2);
    ctx.restore();
}

export function drawNobleHouse(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    // Larger, finer house with decorative elements
    ctx.fillStyle = '#a89878';
    ctx.fillRect(-s*0.5, -s*0.15, s, s*0.5);
    // Second story line
    ctx.strokeStyle = '#6a5a4a'; ctx.lineWidth = s*0.02;
    ctx.beginPath(); ctx.moveTo(-s*0.5, s*0.1); ctx.lineTo(s*0.5, s*0.1); ctx.stroke();
    // Decorative columns at corners
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(-s*0.5, -s*0.15, s*0.06, s*0.5);
    ctx.fillRect(s*0.44, -s*0.15, s*0.06, s*0.5);
    // Steep roof
    ctx.fillStyle = '#5a2a1a';
    ctx.beginPath();
    ctx.moveTo(-s*0.55, -s*0.15); ctx.lineTo(0, -s*0.5); ctx.lineTo(s*0.55, -s*0.15);
    ctx.closePath(); ctx.fill();
    // Ornate windows
    ctx.fillStyle = '#c4a44a'; ctx.globalAlpha = 0.8;
    ctx.fillRect(-s*0.35, -s*0.05, s*0.12, s*0.1);
    ctx.fillRect(-s*0.1, -s*0.05, s*0.12, s*0.1);
    ctx.fillRect(s*0.15, -s*0.05, s*0.12, s*0.1);
    ctx.fillRect(-s*0.35, s*0.15, s*0.12, s*0.1);
    ctx.fillRect(s*0.15, s*0.15, s*0.12, s*0.1);
    ctx.globalAlpha = 1;
    // Grand double door
    ctx.fillStyle = '#4a2a0a';
    ctx.fillRect(-s*0.08, s*0.15, s*0.16, s*0.2);
    // Front steps
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(-s*0.12, s*0.33, s*0.24, s*0.04);
    ctx.fillRect(-s*0.15, s*0.35, s*0.3, s*0.04);
    ctx.restore();
}

export function drawShrine(ctx, x, y, size) {
    const s = size; ctx.save(); ctx.translate(x, y);
    // Small stone base
    ctx.fillStyle = '#9a9080';
    ctx.fillRect(-s*0.2, -s*0.02, s*0.4, s*0.25);
    // Pillars
    ctx.fillStyle = '#c0b090';
    ctx.fillRect(-s*0.2, -s*0.25, s*0.06, s*0.25);
    ctx.fillRect(s*0.14, -s*0.25, s*0.06, s*0.25);
    // Roof (small pagoda-style)
    ctx.fillStyle = '#5a3a1a';
    ctx.beginPath();
    ctx.moveTo(-s*0.3, -s*0.25); ctx.lineTo(0, -s*0.42); ctx.lineTo(s*0.3, -s*0.25);
    ctx.closePath(); ctx.fill();
    // Altar inside
    ctx.fillStyle = '#c4a44a';
    ctx.fillRect(-s*0.05, -s*0.15, s*0.1, s*0.1);
    ctx.restore();
}

