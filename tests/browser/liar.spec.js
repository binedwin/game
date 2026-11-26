import { test, expect } from "@playwright/test";
for (const n of [3, 6])
  test(
    n + " browsers reveal, explain, secretly vote and resolve the liar round",
    async ({ browser }, info) => {
      const contexts = [],
        pages = [],
        errors = [];
      try {
        for (let i = 0; i < n; i++) {
          const ctx = await browser.newContext(
            i === n - 1
              ? {
                  viewport: { width: 390, height: 844 },
                  isMobile: true,
                  hasTouch: true,
                }
              : { viewport: { width: 1150, height: 880 } },
          );
          contexts.push(ctx);
          const page = await ctx.newPage();
          pages.push(page);
          page.on("pageerror", (e) => errors.push(e.message));
          await page.goto(process.env.FALLING_FLOOR_TEST_URL);
          await expect(page.getByText("서버 온라인")).toBeVisible();
          await page.getByLabel("닉네임").fill("탐정" + i);
          if (i)
            await page
              .getByRole("button", {
                name:
                  ["", "블루", "민트", "골드", "퍼플", "오렌지"][i] + " 캐릭터",
              })
              .click();
        }
        const host = pages[0];
        await host.getByRole("button", { name: "새로운 방 만들기" }).click();
        const code = await host.locator(".invite b").innerText();
        for (let i = 1; i < n; i++) {
          const page = pages[i];
          await page.getByRole("button", { name: "코드로 입장" }).click();
          await page.getByLabel("방 코드").fill(code);
          await page
            .getByRole("button", { name: "방 입장", exact: true })
            .click();
          if (i === 1)
            await expect(
              host.getByRole("button", { name: /LIAR GAME/ }),
            ).toBeDisabled();
        }
        await host.getByRole("button", { name: /LIAR GAME/ }).click();
        for (const page of pages)
          await page.getByRole("button", { name: "준비 완료" }).click();
        await host.getByRole("button", { name: "게임 시작" }).click();
        await Promise.all(
          pages.map((p) =>
            expect(p.locator(".role-card h3")).not.toHaveText("확인 중…", {
              timeout: 12000,
            }),
          ),
        );
        const cards = await Promise.all(
          pages.map((p) => p.locator(".role-card h3").innerText()),
        );
        const liar = cards.findIndex((x) => x === "당신은 라이어입니다");
        expect(liar).toBeGreaterThanOrEqual(0);
        expect(cards.filter((x) => x === cards[liar])).toHaveLength(1);
        const answer = cards.find((x) => x !== cards[liar]);
        expect(cards.filter((x) => x === answer)).toHaveLength(n - 1);
        await pages[liar].reload();
        await expect(pages[liar].locator(".role-card h3")).toHaveText(
          "당신은 라이어입니다",
        );
        await expect(pages[liar].locator(".case-layout")).not.toContainText(
          answer,
        );
        for (let i = 0; i < n; i++) {
          await expect(host.locator(".speaking b")).toBeVisible({
            timeout: 9000,
          });
          const speaker = Number(
            (await host.locator(".speaking b").innerText()).match(
              /탐정(\d+)/,
            )[1],
          );
          const page = pages[speaker],
            input = page.getByLabel("내 설명");
          await expect(input).toBeVisible();
          await input.fill("단서 " + i);
          if (i === 0) {
            await input.dispatchEvent("compositionstart");
            await input.press("Enter");
            await expect(input).toBeVisible();
            await input.dispatchEvent("compositionend");
          }
          await page.getByRole("button", { name: "설명 보내기" }).click();
          await expect(host.locator(".clue")).toHaveCount(i + 1);
        }
        for (let i = 0; i < n; i++) {
          const page = pages[i],
            target = i === liar ? (i + 1) % n : liar;
          await page
            .locator(".ballot-choices")
            .getByRole("button", { name: "탐정" + target, exact: true })
            .click();
          await page
            .getByRole("button", { name: "투표 확정", exact: true })
            .click();
        }
        await pages[liar]
          .getByLabel("마지막 정답")
          .fill(n === 6 ? answer : "모르겠어요");
        await pages[liar].getByRole("button", { name: "정답 제출" }).click();
        await Promise.all(
          pages.map((p) =>
            expect(p.locator(".liar-reveal")).toContainText(
              n === 6 ? "역전" : "시민이 이겼어요",
            ),
          ),
        );
        await expect(host.locator(".score-table tbody tr")).toHaveCount(n);
        await host.screenshot({ path: info.outputPath("liar-result.png") });
        expect(errors).toEqual([]);
      } finally {
        await Promise.all(contexts.map((c) => c.close()));
      }
    },
  );
