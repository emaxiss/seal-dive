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

document.addEventListener("keydown", moveUp);

function moveUp() {
    yPos -= 30;
}

const pipe = [];
pipe[0] = {
    x: cvs.width,
    y: 0
}
let score = 0;

const gap = 90;
const xPos = 10;
let yPos = 150;
const grav = 1.5;


function draw() {
    ctx.drawImage(bg, 0, 0);
    for (let i = 0; i < pipe.length; i++) {
        ctx.drawImage(pipeUp, pipe[i].x, pipe[i].y);
        ctx.drawImage(pipeBottom, pipe[i].x, pipe[i].y + pipeUp.height + gap);
        pipe[i].x--;

        if (pipe[i].x == 130) {
            pipe.push({
                x: cvs.width,
                y: Math.floor(Math.random() * pipeUp.height) - pipeUp.height
            })
        }

        if (xPos + bird.width >= pipe[i].x
            && xPos <= pipe[i].x + pipeUp.width
            && (yPos <= pipe[i].y + pipeUp.height
                || yPos + bird.height >= pipe[i].y + pipeUp.height + gap) || yPos + bird.height >= cvs.height - fg.height) {
            location.reload();
        }
    if (pipe[i].x == 5) {
        score++
    }

    }


    ctx.drawImage(fg, 0, cvs.height - fg.height);

    ctx.drawImage(bird, xPos, yPos);

    yPos += grav;

    ctx.fillStyle = "#000";
    ctx.font = "20px Verdana";
    ctx.fillText("SCORE:" + score, 10, cvs.height - 20)

    requestAnimationFrame(draw);
}

pipeBottom.onload = draw;



