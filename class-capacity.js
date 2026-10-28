// Preserve existing members in older classes, even when they exceed the new default.
const limit = c => Number.isInteger(c.maxStudents) ? c.maxStudents : Math.max(30, c.studentIds.length);
const parse = value => { if (value === undefined) return 30; if (value === '' || value === null || typeof value === 'boolean') return null; const n = Number(value); return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null; };
module.exports = { limit, parse };
