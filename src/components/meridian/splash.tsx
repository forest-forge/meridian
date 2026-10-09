import { useEffect, useRef } from "react";
import { earthLand } from "@/lib/earth-land";
import { Button } from "./ui";

export function Splash({ ready, onEnter }: { ready: boolean; onEnter: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 py-8 text-center">
      <Mark />
      <h1 className="mt-6 font-display text-5xl font-medium tracking-tight">Meridian</h1>
      <p className="mt-2 text-sm text-muted">UK doses, local time.</p>
      <Button className="mt-8 w-full max-w-xs" disabled={!ready} onClick={onEnter}>
        Continue
      </Button>
    </main>
  );
}

function Mark() {
  return (
    <div className="relative aspect-[360/250] w-full max-w-sm" role="img" aria-label="The Earth and a medicine bottle">
      <svg viewBox="0 0 360 250" className="pointer-events-none absolute inset-0 h-full w-full">
        <ellipse cx="168" cy="222" rx="96" ry="8" fill="#e7e4dc" />
      </svg>
      <Earth />
      <svg viewBox="0 0 360 250" className="pointer-events-none absolute inset-0 h-full w-full">
        <g>
          <path
            d="M218 82 h22 v14 c10 8 20 16 24 24 v66 c0 12 -10 18 -18 18 h-36 c-8 0 -18 -6 -18 -18 v-66 c4 -8 14 -16 24 -24 v-14 z"
            fill="#faf9f6"
            stroke="#1c211f"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <rect x="212" y="64" width="34" height="20" rx="4" fill="#1f4f4a" />
          <path d="M218 80 h22" stroke="#163e3a" strokeWidth="3" strokeLinecap="round" />
          <rect x="210" y="132" width="38" height="34" rx="3" fill="#e7e4dc" />
          <path d="M218 144 h22 M218 154 h16" stroke="#1f4f4a" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

function Earth() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = buildMap();
    const globe = document.createElement("canvas");
    const size = 220;
    globe.width = size;
    globe.height = size;
    const gctx = globe.getContext("2d");
    if (!gctx) return;
    let pixels = gctx.createImageData(size, size);
    let frame = 0;
    let stop = false;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(box.width * dpr));
      const h = Math.max(2, Math.round(box.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
    };

    const draw = (rot: number) => {
      const data = pixels.data;
      const mw = map.width;
      const mh = map.height;
      const md = map.data;
      const rotRad = (rot * Math.PI) / 180;
      const r = size / 2 - 1;
      const cx = size / 2;
      const cy = size / 2;
      for (let y = 0; y < size; y++) {
        const ny = (cy - y) / r;
        for (let x = 0; x < size; x++) {
          const nx = (x - cx) / r;
          const di = (y * size + x) * 4;
          const disk = nx * nx + ny * ny;
          if (disk > 1) {
            data[di] = 31;
            data[di + 1] = 79;
            data[di + 2] = 74;
            data[di + 3] = 255;
            continue;
          }
          const z = Math.sqrt(1 - disk);
          let lon = Math.atan2(nx, z) - rotRad;
          lon = ((lon + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
          const lat = Math.asin(ny);
          const mx = ((lon + Math.PI) / (Math.PI * 2)) * mw;
          const my = ((Math.PI / 2 - lat) / Math.PI) * (mh - 1);
          const si = (Math.max(0, Math.min(mh - 1, my | 0)) * mw + Math.min(mw - 1, mx | 0)) * 4;
          const shade = 0.86 + 0.14 * z;
          data[di] = md[si] * shade;
          data[di + 1] = md[si + 1] * shade;
          data[di + 2] = md[si + 2] * shade;
          data[di + 3] = 255;
        }
      }
      gctx.putImageData(pixels, 0, 0);
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const gx = w / 2;
      const gy = h / 2;
      const gr = Math.min(gx, gy) - 2;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(globe, gx - gr - 2, gy - gr - 2, (gr + 2) * 2, (gr + 2) * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.strokeStyle = "#1c211f";
      ctx.lineWidth = Math.max(2, (window.devicePixelRatio || 1) * 1.6);
      ctx.stroke();
    };

    const tick = (t: number) => {
      if (stop) return;
      draw(reduced ? 10 : (t / 20000) * 360);
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frame = requestAnimationFrame(tick);
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute top-[10.4%] left-[15.55%] aspect-square w-[51.11%]"
      aria-hidden="true"
    />
  );
}

function buildMap() {
  const w = 720;
  const h = 360;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(w, h);
  ctx.fillStyle = "#1f4f4a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#faf9f6";
  ctx.beginPath();
  for (const ring of earthLand) {
    for (const part of splitDateline(ring)) {
      for (let i = 0; i < part.length; i += 2) {
        const x = ((part[i] + 180) / 360) * w;
        const y = ((90 - part[i + 1]) / 180) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  ctx.fill();
  return ctx.getImageData(0, 0, w, h);
}

function splitDateline(ring: number[]) {
  const parts: number[][] = [];
  let cur: number[] = [];
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const lon = ring[i * 2];
    const lat = ring[i * 2 + 1];
    const nlon = ring[((i + 1) % n) * 2];
    const nlat = ring[((i + 1) % n) * 2 + 1];
    cur.push(lon, lat);
    if (Math.abs(lon - nlon) > 180) {
      const edge = lon > 0 ? 180 : -180;
      const wrapped = nlon + (nlon > 0 ? -360 : 360);
      const t = (edge - lon) / (wrapped - lon);
      const latAt = lat + (nlat - lat) * Math.max(0, Math.min(1, t));
      cur.push(edge, latAt);
      parts.push(cur);
      cur = [edge > 0 ? -180 : 180, latAt];
    }
  }
  if (cur.length) parts.push(cur);
  return parts;
}
