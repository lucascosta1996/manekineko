// Only loaded by the isolated fixture build/server entry points. Never used by
// production applications. Server rendering and browser fixtures share a clock.
const NativeDate = Date;
const instant = NativeDate.parse('2026-09-28T12:00:00.000Z');
const FixtureDate = function Date(...args) {
  // Native Date is callable without `new`; arguments are ignored in that form.
  if (!new.target) return new NativeDate(instant).toString();
  return Reflect.construct(NativeDate, args.length ? args : [instant], new.target);
};
Object.defineProperties(FixtureDate, {
  length: { value: NativeDate.length },
  prototype: { value: NativeDate.prototype, writable: false },
  // Keep own static properties: framework code may copy their descriptors.
  now: { value: function now() { return instant; }, writable: true, configurable: true },
  parse: { value: NativeDate.parse, writable: true, configurable: true },
  UTC: { value: NativeDate.UTC, writable: true, configurable: true },
});
Object.defineProperty(FixtureDate.prototype, 'constructor', { value: FixtureDate, writable: true, configurable: true });
global.Date = FixtureDate;
