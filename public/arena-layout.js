// A hidden preparation/legacy arena has no drawable size. Wait without treating it as a renderer failure.
export function waitForArenaLayout(stage, {Observer = ResizeObserver, lifecycle = window} = {}) {
  if (stage.clientWidth > 0 && stage.clientHeight > 0) return Promise.resolve(true);
  return new Promise(resolve => {
    let observer;
    const finish = ready => {
      observer?.disconnect();
      lifecycle.removeEventListener('pagehide', cancel);
      resolve(ready);
    };
    const cancel = () => finish(false);
    observer = new Observer(() => {
      if (stage.clientWidth > 0 && stage.clientHeight > 0) finish(true);
    });
    lifecycle.addEventListener('pagehide', cancel, {once: true});
    observer.observe(stage);
  });
}
