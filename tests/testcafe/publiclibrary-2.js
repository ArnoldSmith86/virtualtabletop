import { publicLibraryButtons } from './publiclibrary-util.js';
import { setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

publicLibraryButtons('Reversi',            0, 'd0ac9ad1e86754f5e463114e6a7f4f1f',
       [
         { from: 'zpiece15', to: 'sq23', sticks: true  },
         { from: 'zpiece78', to: 'sq22', sticks: true  },
         { from: 'zpiece40', to: 'sq32', sticks: true  },
         { from: 'zpiece72', to: 'sq12', sticks: false }, // not a legal move: the piece bounces back into the holder
         { from: 'zpiece72', to: 'sq24', sticks: true  },
         { from: 'zpiece19', to: 'sq35', sticks: true  },
         { from: 'zpiece08', to: 'sq53', sticks: true  }
       ]);
publicLibraryButtons('Reward',             0, 'c2a3f0ef3f758336fe99520d854b31ec', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', 'seat1', 'next'
]);
publicLibraryButtons('Rummy Tiles',        0, '71da9edbd15fccc7fbe79171cf46a67e', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, '8a26d7f78008dc91cee8108426d517f3', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Functions - CALL',   0, 'df9fb7ba5ddc12584c310812c63913ee', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
