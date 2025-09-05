const compute_ops = [
  {
    name: 'numericSort',
    desc: 'sorts the number elements in array x numerically, and returns the resulting array',
    sample: 'var a = ${x} numericSort',
    call: function(v, x) { return v = x.sort((a, b) => a - b)},
    hash: '1a6e301d6510998fa27abeb75bcf0371'
  }
];

export { compute_ops };
