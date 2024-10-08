# QR Code JS

Javascript QR Code generator.  Derived from my C version: [qrcode](https://github.com/danielgjackson/qrcode).


## Demo Site

Generate your own SVG QR Code:

* [danielgjackson.github.io/qrcodejs](https://danielgjackson.github.io/qrcodejs)


## QR Codes in you terminal

If you have [Deno](https://deno.land/) installed, you can generate a QR Code in your terminal:

```bash
deno run https://danielgjackson.github.io/qrcodejs/qrcli.mjs 'Hello, World!'
```

...or write out a QR Code to a file:

```bash
deno run --allow-write https://danielgjackson.github.io/qrcodejs/qrcli.mjs --output:svg --file hello.svg 'Hello, World!'
```


## Getting started

### Example usage

Install (if using `npm`):

```bash
npm i -S https://github.com/danielgjackson/qrcodejs
```

<!--

Quick test (also works from a non-module):

```javascript
(async() => {
    const { default: QrCode } = await import('qrcodejs');
    console.log(QrCode.render('medium', QrCode.generate('Hello, World!')));
})();
```

-->

Example usage from an ECMAScript module (`.mjs` file):

```javascript
import QrCode from 'qrcodejs';

const data = 'Hello, World!';
const matrix = QrCode.generate(data);
const text = QrCode.render('medium', matrix);
console.log(text);
```

### Example web page usage

Example usage in a web page:

```html
<img>
<script type="module">
    import QrCode from 'https://danielgjackson.github.io/qrcodejs/qrcode.mjs';

    const data = 'Hello, World!';
    const matrix = QrCode.generate(data);
    const uri = QrCode.render('svg-uri', matrix);
    document.querySelector('img').src = uri;
</script>
```

### Browser without a server

If you would like to use this directly as part of a browser-based app over the `file:` protocol (which disallows modules), you can easily convert this to a non-module `.js` file:

  * Download [`qrcode.mjs`](https://raw.githubusercontent.com/danielgjackson/qrcodejs/master/qrcode.mjs) renamed as `qrcode.js`.
  * Remove the last line from the file (`export default QrCode`).
  * Ensure there is no `type="module"` attribute in your `<script src="qrcode.js"></script>` tag.


## API

### `QrCode.generate(data, options)`

* `data` - the text to encode in the QR Code.

* `options` - the configuration object for the QR Code (optional).  Options include `errorCorrectionLevel` (0-3), `optimizeEcc` (boolean flag, default `true`, to maximize the error-correction level within the chosen output size), `minVersion`/`maxVersion` (1-40), `maskPattern` (0-7).  Hints for the rendering stage are `invert` (boolean flag to invert the code, not as widely supported), and `quiet` (the size, in modules, of the quiet area around the code).  

Returns a *matrix* that can be passed to the `render()` function.


### `QrCode.render(mode, matrix, options)`

* `mode` - the rendering mode, one of:

  * `large` - Generate block-character text, each module takes 2x1 character cells.
  * `medium` - Generate block-character text, fitting 1x2 modules in each character cell.
  * `compact` - Generate block-character text, fitting 2x2 modules in each character cell.
  * `svg` - Generate the contents for a scalable vector graphics file (`.svg`).
  * `bmp` - Generate the contents for a bitmap file (`.bmp`).
  * `svg-uri` - Generate a `data:` URI for an SVG file
  * `bmp-uri` - Generate a `data:` URI for a BMP file.

  The `-uri` modes can be, for example, directly used as the `src` for an `<img>` tag, or `url()` image in CSS.

* `matrix` - the matrix to draw, as returned by the `generate()` function.

* `options` - the configuration object (optional), depends on the chosen rendering `mode`:

  * `svg` / `svg-uri`: `moduleSize` the unit dimensions of each module, `white` (boolean) output the non-set modules (otherwise will be transparent background), `moduleRound` proportion of how rounded the modules are, `finderRound` to hide the standard finder modules and instead output a shape with the specified roundness, `alignmentRound` to hide the standard alignment modules and instead output a shape with the specified roundness.

  * `bmp` / `bmp-uri`: `scale` for the size of a module, `alpha` (boolean) to use a transparent background, `width`/`height` can set a specific image size (rather than scaling the matrix dimensions).

Returns the text or binary output from the chosen `mode`.
