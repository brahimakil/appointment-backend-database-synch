const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

// Validate required environment variables
const requiredVars = [
  'FIREBASE_TYPE', 'FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY_ID', 
  'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_CLIENT_ID',
  'BACKUP_FIREBASE_TYPE', 'BACKUP_FIREBASE_PROJECT_ID', 'BACKUP_FIREBASE_PRIVATE_KEY_ID',
  'BACKUP_FIREBASE_PRIVATE_KEY', 'BACKUP_FIREBASE_CLIENT_EMAIL', 'BACKUP_FIREBASE_CLIENT_ID'
];

requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    logger.error(`❌ Missing required environment variable: ${varName}`);
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

// Construct service account credentials from environment variables
const mainServiceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
};

const backupServiceAccount = {
  type: process.env.BACKUP_FIREBASE_TYPE,
  project_id: process.env.BACKUP_FIREBASE_PROJECT_ID,
  private_key_id: process.env.BACKUP_FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.BACKUP_FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.BACKUP_FIREBASE_CLIENT_EMAIL,
  client_id: process.env.BACKUP_FIREBASE_CLIENT_ID,
  auth_uri: process.env.BACKUP_FIREBASE_AUTH_URI,
  token_uri: process.env.BACKUP_FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.BACKUP_FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.BACKUP_FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.BACKUP_FIREBASE_UNIVERSE_DOMAIN
};

// Initialize Firebase Admin SDK for main database
const mainApp = admin.initializeApp({
  credential: admin.credential.cert(mainServiceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
}, 'main');

// Initialize Firebase Admin SDK for backup database
const backupApp = admin.initializeApp({
  credential: admin.credential.cert(backupServiceAccount),
  projectId: process.env.BACKUP_FIREBASE_PROJECT_ID
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