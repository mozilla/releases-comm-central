/**
 * Decodes a binary string using the given encoding format and returns a
 * JavaScript string. Produces mangled output if used with anything but a binary
 * input string.
 */
function decodeBinaryString(binaryString, inputEncoding = "utf-8") {
  const buffer = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    buffer[i] = binaryString.charCodeAt(i) & 0xff;
  }
  const decoder = new TextDecoder(inputEncoding);
  return decoder.decode(buffer);
}
