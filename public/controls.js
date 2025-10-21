// Movement and Controls
function handleMovement() {
    if (!GameState.currentUser) return;
    
    const speed = 0.2;
    const worldSpeed = 2;
    
    if (GameState.gameMode === 'world') {
        let newX = GameState.currentUser.worldX;
        let newY = GameState.currentUser.worldY;
        
        if (GameState.keys['w'] || GameState.keys['W']) newY -= worldSpeed;
        if (GameState.keys['s'] || GameState.keys['S']) newY += worldSpeed;
        if (GameState.keys['a'] || GameState.keys['A']) newX -= worldSpeed;
        if (GameState.keys['d'] || GameState.keys['D']) newX += worldSpeed;
        
        const validMove = isValidWorldPosition(newX, newY);
        if (validMove) {
            GameState.currentUser.worldX = newX;
            GameState.currentUser.worldY = newY;
            updatePlayerPosition(GameState.currentUser.sessionId, newX, newY);
            GameState.socket.emit('worldMove', { x: newX, y: newY });
            updatePosition();
        }
        
    } else if (GameState.gameMode === 'plot') {
        let newX = GameState.currentUser.plotX;
        let newY = GameState.currentUser.plotY;
        let newZ = GameState.currentUser.plotZ;
        
        // Calculate movement direction based on camera rotation
        const cos_y = Math.cos(-GameState.camera.rotY);
        const sin_y = Math.sin(-GameState.camera.rotY);
        
        // Forward/backward movement with W/S
        if (GameState.keys['w'] || GameState.keys['W']) {
            newX += speed * sin_y;
            newZ += speed * cos_y;
        }
        if (GameState.keys['s'] || GameState.keys['S']) {
            newX -= speed * sin_y;
            newZ -= speed * cos_y;
        }
        
        // Strafe left/right with A/D
        if (GameState.keys['a'] || GameState.keys['A']) {
            newX -= speed * cos_y;
            newZ += speed * sin_y;
        }
        if (GameState.keys['d'] || GameState.keys['D']) {
            newX += speed * cos_y;
            newZ -= speed * sin_y;
        }
        
        // Vertical movement
        if (GameState.keys[' ']) newY += speed;
        if (GameState.keys['c'] || GameState.keys['C']) newY -= speed;
        
        // Turn left/right with Q/E
        if (GameState.keys['q'] || GameState.keys['Q']) {
            GameState.camera.rotY += GameState.turnSpeed;
        }
        if (GameState.keys['e'] || GameState.keys['E']) {
            GameState.camera.rotY -= GameState.turnSpeed;
        }
        
        // Clamp positions to plot boundaries
        newX = Math.max(1, Math.min(99, newX));
        newZ = Math.max(1, Math.min(99, newZ));
        newY = Math.max(0.5, Math.min(20, newY));
        
        if (newX !== GameState.currentUser.plotX || newY !== GameState.currentUser.plotY || newZ !== GameState.currentUser.plotZ || GameState.camera.rotY !== GameState.currentUser.plotRotY) {
            GameState.currentUser.plotX = newX;
            GameState.currentUser.plotY = newY;
            GameState.currentUser.plotZ = newZ;
            GameState.currentUser.plotRotY = GameState.camera.rotY;
            
            GameState.camera.x = newX;
            GameState.camera.y = newY;
            GameState.camera.z = newZ;
            
            // Binary movement encoding
            const buffer = new ArrayBuffer(16);
            const view = new DataView(buffer);
            view.setFloat32(0, newX, true);
            view.setFloat32(4, newY, true);
            view.setFloat32(8, newZ, true);
            view.setFloat32(12, GameState.camera.rotY, true);
            GameState.socket.emit('plotMoveBinary', buffer);
            
            updatePosition();
            UI.heightInfo.textContent = newY.toFixed(1);
        }
    }
}

// Event Listeners
function initializeControls() {

    
    window.addEventListener('keydown', (e) => {
        GameState.keys[e.key] = true;

    // NFT model placement with number keys 1-9
    if (GameState.gameMode === 'plot' && GameState.selectedNFT) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
            const distance = 3;
            const placeX = GameState.currentUser.plotX + distance * Math.sin(-GameState.camera.rotY);
            const placeZ = GameState.currentUser.plotZ + distance * Math.cos(-GameState.camera.rotY);
            const placeY = 0;
            
            if (placeX > 1 && placeX < 99 && placeZ > 1 && placeZ < 99) {
                const tooClose = GameState.plotObjects.some(obj => {
                    const dx = obj.x - placeX;
                    const dz = obj.z - placeZ;
                    return Math.sqrt(dx * dx + dz * dz) < 3;
                });
                
                if (!tooClose) {
                    console.log(`Placing NFT model: ${GameState.selectedNFT.name}`);
                    GameState.socket.emit('placeNFTModel', {
                        nftPubkey: GameState.selectedNFT.pubkey,
                        x: placeX,
                        y: placeY,
                        z: placeZ,
                        rotY: GameState.camera.rotY
                    });
                } else {
                    console.log('Cannot place NFT model: too close to existing object');
                }
            }
            e.preventDefault();
        }
    }
if (e.key === 'z' || e.key === 'Z') {
    if (GameState.gameMode === 'plot') {
        // Generate random garbled geometry
        const distance = 2 + Math.random() * 4; // Random distance 2-6 units away
        const angle = Math.random() * Math.PI * 2; // Random direction
        
        const placeX = GameState.currentUser.plotX + distance * Math.cos(angle);
        const placeZ = GameState.currentUser.plotZ + distance * Math.sin(angle);
        const placeY = Math.random() * 3; // Random height 0-3
        
        if (placeX > 1 && placeX < 99 && placeZ > 1 && placeZ < 99) {
            const tooClose = GameState.plotObjects.some(obj => {
                const dx = obj.x - placeX;
                const dz = obj.z - placeZ;
                return Math.sqrt(dx * dx + dz * dz) < 2;
            });
            
            if (!tooClose) {
                // Create random garbled geometry parameters
                const geometryType = Math.floor(Math.random() * 4); // 0-3 different types
                let geometryData = {};
                
                switch(geometryType) {
                    case 0: // Stretched cube
                        geometryData = {
                            width: 0.5 + Math.random() * 4,
                            height: 0.5 + Math.random() * 6,
                            depth: 0.5 + Math.random() * 4
                        };
                        break;
                    case 1: // Thin tower
                        geometryData = {
                            width: 0.3 + Math.random() * 1,
                            height: 2 + Math.random() * 8,
                            depth: 0.3 + Math.random() * 1
                        };
                        break;
                    case 2: // Wide platform
                        geometryData = {
                            width: 2 + Math.random() * 6,
                            height: 0.2 + Math.random() * 1,
                            depth: 2 + Math.random() * 6
                        };
                        break;
                    case 3: // Random blob
                        geometryData = {
                            width: 1 + Math.random() * 3,
                            height: 1 + Math.random() * 3,
                            depth: 1 + Math.random() * 3
                        };
                        break;
                }
                
                // Generate random garbled color
                const hue = Math.random() * 360;
                const sat = 40 + Math.random() * 60; // 40-100% saturation
                const light = 30 + Math.random() * 40; // 30-70% lightness
                const garbledColor = `hsl(${hue}, ${sat}%, ${light}%)`;
                
                console.log('Placing random geometry at:', placeX.toFixed(1), placeY.toFixed(1), placeZ.toFixed(1));
                GameState.socket.emit('placeObject', {
                    x: placeX,
                    y: placeY,
                    z: placeZ,
                    type: 'garbled',
                    width: geometryData.width,
                    height: geometryData.height,
                    depth: geometryData.depth,
                    color: garbledColor
                });
            } else {
                console.log('Cannot place geometry: too close to existing object');
            }
        }
    }
}        
        if (e.key === 'Enter') {
            if (GameState.gameMode === 'world') {
                const nearPlot = GameState.worldMap.find(node => {
                    const dx = node.x - GameState.currentUser.worldX;
                    const dy = node.y - GameState.currentUser.worldY;
                    return Math.sqrt(dx * dx + dy * dy) < 25;
                });
                
                if (nearPlot) {
                    console.log('Entering plot:', nearPlot.id);
                    GameState.socket.emit('enterPlot', { plotId: nearPlot.id });
                }
            } else if (GameState.gameMode === 'plot') {
                const exit = GameState.plotObjects.find(obj => obj.type === 'exit');
                if (exit) {
                    const dx = exit.x - GameState.currentUser.plotX;
                    const dz = exit.z - GameState.currentUser.plotZ;
                    if (Math.sqrt(dx * dx + dz * dz) < 5) {
                        console.log('Exiting plot');
                        GameState.socket.emit('exitPlot');
                    }
                }
            }
        }
        
        if (e.key === 'x' || e.key === 'X') {
            if (GameState.gameMode === 'plot') {
                const distance = 3;
                // Place cube in front of where the player is facing
                const placeX = GameState.currentUser.plotX + distance * Math.sin(-GameState.camera.rotY);
                const placeZ = GameState.currentUser.plotZ + distance * Math.cos(-GameState.camera.rotY);
                const placeY = 0;
                
                if (placeX > 1 && placeX < 99 && placeZ > 1 && placeZ < 99) {
                    const tooClose = GameState.plotObjects.some(obj => {
                        const dx = obj.x - placeX;
                        const dz = obj.z - placeZ;
                        return Math.sqrt(dx * dx + dz * dz) < 3;
                    });
                    
                    if (!tooClose) {
                        console.log('Placing object at:', placeX.toFixed(1), placeY, placeZ.toFixed(1));
                        GameState.socket.emit('placeObject', {
                            x: placeX,
                            y: placeY,
                            z: placeZ
                        });
                    } else {
                        console.log('Cannot place object: too close to existing object');
                    }
                }
            }
        }

        // Debug mode toggle
        if (e.key === 'F12') {
            GameState.debugMode = !GameState.debugMode;
            UI.debugInfo.classList.toggle('hidden', !GameState.debugMode);
            e.preventDefault();
        }
        
        e.preventDefault();
    });
    
    window.addEventListener('keyup', (e) => {
        GameState.keys[e.key] = false;
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (GameState.gameMode === 'plot') {
            UI.plotCanvas.width = window.innerWidth;
            UI.plotCanvas.height = window.innerHeight;
        }
    });
}
