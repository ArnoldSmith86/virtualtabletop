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

function die(GUID, posX) {
  return { Name: 'Die_6', GUID, Transform: { posX, posZ: 0 } };
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
    expect(widgets['bag-bag'].text).toBe('Tokens');
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

    for(const widget of Object.values(widgets)) {
      if(widget.parent || widget.x === undefined)
        continue;
      expect(widget.x).toBeGreaterThanOrEqual(0);
      expect(widget.y).toBeGreaterThanOrEqual(0);
      expect(widget.x + (widget.width  || 0)).toBeLessThanOrEqual(1600);
      expect(widget.y + (widget.height || 0)).toBeLessThanOrEqual(1000);
    }
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
