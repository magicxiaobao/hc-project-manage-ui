import { Checkbox } from "@heroui/react";

export function FilterCheckbox({
  label,
  checked,
  onChange,
  isDisabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** r16-1/r16-3：播种未完成或保存在途时禁用勾选 */
  isDisabled?: boolean;
}) {
  return (
    <Checkbox isSelected={checked} onChange={onChange} isDisabled={isDisabled}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>{label}</Checkbox.Content>
    </Checkbox>
  );
}
