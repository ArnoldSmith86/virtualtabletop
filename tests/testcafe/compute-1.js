import { compute_ops } from '../../client/js/compute.js';
import { setupTestEnvironment } from './test-util.js';
import { computeTest } from './compute-util.js';

setupTestEnvironment();

computeTest(compute_ops, compute_ops.slice(0, 28), 'ops 1-28');
