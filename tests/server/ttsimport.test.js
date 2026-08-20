import { BSON } from 'bson';

import FileUpdater, { VERSION } from '../../server/fileupdater.mjs';
import TTS from '../../server/ttsimport.mjs';
import Zip from '../../server/zip.mjs';

// The importer only downloads images to read their dimensions, so the fixtures use
// data URLs holding nothing but a PNG header: the tests never touch the network.
function png(width, height) {
  const header = Buffer.alloc(24);
  header.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  header.write('IHDR', 12);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
}

async function convert(save) {
  const widgets = (await TTS.fromBSON(BSON.serialize(save))).TTS['0.json'];
  delete widgets._meta;
  return widgets;
}

// what the importer could not bring over - the game details show it as import notes
async function importNotes(save) {
  const widgets = (await TTS.fromBSON(BSON.serialize(save))).TTS['0.json'];
  return widgets._meta.info.importerWarnings;
}

function objects(...ObjectStates) {
  return { SaveName: 'test', ObjectStates };
}

function die(GUID, posX, posZ=0) {
  return { Name: 'Die_6', GUID, Transform: { posX, posZ } };
}

function deck(GUID, DeckIDs) {
  return {
    Name: 'DeckCustom',
    GUID,
    Transform: { posX: 0, posZ: 0 },
    DeckIDs,
    CustomDeck: { 1: { FaceURL: png(300, 400), BackURL: png(300, 400), NumWidth: 1, NumHeight: 1 } }
  };
}

function typed(widgets, type) {
  return Object.values(widgets).filter(w=>(w.type || 'basic') == type);
}

// The corners a widget ends up covering, the way the client renders it: a widget is
// a rectangle at x/y, and every widget in its parent chain scales and rotates its
// contents around its own center (`translate() rotate() scale()` with the default
// transform-origin). So x/y is not necessarily the top left corner on screen.
function corners(widget, widgets) {
  let points = [ [ 0, 0 ], [ widget.width || 0, 0 ], [ widget.width || 0, widget.height || 0 ], [ 0, widget.height || 0 ] ];

  for(let node = widget; node; node = widgets[node.parent]) {
    const cx = (node.width || 0)/2, cy = (node.height || 0)/2;
    const rad = (node.rotation || 0)*Math.PI/180, scale = node.scale || 1;
    points = points.map(([ x, y ])=>{
      const dx = (x - cx)*scale, dy = (y - cy)*scale;
      return [
        (node.x || 0) + cx + dx*Math.cos(rad) - dy*Math.sin(rad),
        (node.y || 0) + cy + dx*Math.sin(rad) + dy*Math.cos(rad)
      ];
    });
  }

  return points;
}

// A widget nobody owns - the holder of a closed bag - and everything inside it is
// hidden until a routine shows it.
function isHidden(widget, widgets) {
  for(let node = widget; node; node = widgets[node.parent])
    if(Array.isArray(node.owner) && !node.owner.length)
      return true;
  return false;
}

// Every widget of the room has to be reachable, children included: the surface is
// overflow: hidden, so anything outside of it cannot be clicked at all. What is
// visible right away also has to stay inside the band that is left for the table.
function expectOnSurface(widgets, bottom=1000) {
  for(const widget of Object.values(widgets)) {
    if(widget.id == 'hand' || widget.x === undefined && !widget.parent)
      continue;
    const limit = isHidden(widget, widgets) ? 1000 : bottom;
    for(const [ x, y ] of corners(widget, widgets)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1600);
      expect(y).toBeLessThanOrEqual(limit);
    }
  }
}

describe('TTS import: dice', () => {
  it('turns anything with RotationValues into a die using those values as faces', async () => {
    const widgets = await convert(objects({
      Name: 'Custom_Model',
      GUID: 'mesh',
      Transform: { posX: 0, posZ: 0 },
      RotationValues: [ 'Blue', 'Red', 'Green', 'Yellow', 'Black', 'Orange' ].map(Value=>({ Value }))
    }));

    expect(typed(widgets, 'dice').length).toBe(1);
    expect(widgets.mesh.faces).toEqual([ 'Blue', 'Red', 'Green', 'Yellow', 'Black', 'Orange' ]);
    expect(widgets.mesh.shape3d).toBe(true);
  });

  it('keeps numeric labels as numbers and stays flat for face counts without a 3D shape', async () => {
    const widgets = await convert(objects({
      Name: 'Custom_Model',
      GUID: 'three',
      Transform: { posX: 0, posZ: 0 },
      RotationValues: [ { Value: '1' }, { Value: '2' }, { Value: '3' } ]
    }));

    expect(widgets.three.faces).toEqual([ 1, 2, 3 ]);
    expect(widgets.three.shape3d).toBe(undefined);
  });

  it('falls back to the face count of a built-in die', async () => {
    const widgets = await convert(objects({ Name: 'Die_20', GUID: 'd20', Transform: { posX: 0, posZ: 0 } }));
    expect(widgets.d20.faces.length).toBe(20);
  });
});

describe('TTS import: bags', () => {
  it('skips bags that have no contents left after the import', async () => {
    const widgets = await convert(objects(
      { Name: 'Bag', GUID: 'empty', Transform: { posX: 0, posZ: 0 } },
      { Name: 'Infinite_Bag', GUID: 'pdfsOnly', Transform: { posX: 2, posZ: 0 }, ContainedObjects: [ { Name: 'Custom_PDF', GUID: 'pdf' } ] }
    ));

    expect(Object.keys(widgets)).toEqual([]);
  });

  it('puts the holder of a bag inside the button that toggles it', async () => {
    const widgets = await convert(objects({
      Name: 'Custom_Model_Bag',
      GUID: 'bag',
      Nickname: 'Tokens',
      Transform: { posX: 0, posZ: 0 },
      ContainedObjects: [ die('inBag', 0) ]
    }));

    expect(widgets['bag-bag'].type).toBe('button');
    // the number of objects a player gets out of the bag is part of its label
    expect(widgets['bag-bag'].text).toBe('Tokens (1)');
    expect(widgets.bag.type).toBe('holder');
    expect(widgets.bag.parent).toBe('bag-bag');
    expect(widgets.bag.owner).toEqual([]);
    expect(widgets.inBag.parent).toBe('bag');

    // clicking the button hides the holder when it is visible and vice versa
    const toggle = widgets['bag-bag'].clickRoutine[0];
    expect(toggle.operand1).toBe('${PROPERTY owner OF bag}');
    expect(toggle.thenRoutine[0].value).toEqual([]);
    expect(toggle.elseRoutine[0].value).toBe(undefined);
  });
});

describe('TTS import: decks', () => {
  it('turns the cards of a deck lying face up face up', async () => {
    const up = await convert(objects(deck('up', [ 100, 101 ])));
    expect(typed(up, 'card').map(c=>c.activeFace)).toEqual([ 1, 1 ]);

    // rotZ 180 is a deck lying on the table upside down, which is the default face
    const down = await convert(objects(Object.assign(deck('down', [ 100, 101 ]), { Transform: { posX: 0, posZ: 0, rotZ: 180 } })));
    expect(typed(down, 'card').map(c=>c.activeFace)).toEqual([ undefined, undefined ]);
  });

  // A CustomDeck entry has either a sheet of individual backs (UniqueBack) or one back image for the whole
  // deck, so a card type carries either "back" or "simpleBack" - never both. The back face may only hold the
  // object reading the one its cards really have: an object for the other kind is never filled and renders
  // as an empty transparent layer on every card of the deck.
  const sheet = extra=>Object.assign({ FaceURL: png(300, 400), BackURL: png(300, 400), NumWidth: 1, NumHeight: 1 }, extra);
  const customDeck = (GUID, CustomDeck, DeckIDs)=>({ Name: 'DeckCustom', GUID, Transform: { posX: 0, posZ: 0 }, DeckIDs, CustomDeck });
  const backObjects = widgets=>typed(widgets, 'deck')[0].faceTemplates[0].objects;

  it('puts one back image object on a deck sharing a single back image', async () => {
    const widgets = await convert(objects(customDeck('shared', { 1: sheet() }, [ 100, 101 ])));

    expect(backObjects(widgets).map(o=>o.dynamicProperties.value)).toEqual([ 'simpleBack' ]);
    expect(widgets.shared.cardTypes[100].simpleBack).toBeTruthy();
    expect(widgets.shared.cardTypes[100].back).toBe(undefined);
  });

  it('puts one tiled back image object on a deck with a back per card', async () => {
    const widgets = await convert(objects(customDeck('unique', { 1: sheet({ UniqueBack: true }) }, [ 100, 101 ])));

    expect(backObjects(widgets).map(o=>o.dynamicProperties.value)).toEqual([ 'back' ]);
    // the backs come out of a sheet, so the back face reads its cell the way the front face does
    expect(backObjects(widgets)[0].css['background-position']).toBe(typed(widgets, 'deck')[0].faceTemplates[1].objects[0].css['background-position']);
    expect(widgets.unique.cardTypes[100].back).toBeTruthy();
    expect(widgets.unique.cardTypes[100].simpleBack).toBe(undefined);
  });

  it('keeps both back image objects when one deck uses both kinds of back', async () => {
    const widgets = await convert(objects(customDeck('mixed', { 1: sheet(), 2: sheet({ UniqueBack: true }) }, [ 100, 200 ])));

    expect(backObjects(widgets).map(o=>o.dynamicProperties.value).sort()).toEqual([ 'back', 'simpleBack' ]);
    expect(widgets.mixed.cardTypes[100].simpleBack).toBeTruthy();
    expect(widgets.mixed.cardTypes[200].back).toBeTruthy();
  });

  it('leaves a deck without any back image with a back face to flip to', async () => {
    const widgets = await convert(objects(customDeck('backless', { 1: sheet({ BackURL: '' }) }, [ 100, 101 ])));

    expect(backObjects(widgets).map(o=>o.dynamicProperties.value)).toEqual([ 'simpleBack' ]);
  });
});

describe('TTS import: stacks', () => {
  it('puts the objects of a stack where the stack is', async () => {
    const widgets = await convert(objects(
      { Name: 'Custom_Tile', GUID: 'stack', Transform: { posX: 6, posZ: 0 }, CustomImage: { ImageURL: png(100, 100) }, ContainedObjects: [ die('one', 0), die('two', -6) ] },
      die('reference', 6)
    ));

    // the transforms stored with the objects inside a stack are frequently the ones
    // they had before they were stacked - going by them scatters the stack
    expect(widgets.one.x).toBe(widgets.reference.x);
    expect(widgets.two.x).toBe(widgets.reference.x);
  });
});

describe('TTS import: files', () => {
  it('converts a save from a workshop upload zip', async () => {
    const zip = await Zip.create({
      'WorkshopUpload': '',
      'save.json': JSON.stringify(objects(die('a', 0)))
    });

    const widgets = await TTS.fromZIP(zip);
    expect(widgets.a.type).toBe('dice');
    expect(widgets._meta.info.importerTemp).toBe('TTS');
  });

  it('writes the file at the current version so that no legacy mode is turned on for it', async () => {
    const state = (await TTS.fromBSON(BSON.serialize({
      SaveName: 'test',
      Hands: { Enable: true },
      ObjectStates: [ die('a', 0), { Name: 'HandTrigger', GUID: 'h1', FogColor: 'Red' } ]
    }))).TTS['0.json'];

    // the caption of the hand is what the legacy mode for holders without image support
    // looks for in an old file - it would hide the very text the importer just wrote
    expect(state.hand.text).toBe('Hand');
    expect(state._meta.version).toBe(VERSION);
    expect(state._meta.gameSettings).toBeUndefined();
    // loading the imported file leaves it exactly as it is
    expect(FileUpdater(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('keeps the widget IDs of two imports that run at the same time apart', async () => {
    // two objects with the same GUID: the second one has to get an ID of its own
    const twins = SaveName=>({ SaveName, ObjectStates: [ die('twin', -2), die('twin', 2) ] });

    const alone = await convert(twins('alone'));
    const [ first, second ] = await Promise.all([ convert(twins('first')), convert(twins('second')) ]);

    // an import may not take IDs away from another one that is still running
    expect(Object.keys(alone)).toEqual([ 'twin', 'twin-1' ]);
    expect(Object.keys(first)).toEqual(Object.keys(alone));
    expect(Object.keys(second)).toEqual(Object.keys(alone));
  });
});

describe('TTS import: layout', () => {
  it('gives a two card deck a pile but places a single card directly', async () => {
    const two = await convert(objects(deck('two', [ 100, 101 ])));
    expect(typed(two, 'pile').length).toBe(1);
    expect(typed(two, 'card').every(c=>c.parent == 'two-pile')).toBe(true);

    const one = await convert(objects(deck('one', [ 100 ])));
    expect(typed(one, 'pile').length).toBe(0);
    expect(one['one-100-1'].x).toBeGreaterThan(0);
  });

  it('does not let the positionless deck widget pull the layout to the origin', async () => {
    const withoutDeck = await convert(objects(die('a', -2), die('b', 2)));
    const withDeck = await convert(objects(die('a', -2), die('b', 2), deck('d', [ 100 ])));

    expect(withDeck.d.x).toBe(undefined);
    // the deck is invisible, so adding it must not move the dice around it
    expect(withDeck.a.x - withoutDeck.a.x).toBe(withDeck.b.x - withoutDeck.b.x);
    expect(withoutDeck.a.x + withoutDeck.b.x).toBe(1600 - 50);
  });

  it('keeps every placed widget on the surface', async () => {
    const widgets = await convert({
      SaveName: 'test',
      Hands: { Enable: true, HandTransforms: [ { Color: 'Red' } ] },
      ObjectStates: [ die('a', -40), die('b', 40), { Name: 'Custom_Board', GUID: 'board', Locked: true, Transform: { posX: 0, posZ: 0, scaleX: 8, scaleZ: 8 }, CustomImage: { ImageURL: png(1600, 1000) } } ]
    });

    expectOnSurface(widgets);
  });

  it('fits a rotated object by the space it really covers', async () => {
    const board = rotY=>({ Name: 'Custom_Board', GUID: 'board', Transform: { posX: 0, posZ: 0, rotY, scaleX: 2, scaleZ: 2 }, CustomImage: { ImageURL: png(1600, 100) } });
    const flat = await convert(objects(board(0)));
    const upright = await convert(objects(board(90)));

    // 1200x75 fits as it is, but turned by 90 degrees the same board is 1200px high
    expect(flat.board.width).toBe(1200);
    expect(upright.board.rotation).toBe(90);
    expect(upright.board.width).toBeLessThan(1200);
    expectOnSurface(upright);
  });

  it('leaves room for the holder of a bag at the bottom of the layout', async () => {
    const widgets = await convert({
      SaveName: 'test',
      Hands: { Enable: true, HandTransforms: [ { Color: 'Red' } ] },
      ObjectStates: [
        die('top', 0, 6),
        { Name: 'Bag', GUID: 'bag', Transform: { posX: 0, posZ: -6 }, ContainedObjects: [ deck('inBag', [ 100, 101 ]) ] }
      ]
    });

    // the holder is only visible while the bag is open, but it still has to fit into
    // the band between the seats and the hand instead of being cut off by the surface
    expect(widgets.bag.parent).toBe('bag-bag');
    expectOnSurface(widgets, 810);
  });

  it('makes the objects smaller along with the distances between them', async () => {
    const widgets = await convert(objects(die('a', -40), die('b', 40)));

    // 80 TTS units are 4000px and have to fit into 1500
    const factor = Math.round(1500/4050*1000)/1000;
    expect(widgets.a.width).toBe(Math.round(50*factor));
    expect(widgets.b.width).toBe(widgets.a.width);
    // the widget itself is smaller instead of being rendered scaled down: a card
    // dragged out of a scaled pile would jump to full size
    expect(widgets.a.scale).toBe(undefined);

    // the dice keep touching the left and the right end of the layout
    const center = w=>w.x + w.width/2;
    expect(center(widgets.b) - center(widgets.a)).toBeCloseTo(4000*factor, 0);
    expect(center(widgets.a) + center(widgets.b)).toBeCloseTo(1600, -1);
  });

  it('gives the cards of a shrunk deck the size of their pile', async () => {
    const widgets = await convert(objects(deck('d', [ 100, 101 ]), die('far', 40)));

    // the cards are children of the pile and have to shrink with it - and they keep
    // that size when a player drags one out onto the table
    expect(widgets.d.cardDefaults.width).toBeLessThan(120);
    expect(widgets.d.cardDefaults.width).toBe(widgets['d-pile'].width);
    expect(widgets.d.cardDefaults.height).toBe(widgets['d-pile'].height);
  });

  it('leaves a layout that fits alone', async () => {
    const widgets = await convert(objects(die('a', -2), die('b', 2)));
    expect(widgets.a.scale).toBe(undefined);
    expect(widgets.a.width).toBe(50);
    expect(widgets.a.x).toBe(675);
  });

  it('does not shrink the layout for the holder of a closed bag', async () => {
    const board = { Name: 'Custom_Board', GUID: 'board', Transform: { posX: 0, posZ: 0, scaleX: 2, scaleZ: 2 }, CustomImage: { ImageURL: png(600, 600) } };
    const bag = { Name: 'Bag', GUID: 'bag', Transform: { posX: 0, posZ: -6 }, ContainedObjects: [ die('inBag', 0) ] };
    const table = (...ObjectStates)=>({ SaveName: 'test', Hands: { Enable: true, HandTransforms: [ { Color: 'Red' } ] }, ObjectStates });

    const withoutBag = await convert(table(board));
    const withBag = await convert(table(board, bag));

    // the holder is not on the screen until the bag is opened, so it must not make
    // the whole table smaller - but it does have to stay reachable once it is
    expect(withBag.board.width).toBe(withoutBag.board.width);
    expectOnSurface(withBag, 810);
  });
});

describe('TTS import: import notes', () => {
  it('says nothing about a save that came over completely', async () => {
    expect(await importNotes(objects(die('a', -2), die('b', 2)))).toBe(undefined);
  });

  it('reports the objects and the settings that could not be translated', async () => {
    const notes = await importNotes({
      SaveName: 'test',
      LuaScript: 'function onLoad() end',
      TabStates: { 0: { title: 'Rules' } },
      Turns: { Enable: true },
      ObjectStates: [
        die('a', 0),
        { Name: 'Custom_PDF', GUID: 'pdf', Nickname: 'Rulebook', Transform: { posX: 2, posZ: 0 } },
        { Name: 'Custom_Model', GUID: 'mesh', Nickname: 'Castle', Transform: { posX: 4, posZ: 0 } },
        { Name: 'Die_6', GUID: 'states', Nickname: 'Weather', Transform: { posX: 6, posZ: 0 }, States: { 2: {} } }
      ]
    });

    expect(notes.join('\n')).toMatch(/scripted/);
    expect(notes.join('\n')).toMatch(/notebook of this mod \(1 page\)/);
    expect(notes.join('\n')).toMatch(/turn order/);
    expect(notes.join('\n')).toMatch(/"Rulebook" was not imported/);
    expect(notes.join('\n')).toMatch(/"Castle" is a 3D model/);
    expect(notes.join('\n')).toMatch(/"Weather" has several states/);
  });

  it('names the objects that share a problem in a single note', async () => {
    const tokens = [ 'Wood', 'Stone', 'Gold', 'Wheat', 'Sheep' ].map((Nickname, index)=>({
      Name: 'Custom_PDF',
      GUID: `pdf${index}`,
      Nickname,
      Transform: { posX: index, posZ: 0 }
    }));
    const notes = await importNotes(objects(die('a', 0), ...tokens));

    const note = notes.filter(n=>n.match(/^A PDF/));
    expect(note.length).toBe(1);
    // five names would be a wall of text - the first few of them stand for the rest
    expect(note[0]).toMatch(/"Wood", "Stone", "Gold" and 2 more were not imported/);

    // objects without a name of their own are counted instead of being listed
    const unnamed = await importNotes(objects(die('a', 0), ...tokens.map(t=>Object.assign({}, t, { Nickname: '' }))));
    expect(unnamed.filter(n=>n.match(/^A PDF/))[0]).toMatch(/5× "Custom_PDF" were not imported/);
  });

  it('caps a report that a broken mod would fill with thousands of lines', async () => {
    const scenery = Array.from({ length: 150 }, (unused, index)=>({
      Name: `Tileset_${index}`,
      GUID: `scenery${index}`,
      Nickname: `Chair ${index}`,
      Transform: { posX: index, posZ: 0 }
    }));
    const notes = await importNotes(objects(die('a', 0), ...scenery));

    expect(notes.length).toBe(101);
    expect(notes[100]).toBe('50 more notes are not listed here.');
  });
});

describe('TTS import: seats', () => {
  it('reads the hand zones of both save formats and only keeps one seat per color', async () => {
    const widgets = await convert({
      SaveName: 'test',
      Hands: { Enable: true, Hiding: 0 },
      ObjectStates: [
        die('a', 0),
        { Name: 'HandTrigger', GUID: 'h1', FogColor: 'Red' },
        { Name: 'HandTrigger', GUID: 'h2', FogColor: 'Blue' },
        { Name: 'HandTrigger', GUID: 'h3', FogColor: 'Blue' }
      ]
    });

    expect(typed(widgets, 'seat').map(s=>s.color)).toEqual([ '#da1917', '#118ed7' ]);
    expect(widgets.hand.type).toBe('holder');
  });

  it('gives the hand the drop shadow and the hidden cursors of a VirtualTabletop hand', async () => {
    const widgets = await convert({
      SaveName: 'test',
      Hands: { Enable: true },
      ObjectStates: [ die('a', 0), { Name: 'HandTrigger', GUID: 'h1', FogColor: 'Red' } ]
    });

    expect(widgets.hand.childrenPerOwner).toBe(true);
    expect(widgets.hand.dropShadow).toBe(true);
    expect(widgets.hand.hidePlayerCursors).toBe(true);
  });

  it('fits the seats onto the surface even with a hand zone per TTS color', async () => {
    const colors = [ 'White', 'Brown', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Grey', 'Black' ];
    const widgets = await convert({
      SaveName: 'test',
      Hands: { Enable: true, HandTransforms: colors.map(Color=>({ Color })) },
      ObjectStates: [ die('a', 0) ]
    });

    const seats = typed(widgets, 'seat');
    expect(seats.length).toBe(12);
    for(const seat of seats)
      expect(seat.x + seat.width).toBeLessThanOrEqual(1600);
    // and they don't overlap each other
    for(let i=1; i<seats.length; ++i)
      expect(seats[i].x).toBeGreaterThanOrEqual(seats[i-1].x + seats[i-1].width);
  });
});
