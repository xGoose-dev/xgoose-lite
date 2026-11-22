// Config is serialized as data. The downloaded script also works in <head>.
export function compile(runtime, config) {
  const serialized = JSON.stringify(config).replace(/</g, "\\u003c");
  return runtime + "\n;(() => { const mount = () => XGooseLite.init(" + serialized +
    "); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount(); })();\n";
}
