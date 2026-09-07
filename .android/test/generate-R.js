// Writes the R.java the tests compile against: the ids aapt2 generates for res/values, with the
// real texts of strings.xml behind them, so a test reads exactly what the app shows.
// Usage: node generate-R.js <res/values/strings.xml> <R.java>
import fs from 'fs';

const [ , , stringsFile, target ] = process.argv;
const xml = fs.readFileSync(stringsFile, 'utf8');
const colors = [...fs.readFileSync(stringsFile.replace(/strings\.xml$/, 'colors.xml'), 'utf8')
  .matchAll(/<color name="([^"]+)">/g)].map(m => m[1]);
const strings = [...xml.matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)].map(m => [ m[1],
  m[2].replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') ]);
const quote = text => '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';

fs.writeFileSync(target, `package io.virtualtabletop.server;

/** the ids aapt2 generates, with the real texts behind them so the test can read them */
public final class R {
  public static final String[] NAMES = {
${strings.map(s => '    ' + quote(s[1])).join(',\n')}
  };

  public static final class string {
${strings.map((s, i) => `    public static final int ${s[0]} = ${i};`).join('\n')}
  }

  public static final class id {
    public static final int state = 300, detail = 301, log = 302, logScroll = 303,
        progress = 304, primary = 305, secondary = 306, quit = 307;
  }

  public static final class layout {
    public static final int main = 400;
  }

  public static final class drawable {
    public static final int ic_open = 100, ic_share = 101, ic_quit = 102, ic_notification = 103;
  }

  public static final class color {
${colors.map((name, i) => `    public static final int ${name} = ${200 + i};`).join('\n')}
  }
}
`);
