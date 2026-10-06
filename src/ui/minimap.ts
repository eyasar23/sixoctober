import type { CityData } from '../world/cityGen';

/** Map scale of the pre-drawn city image, pixels per metre. */
const MAP_SCALE = 0.75;

export interface MinimapFrame {
  heroX: number;
  heroZ: number;
  heroYaw: number;
  /** Camera yaw: the map turns so "up" is where the camera looks. */
  cameraYaw: number;
  crime: { x: number; z: number } | null;
  enemies: ReadonlyArray<{ x: number; z: number }>;
  modeColor: string;
}

/**
 * Round comic-framed minimap: the city's blocks and roads drawn once into an image, then
 * turned and cropped around the hero every frame. Hero arrow, crime marker (pinned to the rim
 * when far) and nearby enemies on top.
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map: HTMLCanvasElement;
  private readonly half: number;
  private pulse = 0;

  constructor(
    city: CityData,
    private readonly size = 168,
    /** Metres across the visible circle. */
    private readonly span = 300,
  ) {
    this.half = city.halfSize;
    this.map = document.createElement('canvas');
    const px = Math.ceil(city.halfSize * 2 * MAP_SCALE);
    this.map.width = px;
    this.map.height = px;
    const m = this.map.getContext('2d');
    if (!m) throw new Error('2D canvas unavailable');
    m.fillStyle = '#2A1838';
    m.fillRect(0, 0, px, px);
    const toPx = (v: number) => (v + city.halfSize) * MAP_SCALE;
    m.fillStyle = '#6E5A8C';
    for (const r of city.roads) m.fillRect(toPx(r.minX), toPx(r.minZ), (r.maxX - r.minX) * MAP_SCALE, (r.maxZ - r.minZ) * MAP_SCALE);
    for (const b of city.buildings) {
      if (b.baseY > 0) continue;
      const tall = Math.min(b.topY / 200, 1);
      m.fillStyle = `rgb(${Math.round(70 + 60 * tall)}, ${Math.round(42 + 30 * tall)}, ${Math.round(92 + 50 * tall)})`;
      m.fillRect(toPx(b.x - b.width / 2), toPx(b.z - b.depth / 2), b.width * MAP_SCALE, b.depth * MAP_SCALE);
    }

    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    ctx.scale(dpr, dpr);
  }

  draw(f: MinimapFrame, dt: number): void {
    const ctx = this.ctx;
    const s = this.size;
    const r = s / 2;
    const k = s / this.span; // screen px per metre
    this.pulse += dt;
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    ctx.beginPath();
    ctx.arc(r, r, r - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1A0F24';
    ctx.fillRect(0, 0, s, s);

    // City, turned so the camera's forward is up.
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(f.cameraYaw);
    const scale = k / MAP_SCALE;
    ctx.scale(scale, scale);
    ctx.drawImage(this.map, -(f.heroX + this.half) * MAP_SCALE, -(f.heroZ + this.half) * MAP_SCALE);
    ctx.restore();

    const toScreen = (x: number, z: number): [number, number] => {
      const dx = (x - f.heroX) * k;
      const dz = (z - f.heroZ) * k;
      const c = Math.cos(f.cameraYaw);
      const sn = Math.sin(f.cameraYaw);
      return [r + dx * c - dz * sn, r + dx * sn + dz * c];
    };

    for (const e of f.enemies) {
      const [x, y] = toScreen(e.x, e.z);
      if (Math.hypot(x - r, y - r) > r - 6) continue;
      ctx.fillStyle = '#FF3B6B';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (f.crime) {
      let [x, y] = toScreen(f.crime.x, f.crime.z);
      const dx = x - r;
      const dy = y - r;
      const d = Math.hypot(dx, dy);
      const rim = r - 12;
      const pinned = d > rim;
      if (pinned) {
        x = r + (dx / d) * rim;
        y = r + (dy / d) * rim;
      }
      const grow = 1 + 0.25 * Math.sin(this.pulse * 6);
      ctx.save();
      ctx.translate(x, y);
      if (pinned) ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
      ctx.fillStyle = '#FF4A2E';
      ctx.strokeStyle = '#140A1C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (pinned) {
        // Arrow on the rim pointing at the crime.
        ctx.moveTo(0, -8 * grow);
        ctx.lineTo(6 * grow, 5);
        ctx.lineTo(-6 * grow, 5);
      } else {
        ctx.moveTo(0, -7 * grow);
        ctx.lineTo(7 * grow, 0);
        ctx.lineTo(0, 7 * grow);
        ctx.lineTo(-7 * grow, 0);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Hero arrow (its facing relative to the camera).
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(f.cameraYaw - f.heroYaw);
    ctx.fillStyle = f.modeColor;
    ctx.strokeStyle = '#140A1C';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(7, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
