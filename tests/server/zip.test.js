import CRC32 from 'crc-32';

import Zip from '../../server/zip.mjs';

// a .vtt written by the JSZip-based version of the server: one variant, one asset,
// a directory entry and a unicode filename - all four appear in real save files
const legacyVTT = Buffer.from(`
UEsDBAoAAAAIAOMDA109RI20MAAAADMAAAAGAAAAMC5qc29uq1aKz00tSVSyqlYqSy0qzszPU7Ky0FHK
zEvLB4nlJeamKlkphaQWlyi4g9i1tbUAUEsDBAoAAAAAAOMDA10AAAAAAAAAAAAAAAAHAAAAYXNzZXRz
L1BLAwQKAAAACADjAwNdJjn0ywsAAAAJAAAADQAAAGFzc2V0cy8xMjM0XzkzNDI2MTUzt7AEAFBLAwQK
AAAICADjAwNd7wvkCxkAAAAXAAAADQAWAMO8bWzDpHV0Lmpzb251cBIAAci4OjvDvG1sw6R1dC5qc29u
q1aKz00tSVSyqlYqSy0qzszPU7KyqK0FAFBLAQIUAAoAAAAIAOMDA109RI20MAAAADMAAAAGAAAAAAAA
AAAAAAAAAAAAAAAwLmpzb25QSwECFAAKAAAAAADjAwNdAAAAAAAAAAAAAAAABwAAAAAAAAAAABAAAABU
AAAAYXNzZXRzL1BLAQIUAAoAAAAIAOMDA10mOfTLCwAAAAkAAAANAAAAAAAAAAAAAAAAAHkAAABhc3Nl
dHMvMTIzNF85UEsBAhQACgAACAgA4wMDXe8L5AsZAAAAFwAAAA0AFgAAAAAAAAAAAAAArwAAAMO8bWzD
pHV0Lmpzb251cBIAAci4OjvDvG1sw6R1dC5qc29uUEsFBgAAAAAEAAQA9QAAAAkBAAAAAA==
`.replace(/\s/g, ''), 'base64');

describe('server/zip.mjs', function() {
  test('lists a zip written by JSZip without unpacking it', function() {
    expect(Zip.list(legacyVTT)).toEqual({
      '0.json': 51,
      'assets/': 0,
      'assets/1234_9': 9,
      'ümläut.json': 23
    });
  });

  test('reads entries of a zip written by JSZip', function() {
    expect(JSON.parse(Zip.readString(legacyVTT, '0.json'))._meta.info.name).toEqual('Test Game');
    expect(Zip.readString(legacyVTT, 'ümläut.json')).toEqual('{"_meta":{"version":8}}');

    const asset = Zip.read(legacyVTT, [ 'assets/1234_9' ])['assets/1234_9'];
    expect(Buffer.from(asset).toString()).toEqual('123456789');
    // assets are stored under `${crc32}_${size}`, so the CRC has to keep matching JSZip's
    expect(CRC32.buf(asset)).toEqual(-873187034);
  });

  test('reads only the requested entries', function() {
    expect(Object.keys(Zip.read(legacyVTT, [ '0.json' ]))).toEqual([ '0.json' ]);
  });

  test('round-trips stored and deflated files', function() {
    const asset = Buffer.from(Array.from({ length: 5000 }, (_, i)=>i%251));
    const files = { '0.json': '{"_meta":{"version":8}}', 'assets/1_2': asset };

    const stored = Zip.create(files);
    const deflated = Zip.create(files, true);
    expect(deflated.length).toBeLessThan(stored.length);

    for(const zip of [ stored, deflated ]) {
      expect(Zip.list(zip)).toEqual({ '0.json': 23, 'assets/1_2': 5000 });
      expect(Zip.readString(zip, '0.json')).toEqual(files['0.json']);
      expect(Buffer.from(Zip.read(zip, [ 'assets/1_2' ])['assets/1_2'])).toEqual(asset);
    }
  });
});
