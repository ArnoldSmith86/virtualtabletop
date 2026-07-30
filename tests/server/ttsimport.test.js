import { BSON } from 'bson';

import TTS from '../../server/ttsimport.mjs';

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

// Every widget of the room has to be reachable, children included: the surface is
// overflow: hidden, so anything outside of it cannot be clicked at all.
function expectOnSurface(widgets, bottom=1000) {
  for(const widget of Object.values(widgets)) {
    if(widget.id == 'hand' || widget.x === undefined && !widget.parent)
      continue;
    for(const [ x, y ] of corners(widget, widgets)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1600);
      expect(y).toBeLessThanOrEqual(bottom);
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
    expect(flat.board.scale).toBe(undefined);
    expect(upright.board.rotation).toBe(90);
    expect(upright.board.scale).toBeLessThan(1);
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

  it('scales the objects along with the distances between them', async () => {
    const widgets = await convert(objects(die('a', -40), die('b', 40)));

    // 80 TTS units are 4000px and have to fit into 1500
    expect(widgets.a.scale).toBeCloseTo(1500/4050, 2);
    expect(widgets.b.scale).toBe(widgets.a.scale);

    // the dice keep touching the left and the right end of the layout
    const center = w=>w.x + w.width/2;
    expect(center(widgets.b) - center(widgets.a)).toBeCloseTo(4000*widgets.a.scale, 0);
    expect(center(widgets.a) + center(widgets.b)).toBe(1600);
  });

  it('leaves a layout that fits alone', async () => {
    const widgets = await convert(objects(die('a', -2), die('b', 2)));
    expect(widgets.a.scale).toBe(undefined);
    expect(widgets.a.x).toBe(675);
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
