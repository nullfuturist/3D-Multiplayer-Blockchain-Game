// Game state
const GameState = {
    socket: io(),
    currentUser: null,
    gameMode: 'world', // 'world' or 'plot'
    users: new Map(),
    worldMap: [],
    currentPlot: null,
    plotObjects: [],
    plotPlayers: new Map(),
    mouseCapture: false,
    lastThumbnailUpdate: 0,
    debugMode: false,
    
    // Input state
    keys: {},
    mouseX: 0,
    mouseY: 0,
    mouseSensitivity: 0.002,
    turnSpeed: 0.05,
    
    // Camera
    camera: {
        x: 50, y: 1.7, z: 50,
        rotX: 0, rotY: 0,
        fov: Math.PI / 3,
        near: 0.1,
        far: 100
    }
};

// UI Elements
const UI = {
    connectWalletBtn: document.getElementById('connectWallet'),
    walletInfo: document.getElementById('walletInfo'),
    publicKeySpan: document.getElementById('publicKey'),
    userCountSpan: document.getElementById('userCount'),
    gameModeSpan: document.getElementById('gameMode'),
    positionSpan: document.getElementById('position'),
    heightInfo: document.getElementById('heightInfo'),
    objectCount: document.getElementById('objectCount'),
    plotPlayerCount: document.getElementById('plotPlayerCount'),
    worldView: document.getElementById('worldView'),
    plotView: document.getElementById('plotView'),
    plotCanvas: document.getElementById('plotCanvas'),
    ctx: document.getElementById('plotCanvas').getContext('2d'),
    thumbnailCanvas: document.getElementById('thumbnailCanvas'),
    thumbnailCtx: document.getElementById('thumbnailCanvas').getContext('2d'),
    debugInfo: document.getElementById('debugInfo'),
    currentPlotId: document.getElementById('currentPlotId'),
    debugPlayers: document.getElementById('debugPlayers'),
    debugObjects: document.getElementById('debugObjects')
};

// Utility functions
function saveThumbnailToStorage(plotId, thumbnailData) {
    try {
        localStorage.setItem(`thumbnail_${plotId}`, thumbnailData);
    } catch (e) {
        console.warn('Could not save thumbnail to localStorage:', e);
    }
}

function loadThumbnailFromStorage(plotId) {
    try {
        return localStorage.getItem(`thumbnail_${plotId}`);
    } catch (e) {
        console.warn('Could not load thumbnail from localStorage:', e);
        return null;
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : {r: 255, g: 255, b: 255};
}

// UI Update functions
function updateUserCount() {
    UI.userCountSpan.textContent = GameState.users.size + (GameState.currentUser ? 1 : 0);
}

function updateGameMode() {
    UI.gameModeSpan.textContent = GameState.gameMode === 'world' ? 'World Map' : 'First Person';
}

function updatePosition() {
    if (GameState.currentUser) {
        if (GameState.gameMode === 'world') {
            UI.positionSpan.textContent = `${Math.round(GameState.currentUser.worldX)}, ${Math.round(GameState.currentUser.worldY)}`;
        } else {
            UI.positionSpan.textContent = `${GameState.currentUser.plotX.toFixed(1)}, ${GameState.currentUser.plotY.toFixed(1)}, ${GameState.currentUser.plotZ.toFixed(1)}`;
        }
    }
}

function updateObjectCount() {
    UI.objectCount.textContent = GameState.plotObjects.length;
}

function updatePlotPlayerCount() {
    UI.plotPlayerCount.textContent = GameState.plotPlayers.size + 1;
}

function updateDebugInfo() {
    if (GameState.debugMode) {
        UI.currentPlotId.textContent = GameState.currentPlot ? GameState.currentPlot.id : '-';
        UI.debugPlayers.textContent = GameState.plotPlayers.size + 1;
        UI.debugObjects.textContent = GameState.plotObjects.length;
    }
}
