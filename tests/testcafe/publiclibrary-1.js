import { publicLibraryButtons } from './publiclibrary-util.js';
import { setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

publicLibraryButtons('Blue',               0, 'b4b8f686a618e9e610cd679ac54e51b4', ["player1Seat","player2Seat","player3Seat","player4Seat",
  'Deal_button', 'e36b',
  'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_incrementButton', 'd3ab9f5f-daa4-4d81-8004-50a9c90af88e_decrementButton',
  'reset_button', '#buttonInputGo', 'visibility_button'
]);
publicLibraryButtons('Bhukhar',            0, 'c84a9fed84cb798bd78b10691a454683', [ 'btnMenuSettings', 'btn8Players', 'btn4Packs', 'btnCloseSettings', 'btnSelectPlayer', 'btnDeal', 'btnPile4', 'btnStartGame', 'btnTakeOne', 'btnNextPlayer', 'btnPickUp' ]);
publicLibraryButtons('Dots',               0, 'c849db75ebb632cc33fd6811d2d03c76', [ 'reset', '#buttonInputGo', 'col11', 'col21', 'col12', 'col22', 'row11', 'row31', 'row21', 'row32', 'row12', 'row42', 'row22', 'row23', 'col23' ]);
publicLibraryButtons('Solitaire',          0, 'cfb2f14c494cf36ec2d579b7af2605d0', [ 'reset', 'jemz', 'reset' ]);
publicLibraryButtons('Mancala',            0, '16e1328c79e7ffc517fc67e83668649d', ['btnRule1', 'btnRule2', 'getb5', 'getb5', 'getb5', 'getb5', 'getb1', 'getb1', 'getb1', 'getb1' ]);
