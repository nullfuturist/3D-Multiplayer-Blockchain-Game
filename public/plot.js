// 3D Math Functions
function project3D(x, y, z) {
    const dx = x - GameState.camera.x;
    const dy = y - GameState.camera.y;
    const dz = z - GameState.camera.z;
    
    const cos_y = Math.cos(-GameState.camera.rotY);
    const sin_y = Math.sin(-GameState.camera.rotY);
    const x_rot = dx * cos_y - dz * sin_y;
    const z_rot = dx * sin_y + dz * cos_y;
    
    const cos_x = Math.cos(-GameState.camera.rotX);
    const sin_x = Math.sin(-GameState.camera.rotX);
    const y_rot = dy * cos_x - z_rot * sin_x;
    const z_final = dy * sin_x + z_rot * cos_x;
    
    if (z_final <= 0.1) return null;
    
    const scale = (UI.plotCanvas.height / 2) / Math.tan(GameState.camera.fov / 2);
    const screenX = UI.plotCanvas.width / 2 + (x_rot * scale) / z_final;
    const screenY = UI.plotCanvas.height / 2 - (y_rot * scale) / z_final;
    
    return {
        x: screenX,
        y: screenY,
        z: z_final,
        distance: Math.sqrt(dx*dx + dy*dy + dz*dz)
    };
}

function drawCube(x, y, z, width, height, depth, color) {
    const vertices = [
        [x - width/2, y, z - depth/2],
        [x + width/2, y, z - depth/2],
        [x + width/2, y + height, z - depth/2],
        [x - width/2, y + height, z - depth/2],
        [x - width/2, y, z + depth/2],
        [x + width/2, y, z + depth/2],
        [x + width/2, y + height, z + depth/2],
        [x - width/2, y + height, z + depth/2]
    ];
    
    const faces = [
        [0, 1, 2, 3], // Front
        [5, 4, 7, 6], // Back
        [4, 0, 3, 7], // Left
        [1, 5, 6, 2], // Right
        [3, 2, 6, 7], // Top
        [4, 5, 1, 0]  // Bottom
    ];
    
    const projectedVertices = vertices.map(v => project3D(v[0], v[1], v[2]));
    
    faces.forEach((face, faceIndex) => {
        const projectedFace = face.map(i => projectedVertices[i]).filter(v => v !== null);
        if (projectedFace.length < 3) return;
        
        let brightness = 1;
        if (faceIndex === 0) brightness = 0.9;
        else if (faceIndex === 1) brightness = 0.6;
        else if (faceIndex === 2) brightness = 0.7;
        else if (faceIndex === 3) brightness = 0.8;
        else if (faceIndex === 4) brightness = 1.0;
        else brightness = 0.5;
        
        const rgb = hexToRgb(color);
        const litColor = `rgb(${Math.floor(rgb.r * brightness)}, ${Math.floor(rgb.g * brightness)}, ${Math.floor(rgb.b * brightness)})`;
        
        UI.ctx.fillStyle = litColor;
        UI.ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        UI.ctx.lineWidth = 1;
        
        UI.ctx.beginPath();
        UI.ctx.moveTo(projectedFace[0].x, projectedFace[0].y);
        for (let i = 1; i < projectedFace.length; i++) {
            UI.ctx.lineTo(projectedFace[i].x, projectedFace[i].y);
        }
        UI.ctx.closePath();
        UI.ctx.fill();
        UI.ctx.stroke();
    });
}

function enterPlotMode() {
    GameState.gameMode = 'plot';
    UI.worldView.classList.add('hidden');
    UI.plotView.classList.remove('hidden');
    updateGameMode();
    
    GameState.camera.x = GameState.currentUser.plotX;
    GameState.camera.y = GameState.currentUser.plotY;
    GameState.camera.z = GameState.currentUser.plotZ;
    GameState.camera.rotY = GameState.currentUser.plotRotY;
    GameState.camera.rotX = 0;
    
    UI.plotCanvas.width = window.innerWidth;
    UI.plotCanvas.height = window.innerHeight;
    
    updateObjectCount();
    updatePlotPlayerCount();
    renderPlot();
    UI.nftUI.classList.remove('hidden');
    GameState.socket.emit('requestInventory');
    // Request plot sync for debugging
    setTimeout(() => {
        GameState.socket.emit('requestPlotSync');
    }, 1000);
}

function exitPlotMode() {
    GameState.gameMode = 'world';
    UI.plotView.classList.add('hidden');
    UI.worldView.classList.remove('hidden');
    updateGameMode();
    
    // Generate and save final thumbnail before exiting
    if (GameState.currentPlot) {
        const thumbnail = generateThumbnail(GameState.plotObjects);
        saveThumbnailToStorage(GameState.currentPlot.id, thumbnail);
        
        // Update the world map square immediately
        const plotSquare = document.querySelector(`[data-plot-id="${GameState.currentPlot.id}"]`);
        if (plotSquare) {
            const existingThumbnail = plotSquare.querySelector('.plot-thumbnail');
            if (existingThumbnail) {
                existingThumbnail.src = thumbnail;
            } else {
                plotSquare.innerHTML = '';
                const newThumbnail = document.createElement('img');
                newThumbnail.className = 'plot-thumbnail';
                newThumbnail.src = thumbnail;
                plotSquare.appendChild(newThumbnail);
            }
        }
    }
    UI.nftUI.classList.add('hidden');
    GameState.currentPlot = null;
    GameState.plotObjects = [];
    GameState.plotPlayers.clear();
    GameState.mouseCapture = false;
    document.exitPointerLock();
}

function renderPlot() {
    if (GameState.gameMode !== 'plot' || !GameState.currentUser) return;

    UI.ctx.clearRect(0, 0, UI.plotCanvas.width, UI.plotCanvas.height);

    // Sky to ground gradient
    const gradient = UI.ctx.createLinearGradient(0, 0, 0, UI.plotCanvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.6, '#98D8E8');
    gradient.addColorStop(0.6, '#228B22');
    gradient.addColorStop(1, '#1F5F1F');
    UI.ctx.fillStyle = gradient;
    UI.ctx.fillRect(0, 0, UI.plotCanvas.width, UI.plotCanvas.height);

    // DEBUG: Detailed object logging
    console.log('=== RENDER DEBUG ===');
    console.log('Total plot objects:', GameState.plotObjects.length);
    console.log('Camera position:', GameState.camera.x, GameState.camera.y, GameState.camera.z);
    console.log('Camera rotation:', GameState.camera.rotX, GameState.camera.rotY);

    GameState.plotObjects.forEach((obj, index) => {
        console.log(`Object ${index}: ${obj.type} at (${obj.x}, ${obj.y}, ${obj.z})`);
        if (obj.type === 'nft_model') {
            console.log(`  NFT: ${obj.name}`);
            console.log(`  ModelData exists:`, !!obj.modelData);
            console.log(`  Vertices:`, obj.modelData?.vertices?.length);
            console.log(`  Edges:`, obj.modelData?.edges?.length);
        }
    });

    const sortedObjects = [...GameState.plotObjects].sort((a, b) => {
        const distA = Math.sqrt((a.x - GameState.camera.x)**2 + (a.z - GameState.camera.z)**2);
        const distB = Math.sqrt((b.x - GameState.camera.x)**2 + (b.z - GameState.camera.z)**2);
        return distB - distA;
    });

    sortedObjects.forEach((obj, index) => {
        console.log(`Rendering object ${index}: ${obj.type}`);

        if (obj.type === 'exit') {
            drawCube(obj.x, obj.y, obj.z, obj.width, obj.height, obj.depth, obj.color);
        } else if (obj.type === 'nft_model') {
            console.log('About to call drawNFTModel for:', obj.name);
            drawNFTModel(obj);
            console.log('drawNFTModel call completed');
        } else {
            drawCube(obj.x, obj.y, obj.z, obj.width, obj.height, obj.depth, obj.color);
        }
    });

    GameState.plotPlayers.forEach(player => {
        if (player.sessionId !== GameState.currentUser.sessionId) {
            drawPlayer(player);
        }
    });

    requestAnimationFrame(renderPlot);
}

function generateThumbnail(objects) {
    UI.thumbnailCtx.clearRect(0, 0, 100, 100);
    
    UI.thumbnailCtx.fillStyle = '#228B22';
    UI.thumbnailCtx.fillRect(0, 0, 100, 100);
    
    objects.forEach(obj => {
        UI.thumbnailCtx.fillStyle = obj.color;
        const x = obj.x;
        const z = obj.z;
        
        if (obj.type === 'exit') {
            UI.thumbnailCtx.save();
            UI.thumbnailCtx.translate(x, z);
            UI.thumbnailCtx.rotate(Math.PI / 4);
            UI.thumbnailCtx.fillRect(-2, -2, 4, 4);
            UI.thumbnailCtx.restore();
        } else {
            UI.thumbnailCtx.fillRect(x - 1, z - 1, 2, 2);
        }
    });
    
    return UI.thumbnailCanvas.toDataURL();
}
