import fs from 'fs';

let nextWriteID = 0;
// A synchronous save can supersede an asynchronous write that is still in flight. Only the most
// recently requested content for a filename may be renamed onto the target.
const latestWrite = new Map();

function beginWrite(filename) {
  const id = ++nextWriteID;
  latestWrite.set(filename, id);
  return id;
}

function endWrite(filename, id) {
  if(latestWrite.get(filename) == id)
    latestWrite.delete(filename);
}

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
  const id = beginWrite(filename);
  try {
    writeThroughTempFile(filename, tempFilename => fs.writeFileSync(tempFilename, content));
  } finally {
    endWrite(filename, id);
  }
}

async function writeFile(filename, content) {
  const id = beginWrite(filename);
  const tempFilename = `${filename}.tmp-${process.pid}-${id}`;
  try {
    await fs.promises.writeFile(tempFilename, content);
    if(latestWrite.get(filename) == id)
      // The check and rename stay in one event-loop turn so a newer synchronous save cannot land
      // between them and then be overwritten by this write.
      fs.renameSync(tempFilename, filename);
    else
      await fs.promises.unlink(tempFilename);
  } catch(e) {
    try {
      await fs.promises.unlink(tempFilename);
    } catch(unlinkError) {}
    throw e;
  } finally {
    endWrite(filename, id);
  }
}

// Unlike a plain rename this also works when source and target are on different filesystems.
function copyFileSync(source, target) {
  writeThroughTempFile(target, tempFilename => fs.copyFileSync(source, tempFilename, fs.constants.COPYFILE_FICLONE));
}

export default {
  copyFileSync,
  writeFile,
  writeFileSync
}
