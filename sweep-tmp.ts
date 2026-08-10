delete process.env.REALAUCTION_RELAY_URL;
delete process.env.REALAUCTION_RELAY_SECRET;
const { runNightlyPulls } = await import("@/lib/distress-feed.server");
const r = await runNightlyPulls();
console.log(JSON.stringify(r, null, 1));
