import React, { useEffect, useRef } from "react";
export const colors: Record<string, string[]> = {
  coral: ["#ff625e", "#ffaca0", "#ce394d"],
  blue: ["#57aafa", "#b6e7ff", "#3974db"],
  mint: ["#41d5b1", "#afffe0", "#219c89"],
  gold: ["#ffd34c", "#fff49b", "#e29728"],
  purple: ["#ac88ec", "#e1c3ff", "#8057ba"],
};
const ink = "#302639";
const sprite = [
  "     ########      ",
  "   ##llllllll##    ",
  "  #llhhhhhhllll#   ",
  " #llhlllllllllll#  ",
  " #llhlllllllllll#  ",
  " #lllll##lll##ll#  ",
  " #lllllwwlllwwll#  ",
  " #lllllwwlllwwll#  ",
  " #lllllbblllbbll#  ",
  "##mmlllbblllbbll###",
  "#ll#mmlllsslllmm#l#",
  "#lm#mmmmmmmmmmmm#m#",
  " ## #mmmmmmmmmm# # ",
  "     ##########    ",
  "     #bb#  #bb#    ",
  "    #####  #####   ",
];
export function paintSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  flip = false,
  step = 0,
) {
  const [l, h, m] = colors[color] || colors.coral,
    pal: Record<string, string> = {
      "#": ink,
      l,
      h,
      m,
      w: "#fff9ed",
      b: "#322b3a",
      s: "#a84652",
    };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(flip ? -scale : scale, scale);
  if (flip) ctx.translate(-19, 0);
  sprite.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const f = pal[line[col]];
      if (f) {
        ctx.fillStyle = f;
        ctx.fillRect(
          col,
          row + (row >= 14 && (col < 10 ? step > 0 : step < 0) ? -1 : 0),
          1,
          1,
        );
      }
    }
  });
  ctx.restore();
}
export function Avatar({
  color = "coral",
  size = 45,
}: {
  color?: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.clearRect(0, 0, 20, 18);
    paintSprite(c, 0, 1, 1, color);
  }, [color]);
  return (
    <canvas
      aria-hidden="true"
      ref={ref}
      width="20"
      height="18"
      style={{ width: size, imageRendering: "pixelated" }}
    />
  );
}
const glyphs: Record<string, string[]> = {
  F: ["11111", "11000", "11000", "11110", "11000", "11000", "11000"],
  A: ["01110", "11011", "11011", "11111", "11011", "11011", "11011"],
  L: ["11000", "11000", "11000", "11000", "11000", "11000", "11111"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  N: ["11001", "11101", "11101", "11011", "11011", "11001", "11001"],
  G: ["01111", "11000", "11000", "11011", "11001", "11001", "01111"],
  O: ["01110", "11011", "11011", "11011", "11011", "11011", "01110"],
  R: ["11110", "11011", "11011", "11110", "11100", "11010", "11011"],
};
export function TitleArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.clearRect(0, 0, 260, 123);
    const draw = (s: string, y: number, color: string) => {
      let x = 4;
      const blocks: number[][] = [];
      for (const ch of s) {
        const g = glyphs[ch];
        g.forEach((line, r) =>
          [...line].forEach((v, k) => {
            if (v === "1") blocks.push([x + k * 6, y + r * 6]);
          }),
        );
        x += (g[0].length + 1) * 6;
      }
      c.fillStyle = ink;
      for (const [a, b] of blocks) c.fillRect(a - 2, b - 2, 11, 14);
      c.fillStyle = color;
      for (const [a, b] of blocks) c.fillRect(a, b, 6, 6);
    };
    draw("FALLING", 5, "#fffaf0");
    draw("FLOOR", 60, "#ffdf59");
  }, []);
  return (
    <h1 aria-label="Falling Floor">
      <canvas ref={ref} width="245" height="111" aria-hidden="true" />
    </h1>
  );
}
function poly(
  c: CanvasRenderingContext2D,
  points: number[][],
  fill: string,
  stroke?: string,
) {
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1.5;
    c.stroke();
  }
}
function iso(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  d: number,
  colors: string[],
  crack = false,
) {
  const [top, left, right] = colors;
  poly(
    c,
    [
      [x - w, y],
      [x, y + h],
      [x, y + h + d],
      [x - w, y + d],
    ],
    left,
    ink,
  );
  poly(
    c,
    [
      [x, y + h],
      [x + w, y],
      [x + w, y + d],
      [x, y + h + d],
    ],
    right,
    ink,
  );
  poly(
    c,
    [
      [x, y - h],
      [x + w, y],
      [x, y + h],
      [x - w, y],
    ],
    top,
    ink,
  );
  c.strokeStyle = "rgba(255,255,255,.62)";
  c.beginPath();
  c.moveTo(x - w + 4, y);
  c.lineTo(x, y - h + 2);
  c.lineTo(x + w - 5, y);
  c.stroke();
  c.fillStyle = "rgba(255,255,255,.3)";
  c.fillRect(x - w + 4, y + 5, 2, 2);
  if (crack) {
    c.strokeStyle = "#80434c";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - w * 0.52, y - h * 0.45);
    c.lineTo(x - 2, y + 1);
    c.lineTo(x + 4, y - 1);
    c.lineTo(x + 6, y + 4);
    c.lineTo(x + 12, y + 5);
    c.stroke();
  }
}
function star(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  col: string,
) {
  c.fillStyle = col;
  c.fillRect(x - n, y - 1, n * 2 + 1, 3);
  c.fillRect(x - 1, y - n, 3, n * 2 + 1);
  if (n > 5) c.fillRect(x - 3, y - 3, 7, 7);
}
export function HeroArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.clearRect(0, 0, 400, 235);
    const blue = ["#9bdafa", "#78a8da", "#5e7cad"],
      lav = ["#bbb3ef", "#9788c7", "#776b9f"],
      yellow = ["#ffd974", "#f4ac5e", "#c3785a"],
      red = ["#ff9c97", "#e97883", "#be607d"];
    const cloud = (x: number, y: number, s: number) => {
      c.save();
      c.translate(x, y);
      c.scale(s, s);
      c.fillStyle = "#fff4f4";
      for (const [a, b, w, h] of [
        [0, 8, 42, 4],
        [5, 5, 31, 4],
        [10, 2, 10, 5],
        [19, 0, 9, 7],
        [27, 4, 8, 4],
      ])
        c.fillRect(a, b, w, h);
      c.restore();
    };
    cloud(292, 15, 0.95);
    cloud(42, 51, 0.6);
    cloud(347, 98, 0.8);
    cloud(109, 12, 0.52);
    for (const [x, y, n] of [
      [45, 96, 4],
      [147, 33, 5],
      [249, 28, 3],
      [355, 64, 5],
      [265, 192, 4],
      [71, 200, 4],
      [31, 144, 3],
    ])
      star(c, x, y, n, "#fff7db");
    const tiles = [
      [-2, -1],
      [-1, -2],
      [0, -2],
      [1, -2],
      [-2, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
      [2, -1],
      [-2, 1],
      [-1, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
      [0, 2],
    ];
    for (const [i, j] of tiles.sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
      const x = 195 + (i - j) * 26,
        y = 123 + (i + j) * 13;
      const broken = (i === 1 && j === 1) || (i === 0 && j === 1);
      iso(
        c,
        x,
        y + (broken ? 4 : 0),
        25,
        12,
        13,
        broken
          ? yellow
          : i === -1 && j === 0
            ? red
            : (i + j) % 4 === 0
              ? lav
              : blue,
        broken || (i === -1 && j === 0),
      );
    }
    iso(c, 70, 160, 20, 10, 11, red, true);
    iso(c, 127, 193, 16, 8, 10, lav);
    iso(c, 256, 181, 21, 10, 14, yellow, true);
    iso(c, 319, 142, 17, 8, 10, blue);
    for (const [x, y, w] of [
      [88, 174, 4],
      [109, 177, 3],
      [140, 210, 4],
      [248, 213, 4],
      [276, 201, 3],
      [302, 169, 3],
      [62, 181, 3],
    ])
      iso(c, x, y, w, w / 2, w, lav);
    const shadow = (x: number, y: number, w: number) => {
      c.fillStyle = "#63608780";
      c.fillRect(x - w, y, w * 2, 3);
      c.fillRect(x - w + 4, y - 2, w * 2 - 8, 6);
    };
    shadow(145, 125, 14);
    shadow(227, 103, 13);
    shadow(189, 148, 11);
    paintSprite(c, 122, 76, 2.5, "coral");
    paintSprite(c, 206, 43, 2.1, "mint", true);
    paintSprite(c, 174, 111, 1.9, "gold", true);
    c.fillStyle = "#fff8ef";
    for (const [x, y] of [
      [234, 87],
      [238, 82],
      [216, 90],
    ])
      c.fillRect(x, y, 2, 5);
    star(c, 115, 80, 5, "#fff3ad");
    star(c, 258, 46, 4, "#fff7de");
  }, []);
  return (
    <canvas
      className="hero-art"
      ref={ref}
      width="400"
      height="235"
      aria-label="무너지는 공중 발판에서 뛰어다니는 세 픽셀 캐릭터"
    />
  );
}
export function TileArt({ stage }: { stage: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!.getContext("2d")!;
    c.clearRect(0, 0, 56, 48);
    const pal = [
      ["#a4dbff", "#84b6ee", "#668bc8"],
      ["#ffda63", "#f5b746", "#c28b3c"],
      ["#ff8c83", "#e66b75", "#b5566c"],
    ][stage];
    iso(c, 27, 19, 20, 10, 10, pal, stage > 0);
    if (stage === 2) {
      c.clearRect(25, 23, 2, 18);
      c.fillStyle = ink;
      c.fillRect(22, 38, 3, 2);
      c.fillRect(36, 34, 3, 3);
    }
  }, [stage]);
  return (
    <canvas
      ref={ref}
      width="56"
      height="48"
      aria-hidden="true"
      className="tile-art"
    />
  );
}
