import { sessionChangeMessages } from '../../client/js/overlays/players.js';

const sessions = (...pairs)=>new Map(pairs);

describe('announcements for a changed session list', function() {
  test('a new name is a join and a vanished name is a leave', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ]), sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), 1)).toEqual([ 'Bob joined' ]);
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), sessions([ 1, 'Alice' ]), 1)).toEqual([ 'Bob left' ]);
  });

  test('a session under a new name is a rename, except on the tab that did it', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), sessions([ 1, 'Alice' ], [ 2, 'Bobby' ]), 1)).toEqual([ 'Bob renamed to Bobby' ]);
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), sessions([ 1, 'Alice' ], [ 2, 'Bobby' ]), 2)).toEqual([]);
  });

  test('reconnecting under a new session ID is neither a join nor a leave', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), sessions([ 3, 'Alice' ], [ 2, 'Bob' ]), 3)).toEqual([]);
  });

  test('opening and closing a second tab of the same player stays silent', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ]), sessions([ 1, 'Alice' ], [ 2, 'Alice' ]), 1)).toEqual([]);
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Alice' ]), sessions([ 1, 'Alice' ]), 1)).toEqual([]);
  });

  test('the last session of a player leaving is still announced', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ], [ 3, 'Bob' ]), sessions([ 1, 'Alice' ]), 1)).toEqual([ 'Bob left' ]);
  });

  test('several changes are reported together', function() {
    expect(sessionChangeMessages(sessions([ 1, 'Alice' ], [ 2, 'Bob' ]), sessions([ 1, 'Alicia' ], [ 3, 'Carol' ]), 9)).toEqual([ 'Bob left', 'Alice renamed to Alicia', 'Carol joined' ]);
  });
});
