// Main application initialization and socket handlers

// Phantom Wallet Connection
UI.connectWalletBtn.addEventListener('click', async () => {
    if (window.solana && window.solana.isPhantom) {
        try {
            const response = await window.solana.connect();
            const publicKey = response.publicKey.toString();
            
            UI.connectWalletBtn.style.display = 'none';
            UI.walletInfo.classList.remove('hidden');
            UI.publicKeySpan.textContent = publicKey.substring(0, 8) + '...';
            
            // Connect to game
            GameState.socket.emit('connectWallet', { publicKey });
            
        } catch (error) {
            console.error('Wallet connection failed:', error);
            alert('Failed to connect wallet');
        }
    } else {
        alert('Phantom wallet not found! Please install Phantom wallet extension.');
    }
});

// Socket Events
GameState.socket.on('init', (data) => {
    console.log('Received init data:', data);
    GameState.currentUser = data.user;
    GameState.worldMap = data.worldMap;
    
    data.users.forEach(user => {
        GameState.users.set(user.sessionId, user);
    });
    
    setTimeout(() => {
        initWorldView();
        updateUserCount();
        updateGameMode();
        updatePosition();
    }, 100);
});

GameState.socket.on('userJoined', (user) => {
    console.log('User joined:', user.publicKey.substring(0, 8));
    GameState.users.set(user.sessionId, user);
    if (GameState.gameMode === 'world' && !user.currentPlot) {
        addWorldPlayer(user);
    }
    updateUserCount();
});

GameState.socket.on('userLeft', (sessionId) => {
    console.log('User left:', sessionId);
    GameState.users.delete(sessionId);
    removePlayer(sessionId);
    if (GameState.gameMode === 'plot') {
        GameState.plotPlayers.delete(sessionId);
        updatePlotPlayerCount();
    }
    updateUserCount();
});

GameState.socket.on('userWorldMoved', (data) => {
    if (GameState.users.has(data.sessionId)) {
        const user = GameState.users.get(data.sessionId);
        user.worldX = data.x;
        user.worldY = data.y;
        updatePlayerPosition(data.sessionId, data.x, data.y);
    }
});

GameState.socket.on('enteredPlot', (data) => {
    console.log('Entered plot:', data.plotId, 'with', data.players.length, 'players');
    GameState.currentPlot = data.plotData;
    GameState.plotObjects = [...data.plotData.objects];
    GameState.plotPlayers.clear();
    
    data.players.forEach(player => {
        GameState.plotPlayers.set(player.sessionId, player);
    });
    
    enterPlotMode();
    updateDebugInfo();
});

GameState.socket.on('userPlotMovedBinary', (packet) => {
    if (GameState.plotPlayers.has(packet.sessionId)) {
        const view = new DataView(packet.data);
        const player = GameState.plotPlayers.get(packet.sessionId);
        player.plotX = view.getFloat32(0, true);
        player.plotY = view.getFloat32(4, true);
        player.plotZ = view.getFloat32(8, true);
        player.plotRotY = view.getFloat32(12, true);
    }
});

GameState.socket.on('userPlotMoved', (data) => {
    if (GameState.plotPlayers.has(data.sessionId)) {
        const player = GameState.plotPlayers.get(data.sessionId);
        player.plotX = data.x;
        player.plotY = data.y;
        player.plotZ = data.z;
        player.plotRotY = data.rotY;
    }
});

GameState.socket.on('playerJoinedPlot', (player) => {
    console.log('Player joined current plot:', player.publicKey.substring(0, 8));
    if (GameState.gameMode === 'plot') {
        GameState.plotPlayers.set(player.sessionId, player);
        updatePlotPlayerCount();
        updateDebugInfo();
    }
});

GameState.socket.on('playerLeftPlot', (sessionId) => {
    console.log('Player left current plot:', sessionId);
    if (GameState.gameMode === 'plot') {
        GameState.plotPlayers.delete(sessionId);
        updatePlotPlayerCount();
        updateDebugInfo();
    }
});

GameState.socket.on('objectPlaced', (data) => {
    console.log('Object placed:', data);
    if (GameState.gameMode === 'plot' && GameState.currentPlot && GameState.currentPlot.id === data.plotId) {
        GameState.plotObjects.push(data.object);
        updateObjectCount();
        updateDebugInfo();
        
        // Generate and save thumbnail locally
        const now = Date.now();
        if (now - GameState.lastThumbnailUpdate > 2000) { // Throttle thumbnail generation
            GameState.lastThumbnailUpdate = now;
            setTimeout(() => {
                const thumbnail = generateThumbnail(GameState.plotObjects);
                saveThumbnailToStorage(data.plotId, thumbnail);
            }, 500);
        }
    }
});

GameState.socket.on('exitedPlot', () => {
    console.log('Exited plot');
    exitPlotMode();
});

GameState.socket.on('plotSyncResponse', (data) => {
    console.log('Plot sync response:', data);
    if (GameState.gameMode === 'plot' && GameState.currentPlot && GameState.currentPlot.id === data.plotId) {
        GameState.plotObjects = [...data.objects];
        GameState.plotPlayers.clear();
        data.players.forEach(player => {
            GameState.plotPlayers.set(player.sessionId, player);
        });
        updateObjectCount();
        updatePlotPlayerCount();
        updateDebugInfo();
    }
});

// Add these variables to GameState
GameState.nftInventory = [];
GameState.selectedNFT = null;
GameState.selectedNFTIndex = -1;

// Add NFT UI elements to UI object
UI.nftUI = document.getElementById('nftUI');
UI.nftPubkeyInput = document.getElementById('nftPubkeyInput');
UI.addNFTBtn = document.getElementById('addNFTBtn');
UI.nftStatus = document.getElementById('nftStatus');
UI.nftInventory = document.getElementById('nftInventory');
UI.selectedNFTSpan = document.getElementById('selectedNFT');

// Add NFT event listeners
function initializeNFTSystem() {
    UI.addNFTBtn.addEventListener('click', () => {
        const pubkey = UI.nftPubkeyInput.value.trim();
        if (pubkey) {
            GameState.socket.emit('addNFTToInventory', { nftPubkey: pubkey });
            UI.nftPubkeyInput.value = '';
        }
    });

    UI.nftPubkeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            UI.addNFTBtn.click();
        }
    });
}

// Add NFT socket handlers
GameState.socket.on('nftLoadStatus', (data) => {
    UI.nftStatus.textContent = `${data.status}: ${data.message}`;
    setTimeout(() => {
        UI.nftStatus.textContent = '';
    }, 3000);
});

GameState.socket.on('nftAddedToInventory', (data) => {
    GameState.nftInventory.push(data);
    updateNFTInventoryUI();
    UI.nftStatus.textContent = `Added: ${data.name}`;
    setTimeout(() => {
        UI.nftStatus.textContent = '';
    }, 3000);
});

GameState.socket.on('inventoryData', (data) => {
    GameState.nftInventory = data.inventory;
    updateNFTInventoryUI();
});

GameState.socket.on('nftModelPlaced', (data) => {
    if (data.plotId === GameState.currentUser.currentPlot) {
        GameState.plotObjects.push(data.object);
        updateObjectCount();
    }
});

GameState.socket.on('nftPlaceError', (data) => {
    UI.nftStatus.textContent = `Error: ${data.message}`;
    setTimeout(() => {
        UI.nftStatus.textContent = '';
    }, 3000);
});

function updateNFTInventoryUI() {
    UI.nftInventory.innerHTML = '';
    GameState.nftInventory.forEach((nft, index) => {
        const div = document.createElement('div');
        div.className = 'nft-item';
        div.textContent = `${index + 1}. ${nft.name}`;
        div.onclick = () => selectNFT(index);
        if (index === GameState.selectedNFTIndex) {
            div.classList.add('selected');
        }
        UI.nftInventory.appendChild(div);
    });
}

function selectNFT(index) {
    GameState.selectedNFTIndex = index;
    GameState.selectedNFT = GameState.nftInventory[index];
    UI.selectedNFTSpan.textContent = GameState.selectedNFT ? GameState.selectedNFT.name : 'None';
    updateNFTInventoryUI();
}

// Game loop
function gameLoop() {
    handleMovement();
    requestAnimationFrame(gameLoop);
}

// Initialize controls and start game loop
// After connectWallet success
initializeNFTSystem();
initializeControls();
gameLoop();

console.log('Phantom 3D World initialized with persistence!');
