// One awaited step at a time: rendering delays must not queue a burst of words.
export function createPlayback({ advance, hasSelection, onError }) {
  const interval = 60_000 / 300;
  let playing = false;
  let timer;
  let generation = 0;

  function pause() {
    playing = false;
    generation++;
    clearTimeout(timer);
  }

  async function tick(token) {
    if (!playing || token !== generation) return;
    const started = performance.now();
    try {
      const advanced = await advance(() => playing && token === generation);
      if (!playing || token !== generation) return;
      if (!advanced) { pause(); return; }
      timer = setTimeout(() => tick(token), Math.max(0, interval - (performance.now() - started)));
    } catch (error) {
      if (token !== generation) return;
      pause();
      onError(error);
    }
  }

  function toggle() {
    if (playing) { pause(); return; }
    playing = true;
    const token = ++generation;
    // Give an already-selected word its full 200 ms before advancing.
    if (hasSelection()) timer = setTimeout(() => tick(token), interval);
    else void tick(token);
  }

  return { pause, toggle };
}
