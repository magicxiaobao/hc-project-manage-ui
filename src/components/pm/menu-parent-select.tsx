import { FieldError, OptionSelect } from "@/components/biz";
import type { SelectOption } from "@/components/biz/option-select";
import { parseMenuSelection } from "@/lib/menu-form";

export function MenuParentSelect({
  value,
  options,
  ready,
  busy,
  error,
  onChange,
}: {
  value: number | null;
  options: SelectOption[];
  ready: boolean;
  busy: boolean;
  error?: string;
  onChange: (id: number | null) => void;
}) {
  const selected = String(value);
  const missing = !options.some((option) => option.id === selected);
  return (
    <div>
      <div className="mb-1 text-sm">父级菜单</div>
      <OptionSelect
        label="父级菜单"
        value={value === null ? "" : selected}
        options={options}
        onChange={(id) => onChange(parseMenuSelection(id))}
        isDisabled={busy || !ready}
      />
      {missing ? (
        <p className="type-meta">
          原父级 #{value ?? "未设置"} 不可选，请重新选择；不会自动移到顶级。
        </p>
      ) : null}
      <FieldError message={error} />
      {!ready ? <p className="type-meta">完整菜单结构尚未加载成功，暂不能保存父级关系。</p> : null}
    </div>
  );
}
