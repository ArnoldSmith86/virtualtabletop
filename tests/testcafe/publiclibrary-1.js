import { publicLibraryButtons } from './publiclibrary-util.js';
import { setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

publicLibraryButtons('Blue',               0, 'baa6af876f53f1df1741147b38f425c0', ["player1Seat","player2Seat","player3Seat","player4Seat",
  'Deal_button', 'e36b',
  'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton',
  'reset_button', '#buttonInputGo', 'visibility_button'
]);
publicLibraryButtons('Bhukhar',            0, 'd5135c124c9dfeb68fe3881e825d1e6d', [ 'btnMenuSettings', 'btn8Players', 'btn4Packs', 'btnCloseSettings', 'btnSelectPlayer', 'btnDeal', 'btnPile4', 'btnStartGame', 'btnTakeOne', 'btnNextPlayer', 'btnPickUp' ]);
publicLibraryButtons('Dots',               0, '23894df38f786cb014fa1cd79f2345db', [ 'reset', '#buttonInputGo', 'col11', 'col21', 'col12', 'col22', 'row11', 'row31', 'row21', 'row32', 'row12', 'row42', 'row22', 'row23', 'col23' ]);
publicLibraryButtons('Solitaire',          0, 'e83b2d21474496df86cd3dd2540efe58', [ 'reset', 'jemz', 'reset' ]);
publicLibraryButtons('Mancala',            0, '92108a0e76fd295fee9881b6c7f8928b', ['btnRule1', 'btnRule2', 'getb5', 'getb5', 'getb5', 'getb5', 'getb1', 'getb1', 'getb1', 'getb1' ]);
