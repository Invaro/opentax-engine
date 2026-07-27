"use client";

import { useEffect, useRef } from "react";

/**
 * The dither, live. Same back half as scripts/dither.mjs (tone curve, density
 * cap, 8×8 Bayer threshold) but the source is a drifting field evaluated per
 * frame instead of a PNG.
 *
 * The field is a smooth interference surface run through cos(f · bands), which
 * turns it into topographic contour ribbons rather than a plasma wash. A broad
 * low-frequency envelope thins whole regions out so the contours breathe.
 *
 * Every term of the surface is separable (sin(ax+p)·sin(by+q), plus the
 * angle-sum expansion of sin(ax+by+p)), so each frame precomputes a handful of
 * per-row and per-column tables and the inner loop is multiply-add plus one
 * cosine, a few percent of a core at 24fps across a full-width band.
 *
 * One canvas pixel is one dot; `scale` blows it up with nearest-neighbour so
 * the grid stays as crisp as the baked assets. Idles when off-screen, and
 * renders a single frame under prefers-reduced-motion.
 */

const BAYER8 = (() => {
  let m = [
    [0, 2],
    [3, 1],
  ];
  while (m.length < 8) {
    const n = m.length;
    const next = Array.from({ length: n * 2 }, () => Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + n] = v + 2;
        next[y + n][x] = v + 3;
        next[y + n][x + n] = v + 1;
      }
    }
    m = next;
  }
  // Flattened, pre-divided into the 0..1 threshold the CLI compares against.
  return Float32Array.from(m.flat().map((v) => (v + 0.5) / 64));
})();

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function DitherCanvas({
  color = "#6B5CE7",
  darkColor,
  max = 1,
  curve = 3.4,
  bands = 11,
  scale = 2,
  speed = 1,
  fps = 24,
  className = "",
}: {
  /** Dot colour in light mode. */
  color?: string;
  /** Dot colour once .dark is on the html element; falls back to `color`. */
  darkColor?: string;
  /** Density cap on the contour crests, 0..1. */
  max?: number;
  /** Tone-curve exponent; higher makes the ribbons thinner and sharper. */
  curve?: number;
  /** Contour count across the field's range; higher packs more ribbons in. */
  bands?: number;
  /** CSS pixels per dot. */
  scale?: number;
  /** Drift rate multiplier. */
  speed?: number;
  fps?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Live-read on each frame so prop changes don't need to restart the loop.
  const opts = useRef({ color, darkColor, max, curve, bands, scale, speed, fps });
  opts.current = { color, darkColor, max, curve, bands, scale, speed, fps };

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let image: ImageData | null = null;
    let visible = true;
    let raf = 0;
    let last = 0;
    let t = 0;

    // Per-frame axis tables, allocated on resize and refilled every frame.
    let xs: Float32Array[] = [];
    let ys: Float32Array[] = [];

    const resize = () => {
      const s = Math.max(1, opts.current.scale);
      const nw = Math.max(1, Math.ceil(host.clientWidth / s));
      const nh = Math.max(1, Math.ceil(host.clientHeight / s));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w * s}px`;
      canvas.style.height = `${h * s}px`;
      image = ctx.createImageData(w, h);
      xs = [0, 1, 2, 3].map(() => new Float32Array(w));
      ys = [0, 1, 2, 3].map(() => new Float32Array(h));
    };

    const draw = (time: number) => {
      if (!image) return;
      const { max: cap, curve: gamma, bands: k } = opts.current;
      const dark = document.documentElement.classList.contains("dark");
      const { r, g, b } = hexToRgb((dark && opts.current.darkColor) || opts.current.color);

      // Normalised coordinates keep the field's shape independent of size.
      const fx = 1 / w;
      const fy = 1 / h;
      for (let x = 0; x < w; x++) {
        const u = x * fx;
        xs[0][x] = Math.sin(u * 5.1 + time * 0.55);
        xs[1][x] = Math.sin(u * 8.3 - time * 0.31);
        xs[2][x] = Math.cos(u * 8.3 - time * 0.31);
        xs[3][x] = Math.sin(u * 2.4 + time * 0.19);
      }
      for (let y = 0; y < h; y++) {
        const v = y * fy;
        ys[0][y] = Math.sin(v * 3.7 - time * 0.42);
        ys[1][y] = Math.cos(v * 6.1 + time * 0.67);
        ys[2][y] = Math.sin(v * 6.1 + time * 0.67);
        ys[3][y] = Math.sin(v * 1.6 - time * 0.23);
      }

      const px = image.data;
      for (let y = 0; y < h; y++) {
        const y0 = ys[0][y];
        const y1 = ys[1][y];
        const y2 = ys[2][y];
        const y3 = ys[3][y];
        const bRow = (y & 7) << 3;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          // sin(a)·sin(b) + sin(c+d) + sin(e)·sin(f), all separable.
          const slow = xs[3][x] * y3;
          const f = xs[0][x] * y0 + 0.7 * (xs[1][x] * y1 + xs[2][x] * y2) + 0.5 * slow;
          // Contour the surface, then thin whole regions with a slow envelope.
          const d = (0.5 + 0.5 * Math.cos(f * k)) * (0.45 + 0.55 * (0.5 + 0.5 * slow));
          const density = Math.pow(d, gamma) * cap;
          const i = (row + x) << 2;
          if (density > BAYER8[bRow + (x & 7)]) {
            px[i] = r;
            px[i + 1] = g;
            px[i + 2] = b;
            px[i + 3] = 255;
          } else {
            px[i + 3] = 0;
          }
        }
      }
      ctx.putImageData(image, 0, 0);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const interval = 1000 / opts.current.fps;
      if (now - last < interval) return;
      t += ((now - last) / 1000) * opts.current.speed;
      last = now;
      draw(t);
    };

    const ro = new ResizeObserver(() => {
      resize();
      draw(t);
    });
    ro.observe(host);

    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        // Skip the wall-clock gap that built up while scrolled away.
        if (visible) last = performance.now();
      },
      { rootMargin: "120px" },
    );
    io.observe(host);

    resize();
    draw(t);
    if (!reduced) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <canvas ref={ref} className="block" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}
