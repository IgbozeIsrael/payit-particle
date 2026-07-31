const util = require('util');

function format(...args) {
  return args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 4 }))).join(' ');
}

function now() { return new Date().toISOString(); }

module.exports = {
  info: (...args) => console.log(`[INFO] [${now()}]`, format(...args)),
  warn: (...args) => console.warn(`[WARN] [${now()}]`, format(...args)),
  error: (...args) => console.error(`[ERROR] [${now()}]`, format(...args)),
  debug: (...args) => console.debug(`[DEBUG] [${now()}]`, format(...args)),
};
