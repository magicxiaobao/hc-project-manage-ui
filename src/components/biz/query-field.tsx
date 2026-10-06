import { FieldError, SearchField } from "@heroui/react";

export function QueryField({
  label,
  value,
  onChange,
  placeholder,
  error,
  isDisabled,
  inputProps,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  isDisabled?: boolean;
  inputProps?: SearchField["InputProps"];
}) {
  return (
    <SearchField
      aria-label={label}
      value={value}
      onChange={onChange}
      isInvalid={!!error}
      validationBehavior="aria"
      isDisabled={isDisabled}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder ?? label} {...inputProps} />
        <SearchField.ClearButton
          aria-label={label === "全局搜索" ? "清空全局搜索" : `清空${label}`}
        />
      </SearchField.Group>
      {error ? (
        <div role="alert">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </SearchField>
  );
}
