import { CanvasTexture, LinearMipmapLinearFilter } from 'three';

/** Cell layout of the sign atlas: tall cells for vertical blade signs. */
export const SIGN_ATLAS = { columns: 8, rows: 2 };
/** Cell layout of the billboard atlas: wide cells for horizontal brand names. */
export const BILLBOARD_ATLAS = { columns: 2, rows: 8 };

const SIZE = 1024;
const FONT = '"Arial Black", Impact, "DejaVu Sans", sans-serif';

/**
 * White brand names on black, used as glow masks by the sign and billboard shaders (red
 * channel). Fictional brands only (BRIEF.md §2.8); names come from the language file.
 */
export function createBrandAtlas(names: string[], layout: { columns: number; rows: number }, vertical: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const cellW = SIZE / layout.columns;
    const cellH = SIZE / layout.rows;
    names.forEach((name, i) => {
      if (i >= layout.columns * layout.rows) return;
      const col = i % layout.columns;
      // Row 0 of the layout is the bottom of the texture (UV origin), the canvas starts at the top.
      const row = layout.rows - 1 - Math.floor(i / layout.columns);
      ctx.save();
      ctx.translate(col * cellW + cellW / 2, row * cellH + cellH / 2);
      if (vertical) ctx.rotate(-Math.PI / 2);
      const boxW = (vertical ? cellH : cellW) * 0.86;
      const boxH = (vertical ? cellW : cellH) * 0.62;
      let fontSize = boxH;
      ctx.font = `900 ${fontSize}px ${FONT}`;
      const width = ctx.measureText(name).width;
      if (width > boxW) fontSize *= boxW / width;
      ctx.font = `900 ${fontSize}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = fontSize * 0.25;
      ctx.fillStyle = '#fff';
      ctx.fillText(name, 0, 0);
      ctx.restore();
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
}
