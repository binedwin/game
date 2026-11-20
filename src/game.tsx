import React, { useEffect, useRef } from "react";
import type { Command, Room } from "./types";
import { itemNames } from "./types";
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
        actors!: Phaser.GameObjects.Group;
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
              .text(0, 0, p.id === id ? "▼ 나" : p.name, {
                fontFamily: "sans-serif",
                fontSize: "14px",
                fontStyle: "bold",
                color: "#ffffff",
                stroke: "#282338",
                strokeThickness: 4,
              })
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
          r.tiles.forEach((v, i) => {
            const x = (i % n) * w,
              y = Math.floor(i / n) * w;
            if (v === -1) return;
            const danger =
                v > 0 &&
                v - r.now < (r.durations?.[i] ?? r.settings.collapseMs) * 0.4,
              shrink =
                r.ringWarning > 0 &&
                Math.min(
                  i % n,
                  Math.floor(i / n),
                  n - 1 - (i % n),
                  n - 1 - Math.floor(i / n),
                ) === r.ring;
            const warn = danger || shrink || r.fuses[i];
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
            if (r.specials[i]) {
              const hue: Record<string, number> = {
                speed: 0x359966,
                bomb: 0xe5685c,
                ice: 0x38accc,
                armor: 0x6d74b4,
                warp: 0x9367bf,
                repair: 0x4c9b93,
              };
              g.fillStyle(hue[r.specials[i]]);
              g.fillTriangle(
                x + w * 0.5,
                y + w * 0.22,
                x + w * 0.72,
                y + w * 0.51,
                x + w * 0.28,
                y + w * 0.51,
              );
              g.fillTriangle(
                x + w * 0.5,
                y + w * 0.74,
                x + w * 0.72,
                y + w * 0.51,
                x + w * 0.28,
                y + w * 0.51,
              );
            }
            if (r.loot[i]) {
              g.fillStyle(0x51304f);
              g.fillRect(x + w * 0.25, y + w * 0.23, w * 0.5, w * 0.48);
              g.fillStyle(0xfecc41);
              g.fillRect(x + w * 0.29, y + w * 0.27, w * 0.42, w * 0.4);
              g.fillStyle(0xfff5a0);
              g.fillRect(x + w * 0.46, y + w * 0.25, w * 0.08, w * 0.43);
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
            const targetX = p.x * w,
              targetY = p.y * w - jump,
              frac = a.sprite.x === 0 ? 1 : Math.min(1, delta / 60);
            a.sprite
              .setPosition(
                P.Math.Linear(a.sprite.x, targetX, frac),
                P.Math.Linear(a.sprite.y, targetY, frac),
              )
              .setDisplaySize(w * 1.02 * fraction, w * 0.94 * fraction)
              .setFlipX(p.fx < -0.1)
              .setVisible(visible)
              .setAlpha(p.ghost > r.now ? 0.6 : 1);
            if (
              p.shield ||
              p.frozen > r.now ||
              r.effects.some((e) => e.target === p.id)
            ) {
              g.lineStyle(
                3,
                p.shield ? 0xffdd55 : p.frozen > r.now ? 0xe9ffff : 0xdc3356,
              );
              g.strokeCircle(targetX, targetY, w * 0.6);
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
        document.querySelector("dialog[open]") ||
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
        if (e.code === "Space") command("jump");
        if (e.code.startsWith("Shift")) command("dash");
        if (e.code === "KeyE") command("item");
      }
    };
    const d = (e: KeyboardEvent) => key(e, true),
      u = (e: KeyboardEvent) => key(e, false),
      clear = () => {
        keys.clear();
        dir.current = [0, 0];
        send(true);
      };
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    window.addEventListener("blur", clear);
    const timer = setInterval(() => send(true), 200);
    return () => {
      clearInterval(timer);
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
    command("move", { x: x / l, y: y / l });
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
        <p className="spectate">관전 중 · 남은 플레이어의 경기를 지켜보세요.</p>
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
        {room.settings.mobility && (
          <>
            <button
              disabled={!p.alive || p.jumpReady > room.now}
              onClick={() => command("jump")}
            >
              <kbd>SPACE</kbd> 점프 <small>{cd(p.jumpReady)}</small>
            </button>
            <button
              disabled={!p.alive || p.dashReady > room.now}
              onClick={() => command("dash")}
            >
              <kbd>SHIFT</kbd> 대시 <small>{cd(p.dashReady)}</small>
            </button>
          </>
        )}
        {room.settings.items && (
          <button
            disabled={!p.item || !p.alive}
            onClick={() => command("item")}
          >
            <kbd>E</kbd> {itemNames[p.item ?? ""] || "아이템 없음"}
          </button>
        )}
      </div>
    </>
  );
}
