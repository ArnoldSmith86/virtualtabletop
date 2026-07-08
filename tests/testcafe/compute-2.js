import { compute_ops } from '../../client/js/compute.js';
import { setupTestEnvironment } from './test-util.js';
import { computeTest } from './compute-util.js';

setupTestEnvironment();

computeTest(compute_ops.slice(28, 56), 'ops 29-56');
