require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

const { mainDb, backupDb, checkMainDbHealth, checkBackupDbHealth } = require('../config/firebase');
const { logger } = require('../utils/logger');
const _ = require('lodash');

class SyncService {
  constructor(socketIo) {
    this.io = socketIo;
    this.isMainDbOnline = true;
    this.isBackupDbOnline = true;
    this.syncStats = {
      totalSynced: 0,
      lastSync: null,
      errors: 0,
      collections: [],
      status: 'idle',
      lastFullSync: null,
      incrementalSyncs: 0,
      duplicatesSkipped: 0
    };
    this.collections = [];
    this.collectionsSchema = new Map(); // Track schema for each collection
    this.isSyncing = false;
    this.lastSyncTimestamp = null;
    this.syncMetadata = new Map(); // Track last sync timestamps per collection
  }

  // Enhanced collection discovery with schema tracking
  async discoverCollections() {
    try {
      logger.info('🔍 Discovering collections and analyzing schemas...');
      
      // Get collections from main database
      const mainCollections = await mainDb.listCollections();
      const newCollections = mainCollections.map(col => col.id);
      
      // Add known collections from schema if not present
      const knownCollections = ['appointments', 'availability', 'chats', 'notifications', 'specialities', 'users'];
      for (const collection of knownCollections) {
        if (!newCollections.includes(collection)) {
          newCollections.push(collection);
        }
      }

      // Check for new collections
      const addedCollections = newCollections.filter(col => !this.collections.includes(col));
      if (addedCollections.length > 0) {
        logger.info(`🆕 Found ${addedCollections.length} new collections:`, addedCollections);
      }

      this.collections = newCollections;

      // Analyze schema for each collection
      for (const collectionName of this.collections) {
        await this.analyzeCollectionSchema(collectionName);
      }

      logger.info(`📋 Active collections: ${this.collections.length}`, this.collections);
      this.syncStats.collections = this.collections;
      this.emitStats();
      
      return this.collections;
    } catch (error) {
      logger.error('❌ Failed to discover collections:', error);
      return [];
    }
  }

  // Analyze and track schema changes for each collection
  async analyzeCollectionSchema(collectionName) {
    try {
      // Get a few sample documents to analyze schema
      const snapshot = await mainDb.collection(collectionName).limit(5).get();
      const schema = new Set();
      
      snapshot.forEach(doc => {
        this.extractKeysFromObject(doc.data(), schema);
      });

      const schemaArray = Array.from(schema);
      const previousSchema = this.collectionsSchema.get(collectionName);
      
      if (previousSchema) {
        const newKeys = schemaArray.filter(key => !previousSchema.includes(key));
        if (newKeys.length > 0) {
          logger.info(`🔧 Schema changes detected in ${collectionName}:`, newKeys);
          this.io.emit('schemaChange', {
            collection: collectionName,
            newKeys,
            totalKeys: schemaArray.length
          });
        }
      }

      this.collectionsSchema.set(collectionName, schemaArray);
      logger.info(`📊 Schema for ${collectionName}: ${schemaArray.length} unique keys`);
      
    } catch (error) {
      logger.error(`❌ Failed to analyze schema for ${collectionName}:`, error);
    }
  }

  // Recursively extract all keys from nested objects
  extractKeysFromObject(obj, keySet, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keySet.add(fullKey);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.extractKeysFromObject(value, keySet, fullKey);
      }
    }
  }

  // Enhanced incremental sync - only sync new/updated documents
  async getIncrementalDocuments(db, collectionName, lastSyncTime = null) {
    try {
      logger.info(`📖 Getting documents from ${collectionName} since ${lastSyncTime || 'beginning'}`);
      
      const documents = [];
      let query = db.collection(collectionName);
      
      // If we have a last sync time, only get documents updated after that
      if (lastSyncTime) {
        query = query.where('updatedAt', '>', lastSyncTime);
        logger.info(`📅 Filtering by updatedAt > ${lastSyncTime}`);
      }
      
      const snapshot = await query.get();
      logger.info(`📊 Query returned ${snapshot.size} documents from ${collectionName}`);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        documents.push({
          id: doc.id,
          data: data,
          updatedAt: data.updatedAt || data.createdAt || new Date().toISOString()
        });
      });
      
      logger.info(`📄 Processed ${documents.length} documents from ${collectionName}`);
      return documents;
    } catch (error) {
      logger.error(`❌ Failed to get documents from ${collectionName}:`, error);
      throw error;
    }
  }

  // Check for and prevent duplicates
  async checkForDuplicates(targetDb, collectionName, documents) {
    try {
      const existingDocs = new Set();
      const duplicateCheck = new Map();
      
      // Get existing document IDs in batches
      const batchSize = 100;
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const docIds = batch.map(doc => doc.id);
        
        // Check which documents already exist
        const docRefs = docIds.map(id => targetDb.collection(collectionName).doc(id));
        const snapshots = await targetDb.getAll(...docRefs);
        
        snapshots.forEach((snapshot, index) => {
          if (snapshot.exists) {
            const existingData = snapshot.data();
            const newData = batch[index].data;
            
            // Compare updatedAt timestamps
            const existingTimestamp = existingData.updatedAt || existingData.createdAt;
            const newTimestamp = newData.updatedAt || newData.createdAt;
            
            if (existingTimestamp && newTimestamp && existingTimestamp >= newTimestamp) {
              existingDocs.add(batch[index].id);
            } else {
              duplicateCheck.set(batch[index].id, {
                existing: existingTimestamp,
                new: newTimestamp,
                shouldUpdate: true
              });
            }
          }
        });
      }
      
      // Filter out duplicates
      const filteredDocs = documents.filter(doc => {
        if (existingDocs.has(doc.id)) {
          this.syncStats.duplicatesSkipped++;
          return false;
        }
        return true;
      });
      
      logger.info(`🔍 Duplicate check for ${collectionName}: ${documents.length} input, ${filteredDocs.length} to sync, ${existingDocs.size} duplicates skipped`);
      
      return filteredDocs;
    } catch (error) {
      logger.error(`❌ Failed to check duplicates for ${collectionName}:`, error);
      return documents; // Return original documents if check fails
    }
  }

  // Enhanced sync with incremental updates and duplicate prevention
  async syncCollectionToBackup(collectionName, incrementalOnly = true) {
    try {
      logger.info(`📋 Starting ${incrementalOnly ? 'incremental' : 'full'} sync for ${collectionName}...`);
      
      const lastSyncTime = incrementalOnly ? this.syncMetadata.get(collectionName) : null;
      logger.info(`📅 Last sync time for ${collectionName}: ${lastSyncTime || 'Never'}`);
      
      const documents = await this.getIncrementalDocuments(mainDb, collectionName, lastSyncTime);
      logger.info(`📄 Found ${documents.length} documents to process in ${collectionName}`);
      
      if (documents.length === 0) {
        logger.info(`✅ No new documents to sync in ${collectionName}`);
        return 0;
      }
      
      // Log sample document IDs
      const sampleIds = documents.slice(0, 3).map(doc => doc.id);
      logger.info(`📋 Sample document IDs: ${sampleIds.join(', ')}`);
      
      // Check for duplicates
      const documentsToSync = await this.checkForDuplicates(backupDb, collectionName, documents);
      logger.info(`📊 After duplicate check: ${documentsToSync.length} documents to sync in ${collectionName}`);
      
      if (documentsToSync.length === 0) {
        logger.info(`✅ All documents in ${collectionName} are up to date`);
        return 0;
      }
      
      // Perform batch writes with enhanced error handling
      logger.info(`📝 Starting batch write for ${documentsToSync.length} documents in ${collectionName}`);
      
      const batch = backupDb.batch();
      let batchCount = 0;
      let totalSynced = 0;
      let latestTimestamp = lastSyncTime;
      
      for (const doc of documentsToSync) {
        try {
          const docRef = backupDb.collection(collectionName).doc(doc.id);
          batch.set(docRef, doc.data, { merge: true });
          batchCount++;
          
          // Track latest timestamp
          if (doc.updatedAt && (!latestTimestamp || doc.updatedAt > latestTimestamp)) {
            latestTimestamp = doc.updatedAt;
          }
          
          // Commit batch every 450 operations (safe limit)
          if (batchCount >= 450) {
            logger.info(`📝 Committing batch of ${batchCount} documents for ${collectionName}`);
            await batch.commit();
            totalSynced += batchCount;
            batchCount = 0;
            
            this.io.emit('syncProgress', {
              collection: collectionName,
              documentCount: totalSynced,
              action: 'writing',
              total: documentsToSync.length
            });
          }
        } catch (error) {
          logger.error(`❌ Failed to add document ${doc.id} to batch:`, error);
          this.syncStats.errors++;
        }
      }
      
      // Commit remaining operations
      if (batchCount > 0) {
        logger.info(`📝 Committing final batch of ${batchCount} documents for ${collectionName}`);
        await batch.commit();
        totalSynced += batchCount;
      }
      
      // Update sync metadata
      this.syncMetadata.set(collectionName, latestTimestamp);
      
      logger.info(`✅ Successfully synced ${totalSynced} documents in ${collectionName}`);
      
      // Verify the sync worked
      logger.info(`🔍 Verifying sync for ${collectionName}...`);
      const backupSnapshot = await backupDb.collection(collectionName).get();
      logger.info(`📊 Backup DB now has ${backupSnapshot.size} documents in ${collectionName}`);
      
      return totalSynced;
    } catch (error) {
      logger.error(`❌ Failed to sync ${collectionName}:`, error);
      throw error;
    }
  }

  // Enhanced recovery with incremental updates
  async syncCollectionToMain(collectionName, incrementalOnly = true) {
    try {
      logger.info(`🔄 Starting ${incrementalOnly ? 'incremental' : 'full'} recovery for ${collectionName}...`);
      
      const lastSyncTime = incrementalOnly ? this.syncMetadata.get(`${collectionName}_recovery`) : null;
      const documents = await this.getIncrementalDocuments(backupDb, collectionName, lastSyncTime);
      
      if (documents.length === 0) {
        logger.info(`✅ No new documents to recover in ${collectionName}`);
        return 0;
      }
      
      // Check for duplicates
      const documentsToRecover = await this.checkForDuplicates(mainDb, collectionName, documents);
      
      if (documentsToRecover.length === 0) {
        logger.info(`✅ All documents in ${collectionName} are up to date`);
        return 0;
      }
      
      const batch = mainDb.batch();
      let batchCount = 0;
      let totalRecovered = 0;
      let latestTimestamp = lastSyncTime;
      
      for (const doc of documentsToRecover) {
        try {
          const docRef = mainDb.collection(collectionName).doc(doc.id);
          batch.set(docRef, doc.data, { merge: true });
          batchCount++;
          
          if (doc.updatedAt && (!latestTimestamp || doc.updatedAt > latestTimestamp)) {
            latestTimestamp = doc.updatedAt;
          }
          
          if (batchCount >= 450) {
            await batch.commit();
            totalRecovered += batchCount;
            batchCount = 0;
            
            this.io.emit('recoveryProgress', {
              collection: collectionName,
              documentCount: totalRecovered,
              action: 'recovering',
              total: documentsToRecover.length
            });
          }
        } catch (error) {
          logger.error(`❌ Failed to add document ${doc.id} to recovery batch:`, error);
          this.syncStats.errors++;
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
        totalRecovered += batchCount;
      }
      
      // Update recovery metadata
      this.syncMetadata.set(`${collectionName}_recovery`, latestTimestamp);
      
      logger.info(`✅ Successfully recovered ${totalRecovered} documents in ${collectionName}`);
      return totalRecovered;
    } catch (error) {
      logger.error(`❌ Failed to recover ${collectionName}:`, error);
      throw error;
    }
  }

  // Data integrity check
  async performDataIntegrityCheck() {
    try {
      logger.info('🔍 Performing data integrity check...');
      
      const integrityReport = {
        collections: {},
        totalIssues: 0,
        timestamp: new Date().toISOString()
      };
      
      for (const collectionName of this.collections) {
        try {
          const mainSnapshot = await mainDb.collection(collectionName).get();
          const backupSnapshot = await backupDb.collection(collectionName).get();
          
          const mainDocs = new Map();
          const backupDocs = new Map();
          
          mainSnapshot.forEach(doc => {
            mainDocs.set(doc.id, doc.data());
          });
          
          backupSnapshot.forEach(doc => {
            backupDocs.set(doc.id, doc.data());
          });
          
          const issues = [];
          
          // Check for missing documents in backup
          for (const [id] of mainDocs) {
            if (!backupDocs.has(id)) {
              issues.push({ type: 'missing_in_backup', documentId: id });
            }
          }
          
          // Check for missing documents in main
          for (const [id] of backupDocs) {
            if (!mainDocs.has(id)) {
              issues.push({ type: 'missing_in_main', documentId: id });
            }
          }
          
          integrityReport.collections[collectionName] = {
            mainCount: mainDocs.size,
            backupCount: backupDocs.size,
            issues: issues.length,
            issueDetails: issues
          };
          
          integrityReport.totalIssues += issues.length;
          
        } catch (error) {
          logger.error(`❌ Failed integrity check for ${collectionName}:`, error);
          integrityReport.collections[collectionName] = {
            error: error.message
          };
        }
      }
      
      logger.info(`🔍 Integrity check completed: ${integrityReport.totalIssues} issues found`);
      this.io.emit('integrityReport', integrityReport);
      
      return integrityReport;
    } catch (error) {
      logger.error('❌ Data integrity check failed:', error);
      throw error;
    }
  }

  // Enhanced main sync process with all improvements
  async performFullSync() {
    if (this.isSyncing) {
      logger.warn('⚠️ Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.syncStats.status = 'syncing';
    this.syncStats.lastSync = new Date().toISOString();
    
    try {
      logger.info('🔄 Starting Firestore sync...');
      
      // Check database health
      await this.checkDatabaseHealth();
      
      if (!this.isMainDbOnline) {
        logger.warn('⚠️ Main database is offline, skipping sync');
        this.syncStats.status = 'paused';
        this.emitStats();
        return;
      }
      
      if (!this.isBackupDbOnline) {
        logger.error('❌ Backup database is offline, cannot sync');
        this.syncStats.status = 'error';
        this.syncStats.errors++;
        this.emitStats();
        return;
      }
      
      // Discover collections and analyze schemas
      logger.info('📋 Discovering collections for sync...');
      await this.discoverCollections();
      
      let totalSynced = 0;
      const isFirstSync = !this.syncStats.lastFullSync;
      
      logger.info(`📊 Starting to sync ${this.collections.length} collections: ${this.collections.join(', ')}`);
      
      // Sync each collection
      for (const collectionName of this.collections) {
        try {
          logger.info(`🔄 Starting sync for collection: ${collectionName}`);
          const syncedCount = await this.syncCollectionToBackup(collectionName, !isFirstSync);
          totalSynced += syncedCount;
          
          logger.info(`✅ Completed sync for ${collectionName}: ${syncedCount} documents`);
          
          this.io.emit('collectionSynced', {
            collection: collectionName,
            documentCount: syncedCount,
            timestamp: new Date().toISOString(),
            incremental: !isFirstSync
          });
        } catch (error) {
          logger.error(`❌ Failed to sync collection ${collectionName}:`, error);
          this.syncStats.errors++;
        }
      }
      
      // Perform periodic integrity check
      if (this.syncStats.incrementalSyncs % 10 === 0) {
        logger.info('🔍 Performing integrity check...');
        await this.performDataIntegrityCheck();
      }
      
      this.syncStats.totalSynced += totalSynced;
      this.syncStats.incrementalSyncs++;
      this.syncStats.status = 'completed';
      
      if (isFirstSync) {
        this.syncStats.lastFullSync = new Date().toISOString();
      }
      
      logger.info(`🎉 Firestore sync completed! Total synced: ${totalSynced} documents across ${this.collections.length} collections`);
      
    } catch (error) {
      logger.error('❌ Firestore sync failed:', error);
      this.syncStats.status = 'error';
      this.syncStats.errors++;
    } finally {
      this.isSyncing = false;
      this.emitStats();
    }
  }

  // Enhanced recovery process
  async performRecovery() {
    if (this.isSyncing) {
      logger.warn('⚠️ Recovery already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.syncStats.status = 'recovering';
    
    try {
      logger.info('🔄 Starting enhanced recovery process...');
      
      if (!this.isMainDbOnline) {
        logger.warn('⚠️ Main database still offline, cannot recover');
        return;
      }
      
      let totalRecovered = 0;
      
      // Recover each collection incrementally
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
          logger.error(`❌ Failed to recover collection ${collectionName}:`, error);
          this.syncStats.errors++;
        }
      }
      
      // Perform integrity check after recovery
      await this.performDataIntegrityCheck();
      
      this.syncStats.status = 'completed';
      
      logger.info(`🎉 Recovery completed! Recovered ${totalRecovered} documents`);
      
    } catch (error) {
      logger.error('❌ Recovery failed:', error);
      this.syncStats.status = 'error';
      this.syncStats.errors++;
    } finally {
      this.isSyncing = false;
      this.emitStats();
    }
  }

  // Check database health
  async checkDatabaseHealth() {
    this.isMainDbOnline = await checkMainDbHealth();
    this.isBackupDbOnline = await checkBackupDbHealth();
    
    const status = {
      mainDb: this.isMainDbOnline,
      backupDb: this.isBackupDbOnline,
      timestamp: new Date().toISOString()
    };
    
    this.io.emit('healthCheck', status);
    return status;
  }

  // Emit current stats to frontend
  emitStats() {
    this.io.emit('syncStats', this.syncStats);
  }

  // Get current sync statistics
  getStats() {
    return {
      ...this.syncStats,
      collectionsSchema: Object.fromEntries(this.collectionsSchema),
      syncMetadata: Object.fromEntries(this.syncMetadata)
    };
  }

  // Force full sync (ignores incremental logic)
  async forceFullSync() {
    logger.info('🔄 Forcing full sync...');
    this.syncMetadata.clear(); // Clear all sync metadata
    this.syncStats.duplicatesSkipped = 0;
    await this.performFullSync();
  }
}

module.exports = SyncService; 