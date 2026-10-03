import { Autocomplete, IconChevronDown, ListBox, SearchField, useFilter } from "@heroui/react";
import type { ReactNode } from "react";
import { use } from "react";
import { Button, SelectStateContext } from "react-aria-components";

const EMPTY = "__empty__";

export type SelectOption = {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
};

function OptionSelectIndicator({
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const state = use(SelectStateContext);
  return (
    <Button
      aria-describedby={ariaDescribedBy}
      render={(domProps) => <button {...domProps} aria-invalid={ariaInvalid ? true : undefined} />}
    >
      <IconChevronDown
        className="autocomplete__indicator"
        data-open={state?.isOpen ? "true" : undefined}
        data-slot="autocomplete-default-indicator"
      />
    </Button>
  );
}

export function OptionSelect({
  label,
  value,
  options,
  onChange,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { contains } = useFilter({ sensitivity: "base" });
  const canClear = options.some((option) => option.id === "");
  const selected = value === "" ? EMPTY : value;
  return (
    <Autocomplete
      aria-label={label}
      fullWidth
      placeholder="请选择"
      selectedKey={selected || null}
      onSelectionChange={(key) => {
        if (key == null) {
          onChange("");
          return;
        }
        const next = String(key);
        onChange(next === EMPTY ? "" : next);
      }}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value className="min-w-0" />
        {canClear ? <Autocomplete.ClearButton aria-label="清除" /> : null}
        <OptionSelectIndicator aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy} />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField aria-label={`筛选${label}`}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input autoFocus placeholder="输入以筛选" />
              <SearchField.ClearButton aria-label="清空筛选" />
            </SearchField.Group>
          </SearchField>
          <ListBox renderEmptyState={() => <div className="type-meta px-3 py-4 text-center">没有匹配的选项</div>}>
            {options.map((option) => {
              const id = option.id === "" ? EMPTY : option.id;
              return (
                <ListBox.Item key={id} id={id} textValue={option.hint ? `${option.label} ${option.hint}` : option.label}>
                  <span className="flex min-w-0 items-center gap-2">
                    {option.icon ? <span className="flex shrink-0 items-center justify-center">{option.icon}</span> : null}
                    <span className="truncate">{option.label}</span>
                    {option.hint ? <span className="type-caption ml-auto shrink-0">{option.hint}</span> : null}
                  </span>
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
