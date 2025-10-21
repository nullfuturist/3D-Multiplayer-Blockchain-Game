// NFT Model Rendering - Using the proper cylinder/prism rendering from your original code

// 3D Math Functions for NFT rendering
function nftCross(a, b) { 
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; 
}

function nftDot(a, b) { 
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; 
}

function nftNorm(v) { 
    const l = Math.sqrt(nftDot(v,v)); 
    return l > 0 ? v.map(x => x/l) : [0,0,0]; 
}

function drawNFTModel(nftObject) {
    console.log('Drawing NFT model:', nftObject.name);
    
    if (!nftObject.modelData || !nftObject.modelData.vertices || !nftObject.modelData.edges) {
        console.warn('Invalid NFT model data, drawing fallback cube');
        drawCube(nftObject.x, nftObject.y + 1, nftObject.z, 2, 2, 2, '#ff6b6b');
        return;
    }

    const scale = nftObject.scale || 2; // Scale up the models to be more visible
    const centerX = nftObject.x;
    const centerY = nftObject.y;
    const centerZ = nftObject.z;
    const rotY = nftObject.rotY || 0;

    console.log(`Rendering NFT with ${nftObject.modelData.vertices.length} vertices, ${nftObject.modelData.edges.length} edges at scale ${scale}`);
    
    // Draw each edge as a proper cylinder/prism like in your original code
    nftObject.modelData.edges.forEach((edgeKey, edgeIndex) => {
        const [i, j] = edgeKey.split('-').map(Number);
        if (i >= nftObject.modelData.vertices.length || j >= nftObject.modelData.vertices.length) {
            console.warn(`Invalid edge: ${edgeKey}`);
            return;
        }

        const startVertex = nftObject.modelData.vertices[i];
        const endVertex = nftObject.modelData.vertices[j];

        // Apply transformations
        const startPos = transformNFTVertex(startVertex.pos, centerX, centerY, centerZ, scale, rotY);
        const endPos = transformNFTVertex(endVertex.pos, centerX, centerY, centerZ, scale, rotY);

        // Use proper cylinder rendering
        drawNFTCylinder(
            startPos, 
            endPos,
            (startVertex.size || 1) * 0.1 * scale,
            (endVertex.size || 1) * 0.1 * scale,
            startVertex.color || [0.8, 0.8, 0.8],
            endVertex.color || [0.8, 0.8, 0.8]
        );
    });
}

function transformNFTVertex(pos, centerX, centerY, centerZ, scale, rotY) {
    // Scale
    let x = pos[0] * scale;
    let y = pos[1] * scale;  
    let z = pos[2] * scale;

    // Rotate around Y axis
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);
    const newX = x * cos - z * sin;
    const newZ = x * sin + z * cos;

    // Translate
    return [
        newX + centerX,
        y + centerY + 1, // Lift it up a bit so it's not on the ground
        newZ + centerZ
    ];
}

function drawNFTCylinder(start, end, startRadius, endRadius, startColor, endColor) {
    // This is the proper cylinder generation from your original code
    const dir = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
    const len = Math.sqrt(nftDot(dir, dir));
    
    if (len < 0.001) return; // Skip degenerate edges
    
    const fwd = dir.map(x => x / len);
    const right = nftNorm(nftCross(fwd, Math.abs(fwd[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const up = nftCross(fwd, right);
    
    const sides = 8; // Number of sides for the cylinder
    
    // Generate vertices for the cylinder
    const vertices = [];
    const colors = [];
    
    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Start vertex
        const startVert = [
            start[0] + (right[0] * cos + up[0] * sin) * startRadius,
            start[1] + (right[1] * cos + up[1] * sin) * startRadius,
            start[2] + (right[2] * cos + up[2] * sin) * startRadius
        ];
        
        // End vertex  
        const endVert = [
            end[0] + (right[0] * cos + up[0] * sin) * endRadius,
            end[1] + (right[1] * cos + up[1] * sin) * endRadius,
            end[2] + (right[2] * cos + up[2] * sin) * endRadius
        ];
        
        vertices.push(startVert, endVert);
        
        // Convert colors to RGB strings
        const startColorRGB = nftColorToRGB(startColor);
        const endColorRGB = nftColorToRGB(endColor);
        
        colors.push(startColorRGB, endColorRGB);
    }
    
    // Draw triangular faces to form the cylinder
    for (let i = 0; i < sides; i++) {
        const i0 = i * 2;
        const i1 = i0 + 1;
        const i2 = ((i + 1) % sides) * 2;
        const i3 = i2 + 1;
        
        // Draw two triangles to form a quad face
        drawNFTTriangle(vertices[i0], vertices[i1], vertices[i2], colors[i0]);
        drawNFTTriangle(vertices[i1], vertices[i3], vertices[i2], colors[i1]);
    }
}

function drawNFTTriangle(v1, v2, v3, color) {
    // Project the 3D triangle vertices to 2D screen coordinates
    const p1 = project3D(v1[0], v1[1], v1[2]);
    const p2 = project3D(v2[0], v2[1], v2[2]);
    const p3 = project3D(v3[0], v3[1], v3[2]);
    
    // Skip if any vertex is behind the camera
    if (!p1 || !p2 || !p3) return;
    
    // Calculate face normal for lighting (simple backface culling)
    const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    const normal = nftCross(edge1, edge2);
    
    // Simple lighting calculation
    const lightDir = [1, 1, 1];
    const lightIntensity = Math.max(0.3, Math.abs(nftDot(nftNorm(normal), nftNorm(lightDir))));
    
    // Apply lighting to color
    const litColor = applyNFTLighting(color, lightIntensity);
    
    // Draw the triangle
    UI.ctx.fillStyle = litColor;
    UI.ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    UI.ctx.lineWidth = 0.5;
    
    UI.ctx.beginPath();
    UI.ctx.moveTo(p1.x, p1.y);
    UI.ctx.lineTo(p2.x, p2.y);
    UI.ctx.lineTo(p3.x, p3.y);
    UI.ctx.closePath();
    UI.ctx.fill();
    UI.ctx.stroke();
}

function nftColorToRGB(color) {
    if (Array.isArray(color)) {
        // Color is already RGB array [r, g, b] with values 0-1
        const r = Math.floor(color[0] * 255);
        const g = Math.floor(color[1] * 255);
        const b = Math.floor(color[2] * 255);
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    if (typeof color === 'string') {
        if (color.startsWith('#')) {
            return color; // Already hex
        }
        if (color.startsWith('rgb')) {
            return color; // Already RGB string
        }
    }
    
    // Fallback to a default color
    return 'rgb(200, 200, 200)';
}

function applyNFTLighting(color, intensity) {
    if (color.startsWith('rgb(')) {
        // Extract RGB values
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = Math.floor(parseInt(match[1]) * intensity);
            const g = Math.floor(parseInt(match[2]) * intensity);
            const b = Math.floor(parseInt(match[3]) * intensity);
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    
    if (color.startsWith('#')) {
        // Convert hex to RGB and apply lighting
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        
        const litR = Math.floor(r * intensity);
        const litG = Math.floor(g * intensity);
        const litB = Math.floor(b * intensity);
        
        return `rgb(${litR}, ${litG}, ${litB})`;
    }
    
    return color; // Return as-is if we can't parse it
}
