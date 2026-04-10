/**
 * Calyndra Mapmaker - Zoomable Map System
 * Hierarchical navigation: World → Region → City
 * Click on a region/city to zoom in, breadcrumbs to zoom out
 */

export class ZoomController {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.app = app;
        this.zoomStack = [];       // [{level, data}] navigation history
        this.currentLevel = 'world'; // 'world' | 'region' | 'city'
        this.currentData = null;     // current zoom target data
        this.clickableAreas = [];    // interactive regions on current map
        this.breadcrumbs = [];
        this.listeners = new Set();
        this.enabled = true;

        this._setupClickHandler();
    }

    // ── Public API ──────────────────────────────────────────────────

    isZoomed() {
        return this.zoomStack.length > 0;
    }

    getCurrentLevel() {
        return this.currentLevel;
    }

    getCurrentData() {
        return this.currentData;
    }

    getBreadcrumbs() {
        return this.breadcrumbs;
    }

    /**
     * Register a clickable area on the current map.
     * When user clicks inside, triggers a zoom transition.
     */
    registerClickableArea(area) {
        this.clickableAreas.push(area);
    }

    clearClickableAreas() {
        this.clickableAreas = [];
    }

    /**
     * Zoom into a region or city
     */
    zoomIn(level, data) {
        // Push current state to stack
        this.zoomStack.push({
            level: this.currentLevel,
            data: this.currentData,
        });

        this.currentLevel = level;
        this.currentData = data;
        this.clickableAreas = [];
        this._updateBreadcrumbs();
        this._notify('zoomIn', { level, data });
    }

    /**
     * Zoom out one level
     */
    zoomOut() {
        if (this.zoomStack.length === 0) return;

        const prev = this.zoomStack.pop();
        this.currentLevel = prev.level;
        this.currentData = prev.data;
        this.clickableAreas = [];
        this._updateBreadcrumbs();
        this._notify('zoomOut', { level: this.currentLevel, data: this.currentData });
    }

    /**
     * Jump to a specific level in the breadcrumb trail
     */
    jumpTo(index) {
        while (this.zoomStack.length > index) {
            this.zoomStack.pop();
        }

        if (index === 0) {
            this.currentLevel = 'world';
            this.currentData = null;
        } else {
            const target = this.zoomStack.pop();
            this.currentLevel = target.level;
            this.currentData = target.data;
        }

        this.clickableAreas = [];
        this._updateBreadcrumbs();
        this._notify('jumpTo', { level: this.currentLevel, data: this.currentData });
    }

    /**
     * Reset to world view
     */
    resetToWorld() {
        this.zoomStack = [];
        this.currentLevel = 'world';
        this.currentData = null;
        this.clickableAreas = [];
        this._updateBreadcrumbs();
        this._notify('reset', {});
    }

    /**
     * Enable/disable zoom interaction
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    // ── Rendering Helpers ───────────────────────────────────────────

    /**
     * Draw clickable areas with hover indicators on the canvas
     */
    renderClickableAreas(ctx, mouseX, mouseY) {
        for (const area of this.clickableAreas) {
            const isHover = this._isPointInArea(mouseX, mouseY, area);

            if (isHover) {
                ctx.save();

                // Highlight circle
                ctx.strokeStyle = 'rgba(196, 135, 58, 0.8)';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);

                if (area.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(area.x, area.y, area.radius + 4, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (area.shape === 'rect') {
                    ctx.strokeRect(area.x - 2, area.y - 2, area.width + 4, area.height + 4);
                }

                // Tooltip
                const label = area.label || 'Klicken zum Hineinzoomen';
                ctx.font = 'bold 11px "Palatino Linotype", serif';
                ctx.textAlign = 'center';
                const textWidth = ctx.measureText(label).width;

                // Background
                ctx.fillStyle = 'rgba(26, 20, 18, 0.85)';
                const tooltipX = area.x || area.x + area.width / 2;
                const tooltipY = (area.y || area.y) - (area.radius || 20) - 22;
                ctx.fillRect(tooltipX - textWidth / 2 - 6, tooltipY - 2, textWidth + 12, 18);

                // Border
                ctx.strokeStyle = 'rgba(196, 135, 58, 0.6)';
                ctx.lineWidth = 1;
                ctx.setLineDash([]);
                ctx.strokeRect(tooltipX - textWidth / 2 - 6, tooltipY - 2, textWidth + 12, 18);

                // Text
                ctx.fillStyle = '#e8d8c8';
                ctx.fillText(label, tooltipX, tooltipY + 12);

                ctx.restore();
            }

            // Subtle indicator even when not hovering
            if (!isHover && area.showIndicator !== false) {
                ctx.save();
                ctx.strokeStyle = 'rgba(196, 135, 58, 0.25)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 4]);

                if (area.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(area.x, area.y, area.radius + 2, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.restore();
            }
        }
    }

    /**
     * Render breadcrumb navigation overlay on canvas
     */
    renderBreadcrumbs(ctx, canvasWidth) {
        if (this.breadcrumbs.length <= 1) return;

        const y = 8;
        const height = 24;
        const padding = 8;
        let x = padding;

        ctx.save();

        // Background bar
        const totalWidth = this._measureBreadcrumbWidth(ctx);
        ctx.fillStyle = 'rgba(26, 20, 18, 0.85)';
        ctx.fillRect(0, 0, totalWidth + padding * 2 + 10, height + y * 2);
        ctx.strokeStyle = 'rgba(196, 135, 58, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, totalWidth + padding * 2 + 10, height + y * 2);

        ctx.font = '12px "Palatino Linotype", serif';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < this.breadcrumbs.length; i++) {
            const crumb = this.breadcrumbs[i];
            const isLast = i === this.breadcrumbs.length - 1;

            if (isLast) {
                ctx.fillStyle = '#c4873a';
                ctx.font = 'bold 12px "Palatino Linotype", serif';
            } else {
                ctx.fillStyle = '#9a8a7a';
                ctx.font = '12px "Palatino Linotype", serif';
            }

            ctx.fillText(crumb.label, x, y + height / 2);
            x += ctx.measureText(crumb.label).width;

            if (!isLast) {
                ctx.fillStyle = '#5a4a3a';
                ctx.fillText(' → ', x, y + height / 2);
                x += ctx.measureText(' → ').width;
            }
        }

        ctx.restore();
    }

    // ── Event Handling ──────────────────────────────────────────────

    onChange(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _notify(event, data) {
        for (const cb of this.listeners) {
            try { cb(event, data); } catch (e) { console.error('Zoom listener error:', e); }
        }
    }

    _setupClickHandler() {
        // Track mouse position for hover effects
        this.mouseX = -1;
        this.mouseY = -1;

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.enabled || this.clickableAreas.length === 0) return;

            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.mouseX = (e.clientX - rect.left) * scaleX;
            this.mouseY = (e.clientY - rect.top) * scaleY;

            // Change cursor on hover
            let isOverArea = false;
            for (const area of this.clickableAreas) {
                if (this._isPointInArea(this.mouseX, this.mouseY, area)) {
                    isOverArea = true;
                    break;
                }
            }
            this.canvas.style.cursor = isOverArea ? 'pointer' : 'default';
        });

        this.canvas.addEventListener('click', (e) => {
            if (!this.enabled || this.clickableAreas.length === 0) return;

            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            for (const area of this.clickableAreas) {
                if (this._isPointInArea(clickX, clickY, area)) {
                    e.stopPropagation();
                    this.zoomIn(area.targetLevel, area.targetData);
                    return;
                }
            }
        });

        // Breadcrumb click handler (top-left of canvas)
        this.canvas.addEventListener('click', (e) => {
            if (!this.enabled || this.breadcrumbs.length <= 1) return;

            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            // Only handle clicks in the breadcrumb area
            if (clickY > 40 || clickX > 400) return;

            // Determine which breadcrumb was clicked
            let x = 8;
            const ctx = this.canvas.getContext('2d');
            ctx.font = '12px "Palatino Linotype", serif';

            for (let i = 0; i < this.breadcrumbs.length - 1; i++) {
                const crumb = this.breadcrumbs[i];
                const w = ctx.measureText(crumb.label).width;
                const arrowW = ctx.measureText(' → ').width;

                if (clickX >= x && clickX <= x + w) {
                    this.jumpTo(i);
                    return;
                }

                x += w + arrowW;
            }
        });
    }

    _isPointInArea(px, py, area) {
        if (area.shape === 'circle') {
            const dx = px - area.x;
            const dy = py - area.y;
            return (dx * dx + dy * dy) <= (area.radius * area.radius);
        }
        if (area.shape === 'rect') {
            return px >= area.x && px <= area.x + area.width &&
                   py >= area.y && py <= area.y + area.height;
        }
        return false;
    }

    _updateBreadcrumbs() {
        this.breadcrumbs = [{ label: 'Welt', level: 'world', data: null }];

        for (const entry of this.zoomStack) {
            this.breadcrumbs.push({
                label: entry.data?.name || entry.level,
                level: entry.level,
                data: entry.data,
            });
        }

        this.breadcrumbs.push({
            label: this.currentData?.name || this._levelLabel(this.currentLevel),
            level: this.currentLevel,
            data: this.currentData,
        });

        // Remove duplicate "Welt" if we're at world level
        if (this.breadcrumbs.length === 2 && this.currentLevel === 'world') {
            this.breadcrumbs = [this.breadcrumbs[0]];
        }
    }

    _levelLabel(level) {
        switch (level) {
            case 'world': return 'Welt';
            case 'region': return 'Region';
            case 'city': return 'Stadt';
            default: return level;
        }
    }

    _measureBreadcrumbWidth(ctx) {
        ctx.font = '12px "Palatino Linotype", serif';
        let total = 0;
        for (let i = 0; i < this.breadcrumbs.length; i++) {
            total += ctx.measureText(this.breadcrumbs[i].label).width;
            if (i < this.breadcrumbs.length - 1) {
                total += ctx.measureText(' → ').width;
            }
        }
        return total;
    }
}
