import { room } from './serverstate.js';
import { getPlayerName, getPlayerColor } from './overlays/players.js';
import { toHex } from './color.js';

function initUser() {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  if (token && username) {
    toServer('verifyToken', { username, token });
  }

  const meButton = document.getElementById('meButton');
  const meOverlay = document.getElementById('meOverlay');
  const meLoginButton = document.getElementById('meLoginButton');
  const meUsername = document.getElementById('meUsername');
  const mePassword = document.getElementById('mePassword');

  mePassword.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      meLoginButton.click();
    }
  });

  const mePlayerEntry = document.getElementById('mePlayerEntry');
  const playerNameInput = mePlayerEntry.querySelector('.playerName');
  const playerColorInput = mePlayerEntry.querySelector('.teamColor');

  playerNameInput.value = getPlayerName();

  playerColorInput.value = toHex(getPlayerColor());

  playerNameInput.addEventListener('change', (e) => {
    const newName = e.target.value;
    const oldName = getPlayerName();
    toServer('rename', { oldName: oldName, newName: newName });

    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
      userData.playerName = newName;
      localStorage.setItem('userData', JSON.stringify(userData));
      toServer('updateUserData', { username: newName, userData: { playerName: newName } });
    }
  });

  playerColorInput.addEventListener('change', (e) => {
    const newColor = toHex(e.target.value);
    const playerName = getPlayerName();
    toServer('playerColor', { player: playerName, color: newColor });

    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
      userData.playerColor = newColor;
      localStorage.setItem('userData', JSON.stringify(userData));
      toServer('updateUserData', { username: playerName, userData: { playerColor: newColor } });
    }
  });

  function updateLoggedInUI(userData) {    
    playerNameInput.value = userData.playerName;
    playerColorInput.value = userData.playerColor;

    document.getElementById('meLogin').style.display = 'none';
    document.getElementById('meLoginButton').style.display = 'none';
    document.getElementById('meLogoutButton').style.display = 'block';
    document.getElementById('meSection').style.display = 'block';
  }

  meButton.addEventListener('click', () => {
    if (config.authenticateUsers) {
      const userData = JSON.parse(localStorage.getItem('userData'));
      if (userData) {
        updateLoggedInUI(userData);
      } else {
        meOverlay.style.display = 'flex
        meUsername.value = getPlayerName();
        playerColorInput.value = toHex(getPlayerColor());
        document.getElementById('meSection').style.display = 'block';
        document.getElementById('meLogin').style.display = 'block';
        document.getElementById('meLoginButton').style.display = 'block';
        document.getElementById('meLogoutButton').style.display = 'none';
      }
    }
  });

  meLoginButton.addEventListener('click', () => {
    const username = meUsername.value;
    const password = mePassword.value;

    toServer('login', { username, password });
  });

  onMessage('loginResponse', (response) => {
    if (response.success) {
      if (response.userData) {
        localStorage.setItem('userData', JSON.stringify(response.userData));
        updateLoggedInUI(response.userData);
        const oldPlayerName = getPlayerName();
        localStorage.setItem('playerName', response.userData.playerName);
        localStorage.setItem('playerColor', response.userData.playerColor);
        toServer('rename', { oldName: oldPlayerName, newName: response.userData.playerName });
        toServer('playerColor', { player: response.userData.playerName, color: response.userData.playerColor });
      }
      if (response.token) {
        localStorage.setItem('token', response.token);
        localStorage.setItem('username', meUsername.value);
      }
    } else {
      if (response.error === 'User not found') {
        if (confirm('User not found. Would you like to create a new user?')) {
          const username = meUsername.value;
          const password = mePassword.value;
          toServer('createUser', { username, password });
        }
      } else {
        alert(response.error);
      }
    }
  });

  onMessage('meta', (data) => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
      const myPlayer = data.meta.players[getPlayerName()];
      if (myPlayer) {
        userData.playerColor = myPlayer;
        localStorage.setItem('userData', JSON.stringify(userData));
        updateLoggedInUI(userData);
      }
    }
  });

  onMessage('createUserResponse', (response) => {
    if (response.success) {
      meOverlay.style.display = 'none';
    } else {
      alert(response.error);
    }
  });

  onMessage('verifyTokenResponse', (response) => {
    if (response.success) {
      localStorage.setItem('userData', JSON.stringify(response.userData));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('userData');
    }
  });

  document.getElementById('meLogoutButton').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
  });
}

window.addEventListener('load', initUser);


window.addEventListener('storage', (event) => {
  if (event.key === 'userData') {
    const username = localStorage.getItem('username');
    const newUserData = JSON.parse(event.newValue);
    const oldUserData = JSON.parse(event.oldValue);
    const diff = {};
    for (const key in newUserData) {
      if (newUserData[key] !== oldUserData[key]) {
        diff[key] = newUserData[key];
      }
    }
    toServer('updateUserData', { username, userData: diff });
  }
});