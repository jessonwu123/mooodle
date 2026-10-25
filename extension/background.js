const APP = "https://mooodle.lovable.app";
const AUTH = "https://elwiaeitctyhmockanld.supabase.co/auth/v1/token?grant_type=password";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsd2lhZWl0Y3R5aG1vY2thbmxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTI4MzUsImV4cCI6MjA5NDMyODgzNX0.XZk5JKyScv3FPzr1JNmJbxH0rwEzg9I18ktleaega_o";
const toEmail = a => a.includes("@") ? a : `${a.toLowerCase()}@teacher.local`;
async function login(force) {
  const { mooodleAccount: acct, mooodleToken: tok } = await chrome.storage.local.get(["mooodleAccount", "mooodleToken"]);
  if (!acct?.account || !acct?.password) throw new Error("请先在插件中填写并保存 mooodle 教师账号和密码");
  if (!force && tok?.access_token && tok.expires_at * 1000 > Date.now() + 60000) return tok.access_token;
  const res = await fetch(AUTH, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email: toEmail(acct.account.trim()), password: acct.password }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error("mooodle 账号或密码错误，请检查后重新保存");
  await chrome.storage.local.set({ mooodleToken: { access_token: data.access_token, expires_at: data.expires_at } });
  return data.access_token;
}
async function call(body, retry = true) {
  const token = await login(false);
  const res = await fetch(`${APP}/api/meeting-plugin`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401 && retry) { await chrome.storage.local.remove("mooodleToken"); return call(body, false); }
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`课表读取失败（${res.status}），请确认网站已发布最新版本`);
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}），请重试`);
  return data;
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "MEETING_APP") return;
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) {
    reply({ error: "请从浏览器工具栏打开纪要存档插件后重试" });
    return;
  }
  (async () => {
    if (message.action === "login") { await login(true); return { message: "已登录 mooodle" }; }
    if (message.action === "ai-token") return { accessToken: await login(false) };
    return call({ action: message.action, date: message.date, sessionId: message.sessionId, text: message.text, rating: message.rating });
  })().then(reply).catch(e => reply({ error: e.message || "连接失败" }));
  return true;
});
