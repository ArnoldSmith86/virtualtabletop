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
publicLibraryButtons('Reward',             0, '0b160a9e58f64dd3831ccee154104807', [
  'gmex', 'kprc', 'oksq', 'j1wz', 'vfhn', 'seat1', 'next'
]);
publicLibraryButtons('Rummy Tiles',        0, 'd625137b18bf8632de6e90093ef2cb81', [ 'startMix', 'draw14' ]);
publicLibraryButtons('Undercover',         1, 'd9c79f55029c49f66cfddb4096b673c5', [ 'Reset', 'Spy Master Button' ]);
publicLibraryButtons('Functions - CALL',   0, 'de1583f7433c27bb59e2b20ffdc2806e', [
  'n4cw_8_C', '5a52', '5a52', '66kr', 'qeg1', 'n4cwB', '8r6p', 'qeg1', 'qeg1', 'n5eu'
]);
