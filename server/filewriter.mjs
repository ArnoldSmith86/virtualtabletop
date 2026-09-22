import fs from 'fs';

// Fills a temporary file next to the target and renames it onto the target when the content
// is complete. Renaming is atomic within a filesystem, so anything reading the target sees
// either the previous file or the complete new one - a process that is killed or a disk that
// runs full mid-write can no longer leave a truncated file behind.
//
// The temporary file is named after its target, so this assumes a single process writing a
// given directory - the usual setup, where one server owns its save and library directories.
function writeThroughTempFile(filename, fillTempFile) {
  const tempFilename = `${filename}.tmp`;
  try {
    fillTempFile(tempFilename);
    fs.renameSync(tempFilename, filename);
  } catch(e) {
    try {
      fs.unlinkSync(tempFilename);
    } catch(unlinkError) {}
    throw e;
  }
}

function writeFileSync(filename, content) {
  writeThroughTempFile(filename, tempFilename => fs.writeFileSync(tempFilename, content));
}

// Unlike a plain rename this also works when source and target are on different filesystems.
function copyFileSync(source, target) {
  writeThroughTempFile(target, tempFilename => fs.copyFileSync(source, tempFilename, fs.constants.COPYFILE_FICLONE));
}

export default {
  copyFileSync,
  writeFileSync
}
