import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { Avatar, colors, HeroArt, TitleArt, TileArt } from "./art";
import { Icon } from "./icons";
import { Arena } from "./game";
import type { Command, Room, Settings } from "./types";
import "./style.css";

const socket = io({ autoConnect: false });
const command: Command = (type, body = {}) => {
  if (socket.connected) socket.emit("command", { type, ...body });
};
const colorNames: Record<string, string> = {
  coral: "코랄",
  blue: "블루",
  mint: "민트",
  gold: "골드",
  purple: "퍼플",
};
const maps: Record<string, string> = {
  square: "기본 경기장",
  cross: "십자가 경기장",
  donut: "도넛 경기장",
  island: "섬 경기장",
  random: "무작위",
};
const names = ["안전 발판", "균열 발판", "위험 발판"];
let audio: AudioContext | undefined;
function beep(freq: number, length = 0.09) {
  if (localStorage.getItem("ff-muted") === "yes") return;
  if (!audio || audio.state !== "running") return;
  const osc = audio.createOscillator(),
    amp = audio.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.027, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + length);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + length);
}
function unlock() {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
  } catch {}
}
function Guide() {
  return (
    <section className="guide">
      <div className="guide-head">
        <h2>
          <Icon name="layers" size={23} />
          발판 가이드
        </h2>
        <span>TILE GUIDE</span>
      </div>
      <div className="guide-grid">
        {names.map((n, i) => (
          <div className={"guide-card stage" + i} key={n}>
            <TileArt stage={i} />
            <div>
              <strong>{n}</strong>
              <p>
                {
                  [
                    "안심하고 밟을 수 있어요.",
                    "밟는 순간 무너지기 시작해요.",
                    "곧 사라져요! 다음 칸으로 이동하세요.",
                  ][i]
                }
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function Swatches({
  color,
  onChange,
  used = [],
}: {
  color: string;
  onChange: (c: string) => void;
  used?: string[];
}) {
  return (
    <div className="swatches" aria-label="캐릭터 색상">
      {Object.entries(colors).map(([c, v]) => (
        <button
          type="button"
          key={c}
          title={colorNames[c]}
          aria-label={colorNames[c] + " 캐릭터"}
          aria-pressed={color === c}
          disabled={used.includes(c)}
          className={color === c ? "chosen" : ""}
          style={{ background: v[0] }}
          onClick={() => onChange(c)}
        >
          {color === c ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}
function Time({ ms }: { ms: number }) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return (
    <>
      {String(Math.floor(t / 60)).padStart(2, "0")}:
      {String(t % 60).padStart(2, "0")}
    </>
  );
}
function SettingsPanel({ r, owner }: { r: Room; owner: boolean }) {
  const select = (
    key: keyof Settings,
    title: string,
    options: Record<string, string>,
  ) => (
    <label className="setting">
      {title}
      <select
        aria-label={title}
        disabled={!owner}
        value={String(r.settings[key])}
        onChange={(e) =>
          command("settings", {
            value: {
              [key]: ["rounds", "maxPlayers", "collapseMs"].includes(key)
                ? Number(e.target.value)
                : e.target.value,
            },
          })
        }
      >
        {Object.entries(options).map(([v, n]) => (
          <option value={v} key={v}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="settings">
      <h3>게임 설정</h3>
      <div className="setting-grid">
        {select("maxPlayers", "최대 인원", {
          2: "2명",
          3: "3명",
          4: "4명",
          5: "5명",
        })}
        {select("rounds", "라운드", { 3: "3판", 5: "5판", 10: "10판" })}
        {select("map", "경기장", maps)}
        {select("difficulty", "난이도", {
          easy: "쉬움",
          normal: "보통",
          hard: "어려움",
        })}
        {select(
          "collapseMs",
          "발판 붕괴 시간",
          Object.fromEntries(
            Array.from({ length: 16 }, (_, i) => [
              500 + i * 100,
              ((500 + i * 100) / 1000).toFixed(1) + "초",
            ]),
          ),
        )}
      </div>
      <div className="toggles">
        {(
          [
            ["mobility", "점프 · 대시"],
            ["items", "아이템"],
            ["special", "특수 발판"],
          ] as const
        ).map(([k, l]) => (
          <label key={k}>
            <input
              type="checkbox"
              checked={r.settings[k]}
              disabled={!owner}
              onChange={(e) =>
                command("settings", { value: { [k]: e.target.checked } })
              }
            />
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}
function App() {
  const [r, setRoom] = useState<Room | null>(null),
    [id, setId] = useState(""),
    [online, setOnline] = useState(false),
    [name, setName] = useState(() => localStorage.getItem("ff-name") || ""),
    [color, setColor] = useState(
      () => localStorage.getItem("ff-color") || "coral",
    ),
    [tab, setTab] = useState("create"),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [muted, setMuted] = useState(localStorage.getItem("ff-muted") === "yes"),
    [dialog, setDialog] = useState(""),
    [copy, setCopy] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null),
    nick = useRef<HTMLInputElement>(null),
    sound = useRef(""),
    lastAlive = useRef(true);
  useEffect(() => {
    const connected = () => {
      setOnline(true);
      const cached = sessionStorage.getItem("ff-session");
      if (cached) {
        try {
          socket.emit("resume", JSON.parse(cached));
        } catch {
          sessionStorage.removeItem("ff-session");
        }
      }
    };
    const left = () => {
      sessionStorage.removeItem("ff-session");
      setRoom(null);
      setId("");
      setBusy(false);
      setDialog("");
    };
    socket
      .on("connect", connected)
      .on("disconnect", () => {
        setOnline(false);
        setBusy(false);
      })
      .on("state", (v: Room) => setRoom(v))
      .on("joined", (s) => {
        sessionStorage.setItem("ff-session", JSON.stringify(s));
        setId(s.id);
        setBusy(false);
        setError("");
        beep(440);
        window.scrollTo(0, 0);
      })
      .on("left", left)
      .on("expired", () => {
        left();
        setError("이전 방 연결이 종료됐어요. 다시 입장해 주세요.");
      })
      .on("notice", (m) => {
        setError(m);
        setBusy(false);
      });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!dialog) return;
    const el = dlg.current;
    el?.showModal();
    return () => el?.close();
  }, [dialog]);
  const me = r?.players.find((p) => p.id === id),
    owner = r?.host === id;
  const marker =
    r?.phase === "countdown"
      ? "count" + Math.ceil((r.start - r.now) / 1000)
      : (r?.phase ?? "");
  useEffect(() => {
    if (marker !== sound.current) {
      sound.current = marker;
      if (marker.startsWith("count")) beep(360);
      if (marker === "playing") beep(720, 0.2);
      if (marker === "result" || marker === "final") beep(880, 0.24);
    }
  }, [marker]);
  useEffect(() => {
    if (me?.alive === false && lastAlive.current && r?.phase === "playing")
      beep(125, 0.2);
    lastAlive.current = Boolean(me?.alive);
  }, [me?.alive, r?.phase]);
  function enter(mode: string) {
    unlock();
    if (!online) {
      setError("게임 서버에 연결 중이에요. 잠시 후 다시 시도해 주세요.");
      socket.connect();
      return;
    }
    if (mode === "join" && !/^\d{6}$/.test(code)) {
      setError("숫자 6자리 방 코드를 입력해 주세요.");
      return;
    }
    const alias =
      name.trim() || "플레이어" + Math.floor(100 + Math.random() * 900);
    setName(alias);
    localStorage.setItem("ff-name", alias);
    localStorage.setItem("ff-color", color);
    setBusy(true);
    setError("");
    socket.emit("enter", { mode, name: alias, color, code });
  }
  const onCopy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext)
        await navigator.clipboard.writeText(r!.code);
      else {
        const el = document.createElement("textarea");
        el.value = r!.code;
        document.body.append(el);
        el.select();
        const ok = document.execCommand("copy");
        el.remove();
        if (!ok) throw Error();
      }
      setCopy(true);
      setTimeout(() => setCopy(false), 1500);
    } catch {
      setError("아래의 방 코드를 선택해서 복사해 주세요.");
    }
  };
  const active = r && ["playing", "countdown"].includes(r.phase),
    final = r?.phase === "final";
  const finals = [...(r?.players || [])].sort(
    (a, b) => b.score - a.score || b.wins - a.wins,
  );
  return (
    <>
      <header>
        <div className="header-inner">
          <div className="brand">
            <span className="brand-game">
              <Icon name="pad" size={29} />
            </span>
            PIXEL<span>ARCADE</span>
          </div>
          <nav>
            <button
              title={muted ? "소리 켜기" : "소리 끄기"}
              aria-label={muted ? "소리 켜기" : "소리 끄기"}
              onClick={() => {
                unlock();
                localStorage.setItem("ff-muted", muted ? "no" : "yes");
                setMuted(!muted);
                if (muted) beep(600);
              }}
            >
              <Icon name={muted ? "mute" : "sound"} />
            </button>
            <span className="nav-divider" />
            <button onClick={() => setDialog("help")}>
              <Icon name="help" />
              <span>게임 방법</span>
            </button>
          </nav>
        </div>
      </header>
      <main>
        {!r ? (
          <>
            <section className="hero">
              <div className="hero-rail" />
              <div className="hero-copy">
                <span className="genre">
                  <span>✦</span> SURVIVAL ARCADE
                </span>
                <TitleArt />
                <p>바닥이 사라진다!</p>
                <div className="hero-meta">
                  <span>
                    <Icon name="users" size={15} /> 2–5인
                  </span>
                  <i />
                  실시간 생존 게임
                </div>
              </div>
              <HeroArt />
              <div className="hero-check" />
            </section>
            <section className="lobby panel">
              <div className="panel-head">
                <h2>
                  <span className="head-icon">
                    <Icon name="ticket" size={22} />
                  </span>
                  플레이 로비
                </h2>
                <span className={"online " + (online ? "" : "offline")}>
                  <i />
                  {online ? "서버 온라인" : "연결 중"}
                </span>
              </div>
              <div className="lobby-body">
                <div className="profile">
                  <div className="avatar-well">
                    <Avatar color={color} size={71} />
                  </div>
                  <div className="profile-fields">
                    <label htmlFor="name">닉네임</label>
                    <input
                      id="name"
                      ref={nick}
                      value={name}
                      maxLength={12}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="닉네임을 입력하세요"
                      autoComplete="off"
                    />
                    <Swatches color={color} onChange={setColor} />
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enter(tab);
                  }}
                  className="entry"
                >
                  <div className="entry-tabs">
                    {[
                      ["create", "방 만들기", "plus"],
                      ["join", "코드로 입장", "enter"],
                    ].map(([v, n, i]) => (
                      <button
                        type="button"
                        key={v}
                        className={tab === v ? "selected" : ""}
                        aria-pressed={tab === v}
                        onClick={() => {
                          setTab(v);
                          setError("");
                        }}
                      >
                        <Icon name={i} size={16} />
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="entry-action">
                    {tab === "join" && (
                      <input
                        aria-label="방 코드"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6자리 방 코드"
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    )}
                    <button className="primary" disabled={busy}>
                      <Icon
                        name={tab === "create" ? "pad" : "enter"}
                        size={21}
                      />
                      {tab === "create" ? "새로운 방 만들기" : "방 입장"}
                    </button>
                  </div>
                </form>
              </div>
              <div className="practice-row">
                <span>
                  <Icon name="pad" size={19} /> 혼자서 연습해 볼까요?
                </span>
                <button disabled={busy} onClick={() => enter("practice")}>
                  연습 모드 <Icon name="play" size={13} />
                </button>
              </div>
            </section>
            <Guide />
          </>
        ) : (
          <>
            <div className="room-top">
              <div className="room-breadcrumb">
                <span className="tiny-pixel" /> FALLING FLOOR
              </div>
              <button
                className="text-button"
                onClick={() => setDialog("leave")}
              >
                나가기 <Icon name="enter" size={15} />
              </button>
            </div>
            {r.phase === "lobby" && (
              <section className="panel room-panel">
                <div className="panel-head">
                  <h2>
                    <span className="head-icon">
                      <Icon name="users" />
                    </span>
                    대기실
                  </h2>
                  <span className="online">
                    <i />
                    참가 {r.players.length}/{r.settings.maxPlayers}
                  </span>
                </div>
                <div className="room-body">
                  <div className="invite">
                    <div>
                      <small>친구 초대 코드</small>
                      <b>{r.code}</b>
                    </div>
                    <button className="soft" onClick={onCopy}>
                      <Icon name="copy" />
                      {copy ? "복사 완료" : "코드 복사"}
                    </button>
                  </div>
                  <div className="room-columns">
                    <div>
                      <h3>참가자</h3>
                      {r.players.map((p) => (
                        <div key={p.id} className="member">
                          <Avatar color={p.color} />
                          <b>
                            {p.name}
                            {p.id === id ? " (나)" : ""}
                          </b>
                          <small>
                            {p.id === r.host
                              ? "방장"
                              : !p.connected
                                ? "재접속 중"
                                : p.ready
                                  ? "준비 완료"
                                  : "준비 중"}
                          </small>
                        </div>
                      ))}
                      {me && (
                        <Swatches
                          color={me.color}
                          used={r.players
                            .filter((p) => p.id !== id)
                            .map((p) => p.color)}
                          onChange={(value) => command("color", { value })}
                        />
                      )}
                    </div>
                    <SettingsPanel r={r} owner={owner} />
                  </div>
                  <button
                    className="primary full"
                    disabled={
                      owner &&
                      (r.players.length < 2 ||
                        r.players.some(
                          (p) => !p.connected || (p.id !== r.host && !p.ready),
                        ))
                    }
                    onClick={() => command(owner ? "start" : "ready")}
                  >
                    <Icon name="play" />
                    {owner
                      ? r.players.length < 2
                        ? "친구의 입장을 기다리는 중"
                        : "게임 시작"
                      : me?.ready
                        ? "준비 취소"
                        : "준비 완료"}
                  </button>
                </div>
              </section>
            )}
            {active && (
              <section className="play-area">
                <div className="hud">
                  <b>
                    {r.practice ? "연습" : "생존전"} · ROUND {r.round}/
                    {r.settings.rounds}
                  </b>
                  <span>
                    <Icon name="users" size={17} /> 생존{" "}
                    {r.players.filter((p) => p.alive).length}/{r.players.length}
                  </span>
                  <span>
                    <Icon name="clock" size={16} />
                    <Time ms={r.now - r.start} />
                  </span>
                </div>
                {r.ringWarning > 0 && (
                  <div className="ring-warning">
                    경고! 외곽 발판이 곧 무너져요.
                  </div>
                )}
                <Arena room={r} id={id} command={command} />
              </section>
            )}
            {(r.phase === "result" || final) && (
              <section className="panel results">
                <div className="result-title">
                  <Icon name="trophy" size={34} />
                  <small>
                    {final ? "MATCH RESULT" : "ROUND " + r.round + " RESULT"}
                  </small>
                  <h2>{final ? "최종 순위" : "라운드 결과"}</h2>
                  <Avatar
                    color={
                      final
                        ? finals[0].color
                        : r.players.find((p) => p.id === r.results[0]?.id)
                            ?.color
                    }
                    size={78}
                  />
                  <strong>
                    {(final
                      ? finals
                          .filter(
                            (p) =>
                              p.score === finals[0].score &&
                              p.wins === finals[0].wins,
                          )
                          .map((p) => p.name)
                      : r.results
                          .filter((a) => a.rank === 1)
                          .map(
                            (a) => r.players.find((p) => p.id === a.id)?.name,
                          )
                    ).join(" · ")}{" "}
                    우승!
                  </strong>
                </div>
                <div className="score-table">
                  <table>
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>플레이어</th>
                        <th>{final ? "1위 횟수" : "생존 시간"}</th>
                        <th>{final ? "마지막 판" : "획득 점수"}</th>
                        <th>누적 점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(final
                        ? finals.map((p) => ({
                            id: p.id,
                            rank:
                              finals.findIndex(
                                (q) => q.score === p.score && q.wins === p.wins,
                              ) + 1,
                            points:
                              r.results.find((v) => v.id === p.id)?.points || 0,
                            time: 0,
                          }))
                        : r.results
                      ).map((a) => {
                        const p = r.players.find((q) => q.id === a.id)!;
                        return (
                          <tr key={a.id}>
                            <td>{a.rank}</td>
                            <td>
                              <span>
                                <Avatar color={p.color} size={29} />
                                {p.name}
                              </span>
                            </td>
                            <td>{final ? p.wins : <Time ms={a.time} />}</td>
                            <td>+{a.points}</td>
                            <td>
                              <b>{p.score}</b>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {owner && (
                  <div className="result-actions">
                    <button
                      className="primary"
                      onClick={() => command(final ? "replay" : "next")}
                    >
                      <Icon name="play" />
                      {final ? "다시 하기" : "다음 라운드"}
                    </button>
                    {final && (
                      <button className="soft" onClick={() => command("lobby")}>
                        대기실로
                      </button>
                    )}
                  </div>
                )}
                {!final && (
                  <p>
                    다음 라운드까지{" "}
                    {Math.max(0, Math.ceil((r.nextRound - r.now) / 1000))}초
                  </p>
                )}
              </section>
            )}
          </>
        )}
        {error && (
          <div role="alert" className="notice">
            {error}
            <button aria-label="닫기" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {r && !online && (
          <p role="status" className="notice">
            서버에 다시 연결하고 있어요…
          </p>
        )}
      </main>
      <footer>
        <div>
          <span className="footer-pixel">✦</span> PIXEL ARCADE
        </div>
        <span>FALLING FLOOR</span>
      </footer>
      {dialog && (
        <dialog
          ref={dlg}
          onCancel={() => setDialog("")}
          onClick={(e) => {
            if (e.target === dlg.current) setDialog("");
          }}
        >
          <div className="modal-top">
            <h2>{dialog === "help" ? "게임 방법" : "방을 나갈까요?"}</h2>
            <button aria-label="닫기" onClick={() => setDialog("")}>
              <Icon name="close" />
            </button>
          </div>
          {dialog === "help" ? (
            <>
              <p>
                밟은 발판은 기본 1초 뒤에 사라져요. 빈칸과 경기장 밖을 피해
                마지막까지 살아남으세요.
              </p>
              <div className="key-list">
                <div>
                  <kbd>WASD / 방향키</kbd>
                  <b>이동</b>
                </div>
                <div>
                  <kbd>SPACE</kbd>
                  <b>점프 · 재사용 3초</b>
                </div>
                <div>
                  <kbd>SHIFT</kbd>
                  <b>대시 · 재사용 4초</b>
                </div>
                <div>
                  <kbd>E</kbd>
                  <b>보유 아이템 사용</b>
                </div>
              </div>
              <p>
                모바일에서는 조이스틱과 액션 버튼을 사용하세요. 30초부터
                경기장이 좁아져요. 각 라운드의 생존 순위로 점수를 얻고 누적
                점수로 우승을 결정해요.
              </p>
              <button className="primary full" onClick={() => setDialog("")}>
                알겠어요
              </button>
            </>
          ) : (
            <>
              <p>현재 방에서 퇴장하고 플레이 로비로 돌아가요.</p>
              <div className="result-actions">
                <button className="soft" onClick={() => setDialog("")}>
                  계속 플레이
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    command("leave");
                    setDialog("");
                  }}
                >
                  나가기
                </button>
              </div>
            </>
          )}
        </dialog>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
