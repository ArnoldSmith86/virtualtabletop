const compute_ops = [
  {
    name: '=',
    desc: 'sets the variable to the value of x',
    sample: 'var a = ${x}',
    call: function(v, x, y) { return y } // for compatibility with SET
  },
  {
    name: '+',
    desc: 'returns the sum of two numbers or add/join/concat two strings together',
    sample: 'var a = ${x} + ${y}',
    call: function(v, x, y) { return v = x + y }
  },
  {
    name: '-',
    desc: 'returns the difference of two numbers (subtract y from x)',
    sample: 'var a = ${x} - ${y}',
    call: function(v, x, y) { return v = x - y }
  },
  {
    name: '*',
    desc: 'returns the product of two numbers (multiply x and y)',
    sample: 'var a = ${x} * ${y}',
    call: function(v, x, y) { return v = x * y }
  },
  {
    name: '**',
    desc: 'returns the result of raising x to the power of y (exponent)',
    sample: 'var a = ${x} ** ${y}',
    call: function(v, x, y) { return v = x ** y }
  },
  {
    name: '/',
    desc: 'returns the division of two numbers (divide x by y)',
    sample: 'var a = ${x} / ${y}',
    call: function(v, x, y) { return v = x / y }
  },
  {
    name: '%',
    desc: 'returns the integer remainder/rest/modal of the division of two numbers',
    sample: 'var a = ${x} % ${y}',
    call: function(v, x, y) { return v = x % y }
  },
  {
    name: '<',
    desc: 'returns true if x is less than y',
    sample: 'var a = ${x} < ${y}',
    call: function(v, x, y) { return v = x < y }
  },
  {
    name: '<=',
    desc: 'returns true if x is less than or equal to y',
    sample: 'var a = ${x} <= ${y}',
    call: function(v, x, y) { return v = x <= y }
  },
  {
    name: '==',
    desc: 'returns true if x is equal to y',
    sample: 'var a = ${x} == ${y}',
    call: function(v, x, y) { return v = x == y }
  },
  {
    name: '!=',
    desc: 'returns true if x is not equal to y',
    sample: 'var a = ${x} != ${y}',
    call: function(v, x, y) { return v = x != y }
  },
  {
    name: '>=',
    desc: 'returns true if x is greater than or equal to y',
    sample: 'var a = ${x} >= ${y}',
    call: function(v, x, y) { return v = x >= y }
  },
  {
    name: '>',
    desc: 'returns true if x is greater than y',
    sample: 'var a = ${x} > ${y}',
    call: function(v, x, y) { return v = x > y }
  },
  {
    name: '&&',
    desc: 'logical AND returns true if both x and y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} >= ${y}',
    call: function(v, x, y) { return v = x && y }
  },
  {
    name: '||',
    desc: 'logical OR returns true if either x or y are true or returns the value of x or y if they are not boolean values',
    sample: 'var a = ${x} >= ${y}',
    call: function(v, x, y) { return v = x || y }
  },
  {
    name: '!',
    desc: 'logical NOT returns true if the given value is false (or can be evaluated as false), otherwise returns false',
    sample: 'var a = ! ${x}',
    call: function(v, x) { return v = !x }
  },
  {
    name: 'hypot',
    desc: 'returns the square root of the sum of squares (hypotenuse) - a second number y is optional',
    sample: 'var a = hypot ${x} ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? Math.hypot(x, y) : Math.hypot(x) }
  },
  {
    name: 'max',
    desc: 'returns the larger/higher of two numbers',
    sample: 'var a = max ${x} ${y}',
    call: function(v, x, y) { return v = Math.max(x, y) }
  },
  {
    name: 'min',
    desc: 'returns the smaller/lower of two numbers',
    sample: 'var a = min ${x} ${y}',
    call: function(v, x, y) { return v = Math.min(x, y) }
  },
  {
    name: 'pow',
    desc: 'returns the base to the exponent power (x to y)',
    sample: 'var a = pow ${x} ${y}',
    call: function(v, x, y) { return v = Math.pow(x, y) }
  },
  {
    name: 'sin',
    desc: 'returns the sine of a number (in degrees)',
    sample: 'var a = sin ${x}',
    call: function(v, x) { return v = Math.sin(x * Math.PI/180) }
  },
  {
    name: 'cos',
    desc: 'returns the cosine of a number (in degrees)',
    sample: 'var a = cos ${x}',
    call: function(v, x) { return v = Math.cos(x * Math.PI/180) }
  },
  {
  name: 'tan',
    desc: 'returns the tangent of a number (in degrees)',
    sample: 'var a = tan ${x}',
    call: function(v, x) { return v = Math.tan(x * Math.PI/180) }
  },
  {
    name: 'asin',
    desc: 'returns the arcsine (in degrees) of a number',
    sample: 'var a = asin ${x}',
    call: function(v, x) { return v = Math.asin(x) / Math.PI*180 }
  },
  {
    name: 'acos',
    desc: 'returns the arccosine (in degrees) of a number',
    sample: 'var a = cos ${x}',
    call: function(v, x) { return v = Math.acos(x) / Math.PI*180 }
  },
  {
    name: 'atan',
    desc: 'returns the arctangent (in degrees) of a number',
    sample: 'var a = atan ${x}',
    call: function(v, x) { return v = Math.atan(x) / Math.PI*180 }
  },
  {
    name: 'atan2',
    desc: 'returns the arctangent (in degrees) between the positive X axis and the point (y, x)',
    sample: 'var a = atan2 ${y} ${x} // y comes before x',
    call: function(v, y, x) { return v = Math.atan2(y, x) / Math.PI*180 }
  },
  {
    name: 'abs',
    desc: 'returns the absolute value of a number',
    sample: 'var a = abs ${x}',
    call: function(v, x) { return v = Math.abs(x) }
  },
  {
    name: 'cbrt',
    desc: 'returns the cube root of a number',
    sample: 'var a = cbrt ${x}',
    call: function(v, x) { return v = Math.cbrt(x) }
  },
  {
    name: 'ceil',
    desc: 'returns the number rounded up to the next largest integer',
    sample: 'var a = ceil ${x}',
    call: function(v, x) { return v = Math.ceil(x) }
  },
  {
    name: 'exp',
    desc: 'returns Ex, where x is the argument and E is Euler\'s constant',
    sample: 'var a = exp ${x}',
    call: function(v, x) { return v = Math.exp(x) }
  },
  {
    name: 'floor',
    desc: 'returns the number rounded down to the largest integer less than or equal to a given number',
    sample: 'var a = floor ${x}',
    call: function(v, x) { return v = Math.floor(x) }
  },
  {
    name: 'log',
    desc: 'returns the natural logarithm (base e) of a number',
    sample: 'var a = log ${x}',
    call: function(v, x) { return v = Math.log(x) }
  },
  {
    name: 'log10',
    desc: ' returns the base 10 logarithm of a number',
    sample: 'var a = log10 ${x}',
    call: function(v, x) { return v = Math.log10(x) }
  },
  {
    name: 'log2',
    desc: 'returns the base 2 logarithm of a number',
    sample: 'var a = log2 ${x}',
    call: function(v, x) { return v = Math.log2(x) }
  },
  {
    name: 'random',
    desc: 'returns a decimal number in the range 0 to less than 1',
    sample: 'var a = random',
    call: function(v) { return v = Math.random() }
  },
  {
    name: 'round',
    desc: 'returns the value of a number rounded to the nearest integer',
    sample: 'var a = round ${x}',
    call: function(v, x) { return v = Math.round(x) }
  },
  {
    name: 'sign',
    desc: 'returns 1 or -1, indicating the sign of a number (or 0 if the number is 0)',
    sample: 'var a = sign ${x}',
    call: function(v, x) { return v = Math.sign(x) }
  },
  {
    name: 'sqrt',
    desc: 'returns the positive square root of a number',
    sample: 'var a = sqrt ${x}',
    call: function(v, x) { return v = Math.sqrt(x) }
  },
  {
    name: 'trunc',
    desc: 'returns the integer part of a number by removing any fractions',
    sample: 'var a = trunc ${x}',
    call: function(v, x) { return v = Math.trunc(x) }
  },
  {
    name: 'E',
    desc: 'represents Euler\'s number, the base of natural logarithms (approx. 2.718)',
    sample: 'var a = E',
    call: function(v) { return v = Math.E }
  },
  {
    name: 'LN2',
    desc: 'represents the natural logarithm of 2 (approx. 0.693)',
    sample: 'var a = LN2',
    call: function(v) { return v = Math.LN2 }
  },
  {
    name: 'LN10',
    desc: 'represents the natural logarithm of 10 (approx. 2.303)',
    sample: 'var a = LN10',
    call: function(v) { return v = Math.LN10 }
  },
  {
    name: 'LOG2E',
    desc: 'represents the base 2 logarithm of e (approx. 1.443)',
    sample: 'var a = LOG2E',
    call: function(v) { return v = Math.LOG2E }
  },
  {
    name: 'LOG10E',
    desc: 'represents the base 10 logarithm of e (approx. 0.434)',
    sample: 'var a = LOG10E',
    call: function(v) { return v = Math.LOG10E }
  },
  {
    name: 'PI',
    desc: 'represents the ratio of the circumference of a circle to its diameter (approx. 3.141)',
    sample: 'var a = PI',
    call: function(v) { return v = Math.PI }
  },
  {
    name: 'SQRT1_2',
    desc: 'represents the square root of 1/2 (approx. 0.707)',
    sample: 'var a = SQRT1_2',
    call: function(v) { return v = Math.SQRT1_2 }
  },
  {
    name: 'SQRT2',
    desc: 'represents the square root of 2 (approx. 1.414)',
    sample: 'var a = SQRT2',
    call: function(v) { return v = Math.SQRT2 }
  },
  {
    name: 'length',
    desc: 'returns the length of an array',
    sample: 'var a = ${x} length',
    call: function(v, x) { return v = x.length }
  },
  {
    name: 'parseFloat',
    desc: 'returns a floating point number parsed from the given string',
    sample: 'var a = parseFloat x',
    call: function(v, x) { return v = parseFloat(x) }
  },
  {
    name: 'toLowerCase',
    desc: 'returns the string in lowercase letters',
    sample: 'var a = ${x} toLowerCase',
    call: function(v, x) { return v = x.toLowerCase() }
  },
  {
    name: 'toUpperCase',
    desc: 'returns the string in uppercase letters',
    sample: 'var a = ${x} toUpperCase',
    call: function(v, x) { return v = x.toUpperCase() }
  },
  {
    name: 'trim',
    desc: 'returns the string after removing whitespace from both sides',
    sample: 'var a = ${x} trim',
    call: function(v, x) { return v = x.trim() }
  },
  {
    name: 'trimStart',
    desc: 'returns the string after removing whitespace from the beginning',
    sample: 'var a = ${x} trimStart',
    call: function(v, x) { return v = x.trimStart() }
  },
  {
    name: 'trimEnd',
    desc: 'returns the string after removing whitespace from the end',
    sample: 'var a = ${x} trimEnd',
    call: function(v, x) { return v = x.trimEnd() }
  },
  {
    name: 'charAt',
    desc: 'returns the nth character of a string x, with 0 being the first',
    sample: 'var a = ${x} charAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charAt(y) : x.charAt() }
  },
  {
    name: 'charCodeAt',
    desc: 'returns the Unicode of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} charCodeAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.charCodeAt(y) : x.charCodeAt() }
  },
  {
    name: 'codePointAt',
    desc: 'returns the UTF-16 code point value of the nth character in a string x, with 0 being the first',
    sample: 'var a = ${x} codePointAt ${n}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.codePointAt(y) : x.codePointAt() }
  },
  {
    name: 'concat',
    desc: 'returns a string containing the text of the joined strings',
    sample: 'var a = ${x} concat ${y}',
    call: function(v, x, y) { return v = x.concat(y) }
  },
  {
    name: 'includes',
    desc: 'returns true if a string x contains a string y - case sensitive',
    sample: 'var a = ${x} includes ${y}',
    call: function(v, x, y) { return v = x.includes(y) }
  },
  {
    name: 'endsWith',
    desc: 'returns true if a string x ends with a string y - case sensitive',
    sample: 'var a = ${x} endsWith ${y}',
    call: function(v, x, y) { return v = x.endsWith(y) }
  },
  {
    name: 'indexOf',
    desc: 'returns the position of the first occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} indexOf ${y}',
    call: function(v, x, y) { return v = x.indexOf(y) }
  },
  {
    name: 'lastIndexOf',
    desc: 'returns the position of the last occurrence of a string y in string x, or -1 if not found - case sensitive',
    sample: 'var a = ${x} lastIndexOf ${y}',
    call: function(v, x, y) { return v = x.lastIndexOf(y) }
  },
  {
    name: 'in',
    desc: 'returns true if the string x is included in array y (or property x in object y) - case sensitive',
    sample: 'var a = ${x} in ${y}',
    call: function(v, x, y) { return v = Array.isArray(y) ? y.indexOf(x) != -1 : x in y }
  },
  {
    name: 'localeCompare',
    desc: 'compares the sort order of two strings and returns -1 (x before y), 0 (x equals y) or 1 (x after y) - case sensitive',
    sample: 'var a = ${x} localeCompare ${y}',
    call: function(v, x, y) { return v = x.localeCompare(y) }
  },
  {
    name: 'match',
    desc: 'searches a string x for a match against a regular expression y (with optional flags z), and returns the match(es) as an array, or null if no match was found',
    sample: 'var a = ${x} match ${y} ${z}\nvar a = ${x} match \'[a-zA-Z0-9].*\' \'g\'',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.match(new RegExp(y, z != 1 ? z : '')) : x.match(new RegExp(y))  }
  },
  {
    name: 'padEnd',
    desc: 'returns a string x padded with spaces at the end (up to the specified total string length y)',
    sample: 'var a = ${x} padEnd ${y}',
    call: function(v, x, y) { return v = x.padEnd(y) }
  },
  {
    name: 'padStart',
    desc: 'returns a string x padded with spaces at the start (up to the specified total string length y)',
    sample: 'var a = ${x} padStart ${y}',
    call: function(v, x, y) { return v = x.padStart(y) }
  },
  {
    name: 'repeat',
    desc: 'returns a string containing y copies of the string x, joined together',
    sample: 'var a = ${x} repeat ${y}',
    call: function(v, x, y) { return v = x.repeat(y) }
  },
  {
    name: 'search',
    desc: 'returns the position of the first match between the regular expression and the given string, or -1 if no match was found',
    sample: 'var a = ${x} search ${y}',
    call: function(v, x, y) { return v = x.search(y) }
  },
  {
    name: 'split',
    desc: 'splits a string into substrings based on a separator y, and returns an array of the result',
    sample: 'var a = ${x} split ${y}',
    call: function(v, x, y) { return v = x.split(y) }
  },
  {
    name: 'startsWith',
    desc: 'returns true if a string x starts with a string y - case sensitive',
    sample: 'var a = ${x} startsWith ${y}',
    call: function(v, x, y) { return v = x.startsWith(y) }
  },
  {
    name: 'toFixed',
    desc: 'returns a formatted number based on x, using the given amount y of digits, defaulting to 0 digits',
    sample: 'var a = ${x} toFixed ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toFixed(y) : x.toFixed() }
  },
  {
    name: 'toLocaleLowerCase',
    desc: 'returns the string x in lowercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleLowerCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleLowerCase(y) : x.toLocaleLowerCase() }
  },
  {
    name: 'toLocaleUpperCase',
    desc: 'returns the string in uppercase letters, optionally according to current locale y',
    sample: 'var a = ${x} toLocaleUpperCase ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.toLocaleUpperCase(y) : x.toLocaleUpperCase() }
  },
  {
    name: 'replace',
    desc: 'returns a string with the first occurence of string y replaced by string z',
    sample: 'var a = ${x} replace ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replace(y, z) }
  },
  {
    name: 'replaceAll',
    desc: 'returns a string with all occurences of string y replaced by string z',
    sample: 'var a = ${x} replaceAll ${y} ${z}',
    call: function(v, x, y, z) { return v = x.replaceAll(y, z) }
  },
  {
    name: 'substr',
    desc: 'extracts and returns part of a string, starting at index y for z number of characters - or to the end (if z is zero/omitted)',
    sample: 'var a = ${x} substr ${y} ${z}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.substr(y, z) : x.substr(y) }
  },
  {
    name: 'getIndex',
    desc: 'returns index y of a string or array x',
    sample: 'var a = ${x.$y}\nvar a = ${x} getIndex ${y}',
    call: function(v, x, y) { return v = x[y] }
  },
  {
    name: 'setIndex',
    desc: 'sets the index x of the given variable a to the value y',
    sample: 'var a.$x = ${y}\nvar a = setIndex ${x} ${y}',
    call: function(v, x, y) { v[x] = y; return v }
  },
  {
    name: 'from',
    desc: 'converts and returns an array of the given string or object',
    sample: 'var a = from ${x}',
    call: function(v, x) { return v = Array.from(x) }
  },
  {
    name: 'isArray',
    desc: 'returns true if the object is an array, and false if not',
    sample: 'var a = isArray ${x}',
    call: function(v, x) { return v = Array.isArray(x) }
  },
  {
    name: 'concatArray',
    desc: 'returns an array containing the elements of the two joined arrays',
    sample: 'var a = ${x} concatArray ${y}',
    call: function(v, x, y) { return v = x.concat(y) }
  },
  {
    name: 'pop',
    desc: 'removes the last element of array x, and returns that element',
    sample: 'var a = ${x} pop',
    call: function(v, x) { return v = x.pop() }
  },
  {
    name: 'reverse',
    desc: 'reverses the order of elements in array x, and returns the resulting array',
    sample: 'var a = ${x} reverse',
    call: function(v, x) { return v = x.reverse() }
  },
  {
    name: 'shift',
    desc: 'removes the first element of array x, and returns that element',
    sample: 'var a = ${x} shift',
    call: function(v, x) { return v = x.shift() }
  },
  {
    name: 'sort',
    desc: 'sorts the elements in array x alphabetically, and returns the resulting array',
    sample: 'var a = ${x} sort',
    call: function(v, x) { return v = x.sort() }
  },
  {
    name: 'numericSort',
    desc: 'sorts the elements in array x numerically, and returns the resulting array',
    sample: 'var a = ${x} numericSort',
    call: function(v, x) { return v = x.sort((a, b) => a.toString().localeCompare(b, undefined, {numeric: true, ignorePunctuation: true})) }
  },
  {
    name: 'findIndex',
    desc: '(deprecated, do not use!)',
    sample: 'var a = ${x} findIndex ${y}',
    call: function(v, x, y) { return v = x.findIndex(y) }
  },
  {
    name: 'join',
    desc: 'returns the array x as a combined string with values separated by an optional separator y, defaulting to comma',
    sample: 'var a = ${x} join ${y}',
    call: function(v, x, y) { return v = (y !== undefined) ? x.join(y) : x.join() }
  },
  {
    name: 'slice',
    desc: 'returns elements between start index y and end index z of an array (or characters of a string), excluding the end (unless z is omitted)',
    sample: 'var a = ${x} slice ${y} ${z}',
    call: function(v, x, y, z) { return v = (z !== undefined) ? x.slice(y, z) : x.slice(y) }
  },
  {
    name: 'splice',
    desc: 'removes elements starting from index x from the array in variable a (optionally limited to only y elements)',
    sample: 'var a = splice ${x} ${y}',
    call: function(v, x, y) { if(y !== undefined) {v.splice(x, y)} else {v.splice(x)}; return v }
  },
  {
    name: 'push',
    desc: 'adds the given value as the last array element of the variable',
    sample: 'var a = push ${x}',
    call: function(v, x) { v.push(x); return v }
  },
  {
    name: 'unshift',
    desc: 'adds the given value as the first array element of the variable',
    sample: 'var a = unshift ${x}',
    call: function(v, x) { v.unshift(x); return v}
  },
  {
    name: 'randInt',
    desc: 'returns a random integer inbetween (and including) two numbers',
    sample: 'var a = randInt ${x} ${y}',
    call: function(v, x, y) { return v = Math.floor((Math.random() * (y - x + 1)) + x) }
  },
  {
    name: 'randRange',
    desc: 'returns a random integer inbetween two numbers but excluding the endpoint, optionally in z increments (defaults to 1)',
    sample: 'var a = randRange ${x} ${y} ${z}',
    call: function(v, x, y, z) { return v = Math.round(Math.floor((Math.random() * (y - x) / (z || 1))) * (z || 1) + x) }
  }
]
