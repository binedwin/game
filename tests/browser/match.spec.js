import { test, expect } from "@playwright/test";
test("six independent sessions finish three rounds and return to the lobby", async ({
  browser,
}, testInfo) => {
  const contexts = [],
    pages = [],
    errors = [];
  try {
    for (let i = 0; i < 6; i++) {
      const ctx = await browser.newContext({
        viewport:
          i === 5 ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        hasTouch: i === 5,
        isMobile: i === 5,
      });
      contexts.push(ctx);
      const page = await ctx.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(process.env.FALLING_FLOOR_TEST_URL);
      await expect(page.getByText("서버 온라인")).toBeVisible();
      pages.push(page);
    }
    const [host, ...guests] = pages;
    await host.screenshot({
      path: testInfo.outputPath("lobby.png"),
      fullPage: true,
    });
    await host.getByLabel("닉네임").fill("방장");
    await host.getByRole("button", { name: "새로운 방 만들기" }).click();
    const code = await host.locator(".invite b").innerText();
    await host.getByLabel("라운드", { exact: true }).selectOption("3");
    for (const [i, p] of guests.entries()) {
      await p.getByLabel("닉네임").fill("친구" + i);
      await p
        .getByRole("button", {
          name: ["블루", "민트", "골드", "퍼플", "오렌지"][i] + " 캐릭터",
        })
        .click();
      await p.getByRole("button", { name: "코드로 입장" }).click();
      await p.getByRole("textbox", { name: "방 코드" }).fill(code);
      await p.getByRole("button", { name: "방 입장", exact: true }).click();
    }
    await host.getByRole("button", { name: /PUSH OUT.*밀어내기/ }).click();
    await expect(guests[0].getByText("선택한 모드 · 밀어내기")).toBeVisible();
    await host.getByRole("button", { name: "두 게임 번갈아 진행" }).click();
    for (const p of pages)
      await p.getByRole("button", { name: "준비 완료" }).click();
    await host.getByRole("button", { name: "게임 시작" }).click();
    for (let round = 1; round <= 3; round++) {
      await expect(host.locator(".round-intro")).toContainText(
        round === 2 ? "밀어내기" : "바닥이 사라진다",
        { timeout: 9000 },
      );
      await Promise.all(
        pages.map((p) =>
          expect(p.locator(".hud")).toContainText("ROUND " + round + "/3"),
        ),
      );
      await Promise.all(
        pages.map((p) => expect(p.locator(".board canvas")).toBeVisible()),
      );
      if (round === 2) {
        await host.locator(".countdown").waitFor({ state: "hidden" });
        await host.screenshot({ path: testInfo.outputPath("push-out.png") });
        await Promise.all(
          pages.slice(1).map((p) => p.keyboard.down("ArrowDown")),
        );
      }
      if (round === 1)
        await host.screenshot({ path: testInfo.outputPath("arena.png") });
      await Promise.all(
        pages.map((p) =>
          expect(
            p.getByRole("heading", {
              name: "라운드 결과",
            }),
          ).toBeVisible({ timeout: 10000 }),
        ),
      );
      if (round === 2)
        await Promise.all(
          pages.slice(1).map((p) => p.keyboard.up("ArrowDown")),
        );
    }
    await expect(host.getByRole("heading", { name: "최종 순위" })).toBeVisible({
      timeout: 8000,
    });
    await expect(host.locator("tbody tr")).toHaveCount(6);
    await host.getByRole("button", { name: /대기실로/ }).click();
    await Promise.all(
      pages.map((p) =>
        expect(p.getByRole("heading", { name: "대기실" })).toBeVisible(),
      ),
    );
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("mobile practice renders the arena, accepts touch movement and resumes after refresh", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  try {
    const p = await context.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(process.env.FALLING_FLOOR_TEST_URL);
    await expect(p.getByText("서버 온라인")).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p.screenshot({
      path: testInfo.outputPath("mobile.png"),
      fullPage: true,
    });
    await p.getByRole("button", { name: "게임 방법" }).tap();
    await expect(p.locator("dialog")).toBeVisible();
    await p.getByRole("button", { name: "알겠어요" }).tap();
    await p.getByRole("button", { name: "연습 모드" }).tap();
    await expect(p.locator(".board canvas")).toBeVisible();
    await p.reload();
    await expect(p.locator(".board canvas")).toBeVisible();
    await expect(p.locator(".joystick")).toBeVisible();
    await p.locator(".countdown").waitFor({ state: "hidden" });
    await p.locator(".joystick").tap({ position: { x: 62, y: 39 } });
    await p.getByRole("button", { name: /점프/ }).tap();
    await expect(p.getByRole("button", { name: /점프/ })).toBeDisabled();
    await p.getByRole("button", { name: "나가기", exact: true }).tap();
    await p.locator("dialog").getByRole("button", { name: "나가기" }).tap();
    await expect(p.getByRole("heading", { name: "플레이 로비" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("two players choose Push Out in the room, guard on mobile and cancel after a forfeit", async ({
  browser,
}) => {
  const desktop = await browser.newContext(),
    mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
  try {
    const host = await desktop.newPage(),
      guest = await mobile.newPage();
    for (const page of [host, guest]) {
      await page.goto(process.env.FALLING_FLOOR_TEST_URL);
      await expect(page.getByText("서버 온라인")).toBeVisible();
    }
    await host.getByRole("button", { name: "새로운 방 만들기" }).click();
    const code = await host.locator(".invite b").innerText();
    await guest.getByLabel("닉네임").fill("두번째");
    await guest.getByRole("button", { name: "오렌지 캐릭터" }).tap();
    await guest.getByRole("button", { name: "코드로 입장" }).tap();
    await guest.getByLabel("방 코드").fill(code);
    await guest.getByRole("button", { name: "방 입장", exact: true }).tap();
    await guest.getByRole("button", { name: "준비 완료" }).tap();
    await host.getByRole("button", { name: /PUSH OUT.*밀어내기/ }).click();
    await expect(
      guest.getByRole("button", { name: "준비 완료" }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: /PUSH OUT.*밀어내기/ }),
    ).toBeDisabled();
    await guest.getByRole("button", { name: "준비 완료" }).tap();
    await host.getByRole("button", { name: "준비 완료" }).click();
    await host.getByRole("button", { name: "게임 시작" }).click();
    await expect(guest.locator(".round-intro")).toContainText("밀어내기");
    const guard = guest.getByRole("button", { name: /방어/ });
    await expect(guard).toBeEnabled({ timeout: 10000 });
    await guard.tap();
    await expect(guard).toBeDisabled();
    await guest.getByRole("button", { name: "나가기", exact: true }).tap();
    await guest.locator("dialog").getByRole("button", { name: "나가기" }).tap();
    await expect(host.getByRole("heading", { name: "대기실" })).toBeVisible();
    await expect(host.getByRole("alert")).toContainText("참가자");
  } finally {
    await Promise.all([desktop.close(), mobile.close()]);
  }
});
