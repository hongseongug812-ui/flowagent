// Simple event-emitter based toast — no context/prop-drilling needed
const listeners = new Set();

export const toast = {
  _show(msg, type) {
    const id = Date.now() + Math.random();
    listeners.forEach(fn => fn({ id, msg, type }));
  },
  success(msg) { this._show(msg, "success"); },
  error(msg)   { this._show(msg, "error"); },
  info(msg)    { this._show(msg, "info"); },
  warn(msg)    { this._show(msg, "warn"); },
  _subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
