/*****************************************************************************/
/****** uses 'peggy' parser generator, https://github.com/peggyjs/peggy ******/
/****** Required copyright notice at bottom of file                     ******/
/*****************************************************************************/

{{

    /* Set to true to get parse information on console */
    const debug = false;
    
    const toNum = (s, defaultValue)=>
             s!=null ? (typeof s == 'string' && s.match(/^[-+]?[0-9]+(\.[0-9]+)?$/) ? +s : s)
               : defaultValue;

    function computeValue(computeFunction, head, tail) {
      if (debug)
        console.log("computeValue: ", head, ", ",tail);
      const defaultValue = tail.length==0 ? null: 1
      return tail.reduce(
        function(result, element) {
          let x;
          return computeFunction( element[1], x, toNum(result,defaultValue), toNum(element[3],defaultValue) );
        },
        head)
    }

    const noNull = s=>(s != null) ? toNum(s) : 1;
    
    function computeSpecial( computeFunction, op, p1, p2, p3 ) {
      if (debug)
        console.log("computeSpecial: op: ", op, ", p1: ", p1, ", p2: ", p2, ", p3: ",p3 );
      let x;
      return computeFunction( op, x, toNum(p1,1), toNum(p2,1),toNum(p3,1) )
    }
}}

{
    function compute( head, tail ) {
      return computeValue( options.compute, head, tail );
    }
    
    const comment = input.indexOf('//');
    if (comment != -1) 
      input = input.slice(0, comment)
    if (debug)
      console.log("**",input,"**");
}

// Accept state
Dynamic "Dynamic"
  = Special / General

// General case for "var foo = ..."
General "general"
  = var lhs:Target eq val:Expression _
      {
        if (debug)
          console.log("General Expression: ", "lhs: ", lhs, "val: ", val);
        const tgt = lhs[0];
        const idx = lhs[1];
        if (idx)  {
          if (!options.variables[tgt]) 
             error(`Variable ${tgt} not defined.`);
          options.variables[tgt][idx]=val; 
        } else
          options.variables[tgt]=val;
        
        return val!==undefined ? val : null
      } /
    // Unrecognized input (treated as comment)
    .*
      {
        if (debug)
          console.log("comment");
        return "Comment"
      }

// Special case for these four functions because of different syntax
Special "special"
  = op:SpecialFunction _ "(" _ id:Target comma p1:Parameter p2:(comma Parameter)? _ ")" _
      {
        if (debug)
          console.log("Special Function: ");
        const tgt = id[0];
        const idx = id[1];
        const second = p2 ? p2[1]: null;
        if (idx) {
          if (!options.variables[tgt]) 
             error(`Variable ${tgt} not defined.`);

          options.variables[tgt][idx] =
            options.compute(op, options.variables[tgt][idx], toNum(p1), toNum(second) );
        } else
          options.variables[tgt] =
            options.compute(op, options.variables[tgt], toNum(p1), toNum(second) );

        return idx? options.variables[tgt][idx] : options.variables[tgt]
      }

Target "assignment target"
  = tgt:VariableId idx:("." IndexId)?
      {
        if (debug)
          console.log(`tgt: ${tgt}, idx: ${idx}`);
        if (idx)
          return [tgt, idx[1]]
        else
          return [tgt, null]
      }
      
VariableId
  = $Identifier /
    "$" vbl:Identifier
        {
          const result = options.variables[vbl];
          return result !== undefined ? result : null;
        }

IndexId
  = $Integer /
    "$" idx:Identifier
        {
          const result = options.variables[idx];
          return result !== undefined ? result : 1;
        }

/*************************************************************/
/****** Expression parsing based on operator precedence ******/
/*************************************************************/
Expression "Expression"
  = head:Prio5 tail:(_ "||" _ Prio5)*
    {
      if (debug)
        console.log("Expression");
      return compute( head, tail );
    }

Prio5 "Priority 5"
  = head:Prio9 tail:(_ "&&" _ Prio9)*
    {
      return compute( head, tail );
    }

Prio9 "Priority9"
  = head:Prio10 tail:(_ ("!==" / "===" / "!=" / "==") _ Prio10)*
    {
      return compute( head, tail );
    }

Prio10 "Priority10"
  = head:Prio12 tail:(_ ("<=" / ">=" / "<" / ">" / "includes" / "in") _ Prio12)*
    {
      if (debug)
        console.log("Prio 10 ",tail);
      return compute( head, tail );
    }

Prio12 "Priority12"
  = head:Prio13 tail:(_ ("+" / "-" / "concat") _ Prio13)*
    {
      if (debug)
        console.log("Prio 12 ", head, tail);
      return compute( head, tail );
    }

Prio13 "Priority 13"
  = head:Prio14 tail:(_ ("*" / "/" / "%") _ Prio14)*
    {
      return compute( head, tail );
    }

Prio14 "Priority 14"
  = head:Prio15 tail:(_ ("**") _ Prio15)*
    {
      return compute( head, tail );
    }

Prio15 "Priority 15"
  = op:("+" / "-")? _ tail:Factor
    {
      if (debug)
        console.log("Prio 15: ", tail);
      if(op)
        return toNum(tail, null) * (op=="-" ? -1: 1)
      else
        return toNum(tail, null)
    }

Factor
  = "(" _ @Expression _ ")" /
    noparams:
      ("random" / "E" / "LN2" / "LN10" / "LOG2E" / "LOG10E" / "PI" / "SQRT1_2" / "SQRT2")
        {
          if (debug)
            console.log(noparams);
          let x; return options.compute(noparams, x)
        } /
    Parameter /
    Identifier {return null}

Parameter 
  = "null" {return null} /
    "true" {return true} /
    "false" {return false } /
    "[]" {return []} /
    "{}" {return {}} /
    op:BIF lpar p1:Parameter _ p2:(comma Parameter)? _ p3:(comma Parameter)? rpar
      {
        let x;
        return options.compute( op, x, toNum(p1), toNum(p2 ? p2[1]:null), toNum(p3 ? p3[1]:null) )
      } /
    Number /
    Variable /
    String

/*********************/
/****** Lexical ******/
/*********************/
Identifier "identifier"
  = $(idchar+)
    {
      if (debug)
        console.log("Identifier: ",text());
      return text()
    }

idchar = [a-zA-Z0-9_-] / unicode

unicode = u:("\\u" [0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])
    { return u.join("").replace(/\\u([0-9a-fA-F]{4})/g, function(m, c) {
        return String.fromCharCode(parseInt(c, 16));
      });
    }

String 
  = "\'" val:(([ !#-&(-[\]-~] / unicode)*) "\'" 
      {
        if (debug)
          console.log("String ", val.join(""));
        return val.join("")
      }

Number "number"
  = Float / Integer

Integer "integer"
  = "-"? ("0" / [1-9][0-9]*) { return toNum(text()) }

Float "float"
  = "-"? ("0" / [1-9][0-9]*) "." [0-9]+
    {
      if (debug)
        console.log("Float: ", text());
      return toNum( text() )
    }

Variable
  = xlate:$("${" [^}]+ "}")
    {
      const result = options.evaluateVariables(xlate);
      return result !== undefined ? result : null;
    }

Reserved = BIF / SpecialFunction

BIF
  = "sin" / "cos" / "tan" / "asin" / "acos" / "atan" / "abs" / "cbrt" / "ceil" /
    "exp" / "floor" / "getIndex" / "setIndex" / "log" / "log10" / "log2" / "round" /
    "sign" / "sqrt" / "trunc" / "length" / "parseFloat" / "toLowerCase" / "toUpperCase" /
    "trim" / "trimStart" / "trimEnd" / "from" / "isArray" / "pop" / "reverse" / "sort" /
    "hypot" / "max" / "min" / "pow" / "atan2" / "charAt" / "charCodeAt" / "codePointAt" /
    "endsWith" / "indexOf" / "lastIndexOf" / "search" / "split" / "startsWith" /
    "toFixed" / "toLocaleLowerCase" / "toLocaleUpperCase" / "join" / 
    "randInt" / "localeCompare" / "padEnd" / "padStart" / "repeat" /
    "match" / "replace" / "replaceAll" / "substr" / "slice" / "pop" /
    "randRange" / "concatArray" / "shift" / "numericSort"

SpecialFunction
  = "push" / "unshift" / "remove" / "insert" / "setIndex"
  
_ "whitespace"
  = [ \t]*

var "var"
  = _ "var " _

eq "equals"
  = _ "=" _

lpar
  = _ "(" _

rpar
  = _ ")" _

comma
  = _ "," _
  
/********************************
  MIT License

  Copyright (c) 2010-2021 The Peggy AUTHORS

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
**********************************/