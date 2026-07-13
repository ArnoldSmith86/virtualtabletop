import { Selector } from 'testcafe';

import { publicLibraryButtons } from './publiclibrary-util.js';
import { setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

publicLibraryButtons('Reversi',            0, '35e0017570f9ecd206a2317c1528be36',
       [
         [ ()=>Selector("#w_zpiece15"), ()=>Selector("#w_sq23") ],
         [ ()=>Selector("#w_zpiece78"), ()=>Selector("#w_sq22") ],
         [ ()=>Selector("#w_zpiece40"), ()=>Selector("#w_sq32") ],
         [ ()=>Selector("#w_zpiece72"), ()=>Selector("#w_sq12") ],
         [ ()=>Selector("#w_zpiece72"), ()=>Selector("#w_sq24") ],
         [ ()=>Selector("#w_zpiece19"), ()=>Selector("#w_sq35") ],
         [ ()=>Selector("#w_zpiece08"), ()=>Selector("#w_sq53") ]
       ]);
publicLibraryButtons('Reward',             0, '5290d9113f42a3c0e458a788b5a1ea99', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', 'seat1', 'next'
]);
publicLibraryButtons('Rummy Tiles',        0, '2625ca4661785ca9a75cdf93d6379427', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, 'dccab2340f9bff4b4126141abc742aca', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Functions - CALL',   0, 'bb8636a3e2b6724d4f729bff546f354d', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
