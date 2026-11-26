import React, { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { Room } from "./types";
import type {
  Ack,
  LiarAction,
  LiarInput,
  LiarPrivate,
  LiarResult,
  Stage,
} from "../shared/liar";
import { Avatar } from "./art";
const titles: Record<Stage, string> = {
  role: "역할 확인",
  clue: "한 줄 설명",
  review: "설명 다시 읽기",
  vote: "비밀 투표",
  runoff: "결선 투표",
  guess: "라이어의 마지막 추측",
  finished: "결과 발표",
};
const reasons: Record<LiarResult["outcome"], string> = {
  LIAR_ESCAPED: "시민이 지목되어 라이어가 이겼어요.",
  LIAR_UNRESOLVED: "투표로 한 명을 지목하지 못해 라이어가 이겼어요.",
  LIAR_GUESSED: "라이어가 제시어를 맞혀 역전했어요!",
  CITIZENS_CAUGHT: "라이어가 제시어를 맞히지 못해 시민이 이겼어요!",
  LIAR_FORFEIT: "라이어가 포기해 남은 시민이 이겼어요.",
  VOID: "참가자가 세 명 미만이 되어 이번 판은 전원 0점이에요.",
};
const errors: Record<string, string> = {
  INVALID_TEXT: "줄바꿈 없이 1~80자로 입력해 주세요.",
  INVALID_TARGET: "본인을 제외한 후보를 선택해 주세요.",
  RATE_LIMITED: "잠시 후 다시 시도해 주세요.",
  DEADLINE_PASSED: "제출 시간이 끝났어요.",
  ALREADY_SUBMITTED: "이미 제출했어요.",
};
export function Reveal({ result, room }: { result: LiarResult; room: Room }) {
  const name = (id: string | null) =>
    room.players.find((p) => p.id === id)?.name ?? "—";
  return (
    <section className="liar-reveal">
      <h3>{reasons[result.outcome]}</h3>
      {result.answer && (
        <p>
          라이어 <b>{name(result.liarId)}</b> · 제시어 <b>{result.answer}</b>
        </p>
      )}
      {result.nominated && <p>지목된 사람 · {name(result.nominated)}</p>}
      {(result.guess || result.outcome === "CITIZENS_CAUGHT") && (
        <p>마지막 추측 · {result.guess ?? "시간 초과"}</p>
      )}
      {result.answer && (
        <details>
          <summary>설명과 투표 기록</summary>
          <ol>
            {result.clues.map((c) => (
              <li key={c.playerId}>
                {name(c.playerId)} ·{" "}
                {c.text ?? (c.status === "forfeit" ? "중도 포기" : "시간 초과")}
              </li>
            ))}
          </ol>
          {result.ballots.length ? (
            result.ballots.map((v) => (
              <p key={v.round + v.voter}>
                {v.round}차 · {name(v.voter)} → {name(v.target)}
                {v.valid ? "" : " (무효)"}
              </p>
            ))
          ) : (
            <p>제출된 표가 없어요.</p>
          )}
        </details>
      )}
    </section>
  );
}
export function LiarGame({
  room,
  id,
  own,
  socket,
}: {
  room: Room;
  id: string;
  own: LiarPrivate | null;
  socket: Socket;
}) {
  const v = room.liar!,
    personal =
      own?.matchId === room.matchId &&
      own?.round === room.round &&
      own?.version === v.version
        ? own
        : null;
  const [text, setText] = useState(""),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [hidden, setHidden] = useState(false);
  const composing = useRef(false),
    retry = useRef<{ key: string; id: string } | null>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const refresh = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (v.deadline - room.now - (performance.now() - start)) / 1000,
          ),
        ),
      );
    refresh();
    const t = setInterval(refresh, 150);
    return () => clearInterval(t);
  }, [v.deadline, room.now]);
  useEffect(() => {
    setText("");
    setTarget("");
    setError("");
    setBusy(false);
    retry.current = null;
  }, [v.version]);
  const member = (pid: string) => room.players.find((p) => p.id === pid)!;
  const active = v.order[v.turnIndex],
    myTurn = v.stage === "clue" && active === id && !personal?.hasClue;
  const voting = v.stage === "vote" || v.stage === "runoff";
  const isGuess = v.stage === "guess" && personal?.canGuess;
  const phaseRef = useRef(v.version);
  phaseRef.current = v.version;
  async function send(type: LiarAction) {
    if (!personal || busy || !socket.connected) return;
    const key = JSON.stringify([v.version, type, text, target]);
    if (retry.current?.key !== key)
      retry.current = {
        key,
        id: Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
          n.toString(16),
        ).join("-"),
      };
    const data: LiarInput = {
      matchId: room.matchId!,
      roundIndex: room.round,
      phaseVersion: v.version,
      requestId: retry.current.id,
    };
    if (type === "vote") {
      data.targetId = target;
      data.voteRound = v.voteRound;
    } else {
      data.text = text;
      if (type === "clue") data.turnId = v.turnId!;
    }
    setBusy(true);
    setError("");
    try {
      const ack: Ack = await socket
        .timeout(3500)
        .emitWithAck("liar:" + type + ":submit", data);
      if (!ack.ok && phaseRef.current === v.version)
        setError(
          errors[ack.code ?? ""] ??
            "차례나 단계가 바뀌었어요. 현재 화면을 확인해 주세요.",
        );
    } catch {
      if (phaseRef.current === v.version)
        setError(
          "서버 응답을 기다리고 있어요. 같은 내용으로 다시 시도할 수 있어요.",
        );
    } finally {
      if (phaseRef.current === v.version) setBusy(false);
    }
  }
  const count = [...text.normalize("NFC").trim()].length;
  const entry = (kind: "guess" | "clue") => (
    <form
      className="liar-entry"
      onSubmit={(e) => {
        e.preventDefault();
        if (!composing.current && count > 0 && count <= 80) void send(kind);
      }}
    >
      <label htmlFor="liar-text">
        {kind === "guess" ? "마지막 정답" : "내 설명"}
      </label>
      <input
        id="liar-text"
        value={text}
        autoComplete="off"
        disabled={busy}
        placeholder={
          kind === "guess"
            ? "제시어를 추측하세요"
            : "단어를 직접 말하지 않고 설명하세요"
        }
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (composing.current ||
              e.nativeEvent.isComposing ||
              e.nativeEvent.keyCode === 229)
          )
            e.preventDefault();
        }}
      />
      <small>{count} / 80</small>
      <button
        className="primary"
        disabled={busy || !personal || !seconds || count < 1 || count > 80}
      >
        {busy ? "전송 중…" : kind === "guess" ? "정답 제출" : "설명 보내기"}
      </button>
    </form>
  );
  return (
    <section className="liar-board panel">
      <header className="case-header">
        <div>
          <small>
            LIAR GAME · ROUND {room.round}/{room.settings.rounds}
          </small>
          <h2>{titles[v.stage]}</h2>
        </div>
        <b className={"case-clock " + (seconds <= 3 ? "urgent" : "")}>
          {seconds}초
        </b>
      </header>
      <div className="case-layout">
        <aside className="case-aside">
          <div className="role-card">
            <small>내 역할 카드 · 주제 {v.category}</small>
            <h3>
              {!personal
                ? "확인 중…"
                : hidden
                  ? "가려진 카드"
                  : personal.role === "liar"
                    ? "당신은 라이어입니다"
                    : personal.word}
            </h3>
            <p>
              {hidden
                ? "본인 차례에 다시 확인할 수 있어요."
                : !personal
                  ? "역할 카드를 받고 있어요."
                  : personal.role === "citizen"
                    ? "시민 · 제시어, 초성, 번역, 글자 수는 비밀이에요."
                    : "앞선 설명을 듣고 자연스럽게 섞여 보세요."}
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => setHidden(!hidden)}
            >
              {hidden ? "카드 보기" : "카드 가리기"}
            </button>
          </div>
          <h3>설명 순서</h3>
          <ol className="case-order">
            {v.order.map((pid, i) => {
              const p = member(pid),
                clue = v.clues.find((c) => c.playerId === pid);
              return (
                <li
                  key={pid}
                  className={
                    pid === active && v.stage === "clue" ? "speaking" : ""
                  }
                >
                  <span>{i + 1}</span>
                  <Avatar color={p.color} size={27} />
                  <b>
                    {p.name}
                    {pid === id ? " (나)" : ""}
                  </b>
                  <small>
                    {clue
                      ? clue.status === "submitted"
                        ? "완료"
                        : clue.status === "timeout"
                          ? "시간 초과"
                          : "포기"
                      : p.forfeited
                        ? "포기"
                        : pid === active && v.stage === "clue"
                          ? "설명 중"
                          : "대기"}
                  </small>
                </li>
              );
            })}
          </ol>
        </aside>
        <div className="case-main">
          <h3>
            공개된 설명{" "}
            <small>
              {v.clues.length}/{v.order.length}
            </small>
          </h3>
          <div className="clue-list" role="log">
            {v.clues.length ? (
              v.clues.map((c) => (
                <div className="clue" key={c.turnId}>
                  <Avatar color={member(c.playerId).color} size={30} />
                  <div>
                    <b>{member(c.playerId).name}</b>
                    <p>
                      {c.text ??
                        (c.status === "forfeit"
                          ? "중도 포기 · 설명 없음"
                          : "시간 초과 · 설명 없음")}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="case-empty">첫 설명을 기다리고 있어요.</p>
            )}
          </div>
          {v.stage === "role" && (
            <p>
              역할을 확인하세요. 잠시 후 {member(v.order[0]).name}님부터 한 번씩
              설명해요.
            </p>
          )}
          {v.stage === "clue" &&
            (myTurn ? (
              entry("clue")
            ) : (
              <p>{member(active).name}님이 설명하고 있어요.</p>
            ))}
          {v.stage === "review" && (
            <p>설명을 비교해 보세요. 곧 비밀 투표가 시작돼요.</p>
          )}
          {voting && (
            <div className="ballot">
              <h3>
                {v.stage === "runoff"
                  ? "동률 후보 중 다시 선택하세요"
                  : "누가 라이어일까요?"}{" "}
                <small>
                  {v.voteCount}/{v.voterCount}표 완료
                </small>
              </h3>
              <div className="ballot-choices">
                {v.candidates.map((pid) => (
                  <button
                    key={pid}
                    aria-pressed={(personal?.myVote || target) === pid}
                    disabled={
                      !personal || pid === id || !!personal.myVote || busy
                    }
                    onClick={() => setTarget(pid)}
                  >
                    <Avatar color={member(pid).color} size={28} />
                    {member(pid).name}
                  </button>
                ))}
              </div>
              <button
                className="primary"
                disabled={
                  !personal ||
                  !!personal.myVote ||
                  !v.candidates.includes(target) ||
                  !seconds ||
                  busy
                }
                onClick={() => void send("vote")}
              >
                {personal?.myVote
                  ? "내 투표 확정됨"
                  : busy
                    ? "전송 중…"
                    : "투표 확정"}
              </button>
            </div>
          )}
          {v.stage === "guess" && (
            <>
              <h3>라이어를 찾았습니다!</h3>
              {isGuess ? (
                entry("guess")
              ) : (
                <p>
                  {member(v.nominated!).name}님의 마지막 정답을 기다려 주세요.
                </p>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}
