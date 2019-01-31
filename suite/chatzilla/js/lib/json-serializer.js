/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This is a simple set of functions for serializing and parsing JS objects
 * to and from files.
 */

function JSONSerializer(file) {
  if (typeof file == "string")
    this._file = new nsLocalFile(file);
  else
    this._file = file;
  this._open = false;
}

JSONSerializer.prototype = {
  /*
   * Opens the serializer on the file specified when created, in either the read
   * ("<") or write (">") directions. When the file is open, only the
   * appropriate direction of serialization/deserialization may be performed.
   *
   * Note: serialize and deserialize automatically open the file if it is not
   *       open.
   *
   * @param dir   The string representing the direction of serialization.
   * @returns     Value indicating whether the file was opened successfully.
   */
  open: function(dir) {
    if (!ASSERT((dir == ">") || (dir == "<"), "Bad serialization direction!")) {
      return false;
    }
    if (this._open) {
      return false;
    }

    this._fileStream = new LocalFile(this._file, dir);
    if ((typeof this._fileStream == "object") && this._fileStream) {
      this._open = true;
    }

    return this._open;
  },

  /*
   * Closes the file stream and ends reading or writing.
   *
   * @returns     Value indicating whether the file was closed successfully.
   */
  close: function() {
    if (this._open) {
      this._fileStream.close();
      delete this._fileStream;
      this._open = false;
    }
    return true;
  },

  /*
   * Serializes a single object into the file stream. All properties of the
   * object are stored in the stream, including properties that contain other
   * objects.
   *
   * @param obj   JS object to serialize to the file.
   */
  serialize: function(obj) {
    if (!this._open) {
      this.open(">");
    }
    if (!ASSERT(this._open, "Unable to open the file for writing!")) {
      return;
    }

    this._fileStream.write(JSON.stringify(obj, null, 2));
  },

  /*
   * Reads in enough of the file to deserialize (realize) a single object. The
   * object deserialized is returned; all sub-properties of the object are
   * deserialized with it.
   *
   * @returns     JS object parsed from the file.
   */
  deserialize: function() {
    if (!this._open) {
      this.open("<");
    }
    if (!ASSERT(this._open, "Unable to open the file for reading!"))
      return false;

    let rv = null;
    try {
      rv = JSON.parse(this._fileStream.read());
    }
    catch(ex) {
      dd("Syntax error while deserializing file!");
      dd(ex.message);
      dd(ex.stack);
    }

    return rv;
  },
};
