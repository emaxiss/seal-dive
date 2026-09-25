# Seal Dive

A seal, some ice, some rocks, and a lot of "one more try".

<p>
  <img src="docs/start.png" width="240" alt="Title screen">
  <img src="docs/play.png" width="240" alt="Swimming between ice and rocks">
  <img src="docs/game-over.png" width="240" alt="Game over card">
</p>

## How it started

Back in 2020 this was a plain Flappy Bird clone I wrote while learning JavaScript. It sat here untouched for years.

Then a certain someone at home decided birds were boring and seals were not. So the bird became a seal, the sky became the ocean, and the pipes became ice and rocks. The "Bonk!" on the game over screen was not my idea.

## How to play

| Do this      | Press                         |
| ------------ | ----------------------------- |
| Pick a seal  | Tap one, or `←` `→`           |
| Swim up      | Tap, click, `Space` or `↑`    |
| Pause        | `Esc` or `P`                  |
| Sound on/off | `M`                           |

The best score is saved in your browser. The current record at our house is hard to beat and I've been told not to reset it.

## Playtester wishlist

Requests from the most demanding playtester I know:

- [x] A seal instead of a bird
- [x] Make it say "Bonk!"
- [ ] Fish to collect
- [ ] A penguin friend
- [ ] Nighttime with stars
- [x] Pick your seal before you dive (harbor, harp or monk)

## Running it

Open `index.html` in a browser. It doesn't need an install, a build step or the internet.

Everything you see and hear is drawn and made in code, so there are no image or sound files. The font is [Fredoka](https://fonts.google.com/specimen/Fredoka) (SIL Open Font License), stored in `fonts/`.

## Tests

A few browser tests check that the game starts, pauses, ends and remembers your settings:

```
pnpm install
pnpm exec playwright install chromium
pnpm test
```
