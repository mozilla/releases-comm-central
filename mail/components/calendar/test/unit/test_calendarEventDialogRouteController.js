/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarEventDialogRouteController } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-dialog-route-controller.mjs"
);

function createFrameScheduler() {
  let nextFrame = 0;
  const callbacks = new Map();

  return {
    cancelAnimationFrame(frame) {
      callbacks.delete(frame);
    },

    requestAnimationFrame(callback) {
      const frame = ++nextFrame;
      callbacks.set(frame, callback);
      return frame;
    },

    get frameCount() {
      return callbacks.size;
    },

    runNextFrame() {
      const [frame, callback] = callbacks.entries().next().value;
      callbacks.delete(frame);
      callback();
    },
  };
}

add_task(async function test_stale_route_cannot_finish_replacement() {
  const scheduler = createFrameScheduler();

  const routes = [];
  const controller = new CalendarEventDialogRouteController(route => {
    routes.push(route);
  }, scheduler);

  controller.restart();
  const firstReady = controller.waitForReady();
  Assert.equal(scheduler.frameCount, 1, "One frame starts the first route");

  scheduler.runNextFrame();
  const firstRoute = routes.shift();

  controller.restart();
  const secondReady = controller.waitForReady();
  Assert.ok(firstRoute.signal.aborted, "The replacement aborts the old route");
  Assert.equal(scheduler.frameCount, 1, "One frame starts the replacement");

  controller.finish(firstRoute, "ready");
  scheduler.runNextFrame();
  const secondRoute = routes.shift();
  controller.finish(secondRoute, "ready");

  Assert.ok(!(await firstReady), "The old route cannot become ready");
  Assert.ok(await secondReady, "The replacement route becomes ready");
});

add_task(async function test_disconnect_cancels_scheduled_route() {
  const scheduler = createFrameScheduler();

  const routes = [];
  const controller = new CalendarEventDialogRouteController(route => {
    routes.push(route);
  }, scheduler);

  controller.restart();
  const isReady = controller.waitForReady();
  controller.disconnect();

  Assert.equal(scheduler.frameCount, 0, "Disconnect cancels the route frame");
  Assert.ok(!(await isReady), "A disconnected route cannot become ready");
  Assert.equal(routes.length, 0, "No route load starts after disconnect");
});
