const admin = require('firebase-admin');
const { logger } = require('../utils/logger');
const path = require('path');

// Initialize Firebase Admin SDK for main database
const mainServiceAccount = require(path.join(__dirname, '../../main-service-account.json'));
const mainApp = admin.initializeApp({
  credential: admin.credential.cert(mainServiceAccount),
  projectId: 'ai-client-system'
}, 'main');

// Initialize Firebase Admin SDK for backup database
const backupServiceAccount = require(path.join(__dirname, '../../backup-service-account.json'));
const backupApp = admin.initializeApp({
  credential: admin.credential.cert(backupServiceAccount),
  projectId: 'ai-client-system-backup'
}, 'backup');

const mainDb = admin.firestore(mainApp);
const backupDb = admin.firestore(backupApp);

// Test database connections
const testConnections = async () => {
  try {
    await mainDb.collection('users').limit(1).get();
    logger.info('✅ Main database connection successful');
    
    await backupDb.collection('users').limit(1).get();
    logger.info('✅ Backup database connection successful');
    
    await mainApp.auth().listUsers(1);
    logger.info('✅ Main Firebase Auth connection successful');
    
    await backupApp.auth().listUsers(1);
    logger.info('✅ Backup Firebase Auth connection successful');
    
    return { mainDb: true, backupDb: true, mainAuth: true, backupAuth: true };
  } catch (error) {
    logger.error('❌ Database/Auth connection test failed:', error);
    return { mainDb: false, backupDb: false, mainAuth: false, backupAuth: false };
  }
};

// Check if main database is available
const checkMainDbHealth = async () => {
  try {
    logger.info('🔍 Checking main database health...');
    const snapshot = await mainDb.collection('users').limit(1).get();
    logger.info('✅ Main database health check passed');
    return true;
  } catch (error) {
    logger.error('❌ Main database health check failed:', error.message);
    return false;
  }
};

// Check if backup database is available
const checkBackupDbHealth = async () => {
  try {
    logger.info('🔍 Checking backup database health...');
    const snapshot = await backupDb.collection('users').limit(1).get();
    logger.info('✅ Backup database health check passed');
    return true;
  } catch (error) {
    logger.error('❌ Backup database health check failed:', error.message);
    return false;
  }
};

// Check if main auth is available
const checkMainAuthHealth = async () => {
  try {
    logger.info('🔍 Checking main auth health...');
    await mainApp.auth().listUsers(1);
    logger.info('✅ Main auth health check passed');
    return true;
  } catch (error) {
    logger.error('❌ Main auth health check failed:', error.message);
    return false;
  }
};

// Check if backup auth is available
const checkBackupAuthHealth = async () => {
  try {
    logger.info('🔍 Checking backup auth health...');
    await backupApp.auth().listUsers(1);
    logger.info('✅ Backup auth health check passed');
    return true;
  } catch (error) {
    logger.error('❌ Backup auth health check failed:', error.message);
    return false;
  }
};

module.exports = {
  mainApp,
  backupApp,
  mainDb,
  backupDb,
  testConnections,
  checkMainDbHealth,
  checkBackupDbHealth,
  checkMainAuthHealth,
  checkBackupAuthHealth
}; 