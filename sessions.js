// Chụp trạng thái nghiệp vụ; socket, track và phòng nhóm luôn tạo mới sau restart.
const store = require('./db');
function checkpoint(lives) {
  const out = {};
  for (const [id, l] of lives) {
    const { teacherSocket, viewers, breakout, activity, pad, ...rest } = l;
    out[id] = {
      ...rest, classId: id, savedAt: Date.now(), attendees: [...l.attendees], scores: [...l.scores],
      revealed: [...(l.revealed || [])], scored: [...(l.scored || [])], banned: [...(l.banned || [])],
      attendance: Object.fromEntries(Object.entries(l.attendance || {}).map(([uid, a]) => {
        const v = [...viewers.values()].find(v => v.userId === uid);
        return [uid, { ...a, seconds: a.seconds + (v && v.joinedAt ? Math.max(0, Math.floor((Date.now() - v.joinedAt) / 1000)) : 0) }];
      })),
      activity: activity ? { ...activity, timer: undefined, answers: [...activity.answers] } : null,
      pad: pad ? { ...pad, entries: [...pad.entries] } : null,
    };
  }
  store.data.liveSnapshots = out; store.save();
}
function restore() {
  const lives = new Map();
  for (const [id, l] of Object.entries(store.data.liveSnapshots || {})) {
    if (!store.data.classes.some(c => c.id === id)) continue;
    lives.set(id, { ...l, classId: id, recovered: true, teacherSocket: null, viewers: new Map(), speaker: null, breakout: null,
      attendees: new Set(l.attendees), scores: new Map(l.scores), revealed: new Set(l.revealed), scored: new Set(l.scored), banned: new Set(l.banned),
      activity: l.activity ? { ...l.activity, answers: new Map(l.activity.answers), timer: null } : null,
      pad: l.pad ? { ...l.pad, entries: new Map(l.pad.entries) } : null,
    });
  }
  return lives;
}
module.exports = { checkpoint, restore };
