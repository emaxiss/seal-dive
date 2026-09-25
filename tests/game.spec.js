import { test as base, expect } from "@playwright/test";
import { GamePage } from "./pages/game-page.js";

const test = base.extend({
  game: async ({ page }, use) => use(new GamePage(page)),
});

test("shows the start screen", async ({ game }) => {
  await game.open();
  await expect(game.stage).toHaveAttribute("data-state", "ready");
  await expect(game.title).toHaveText("Seal Dive");
  await expect(game.startBest).toHaveText("0");
});

test("space starts the game", async ({ game }) => {
  await game.open();
  await game.swim();
  await expect(game.stage).toHaveAttribute("data-state", "playing");
  await expect(game.score).toBeVisible();
  await expect(game.startScreen).toBeHidden();
});

test("escape pauses and resumes", async ({ game }) => {
  await game.open();
  await game.swim();
  await game.togglePause();
  await expect(game.stage).toHaveAttribute("data-state", "paused");
  await expect(game.pauseScreen).toBeVisible();
  await game.togglePause();
  await expect(game.stage).toHaveAttribute("data-state", "playing");
});

test("seal sinks and the game ends with the best score kept", async ({ game }) => {
  await game.open({ best: 5 });
  await expect(game.startBest).toHaveText("5");
  await game.swim();
  await game.waitForGameOver();
  await expect(game.overTitle).toHaveText("Bonk!");
  await expect(game.finalScore).toHaveText("0");
  await expect(game.finalBest).toHaveText("5");
  await expect(game.newBest).toBeHidden();
});

test("swim again restarts after game over", async ({ game }) => {
  await game.open();
  await game.swim();
  await game.waitForGameOver();
  await game.restartButton.click();
  await expect(game.stage).toHaveAttribute("data-state", "playing");
});

test("mute is remembered after reload", async ({ game }) => {
  await game.open();
  await expect(game.muteButton).toHaveAttribute("aria-pressed", "false");
  await game.toggleMute();
  await expect(game.muteButton).toHaveAttribute("aria-pressed", "true");
  await game.reload();
  await expect(game.muteButton).toHaveAttribute("aria-pressed", "true");
});

test("picked seal is remembered after reload", async ({ game }) => {
  await game.open();
  await expect(game.selectedSeal).toHaveText("Harbor");
  await game.pickSeal("Harp");
  await expect(game.selectedSeal).toHaveText("Harp");
  await game.reload();
  await expect(game.selectedSeal).toHaveText("Harp");
});

test("arrow keys switch seals and wrap around", async ({ game }) => {
  await game.open();
  await game.nextSeal();
  await expect(game.selectedSeal).toHaveText("Harp");
  await game.nextSeal();
  await expect(game.selectedSeal).toHaveText("Monk");
  await game.nextSeal();
  await expect(game.selectedSeal).toHaveText("Harbor");
});

test("menu after game over lets you pick another seal", async ({ game }) => {
  await game.open();
  await game.swim();
  await game.waitForGameOver();
  await game.menuButton.click();
  await expect(game.stage).toHaveAttribute("data-state", "ready");
  await game.pickSeal("Monk");
  await game.swim();
  await expect(game.stage).toHaveAttribute("data-state", "playing");
  await expect(game.selectedSeal).toHaveText("Monk");
});

test("menu from pause goes back to the start screen", async ({ game }) => {
  await game.open();
  await game.swim();
  await game.togglePause();
  await game.pauseMenuButton.click();
  await expect(game.stage).toHaveAttribute("data-state", "ready");
  await expect(game.startScreen).toBeVisible();
});
