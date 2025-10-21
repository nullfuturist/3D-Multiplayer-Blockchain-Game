function drawPlayer(player) {
    const distance = Math.sqrt(
        (player.plotX - GameState.camera.x) ** 2 + 
        (player.plotY - GameState.camera.y) ** 2 + 
        (player.plotZ - GameState.camera.z) ** 2
    );
    
    const scale = Math.max(0.5, 25 / distance);
    
    // Generate unique model type based on player's public key
    const hash = player.publicKey ? player.publicKey.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0) : 0;
    
    const modelType = Math.abs(hash) % 4;
    const baseColor = player.color;
    
    // Draw 3D model based on type
    switch(modelType) {
        case 0: // Crystalline tower
            drawCrystalTower(player.plotX, player.plotY, player.plotZ, baseColor, scale, player.plotRotY);
            break;
        case 1: // Floating orb with rings
            drawOrbWithRings(player.plotX, player.plotY + 1, player.plotZ, baseColor, scale, player.plotRotY);
            break;
        case 2: // Geometric pillar
            drawGeometricPillar(player.plotX, player.plotY, player.plotZ, baseColor, scale, player.plotRotY);
            break;
        case 3: // Spiral monument
            drawSpiralMonument(player.plotX, player.plotY, player.plotZ, baseColor, scale, player.plotRotY);
            break;
    }
    
    // Name tag for debugging
    if (GameState.debugMode && player.publicKey) {
        const namePos = project3D(player.plotX, player.plotY + 3, player.plotZ);
        if (namePos) {
            UI.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            UI.ctx.font = 'bold 12px Arial';
            const text = player.publicKey.substring(0, 6);
            const textWidth = UI.ctx.measureText(text).width;
            UI.ctx.fillRect(namePos.x - textWidth/2 - 3, namePos.y - 8, textWidth + 6, 15);
            UI.ctx.fillStyle = '#ffffff';
            UI.ctx.fillText(text, namePos.x - textWidth/2, namePos.y + 3);
        }
    }
}

function drawCrystalTower(x, y, z, color, scale, rotY) {
    const height = 2.5 * scale;
    const width = 0.8 * scale;
    
    // Main crystal shaft
    drawCube(x, y + height/2, z, width, height, width, color);
    
    // Crystal tip
    const tipVertices = [
        [x, y + height + 0.5 * scale, z],
        [x - width/2, y + height, z - width/2],
        [x + width/2, y + height, z - width/2],
        [x + width/2, y + height, z + width/2],
        [x - width/2, y + height, z + width/2]
    ];
    
    const tipFaces = [
        [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1]
    ];
    
    const projectedTip = tipVertices.map(v => project3D(v[0], v[1], v[2]));
    
    tipFaces.forEach(face => {
        const projectedFace = face.map(i => projectedTip[i]).filter(v => v !== null);
        if (projectedFace.length === 3) {
            const rgb = hexToRgb(color);
            const brightColor = `rgb(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)})`;
            
            UI.ctx.fillStyle = brightColor;
            UI.ctx.strokeStyle = '#ffffff';
            UI.ctx.lineWidth = 1;
            
            UI.ctx.beginPath();
            UI.ctx.moveTo(projectedFace[0].x, projectedFace[0].y);
            UI.ctx.lineTo(projectedFace[1].x, projectedFace[1].y);
            UI.ctx.lineTo(projectedFace[2].x, projectedFace[2].y);
            UI.ctx.closePath();
            UI.ctx.fill();
            UI.ctx.stroke();
        }
    });
    
    // Direction indicator
    drawDirectionArrow(x, y + height + 0.8 * scale, z, rotY, scale);
}

function drawOrbWithRings(x, y, z, color, scale, rotY) {
    const orbRadius = 0.6 * scale;
    
    // Central orb
    drawCube(x, y, z, orbRadius * 2, orbRadius * 2, orbRadius * 2, color);
    
    // Floating rings around the orb
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
        const ringRadius = (1.2 + i * 0.4) * scale;
        const ringHeight = y + Math.sin(i * Math.PI / 2) * 0.3 * scale;
        const segments = 12;
        
        for (let j = 0; j < segments; j++) {
            const angle = (j / segments) * Math.PI * 2;
            const ringX = x + Math.cos(angle) * ringRadius;
            const ringZ = z + Math.sin(angle) * ringRadius;
            
            const segmentSize = 0.15 * scale;
            const rgb = hexToRgb(color);
            const ringColor = `rgb(${Math.floor(rgb.r * 0.8)}, ${Math.floor(rgb.g * 0.8)}, ${Math.floor(rgb.b * 0.8)})`;
            
            drawCube(ringX, ringHeight, ringZ, segmentSize, segmentSize, segmentSize, ringColor);
        }
    }
    
    // Direction indicator
    drawDirectionArrow(x, y + 1.5 * scale, z, rotY, scale);
}

function drawGeometricPillar(x, y, z, color, scale, rotY) {
    const sections = 4;
    const sectionHeight = 0.6 * scale;
    
    for (let i = 0; i < sections; i++) {
        const sectionY = y + i * sectionHeight;
        const size = (1 - i * 0.15) * scale;
        const rotation = i * Math.PI / 4;
        
        // Rotate the section
        const cos_r = Math.cos(rotation);
        const sin_r = Math.sin(rotation);
        
        // Draw rotated cube by adjusting vertex positions
        const brightness = 1 - i * 0.2;
        const rgb = hexToRgb(color);
        const sectionColor = `rgb(${Math.floor(rgb.r * brightness)}, ${Math.floor(rgb.g * brightness)}, ${Math.floor(rgb.b * brightness)})`;
        
        drawCube(x, sectionY + sectionHeight/2, z, size, sectionHeight, size, sectionColor);
    }
    
    // Top ornament
    const topY = y + sections * sectionHeight;
    drawCube(x, topY + 0.2 * scale, z, 0.3 * scale, 0.4 * scale, 0.3 * scale, color);
    
    // Direction indicator
    drawDirectionArrow(x, topY + 0.6 * scale, z, rotY, scale);
}

function drawSpiralMonument(x, y, z, color, scale, rotY) {
    const height = 2.8 * scale;
    const spiralTurns = 2;
    const segments = 16;
    
    for (let i = 0; i < segments; i++) {
        const t = i / segments;
        const spiralY = y + t * height;
        const angle = t * spiralTurns * Math.PI * 2;
        const radius = (0.8 - t * 0.3) * scale;
        
        const spiralX = x + Math.cos(angle) * radius;
        const spiralZ = z + Math.sin(angle) * radius;
        
        const segmentSize = (0.4 - t * 0.1) * scale;
        const brightness = 1 - t * 0.4;
        const rgb = hexToRgb(color);
        const spiralColor = `rgb(${Math.floor(rgb.r * brightness)}, ${Math.floor(rgb.g * brightness)}, ${Math.floor(rgb.b * brightness)})`;
        
        drawCube(spiralX, spiralY, spiralZ, segmentSize, segmentSize, segmentSize, spiralColor);
    }
    
    // Central core
    drawCube(x, y + height/2, z, 0.3 * scale, height, 0.3 * scale, color);
    
    // Direction indicator
    drawDirectionArrow(x, y + height + 0.3 * scale, z, rotY, scale);
}

function drawDirectionArrow(x, y, z, rotY, scale) {
    const arrowLength = 1.2 * scale;
    const arrowX = x + Math.sin(rotY) * arrowLength;
    const arrowZ = z + Math.cos(rotY) * arrowLength;
    
    // Arrow shaft
    drawCube(x + Math.sin(rotY) * arrowLength * 0.5, y, z + Math.cos(rotY) * arrowLength * 0.5, 
             0.15 * scale, 0.15 * scale, arrowLength, '#ffffff');
    
    // Arrow head
    const headSize = 0.3 * scale;
    drawCube(arrowX, y, arrowZ, headSize, headSize, headSize, '#ffffff');
}

// Helper function for hex to RGB conversion (add if not already present)
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : {r: 128, g: 128, b: 128}; // Default gray if parsing fails
}
