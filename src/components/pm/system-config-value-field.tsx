import { Input, Label, TextArea, TextField } from "@heroui/react";
import { FieldError, OptionSelect, RequiredMark } from "@/components/biz";
/** 受控值编辑器，只持有 raw String，不请求、不规范化提交载荷。 */
export function SystemConfigValueField({
  type,
  value,
  onChange,
  error,
  disabled,
}: {
  type: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  if (type === "boolean")
    return (
      <div>
        <div className="mb-1 text-sm">
          配置值
          <RequiredMark />
        </div>
        <OptionSelect
          label="配置值（必填）"
          isRequired
          value={["true", "false"].includes(value) ? value : ""}
          options={[
            { id: "true", label: "true" },
            { id: "false", label: "false" },
          ]}
          onChange={onChange}
          isDisabled={disabled}
        />
        {value && !["true", "false"].includes(value) ? (
          <p>原始值：{value}，请选择 true 或 false</p>
        ) : null}
        <FieldError
          message={
            error ??
            (value && !["true", "false"].includes(value) ? "请明确选择 true 或 false" : undefined)
          }
        />
      </div>
    );
  return (
    <div>
      <TextField
        value={value}
        onChange={onChange}
        isRequired
        isDisabled={disabled}
        aria-label="配置值"
      >
        <Label>
          配置值
          <RequiredMark />
        </Label>
        {type === "number" ? (
          <Input aria-required inputMode="numeric" placeholder="32 位十进制整数" />
        ) : (
          <TextArea aria-required rows={5} className={type === "json" ? "font-mono" : undefined} />
        )}
      </TextField>
      <FieldError message={error} />
    </div>
  );
}
