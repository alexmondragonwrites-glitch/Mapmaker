/**
 * Chapter selector for the Story Map generator.
 *
 * Renders both a row of chapter buttons (P, 1, 2, ...) and a range
 * slider for quick scrubbing. The active chapter is highlighted
 * with the accent color.
 */

interface ChapterSliderProps {
    value: number;
    min?: number;
    max?: number;
    onUpdate: (value: number) => void;
}

const CHAPTER_LABELS: Record<number, string> = {
    0: 'P',  // Prolog
};

export function ChapterSlider({ value, min = 0, max = 7, onUpdate }: ChapterSliderProps) {
    const chapters = [];
    for (let i = min; i <= max; i++) {
        chapters.push(i);
    }

    return (
        <div className="chapter-slider">
            <div className="chapter-buttons">
                {chapters.map(ch => (
                    <button
                        key={ch}
                        className={`chapter-btn ${ch === value ? 'active' : ''}`}
                        onClick={() => onUpdate(ch)}
                        title={ch === 0 ? 'Prolog' : `Kapitel ${ch}`}
                    >
                        {CHAPTER_LABELS[ch] ?? ch}
                    </button>
                ))}
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={value}
                onChange={e => onUpdate(Number(e.target.value))}
                className="chapter-range"
            />
            <div className="chapter-label">
                {value === 0 ? 'Prolog' : `Kapitel ${value}`}
            </div>
        </div>
    );
}
