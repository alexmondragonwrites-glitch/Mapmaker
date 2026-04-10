/**
 * Simplex Noise Implementation for Calyndra Mapmaker
 * Based on Stefan Gustavson's simplex noise algorithm
 * Optimized for 2D terrain generation
 */

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const GRAD3 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]
];

export class SimplexNoise {
    constructor(seed = Math.random() * 65536) {
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        this._seed(seed);
    }

    _seed(seed) {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;

        // Fisher-Yates shuffle with seed
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807 + 0) % 2147483647;
            const j = s % (i + 1);
            [p[i], p[j]] = [p[j], p[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
    }

    noise2D(x, y) {
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;

        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;

        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;

        const ii = i & 255;
        const jj = j & 255;

        let n0 = 0, n1 = 0, n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const gi0 = this.permMod12[ii + this.perm[jj]];
            t0 *= t0;
            n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
            t1 *= t1;
            n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];
            t2 *= t2;
            n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
        }

        return 70.0 * (n0 + n1 + n2);
    }

    /**
     * Fractal Brownian Motion - layered noise for natural-looking terrain
     */
    fbm(x, y, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.noise2D(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }

    /**
     * Ridge noise - creates mountain ridge-like patterns
     */
    ridgeNoise(x, y, octaves = 6, lacunarity = 2.0, persistence = 0.5) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            let n = this.noise2D(x * frequency, y * frequency);
            n = 1.0 - Math.abs(n);
            n = n * n;
            value += amplitude * n;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return value / maxValue;
    }

    /**
     * Domain-warped noise for organic terrain shapes
     */
    warpedNoise(x, y, scale = 1, warpStrength = 0.5) {
        const warpX = this.fbm(x * scale + 5.2, y * scale + 1.3, 4);
        const warpY = this.fbm(x * scale + 9.7, y * scale + 2.8, 4);
        return this.fbm(
            (x * scale + warpStrength * warpX),
            (y * scale + warpStrength * warpY),
            6
        );
    }
}
