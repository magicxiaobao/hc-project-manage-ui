import { Slider } from "@heroui/react";

export function ProgressSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Slider
      aria-label="进度"
      minValue={0}
      maxValue={100}
      value={value}
      onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
    >
      <Slider.Output />
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}
