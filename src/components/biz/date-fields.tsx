import { Calendar, DateField, DatePicker, DateRangePicker, Label, RangeCalendar } from "@heroui/react";
import { useId, useState } from "react";
import { parseDate, type DateValue } from "@internationalized/date";

export type CalendarMark = {
  date: string;
  tone: "progress" | "review" | "done";
};

const markClass: Record<CalendarMark["tone"], string> = {
  progress: "bg-primary",
  review: "bg-warning",
  done: "bg-success",
};

function toDate(iso: string) {
  return parseDate(iso.slice(0, 10));
}

function fromDate(value: DateValue | null) {
  return value ? value.toString() : "";
}

function markOn(date: DateValue, marks: CalendarMark[]) {
  const iso = date.toString().slice(0, 10);
  return marks.find((mark) => mark.date.slice(0, 10) === iso);
}

function DayCalendar({ label, marks }: { label: string; marks: CalendarMark[] }) {
  return (
    <Calendar aria-label={label} firstDayOfWeek="mon">
      <Calendar.Header>
        <Calendar.YearPickerTrigger>
          <Calendar.YearPickerTriggerHeading />
          <Calendar.YearPickerTriggerIndicator />
        </Calendar.YearPickerTrigger>
        <Calendar.NavButton slot="previous" />
        <Calendar.NavButton slot="next" />
      </Calendar.Header>
      <Calendar.Grid weekdayStyle="short">
        <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
        <Calendar.GridBody>
          {(date) => (
            <Calendar.Cell date={date}>
              {({ formattedDate }) => (
                <>
                  {formattedDate}
                  {markOn(date, marks) ? <Calendar.CellIndicator className={markClass[markOn(date, marks)!.tone]} /> : null}
                </>
              )}
            </Calendar.Cell>
          )}
        </Calendar.GridBody>
      </Calendar.Grid>
      <Calendar.YearPickerGrid>
        <Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
      </Calendar.YearPickerGrid>
    </Calendar>
  );
}

function RangeDayCalendar({ label, marks }: { label: string; marks: CalendarMark[] }) {
  return (
    <RangeCalendar aria-label={label} firstDayOfWeek="mon">
      <RangeCalendar.Header>
        <RangeCalendar.YearPickerTrigger>
          <RangeCalendar.YearPickerTriggerHeading />
          <RangeCalendar.YearPickerTriggerIndicator />
        </RangeCalendar.YearPickerTrigger>
        <RangeCalendar.NavButton slot="previous" />
        <RangeCalendar.NavButton slot="next" />
      </RangeCalendar.Header>
      <RangeCalendar.Grid weekdayStyle="short">
        <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
        <RangeCalendar.GridBody>
          {(date) => (
            <RangeCalendar.Cell date={date}>
              {({ formattedDate }) => (
                <>
                  {formattedDate}
                  {markOn(date, marks) ? <RangeCalendar.CellIndicator className={markClass[markOn(date, marks)!.tone]} /> : null}
                </>
              )}
            </RangeCalendar.Cell>
          )}
        </RangeCalendar.GridBody>
      </RangeCalendar.Grid>
      <RangeCalendar.YearPickerGrid>
        <RangeCalendar.YearPickerGridBody>{({ year }) => <RangeCalendar.YearPickerCell year={year} />}</RangeCalendar.YearPickerGridBody>
      </RangeCalendar.YearPickerGrid>
    </RangeCalendar>
  );
}

export function DayField({
  label,
  value,
  marks = [],
  onChange,
}: {
  label: string;
  value: string;
  marks?: CalendarMark[];
  onChange: (iso: string) => void;
}) {
  return (
    <DatePicker
      aria-label={label}
      granularity="day"
      value={toDate(value)}
      onChange={(next) => {
        const iso = fromDate(next);
        if (iso) onChange(iso);
      }}
    >
      <Label>{label}</Label>
      <DateField.Group fullWidth>
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover>
        <DayCalendar label={label} marks={marks} />
      </DatePicker.Popover>
    </DatePicker>
  );
}

export function SprintRangeField({
  start,
  end,
  marks = [],
  onChange,
}: {
  start: string;
  end: string;
  marks?: CalendarMark[];
  onChange: (start: string, end: string) => void;
}) {
  return (
    <DateRangePicker
      aria-label="迭代起止"
      granularity="day"
      value={{ start: toDate(start), end: toDate(end) }}
      onChange={(range) => {
        if (!range) return;
        const nextStart = fromDate(range.start);
        const nextEnd = fromDate(range.end);
        if (!nextStart || !nextEnd) return;
        if (nextStart > nextEnd) onChange(nextEnd, nextStart);
        else onChange(nextStart, nextEnd);
      }}
    >
      <Label>起止</Label>
      <DateField.Group>
        <DateField.InputContainer>
          <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateRangePicker.RangeSeparator />
          <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        </DateField.InputContainer>
        <DateField.Suffix>
          <DateRangePicker.Trigger>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DateRangePicker.Popover>
        <RangeDayCalendar label="迭代起止" marks={marks} />
      </DateRangePicker.Popover>
    </DateRangePicker>
  );
}

// A local form for the existing day-level plan operation; it never writes by itself.
export function PlanDateFields({ start, end, onSave, onCancel }: {
  start: string;
  end: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [nextStart, setStart] = useState(start.slice(0, 10));
  const [nextEnd, setEnd] = useState(end.slice(0, 10));
  const [error, setError] = useState("");
  const errorId = useId();
  return (
    <form noValidate className="flex flex-col gap-3" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    }} onSubmit={(event) => {
      event.preventDefault();
      try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextStart) || !/^\d{4}-\d{2}-\d{2}$/.test(nextEnd)) throw new Error();
        parseDate(nextStart); parseDate(nextEnd);
      } catch {
        setError("请填写有效的计划开始和结束日期。"); return;
      }
      if (nextStart > nextEnd) { setError("计划结束不能早于开始；可以在同一天开始和结束。"); return; }
      setError(""); onSave(nextStart, nextEnd);
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="type-label flex min-w-0 flex-col gap-1">计划开始
          <input autoFocus type="date" required value={nextStart} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(event) => setStart(event.target.value)} className="type-body h-10 min-w-0 rounded-sm border border-border bg-surface px-2" />
        </label>
        <label className="type-label flex min-w-0 flex-col gap-1">计划结束
          <input type="date" required value={nextEnd} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(event) => setEnd(event.target.value)} className="type-body h-10 min-w-0 rounded-sm border border-border bg-surface px-2" />
        </label>
      </div>
      {error ? <p id={errorId} role="alert" className="type-body text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="type-emphasis min-h-10 rounded-sm bg-primary px-3 text-white">保存计划</button>
        <button type="button" onClick={onCancel} className="type-body min-h-10 rounded-sm border border-border px-3">取消计划编辑</button>
      </div>
    </form>
  );
}
