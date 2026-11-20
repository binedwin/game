import type Phaser from "phaser";
import type { Room } from "./types";
export function drawRing(
  g: Phaser.GameObjects.Graphics,
  r: Room,
  scale: number,
) {
  const radius = r.radius * scale,
    c = 357;
  g.fillStyle(0x403550);
  g.fillCircle(c, c + 8, radius + 5);
  g.fillStyle(0x675391);
  g.fillCircle(c, c, radius + 4);
  g.fillStyle(0xc4b9e7);
  g.fillCircle(c, c, radius);
  g.lineStyle(6, r.ringWarning ? 0xe45b6c : 0xfbf4e6);
  g.strokeCircle(c, c, radius - 4);
  g.lineStyle(1, 0x8c7fb1, 0.7);
  for (let band = 1; band < r.radius; band += 2)
    g.strokeCircle(c, c, band * scale);
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12,
      dx = Math.cos(a),
      dy = Math.sin(a);
    g.lineStyle(2, 0x8a729f);
    g.lineBetween(
      c + dx * (radius - 15),
      c + dy * (radius - 15),
      c + dx * (radius - 8),
      c + dy * (radius - 8),
    );
  }
  g.fillStyle(0xb2a3d2);
  g.fillPoints(
    [
      { x: c, y: c - 18 },
      { x: c + 18, y: c },
      { x: c, y: c + 18 },
      { x: c - 18, y: c },
    ],
    true,
  );
  if (r.ringWarning && r.nextRadius) {
    g.lineStyle(4, 0xdc485d);
    for (let i = 0; i < 48; i++) {
      g.beginPath();
      g.arc(
        c,
        c,
        r.nextRadius * scale,
        (i * Math.PI) / 24,
        ((i + 0.6) * Math.PI) / 24,
      );
      g.strokePath();
    }
  }
}
