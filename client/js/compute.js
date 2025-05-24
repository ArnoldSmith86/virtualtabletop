const compute_ops = [
  {
    name: '=',
    desc: 'sets the variable to the value of x',
    sample: 'var a = ${x}',
    call: function(v, x, y) { return y }, // for compatibility with SET
    hash: 'b9ab83320032c969adf0e79539f50e03'
  },
  {
    name: '+',
    desc: 'returns the sum of two numbers or add/join/concat two strings together',
    sample: 'var a = ${x} + ${y}',
    call: function(v, x, y) { return v = x + y },
    hash: '84794b272ab025d58749de0f6d7ece94'
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
    hash: 'd4ad8183c5188f81fc8d430defca9d0e'
  },
  {
    name: '<=',
    desc: 'returns true if x is less than or equal to y',
    sample: 'var a = ${x} <= ${y}',
    call: function(v, x, y) { return v = x <= y },
    hash: '284c0510133a812f36e542213bc5fc61'
  },
  {
    name: '==',
    desc: 'returns true if x is equal to y',
    sample: 'var a = ${x} == ${y}',
    call: function(v, x, y) { return v = x == y },
    hash: '561985b1912e056028a5c35b2f7990a4'
  },
  {
    name: '===',
    desc: 'returns true if x is equal to (and the same type as) y',
    sample: 'var a = ${x} === ${y}',
    call: function(v, x, y) { return v = x === y },
    hash: '97140073f55a1f0d3182fed1dd2b9970'
  },
  {
    name: '!=',
    desc: 'returns true if x is not equal to y',
    sample: 'var a = ${x} != ${y}',
    call: function(v, x, y) { return v = x != y },
    hash: '81070efc349ce8e6bfdbf234de6ef6cf'
  },
  {
    name: '!==',
    desc: 'returns true if x is not equal to (or not the same type as) y',
    sample: 'var a = ${x} !== ${y}',
    call: function(v, x, y) { return v = x !== y },
    hash: 'a8c612661009cd6cac9a2aede354c20b'
  },
  {
    name: '>=',
    desc: 'returns true if x is greater than or equal to y',
    sample: 'var a = ${x} >= ${y}',
    call: function(v, x, y) { return v = x >= y },
    hash: '69a9bd081178ecf5f421ede0a1d88aca'
  },
  {
    name: '>',
    desc: 'returns true if x is greater than y',
    sample: 'var a = ${x} > ${y}',
    call: function(v, x, y) { return v = x > y },
    hash: 'ee380ce87698b1a24e53d75a8ed92b10'
  },
  {
    name: '&&',
    desc: 'logical AND returns true if both x and y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} && ${y}',
    call: function(v, x, y) { return v = x && y },
    hash: 'b9b3a2b72e1e519806e9dbee51473892'
  },
  {
    name: '||',
    desc: 'logical OR returns true if either x or y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} || ${y}',
    call: function(v, x, y) { return v = x || y },
    hash: 'ca4952d521bec600994767d3ae57dae4'
  },
  {
    name: '!',
    desc: 'logical NOT returns true if the given value is false (or can be evaluated as false), otherwise returns false',
    sample: 'var a = ! ${x}',
    call: function(v, x) { return v = !x },
    hash: '37ef396c2dea7e87c19ffdea3f6b3289'
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
    call: function(v) { return v = rand() },
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
    hash: '400ec285019aff3bd7627c06ac0e3893'
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
    hash: '3bc30f2cb9d9c176389a66c678dc73c1'
  },
  {
    name: 'toUpperCase',
    desc: 'returns the string in uppercase letters',
    sample: 'var a = ${x} toUpperCase',
    call: function(v, x) { return v = x.toUpperCase() },
    hash: '6f25b159d1d1dba50dc3bf1718fa118d'
  },
  {
    name: 'trim',
    desc: 'returns the string after removing whitespace from both sides',
    sample: 'var a = ${x} trim',
    call: function(v, x) { return v = x.trim() },
    hash: 'f96e08fa742a89aab93426a21f6a929f'
  },
  {
    name: 'trimStart',
    desc: 'returns the string after removing whitespace from the beginning',
    sample: 'var a = ${x} trimStart',
    call: function(v, x) { return v = x.trimStart() },
    hash: 'bde1f13d149a4cb8fd93c39b7eb25c92'
  },
  {
    name: 'trimEnd',
    desc: 'returns the string after removing whitespace from the end',
    sample: 'var a = ${x} trimEnd',
    call: function(v, x) { return v = x.trimEnd() },
    hash: '758d2026e5d29b77a3ac3397b980ec20'
  },
  {
    name: 'charAt',
    desc: 'returns the nth character of a string x, with 0 being the first',
    sample: 'var a = ${x} charAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charAt(y) : x.charAt() },
    hash: 'd41cda03a6abc3b53e36508eeccb6da5'
  },
  {
    name: 'charCodeAt',
    desc: 'returns the Unicode of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} charCodeAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charCodeAt(y) : x.charCodeAt() },
    hash: '03509e71a2657542724bd9b1856b1100'
  },
  {
    name: 'codePointAt',
    desc: 'returns the UTF-16 code point value of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} codePointAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.codePointAt(y) : x.codePointAt() },
    hash: '964c15da9fb60f0acedc38f90c368fed'
  },
  {
    name: 'concat',
    desc: 'returns a string containing the text of the joined strings',
    sample: 'var a = ${x} concat ${y}',
    call: function(v, x, y) { return v = x.concat(y) },
    hash: 'c192f8fb5ac1acf2bc71ffa26292644e'
  },
  {
    name: 'endsWith',
    desc: 'returns true if a string x ends with a string y - case sensitive',
    sample: 'var a = ${x} endsWith ${y}',
    call: function(v, x, y) { return v = x.endsWith(y) },
    hash: '59637f7be17be4e12e579e58a125d076'
  },
  {
    name: 'indexOf',
    desc: 'returns the position of the first occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} indexOf ${y}',
    call: function(v, x, y) { return v = x.indexOf(y) },
    hash: '445d992a356bc012bdabbabeab705960'
  },
  {
    name: 'lastIndexOf',
    desc: 'returns the position of the last occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} lastIndexOf ${y}',
    call: function(v, x, y) { return v = x.lastIndexOf(y) },
    hash: '8325968782afd306147e759fc7b1af21'
  },
  {
    name: 'in',
    desc: 'returns true if string x is included in string/array y (or property x in object y) - case sensitive',
    sample: 'var a = ${x} in ${y}',
    call: function(v, x, y) { return v = Array.isArray(y) || typeof y == 'string' ? y.indexOf(x) != -1 : x in y },
    hash: 'a2fb5f062bbc0aad337b012e8293998e'
  },
  {
    name: 'includes',
    desc: 'returns true if string/array x includes value y (or object x includes property y) - case sensitive',
    sample: 'var a = ${x} includes ${y}',
    call: function(v, x, y) { return v = Array.isArray(x) || typeof x == 'string' ? x.indexOf(y) != -1 : y in x },
    hash: 'd2d453fe19128b8a1f1da45dff05bd06'
  },
  {
    name: 'localeCompare',
    desc: 'compares the sort order of two strings and returns -1 (x before y), 0 (x equals y) or 1 (x after y) - case sensitive',
    sample: 'var a = ${x} localeCompare ${y}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.localeCompare(y, z) : x.localeCompare(y, 'en')},
    hash: '6feb84d8a735309628da40c1fb8e59ca'
  },
  {
    name: 'match',
    desc: 'searches a string x for a match against a regular expression y (with optional flags z), and returns the match(es) as an array, or null if no match was found',
    sample: 'var a = ${x} match ${y} ${z}\nvar a = ${x} match \'[a-zA-Z0-9].*\' \'g\'',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.match(new RegExp(y, z != 1 ? z : '')) : x.match(new RegExp(y))  },
    hash: '08dc333f33fd3f91dc4decce4c6cc59d'
  },
  {
    name: 'padEnd',
    desc: 'returns a string x padded with spaces at the end (up to the specified total string length y)',
    sample: 'var a = ${x} padEnd ${y}',
    call: function(v, x, y) { return v = x.padEnd(y) },
    hash: '0581e1eebf1a093172f3fffadac84d7c'
  },
  {
    name: 'padStart',
    desc: 'returns a string x padded with spaces at the start (up to the specified total string length y)',
    sample: 'var a = ${x} padStart ${y}',
    call: function(v, x, y) { return v = x.padStart(y) },
    hash: 'da0661ad2124692638a2e7870ee91a3f'
  },
  {
    name: 'repeat',
    desc: 'returns a string containing y copies of the string x, joined together',
    sample: 'var a = ${x} repeat ${y}',
    call: function(v, x, y) { return v = x.repeat(y) },
    hash: 'f456cf164de2fd4e96203c9b87e2dc6a'
  },
  {
    name: 'search',
    desc: 'returns the position of the first match between the regular expression and the given string, or -1 if no match was found',
    sample: 'var a = ${x} search ${y}',
    call: function(v, x, y) { return v = x.search(y) },
    hash: '29714e9c955530d170e69142fbc762f4'
  },
  {
    name: 'split',
    desc: 'splits a string into substrings based on a separator y, and returns an array of the result',
    sample: 'var a = ${x} split ${y}',
    call: function(v, x, y) { return v = x.split(y) },
    hash: '1d1d57f985b14c89990b134e7ce4d998'
  },
  {
    name: 'startsWith',
    desc: 'returns true if a string x starts with a string y - case sensitive',
    sample: 'var a = ${x} startsWith ${y}',
    call: function(v, x, y) { return v = x.startsWith(y) },
    hash: '8148f499623e2e50f2fa7f6880010f65'
  },
  {
    name: 'toFixed',
    desc: 'returns a formatted number based on x, using the given amount y of digits, defaulting to 0 digits',
    sample: 'var a = ${x} toFixed ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toFixed(y) : x.toFixed() },
    hash: '232a011ae7beb89537b58b26acb1e816'
  },
  {
    name: 'toLocaleLowerCase',
    desc: 'returns the string x in lowercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleLowerCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleLowerCase(y) : x.toLocaleLowerCase() },
    hash: '9b35688e8515e9bdc972de129d498baf'
  },
  {
    name: 'toLocaleUpperCase',
    desc: 'returns the string in uppercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleUpperCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleUpperCase(y) : x.toLocaleUpperCase() },
    hash: '9cc5bd53700f6de17453ee6574238252'
  },
  {
    name: 'replace',
    desc: 'returns a string with the first occurence of string y replaced by string z',
    sample: 'var a = ${x} replace ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replace(y, z) },
    hash: 'f6b5f999d592659b9b5357b1b64a6ad4'
  },
  {
    name: 'replaceAll',
    desc: 'returns a string with all occurences of string y replaced by string z',
    sample: 'var a = ${x} replaceAll ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replaceAll(y, z) },
    hash: '0a81a812d5f248ffc762203ae3c385a1'
  },
  {
    name: 'substr',
    desc: 'extracts and returns part of a string, starting at index y for z number of characters - or to the end (if z is zero/omitted)',
    sample: 'var a = ${x} substr ${y} ${z}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.substr(y, z) : x.substr(y) },
    hash: 'ef62a82b006b417c0bb6b970aa24c215'
  },
  {
    name: 'jsonParse',
    desc: 'parses a JSON string',
    sample: 'var a = jsonParse ${x}',
    call: function(v, x, y, z) { return v = JSON.parse(x) },
    hash: '3e11e14212173cd56ec8b69f83576631'
  },
  {
    name: 'jsonStringify',
    desc: 'turns any type of variable into a JSON string',
    sample: 'var a = jsonStringify ${x}',
    call: function(v, x, y, z) { return v = JSON.stringify(x) },
    hash: '35f5463c508a58eeaff4deccc25a33c7'
  },
  {
    name: 'getIndex',
    desc: 'returns index y of a string or array x',
    sample: 'var a = ${x.$y}\nvar a = ${x} getIndex ${y}',
    call: function(v, x, y) { return v = x[y] },
    hash: '6d0bc71948f339cb361773e38f19d7a2'
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
    hash: '4b35f2d6fb3ea6c60605ce87f3674ec5'
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
    hash: '7acf4a9a8b169fdb706692a27c8b8603'
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
    desc: 'sorts the number elements in array x numerically, and returns the resulting array',
    sample: 'var a = ${x} numericSort',
    call: function(v, x) { return v = x.sort((a, b) => a - b)},
    hash: '1a6e301d6510998fa27abeb75bcf0371'
  },
  {
    name: 'numericStringSort',
    desc: 'sorts the string and number elements in array x numerically, and returns the resulting array',
    sample: 'var a = ${x} numericSort',
    call: function(v, x) { return v = x.sort((a, b) => a.toString().localeCompare(b, 'en', {numeric: true, ignorePunctuation: true})) },
    hash: '080058deb4a93b597eef9b5db479ba31'
  },
  {
    name: 'shuffle',
    desc: 'shuffles the elements in array (or string) x, and returns the resulting array (or string)',
    sample: 'var a = shuffle ${x}',
    call: function(v, x) { return v = shuffleArray(x) },
    hash: '0f1f81e18571c2b22e227c988a37b189'
  },
  {
    name: 'sum',
    desc: 'calculates the sum of the elements of an array',
    sample: 'var a = sum ${x}',
    call: function(v, x) { return v = x.reduce((partialSum, a) => partialSum + a, 0) },
    hash: '5d35252c8e9878db26ba1f5f0cc2093a'
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
    hash: 'f9c5e98a2398113fed7da2f55e3ad6b7'
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
    call: function(v, x, y) { return v = Math.floor((rand() * (y - x + 1)) + x) },
    hash: '9b07533fb8ae4903272900ea6fbb94d8'
  },
  {
    name: 'randRange',
    desc: 'returns a random integer inbetween two numbers but excluding the endpoint, optionally in z increments (defaults to 1)',
    sample: 'var a = randRange ${x} ${y} ${z}',
    call: function(v, x, y, z) { return v = Math.round(Math.floor((rand() * (y - x) / (z || 1))) * (z || 1) + x) },
    hash: '5a75b342f9b9a0c11c2a8d0b6ea9e37d'
  },
  {
    name: 'colorContrast',
    desc: 'converts x color in any format that the browser can interpret to another color in the same hue but with different luminance, with optional y direction and intensity (-1 to 1, defaults to 1)',
    sample: 'var a = colorContrast ${x} ${y}',
    call: function(v, x, y) { return v = contrastAnyColor(x, y); },
    hash: '83181e89c7f0245a49644ce864625481'
  },
  {
    name: 'colorToHex',
    desc: 'converts x color in any format that the browser can interpret to hex',
    sample: 'var a = colorToHex ${x}',
    call: function(v, x) { return v = toHex(x); },
    hash: '2eff46ec1af852a29fa4c14dcf685c00'
  },
  {
    name: 'colorToRGB',
    desc: 'converts x color in any format that the browser can interpret to RGB in format rgb(0,9,210)',
    sample: 'var a = colorToRGB ${x}',
    call: function(v, x) { return v = toRGBString(x); },
    hash: 'faa247cc277b7e9ad645e55a51e47195'
  },
  {
    name: 'colorContrastRatio',
    desc: 'compares x and y colors in any format that the broswer can interpret to obtain the contrast ratio in range 1-21',
    sample: 'var a = colorContrastRatio ${x} ${y}',
    call: function(v, x, y) { return v = calcContrast(x, y); },
    hash: 'f0c87b733f49b7af419698cdf6ed1137'
  },
  {
    name: 'colorLuminance',
    desc: 'accepts x color in any format the browser can interpret and returns the luminance value in range 0 to 1',
    sample: 'var a = colorLuminance ${x}',
    call: function(v, x) { return v = calcLuminance(x); },
    hash: 'f4284956510e3fe59c2babed665b544d'
  },
  {
    name: 'colorCreateHue',
    desc: 'returns a semi-random hex color using linear interpolation which will be as visually distinct as possible from active player colors, or optionally from [x] array of colors',
    sample: 'var a = colorCreateHue',
    call: function(v, x) { return v = randomHue(x); },
    hash: '29a04e79e53168e3680ee1483a451f4e'
  },
  {
    name: 'fetch',
    desc: 'downloads a given URL and returns its content as a string',
    sample: 'var a = fetch ${x}',
    call: async function(v, x, y) { return v = await ((typeof y === 'object' && y !== null) ? await fetch(x, y) : await fetch(x)).text() },
    hash: 'e1aebce1c5225dc5f624f3ccb3ff104d'
  }
];

export { compute_ops };
