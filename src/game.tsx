import React, { useEffect, useRef } from "react";
import type { Command, Room } from "./types";
import { drawRing } from "./ring";
import { paintSprite } from "./art";
export function Arena({
  room,
  id,
  command,
}: {
  room: Room;
  id: string;
  command: Command;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(room),
    stick = useRef<HTMLDivElement>(null),
    knob = useRef<HTMLSpanElement>(null),
    dir = useRef([0, 0]);
  latest.current = room;
  useEffect(() => {
    let disposed = false,
      game: import("phaser").Game | undefined;
    import("phaser").then(({ default: P }) => {
      if (disposed || !host.current) return;
      class Board extends P.Scene {
        board!: Phaser.GameObjects.Graphics;

        sprites = new Map<
          string,
          { sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }
        >();
        create() {
          this.board = this.add.graphics();
          for (const p of latest.current.players) {
            const tex = this.textures.createCanvas(p.color, 20, 18)!;
            paintSprite(tex.context, 0, 1, 1, p.color);
            tex.refresh();
            const sprite = this.add.image(0, 0, p.color).setOrigin(0.5, 0.75);
            const label = this.add
              .text(
                0,
                0,
                (p.id === id ? "▼ " : "") +
                  "P" +
                  (latest.current.players.indexOf(p) + 1) +
                  " " +
                  p.name,
                {
                  fontFamily: "sans-serif",
                  fontSize: "14px",
                  fontStyle: "bold",
                  color: "#ffffff",
                  stroke: "#282338",
                  strokeThickness: 4,
                },
              )
              .setOrigin(0.5, 1);
            this.sprites.set(p.id, { sprite, label });
          }
        }
        update(time: number, delta: number) {
          const r = latest.current,
            g = this.board,
            n = r.size,
            w = 714 / n;
          g.clear();
          g.fillStyle(0x272639);
          g.fillRect(0, 0, 714, 714);
          const ring = r.game === "push-out";
          if (ring) drawRing(g, r, w);
          r.tiles.forEach((v, i) => {
            const x = (i % n) * w,
              y = Math.floor(i / n) * w;
            if (v === -1) return;
            const danger = v > 0 && v - r.now < r.settings.collapseMs * 0.4,
              shrink =
                r.ringWarning > 0 &&
                Math.min(
                  i % n,
                  Math.floor(i / n),
                  n - 1 - (i % n),
                  n - 1 - Math.floor(i / n),
                ) === r.ring;
            const warn = danger || shrink;
            const color = warn
              ? Math.floor(time / 120) % 2
                ? 0xff8e84
                : 0xf16b72
              : v > 0
                ? 0xffd567
                : 0x9bcff1;
            g.fillStyle(0x536884);
            g.fillRect(x + 1, y + 1, w - 2, w - 2);
            g.fillStyle(color);
            g.fillRect(x + 1, y + 1, w - 2, w - 5);
            g.fillStyle(0xffffff, 0.4);
            g.fillRect(x + 3, y + 3, w - 7, 1.5);
            if (v > 0 || warn) {
              g.lineStyle(2, 0x81565c);
              g.beginPath();
              g.moveTo(x + w * 0.3, y + 2);
              g.lineTo(x + w * 0.55, y + w * 0.4);
              g.lineTo(x + w * 0.42, y + w * 0.54);
              g.lineTo(x + w * 0.68, y + w * 0.77);
              g.strokePath();
            }
          });
          for (const p of r.players) {
            const a = this.sprites.get(p.id);
            if (!a) continue;
            const age = p.dead === null ? 0 : r.now - p.dead,
              visible = p.alive || age < 420;
            const fraction = p.alive ? 1 : Math.max(0, 1 - age / 420),
              jump =
                p.jumpUntil > r.now
                  ? Math.sin(
                      Math.min(1, (p.jumpUntil - r.now) / 400) * Math.PI,
                    ) *
                    w *
                    0.6
                  : 0;
            const targetX = (ring ? 357 : 0) + p.x * w,
              targetY = (ring ? 357 : 0) + p.y * w - jump,
              frac = a.sprite.x === 0 ? 1 : Math.min(1, delta / 60);
            a.sprite
              .setPosition(
                P.Math.Linear(a.sprite.x, targetX, frac),
                P.Math.Linear(a.sprite.y, targetY, frac),
              )
              .setDisplaySize(w * 1.02 * fraction, w * 0.94 * fraction)
              .setFlipX(p.fx < -0.1)
              .setVisible(visible)
              .setAlpha(1);
            if (ring && p.alive) {
              if (p.dashUntil > r.now) {
                g.lineStyle(7, 0xffed9e, 0.8);
                g.lineBetween(
                  targetX,
                  targetY,
                  targetX - p.fx * w * 0.9,
                  targetY - p.fy * w * 0.9,
                );
              }
              if (p.guardUntil > r.now) {
                g.fillStyle(0x8df1ff, 0.26);
                g.fillCircle(targetX, targetY, w * 0.65);
                g.lineStyle(3, 0xb7faff);
                g.strokeCircle(targetX, targetY, w * 0.65);
              }
              const age = r.now - p.lastPush;
              if (p.lastPush && age < 260) {
                g.lineStyle(
                  4,
                  p.lastHit === p.lastPush ? 0xffdc52 : 0xfff5d4,
                  1 - age / 260,
                );
                g.beginPath();
                const angle = Math.atan2(p.fy, p.fx);
                g.arc(
                  targetX,
                  targetY,
                  w * (0.55 + age / 260),
                  angle - 0.96,
                  angle + 0.96,
                );
                g.strokePath();
              }
              g.fillStyle(0xffffff);
              g.fillCircle(
                targetX + p.fx * w * 0.43,
                targetY + p.fy * w * 0.43,
                2.6,
              );
            }
            a.label
              .setVisible(p.alive)
              .setPosition(a.sprite.x, a.sprite.y - w * 0.7);
          }
        }
      }
      game = new P.Game({
        type: P.CANVAS,
        width: 714,
        height: 714,
        parent: host.current,
        backgroundColor: "#272639",
        pixelArt: true,
        audio: { noAudio: true },
        scene: Board,
        banner: false,
        scale: { mode: P.Scale.FIT, autoCenter: P.Scale.CENTER_BOTH },
      });
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [id]);
  useEffect(() => {
    const keys = new Set<string>();
    let last = "";
    const send = (force = false) => {
      const x =
          dir.current[0] +
          Number(keys.has("KeyD") || keys.has("ArrowRight")) -
          Number(keys.has("KeyA") || keys.has("ArrowLeft")),
        y =
          dir.current[1] +
          Number(keys.has("KeyS") || keys.has("ArrowDown")) -
          Number(keys.has("KeyW") || keys.has("ArrowUp"));
      const key = x + "," + y;
      if (force || key !== last) {
        command("move", { x, y });
        last = key;
      }
    };
    const key = (e: KeyboardEvent, down: boolean) => {
      if (
        (down && document.querySelector("dialog[open]")) ||
        !(
          e.code.startsWith("Arrow") ||
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "Space",
            "ShiftLeft",
            "ShiftRight",
            "KeyE",
          ].includes(e.code)
        )
      )
        return;
      e.preventDefault();
      if (down) keys.add(e.code);
      else keys.delete(e.code);
      send();
      if (down && !e.repeat) {
        if (e.code === "Space")
          command(latest.current.game === "push-out" ? "push" : "jump");
        if (e.code.startsWith("Shift")) command("dash");
        if (e.code === "KeyE" && latest.current.game === "push-out")
          command("guard");
      }
    };
    const d = (e: KeyboardEvent) => key(e, true),
      u = (e: KeyboardEvent) => key(e, false),
      clear = () => {
        keys.clear();
        dir.current = [0, 0];
        send(true);
      };
    const hidden = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    window.addEventListener("blur", clear);
    const timer = setInterval(() => send(true), 100);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [command]);
  const p = room.players.find((p) => p.id === id)!;
  const pointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = stick.current!;
    if (e.type === "pointerdown") el.setPointerCapture(e.pointerId);
    if (!el.hasPointerCapture(e.pointerId)) return;
    const box = el.getBoundingClientRect(),
      x = (e.clientX - box.left - box.width / 2) / 25,
      y = (e.clientY - box.top - box.height / 2) / 25,
      l = Math.max(1, Math.hypot(x, y));
    dir.current = [x / l, y / l];
    knob.current!.style.transform =
      "translate(" + (x / l) * 22 + "px," + (y / l) * 22 + "px)";
  };
  const reset = () => {
    dir.current = [0, 0];
    knob.current!.style.transform = "";
    command("move", { x: 0, y: 0 });
  };
  const cd = (t: number) =>
    t > room.now ? ((t - room.now) / 1000).toFixed(1) + "초" : "준비";
  return (
    <>
      <div className="arena-wrap">
        <div
          className="board"
          ref={host}
          role="img"
          aria-label="실시간 생존 경기장"
        />
        {room.phase === "countdown" && (
          <div className="countdown">
            <small>라운드 {room.round}</small>
            <strong>
              {Math.max(1, Math.ceil((room.start - room.now) / 1000))}
            </strong>
          </div>
        )}
      </div>
      {room.phase === "playing" && !p.alive && (
        <div className="spectate">
          관전 중 · 누적 점수{" "}
          <p>
            {room.players.map((q) => q.name + " " + q.score + "점").join(" / ")}
          </p>
        </div>
      )}
      <div className="controls">
        <div
          role="group"
          aria-label="가상 조이스틱"
          className="joystick"
          ref={stick}
          onPointerDown={pointer}
          onPointerMove={pointer}
          onPointerUp={reset}
          onPointerCancel={reset}
          onLostPointerCapture={reset}
        >
          <span ref={knob} />
        </div>
        {(
          (room.game === "push-out"
            ? [
                ["push", "SPACE", "밀치기", p.pushReady],
                ["dash", "SHIFT", "대시", p.dashReady],
                ...(room.settings.defense
                  ? [["guard", "E", "방어", p.guardReady]]
                  : []),
              ]
            : room.settings.mobility
              ? [
                  ["jump", "SPACE", "점프", p.jumpReady],
                  ["dash", "SHIFT", "대시", p.dashReady],
                ]
              : []) as [string, string, string, number][]
        ).map(([type, key, name, ready]) => (
          <button
            key={type}
            disabled={
              room.phase !== "playing" ||
              !p.alive ||
              ready > room.now ||
              p.jumpUntil > room.now ||
              p.guardUntil > room.now ||
              p.dashUntil > room.now
            }
            onClick={() => command(type)}
          >
            <kbd>{key}</kbd> {name} <small>{cd(ready)}</small>
          </button>
        ))}
      </div>
    </>
  );
}
