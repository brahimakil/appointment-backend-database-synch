const admin = require('firebase-admin');
const { logger } = require('../utils/logger');
const path = require('path');

// Enhanced error logging function
const logDetailedError = (error, context) => {
  logger.error(`❌ Firebase Connection Error in ${context}:`, {
    message: error.message,
    code: error.code,
    stack: error.stack,
    details: error.details || 'No additional details',
  });
};

// Validate and parse service account credentials with more robust error handling
const parseServiceAccount = (prefix) => {
  try {
    const serviceAccount = {
      type: process.env[`${prefix}TYPE`],
      project_id: process.env[`${prefix}PROJECT_ID`],
      private_key_id: process.env[`${prefix}PRIVATE_KEY_ID`],
      private_key: process.env[`${prefix}PRIVATE_KEY`]
        ? process.env[`${prefix}PRIVATE_KEY`].replace(/\\n/g, '\n')
        : undefined,
      client_email: process.env[`${prefix}CLIENT_EMAIL`],
      client_id: process.env[`${prefix}CLIENT_ID`],
      auth_uri: process.env[`${prefix}AUTH_URI`],
      token_uri: process.env[`${prefix}TOKEN_URI`],
      auth_provider_x509_cert_url: process.env[`${prefix}AUTH_PROVIDER_CERT_URL`],
      client_x509_cert_url: process.env[`${prefix}CLIENT_CERT_URL`],
      universe_domain: process.env[`${prefix}UNIVERSE_DOMAIN`]
    };

    // Validate required fields
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email', 'client_id'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    return serviceAccount;
  } catch (error) {
    logger.error(`❌ Failed to parse service account credentials for ${prefix}:`, error);
    throw error;
  }
};

// Attempt to parse service accounts
let mainServiceAccount, backupServiceAccount;
try {
  mainServiceAccount = parseServiceAccount('FIREBASE_');
  backupServiceAccount = parseServiceAccount('BACKUP_FIREBASE_');
} catch (error) {
  logger.error('❌ Failed to parse service account credentials:', error);
  // Log all environment variables for debugging
  logger.error('Environment Variables:', {
    FIREBASE_TYPE: process.env.FIREBASE_TYPE,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_CLIENT_ID: process.env.FIREBASE_CLIENT_ID,
    // Add other variables as needed
  });
  throw error;
}

// Initialize Firebase Admin SDK for main database
const mainApp = admin.initializeApp({
  credential: admin.credential.cert(mainServiceAccount),
  projectId: mainServiceAccount.project_id
}, 'main');

// Initialize Firebase Admin SDK for backup database
const backupApp = admin.initializeApp({
  credential: admin.credential.cert(backupServiceAccount),
  projectId: backupServiceAccount.project_id
}, 'backup');

const mainDb = admin.firestore(mainApp);
const backupDb = admin.firestore(backupApp);

// Enhanced test connections with more detailed error logging
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
    logDetailedError(error, 'testConnections');
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
    logDetailedError(error, 'checkMainDbHealth');
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
    logDetailedError(error, 'checkBackupDbHealth');
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
    logDetailedError(error, 'checkMainAuthHealth');
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
    logDetailedError(error, 'checkBackupAuthHealth');
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