const compute_ops = [
  {
    name: '=',
    desc: 'sets the variable to the value of x',
    sample: 'var a = ${x}',
    call: function(v, x, y) { return y }, // for compatibility with SET
    hash: '8c46c8ba2529c6931e488d829ef88272'
  },
  {
    name: '+',
    desc: 'returns the sum of two numbers or add/join/concat two strings together',
    sample: 'var a = ${x} + ${y}',
    call: function(v, x, y) { return v = x + y },
    hash: '47470403fc757fcd584dc20efd70d420'
  },
  {
    name: '-',
    desc: 'returns the difference of two numbers (subtract y from x)',
    sample: 'var a = ${x} - ${y}',
    call: function(v, x, y) { return v = x - y },
    hash: '1da4d9ae2ad438a6c1c71dd6ea5baa5b'
  },
  {
    name: '*',
    desc: 'returns the product of two numbers (multiply x and y)',
    sample: 'var a = ${x} * ${y}',
    call: function(v, x, y) { return v = x * y },
    hash: '39764e36be04a8dc69b720316f40b409'
  },
  {
    name: '**',
    desc: 'returns the result of raising x to the power of y (exponent)',
    sample: 'var a = ${x} ** ${y}',
    call: function(v, x, y) { return v = x ** y },
    hash: '562d9663a8d1b879caf644612c3552a3'
  },
  {
    name: '/',
    desc: 'returns the division of two numbers (divide x by y)',
    sample: 'var a = ${x} / ${y}',
    call: function(v, x, y) { return v = x / y },
    hash: 'c03a7f5d8cc44d84828b26e2adb2fdba'
  },
  {
    name: '%',
    desc: 'returns the integer remainder/rest/modal of the division of two numbers',
    sample: 'var a = ${x} % ${y}',
    call: function(v, x, y) { return v = x % y },
    hash: 'ffe8c3752a0a50afb8b2882100e02e9d'
  },
  {
    name: '<',
    desc: 'returns true if x is less than y',
    sample: 'var a = ${x} < ${y}',
    call: function(v, x, y) { return v = x < y },
    hash: 'b8da10460ca032511e0bbbd630dcb404'
  },
  {
    name: '<=',
    desc: 'returns true if x is less than or equal to y',
    sample: 'var a = ${x} <= ${y}',
    call: function(v, x, y) { return v = x <= y },
    hash: 'f92f282e3642d403e89dd745814aa965'
  },
  {
    name: '==',
    desc: 'returns true if x is equal to y',
    sample: 'var a = ${x} == ${y}',
    call: function(v, x, y) { return v = x == y },
    hash: 'dc999fd39041c811671a6b52d0a27cd5'
  },
  {
    name: '===',
    desc: 'returns true if x is equal to (and the same type as) y',
    sample: 'var a = ${x} === ${y}',
    call: function(v, x, y) { return v = x === y },
    hash: 'ab49ebfc7795f6386b9c22198c391c12'
  },
  {
    name: '!=',
    desc: 'returns true if x is not equal to y',
    sample: 'var a = ${x} != ${y}',
    call: function(v, x, y) { return v = x != y },
    hash: '1352950841faa8eb3538d015261c7945'
  },
  {
    name: '!==',
    desc: 'returns true if x is not equal to (or not the same type as) y',
    sample: 'var a = ${x} !== ${y}',
    call: function(v, x, y) { return v = x !== y },
    hash: '933269de9a9c2358d36f4a7ff3a914af'
  },
  {
    name: '>=',
    desc: 'returns true if x is greater than or equal to y',
    sample: 'var a = ${x} >= ${y}',
    call: function(v, x, y) { return v = x >= y },
    hash: '0bdad89540a00bb96ef374f381f21046'
  },
  {
    name: '>',
    desc: 'returns true if x is greater than y',
    sample: 'var a = ${x} > ${y}',
    call: function(v, x, y) { return v = x > y },
    hash: '9bda4a1d8031ed3bd37739d59a781ba1'
  },
  {
    name: '&&',
    desc: 'logical AND returns true if both x and y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} && ${y}',
    call: function(v, x, y) { return v = x && y },
    hash: 'cfb4c588c372704f24a6c1b6599474b5'
  },
  {
    name: '||',
    desc: 'logical OR returns true if either x or y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} || ${y}',
    call: function(v, x, y) { return v = x || y },
    hash: '6a3eae6384503ff7282f5fa120127d08'
  },
  {
    name: '!',
    desc: 'logical NOT returns true if the given value is false (or can be evaluated as false), otherwise returns false',
    sample: 'var a = ! ${x}',
    call: function(v, x) { return v = !x },
    hash: '2e1c3dd3a27b93e6c01b08c92592f714'
  },
  {
    name: 'hypot',
    desc: 'returns the square root of the sum of squares (hypotenuse) - a second number y is optional',
    sample: 'var a = hypot ${x} ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? Math.hypot(x, y) : Math.hypot(x) },
    hash: '5de8afe477535e67c7a261aaef45f0d3'
  },
  {
    name: 'max',
    desc: 'returns the larger/higher of two numbers',
    sample: 'var a = max ${x} ${y}',
    call: function(v, x, y) { return v = Math.max(x, y) },
    hash: '8f49c1ed0a1e832133c0798fd1d278eb'
  },
  {
    name: 'min',
    desc: 'returns the smaller/lower of two numbers',
    sample: 'var a = min ${x} ${y}',
    call: function(v, x, y) { return v = Math.min(x, y) },
    hash: '596b63804119a7c695e3f49005485c6c'
  },
  {
    name: 'pow',
    desc: 'returns the base to the exponent power (x to y)',
    sample: 'var a = pow ${x} ${y}',
    call: function(v, x, y) { return v = Math.pow(x, y) },
    hash: '30f806e2f8fb8f3898955b381c840d49'
  },
  {
    name: 'sin',
    desc: 'returns the sine of a number (in degrees)',
    sample: 'var a = sin ${x}',
    call: function(v, x) { return v = Math.sin(x * Math.PI/180) },
    hash: '890d49abf6d19b04ec927b4a9d1fdab8'
  },
  {
    name: 'cos',
    desc: 'returns the cosine of a number (in degrees)',
    sample: 'var a = cos ${x}',
    call: function(v, x) { return v = Math.cos(x * Math.PI/180) },
    hash: 'b3e89462e95e45c476f71101a86d53e0'
  },
  {
    name: 'tan',
    desc: 'returns the tangent of a number (in degrees)',
    sample: 'var a = tan ${x}',
    call: function(v, x) { return v = Math.tan(x * Math.PI/180) },
    hash: '0d768122fa7de9b5ed382ac5a81f8147'
  },
  {
    name: 'asin',
    desc: 'returns the arcsine (in degrees) of a number',
    sample: 'var a = asin ${x}',
    call: function(v, x) { return v = Math.asin(x) / Math.PI*180 },
    hash: 'f1d96f7110ec8fe3e32c143d5b8f9ae2'
  },
  {
    name: 'acos',
    desc: 'returns the arccosine (in degrees) of a number',
    sample: 'var a = acos ${x}',
    call: function(v, x) { return v = Math.acos(x) / Math.PI*180 },
    hash: '84c0abc49a49e173491b48a8705f4862'
  },
  {
    name: 'atan',
    desc: 'returns the arctangent (in degrees) of a number',
    sample: 'var a = atan ${x}',
    call: function(v, x) { return v = Math.atan(x) / Math.PI*180 },
    hash: 'f434df01a5a2f6c925b0c8a824bee51b'
  },
  {
    name: 'atan2',
    desc: 'returns the arctangent (in degrees) between the positive X axis and the point (y, x)',
    sample: 'var a = atan2 ${y} ${x} // y comes before x',
    call: function(v, y, x) { return v = Math.atan2(y, x) / Math.PI*180 },
    hash: 'bc511e7edd7e40b433f5620534775646'
  },
  {
    name: 'abs',
    desc: 'returns the absolute value of a number',
    sample: 'var a = abs ${x}',
    call: function(v, x) { return v = Math.abs(x) },
    hash: '4df91c076a11658795e006066bd89d79'
  },
  {
    name: 'cbrt',
    desc: 'returns the cube root of a number',
    sample: 'var a = cbrt ${x}',
    call: function(v, x) { return v = Math.cbrt(x) },
    hash: 'a38d93a6a7cc18af54d98ff3cec849c0'
  },
  {
    name: 'ceil',
    desc: 'returns the number rounded up to the next largest integer',
    sample: 'var a = ceil ${x}',
    call: function(v, x) { return v = Math.ceil(x) },
    hash: 'd4dc5c0bf1ee50f2ef019ff5dea702de'
  },
  {
    name: 'exp',
    desc: 'returns Ex, where x is the argument and E is Euler\'s constant',
    sample: 'var a = exp ${x}',
    call: function(v, x) { return v = Math.exp(x) },
    hash: '2a49d769b380e8609b15a1e02e7f6069'
  },
  {
    name: 'floor',
    desc: 'returns the number rounded down to the largest integer less than or equal to a given number',
    sample: 'var a = floor ${x}',
    call: function(v, x) { return v = Math.floor(x) },
    hash: '6d0d44218896165041e8a387865ab67e'
  },
  {
    name: 'log',
    desc: 'returns the natural logarithm (base e) of a number',
    sample: 'var a = log ${x}',
    call: function(v, x) { return v = Math.log(x) },
    hash: '50ee6a7c7001783e002fd4eaab003fb9'
  },
  {
    name: 'log10',
    desc: ' returns the base 10 logarithm of a number',
    sample: 'var a = log10 ${x}',
    call: function(v, x) { return v = Math.log10(x) },
    hash: '2f9612c340e8556d2952d13f37c23b14'
  },
  {
    name: 'log2',
    desc: 'returns the base 2 logarithm of a number',
    sample: 'var a = log2 ${x}',
    call: function(v, x) { return v = Math.log2(x) },
    hash: 'c2f4c6eab135af4a95ed9b5732e71a18'
  },
  {
    name: 'random',
    desc: 'returns a decimal number in the range 0 to less than 1',
    sample: 'var a = random',
    call: function(v) { return v = Math.random() },
    hash: 'a41526e7d6ab47d459c67c38585b4088'
  },
  {
    name: 'round',
    desc: 'returns the value of a number rounded to the nearest integer',
    sample: 'var a = round ${x}',
    call: function(v, x) { return v = Math.round(x) },
    hash: '42003b215f3252693b370288c431e6b1'
  },
  {
    name: 'sign',
    desc: 'returns 1 or -1, indicating the sign of a number (or 0 if the number is 0)',
    sample: 'var a = sign ${x}',
    call: function(v, x) { return v = Math.sign(x) },
    hash: 'd5f6c47f344f604e75183157011f009c'
  },
  {
    name: 'sqrt',
    desc: 'returns the positive square root of a number',
    sample: 'var a = sqrt ${x}',
    call: function(v, x) { return v = Math.sqrt(x) },
    hash: '048e61ae7ac1d0f60808466f0d5a3b21'
  },
  {
    name: 'trunc',
    desc: 'returns the integer part of a number by removing any fractions',
    sample: 'var a = trunc ${x}',
    call: function(v, x) { return v = Math.trunc(x) },
    hash: '48ac6c363e2e4a6ecc1d6275ff8e4c86'
  },
  {
    name: 'E',
    desc: 'represents Euler\'s number, the base of natural logarithms (approx. 2.718)',
    sample: 'var a = E',
    call: function(v) { return v = Math.E },
    hash: '36e9ad2cea3e53a387e597f39c55d8a8'
  },
  {
    name: 'LN2',
    desc: 'represents the natural logarithm of 2 (approx. 0.693)',
    sample: 'var a = LN2',
    call: function(v) { return v = Math.LN2 },
    hash: '75e43a69f08babb71577bc7bdc13ea94'
  },
  {
    name: 'LN10',
    desc: 'represents the natural logarithm of 10 (approx. 2.303)',
    sample: 'var a = LN10',
    call: function(v) { return v = Math.LN10 },
    hash: '5fd35cf0640bb8d7f353e1e1d389170a'
  },
  {
    name: 'LOG2E',
    desc: 'represents the base 2 logarithm of e (approx. 1.443)',
    sample: 'var a = LOG2E',
    call: function(v) { return v = Math.LOG2E },
    hash: 'f19ad11905a44d26f173803d61bba7da'
  },
  {
    name: 'LOG10E',
    desc: 'represents the base 10 logarithm of e (approx. 0.434)',
    sample: 'var a = LOG10E',
    call: function(v) { return v = Math.LOG10E },
    hash: '8c54f942f92e40a095040778064054a2'
  },
  {
    name: 'PI',
    desc: 'represents the ratio of the circumference of a circle to its diameter (approx. 3.141)',
    sample: 'var a = PI',
    call: function(v) { return v = Math.PI },
    hash: '7e9c6ff5c2f12146429ed6eb8beca646'
  },
  {
    name: 'SQRT1_2',
    desc: 'represents the square root of 1/2 (approx. 0.707)',
    sample: 'var a = SQRT1_2',
    call: function(v) { return v = Math.SQRT1_2 },
    hash: '9f4b7290fc15065bf67ce47d488c8ec6'
  },
  {
    name: 'SQRT2',
    desc: 'represents the square root of 2 (approx. 1.414)',
    sample: 'var a = SQRT2',
    call: function(v) { return v = Math.SQRT2 },
    hash: '5c68556ef702856fad4ca9075f8a3c4c'
  },
  {
    name: 'length',
    desc: 'returns the length of an array',
    sample: 'var a = ${x} length',
    call: function(v, x) { return v = x.length },
    hash: '7c3eb6540d9d1c66f2034072d464b4e7'
  },
  {
    name: 'parseFloat',
    desc: 'returns a floating point number parsed from the given string',
    sample: 'var a = parseFloat ${x}',
    call: function(v, x) { return v = parseFloat(x) },
    hash: '5360899cbec936c1605070b6479a6027'
  },
  {
    name: 'toLowerCase',
    desc: 'returns the string in lowercase letters',
    sample: 'var a = ${x} toLowerCase',
    call: function(v, x) { return v = x.toLowerCase() },
    hash: '274f6f97ab5a4feae67f3dfec0e4b20c'
  },
  {
    name: 'toUpperCase',
    desc: 'returns the string in uppercase letters',
    sample: 'var a = ${x} toUpperCase',
    call: function(v, x) { return v = x.toUpperCase() },
    hash: 'acba74d9e2bb204e258916a7f6b7fa66'
  },
  {
    name: 'trim',
    desc: 'returns the string after removing whitespace from both sides',
    sample: 'var a = ${x} trim',
    call: function(v, x) { return v = x.trim() },
    hash: '2571c06ee6210fc5fe258323a87b16c6'
  },
  {
    name: 'trimStart',
    desc: 'returns the string after removing whitespace from the beginning',
    sample: 'var a = ${x} trimStart',
    call: function(v, x) { return v = x.trimStart() },
    hash: 'e0ef0b9d90c8240ebacfe9948733604a'
  },
  {
    name: 'trimEnd',
    desc: 'returns the string after removing whitespace from the end',
    sample: 'var a = ${x} trimEnd',
    call: function(v, x) { return v = x.trimEnd() },
    hash: '5217ad2d3e6d3e3a093e148df8863c0d'
  },
  {
    name: 'charAt',
    desc: 'returns the nth character of a string x, with 0 being the first',
    sample: 'var a = ${x} charAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charAt(y) : x.charAt() },
    hash: 'd5285e5ba15f4361b29d0422a3b8aeef'
  },
  {
    name: 'charCodeAt',
    desc: 'returns the Unicode of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} charCodeAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charCodeAt(y) : x.charCodeAt() },
    hash: '7f95befe02fb64f8337f6a17c0746002'
  },
  {
    name: 'codePointAt',
    desc: 'returns the UTF-16 code point value of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} codePointAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.codePointAt(y) : x.codePointAt() },
    hash: 'cdcf71df618c61345480069df3b80d23'
  },
  {
    name: 'concat',
    desc: 'returns a string containing the text of the joined strings',
    sample: 'var a = ${x} concat ${y}',
    call: function(v, x, y) { return v = x.concat(y) },
    hash: 'e30b0c7dd6af94e177b9c0e125181f9f'
  },
  {
    name: 'endsWith',
    desc: 'returns true if a string x ends with a string y - case sensitive',
    sample: 'var a = ${x} endsWith ${y}',
    call: function(v, x, y) { return v = x.endsWith(y) },
    hash: 'd5e589f2b02befbc50d5e988105597d6'
  },
  {
    name: 'indexOf',
    desc: 'returns the position of the first occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} indexOf ${y}',
    call: function(v, x, y) { return v = x.indexOf(y) },
    hash: '59b2f1f6312f51f9e73138ee6eeb66e7'
  },
  {
    name: 'lastIndexOf',
    desc: 'returns the position of the last occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} lastIndexOf ${y}',
    call: function(v, x, y) { return v = x.lastIndexOf(y) },
    hash: '5542a5121c77b501030dfd64d045b670'
  },
  {
    name: 'in',
    desc: 'returns true if string x is included in string/array y (or property x in object y) - case sensitive',
    sample: 'var a = ${x} in ${y}',
    call: function(v, x, y) { return v = Array.isArray(y) || typeof y == 'string' ? y.indexOf(x) != -1 : x in y },
    hash: '403c82322543026867587d570e62f0c0'
  },
  {
    name: 'includes',
    desc: 'returns true if string/array x includes value y (or object x includes property y) - case sensitive',
    sample: 'var a = ${x} includes ${y}',
    call: function(v, x, y) { return v = Array.isArray(x) || typeof x == 'string' ? x.indexOf(y) != -1 : y in x },
    hash: 'b997d91855be8b50dc234a5738734c27'
  },
  {
    name: 'localeCompare',
    desc: 'compares the sort order of two strings and returns -1 (x before y), 0 (x equals y) or 1 (x after y) - case sensitive',
    sample: 'var a = ${x} localeCompare ${y}',
    call: function(v, x, y) { return v = x.localeCompare(y) },
    hash: '4e66fbcc06bb73298761e05b13c90201'
  },
  {
    name: 'match',
    desc: 'searches a string x for a match against a regular expression y (with optional flags z), and returns the match(es) as an array, or null if no match was found',
    sample: 'var a = ${x} match ${y} ${z}\nvar a = ${x} match \'[a-zA-Z0-9].*\' \'g\'',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.match(new RegExp(y, z != 1 ? z : '')) : x.match(new RegExp(y))  },
    hash: '2f508a1e64848b945635eede3c326977'
  },
  {
    name: 'padEnd',
    desc: 'returns a string x padded with spaces at the end (up to the specified total string length y)',
    sample: 'var a = ${x} padEnd ${y}',
    call: function(v, x, y) { return v = x.padEnd(y) },
    hash: '9b17e1a9184f2ca3e257faa95b15ab20'
  },
  {
    name: 'padStart',
    desc: 'returns a string x padded with spaces at the start (up to the specified total string length y)',
    sample: 'var a = ${x} padStart ${y}',
    call: function(v, x, y) { return v = x.padStart(y) },
    hash: '6252366d506670dc4599d76b75b7732e'
  },
  {
    name: 'repeat',
    desc: 'returns a string containing y copies of the string x, joined together',
    sample: 'var a = ${x} repeat ${y}',
    call: function(v, x, y) { return v = x.repeat(y) },
    hash: '628669d204da659c742f607629fb3057'
  },
  {
    name: 'search',
    desc: 'returns the position of the first match between the regular expression and the given string, or -1 if no match was found',
    sample: 'var a = ${x} search ${y}',
    call: function(v, x, y) { return v = x.search(y) },
    hash: '0222366ee555afc940c9c863fffe6f44'
  },
  {
    name: 'split',
    desc: 'splits a string into substrings based on a separator y, and returns an array of the result',
    sample: 'var a = ${x} split ${y}',
    call: function(v, x, y) { return v = x.split(y) },
    hash: '79bbdc6de81e8549c9ecb4e811c6c923'
  },
  {
    name: 'startsWith',
    desc: 'returns true if a string x starts with a string y - case sensitive',
    sample: 'var a = ${x} startsWith ${y}',
    call: function(v, x, y) { return v = x.startsWith(y) },
    hash: 'dd5507e1f19702b828f58cce837c58d9'
  },
  {
    name: 'toFixed',
    desc: 'returns a formatted number based on x, using the given amount y of digits, defaulting to 0 digits',
    sample: 'var a = ${x} toFixed ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toFixed(y) : x.toFixed() },
    hash: '9f34bd824094247d28768d779f1c41df'
  },
  {
    name: 'toLocaleLowerCase',
    desc: 'returns the string x in lowercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleLowerCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleLowerCase(y) : x.toLocaleLowerCase() },
    hash: '4403a094826913c3d883dedc619e4924'
  },
  {
    name: 'toLocaleUpperCase',
    desc: 'returns the string in uppercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleUpperCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleUpperCase(y) : x.toLocaleUpperCase() },
    hash: 'bd10c95fda0948ba7001898c219b8c36'
  },
  {
    name: 'replace',
    desc: 'returns a string with the first occurence of string y replaced by string z',
    sample: 'var a = ${x} replace ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replace(y, z) },
    hash: 'fbf76c944c4939f9e3974627fc00f735'
  },
  {
    name: 'replaceAll',
    desc: 'returns a string with all occurences of string y replaced by string z',
    sample: 'var a = ${x} replaceAll ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replaceAll(y, z) },
    hash: '907134df3b97bb1e910897ea1eadf3e1'
  },
  {
    name: 'substr',
    desc: 'extracts and returns part of a string, starting at index y for z number of characters - or to the end (if z is zero/omitted)',
    sample: 'var a = ${x} substr ${y} ${z}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.substr(y, z) : x.substr(y) },
    hash: 'fef9edc84f4e64e3ea51c35520be35d0'
  },
  {
    name: 'getIndex',
    desc: 'returns index y of a string or array x',
    sample: 'var a = ${x.$y}\nvar a = ${x} getIndex ${y}',
    call: function(v, x, y) { return v = x[y] },
    hash: 'bfa0e96fe5b06ab46e4476eef3c8db40'
  },
  {
    name: 'setIndex',
    desc: 'sets the index x of the given variable a to the value y',
    sample: 'var a.$x = ${y}\nvar a = setIndex ${x} ${y}',
    call: function(v, x, y) { v[x] = y; return v },
    hash: '3861dc71408315fc16d86b2cd17c756e'
  },
  {
    name: 'from',
    desc: 'converts and returns an array of the given string or object',
    sample: 'var a = from ${x}',
    call: function(v, x) { return v = Array.from(x) },
    hash: '4823b33284aeaec8e6561fe2d01a87c9'
  },
  {
    name: 'isArray',
    desc: 'returns true if the object is an array, and false if not',
    sample: 'var a = isArray ${x}',
    call: function(v, x) { return v = Array.isArray(x) },
    hash: '15bf99628e1a70a5e45eab6ee7a9a347'
  },
  {
    name: 'concatArray',
    desc: 'returns an array containing the elements of the two joined arrays',
    sample: 'var a = ${x} concatArray ${y}',
    call: function(v, x, y) { return v = x.concat(y) },
    hash: '990c860a6339a7368b6e907143d2b4ee'
  },
  {
    name: 'pop',
    desc: 'removes the last element of array x, and returns that element',
    sample: 'var a = ${x} pop',
    call: function(v, x) { return v = x.pop() },
    hash: '10563c95122e315415946f200c91da17'
  },
  {
    name: 'reverse',
    desc: 'reverses the order of elements in array x, and returns the resulting array',
    sample: 'var a = ${x} reverse',
    call: function(v, x) { return v = x.reverse() },
    hash: '33aeb59841563f66274c0f84480b84cc'
  },
  {
    name: 'shift',
    desc: 'removes the first element of array x, and returns that element',
    sample: 'var a = ${x} shift',
    call: function(v, x) { return v = x.shift() },
    hash: 'acf4319152666965bb3cacd0cae785d0'
  },
  {
    name: 'sort',
    desc: 'sorts the elements in array x alphabetically, and returns the resulting array',
    sample: 'var a = ${x} sort',
    call: function(v, x) { return v = x.sort() },
    hash: '2a9e913bcd4e220764ef32542b8c87c5'
  },
  {
    name: 'numericSort',
    desc: 'sorts the elements in array x numerically, and returns the resulting array',
    sample: 'var a = ${x} numericSort',
    call: function(v, x) { return v = x.sort((a, b) => parseInt(a) - parseInt(b)) },
    hash: '6feb4307bc8a5437d8ffcc2b0b06c0d6'
  },
  {
    name: 'join',
    desc: 'returns the array x as a combined string with values separated by an optional separator y, defaulting to comma',
    sample: 'var a = ${x} join ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.join(y) : x.join() },
    hash: '062ea1ba3d245d5a1c90f8225fbac640'
  },
  {
    name: 'slice',
    desc: 'returns elements between start index y and end index z of an array (or characters of a string), excluding the end (unless z is omitted)',
    sample: 'var a = ${x} slice ${y} ${z}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.slice(y, z) : x.slice(y) },
    hash: '5e15b7a05d455cd51609ea631c20dc96'
  },
  {
    name: 'insert',
    desc: 'inserts string/array x at index y of variable a',
    sample: 'var a = insert ${x} ${y}',
    call: function(v, x, y) { if(Array.isArray(v)) {if(Array.isArray(x)) {v.splice(y, 0, ...x)} else {v.splice(y, 0, x)} return v} else {return v.slice(0, y) + x + v.slice(y)} },
    hash: '624b69e71c90afc484dd3b4466aab04e'
  },
  {
    name: 'remove',
    desc: 'removes elements at index x from the string/array in variable a (optionally limited to only y elements)',
    sample: 'var a = remove ${x} ${y}',
    call: function(v, x, y) { if(Array.isArray(v)) {v.splice(x, y); return v} else {return v.slice(0, x) + v.slice(x + y)} },
    hash: '4632932beba1a57ef1c2ea9bd173afb2'
  },
  {
    name: 'push',
    desc: 'adds the given value as the last array element of the variable',
    sample: 'var a = push ${x}',
    call: function(v, x) { v.push(x); return v },
    hash: '11c7f56425dbaf85a09030bee0ec2bdc'
  },
  {
    name: 'unshift',
    desc: 'adds the given value as the first array element of the variable',
    sample: 'var a = unshift ${x}',
    call: function(v, x) { v.unshift(x); return v},
    hash: 'd565e04a7d3e82474733bd15c31a8c18'
  },
  {
    name: 'randInt',
    desc: 'returns a random integer inbetween (and including) two numbers',
    sample: 'var a = randInt ${x} ${y}',
    call: function(v, x, y) { return v = Math.floor((Math.random() * (y - x + 1)) + x) },
    hash: '72787b6f5fe702d456bde0048cfacd47'
  },
  {
    name: 'randRange',
    desc: 'returns a random integer inbetween two numbers but excluding the endpoint, optionally in z increments (defaults to 1)',
    sample: 'var a = randRange ${x} ${y} ${z}',
    call: function(v, x, y, z) { return v = Math.round(Math.floor((Math.random() * (y - x) / (z || 1))) * (z || 1) + x) },
    hash: '4758cba8f404cfe3ef0a300cebf3938a'
  }
];

export { compute_ops };
