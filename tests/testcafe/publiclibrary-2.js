import { publicLibraryButtons } from './publiclibrary-util.js';
import { setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

publicLibraryButtons('Reversi',            0, '35e0017570f9ecd206a2317c1528be36',
       [
         { from: 'zpiece15', to: 'sq23', sticks: true  },
         { from: 'zpiece78', to: 'sq22', sticks: true  },
         { from: 'zpiece40', to: 'sq32', sticks: true  },
         { from: 'zpiece72', to: 'sq12', sticks: false }, // not a legal move: the piece bounces back into the holder
         { from: 'zpiece72', to: 'sq24', sticks: true  },
         { from: 'zpiece19', to: 'sq35', sticks: true  },
         { from: 'zpiece08', to: 'sq53', sticks: true  }
       ]);
publicLibraryButtons('Reward',             0, '5acf6ceee560f871fac038af6d1196d1', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', 'seat1', 'next'
]);
publicLibraryButtons('Rummy Tiles',        0, '2625ca4661785ca9a75cdf93d6379427', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, 'dccab2340f9bff4b4126141abc742aca', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Functions - CALL',   0, 'bb8636a3e2b6724d4f729bff546f354d', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
