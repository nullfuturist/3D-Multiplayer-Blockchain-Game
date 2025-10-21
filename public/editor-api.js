// API Functions for the 3D Model Editor

// Blockchain utility functions
function b58decode(s) {
    const a = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', m = {};
    for (let i = 0; i < a.length; i++) m[a[i]] = i;
    let d = [0];
    for (let c of s) {
        let v = m[c];
        for (let i = 0; i < d.length; i++) { v += d[i] * 58; d[i] = v & 255; v >>= 8; }
        while (v > 0) { d.push(v & 255); v >>= 8; }
    }
    for (let i = 0; i < s.length && s[i] === '1'; i++) d.push(0);
    return new Uint8Array(d.reverse());
}

function buildAssetDataBytes(name, uri) {
    const nameBytes = new TextEncoder().encode(name);
    const uriBytes = new TextEncoder().encode(uri);
    
    const result = [];
    result.push(0x14);
    result.push(0x00);
    result.push(nameBytes.length & 0xFF);
    result.push((nameBytes.length >> 8) & 0xFF);
    result.push((nameBytes.length >> 16) & 0xFF);
    result.push((nameBytes.length >> 24) & 0xFF);
    result.push(...nameBytes);
    result.push(uriBytes.length & 0xFF);
    result.push((uriBytes.length >> 8) & 0xFF);
    result.push((uriBytes.length >> 16) & 0xFF);
    result.push((uriBytes.length >> 24) & 0xFF);
    result.push(...uriBytes);
    result.push(0x01);
    result.push(0x00, 0x00, 0x00, 0x00);
    result.push(0x01);
    result.push(0x00, 0x00, 0x00, 0x00);
    
    return new Uint8Array(result);
}

async function getConnection() {
    return new solanaWeb3.Connection('https://audi-vpg287-fast-mainnet.helius-rpc.com', 'confirmed');
}

function getCoreProgram() {
    return new solanaWeb3.PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
}

async function createAsset(wallet, name, uri) {
    try {
        log('\n--- Creating NFT Asset ---');
        
        const connection = await getConnection();
        const coreProgram = getCoreProgram();
        
        const createdAssetKeypair = solanaWeb3.Keypair.generate();
        
        log(`Name: ${name}`);
        log(`URI: ${uri}`);
        log(`Wallet: ${wallet.toString()}`);
        log(`Asset: ${createdAssetKeypair.publicKey.toString()}`);

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: createdAssetKeypair.publicKey, isSigner: true, isWritable: true },
                { pubkey: coreProgram, isSigner: false, isWritable: false },
                { pubkey: coreProgram, isSigner: false, isWritable: false },
                { pubkey: wallet, isSigner: true, isWritable: true },
                { pubkey: coreProgram, isSigner: false, isWritable: false },
                { pubkey: coreProgram, isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
                { pubkey: coreProgram, isSigner: false, isWritable: false }
            ],
            programId: coreProgram,
            data: buildAssetDataBytes(name, uri)
        });

        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        
        const messageV0 = new solanaWeb3.TransactionMessage({
            payerKey: wallet,
            recentBlockhash: blockhash,
            instructions: [instruction]
        }).compileToV0Message();

        const transaction = new solanaWeb3.VersionedTransaction(messageV0);
        transaction.sign([createdAssetKeypair]);

        log('Requesting wallet signature...');
        const signedTx = await window.solana.signTransaction(transaction);
        
        log('Submitting to blockchain...');
        const txSignature = await connection.sendRawTransaction(signedTx.serialize(), { 
            skipPreflight: false, 
            maxRetries: 5,
            preflightCommitment: 'confirmed'
        });

        log(`Transaction sent: ${txSignature}`);
        log(`<a href="https://explorer.solana.com/tx/${txSignature}" target="_blank">View on Solana Explorer</a>`);

        const confirmation = await connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash,
            lastValidBlockHeight: (await connection.getLatestBlockhash('confirmed')).lastValidBlockHeight
        }, 'confirmed');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        log('🎉 NFT created successfully!');
        log(`<strong>Asset Address:</strong> ${createdAssetKeypair.publicKey.toString()}`);
        
        return { 
            success: true, 
            txSignature,
            assetPubkey: createdAssetKeypair.publicKey.toString()
        };

    } catch (error) {
        log(`❌ Failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// NFT Loading Dialog Functions
function showLoadNFTDialog() {
    document.getElementById('nftLoadPanel').classList.remove('hidden');
    document.getElementById('nftPubkey').focus();
}

function hideNFTLoadPanel() {
    document.getElementById('nftLoadPanel').classList.add('hidden');
    document.getElementById('nftPubkey').value = '';
    document.getElementById('nftLoadStatus').innerHTML = '';
}

async function loadFromNFT() {
    const pubkey = document.getElementById('nftPubkey').value.trim();
    const statusDiv = document.getElementById('nftLoadStatus');
    
    if (!pubkey) {
        statusDiv.innerHTML = '<div class="status-error">Please enter an NFT public key</div>';
        return;
    }
    
    if (pubkey.length < 32 || pubkey.length > 44) {
        statusDiv.innerHTML = '<div class="status-error">Invalid public key format</div>';
        return;
    }
    
    statusDiv.innerHTML = '<div class="status-info">Loading NFT...</div>';
    
    try {
        const response = await fetch('/api/load-nft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pubkey })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to load NFT');
        }
        
        if (result.success) {
            const model = result.model;
            vertices = model.properties.modelData.vertices;
            edges = new Set(model.properties.modelData.edges || []);
            currentModelId = null;
            
            document.getElementById('modelName').value = model.name;
            primary = secondary = -1;
            
            statusDiv.innerHTML = `<div class="status-success">✓ Loaded "${model.name}" successfully!</div>`;
            
            console.log('Loaded NFT:', {
                name: model.name,
                vertices: vertices.length,
                edges: edges.size,
                owner: model.nftInfo?.owner,
                pubkey: model.nftInfo?.pubkey
            });
            
            draw();
            
            setTimeout(() => {
                hideNFTLoadPanel();
            }, 2000);
        }
        
    } catch (error) {
        console.error('Error loading NFT:', error);
        statusDiv.innerHTML = `<div class="status-error">Error: ${error.message}</div>`;
    }
}

// Model Management Functions
async function saveModel() {
    const name = document.getElementById('modelName').value || 'Untitled Model';
    const image = await captureImageData();
    const data = {
        name,
        vertices,
        edges: [...edges],
        image
    };

    try {
        const response = currentModelId 
            ? await fetch(`/api/models/${currentModelId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            })
            : await fetch('/api/models', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
        
        const result = await response.json();
        if (result.id) currentModelId = result.id;
        
        showStatus('success', result.message || 'Model saved successfully');
    } catch (error) {
        showStatus('error', 'Error saving model: ' + error.message);
    }
}

async function loadModels() {
    try {
        const response = await fetch('/api/models');
        const models = await response.json();
        const list = document.getElementById('modelList');
        
        if (models.length === 0) {
            list.innerHTML = '<div class="model-item">No saved models found</div>';
        } else {
            list.innerHTML = models.map(m => 
                `<div class="model-item" onclick="loadModel('${m.id}')">
                    <strong>${m.name}</strong><br>
                    <small>Created: ${new Date(m.created).toLocaleDateString()}</small>
                </div>`
            ).join('');
        }
        
        document.getElementById('loadPanel').classList.remove('hidden');
    } catch (error) {
        showStatus('error', 'Error loading models: ' + error.message);
    }
}

async function loadModel(id) {
    try {
        const response = await fetch(`/api/models/${id}`);
        const data = await response.json();
        
        vertices = data.properties.modelData.vertices;
        edges = new Set(data.properties.modelData.edges);
        currentModelId = id;
        document.getElementById('modelName').value = data.name;
        primary = secondary = -1;
        
        hideLoadPanel();
        draw();
        showStatus('success', `Loaded model: ${data.name}`);
    } catch (error) {
        showStatus('error', 'Error loading model: ' + error.message);
    }
}

function hideLoadPanel() {
    document.getElementById('loadPanel').classList.add('hidden');
}

function clearModel() {
    if (confirm('Clear current model? This will reset everything.')) {
        vertices = [{pos:[0,0,0], size:1, color:[0.8,0.8,0.8]}];
        edges = new Set();
        primary = secondary = -1;
        currentModelId = null;
        document.getElementById('modelName').value = '';
        document.getElementById('imageResult').classList.add('hidden');
        document.getElementById('nftResult').classList.add('hidden');
        draw();
        showStatus('info', 'Model cleared');
    }
}

// Image and NFT Functions
function captureImageData() {
    return new Promise(resolve => {
        draw();
        setTimeout(() => {
            const croppedCanvas = cropToGeometry();
            resolve(croppedCanvas.toDataURL('image/png'));
        }, 100);
    });
}

function cropToGeometry() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    vertices.forEach(v => {
        const radius = v.size * 0.1;
        minX = Math.min(minX, v.pos[0] - radius);
        maxX = Math.max(maxX, v.pos[0] + radius);
        minY = Math.min(minY, v.pos[1] - radius);
        maxY = Math.max(maxY, v.pos[1] + radius);
        minZ = Math.min(minZ, v.pos[2] - radius);
        maxZ = Math.max(maxZ, v.pos[2] + radius);
    });
    
    const eye = [
        camera.distance * Math.cos(camera.rotationX) * Math.sin(camera.rotationY),
        camera.distance * Math.sin(camera.rotationX),
        camera.distance * Math.cos(camera.rotationX) * Math.cos(camera.rotationY)
    ];
    
    const proj = perspective(Math.PI/4, 800/600, 0.1, 100);
    const view = lookAt(eye, [0,0,0], [0,1,0]);
    
    function project(x, y, z) {
        const vx = view[0]*x + view[4]*y + view[8]*z + view[12];
        const vy = view[1]*x + view[5]*y + view[9]*z + view[13];
        const vz = view[2]*x + view[6]*y + view[10]*z + view[14];
        const vw = view[3]*x + view[7]*y + view[11]*z + view[15];
        
        const px = proj[0]*vx + proj[4]*vy + proj[8]*vz + proj[12]*vw;
        const py = proj[1]*vx + proj[5]*vy + proj[9]*vz + proj[13]*vw;
        const pw = proj[3]*vx + proj[7]*vy + proj[11]*vz + proj[15]*vw;
        
        const sx = (px/pw * 0.5 + 0.5) * 800;
        const sy = (1 - (py/pw * 0.5 + 0.5)) * 600;
        
        return [sx, sy];
    }
    
    const corners = [
        [minX, minY, minZ], [maxX, minY, minZ],
        [minX, maxY, minZ], [maxX, maxY, minZ],
        [minX, minY, maxZ], [maxX, minY, maxZ],
        [minX, maxY, maxZ], [maxX, maxY, maxZ]
    ];
    
    let screenMinX = Infinity, screenMaxX = -Infinity;
    let screenMinY = Infinity, screenMaxY = -Infinity;
    
    corners.forEach(corner => {
        const [sx, sy] = project(...corner);
        screenMinX = Math.min(screenMinX, sx);
        screenMaxX = Math.max(screenMaxX, sx);
        screenMinY = Math.min(screenMinY, sy);
        screenMaxY = Math.max(screenMaxY, sy);
    });
    
    const padding = 40;
    screenMinX = Math.max(0, Math.floor(screenMinX - padding));
    screenMaxX = Math.min(799, Math.ceil(screenMaxX + padding));
    screenMinY = Math.max(0, Math.floor(screenMinY - padding));
    screenMaxY = Math.min(599, Math.ceil(screenMaxY + padding));
    
    const cropWidth = screenMaxX - screenMinX + 1;
    const cropHeight = screenMaxY - screenMinY + 1;
    
    const pixelData = new Uint8Array(cropWidth * cropHeight * 4);
    gl.readPixels(screenMinX, 600 - screenMaxY - 1, cropWidth, cropHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
    
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const ctx = cropCanvas.getContext('2d');
    const imageData = ctx.createImageData(cropWidth, cropHeight);
    
    for (let y = 0; y < cropHeight; y++) {
        for (let x = 0; x < cropWidth; x++) {
            const srcIdx = ((cropHeight - 1 - y) * cropWidth + x) * 4;
            const dstIdx = (y * cropWidth + x) * 4;
            imageData.data[dstIdx] = pixelData[srcIdx];
            imageData.data[dstIdx + 1] = pixelData[srcIdx + 1];
            imageData.data[dstIdx + 2] = pixelData[srcIdx + 2];
            imageData.data[dstIdx + 3] = pixelData[srcIdx + 3];
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return cropCanvas;
}

async function captureAndUpload() {
    try {
        showStatus('info', 'Capturing image...');
        const imageData = await captureImageData();
        
        const response = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData })
        });

        const result = await response.json();
        
        if (result.success) {
            const resultDiv = document.getElementById('imageResult');
            resultDiv.innerHTML = `
                <h3>Image Uploaded Successfully!</h3>
                <p><strong>URL:</strong> <a href="${result.url}" target="_blank">${result.url}</a></p>
                <p><em>This image can be used for NFT metadata.</em></p>
            `;
            resultDiv.classList.remove('hidden');
            showStatus('success', 'Image uploaded successfully!');
        } else {
            showStatus('error', 'Upload failed: ' + result.error);
        }
    } catch (error) {
        showStatus('error', 'Upload failed: ' + error.message);
    }
}

function exportModel() {
    const data = {
        name: document.getElementById('modelName').value || 'Untitled Model',
        vertices,
        edges: [...edges],
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const link = document.createElement('a');
    link.download = `${data.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_model.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    
    showStatus('success', 'Model exported to JSON file');
}

// NFT Minting Functions
async function mintNFT() {
    try {
        if (!window.solana || !window.solana.isPhantom) {
            showStatus('error', 'Please install Phantom wallet to mint NFTs');
            return;
        }

        showStatus('info', 'Connecting to Phantom wallet...');
        const response = await window.solana.connect();
        const wallet = response.publicKey;
        
        document.getElementById('nftResult').innerHTML = '';
        log('🔗 Wallet connected: ' + wallet.toString());

        const modelName = document.getElementById('modelName').value || 'Untitled 3D Model';
        
        if (vertices.length === 0 || edges.size === 0) {
            showStatus('error', 'Please create a model with vertices and edges before minting');
            return;
        }
        
        log('📸 Capturing and uploading image...');
        const imageData = await captureImageData();
        
        const imageResponse = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData })
        });
        
        const imageResult = await imageResponse.json();
        if (!imageResult.success) {
            throw new Error('Failed to upload image: ' + imageResult.error);
        }
        
        log('✅ Image uploaded: <a href="' + imageResult.url + '" target="_blank">' + imageResult.url + '</a>');
        
        log('📝 Creating NFT metadata...');
        const modelData = { vertices, edges: [...edges] };
        
        const metadataResponse = await fetch('/api/create-nft-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: modelName,
                imageUrl: imageResult.url,
                modelData
            })
        });
        
        const metadataResult = await metadataResponse.json();
        if (!metadataResult.success) {
            throw new Error('Failed to create metadata: ' + metadataResult.error);
        }
        
        log('✅ Metadata created: <a href="' + metadataResult.metadataUrl + '" target="_blank">' + metadataResult.metadataUrl + '</a>');
        
        log('🚀 Creating NFT on Solana blockchain...');
        const nftResult = await createAsset(wallet, modelName, metadataResult.metadataUrl);
        
        if (nftResult.success) {
            log(`\n🎉 <strong>NFT minted successfully!</strong>`);
            log(`<strong>Asset Public Key:</strong> ${nftResult.assetPubkey}`);
            log(`<strong>Transaction:</strong> <a href="https://explorer.solana.com/tx/${nftResult.txSignature}" target="_blank">${nftResult.txSignature}</a>`);
            log(`<br><em>You can now add this NFT to your inventory in the 3D world using the asset public key above!</em>`);
            showStatus('success', '🎉 NFT minted successfully! Check the NFT Result section for details.');
        } else {
            throw new Error(nftResult.error || 'Unknown minting error');
        }
        
    } catch (error) {
        log('❌ NFT minting failed: ' + error.message);
        showStatus('error', 'NFT minting failed: ' + error.message);
    }
}

// Utility Functions
function log(message) {
    console.log(message);
    const resultDiv = document.getElementById('nftResult');
    resultDiv.innerHTML += message + '<br>';
    resultDiv.classList.remove('hidden');
    resultDiv.scrollTop = resultDiv.scrollHeight;
}

function showStatus(type, message) {
    const statusClass = `status-${type}`;
    const existingStatus = document.querySelector('.status-message');
    
    if (existingStatus) {
        existingStatus.remove();
    }
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${statusClass}`;
    statusDiv.textContent = message;
    
    const controls = document.querySelector('.controls');
    controls.parentNode.insertBefore(statusDiv, controls.nextSibling);
    
    if (type !== 'error') {
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.remove();
            }
        }, 5000);
    }
}
