/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource:///modules/imServices.jsm");

function getIter(aEnumerator)
{
  while (aEnumerator.hasMoreElements())
    yield aEnumerator.getNext();
}
