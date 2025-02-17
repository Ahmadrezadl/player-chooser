/********************************************
 * Check for Touch Support
 ********************************************/
window.addEventListener('load', () => {
    // If no "ontouchstart" in the window, display overlay message.
    if (!('ontouchstart' in window)) {
        const noTouchOverlay = document.getElementById('noTouchOverlay');
        noTouchOverlay.style.display = 'flex';
    }
});

/********************************************
 * Global Variables
 ********************************************/
const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext('2d');
const hintDiv = document.getElementById('hint');
const modeRadios = document.getElementsByName('mode');
const countInput = document.getElementById('countInput');

// Touches currently on the screen: { [identifier]: { x, y, color, angle, radius, active } }
let touchesData = {};

// 10 distinct colors for up to 10 fingers
const COLORS = [
    '#e6194b','#3cb44b','#ffe119','#0082c8','#f58231',
    '#911eb4','#46f0f0','#f032e6','#d2f53c','#fabebe'
];

// Track time of last touch event; used to detect 5s of inactivity
let lastTouchTime = 0;

// How many milliseconds of inactivity until a “result” is shown
const INACTIVITY_TIMEOUT = 5000;

// Boolean to indicate if we are currently showing a “result” (highlight or lines)
let showingResult = false;

// Once locked, no further touch updates or new touches are processed
let locked = false;

/********************************************
 * Initialization
 ********************************************/
function resizeCanvas() {
    // Make the canvas match the container size
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // on load

// Listen for mode changes
modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        resetAll();
    });
});

// Listen for number input changes
countInput.addEventListener('change', () => {
    resetAll();
});

// Touch events (if device supports it)
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

// Start animation
requestAnimationFrame(drawLoop);

/********************************************
 * Event Handlers
 ********************************************/
function handleTouchStart(ev) {
    if (locked) return; // ignore if locked
    ev.preventDefault();
    showingResult = false;
    hintDiv.style.display = 'none'; // Hide the hint once a touch occurs

    for (let t of ev.changedTouches) {
        // Limit to max of 10 touches
        let id = t.identifier;
        if (Object.keys(touchesData).length < 10) {
            touchesData[id] = {
                x: t.clientX,
                y: t.clientY,
                color: COLORS[id % COLORS.length],
                angle: 0,
                // Make aims bigger by increasing starting radius
                radius: 200,
                active: true
            };
        }
    }
    updateLastTouchTime();
}

function handleTouchMove(ev) {
    if (locked) return; // ignore if locked
    ev.preventDefault();
    showingResult = false;
    for (let t of ev.changedTouches) {
        let id = t.identifier;
        if (touchesData[id]) {
            touchesData[id].x = t.clientX;
            touchesData[id].y = t.clientY;
        }
    }
}

function handleTouchEnd(ev) {
    if (locked) return; // ignore if locked
    ev.preventDefault();
    showingResult = false;
    for (let t of ev.changedTouches) {
        let id = t.identifier;
        if (touchesData[id]) {
            delete touchesData[id];
        }
    }
    updateLastTouchTime();
}

function updateLastTouchTime() {
    lastTouchTime = Date.now();
}

/********************************************
 * Core Logic
 ********************************************/
function drawLoop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no touches and not showing final, show hint
    if (Object.keys(touchesData).length === 0 && !showingResult) {
        hintDiv.style.display = 'block';
    }

    // Animate each touch's "aim" if we are not locked and not showing final
    if (!locked && !showingResult) {
        for (let id in touchesData) {
            let data = touchesData[id];
            data.angle += 0.05;
            // Animate radius between 40 - 60 (bigger than before)
            data.radius = 40 + 20 * Math.abs(Math.sin(data.angle));
            drawAim(data);
        }
    }

    // Check if we should show the “result” (5s inactivity) if not locked
    if (!locked && !showingResult && Date.now() - lastTouchTime > INACTIVITY_TIMEOUT && Object.keys(touchesData).length > 0) {
        showingResult = true;
        lockAndShowResult();
    }

    // If we’re in “team” mode and showing result, draw lines
    if (showingResult && getCurrentMode() === 'team') {
        drawTeamLines();
    }

    // Request next frame
    requestAnimationFrame(drawLoop);
}

/**
 * Draw a rotating “aim” for a single touch
 */
function drawAim(touchInfo) {
    const { x, y, color, angle, radius } = touchInfo;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Outer circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2*Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Crosshair inside
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

/**
 * Lock the canvas and show the “result” after inactivity
 * - In “choose” mode: highlight only one random touch
 * - In “team” mode: draw lines between them
 */
function lockAndShowResult() {
    // Lock so no new touches or updates
    locked = true;
    const mode = getCurrentMode();

    if (mode === 'choose') {
        // Randomly pick one touch to keep active
        let keys = Object.keys(touchesData);
        if (keys.length > 0) {
            let randomKey = keys[Math.floor(Math.random() * keys.length)];
            // Hide all but the chosen one
            for (let id in touchesData) {
                if (id !== randomKey) {
                    touchesData[id].active = false;
                }
            }
        }
    }
    // if (mode === 'team'), we do nothing special here except
    // continuing to draw lines in drawTeamLines().
}

/**
 * Draw lines between all active touches in “team” mode
 */
function drawTeamLines() {
    let activeTouches = Object.values(touchesData).filter(t => t.active);

    for (let i = 0; i < activeTouches.length; i++) {
        for (let j = i+1; j < activeTouches.length; j++) {
            const t1 = activeTouches[i];
            const t2 = activeTouches[j];
            drawLineBetween(t1, t2);
        }
    }
}

/**
 * Draw a line between two touches with a gradient
 */
function drawLineBetween(t1, t2) {
    ctx.save();
    let grad = ctx.createLinearGradient(t1.x, t1.y, t2.x, t2.y);
    grad.addColorStop(0, t1.color);
    grad.addColorStop(1, t2.color);

    ctx.beginPath();
    ctx.moveTo(t1.x, t1.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
}

/**
 * Helper: get current mode from radio buttons
 */
function getCurrentMode() {
    for (let radio of modeRadios) {
        if (radio.checked) return radio.value;
    }
    return 'choose';
}

/**
 * Reset everything (when changing modes / inputs)
 */
function resetAll() {
    // Clear touches
    touchesData = {};
    showingResult = false;
    lastTouchTime = 0;
    locked = false;
    hintDiv.style.display = 'block';
}
