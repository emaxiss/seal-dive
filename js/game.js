const cvs = document.getElementById("canvas");
const ctx = cvs.getContext("2d");

const bird = new Image();
const bg = new Image();
const fg = new Image();
const pipeUp = new Image();
const pipeBottom = new Image();

bird.src = "img/flappy_bird_bird.png";
bg.src = "img/flappy_bird_bg.png";
fg.src = "img/flappy_bird_fg.png";
pipeUp.src = "img/flappy_bird_pipeUp.png";
pipeBottom.src = "img/flappy_bird_pipeBottom.png";

const gap = 90;
const xPos = 10;
let yPos = 150;
const grav = 1;

function draw () {
    ctx.drawImage(bg, 0, 0);

    ctx.drawImage(pipeUp, 100, 0);
    ctx.drawImage(pipeBottom, 100, 0 + pipeUp.height + gap);

    ctx.drawImage(fg, 0, cvs.height - fg.height);

    ctx.drawImage(bird, xPos, yPos);

    yPos += grav;
    requestAnimationFrame(draw);
}
pipeBottom.onload = draw;


