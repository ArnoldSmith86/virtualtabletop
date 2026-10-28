import { ClientFunction, Selector } from 'testcafe';

import { prepareClient, setRoomState, setupTestEnvironment } from './test-util.js';

setupTestEnvironment();

// the second category of the game list, between In-Progress Games and Public Library
const shelfGames = Selector('#statesList > div:nth-of-type(2) .list .roomState');
const variants = Selector('#stateDetailsOverlay .variantsList .variant');
const detailsOverlay = Selector('#stateDetailsOverlay');
const statesOverlay = Selector('#statesOverlay');
const emptyVariantsHint = Selector('#emptyVariants');

// "Add game" -> "Save room state" adds the current room to the shelf as a game named Unnamed and
// opens its details in edit mode
async function addGameFromRoomState(t) {
  await t
    .pressKey('esc')
    .click('#statesButton')
    .click('#addState')
    .click('#stateAddOverlay button[icon=save]')
    .expect(shelfGames.count).eql(1)
    .expect(variants.count).eql(1);
}

// the buttons of a variant only appear once that variant is opened for editing
async function deleteVariant(t, index) {
  await t
    .click(variants.nth(index).find('button[icon=edit]'))
    .click(variants.nth(index).find('button[icon=delete]'));
}

async function editDetails(t) {
  await t
    .click('#stateDetailsOverlay .buttons [icon=menu]')
    .click('#stateDetailsOverlay .buttons [icon=edit]');
}

async function saveDetails(t) {
  await t.click('#stateDetailsOverlay > .buttons button[icon=save]');
}

// saving a game whose last variant was deleted removes the game, which asks first
async function confirmSave(t) {
  await t.click('#confirmOverlay [data-field=confirmButton]');
}

test('Deleting the last variant of a game removes the game from the shelf', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  await addGameFromRoomState(t);
  await deleteVariant(t, 0);
  await t
    .expect(variants.count).eql(0)
    .expect(emptyVariantsHint.visible).ok();

  // keeping the game at the confirmation returns to its details and changes nothing
  await saveDetails(t);
  await t
    .click('#confirmOverlay [data-field=cancelButton]')
    .expect(detailsOverlay.visible).ok()
    .expect(shelfGames.count).eql(1);

  await saveDetails(t);
  await confirmSave(t);

  // the game is gone, so its details close instead of being refilled from a tile that the game
  // list no longer has - and the game shelf stays open like it does after the delete button
  await t
    .expect(shelfGames.count).eql(0)
    .expect(detailsOverlay.visible).notOk()
    .expect(statesOverlay.visible).ok();
});

test('Deleting one of several variants keeps the game', async t => {
  await setRoomState();
  await ClientFunction(prepareClient)();

  await addGameFromRoomState(t);
  await t
    .click('#variantsList > button[icon=add]')
    .click('#variantAddOverlay button[icon=save]')
    .expect(variants.count).eql(2);
  await saveDetails(t);
  await t.expect(variants.count).eql(2);

  await editDetails(t);
  await deleteVariant(t, 0);
  await saveDetails(t);
  await t
    .expect(shelfGames.count).eql(1)
    .expect(variants.count).eql(1);

  // leave the shared room without a game in its shelf
  await t
    .click('#stateDetailsOverlay .buttons [icon=menu]')
    .click('#stateDetailsOverlay .buttons [icon=delete]')
    .click('#confirmOverlay [data-field=confirmButton]')
    .expect(shelfGames.count).eql(0);
});

test('Popularity sorts a mixed shelf independently of the previous sort', async t => {
  await ClientFunction(prepareClient)();
  await t
    .pressKey('esc')
    .click('#statesButton')
    .click('#librarySort')
    .click(Selector('#librarySort option').withAttribute('value', 'timePlayed'));

  // Popularity is supplied for public games; local games can have no play statistics.
  await ClientFunction(() => {
    const category = document.querySelector('#statesList > div:nth-of-type(2)');
    const list = category.querySelector('.list');
    list.innerHTML = '';
    category.classList.remove('empty');
    const games = [
      { id: 'popular', name: 'Zulu', timePlayed: 100 },
      { id: 'local', name: 'Local' },
      { id: 'less-popular', name: 'Alpha', timePlayed: 2 },
      { id: 'equal-b', name: 'Equal', timePlayed: 2 },
      { id: 'equal-a', name: 'Equal', timePlayed: 2 },
      { id: 'unplayed', name: 'Unplayed', timePlayed: 0 },
      { id: 'undefined', name: 'Missing', timePlayed: undefined },
      { id: 'null', name: 'Null', timePlayed: null }
    ];
    for(const [ index, game ] of games.entries()) {
      const tile = document.createElement('div');
      tile.appendChild(document.querySelector('#template-stateslist-entry').content.cloneNode(true));
      tile.classList.add('roomState', 'visible');
      if(game.timePlayed !== undefined && game.timePlayed !== null)
        tile.classList.add('publicLibraryGame');
      Object.assign(tile.dataset, {
        text: game.name.toLowerCase(), type: 'Games', players: '', duration: '0', languages: '', modes: '',
        similarName: String(games.length - index), stars: index, year: 2000 + index, lastUpdate: index
      }, game);
      tile.querySelector('h3').textContent = game.name;
      list.appendChild(tile);
    }
  })();

  const shelfOrder = ClientFunction(() => Array.from(
    document.querySelectorAll('#statesList > div:nth-of-type(2) .list .roomState'), tile => tile.dataset.id
  ));
  for(const sort of [ 'name', 'similarName', 'stars', 'lastUpdate', 'year' ]) {
    await t
      .click('#librarySort')
      .click(Selector('#librarySort option').withAttribute('value', sort))
      .click('#librarySort')
      .click(Selector('#librarySort option').withAttribute('value', 'timePlayed'))
      .expect(shelfOrder()).eql([ 'popular', 'less-popular', 'equal-a', 'equal-b', 'local', 'undefined', 'null', 'unplayed' ], `after sorting by ${sort}`);
  }
});
