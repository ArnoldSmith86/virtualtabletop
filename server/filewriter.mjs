import fs from 'fs';

// Writes to a temporary file next to the target and renames it onto the target when the
// content is complete. Renaming is atomic within a filesystem, so anything reading the
// target sees either the previous file or the complete new one - a process that is killed
// or a disk that runs full mid-write can no longer leave a truncated file behind.
function writeFileSync(filename, content) {
  const tempFilename = `${filename}.tmp`;
  try {
    fs.writeFileSync(tempFilename, content);
    fs.renameSync(tempFilename, filename);
  } catch(e) {
    try {
      fs.unlinkSync(tempFilename);
    } catch(unlinkError) {}
    throw e;
  }
}

export default {
  writeFileSync
}
