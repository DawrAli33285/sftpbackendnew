const Client = require('ssh2-sftp-client');
const path = require('path');
const fs = require('fs');

// SFTP Configuration
const getSftpConfig = () => {
  const config = {
    host: process.env.SFTP_HOST || 'your-sftp-server.com',
    port: parseInt(process.env.SFTP_PORT) || 22,
    username: process.env.SFTP_USERNAME || 'your-username',
    readyTimeout: 20000, // 20 seconds timeout
    retries: 2,
  };

  // Use SSH key if provided, otherwise use password
  if (process.env.SFTP_PRIVATE_KEY_PATH) {
    try {
      config.privateKey = fs.readFileSync(process.env.SFTP_PRIVATE_KEY_PATH);
      if (process.env.SFTP_PASSPHRASE) {
        config.passphrase = process.env.SFTP_PASSPHRASE;
      }
      console.log('Using SSH key authentication');
    } catch (error) {
      console.error('Error reading private key:', error.message);
      throw new Error('Failed to read SSH private key');
    }
  } else if (process.env.SFTP_PASSWORD) {
    config.password = process.env.SFTP_PASSWORD;
    console.log('Using password authentication');
  } else {
    throw new Error('No authentication method provided (password or private key)');
  }

  return config;
};

// Base remote directory where files will be stored
const REMOTE_BASE_DIR = process.env.SFTP_REMOTE_DIR || '/uploads';

// Base URL for accessing files (your SFTP server's public URL)
const SFTP_BASE_URL = process.env.SFTP_BASE_URL || 'https://your-sftp-server.com/uploads';

/**
 * Upload a file to SFTP server
 * @param {string} localFilePath - Path to the local file
 * @param {string} originalName - Original filename
 * @returns {Promise<object>} - Object containing file URL and metadata
 */
module.exports.sftpUpload = async (localFilePath, originalName) => {
  const sftp = new Client();
  
  try {
    // Connect to SFTP server
    const config = getSftpConfig();
    await sftp.connect(config);
    console.log('Connected to SFTP server');

    // Generate unique filename to prevent conflicts
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(originalName);
    const basename = path.basename(originalName, ext);
    // Sanitize filename - remove special characters
    const sanitizedBasename = basename.replace(/[^a-zA-Z0-9-_]/g, '_');
    const uniqueFilename = `${timestamp}-${randomString}-${sanitizedBasename}${ext}`;

    // Create year/month directory structure for better organization
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const remoteDir = `${REMOTE_BASE_DIR}/${year}/${month}`;
    const remotePath = `${remoteDir}/${uniqueFilename}`;

    // Ensure remote directory exists
    await sftp.mkdir(remoteDir, true); // recursive: true

    // Upload the file
    await sftp.put(localFilePath, remotePath);
    console.log(`File uploaded successfully to: ${remotePath}`);

    // Get file stats for metadata
    const stats = fs.statSync(localFilePath);

    // Close connection
    await sftp.end();

    // Return file information
    return {
      url: `${SFTP_BASE_URL}/${year}/${month}/${uniqueFilename}`,
      remotePath: remotePath,
      filename: uniqueFilename,
      originalName: originalName,
      size: stats.size,
      uploadedAt: new Date()
    };

  } catch (error) {
    console.error('SFTP upload error:', error);
    
    // Ensure connection is closed even on error
    try {
      await sftp.end();
    } catch (endError) {
      console.error('Error closing SFTP connection:', endError);
    }
    
    throw new Error(`SFTP upload failed: ${error.message}`);
  }
};

/**
 * Download a file from SFTP server
 * @param {string} remotePath - Remote file path on SFTP server
 * @param {string} localPath - Local destination path
 * @returns {Promise<boolean>} - Success status
 */
module.exports.sftpDownload = async (remotePath, localPath) => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    console.log('Connected to SFTP server for download');

    await sftp.get(remotePath, localPath);
    console.log(`File downloaded successfully to: ${localPath}`);

    await sftp.end();
    return true;

  } catch (error) {
    console.error('SFTP download error:', error);
    
    try {
      await sftp.end();
    } catch (endError) {
      console.error('Error closing SFTP connection:', endError);
    }
    
    throw new Error(`SFTP download failed: ${error.message}`);
  }
};

/**
 * Delete a file from SFTP server
 * @param {string} remotePath - Remote file path on SFTP server
 * @returns {Promise<boolean>} - Success status
 */
module.exports.sftpDelete = async (remotePath) => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    console.log('Connected to SFTP server for deletion');

    await sftp.delete(remotePath);
    console.log(`File deleted successfully: ${remotePath}`);

    await sftp.end();
    return true;

  } catch (error) {
    console.error('SFTP delete error:', error);
    
    try {
      await sftp.end();
    } catch (endError) {
      console.error('Error closing SFTP connection:', endError);
    }
    
    throw new Error(`SFTP delete failed: ${error.message}`);
  }
};

/**
 * List files in a directory on SFTP server
 * @param {string} remotePath - Remote directory path
 * @returns {Promise<array>} - Array of file objects
 */
module.exports.sftpListFiles = async (remotePath = REMOTE_BASE_DIR) => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    console.log('Connected to SFTP server for listing');

    const files = await sftp.list(remotePath);
    
    await sftp.end();
    return files;

  } catch (error) {
    console.error('SFTP list error:', error);
    
    try {
      await sftp.end();
    } catch (endError) {
      console.error('Error closing SFTP connection:', endError);
    }
    
    throw new Error(`SFTP list failed: ${error.message}`);
  }
};

/**
 * Check if SFTP connection is working
 * @returns {Promise<boolean>} - Connection status
 */
module.exports.testSftpConnection = async () => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    console.log('✓ SFTP connection test successful');
    console.log(`  Host: ${config.host}:${config.port}`);
    console.log(`  Username: ${config.username}`);
    console.log(`  Auth method: ${config.privateKey ? 'SSH Key' : 'Password'}`);
    await sftp.end();
    return true;
  } catch (error) {
    console.error('✗ SFTP connection test failed:', error.message);
    try {
      await sftp.end();
    } catch (endError) {
      // Ignore
    }
    return false;
  }
};

/**
 * Check if a file exists on SFTP server
 * @param {string} remotePath - Remote file path
 * @returns {Promise<boolean>} - Exists status
 */
module.exports.sftpFileExists = async (remotePath) => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    
    const exists = await sftp.exists(remotePath);
    
    await sftp.end();
    return exists !== false;

  } catch (error) {
    console.error('SFTP exists check error:', error);
    
    try {
      await sftp.end();
    } catch (endError) {
      // Ignore
    }
    
    return false;
  }
};

/**
 * Get file stats from SFTP server
 * @param {string} remotePath - Remote file path
 * @returns {Promise<object>} - File stats object
 */
module.exports.sftpFileStats = async (remotePath) => {
  const sftp = new Client();
  
  try {
    const config = getSftpConfig();
    await sftp.connect(config);
    
    const stats = await sftp.stat(remotePath);
    
    await sftp.end();
    return stats;

  } catch (error) {
    console.error('SFTP stats error:', error);
    
    try {
      await sftp.end();
    } catch (endError) {
      // Ignore
    }
    
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
};