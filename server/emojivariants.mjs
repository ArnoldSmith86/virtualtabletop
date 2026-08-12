import fs from 'fs';
import path from 'path';

// The icon list (assets/fonts/symbols.json) names one file per emoji, but the noto-emoji artwork
// also holds their skin tone forms. Which ones is a property of that directory, so the picker's
// variant flyout (client/js/emojivariants.js) asks the server for them instead of the client
// carrying a second copy of the list that would go stale the next time the emoji are updated.
//
// What this returns is the code point sequence of every toned file, rebuilt from the numbers its
// name parses to rather than passed on as it was read, so nothing but hex digits can end up in it
// whatever ends up in that directory. That is the same naming the client computes for an emoji
// (emojiToFilename in client/js/symbols.js), which is how the two sides are compared.
export function readEmojiVariants(directory=path.resolve() + '/assets/noto-emoji') {
  return fs.readdirSync(directory)
    .map(file => (file.match(/^emoji_u([0-9a-f]{4,5}(?:_[0-9a-f]{4,5})*)\.svg$/) || [])[1])
    .filter(sequence => sequence && sequence.split('_').some(codePoint => codePoint.match(/^1f3f[b-f]$/)))
    .map(sequence => sequence.split('_').map(codePoint => parseInt(codePoint, 16).toString(16).padStart(4, '0')).join('_'));
}
