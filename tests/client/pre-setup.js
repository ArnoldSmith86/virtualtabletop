// players.js reads the player name from localStorage when it is first
// imported. Priming it before any module loads makes the client modules and
// the identifiers the test harnesses expose agree on who the interacting
// player is.
localStorage.setItem('playerName', 'jestPlayer');
