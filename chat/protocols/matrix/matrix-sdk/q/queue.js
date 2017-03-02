/*
Copyright 2009–2017 Kristopher Michael Kowal. All rights reserved.
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
*/
var Q = require("./q");

module.exports = Queue;
function Queue() {
    var ends = Q.defer();
    var closed = Q.defer();
    return {
        put: function (value) {
            var next = Q.defer();
            ends.resolve({
                head: value,
                tail: next.promise
            });
            ends.resolve = next.resolve;
        },
        get: function () {
            var result = ends.promise.get("head");
            ends.promise = ends.promise.get("tail");
            return result.fail(function (error) {
                closed.resolve(error);
                throw error;
            });
        },
        closed: closed.promise,
        close: function (error) {
            error = error || new Error("Can't get value from closed queue");
            var end = {head: Q.reject(error)};
            end.tail = end;
            ends.resolve(end);
            return closed.promise;
        }
    };
}

