// One awaited step at a time: rendering delays must not queue a burst of words.
export function createPlayback({ advance, hasSelection, onError, getDelay = () => 200 }) {
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
      timer = setTimeout(() => tick(token), Math.max(0, getDelay() - (performance.now() - started)));
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
    // Honor the selected word's punctuation before advancing.
    if (hasSelection()) timer = setTimeout(() => tick(token), getDelay());
    else void tick(token);
  }

  return { pause, toggle };
}
