import { Checkbox } from "@heroui/react";

export function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <Checkbox isSelected={checked} onChange={onChange}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>{label}</Checkbox.Content>
    </Checkbox>
  );
}
