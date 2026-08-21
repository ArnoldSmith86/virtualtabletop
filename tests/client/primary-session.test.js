import { isPrimarySession, primarySessionOf } from '../../client/js/overlays/players.js';

// the server numbers sessions in connection order, so the lowest id is the connection that has been
// in the room longest - the one every client agrees does the work only one of them may do
describe('primarySessionOf', () => {
  test('picks the session that connected first', () => {
    expect(primarySessionOf([ { sessionID: 7, player: 'Bob' }, { sessionID: 3, player: 'Alice' } ])).toBe(3);
  });

  test('compares numerically', () => {
    expect(primarySessionOf([ { sessionID: 10, player: 'Bob' }, { sessionID: 9, player: 'Alice' } ])).toBe(9);
  });

  test('picks one of two sessions of the same player', () => {
    expect(primarySessionOf([ { sessionID: 5, player: 'Alice' }, { sessionID: 4, player: 'Alice' } ])).toBe(4);
  });

  test('has no primary session while the list is empty or unknown', () => {
    expect(primarySessionOf([])).toBe(null);
    expect(primarySessionOf(undefined)).toBe(null);
  });
});

describe('isPrimarySession', () => {
  test('every client considers itself primary before it knows the session list', () => {
    expect(isPrimarySession()).toBe(true);
  });
});
