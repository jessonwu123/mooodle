// Only match known student/class names, never generic subject words or fuzzy typos.
(function (root) {
  const normalize = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const generic = new Set(["数学", "英语", "语文", "课堂", "课程", "数学课", "amc", "amc8", "amc10", "1v1", "班课"]);
  function rank(title, sessions) {
    const full = String(title || "").normalize("NFKC").toLowerCase();
    const clean = normalize(full);
    return sessions.map(session => {
      let score = 0;
      for (const value of [session.studentName, session.name]) {
        const name = normalize(value);
        if (name.length < 2 || generic.has(name)) continue;
        const latin = /^[a-z]+$/.test(name);
        const found = latin ? new RegExp(`(^|[^a-z])${name}([^a-z]|$)`, "i").test(full) : clean.includes(name);
        if (found) score = Math.max(score, clean === name ? 100 : 80);
      }
      return { ...session, matchScore: score };
    }).sort((a,b) => b.matchScore-a.matchScore || a.time.localeCompare(b.time));
  }
  root.MeetingMatching = { rank, normalize };
})(globalThis);