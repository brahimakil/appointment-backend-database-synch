const SyncService = require('./syncService');
const AuthSyncService = require('./authSyncService');
const { checkMainAuthHealth, checkBackupAuthHealth, checkMainDbHealth, checkBackupDbHealth } = require('../config/firebase');
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class EnhancedSyncService extends SyncService {
  constructor(socketIo) {
    super(socketIo);
    this.authSyncService = new AuthSyncService(socketIo);
    this.isMainAuthOnline = false;
    this.isBackupAuthOnline = false;
    this.isMainDbOnline = false;
    this.isBackupDbOnline = false;
    this.lastAuthSync = null;
    this.statsFile = path.join(__dirname, '../../logs/sync-stats.json');
    
    // Expose databases for debugging
    this.mainDb = require('../config/firebase').mainDb;
    this.backupDb = require('../config/firebase').backupDb;
    
    // Initialize with real values
    this.syncStats = {
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
    
    // Load saved stats
    this.loadStats();
    
    // Initialize health status immediately
    this.checkDatabaseHealth();
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const savedStats = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
        this.syncStats = { ...this.syncStats, ...savedStats };
        logger.info(`📊 Loaded stats: ${this.syncStats.totalSynced} total synced, ${this.syncStats.authSync.syncedUsers} users synced`);
      }
    } catch (error) {
      logger.error('❌ Failed to load stats:', error);
    }
  }

  saveStats() {
    try {
      const logsDir = path.dirname(this.statsFile);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      fs.writeFileSync(this.statsFile, JSON.stringify(this.syncStats, null, 2));
    } catch (error) {
      logger.error('❌ Failed to save stats:', error);
    }
  }

  async checkDatabaseHealth() {
    try {
      this.isMainDbOnline = await checkMainDbHealth();
      this.isBackupDbOnline = await checkBackupDbHealth();
      this.isMainAuthOnline = await checkMainAuthHealth();
      this.isBackupAuthOnline = await checkBackupAuthHealth();
      
      const status = {
        mainDb: this.isMainDbOnline,
        backupDb: this.isBackupDbOnline,
        mainAuth: this.isMainAuthOnline,
        backupAuth: this.isBackupAuthOnline,
        timestamp: new Date().toISOString()
      };
      
      logger.info(`💊 Health: MainDB=${status.mainDb}, BackupDB=${status.backupDb}, MainAuth=${status.mainAuth}, BackupAuth=${status.backupAuth}`);
      
      this.io.emit('healthCheck', status);
      return status;
    } catch (error) {
      logger.error('❌ Health check failed:', error);
      const status = {
        mainDb: false,
        backupDb: false,
        mainAuth: false,
        backupAuth: false,
        timestamp: new Date().toISOString()
      };
      this.io.emit('healthCheck', status);
      return status;
    }
  }

  async init() {
    // Do health check every 10 seconds
    setInterval(async () => {
      await this.checkDatabaseHealth();
    }, 10000);
  }

  async performFullSync() {
    if (this.isSyncing) {
      logger.warn('⚠️ Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.syncStats.status = 'syncing';
    this.syncStats.lastSync = new Date().toISOString();
    this.emitStats();
    
    try {
      await this.checkDatabaseHealth();
      
      if (!this.isMainDbOnline || !this.isMainAuthOnline) {
        logger.warn('⚠️ Main database or auth is offline');
        this.syncStats.status = 'paused';
        this.emitStats();
        return;
      }
      
      if (!this.isBackupDbOnline || !this.isBackupAuthOnline) {
        logger.error('❌ Backup database or auth is offline');
        this.syncStats.status = 'error';
        this.syncStats.errors++;
        this.emitStats();
        return;
      }
      
      // Perform Firestore sync
      const firestoreSynced = await this.performFirestoreSync();
      
      // Perform Auth sync
      try {
        const authStats = await this.authSyncService.performFullAuthSync();
        this.syncStats.authSync = authStats;
        this.lastAuthSync = new Date().toISOString();
      } catch (error) {
        logger.error('❌ Authentication sync failed:', error);
        this.syncStats.errors++;
      }
      
      this.syncStats.status = 'completed';
      this.syncStats.lastSync = new Date().toISOString();
      this.saveStats();
      
      logger.info('🎉 Enhanced sync completed!');
      
    } catch (error) {
      logger.error('❌ Enhanced sync failed:', error);
      this.syncStats.status = 'error';
      this.syncStats.errors++;
      this.saveStats();
    } finally {
      this.isSyncing = false;
      this.emitStats();
    }
  }

  async performFirestoreSync() {
    await this.discoverCollections();
    
    let totalSynced = 0;
    const isFirstSync = !this.syncStats.lastFullSync;
    
    logger.info(`📊 Syncing ${this.collections.length} collections`);
    
    for (const collectionName of this.collections) {
      try {
        const syncedCount = await this.syncCollectionToBackup(collectionName, !isFirstSync);
        totalSynced += syncedCount;
        
        this.io.emit('collectionSynced', {
          collection: collectionName,
          documentCount: syncedCount,
          timestamp: new Date().toISOString(),
          incremental: !isFirstSync
        });
      } catch (error) {
        logger.error(`❌ Failed to sync ${collectionName}:`, error);
        this.syncStats.errors++;
      }
    }
    
    this.syncStats.totalSynced += totalSynced;
    this.syncStats.incrementalSyncs++;
    
    if (isFirstSync) {
      this.syncStats.lastFullSync = new Date().toISOString();
    }
    
    this.saveStats();
    
    logger.info(`🎉 Firestore sync completed! ${totalSynced} documents synced`);
    return totalSynced;
  }

  emitStats() {
    this.io.emit('syncStats', this.getStats());
  }

  getStats() {
    return {
      ...this.syncStats,
      authStats: this.authSyncService.getAuthStats(),
      healthStatus: {
        mainDb: this.isMainDbOnline,
        backupDb: this.isBackupDbOnline,
        mainAuth: this.isMainAuthOnline,
        backupAuth: this.isBackupAuthOnline
      }
    };
  }

  async forceFullAuthSync() {
    try {
      const authStats = await this.authSyncService.performFullAuthSync();
      this.syncStats.authSync = authStats;
      this.lastAuthSync = new Date().toISOString();
      this.saveStats();
      return authStats;
    } catch (error) {
      logger.error('❌ Force full auth sync failed:', error);
      throw error;
    }
  }

  async verifyAuthIntegrity() {
    try {
      return await this.authSyncService.verifyAuthSyncIntegrity();
    } catch (error) {
      logger.error('❌ Auth integrity verification failed:', error);
      throw error;
    }
  }

  async performRecovery() {
    if (this.isSyncing) {
      logger.warn('⚠️ Recovery already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.syncStats.status = 'recovering';
    this.emitStats();
    
    try {
      if (!this.isMainDbOnline || !this.isMainAuthOnline) {
        logger.warn('⚠️ Main database or auth still offline, cannot recover');
        return;
      }
      
      let totalRecovered = 0;
      
      for (const collectionName of this.collections) {
        try {
          const recoveredCount = await this.syncCollectionToMain(collectionName, true);
          totalRecovered += recoveredCount;
          
          this.io.emit('collectionRecovered', {
            collection: collectionName,
            documentCount: recoveredCount,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          logger.error(`❌ Failed to recover ${collectionName}:`, error);
          this.syncStats.errors++;
        }
      }
      
      this.syncStats.totalSynced += totalRecovered;
      this.syncStats.status = 'completed';
      this.saveStats();
      
      logger.info('🎉 Recovery completed!');
      
    } catch (error) {
      logger.error('❌ Recovery failed:', error);
      this.syncStats.status = 'error';
      this.syncStats.errors++;
      this.saveStats();
    } finally {
      this.isSyncing = false;
      this.emitStats();
    }
  }
}

module.exports = EnhancedSyncService;