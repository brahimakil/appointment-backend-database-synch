// Client-side Firebase configuration for seamless switching
const firebaseConfig = {
  main: {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
  },
  backup: {
    apiKey: process.env.VITE_BACKUP_FIREBASE_API_KEY,
    authDomain: process.env.VITE_BACKUP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_BACKUP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_BACKUP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_BACKUP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_BACKUP_FIREBASE_APP_ID,
    measurementId: process.env.VITE_BACKUP_FIREBASE_MEASUREMENT_ID
  }
};

class FirebaseManager {
  constructor() {
    this.currentConfig = 'main';
    this.apps = {};
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  // Initialize Firebase apps
  async initializeApps() {
    try {
      // Initialize main app
      if (!this.apps.main) {
        this.apps.main = firebase.initializeApp(firebaseConfig.main, 'main');
      }
      
      // Initialize backup app
      if (!this.apps.backup) {
        this.apps.backup = firebase.initializeApp(firebaseConfig.backup, 'backup');
      }
      
      console.log('✅ Firebase apps initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase apps:', error);
      throw error;
    }
  }

  // Get current Firebase app
  getCurrentApp() {
    return this.apps[this.currentConfig];
  }

  // Get current auth instance
  getCurrentAuth() {
    return this.getCurrentApp().auth();
  }

  // Get current firestore instance
  getCurrentFirestore() {
    return this.getCurrentApp().firestore();
  }

  // Switch to backup configuration
  async switchToBackup() {
    try {
      console.log('🔄 Switching to backup Firebase...');
      
      // Sign out from current auth
      if (this.getCurrentAuth().currentUser) {
        await this.getCurrentAuth().signOut();
      }
      
      this.currentConfig = 'backup';
      this.retryCount = 0;
      
      console.log('✅ Switched to backup Firebase');
      return true;
    } catch (error) {
      console.error('❌ Failed to switch to backup:', error);
      return false;
    }
  }

  // Switch to main configuration
  async switchToMain() {
    try {
      console.log('🔄 Switching to main Firebase...');
      
      // Sign out from current auth
      if (this.getCurrentAuth().currentUser) {
        await this.getCurrentAuth().signOut();
      }
      
      this.currentConfig = 'main';
      this.retryCount = 0;
      
      console.log('✅ Switched to main Firebase');
      return true;
    } catch (error) {
      console.error('❌ Failed to switch to main:', error);
      return false;
    }
  }

  // Smart authentication with automatic failover
  async smartSignIn(email, password) {
    try {
      console.log(`🔐 Attempting sign in with ${this.currentConfig} Firebase...`);
      
      const auth = this.getCurrentAuth();
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      
      this.retryCount = 0;
      console.log('✅ Sign in successful');
      return userCredential;
    } catch (error) {
      console.error(`❌ Sign in failed with ${this.currentConfig}:`, error);
      
      // If main fails, try backup
      if (this.currentConfig === 'main' && this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log('🔄 Attempting failover to backup...');
        
        await this.switchToBackup();
        return this.smartSignIn(email, password);
      }
      
      throw error;
    }
  }

  // Smart sign up with automatic failover
  async smartSignUp(email, password, userData) {
    try {
      console.log(`🔐 Attempting sign up with ${this.currentConfig} Firebase...`);
      
      const auth = this.getCurrentAuth();
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      
      // Add user data to Firestore
      if (userData) {
        const firestore = this.getCurrentFirestore();
        await firestore.collection('users').doc(userCredential.user.uid).set({
          ...userData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      this.retryCount = 0;
      console.log('✅ Sign up successful');
      return userCredential;
    } catch (error) {
      console.error(`❌ Sign up failed with ${this.currentConfig}:`, error);
      
      // If main fails, try backup
      if (this.currentConfig === 'main' && this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log('🔄 Attempting failover to backup...');
        
        await this.switchToBackup();
        return this.smartSignUp(email, password, userData);
      }
      
      throw error;
    }
  }

  // Monitor authentication state
  onAuthStateChanged(callback) {
    return this.getCurrentAuth().onAuthStateChanged(callback);
  }

  // Get current configuration
  getCurrentConfig() {
    return this.currentConfig;
  }
}

// Export singleton instance
const firebaseManager = new FirebaseManager();
module.exports = firebaseManager;