const { mainApp, backupApp } = require('../config/firebase');
const { logger } = require('../utils/logger');

class AuthSyncService {
  constructor(socketIo) {
    this.io = socketIo;
    this.mainAuth = mainApp.auth();
    this.backupAuth = backupApp.auth();
    this.authSyncStats = {
      totalUsers: 0,
      syncedUsers: 0,
      errors: 0,
      lastSync: null,
      customClaims: 0
    };
    this.userMap = new Map(); // Map main UID to backup UID
  }

  // Export all users from main Firebase Auth
  async exportUsersFromMain() {
    try {
      logger.info('📤 Exporting users from main Firebase Auth...');
      const allUsers = [];
      let nextPageToken;

      do {
        const listResult = await this.mainAuth.listUsers(1000, nextPageToken);
        allUsers.push(...listResult.users);
        nextPageToken = listResult.pageToken;
        
        logger.info(`📊 Exported ${allUsers.length} users so far...`);
        
        this.io.emit('authSyncProgress', {
          action: 'exporting',
          userCount: allUsers.length,
          phase: 'export'
        });
      } while (nextPageToken);

      logger.info(`✅ Successfully exported ${allUsers.length} users from main auth`);
      return allUsers;
    } catch (error) {
      logger.error('❌ Failed to export users from main auth:', error);
      throw error;
    }
  }

  // Import users to backup Firebase Auth
  async importUsersToBackup(users) {
    try {
      logger.info(`📥 Importing ${users.length} users to backup Firebase Auth...`);
      
      const batchSize = 1000; // Firebase Auth import limit
      let totalImported = 0;
      
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        
        // Prepare user import data
        const usersToImport = batch.map(user => ({
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          displayName: user.displayName,
          photoURL: user.photoURL,
          phoneNumber: user.phoneNumber,
          disabled: user.disabled,
          metadata: {
            lastSignInTime: user.metadata.lastSignInTime,
            creationTime: user.metadata.creationTime
          },
          customClaims: user.customClaims || {},
          providerData: user.providerData?.map(provider => ({
            uid: provider.uid,
            email: provider.email,
            displayName: provider.displayName,
            photoURL: provider.photoURL,
            providerId: provider.providerId,
            phoneNumber: provider.phoneNumber
          })) || []
        }));

        try {
          const result = await this.backupAuth.importUsers(usersToImport, {
            hash: {
              algorithm: 'SCRYPT',
              // Firebase uses SCRYPT for password hashing
              key: Buffer.from(''), // Empty key for Firebase default
              saltSeparator: Buffer.from(''), // Empty salt separator
              rounds: 8,
              memoryCost: 14
            }
          });

          totalImported += result.successCount;
          
          if (result.failureCount > 0) {
            logger.warn(`⚠️ Failed to import ${result.failureCount} users in batch`);
            result.errors.forEach(error => {
              logger.error(`❌ Import error for user ${error.index}:`, error.error);
            });
          }

          this.io.emit('authSyncProgress', {
            action: 'importing',
            userCount: totalImported,
            phase: 'import',
            total: users.length
          });

          logger.info(`✅ Imported batch: ${result.successCount} success, ${result.failureCount} failed`);
        } catch (error) {
          logger.error('❌ Failed to import batch:', error);
          this.authSyncStats.errors++;
        }
      }

      logger.info(`✅ Successfully imported ${totalImported} users to backup auth`);
      return totalImported;
    } catch (error) {
      logger.error('❌ Failed to import users to backup auth:', error);
      throw error;
    }
  }

  // Sync custom claims between main and backup
  async syncCustomClaims() {
    try {
      logger.info('🔐 Syncing custom claims...');
      
      // Get all users from main auth
      const mainUsers = await this.exportUsersFromMain();
      let claimsSynced = 0;

      for (const user of mainUsers) {
        if (user.customClaims && Object.keys(user.customClaims).length > 0) {
          try {
            await this.backupAuth.setCustomUserClaims(user.uid, user.customClaims);
            claimsSynced++;
          } catch (error) {
            logger.error(`❌ Failed to sync claims for user ${user.uid}:`, error);
          }
        }
      }

      logger.info(`✅ Synced custom claims for ${claimsSynced} users`);
      return claimsSynced;
    } catch (error) {
      logger.error('❌ Failed to sync custom claims:', error);
      throw error;
    }
  }

  // Full authentication sync
  async performFullAuthSync() {
    try {
      logger.info('🔐 Starting full authentication sync...');
      this.authSyncStats.lastSync = new Date().toISOString();
      
      // Export users from main
      const users = await this.exportUsersFromMain();
      this.authSyncStats.totalUsers = users.length;
      
      // Import users to backup
      const syncedCount = await this.importUsersToBackup(users);
      this.authSyncStats.syncedUsers = syncedCount;
      
      // Sync custom claims
      const claimsSynced = await this.syncCustomClaims();
      this.authSyncStats.customClaims = claimsSynced;
      
      logger.info(`🎉 Auth sync completed! ${syncedCount} users synced, ${claimsSynced} claims synced`);
      
      this.io.emit('authSyncComplete', {
        totalUsers: this.authSyncStats.totalUsers,
        syncedUsers: this.authSyncStats.syncedUsers,
        customClaims: this.authSyncStats.customClaims,
        errors: this.authSyncStats.errors,
        timestamp: new Date().toISOString()
      });
      
      return this.authSyncStats;
    } catch (error) {
      logger.error('❌ Full auth sync failed:', error);
      this.authSyncStats.errors++;
      throw error;
    }
  }

  // Incremental auth sync (sync only new/updated users)
  async performIncrementalAuthSync(since) {
    try {
      logger.info('🔐 Starting incremental authentication sync...');
      
      // Get users created/modified since last sync
      const users = await this.exportUsersFromMain();
      const sinceDate = new Date(since);
      
      const newUsers = users.filter(user => {
        const creationTime = new Date(user.metadata.creationTime);
        const lastSignInTime = user.metadata.lastSignInTime ? 
          new Date(user.metadata.lastSignInTime) : creationTime;
        
        return creationTime > sinceDate || lastSignInTime > sinceDate;
      });
      
      if (newUsers.length === 0) {
        logger.info('✅ No new users to sync');
        return 0;
      }
      
      logger.info(`📊 Found ${newUsers.length} users to sync incrementally`);
      
      // Import new users
      const syncedCount = await this.importUsersToBackup(newUsers);
      
      // Sync custom claims for new users
      let claimsSynced = 0;
      for (const user of newUsers) {
        if (user.customClaims && Object.keys(user.customClaims).length > 0) {
          try {
            await this.backupAuth.setCustomUserClaims(user.uid, user.customClaims);
            claimsSynced++;
          } catch (error) {
            logger.error(`❌ Failed to sync claims for user ${user.uid}:`, error);
          }
        }
      }
      
      logger.info(`✅ Incremental auth sync completed! ${syncedCount} users synced`);
      return syncedCount;
    } catch (error) {
      logger.error('❌ Incremental auth sync failed:', error);
      throw error;
    }
  }

  // Get auth sync statistics
  getAuthStats() {
    return this.authSyncStats;
  }

  // Check if user exists in backup auth
  async userExistsInBackup(uid) {
    try {
      await this.backupAuth.getUser(uid);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Verify auth sync integrity
  async verifyAuthSyncIntegrity() {
    try {
      logger.info('🔍 Verifying auth sync integrity...');
      
      const mainUsers = await this.exportUsersFromMain();
      const backupUsers = [];
      let nextPageToken;

      // Get all backup users
      do {
        const listResult = await this.backupAuth.listUsers(1000, nextPageToken);
        backupUsers.push(...listResult.users);
        nextPageToken = listResult.pageToken;
      } while (nextPageToken);

      const mainUids = new Set(mainUsers.map(u => u.uid));
      const backupUids = new Set(backupUsers.map(u => u.uid));
      
      const missingInBackup = [...mainUids].filter(uid => !backupUids.has(uid));
      const extraInBackup = [...backupUids].filter(uid => !mainUids.has(uid));
      
      const report = {
        mainCount: mainUsers.length,
        backupCount: backupUsers.length,
        missingInBackup: missingInBackup.length,
        extraInBackup: extraInBackup.length,
        missingUids: missingInBackup,
        extraUids: extraInBackup,
        timestamp: new Date().toISOString()
      };
      
      logger.info(`🔍 Auth integrity check: ${missingInBackup.length} missing, ${extraInBackup.length} extra`);
      
      this.io.emit('authIntegrityReport', report);
      return report;
    } catch (error) {
      logger.error('❌ Auth integrity check failed:', error);
      throw error;
    }
  }
}

module.exports = AuthSyncService; 