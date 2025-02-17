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
const resultOverlay = document.getElementById('resultOverlay');

// Touches: { [identifier]: { x, y, color, angle, radius, active } }
let touchesData = {};

// Distinct colors for up to 10 fingers
const COLORS = [
    '#e6194b','#3cb44b','#ffe119','#0082c8','#f58231',
    '#911eb4','#46f0f0','#f032e6','#d2f53c','#fabebe'
];

// Map color codes to friendly names (approx)
const COLOR_NAMES = {
    '#e6194b': 'Red',
    '#3cb44b': 'Green',
    '#ffe119': 'Yellow',
    '#0082c8': 'Blue',
    '#f58231': 'Orange',
    '#911eb4': 'Purple',
    '#46f0f0': 'Cyan',
    '#f032e6': 'Magenta',
    '#d2f53c': 'Lime',
    '#fabebe': 'Pink'
};

// Track time of last START/END event
let lastTouchTime = 0;

// Milliseconds of inactivity until we lock and show result
const INACTIVITY_TIMEOUT = 5000;

// Whether we’re showing a final result (aims freeze or lines are drawn)
let showingResult = false;

// Once locked, ignore new touches or movement
let locked = false;

// Timer handle for auto-reset (10s after showing result)
let resultTimer = null;

/********************************************
 * Initialization
 ********************************************/
function resizeCanvas() {
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // On load

// Listen for mode changes
modeRadios.forEach(radio => {
    radio.addEventListener('change', resetAll);
});

// Listen for number input changes
countInput.addEventListener('change', resetAll);

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
    if (locked) return;
    ev.preventDefault();

    // Hide the hint once a finger touches
    hintDiv.style.display = 'none';
    showingResult = false;

    for (let t of ev.changedTouches) {
        // Up to 10 touches
        let id = t.identifier;
        if (Object.keys(touchesData).length < 10) {
            touchesData[id] = {
                x: t.clientX,
                y: t.clientY,
                color: COLORS[id % COLORS.length],
                angle: 0,
                // Larger initial radius
                radius: 50,
                active: true
            };
        }
    }
    updateLastTouchTime(); // Only update time on start/end
}

function handleTouchMove(ev) {
    if (locked) return;  // We ignore moves if locked
    ev.preventDefault();

    // DO NOT update lastTouchTime here (as requested)
    for (let t of ev.changedTouches) {
        let id = t.identifier;
        if (touchesData[id]) {
            touchesData[id].x = t.clientX;
            touchesData[id].y = t.clientY;
        }
    }
}

function handleTouchEnd(ev) {
    if (locked) return;
    ev.preventDefault();

    showingResult = false;
    for (let t of ev.changedTouches) {
        let id = t.identifier;
        if (touchesData[id]) {
            delete touchesData[id];
        }
    }
    updateLastTouchTime(); // Only update time on start/end
}

function updateLastTouchTime() {
    lastTouchTime = Date.now();
}

/********************************************
 * Core Logic: Animation + Result
 ********************************************/
function drawLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no touches and not showing final, show the hint
    if (Object.keys(touchesData).length === 0 && !showingResult) {
        hintDiv.style.display = 'block';
    }

    const mode = getCurrentMode();

    // If we are NOT locked and NOT showing final:
    //   animate the "aims" for all active touches
    if (!locked && !showingResult) {
        for (let id in touchesData) {
            let data = touchesData[id];
            data.angle += 0.05;
            // Animate radius between 40 - 60
            data.radius = 40 + 20 * Math.abs(Math.sin(data.angle));
            drawAim(data);
        }
    }
    else if (showingResult) {
        // We are showing the final result
        if (mode === 'team') {
            // Draw lines between active touches
            drawTeamLines();
        } else if (mode === 'choose') {
            // Re-draw only the chosen aim (the one still active)
            for (let id in touchesData) {
                if (touchesData[id].active) {
                    drawAim(touchesData[id]);
                }
            }
        }
    }

    // Check inactivity => lock and show result
    if (!locked && !showingResult && (Date.now() - lastTouchTime > INACTIVITY_TIMEOUT) && Object.keys(touchesData).length > 0) {
        lockAndShowResult();
    }

    requestAnimationFrame(drawLoop);
}

/**
 * Draw a single "aim"
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
 * Lock canvas => no more touches or movement. Then show result.
 * - For "choose" mode, pick 1 random active.
 * - For "team" mode, we’ll draw lines in the loop and show text as well.
 */
function lockAndShowResult() {
    locked = true;
    showingResult = true;

    const mode = getCurrentMode();
    const activeKeys = Object.keys(touchesData);

    // If there's no touch, do nothing special
    if (activeKeys.length === 0) return;

    if (mode === 'choose') {
        // Pick exactly one winner
        const chosenKey = activeKeys[Math.floor(Math.random() * activeKeys.length)];
        for (let id of activeKeys) {
            if (id !== chosenKey) {
                touchesData[id].active = false; // hide non-chosen
            }
        }
        // Show a single-line result: "Winner: <ColorName>"
        const chosenColor = touchesData[chosenKey].color;
        const chosenColorName = getColorName(chosenColor);
        resultOverlay.innerHTML = `Winner: <span style="color:${chosenColor}">${chosenColorName}</span>`;
        resultOverlay.style.display = 'block';
    }
    else if (mode === 'team') {
        // Partition touches into N teams (number from countInput)
        let teamCount = parseInt(countInput.value, 10);
        if (teamCount < 1) teamCount = 1;
        if (teamCount > activeKeys.length) teamCount = activeKeys.length;

        // Get array of {color} from touches
        let touchArray = activeKeys.map(id => ({ id, color: touchesData[id].color }));

        // Shuffle the array (simple Durstenfeld shuffle)
        for (let i = touchArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [touchArray[i], touchArray[j]] = [touchArray[j], touchArray[i]];
        }

        // Create empty teams
        let teams = [];
        for (let i = 0; i < teamCount; i++) {
            teams.push([]);
        }

        // Distribute touches into teams in order
        let index = 0;
        for (let touchObj of touchArray) {
            teams[index].push(touchObj);
            index = (index + 1) % teamCount;
        }

        // Build a multiline string: "Team 1: colorA, colorB\nTeam 2: colorC..."
        let resultText = '';
        teams.forEach((team, i) => {
            let teamLabel = `Team ${i+1}: `;
            // Each color name
            let colorStrings = team.map(({ color }) => {
                let name = getColorName(color);
                return `<span style="color:${color}">${name}</span>`;
            });
            resultText += teamLabel + colorStrings.join(', ') + '<br>';
        });

        resultOverlay.innerHTML = resultText;
        resultOverlay.style.display = 'block';
    }

    // After 10 seconds, reset automatically so we can play again
    if (resultTimer) {
        clearTimeout(resultTimer);
    }
    resultTimer = setTimeout(() => {
        resetAll();
    }, 10000);
}

/**
 * Draw lines between all active touches in "team" mode
 */
function drawTeamLines() {
    const activeTouches = Object.values(touchesData).filter(t => t.active);
    for (let i = 0; i < activeTouches.length; i++) {
        for (let j = i + 1; j < activeTouches.length; j++) {
            drawLineBetween(activeTouches[i], activeTouches[j]);
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
 * Get color mode from radio
 */
function getCurrentMode() {
    for (let radio of modeRadios) {
        if (radio.checked) return radio.value;
    }
    return 'choose'; // default
}

/**
 * Convert color code (e.g. #0082c8) to a simple name ("Blue")
 */
function getColorName(colorCode) {
    return COLOR_NAMES[colorCode] || colorCode;
}

/**
 * Reset everything so a new game can start
 */
function resetAll() {
    // Clear touches
    touchesData = {};
    showingResult = false;
    locked = false;
    lastTouchTime = 0;

    // Hide overlays
    hintDiv.style.display = 'block';
    resultOverlay.style.display = 'none';
    resultOverlay.innerHTML = '';

    // Cancel any pending reset timers
    if (resultTimer) {
        clearTimeout(resultTimer);
        resultTimer = null;
    }
}
