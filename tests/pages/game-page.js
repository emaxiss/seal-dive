export class GamePage {
  constructor(page) {
    this.page = page;
    this.stage = page.locator("#stage");
    this.title = page.locator("#title");
    this.startBest = page.locator("#startBest");
    this.score = page.locator("#score");
    this.startScreen = page.locator("#startScreen");
    this.pauseScreen = page.locator("#pauseScreen");
    this.overScreen = page.locator("#overScreen");
    this.overTitle = page.locator("#overTitle");
    this.finalScore = page.locator("#finalScore");
    this.finalBest = page.locator("#finalBest");
    this.newBest = page.locator("#newBest");
    this.restartButton = page.locator("#restartBtn");
    this.muteButton = page.locator("#muteBtn");
  }

  async open({ best } = {}) {
    if (best !== undefined) {
      await this.page.addInitScript((value) => localStorage.setItem("sealdive.best", value), String(best));
    }
    await this.page.goto("/");
  }

  swim() {
    return this.page.keyboard.press("Space");
  }

  togglePause() {
    return this.page.keyboard.press("Escape");
  }

  toggleMute() {
    return this.page.keyboard.press("m");
  }

  reload() {
    return this.page.reload();
  }

  waitForGameOver() {
    return this.overScreen.waitFor({ state: "visible", timeout: 10_000 });
  }
}
