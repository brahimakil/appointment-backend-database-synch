const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

// Enhanced error logging function
const logDetailedError = (error, context) => {
  logger.error(`❌ Firebase Connection Error in ${context}:`, {
    message: error.message,
    code: error.code,
    stack: error.stack,
    details: error.details || 'No additional details',
  });
};

// More robust private key parsing
const parsePrivateKey = (privateKeyEnv) => {
  if (!privateKeyEnv) {
    throw new Error('Private key environment variable is not set');
  }

  try {
    // Handle different formats of private key
    let privateKey = privateKeyEnv;
    
    // Remove surrounding quotes if present
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    
    // Replace escaped newlines with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Ensure proper formatting
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
        !privateKey.includes('-----END PRIVATE KEY-----')) {
      throw new Error('Private key format is invalid - missing BEGIN/END markers');
    }
    
    // Log private key structure for debugging (without exposing actual key)
    logger.info('🔑 Private key validation:', {
      hasBeginMarker: privateKey.includes('-----BEGIN PRIVATE KEY-----'),
      hasEndMarker: privateKey.includes('-----END PRIVATE KEY-----'),
      length: privateKey.length,
      lineCount: privateKey.split('\n').length
    });
    
    return privateKey;
  } catch (error) {
    logger.error('❌ Failed to parse private key:', error);
    throw error;
  }
};

// Validate and parse service account credentials with more robust error handling
const parseServiceAccount = (prefix) => {
  try {
    logger.info(`🔍 Parsing service account for ${prefix}...`);
    
    const serviceAccount = {
      type: process.env[`${prefix}TYPE`],
      project_id: process.env[`${prefix}PROJECT_ID`],
      private_key_id: process.env[`${prefix}PRIVATE_KEY_ID`],
      private_key: parsePrivateKey(process.env[`${prefix}PRIVATE_KEY`]),
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

    // Log successful parsing (without sensitive data)
    logger.info(`✅ Service account parsed successfully for ${prefix}`, {
      project_id: serviceAccount.project_id,
      client_email: serviceAccount.client_email,
      private_key_id: serviceAccount.private_key_id
    });

    return serviceAccount;
  } catch (error) {
    logger.error(`❌ Failed to parse service account credentials for ${prefix}:`, error);
    
    // Log environment variable status for debugging
    logger.error('Environment Variables Status:', {
      [`${prefix}TYPE`]: process.env[`${prefix}TYPE`] ? 'SET' : 'NOT SET',
      [`${prefix}PROJECT_ID`]: process.env[`${prefix}PROJECT_ID`] ? 'SET' : 'NOT SET',
      [`${prefix}PRIVATE_KEY_ID`]: process.env[`${prefix}PRIVATE_KEY_ID`] ? 'SET' : 'NOT SET',
      [`${prefix}PRIVATE_KEY`]: process.env[`${prefix}PRIVATE_KEY`] ? 'SET' : 'NOT SET',
      [`${prefix}CLIENT_EMAIL`]: process.env[`${prefix}CLIENT_EMAIL`] ? 'SET' : 'NOT SET',
      [`${prefix}CLIENT_ID`]: process.env[`${prefix}CLIENT_ID`] ? 'SET' : 'NOT SET',
    });
    
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
  process.exit(1); // Exit if credentials are invalid
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