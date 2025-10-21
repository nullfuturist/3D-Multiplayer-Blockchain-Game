const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs-extra');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const { fetchAsset } = require('@metaplex-foundation/mpl-core');
const { publicKey } = require('@metaplex-foundation/umi');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const sessionMiddleware = session({
  secret: 'phantom-world-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.static('public'));

const users = new Map();
const plots = new Map();
let worldMapData = null;
const nftInventory = new Map();
const userInventories = new Map();

const DATA_DIR = './data';
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const PLOTS_FILE = path.join(DATA_DIR, 'plots.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NFT_INVENTORY_FILE = path.join(DATA_DIR, 'nft_inventory.json');
const USER_INVENTORIES_FILE = path.join(DATA_DIR, 'user_inventories.json');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const IMAGES_DIR = path.join(DATA_DIR, 'images');

fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(MODELS_DIR);
fs.ensureDirSync(IMAGES_DIR);

app.use('/images', express.static(IMAGES_DIR));
app.use('/models', express.static(MODELS_DIR));

async function loadPersistedData() {
  try {
    if (await fs.pathExists(WORLD_FILE)) {
      worldMapData = await fs.readJson(WORLD_FILE);
      console.log('Loaded world map from file');
    } else {
      worldMapData = generateRandomWorldMap();
      await fs.writeJson(WORLD_FILE, worldMapData, { spaces: 2 });
      console.log('Generated new world map');
    }

    if (await fs.pathExists(PLOTS_FILE)) {
      const plotsData = await fs.readJson(PLOTS_FILE);
      Object.entries(plotsData).forEach(([id, data]) => {
        plots.set(id, { ...data, players: new Set() });
      });
      console.log(`Loaded ${plots.size} plots from file`);
    } else {
      worldMapData.nodes.forEach(node => {
        plots.set(node.id, {
          ...node,
          objects: [{ type: 'exit', x: 45, y: 0, z: 45, color: '#ff0000', width: 3, height: 3, depth: 3 }],
          players: new Set()
        });
      });
      await savePlots();
      console.log('Initialized plots');
    }

    if (await fs.pathExists(USERS_FILE)) {
      const usersData = await fs.readJson(USERS_FILE);
      console.log(`User position data available for ${Object.keys(usersData).length} users`);
    }

    if (await fs.pathExists(NFT_INVENTORY_FILE)) {
      const nftData = await fs.readJson(NFT_INVENTORY_FILE);
      Object.entries(nftData).forEach(([pubkey, data]) => {
        nftInventory.set(pubkey, data);
      });
      console.log(`Loaded ${nftInventory.size} NFT models from file`);
    }

    if (await fs.pathExists(USER_INVENTORIES_FILE)) {
      const userInvData = await fs.readJson(USER_INVENTORIES_FILE);
      Object.entries(userInvData).forEach(([userKey, nftKeys]) => {
        userInventories.set(userKey, new Set(nftKeys));
      });
      console.log(`Loaded inventories for ${userInventories.size} users`);
    }
  } catch (error) {
    console.error('Error loading persisted data:', error);
    worldMapData = generateRandomWorldMap();
    worldMapData.nodes.forEach(node => {
      plots.set(node.id, {
        ...node,
        objects: [{ type: 'exit', x: 45, y: 0, z: 45, color: '#ff0000', width: 3, height: 3, depth: 3 }],
        players: new Set()
      });
    });
  }
}

async function saveNFTInventory() {
  try {
    const nftData = {};
    nftInventory.forEach((data, pubkey) => {
      nftData[pubkey] = data;
    });
    await fs.writeJson(NFT_INVENTORY_FILE, nftData, { spaces: 2 });
  } catch (error) {
    console.error('Error saving NFT inventory:', error);
  }
}

async function saveUserInventories() {
  try {
    const userInvData = {};
    userInventories.forEach((nftSet, userKey) => {
      userInvData[userKey] = Array.from(nftSet);
    });
    await fs.writeJson(USER_INVENTORIES_FILE, userInvData, { spaces: 2 });
  } catch (error) {
    console.error('Error saving user inventories:', error);
  }
}

async function loadNFTFromSolana(nftPubkey) {
  try {
    console.log(`Attempting to load NFT: ${nftPubkey}`);
    const umi = createUmi('https://api.mainnet-beta.solana.com');
    const asset = await fetchAsset(umi, publicKey(nftPubkey));
    console.log(`Asset fetched, URI: ${asset.uri}`);

    if (!asset.uri) {
      throw new Error('NFT does not have a metadata URI');
    }

    let metadata;
    try {
      const response = await fetch(asset.uri, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; NFTLoader/1.0)'
        },
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      metadata = JSON.parse(text);
    } catch (fetchError) {
      console.error('Error fetching metadata:', fetchError);
      throw new Error(`Failed to fetch or parse metadata: ${fetchError.message}`);
    }

    let modelData = null;
    let modelDataSource = null;

    if (metadata.properties && metadata.properties.modelData) {
      try {
        modelData = JSON.parse(metadata.properties.modelData);
        modelDataSource = 'properties.modelData';
      } catch (e) {
        console.warn('Failed to parse modelData from properties.modelData');
      }
    }

    if (!modelData && metadata.attributes) {
      const modelAttr = metadata.attributes.find(attr =>
        attr.trait_type === 'modelData' || attr.trait_type === 'model_data'
      );
      if (modelAttr && modelAttr.value) {
        try {
          modelData = typeof modelAttr.value === 'string' ? JSON.parse(modelAttr.value) : modelAttr.value;
          modelDataSource = 'attributes.modelData';
        } catch (e) {
          console.warn('Failed to parse modelData from attributes');
        }
      }
    }

    if (!modelData && metadata.extensions && metadata.extensions.model) {
      modelData = metadata.extensions.model;
      modelDataSource = 'extensions.model';
    }

    if (!modelData) {
      console.warn('No model data found, creating default model');
      modelData = createDefaultModel();
      modelDataSource = 'default_generated';
    }

    if (!isValidModelData(modelData)) {
      console.warn('Invalid model data structure, creating default model');
      modelData = createDefaultModel();
      modelDataSource = 'default_fallback';
    }

    return {
      pubkey: nftPubkey,
      name: metadata.name || `NFT ${nftPubkey.substring(0, 8)}`,
      description: metadata.description || '',
      modelData: modelData,
      modelDataSource: modelDataSource,
      originalUri: asset.uri,
      loadedAt: Date.now()
    };

  } catch (error) {
    console.error('Error loading NFT:', error);
    console.log('Creating fallback NFT model');
    return {
      pubkey: nftPubkey,
      name: `Fallback NFT ${nftPubkey.substring(0, 8)}`,
      description: 'This NFT could not be loaded, showing default model',
      modelData: createDefaultModel(),
      modelDataSource: 'error_fallback',
      error: error.message,
      loadedAt: Date.now()
    };
  }
}

function createDefaultModel() {
  return {
    vertices: [
      { pos: [-1, 0, -1], size: 1, color: [1, 0.2, 0.2] },
      { pos: [1, 0, -1], size: 1, color: [0.2, 1, 0.2] },
      { pos: [1, 0, 1], size: 1, color: [0.2, 0.2, 1] },
      { pos: [-1, 0, 1], size: 1, color: [1, 1, 0.2] },
      { pos: [0, 2, 0], size: 1.5, color: [1, 0.2, 1] }
    ],
    edges: ["0-1", "1-2", "2-3", "3-0", "0-4", "1-4", "2-4", "3-4"]
  };
}

function isValidModelData(modelData) {
  if (!modelData || typeof modelData !== 'object') return false;
  if (!Array.isArray(modelData.vertices) || !Array.isArray(modelData.edges)) return false;
  if (modelData.vertices.length === 0 || modelData.edges.length === 0) return false;

  for (let vertex of modelData.vertices) {
    if (!vertex.pos || !Array.isArray(vertex.pos) || vertex.pos.length !== 3) return false;
    if (typeof vertex.size !== 'number') return false;
    if (!vertex.color || (!Array.isArray(vertex.color) && typeof vertex.color !== 'string')) return false;
  }

  for (let edge of modelData.edges) {
    const [i, j] = edge.split('-').map(Number);
    if (isNaN(i) || isNaN(j) || i >= modelData.vertices.length || j >= modelData.vertices.length) return false;
  }

  return true;
}

async function savePlots() {
  try {
    const plotsData = {};
    plots.forEach((plot, id) => {
      plotsData[id] = { ...plot, players: undefined };
    });
    await fs.writeJson(PLOTS_FILE, plotsData, { spaces: 2 });
  } catch (error) {
    console.error('Error saving plots:', error);
  }
}

async function saveUserPositions() {
  try {
    const usersData = {};
    users.forEach((user, sessionId) => {
      usersData[user.publicKey] = {
        worldX: user.worldX,
        worldY: user.worldY,
        plotX: user.plotX,
        plotY: user.plotY,
        plotZ: user.plotZ,
        plotRotY: user.plotRotY,
        currentPlot: user.currentPlot
      };
    });
    await fs.writeJson(USERS_FILE, usersData, { spaces: 2 });
  } catch (error) {
    console.error('Error saving user positions:', error);
  }
}

async function loadUserPosition(publicKey) {
  try {
    if (await fs.pathExists(USERS_FILE)) {
      const usersData = await fs.readJson(USERS_FILE);
      return usersData[publicKey] || null;
    }
  } catch (error) {
    console.error('Error loading user position:', error);
  }
  return null;
}

function generateRandomWorldMap() {
  const nodes = [];
  const numNodes = 12;
  const mapWidth = 1200;
  const mapHeight = 900;
  const minDistance = 150;

  for (let i = 0; i < numNodes; i++) {
    let attempts = 0;
    let validPosition = false;
    let x, y;

    while (!validPosition && attempts < 200) {
      x = Math.random() * (mapWidth - 300) + 150;
      y = Math.random() * (mapHeight - 300) + 150;

      validPosition = true;
      for (let node of nodes) {
        const dx = x - node.x;
        const dy = y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          validPosition = false;
          break;
        }
      }
      attempts++;
    }

    if (validPosition) {
      nodes.push({
        id: `node_${i}`,
        x: x,
        y: y,
        color: `hsl(${Math.random() * 360}, 60%, 55%)`,
        connections: []
      });
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const distances = [];

    for (let j = 0; j < nodes.length; j++) {
      if (i !== j) {
        const other = nodes[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        distances.push({ node: other, distance: distance });
      }
    }

    distances.sort((a, b) => a.distance - b.distance);
    const numConnections = Math.min(2 + Math.floor(Math.random() * 2), distances.length);

    for (let k = 0; k < numConnections; k++) {
      const target = distances[k].node;
      if (!node.connections.includes(target.id)) {
        node.connections.push(target.id);
        if (!target.connections.includes(node.id)) {
          target.connections.push(node.id);
        }
      }
    }
  }

  const startNode = nodes.reduce((best, node) =>
    node.connections.length > best.connections.length ? node : best
  );

  return {
    nodes: nodes,
    startPosition: { x: startNode.x, y: startNode.y }
  };
}

function getWalletColor(pubkey) {
  let hash = 0;
  for (let i = 0; i < pubkey.length; i++) {
    hash = ((hash << 5) - hash) + pubkey.charCodeAt(i);
    hash = hash & hash;
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
}

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const sessionId = socket.request.session.id;
  console.log(`User connected: ${sessionId}`);
  
  socket.on('connectWallet', async (data) => {
    const { publicKey } = data;
    const savedPosition = await loadUserPosition(publicKey);
    
    const userData = {
      sessionId,
      publicKey,
      color: getWalletColor(publicKey),
      worldX: savedPosition?.worldX || worldMapData.startPosition.x,
      worldY: savedPosition?.worldY || worldMapData.startPosition.y,
      currentPlot: null,
      plotX: savedPosition?.plotX || 50,
      plotY: savedPosition?.plotY || 1.7,
      plotZ: savedPosition?.plotZ || 50,
      plotRotY: savedPosition?.plotRotY || 0,
      lastMoveTime: 0,
      lastBroadcastTime: 0
    };
    
    users.set(sessionId, userData);
    console.log(`Wallet connected: ${publicKey.substring(0, 8)}... at position (${userData.worldX}, ${userData.worldY})`);
    
    socket.emit('init', {
      user: userData,
      worldMap: worldMapData.nodes.map(node => ({ ...plots.get(node.id), players: undefined })),
      users: Array.from(users.values()).filter(u => u.sessionId !== sessionId && !u.currentPlot)
    });
    
    socket.broadcast.emit('userJoined', userData);
  });
  
  socket.on('worldMove', (data) => {
    if (!users.has(sessionId)) return;
    
    const user = users.get(sessionId);
    user.worldX = data.x;
    user.worldY = data.y;
    
    socket.broadcast.emit('userWorldMoved', { sessionId, x: data.x, y: data.y });
    saveUserPositions();
  });
  
  socket.on('enterPlot', async (data) => {
    if (!users.has(sessionId)) return;
    
    const user = users.get(sessionId);
    const plot = plots.get(data.plotId);
    
    if (plot) {
      user.currentPlot = data.plotId;
      user.plotX = 50;
      user.plotY = 1.7;
      user.plotZ = 50;
      user.plotRotY = 0;
      plot.players.add(sessionId);
      
      socket.join(`plot_${data.plotId}`);
      
      console.log(`User ${user.publicKey.substring(0, 8)} entered plot ${data.plotId}`);
      
      const currentPlayers = Array.from(plot.players).map(id => users.get(id)).filter(Boolean);
      
      socket.emit('enteredPlot', {
        plotId: data.plotId,
        plotData: { ...plot, players: undefined },
        players: currentPlayers
      });
      
      socket.to(`plot_${data.plotId}`).emit('playerJoinedPlot', user);
      socket.broadcast.emit('userEnteredPlot', { sessionId, plotId: data.plotId });
      
      await saveUserPositions();
    }
  });

  socket.on('plotMoveBinary', async (buffer) => {
    if (!users.has(sessionId)) return;

    const user = users.get(sessionId);
    if (!user.currentPlot) return;

    const now = Date.now();

    const x = buffer.readFloatLE(0);
    const y = buffer.readFloatLE(4);
    const z = buffer.readFloatLE(8);
    const rotY = buffer.readFloatLE(12);

    user.plotX = x;
    user.plotY = y;
    user.plotZ = z;
    user.plotRotY = rotY;
    user.lastMoveTime = now;

    if (now - user.lastBroadcastTime > 17) {
      user.lastBroadcastTime = now;
      socket.to(`plot_${user.currentPlot}`).emit('userPlotMovedBinary', { sessionId, data: buffer });
    }
  });

  socket.on('placeObject', async (data) => {
    if (!users.has(sessionId)) return;

    const user = users.get(sessionId);
    const plot = plots.get(user.currentPlot);

    if (plot) {
      const newObject = {
        type: data.type || 'cube',
        x: data.x,
        y: data.y,
        z: data.z,
        width: data.width || 2,
        height: data.height || 2,
        depth: data.depth || 2,
        color: data.color || user.color,
        owner: user.publicKey,
        timestamp: Date.now()
      };

      plot.objects.push(newObject);

      io.to(`plot_${user.currentPlot}`).emit('objectPlaced', {
        plotId: user.currentPlot,
        object: newObject
      });

      socket.emit('objectPlaced', {
        plotId: user.currentPlot,
        object: newObject
      });

      await savePlots();
    }
  });
  
  socket.on('exitPlot', async () => {
    if (!users.has(sessionId)) return;
    
    const user = users.get(sessionId);
    if (user.currentPlot) {
      const plot = plots.get(user.currentPlot);
      const plotId = user.currentPlot;
      
      if (plot) {
        plot.players.delete(sessionId);
      }
      
      socket.leave(`plot_${plotId}`);
      socket.to(`plot_${plotId}`).emit('playerLeftPlot', sessionId);
      
      user.currentPlot = null;
      
      socket.emit('exitedPlot');
      socket.broadcast.emit('userExitedPlot', { sessionId });
      
      await saveUserPositions();
    }
  });
  
  socket.on('disconnect', async () => {
    if (users.has(sessionId)) {
      const user = users.get(sessionId);
      
      if (user.currentPlot) {
        const plot = plots.get(user.currentPlot);
        if (plot) {
          plot.players.delete(sessionId);
        }
        socket.leave(`plot_${user.currentPlot}`);
        socket.to(`plot_${user.currentPlot}`).emit('playerLeftPlot', sessionId);
      }
      
      await saveUserPositions();
      users.delete(sessionId);
      socket.broadcast.emit('userLeft', sessionId);
    }
  });

  socket.on('addNFTToInventory', async (data) => {
    if (!users.has(sessionId)) return;

    const user = users.get(sessionId);
    const { nftPubkey } = data;

    if (!nftPubkey || typeof nftPubkey !== 'string' || nftPubkey.length < 32) {
      socket.emit('nftLoadStatus', { status: 'error', message: 'Invalid NFT public key format' });
      return;
    }

    try {
      if (!nftInventory.has(nftPubkey)) {
        console.log(`Loading new NFT: ${nftPubkey}`);
        socket.emit('nftLoadStatus', { status: 'loading', message: 'Fetching NFT data from Solana...' });

        const nftData = await loadNFTFromSolana(nftPubkey);
        nftInventory.set(nftPubkey, nftData);
        await saveNFTInventory();

        if (nftData.error) {
          console.log(`NFT loaded with fallback: ${nftData.name} (${nftData.error})`);
          socket.emit('nftLoadStatus', { status: 'warning', message: `Loaded with default model: ${nftData.error}` });
        } else {
          console.log(`NFT loaded successfully: ${nftData.name} (${nftData.modelDataSource})`);
          socket.emit('nftLoadStatus', { status: 'success', message: `Loaded: ${nftData.name}` });
        }
      }

      if (!userInventories.has(user.publicKey)) {
        userInventories.set(user.publicKey, new Set());
      }

      const userInv = userInventories.get(user.publicKey);
      if (!userInv.has(nftPubkey)) {
        userInv.add(nftPubkey);
        await saveUserInventories();

        const nftData = nftInventory.get(nftPubkey);
        socket.emit('nftAddedToInventory', {
          pubkey: nftPubkey,
          name: nftData.name,
          modelData: nftData.modelData,
          description: nftData.description,
          modelDataSource: nftData.modelDataSource,
          hasError: !!nftData.error
        });

        console.log(`NFT ${nftData.name} added to ${user.publicKey.substring(0, 8)}'s inventory`);
      } else {
        socket.emit('nftLoadStatus', { status: 'info', message: 'NFT already in your inventory' });
      }

    } catch (error) {
      console.error('Error in addNFTToInventory handler:', error);
      socket.emit('nftLoadStatus', { status: 'error', message: `Failed to process NFT: ${error.message}` });
    }
  });

  socket.on('placeNFTModel', async (data) => {
    if (!users.has(sessionId)) return;

    const user = users.get(sessionId);
    const plot = plots.get(user.currentPlot);
    const { nftPubkey, x, y, z, rotY } = data;

    if (plot) {
      const userInv = userInventories.get(user.publicKey);
      if (!userInv || !userInv.has(nftPubkey)) {
        socket.emit('nftPlaceError', { message: 'NFT not in your inventory' });
        return;
      }

      const nftData = nftInventory.get(nftPubkey);
      if (!nftData) {
        socket.emit('nftPlaceError', { message: 'NFT data not found' });
        return;
      }

      const newObject = {
        type: 'nft_model',
        nftPubkey: nftPubkey,
        modelData: nftData.modelData,
        name: nftData.name,
        x: x,
        y: y,
        z: z,
        rotY: rotY || 0,
        scale: 1,
        owner: user.publicKey,
        timestamp: Date.now()
      };

      plot.objects.push(newObject);

      console.log(`NFT model (${nftData.name}) placed in plot ${user.currentPlot} by ${user.publicKey.substring(0, 8)}`);

      io.to(`plot_${user.currentPlot}`).emit('nftModelPlaced', {
        plotId: user.currentPlot,
        object: newObject
      });

      socket.emit('nftModelPlaced', {
        plotId: user.currentPlot,
        object: newObject
      });

      await savePlots();
    }
  });

  socket.on('requestInventory', () => {
    if (!users.has(sessionId)) return;
    
    const user = users.get(sessionId);
    const userInv = userInventories.get(user.publicKey) || new Set();
    
    const inventory = Array.from(userInv).map(nftPubkey => {
      const nftData = nftInventory.get(nftPubkey);
      return nftData ? {
        pubkey: nftPubkey,
        name: nftData.name,
        modelData: nftData.modelData
      } : null;
    }).filter(Boolean);
    
    socket.emit('inventoryData', { inventory });
  });

  socket.on('requestPlotSync', () => {
    if (!users.has(sessionId)) return;
    
    const user = users.get(sessionId);
    if (user.currentPlot) {
      const plot = plots.get(user.currentPlot);
      if (plot) {
        const currentPlayers = Array.from(plot.players).map(id => users.get(id)).filter(Boolean);
        
        socket.emit('plotSyncResponse', {
          plotId: user.currentPlot,
          objects: plot.objects,
          players: currentPlayers
        });
      }
    }
  });
});

// Express routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

app.get('/api/stats', (req, res) => {
  res.json({
    users: users.size,
    plots: plots.size,
    worldNodes: worldMapData.nodes.length
  });
});

app.post('/api/load-nft', async (req, res) => {
  try {
    const { pubkey } = req.body;
    
    if (!pubkey) {
      return res.status(400).json({ error: 'NFT public key is required' });
    }

    console.log('Fetching NFT:', pubkey);
    const umi = createUmi('https://api.mainnet-beta.solana.com');
    const assetAddress = publicKey(pubkey);
    const asset = await fetchAsset(umi, assetAddress, { skipDerivePlugins: false });
    
    console.log('Asset fetched:', asset.name);
    
    if (!asset.uri) {
      return res.status(404).json({ error: 'NFT has no metadata URI' });
    }
    
    const response = await fetch(asset.uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: HTTP ${response.status}`);
    }
    
    const metadata = await response.json();
    console.log('Metadata fetched for:', metadata.name);
    
    if (!metadata.properties || !metadata.properties.modelData) {
      return res.status(404).json({ 
        error: 'NFT does not contain 3D model data',
        nftName: metadata.name,
        availableProperties: Object.keys(metadata.properties || {})
      });
    }
    
    const modelData = typeof metadata.properties.modelData === 'string' 
      ? JSON.parse(metadata.properties.modelData)
      : metadata.properties.modelData;
    
    console.log(`Model loaded: ${modelData.vertices?.length || 0} vertices, ${modelData.edges?.length || 0} edges`);
    
    res.json({
      success: true,
      model: {
        name: metadata.name,
        description: metadata.description,
        image: metadata.image,
        properties: { modelData: modelData },
        nftInfo: {
          pubkey: pubkey,
          owner: asset.owner?.toString(),
          updateAuthority: asset.updateAuthority?.toString()
        }
      }
    });
    
  } catch (error) {
    console.error('Error loading NFT:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to load NFT. Make sure the public key is valid and the NFT contains 3D model data.'
    });
  }
});

app.get('/api/models', (req, res) => {
  try {
    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.json'));
    const models = files.map(file => {
      const data = JSON.parse(fs.readFileSync(path.join(MODELS_DIR, file), 'utf8'));
      return {
        id: file.replace('.json', ''),
        name: data.name,
        created: fs.statSync(path.join(MODELS_DIR, file)).mtime
      };
    });
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/models/:id', (req, res) => {
  try {
    const filePath = path.join(MODELS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Model not found' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/models', (req, res) => {
  try {
    const { name, vertices, edges, image } = req.body;
    
    if (!name || !vertices || !edges) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const metadata = {
      name,
      description: `3D model with ${vertices.length} vertices and ${edges.length} edges`,
      image: image || "",
      attributes: [
        { trait_type: "Vertices", value: vertices.length.toString() },
        { trait_type: "Edges", value: edges.length.toString() },
        { trait_type: "Type", value: "3D Model" }
      ],
      properties: { modelData: { vertices, edges } }
    };

    fs.writeFileSync(path.join(MODELS_DIR, `${id}.json`), JSON.stringify(metadata, null, 2));
    res.json({ id, message: 'Model saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/models/:id', (req, res) => {
  try {
    const filePath = path.join(MODELS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const { name, vertices, edges, image } = req.body;
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const metadata = {
      ...existing,
      name: name || existing.name,
      description: `3D model with ${vertices?.length || existing.properties.modelData.vertices.length} vertices and ${edges?.length || existing.properties.modelData.edges.length} edges`,
      image: image !== undefined ? image : existing.image,
      attributes: [
        { trait_type: "Vertices", value: (vertices?.length || existing.properties.modelData.vertices.length).toString() },
        { trait_type: "Edges", value: (edges?.length || existing.properties.modelData.edges.length).toString() },
        { trait_type: "Type", value: "3D Model" }
      ],
      properties: {
        modelData: {
          vertices: vertices || existing.properties.modelData.vertices,
          edges: edges || existing.properties.modelData.edges
        }
      }
    };

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
    res.json({ message: 'Model updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/models/:id', (req, res) => {
  try {
    const filePath = path.join(MODELS_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Model not found' });
    }
    fs.unlinkSync(filePath);
    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-image', (req, res) => {
  try {
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const filename = crypto.randomUUID() + '.png';
    const filepath = path.join(IMAGES_DIR, filename);
    
    fs.writeFileSync(filepath, buffer);
    
    const baseUrl = process.env.BASE_URL || `https://r3g1m3n.xyz`;
    const imageUrl = `${baseUrl}/images/${filename}`;
    
    res.json({ success: true, url: imageUrl });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to save image' });
  }
});

app.post('/api/create-nft-metadata', (req, res) => {
  try {
    const { name, imageUrl, modelData } = req.body;
    
    if (!name || !imageUrl || !modelData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const metadata = {
      name,
      image: imageUrl,
      description: `3D model with ${modelData.vertices.length} vertices and ${modelData.edges.length} edges`,
      attributes: [
        { trait_type: "Vertices", value: modelData.vertices.length.toString() },
        { trait_type: "Edges", value: modelData.edges.length.toString() },
        { trait_type: "Type", value: "3D Model" }
      ],
      properties: {
        files: [{ uri: imageUrl, type: "image/png" }],
        category: "image",
        modelData: JSON.stringify(modelData)
      }
    };

    const metadataId = crypto.randomUUID();
    const metadataFilename = `${metadataId}.json`;
    const metadataPath = path.join(IMAGES_DIR, metadataFilename);
    
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    
    const baseUrl = process.env.BASE_URL || `https://r3g1m3n.xyz`;
    const metadataUrl = `${baseUrl}/images/${metadataFilename}`;
    
    res.json({ success: true, metadataUrl, metadataId });
    
  } catch (error) {
    console.error('Metadata creation error:', error);
    res.status(500).json({ error: 'Failed to create metadata' });
  }
});

setInterval(async () => {
  await savePlots();
  await saveUserPositions();
  await saveNFTInventory();
  await saveUserInventories();
}, 30000);

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await savePlots();
  await saveUserPositions();
  process.exit(0);
});

loadPersistedData().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`World map has ${worldMapData.nodes.length} nodes`);
    console.log(`Loaded ${plots.size} plots`);
  });
}).catch(console.error);
