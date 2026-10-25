// Self-contained so Chrome can serialize it into the selected Tencent page.
async function extractMeetingTranscript() {
  const stampPattern = /^\s*(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s*[-–~至]\s*\d{1,2}:[0-5]\d(?::[0-5]\d)?)?\s*$/;
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const stamps = () => [...document.querySelectorAll("*")].filter(el => visible(el) && !el.children.length && stampPattern.test(el.textContent || ""));
  const seconds = stamp => stamp.split(":").reduce((n, part) => n * 60 + Number(part), 0);
  const initial = stamps();
  if (!initial.length) throw new Error("未找到带时间标记的逐字稿，请先打开腾讯会议「逐字稿」面板；不会把纪要或页面菜单误当全文。");
  const containers = new Map();
  for (const stamp of initial) {
    for (let el = stamp.parentElement; el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if (el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2 && (/(auto|scroll|overlay)/.test(overflow) || el === document.scrollingElement)) {
        containers.set(el, (containers.get(el) || 0) + 1);
        break;
      }
    }
  }
  const scroller = [...containers].sort((a, b) => b[1] - a[1])[0]?.[0];
  const root = scroller || initial[0].closest('[class*="transcript" i],[class*="speech" i],[role="log"],[role="list"]') || initial[0].parentElement?.parentElement;
  if (!root) throw new Error("无法定位逐字稿区域，请打开逐字稿面板重试。");
  const records = new Map();
  let truncated = false;
  let total = 0;
  const collect = () => {
    for (const stamp of stamps().filter(el => root.contains(el))) {
      const time = (stamp.textContent || "").trim().match(stampPattern)?.[1];
      if (!time) continue;
      let item = stamp.parentElement;
      let candidate;
      for (let depth = 0; item && depth < 8; depth++, item = item.parentElement) {
        const count = [...item.querySelectorAll("*")].filter(el => !el.children.length && stampPattern.test(el.textContent || "")).length;
        if (count > 1) break;
        const text = (item.innerText || "").trim();
        const content = text.replace(stampPattern, "").replace(/^\s*\d{1,2}:[0-5]\d(?::[0-5]\d)?(?:\s*[-–~至]\s*\d{1,2}:[0-5]\d(?::[0-5]\d)?)?\s*(?:\n|$)/, "").trim();
        if (content.length > 1 && content !== time) candidate = { text, time };
        if (item === root) break;
      }
      if (!candidate) continue;
      // Timestamp + content preserves repeated utterances at different times.
      const key = `${time}\u0000${candidate.text}`;
      if (records.has(key)) continue;
      if (total + candidate.text.length + 1 > 100000) { truncated = true; continue; }
      records.set(key, { ...candidate, order: records.size });
      total += candidate.text.length + 1;
    }
    return records.size;
  };
  const settle = async () => {
    // Sample during delayed rendering, not just once after a fixed short delay.
    let previous = -1;
    let stable = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 80));
      const size = collect();
      stable = size === previous ? stable + 1 : 0;
      previous = size;
      if (i >= 3 && stable >= 2) break;
    }
  };
  let reachedStart = false;
  let reachedEnd = false;
  const originalTop = scroller?.scrollTop;
  try {
    if (scroller) {
      scroller.scrollTop = 0;
      await settle();
      reachedStart = scroller.scrollTop <= 2;
      let bottomStable = 0;
      for (let step = 0; step < 600 && !truncated; step++) {
        const beforeCount = records.size;
        const beforeHeight = scroller.scrollHeight;
        const beforeTop = scroller.scrollTop;
        scroller.scrollTop = Math.min(beforeTop + Math.max(40, scroller.clientHeight * 0.8), scroller.scrollHeight);
        await settle();
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        bottomStable = atBottom && records.size === beforeCount && scroller.scrollHeight === beforeHeight ? bottomStable + 1 : 0;
        if (bottomStable >= 2) { reachedEnd = true; break; }
        if (!atBottom && scroller.scrollTop === beforeTop) break;
      }
    } else { await settle(); }
  } finally {
    if (scroller && originalTop !== undefined) scroller.scrollTop = originalTop;
  }
  const rows = [...records.values()].sort((a, b) => seconds(a.time) - seconds(b.time) || a.order - b.order);
  if (!rows.length) throw new Error("找到了时间标记，但未读取到发言正文，请确认逐字稿已展开。");
  return { text: rows.map(row => row.text).join("\n\n"), count: rows.length, firstTime: rows[0]?.time, lastTime: rows.at(-1)?.time, reachedStart, reachedEnd, truncated };
}