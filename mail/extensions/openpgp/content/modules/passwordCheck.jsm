/*jshint -W097 */
/*
  Taken from jquery.complexify (WTFPL 2.0)
*/

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailPasswordCheck"];

var EnigmailPasswordCheck = {
  /**
   *  Check password quality
   *
   *  password: String: the password to evaluate
   *
   *  return: object: valid:   Boolean - is password valid or not
   *                  complexity: Number  - complexity of password (values between 0 and 100)
   */
  checkQuality(password) {
    return evaluateSecurity(password);
  },
};

/*********
  Helper functions and variables
*/

const COMPLEXIFY_BANLIST =
  "123456|password|12345678|1234|pussy|12345|dragon|qwerty|696969|mustang|letmein|baseball|master|michael|football|shadow|monkey|abc123|pass|fuckme|6969|jordan|harley|ranger|iwantu|jennifer|hunter|fuck|2000|test|batman|trustno1|thomas|tigger|robert|access|love|buster|1234567|soccer|hockey|killer|george|sexy|andrew|charlie|superman|asshole|fuckyou|dallas|jessica|panties|pepper|1111|austin|william|daniel|golfer|summer|heather|hammer|yankees|joshua|maggie|biteme|enter|ashley|thunder|cowboy|silver|richard|fucker|orange|merlin|michelle|corvette|bigdog|cheese|matthew|121212|patrick|martin|freedom|ginger|blowjob|nicole|sparky|yellow|camaro|secret|dick|falcon|taylor|111111|131313|123123|bitch|hello|scooter|please|porsche|guitar|chelsea|black|diamond|nascar|jackson|cameron|654321|computer|amanda|wizard|xxxxxxxx|money|phoenix|mickey|bailey|knight|iceman|tigers|purple|andrea|horny|dakota|aaaaaa|player|sunshine|morgan|starwars|boomer|cowboys|edward|charles|girls|booboo|coffee|xxxxxx|bulldog|ncc1701|rabbit|peanut|john|johnny|gandalf|spanky|winter|brandy|compaq|carlos|tennis|james|mike|brandon|fender|anthony|blowme|ferrari|cookie|chicken|maverick|chicago|joseph|diablo|sexsex|hardcore|666666|willie|welcome|chris|panther|yamaha|justin|banana|driver|marine|angels|fishing|david|maddog|hooters|wilson|butthead|dennis|fucking|captain|bigdick|chester|smokey|xavier|steven|viking|snoopy|blue|eagles|winner|samantha|house|miller|flower|jack|firebird|butter|united|turtle|steelers|tiffany|zxcvbn|tomcat|golf|bond007|bear|tiger|doctor|gateway|gators|angel|junior|thx1138|porno|badboy|debbie|spider|melissa|booger|1212|flyers|fish|porn|matrix|teens|scooby|jason|walter|cumshot|boston|braves|yankee|lover|barney|victor|tucker|princess|mercedes|5150|doggie|" +
  "zzzzzz|gunner|horney|bubba|2112|fred|johnson|xxxxx|tits|member|boobs|donald|bigdaddy|bronco|penis|voyager|rangers|birdie|trouble|white|topgun|bigtits|bitches|green|super|qazwsx|magic|lakers|rachel|slayer|scott|2222|asdf|video|london|7777|marlboro|srinivas|internet|action|carter|jasper|monster|teresa|jeremy|11111111|bill|crystal|peter|pussies|cock|beer|rocket|theman|oliver|prince|beach|amateur|7777777|muffin|redsox|star|testing|shannon|murphy|frank|hannah|dave|eagle1|11111|mother|nathan|raiders|steve|forever|angela|viper|ou812|jake|lovers|suckit|gregory|buddy|whatever|young|nicholas|lucky|helpme|jackie|monica|midnight|college|baby|cunt|brian|mark|startrek|sierra|leather|232323|4444|beavis|bigcock|happy|sophie|ladies|naughty|giants|booty|blonde|fucked|golden|0|fire|sandra|pookie|packers|einstein|dolphins|chevy|winston|warrior|sammy|slut|8675309|zxcvbnm|nipples|power|victoria|asdfgh|vagina|toyota|travis|hotdog|paris|rock|xxxx|extreme|redskins|erotic|dirty|ford|freddy|arsenal|access14|wolf|nipple|iloveyou|alex|florida|eric|legend|movie|success|rosebud|jaguar|great|cool|cooper|1313|scorpio|mountain|madison|987654|brazil|lauren|japan|naked|squirt|stars|apple|alexis|aaaa|bonnie|peaches|jasmine|kevin|matt|qwertyui|danielle|beaver|4321|4128|runner|swimming|dolphin|gordon|casper|stupid|shit|saturn|gemini|apples|august|3333|canada|blazer|cumming|hunting|kitty|rainbow|112233|arthur|cream|calvin|shaved|surfer|samson|kelly|paul|mine|king|racing|5555|eagle|hentai|newyork|little|redwings|smith|sticky|cocacola|animal|broncos|private|skippy|marvin|blondes|enjoy|girl|apollo|parker|qwert|time|sydney|women|voodoo|magnum|juice|abgrtyu|777777|dreams|maxwell|music|rush2112|russia|scorpion|rebecca|tester|mistress|phantom|billy|6666|albert|111111|11111111|112233|" +
  "121212|123123|123456|1234567|12345678|131313|232323|654321|666666|696969|777777|7777777|8675309|987654|abcdef|password1|password12|password123|twitter".split(
    "|"
  );

const options = {
  minimumChars: 8,
  strengthScaleFactor: 1,
  bannedPasswords: COMPLEXIFY_BANLIST,
  banMode: "strict", // (strict|loose)
};

const MIN_COMPLEXITY = 30; // 8 chars with Upper, Lower and Number
//var MAX_COMPLEXITY = 120; //  25 chars, all charsets
const MAX_COMPLEXITY = 60;

const CHARSETS = [
  // Commonly Used
  ////////////////////
  [0x0020, 0x0020], // Space
  [0x0030, 0x0039], // Numbers
  [0x0041, 0x005a], // Uppercase
  [0x0061, 0x007a], // Lowercase
  [0x0021, 0x002f], // Punctuation
  [0x003a, 0x0040], // Punctuation
  [0x005b, 0x0060], // Punctuation
  [0x007b, 0x007e], // Punctuation
  // Everything Else
  ////////////////////
  [0x0080, 0x00ff], // Latin-1 Supplement
  [0x0100, 0x017f], // Latin Extended-A
  [0x0180, 0x024f], // Latin Extended-B
  [0x0250, 0x02af], // IPA Extensions
  [0x02b0, 0x02ff], // Spacing Modifier Letters
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0370, 0x03ff], // Greek
  [0x0400, 0x04ff], // Cyrillic
  [0x0530, 0x058f], // Armenian
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0780, 0x07bf], // Thaana
  [0x0900, 0x097f], // Devanagari
  [0x0980, 0x09ff], // Bengali
  [0x0a00, 0x0a7f], // Gurmukhi
  [0x0a80, 0x0aff], // Gujarati
  [0x0b00, 0x0b7f], // Oriya
  [0x0b80, 0x0bff], // Tamil
  [0x0c00, 0x0c7f], // Telugu
  [0x0c80, 0x0cff], // Kannada
  [0x0d00, 0x0d7f], // Malayalam
  [0x0d80, 0x0dff], // Sinhala
  [0x0e00, 0x0e7f], // Thai
  [0x0e80, 0x0eff], // Lao
  [0x0f00, 0x0fff], // Tibetan
  [0x1000, 0x109f], // Myanmar
  [0x10a0, 0x10ff], // Georgian
  [0x1100, 0x11ff], // Hangul Jamo
  [0x1200, 0x137f], // Ethiopic
  [0x13a0, 0x13ff], // Cherokee
  [0x1400, 0x167f], // Unified Canadian Aboriginal Syllabics
  [0x1680, 0x169f], // Ogham
  [0x16a0, 0x16ff], // Runic
  [0x1780, 0x17ff], // Khmer
  [0x1800, 0x18af], // Mongolian
  [0x1e00, 0x1eff], // Latin Extended Additional
  [0x1f00, 0x1fff], // Greek Extended
  [0x2000, 0x206f], // General Punctuation
  [0x2070, 0x209f], // Superscripts and Subscripts
  [0x20a0, 0x20cf], // Currency Symbols
  [0x20d0, 0x20ff], // Combining Marks for Symbols
  [0x2100, 0x214f], // Letterlike Symbols
  [0x2150, 0x218f], // Number Forms
  [0x2190, 0x21ff], // Arrows
  [0x2200, 0x22ff], // Mathematical Operators
  [0x2300, 0x23ff], // Miscellaneous Technical
  [0x2400, 0x243f], // Control Pictures
  [0x2440, 0x245f], // Optical Character Recognition
  [0x2460, 0x24ff], // Enclosed Alphanumerics
  [0x2500, 0x257f], // Box Drawing
  [0x2580, 0x259f], // Block Elements
  [0x25a0, 0x25ff], // Geometric Shapes
  [0x2600, 0x26ff], // Miscellaneous Symbols
  [0x2700, 0x27bf], // Dingbats
  [0x2800, 0x28ff], // Braille Patterns
  [0x2e80, 0x2eff], // CJK Radicals Supplement
  [0x2f00, 0x2fdf], // Kangxi Radicals
  [0x2ff0, 0x2fff], // Ideographic Description Characters
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x3100, 0x312f], // Bopomofo
  [0x3130, 0x318f], // Hangul Compatibility Jamo
  [0x3190, 0x319f], // Kanbun
  [0x31a0, 0x31bf], // Bopomofo Extended
  [0x3200, 0x32ff], // Enclosed CJK Letters and Months
  [0x3300, 0x33ff], // CJK Compatibility
  [0x3400, 0x4db5], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa48f], // Yi Syllables
  [0xa490, 0xa4cf], // Yi Radicals
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xd800, 0xdb7f], // High Surrogates
  [0xdb80, 0xdbff], // High Private Use Surrogates
  [0xdc00, 0xdfff], // Low Surrogates
  [0xe000, 0xf8ff], // Private Use
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfb00, 0xfb4f], // Alphabetic Presentation Forms
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe20, 0xfe2f], // Combining Half Marks
  [0xfe30, 0xfe4f], // CJK Compatibility Forms
  [0xfe50, 0xfe6f], // Small Form Variants
  [0xfe70, 0xfefe], // Arabic Presentation Forms-B
  [0xfeff, 0xfeff], // Specials
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
  [0xfff0, 0xfffd], // Specials
];

function additionalComplexityForCharset(str, charset) {
  for (var i = str.length - 1; i >= 0; i--) {
    if (charset[0] <= str.charCodeAt(i) && str.charCodeAt(i) <= charset[1]) {
      return charset[1] - charset[0] + 1;
    }
  }
  return 0;
}

function inBanlist(str) {
  if (options.banMode === "strict") {
    for (var i = 0; i < options.bannedPasswords.length; i++) {
      if (options.bannedPasswords[i].includes(str)) {
        return true;
      }
    }
    return false;
  }

  return options.bannedPasswords.indexOf(str) > -1;
}

function evaluateSecurity(password) {
  var complexity = 0,
    valid = false;

  // Reset complexity to 0 when banned password is found
  if (!inBanlist(password)) {
    // Add character complexity
    for (var i = CHARSETS.length - 1; i >= 0; i--) {
      complexity += additionalComplexityForCharset(password, CHARSETS[i]);
    }
  } else {
    complexity = 1;
  }

  // Use natural log to produce linear scale
  complexity =
    Math.log(Math.pow(complexity, password.length)) *
    (1 / options.strengthScaleFactor);

  valid =
    complexity > MIN_COMPLEXITY && password.length >= options.minimumChars;

  // Scale to percentage, so it can be used for a progress bar
  complexity = (complexity / MAX_COMPLEXITY) * 100;
  complexity = complexity > 100 ? 100 : complexity;

  return {
    valid,
    complexity,
  };
}
