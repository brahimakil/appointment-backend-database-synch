require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const { logger } = require('./utils/logger');
const { testConnections } = require('./config/firebase');
const EnhancedSyncService = require('./services/enhancedSyncService');

const app = express();
const server = http.createServer(app);

// Fix Socket.IO configuration for stability
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 120000,    // 2 minutes (was 60s)
  pingInterval: 30000,    // 30 seconds (was 25s)
  upgradeTimeout: 30000,  // 30 seconds for upgrade
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 45000,  // 45 seconds connection timeout
  serveClient: false,
  allowUpgrades: true,
  perMessageDeflate: false
});

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Create logs directory if it doesn't exist
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Initialize enhanced sync service
const syncService = new EnhancedSyncService(io);

// Initialize health checks
syncService.init();

// Enhanced API Routes
app.get('/api/health', async (req, res) => {
  const healthStatus = await syncService.checkDatabaseHealth();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: healthStatus
  });
});

app.get('/api/stats', (req, res) => {
  res.json(syncService.getStats());
});

app.post('/api/sync', async (req, res) => {
  try {
    await syncService.performFullSync();
    res.json({ success: true, message: 'Enhanced sync initiated (Firestore + Auth)' });
  } catch (error) {
    logger.error('❌ Manual sync failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync/full', async (req, res) => {
  try {
    await syncService.forceFullSync();
    res.json({ success: true, message: 'Full sync initiated (Firestore + Auth)' });
  } catch (error) {
    logger.error('❌ Manual full sync failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync/auth', async (req, res) => {
  try {
    const authStats = await syncService.forceFullAuthSync();
    res.json({ success: true, message: 'Auth sync completed', stats: authStats });
  } catch (error) {
    logger.error('❌ Auth sync failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/recover', async (req, res) => {
  try {
    await syncService.performRecovery();
    res.json({ success: true, message: 'Enhanced recovery initiated (Firestore + Auth)' });
  } catch (error) {
    logger.error('❌ Manual recovery failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/collections', async (req, res) => {
  try {
    const collections = await syncService.discoverCollections();
    res.json({ collections });
  } catch (error) {
    logger.error('❌ Failed to get collections:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:name/schema', async (req, res) => {
  try {
    const collectionName = req.params.name;
    await syncService.analyzeCollectionSchema(collectionName);
    const schema = syncService.collectionsSchema.get(collectionName);
    res.json({ collection: collectionName, schema });
  } catch (error) {
    logger.error('❌ Failed to get collection schema:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/integrity-check', async (req, res) => {
  try {
    const report = await syncService.performDataIntegrityCheck();
    res.json({ success: true, report });
  } catch (error) {
    logger.error('❌ Integrity check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auth-integrity-check', async (req, res) => {
  try {
    const report = await syncService.verifyAuthIntegrity();
    res.json({ success: true, report });
  } catch (error) {
    logger.error('❌ Auth integrity check failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Client configuration endpoint
app.get('/api/firebase-config', async (req, res) => {
  try {
    const healthStatus = await syncService.checkDatabaseHealth();
    
    // Return appropriate config based on health status
    const configToUse = healthStatus.mainDb && healthStatus.mainAuth ? 'main' : 'backup';
    
    res.json({
      currentConfig: configToUse,
      healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to get Firebase config:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoints
app.get('/api/debug/main-count', async (req, res) => {
  try {
    const counts = {};
    const collections = ['users', 'appointments', 'availability', 'chats', 'notifications', 'specialities'];
    
    for (const collection of collections) {
      const snapshot = await syncService.mainDb.collection(collection).get();
      counts[collection] = snapshot.size;
    }
    
    logger.info('📊 Main DB counts:', counts);
    res.json({ success: true, message: `Main DB counts: ${JSON.stringify(counts)}`, counts });
  } catch (error) {
    logger.error('❌ Failed to get main DB counts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/backup-count', async (req, res) => {
  try {
    const counts = {};
    const collections = ['users', 'appointments', 'availability', 'chats', 'notifications', 'specialities'];
    
    for (const collection of collections) {
      const snapshot = await syncService.backupDb.collection(collection).get();
      counts[collection] = snapshot.size;
    }
    
    logger.info('📊 Backup DB counts:', counts);
    res.json({ success: true, message: `Backup DB counts: ${JSON.stringify(counts)}`, counts });
  } catch (error) {
    logger.error('❌ Failed to get backup DB counts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/debug/test-write', async (req, res) => {
  try {
    const testDoc = {
      test: true,
      message: 'Test document from sync system',
      timestamp: new Date().toISOString()
    };
    
    await syncService.backupDb.collection('test').doc('sync-test').set(testDoc);
    logger.info('✅ Test write to backup DB successful');
    res.json({ success: true, message: 'Test write successful - check backup DB for "test" collection' });
  } catch (error) {
    logger.error('❌ Test write failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health-check', async (req, res) => {
  try {
    const healthStatus = await syncService.checkDatabaseHealth();
    res.json({ success: true, health: healthStatus });
  } catch (error) {
    logger.error('❌ Health check API failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/reset-stats', (req, res) => {
  try {
    syncService.syncStats = {
      totalSynced: 0,
      lastSync: null,
      errors: 0,
      collections: [],
      status: 'idle',
      duplicatesSkipped: 0,
      incrementalSyncs: 0,
      lastFullSync: null,
      authSync: {
        totalUsers: 0,
        syncedUsers: 0,
        errors: 0,
        lastSync: null,
        customClaims: 0
      }
    };
    syncService.saveStats();
    res.json({ success: true, message: 'Stats reset successfully' });
  } catch (error) {
    logger.error('❌ Failed to reset stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enhanced Socket.IO connection handling with stability monitoring
io.on('connection', async (socket) => {
  logger.info('👤 Client connected:', socket.id);
  
  try {
    // Send initial stats and health status immediately
    socket.emit('syncStats', syncService.getStats());
    
    // Send current health status immediately
    const healthStatus = await syncService.checkDatabaseHealth();
    socket.emit('healthCheck', healthStatus);
    
    // Send connection confirmation
    socket.emit('connectionConfirmed', { 
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
    
    // Handle client requests
    socket.on('requestHealthCheck', async () => {
      try {
        const healthStatus = await syncService.checkDatabaseHealth();
        socket.emit('healthCheck', healthStatus);
      } catch (error) {
        logger.error('❌ Failed to send health check:', error);
      }
    });

    // Handle ping/pong for connection stability
    socket.on('ping', () => {
      socket.emit('pong');
    });
    
    socket.on('disconnect', (reason) => {
      logger.info('👤 Client disconnected:', socket.id, 'Reason:', reason);
      
      // Don't spam logs for normal disconnections
      if (reason === 'client namespace disconnect' || reason === 'server namespace disconnect') {
        // These are normal disconnections
      } else {
        logger.warn('⚠️ Unexpected disconnect:', reason);
      }
    });
    
    socket.on('error', (error) => {
      logger.error('❌ Socket error for', socket.id, ':', error);
    });
    
  } catch (error) {
    logger.error('❌ Error in socket connection handler:', error);
  }
});

// Monitor connection health
setInterval(() => {
  const connectedClients = io.engine.clientsCount;
  logger.info(`📊 Connected clients: ${connectedClients}`);
}, 60000); // Every minute

// Error handling for Socket.IO
io.on('error', (error) => {
  logger.error('❌ Socket.IO error:', error);
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// Initialize server
const PORT = process.env.PORT || 3001;
const SYNC_INTERVAL = process.env.SYNC_INTERVAL_MINUTES || 1;
const AUTH_SYNC_INTERVAL = process.env.AUTH_SYNC_INTERVAL_MINUTES || 5;

async function startServer() {
  try {
    // Test database and auth connections
    logger.info('🔌 Testing database and auth connections...');
    await testConnections();
    
    // Discover collections on startup
    await syncService.discoverCollections();
    
    // 🔥 MAIN AUTO-SYNC EVERY 10 MINUTES (ONLY ONE WE WANT)
    cron.schedule('*/10 * * * *', async () => {
      logger.info('🔄 Auto-sync triggered (every 10 minutes)');
      io.emit('autoSyncTriggered', { 
        timestamp: new Date().toISOString(),
        interval: '10 minutes'
      });
      await syncService.performFullSync();
    });

    // ❌ DISABLE THESE - They're causing extra syncing!
    // 
    // // Schedule regular sync (incremental) - includes auth
    // cron.schedule(`*/${SYNC_INTERVAL} * * * *`, async () => {
    //   logger.info('⏰ Scheduled enhanced sync triggered');
    //   await syncService.performFullSync();
    // });
    //
    // // Schedule auth-only sync more frequently
    // cron.schedule(`*/${AUTH_SYNC_INTERVAL} * * * *`, async () => {
    //   logger.info('🔐 Scheduled auth sync triggered');
    //   await syncService.forceFullAuthSync();
    // });

    // Keep collection discovery (useful for schema changes)
    cron.schedule('*/5 * * * *', async () => {
      logger.info('🔍 Scheduled collection discovery');
      await syncService.discoverCollections();
    });

    // Keep integrity check (useful for monitoring)
    cron.schedule('0 * * * *', async () => {
      logger.info('🔍 Scheduled integrity checks');
      await syncService.performDataIntegrityCheck();
      await syncService.verifyAuthIntegrity();
    });

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 Enhanced Firebase Sync Server (Firestore + Auth) running on port ${PORT}`);
      logger.info(`🔄 ONLY Auto-sync: Every 10 minutes`);
      logger.info(`🔍 Collection discovery: Every 5 minutes`);
      logger.info(`🔍 Integrity checks: Every hour`);
      logger.info(`🌐 Dashboard available at: http://localhost:${PORT}`);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('⏹️ Shutting down server...');
  server.close(() => {
    logger.info('✅ Server closed');
    process.exit(0);
  });
});

startServer(); 