// World View Functions
function initWorldView() {
    if (!GameState.worldMap || GameState.worldMap.length === 0) return;
    
    UI.worldView.innerHTML = '';
    
    GameState.worldMap.forEach(node => {
        if (node.connections) {
            node.connections.forEach(connId => {
                const connNode = GameState.worldMap.find(n => n.id === connId);
                if (connNode && node.id < connId) {
                    drawPath(node, connNode);
                }
            });
        }
    });
    
    GameState.worldMap.forEach(node => {
        addPlotSquare(node);
    });
    
    if (GameState.currentUser) {
        addWorldPlayer(GameState.currentUser, true);
    }
    
    GameState.users.forEach(user => {
        if (!user.currentPlot) {
            addWorldPlayer(user);
        }
    });
}

function drawPath(node1, node2) {
    const path = document.createElement('div');
    path.className = 'path';
    
    const dx = node2.x - node1.x;
    const dy = node2.y - node1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    path.style.width = length + 'px';
    path.style.height = '3px';
    path.style.left = node1.x + 'px';
    path.style.top = node1.y + 'px';
    path.style.transformOrigin = '0 0';
    path.style.transform = `rotate(${angle}rad)`;
    
    UI.worldView.appendChild(path);
}

function addPlotSquare(node) {
    const square = document.createElement('div');
    square.className = 'plot-square';
    square.style.backgroundColor = node.color;
    square.style.left = node.x + 'px';
    square.style.top = node.y + 'px';
    square.dataset.plotId = node.id;
    
    // Load thumbnail from local storage
    const savedThumbnail = loadThumbnailFromStorage(node.id);
    if (savedThumbnail) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'plot-thumbnail';
        thumbnail.src = savedThumbnail;
        square.appendChild(thumbnail);
    } else {
        square.textContent = node.id.split('_')[1];
    }
    
    UI.worldView.appendChild(square);
}

function addWorldPlayer(user, isCurrentUser = false) {
    if (!user) return;
    
    const dot = document.createElement('div');
    dot.className = 'player-dot' + (isCurrentUser ? ' user-dot' : '');
    dot.style.backgroundColor = user.color;
    dot.style.left = user.worldX + 'px';
    dot.style.top = user.worldY + 'px';
    dot.dataset.playerId = user.sessionId;
    
    UI.worldView.appendChild(dot);
}

function updatePlayerPosition(sessionId, x, y) {
    const dot = document.querySelector(`[data-player-id="${sessionId}"]`);
    if (dot) {
        dot.style.left = x + 'px';
        dot.style.top = y + 'px';
    }
}

function removePlayer(sessionId) {
    const dot = document.querySelector(`[data-player-id="${sessionId}"]`);
    if (dot) {
        dot.remove();
    }
}

function isValidWorldPosition(x, y) {
    if (!GameState.worldMap || GameState.worldMap.length === 0) return false;
    
    const maxDistance = 40;
    
    for (let node of GameState.worldMap) {
        const dx = x - node.x;
        const dy = y - node.y;
        if (Math.sqrt(dx * dx + dy * dy) < 25) {
            return true;
        }
    }
    
    for (let node of GameState.worldMap) {
        if (!node.connections) continue;
        
        for (let connId of node.connections) {
            const connNode = GameState.worldMap.find(n => n.id === connId);
            if (!connNode) continue;
            
            const dist = distanceToLineSegment(x, y, node.x, node.y, connNode.x, connNode.y);
            if (dist < maxDistance) {
                return true;
            }
        }
    }
    
    return false;
}

function distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
        const dx2 = px - x1;
        const dy2 = py - y1;
        return Math.sqrt(dx2 * dx2 + dy2 * dy2);
    }
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dx3 = px - projX;
    const dy3 = py - projY;
    
    return Math.sqrt(dx3 * dx3 + dy3 * dy3);
}
