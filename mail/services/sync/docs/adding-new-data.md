# Notes on Extending Sync

Hello, future developer! I'm writing this to share some of what I've learned, while it is still
fresh in my memory. Hopefully you won't need to work out some of this the hard way, like I did.

## Adding Top-Level Properties to Existing Record Types

Assuming you want to add property `foo` to `MyRecord`:

- *Don't* update `MyEngine.prototype.version` unless you want to wipe the users' data from the
  storage server. This can be useful, but you probably don't want to.

- Forward the property to `cleartext`, using the line that starts `Utils.deferGetSet` just after
  the record class definition.

  `Record` objects are responsible for the encryption and decryption of the data they contain. The
  `cleartext` property contains the real information to be encrypted, but for convenience the
  properties we intend to use are forwarded to the `Record` object itself. This means we must be
  careful to ensure the data we want to store is actually stored.

- Update `MyStore`'s `createRecord` function to add the property to new records.

  If the property is optional and you don't want it in the record in some cases, call
  `delete record.foo` to remove any potential previous value and prevent zombie properties rising
  from the data cache.

- Test that `createRecord` works correctly by adding it to the `testCreateRecord` (or similar)
  function in the `test_my_store.js` test file.

- Update the `create` function. Check that the value in `record` is sane as early as possible, and
  throw an exception if it isn't. You don't want problems after you've started creating something.

- Update the `update` function similarly. If `foo` is immutable, check that it hasn't changed as
  early as possible, and throw an exception if it has.

- Test that `create` and `update` work correctly in `test_my_store.js`. The `testSyncRecords` (or
  similar) functions follow this pattern:

  - Pass a `MyRecord` (indirectly) to `create`. Check that the object is created correctly.

  - Pass a new `MyRecord` with different property values to `update`. Check that the object is
    updated correctly. Repeat this as many times as you need to test valid data.

  - Pass new `MyRecord`s with invalid property values to `update`, checking that exceptions are
    thrown as expected.

  - Pass a "tombstone" `MyRecord` to `remove`. Check that the object is cleaned up.

- Change `MyTracker` so that it notices changes to an object's `foo` property.

- Update `test_my_tracker.js` to check that changes to `foo` are tracked. Use the helper functions
  `assertChangeTracked` and `assertNoChangeTracked` as appropriate. `checkPropertyChanges` can be
  used to test multiple changes neatly.

- Add `foo` to the `MyRecord` section of the record specification document in this directory.

## Adding New Engines

Honestly, you can probably just copy what already exists and change it to suit your needs. Think
carefully about what data you want to store before you begin. Use the record specification document
for inspiration, and add your record type to the document.

Assuming you want to sync `Thing` objects:

(Note that some places refer to the singular "thing" and some to the plural "things". This can get
annoying.)

- Create a file for the code, `modules/engines/things.sys.mjs`. Add this file to the nearest
  `moz.build`.

  In this file create `ThingRecord`, `ThingsEngine`, `ThingStore` and `ThingTracker`. At the time
  of writing the code still uses functions and prototypes because the parent types do.

- Create files for the tests, `test/unit/test_thing_store.js` and `test_thing_tracker.js`. Add
  these files to the test manifest.

- Register `ThingEngine`. Look for the names of the other engines in `MailGlue.sys.mjs`.

- Add a preference `services.sync.engine.things` in `all-thunderbird.js`. Initially you might want
  the default value to be `false`.

- Add Things to the Sync preferences page.

### Records

This is very simple because all of the hard work is done in the superclass. Copy one of the
existing record types and update as appropriate. Don't forget to use `Thing`'s property names in
`Utils.deferGetSet`.

The `from` function is a convenience for writing tests.

### Engine

Again, this is simple because all the work is done elsewhere. Copy and update.

The `version` property should not be updated unless there's major changes. Increasing it causes
users' data to be wiped from the storage.

`syncPriority` refers to the order in which records will be sent to or retrieved from the server,
lowest value first. You can use this if you need one type of object to exist before another.

### Store

This is where things get interesting. Subclass `CachedStore` instead of toolkit's `Store`, for easy
caching and forwards compatibility.

- Start by implementing `getAllIDs` and the test for it in `test_thing_store.js`. In the test
  `head.js` file, add a record to the cached data to prove that that works (make sure you haven't
  forgotten to call `super.getAllIDs`).

- `itemExists` should now work automagically, so add the test for it.

- Next implement `createRecord`. This is complicated, so here's some boilerplate:

  ```js
  const record = new ThingRecord(collection, id);

  const data = await super.getCreateRecordData(id);
  const thing = // Get the thing object.

  // If we don't know about this ID, mark the record as deleted.
  if (!thing && !data) {
    record.deleted = true;
    return record;
  }

  if (data) {
    for (const [key, value] of Object.entries(data)) {
      record.cleartext[key] = value;
    }
  }

  if (thing) {
    // Fill in the properties of `record` here.

    super.update(record);
  }
  return record;
  ```

  `data` is the cached record from last time we saw it. First we copy any properties from it to
  `record`, so that properties we don't understand aren't forgotten. Then we overwrite any
  properties we *do* understand. Set or delete values for *every* property so that old values from
  the cache aren't accidentally revived.

- Test `createRecord` in `test_thing_store.js`. Add as many tests as you need to cover variations
  in `Thing` objects.

- Implement `create`, `update`, and `remove` and their tests. See the notes about adding properties
  for more detail.

- Add a test to prove that unknown properties are retained and survive a round-trip through
  `create`/`update` and `createRecord`. This is just like the other tests but you get to add any
  data you like to the records. Much data. Wow!

A note about testing: use the `roundTripRecord` function whenever you call `createRecord`. This
ensures the data that gets sent to the server is what you expected, and nothing got left behind by
the encryption/decryption round-trip.

### Tracker

How `ThingTracker` works depends on `Thing`. The existing trackers mostly just watch for preference
changes, since the objects we sync store their data in preferences. `Thing` might not, and you'll
have to figure it out for yourself. Note that there are other possible ways of tracking changes
that don't involve implementing a tracker at all.

You should implement `getChangedIDs`, `clearChangedIDs`, `onStart`, and `onStop`.

Test your tracker notices changes to all of your properties, and ignores changes that should be
ignored. See the notes on adding properties for more detail.
