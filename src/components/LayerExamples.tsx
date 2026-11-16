import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ExampleItem {
  layer: number;
  layerLabel: string;
  rungs: number;
  src: string;
  alt: string;
}

const EXAMPLES: ExampleItem[] = [
  {
    layer: 1,
    layerLabel: '第 01 層',
    rungs: 5,
    src: `${import.meta.env.BASE_URL}examples/layer-01-rungs-5.webp`,
    alt: '第 01 層盤面範例，橫線數量 5 條',
  },
  {
    layer: 2,
    layerLabel: '第 02 層',
    rungs: 6,
    src: `${import.meta.env.BASE_URL}examples/layer-02-rungs-6.webp`,
    alt: '第 02 層盤面範例，橫線數量 6 條',
  },
  {
    layer: 3,
    layerLabel: '第 03 層',
    rungs: 7,
    src: `${import.meta.env.BASE_URL}examples/layer-03-rungs-7.webp`,
    alt: '第 03 層盤面範例，橫線數量 7 條',
  },
  {
    layer: 4,
    layerLabel: '第 04 層',
    rungs: 8,
    src: `${import.meta.env.BASE_URL}examples/layer-04-rungs-8.webp`,
    alt: '第 04 層盤面範例，橫線數量 8 條',
  },
  {
    layer: 5,
    layerLabel: '第 05 層',
    rungs: 9,
    src: `${import.meta.env.BASE_URL}examples/layer-05-rungs-9.webp`,
    alt: '第 05 層盤面範例，橫線數量 9 條',
  },
];

export const LayerExamples: React.FC = () => {
  const [activeExample, setActiveExample] = React.useState<ExampleItem | null>(null);

  React.useEffect(() => {
    if (!activeExample) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveExample(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeExample]);

  return (
    <section
      aria-label="層數與盤面範例"
      className="mt-6 rounded-xl border border-slate-800/90 bg-[#111a28] p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold text-slate-100">層數對應與盤面範例</h2>
        <p className="text-xs sm:text-sm text-slate-300">
          橫線的數量對應當前層數：第一層為 <span className="font-mono-num font-semibold text-cyan-300">5</span> 條、第二層為{' '}
          <span className="font-mono-num font-semibold text-cyan-300">6</span> 條，以此類推。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {EXAMPLES.map((item) => (
          <button
            key={item.layer}
            type="button"
            onClick={() => setActiveExample(item)}
            aria-label={`放大檢視 ${item.layerLabel}，橫線 ${item.rungs} 條範例圖`}
            className="group flex flex-col overflow-hidden rounded-lg border border-slate-800 bg-[#0b111b] text-left transition-colors hover:border-cyan-500/60 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-100">{item.layerLabel}</span>
              <span className="font-mono-num font-medium text-cyan-300">橫線 ×{item.rungs}</span>
            </div>
            <div className="relative aspect-[9/19] w-full overflow-hidden bg-[#080d15]">
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.02]"
              />
              <span className="pointer-events-none absolute right-2 bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-950/80 text-slate-200 opacity-0 transition-opacity group-hover:opacity-100">
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </button>
        ))}
      </div>

      {activeExample && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${activeExample.layerLabel} 範例截圖`}
          onClick={() => setActiveExample(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#111a28] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-slate-100">{activeExample.layerLabel}</span>
                <span className="font-mono-num font-medium text-cyan-300">
                  橫線數量：{activeExample.rungs} 條
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveExample(null)}
                aria-label="關閉預覽"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-auto bg-[#080d15] p-3">
              <img
                src={activeExample.src}
                alt={activeExample.alt}
                className="mx-auto max-h-[75vh] w-auto rounded-md object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
