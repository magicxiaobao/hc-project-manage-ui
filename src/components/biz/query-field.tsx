import { SearchField } from "@heroui/react";

export function QueryField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <SearchField aria-label={label} value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={label} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}
