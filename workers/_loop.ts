/** Shared runner: run `tick` every `intervalMs`, never overlap, log errors. */
export async function runLoop(
  name: string,
  intervalMs: number,
  tick: () => Promise<void>
) {
  console.log(`[${name}] starting, interval ${intervalMs}ms`);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopping) {
    const started = Date.now();
    try {
      await tick();
    } catch (err) {
      console.error(`[${name}] tick failed`, err);
    }
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, intervalMs - elapsed)));
  }
  console.log(`[${name}] stopped`);
}
