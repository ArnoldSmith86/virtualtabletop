import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Config from './config.mjs';

class User {
  constructor(username) {
    this.username = username;
    this.userDir = path.join(Config.directory('library'), 'users', this.username);
    this.userFile = path.join(this.userDir, '0.json');
  }

  exists() {
    return fs.existsSync(this.userFile);
  }

  create(password, playerColor) {
    if (this.exists()) {
      return { success: false, error: 'User already exists' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

    const userData = {
      hash,
      salt,
      roles: [],
      userData: {
        playerName: this.username,
        playerColor: playerColor || '#ff0000'
      },
      token: null,
      tokenExpiry: null
    };

    fs.mkdirSync(this.userDir, { recursive: true });
    fs.writeFileSync(this.userFile, JSON.stringify(userData));

    return { success: true };
  }

  authenticate(password) {
    if (!this.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = JSON.parse(fs.readFileSync(this.userFile));
    const hash = crypto.pbkdf2Sync(password, userData.salt, 1000, 64, 'sha512').toString('hex');

    if (hash === userData.hash) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      userData.token = token;
      userData.tokenExpiry = tokenExpiry;
      fs.writeFileSync(this.userFile, JSON.stringify(userData));
      return { success: true, token: token, userData: userData.userData };
    } else {
      return { success: false, error: 'Incorrect password' };
    }
  }

  getData() {
    if (!this.exists()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(this.userFile));
  }

  updateData(newUserData) {
    if (!this.exists()) {
      return;
    }
    const data = this.getData();
    data.userData = Object.assign(data.userData || {}, newUserData);
    fs.writeFileSync(this.userFile, JSON.stringify(data));
  }

  verifyToken(token) {
    if (!this.exists()) {
      return { success: false, error: 'User not found' };
    }

    const userData = this.getData();
    if (userData.token === token && userData.tokenExpiry > Date.now()) {
      return { success: true, userData: userData.userData };
    } else {
      return { success: false, error: 'Invalid or expired token' };
    }
  }
}

export default User;