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

// Map color codes to friendly names
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

// Whether we’re showing a final result
let showingResult = false;

// Once locked, ignore new touches or movement
let locked = false;

// Timer handle for auto-reset (10s after showing result)
let resultTimer = null;

/**
 * An array of teams (only used in Team mode):
 *  teams = [
 *    [ { id: 'someTouchId', color: '#0082c8' }, ... ],
 *    [ ... ]
 *  ];
 * We'll fill this in lockAndShowResult() for "team" mode.
 */
let teams = [];

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

// Touch events
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
                // Larger initial radius (from previous request)
                radius: 100,
                active: true
            };
        }
    }
    updateLastTouchTime(); // Only update time on start/end
}

function handleTouchMove(ev) {
    if (locked) return;  // We ignore moves if locked
    ev.preventDefault();

    // DO NOT update lastTouchTime here
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

    // Show hint if no touches exist (and no final result yet)
    if (Object.keys(touchesData).length === 0 && !showingResult) {
        hintDiv.style.display = 'block';
    }

    const mode = getCurrentMode();

    // Always animate the aims of active touches, so winner or team members keep rotating/pulsing
    for (let id in touchesData) {
        const data = touchesData[id];
        if (!data.active) continue;

        // Update rotation & pulsation
        data.angle += 0.05;
        // 2× bigger => 80–120 range
        data.radius = 80 + 40 * Math.abs(Math.sin(data.angle));

        // Draw aim
        drawAim(data);
    }

    // If we're in team mode and showing result, connect only teammates
    if (showingResult && mode === 'team') {
        drawTeamLines();
    }

    // Check inactivity => lock and show result
    if (
        !locked &&
        !showingResult &&
        (Date.now() - lastTouchTime > INACTIVITY_TIMEOUT) &&
        Object.keys(touchesData).length > 0
    ) {
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
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
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
 * Lock canvas => no more position updates. Then show result.
 * - For "choose" mode, pick 1 random active.
 * - For "team" mode, partition and store in "teams".
 */
function lockAndShowResult() {
    locked = true;
    showingResult = true;

    const mode = getCurrentMode();
    const activeKeys = Object.keys(touchesData);

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
        resultOverlay.innerHTML =
            `Winner: <span style="color:${chosenColor}">${chosenColorName}</span>`;
        resultOverlay.style.display = 'block';
    } else if (mode === 'team') {
        // Partition touches into N teams
        let teamCount = parseInt(countInput.value, 10);
        if (teamCount < 1) teamCount = 1;
        if (teamCount > activeKeys.length) teamCount = activeKeys.length;

        // Prepare array of { id, color }
        let touchArray = activeKeys.map((id) => ({ id, color: touchesData[id].color }));

        // Shuffle the array
        for (let i = touchArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [touchArray[i], touchArray[j]] = [touchArray[j], touchArray[i]];
        }

        // Create empty teams array
        teams = [];
        for (let i = 0; i < teamCount; i++) {
            teams.push([]);
        }

        // Distribute touches in order
        let index = 0;
        for (let touchObj of touchArray) {
            teams[index].push(touchObj);
            index = (index + 1) % teamCount;
        }

        // Build multiline text for the result overlay
        let resultText = '';
        teams.forEach((team, i) => {
            let teamLabel = `Team ${i + 1}: `;
            let colorStrings = team.map(({ color }) => {
                let name = getColorName(color);
                return `<span style="color:${color}">${name}</span>`;
            });
            resultText += teamLabel + colorStrings.join(', ') + '<br>';
        });

        resultOverlay.innerHTML = resultText;
        resultOverlay.style.display = 'block';
    }

    // After 10 seconds, reset automatically
    if (resultTimer) clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
        resetAll();
    }, 10000);
}

/**
 * Draw lines only among members of the same team
 */
function drawTeamLines() {
    // teams is an array of arrays
    for (let team of teams) {
        // team is like: [ { id, color }, ...]
        // We'll create a local array of the actual "touch data" objects
        let teamTouches = team
            .map((member) => touchesData[member.id])
            .filter((td) => td && td.active);

        // Double loop to draw lines among them
        for (let i = 0; i < teamTouches.length; i++) {
            for (let j = i + 1; j < teamTouches.length; j++) {
                drawLineBetween(teamTouches[i], teamTouches[j]);
            }
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
 * Helper: get current mode
 */
function getCurrentMode() {
    for (let radio of modeRadios) {
        if (radio.checked) return radio.value;
    }
    return 'choose';
}

/**
 * Convert color code to friendly name
 */
function getColorName(colorCode) {
    return COLOR_NAMES[colorCode] || colorCode;
}

/**
 * Reset everything
 */
function resetAll() {
    // Clear touches
    touchesData = {};
    showingResult = false;
    locked = false;
    lastTouchTime = 0;

    // Clear teams
    teams = [];

    // Hide overlays
    hintDiv.style.display = 'block';
    resultOverlay.style.display = 'none';
    resultOverlay.innerHTML = '';

    // Cancel any pending reset timer
    if (resultTimer) {
        clearTimeout(resultTimer);
        resultTimer = null;
    }
}
