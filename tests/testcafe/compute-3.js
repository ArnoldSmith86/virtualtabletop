import { compute_ops } from '../../client/js/compute.js';
import { setupTestEnvironment } from './test-util.js';
import { computeTest, computeShard } from './compute-util.js';

setupTestEnvironment();

computeTest(compute_ops, computeShard(compute_ops, 2, 4), 'ops shard 3/4');
