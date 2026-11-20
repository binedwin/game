import { test, expect } from "@playwright/test";
test("five independent sessions finish three rounds and return to the lobby", async ({
  browser,
}, testInfo) => {
  const contexts = [],
    pages = [],
    errors = [];
  try {
    for (let i = 0; i < 5; i++) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      contexts.push(ctx);
      const page = await ctx.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:3115");
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
      await p.getByRole("button", { name: "코드로 입장" }).click();
      await p.getByRole("textbox", { name: "방 코드" }).fill(code);
      await p.getByRole("button", { name: "방 입장", exact: true }).click();
      await p.getByRole("button", { name: "준비 완료" }).click();
    }
    await host.getByRole("button", { name: "게임 시작" }).click();
    for (let round = 1; round <= 3; round++) {
      await Promise.all(
        pages.map((p) =>
          expect(p.locator(".hud")).toContainText("ROUND " + round + "/3"),
        ),
      );
      await Promise.all(
        pages.map((p) => expect(p.locator(".board canvas")).toBeVisible()),
      );
      if (round === 1)
        await host.screenshot({ path: testInfo.outputPath("arena.png") });
      await Promise.all(
        pages.map((p) =>
          expect(
            p.getByRole("heading", {
              name: round === 3 ? "최종 순위" : "라운드 결과",
            }),
          ).toBeVisible({ timeout: 10000 }),
        ),
      );
      if (round < 3)
        await host
          .getByRole("button", { name: "다음 라운드", exact: true })
          .click();
    }
    await expect(host.locator("tbody tr")).toHaveCount(5);
    await host.getByRole("button", { name: "대기실로" }).click();
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
    await p.goto("http://127.0.0.1:3115");
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
