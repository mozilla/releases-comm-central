"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SearchResult = void 0;
var _eventContext = require("./event-context.js");
/*
Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

class SearchResult {
  /**
   * Create a SearchResponse from the response to /search
   */

  static fromJson(jsonObj, eventMapper) {
    const jsonContext = jsonObj.context || {};
    let eventsBefore = (jsonContext.events_before || []).map(eventMapper);
    let eventsAfter = (jsonContext.events_after || []).map(eventMapper);
    const context = new _eventContext.EventContext(eventMapper(jsonObj.result));

    // Filter out any contextual events which do not correspond to the same timeline (thread or room)
    const threadRootId = context.ourEvent.threadRootId;
    eventsBefore = eventsBefore.filter(e => e.threadRootId === threadRootId);
    eventsAfter = eventsAfter.filter(e => e.threadRootId === threadRootId);
    context.setPaginateToken(jsonContext.start, true);
    context.addEvents(eventsBefore, true);
    context.addEvents(eventsAfter, false);
    context.setPaginateToken(jsonContext.end, false);
    return new SearchResult(jsonObj.rank, context);
  }

  /**
   * Construct a new SearchResult
   *
   * @param rank -   where this SearchResult ranks in the results
   * @param context -  the matching event and its
   *    context
   */
  constructor(rank, context) {
    this.rank = rank;
    this.context = context;
  }
}
exports.SearchResult = SearchResult;