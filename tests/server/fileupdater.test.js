import FileUpdater from '../../server/fileupdater.mjs';

function move(overrides) {
  return { func: 'MOVE', from: 'a', to: 'b', ...overrides };
}

function stateWithClickRoutine(version, clickRoutine) {
  return {
    _meta: { version },
    w1: { type: 'widget', clickRoutine }
  };
}

describe("Scenarios: FileUpdater migrating MOVE's fillTo parameter", () => {
  describe("Given a v21 save with a literal fillTo: 0", () => {
    test("Then fillTo is rewritten to null so it falls back to count like before", () => {
      const state = stateWithClickRoutine(21, [ move({ count: 3, fillTo: 0 }) ]);
      FileUpdater(state);
      expect(state._meta.version).toBe(22);
      expect(state.w1.clickRoutine).toEqual([ move({ count: 3, fillTo: null }) ]);
    });
  });

  describe("Given a v21 save with a literal fillTo: 3", () => {
    test("Then fillTo is left unchanged", () => {
      const state = stateWithClickRoutine(21, [ move({ count: 1, fillTo: 3 }) ]);
      FileUpdater(state);
      expect(state.w1.clickRoutine).toEqual([ move({ count: 1, fillTo: 3 }) ]);
    });
  });

  describe("Given a v21 save with a dynamic fillTo", () => {
    test("Then the MOVE is wrapped in an IF that falls back to fillTo: null when it resolves falsy", () => {
      const state = stateWithClickRoutine(21, [ move({ count: 1, fillTo: '${f}' }) ]);
      FileUpdater(state);
      expect(state.w1.clickRoutine).toEqual([ {
        note: expect.stringContaining('fillTo=0 changed'),
        func: 'IF',
        condition: '${f}',
        thenRoutine: [ move({ count: 1, fillTo: '${f}' }) ],
        elseRoutine: [ move({ count: 1, fillTo: null }) ]
      } ]);
    });
  });

  describe("Given a v15 save combining a dynamic count with fillTo: 0", () => {
    test("Then v16's IF wrapper branches also get fillTo:0 rewritten to null", () => {
      const state = stateWithClickRoutine(15, [ move({ count: '${n}', fillTo: 0 }) ]);
      FileUpdater(state);
      expect(state._meta.version).toBe(22);
      expect(state.w1.clickRoutine).toEqual([ {
        note: expect.stringContaining('count=0 changed'),
        func: 'IF',
        condition: '${n}',
        thenRoutine: [ move({ count: '${n}', fillTo: null }) ],
        elseRoutine: [ move({ count: 'all', fillTo: null }) ]
      } ]);
    });
  });

  describe("Given a v15 save combining a dynamic count with a dynamic fillTo", () => {
    test("Then both branches of v16's IF are further wrapped exactly once each", () => {
      const state = stateWithClickRoutine(15, [ move({ count: '${n}', fillTo: '${f}' }) ]);
      FileUpdater(state);

      const countIf = state.w1.clickRoutine[0];
      expect(countIf.func).toBe('IF');
      expect(countIf.condition).toBe('${n}');

      const thenFillToIf = countIf.thenRoutine[0];
      expect(thenFillToIf.func).toBe('IF');
      expect(thenFillToIf.condition).toBe('${f}');
      expect(thenFillToIf.thenRoutine).toEqual([ move({ count: '${n}', fillTo: '${f}' }) ]);
      expect(thenFillToIf.elseRoutine).toEqual([ move({ count: '${n}', fillTo: null }) ]);

      const elseFillToIf = countIf.elseRoutine[0];
      expect(elseFillToIf.func).toBe('IF');
      expect(elseFillToIf.condition).toBe('${f}');
      expect(elseFillToIf.thenRoutine).toEqual([ move({ count: 'all', fillTo: '${f}' }) ]);
      expect(elseFillToIf.elseRoutine).toEqual([ move({ count: 'all', fillTo: null }) ]);
    });
  });

  describe("Given a pre-existing user-authored IF wrapping a MOVE with a dynamic count and fillTo", () => {
    test("Then the user's IF is not touched by the note-based recursion and its branches are migrated exactly once", () => {
      const userIf = {
        func: 'IF',
        condition: 'x',
        thenRoutine: [ move({ count: '${n}', fillTo: '${f}' }) ],
        elseRoutine: []
      };
      const state = stateWithClickRoutine(15, [ userIf ]);
      FileUpdater(state);

      const outerIf = state.w1.clickRoutine[0];
      expect(outerIf.func).toBe('IF');
      expect(outerIf.condition).toBe('x');
      expect(outerIf.note).toBeUndefined();

      const countIf = outerIf.thenRoutine[0];
      expect(countIf.func).toBe('IF');
      expect(countIf.note).toEqual(expect.stringContaining('count=0 changed'));

      const fillToIf = countIf.thenRoutine[0];
      expect(fillToIf.func).toBe('IF');
      expect(fillToIf.note).toEqual(expect.stringContaining('fillTo=0 changed'));
      expect(fillToIf.thenRoutine).toEqual([ move({ count: '${n}', fillTo: '${f}' }) ]);
      expect(fillToIf.elseRoutine).toEqual([ move({ count: '${n}', fillTo: null }) ]);
    });
  });
});
