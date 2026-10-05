import { describe, expect, it } from "vitest";
import {
  aggregateWorkLogStatistics,
  analyticsDraftIdentity,
  defaultWorkLogAnalyticsDraft,
  normalizeWorkLogAnalytics,
  parseAnalyticsIds,
  validWorkLogAnalyticsSnapshot,
  validateWorkLogAnalyticsDraft,
  workLogAnalyticsSnapshot,
  workLogMonthRange,
} from "../worklog-analytics-data";
import { queryKeys } from "../query/keys";
const draft = () => ({ ...defaultWorkLogAnalyticsDraft(new Date(2026, 9, 5)), projectIds: [7] });
describe("LocalDate / 集合 / 端点口径", () => {
  it("同时收集所有字段错误，空日期不重复报逆序", () => {
    expect(
      validateWorkLogAnalyticsDraft({
        ...draft(),
        startDate: "",
        endDate: "",
        projectIds: [],
        view: "users",
        userIds: "0,-1",
      }).map((e) => e.field),
    ).toEqual(["startDate", "endDate", "projectIds", "userIds"]);
  });
  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "2026-1-01", "not-date", "0000-01-01"])(
    "拒绝 %s",
    (date) => {
      expect(
        validateWorkLogAnalyticsDraft({ ...draft(), startDate: date }).some(
          (e) => e.field === "startDate",
        ),
      ).toBe(true);
    },
  );
  it.each([
    ["2024-02-29", "2024-03-01"],
    ["2026-12-31", "2027-01-01"],
    ["2026-10-05", "2026-10-05"],
  ])("合法 %s 至 %s", (startDate, endDate) => {
    expect(validateWorkLogAnalyticsDraft({ ...draft(), startDate, endDate })).toEqual([]);
  });
  it("逆序仅挂 endDate，独立日期错误分别保留", () => {
    expect(validateWorkLogAnalyticsDraft({ ...draft(), startDate: "2026-11-01" })).toEqual([
      { field: "endDate", message: "结束日期不能早于开始日期" },
    ]);
    expect(
      validateWorkLogAnalyticsDraft({ ...draft(), startDate: "", endDate: "bad" }).map(
        (e) => e.field,
      ),
    ).toEqual(["startDate", "endDate"]);
  });
  it("自然月按本地日历；年末和闰月", () => {
    expect(workLogMonthRange(new Date(2026, 11, 31, 23, 59))).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
    expect(workLogMonthRange(new Date(2024, 1, 15))).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
  });
  it.each(["0", "-1", "1.1", "9007199254740992", "1,,2", "1,", "abc"])(
    "非法 ID %s 不静默丢弃",
    (input) => {
      expect(parseAnalyticsIds(input)).toBeNull();
      expect(
        validateWorkLogAnalyticsDraft({ ...draft(), view: "tasks", taskIds: input }).map(
          (e) => e.field,
        ),
      ).toEqual(["taskIds"]);
    },
  );
  it.each([0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN])("项目非法 %s", (id) => {
    expect(
      validateWorkLogAnalyticsDraft({ ...draft(), projectIds: [id] }).map((e) => e.field),
    ).toEqual(["projectIds"]);
  });
  it("请求仅使用端点消费字段；集合归一化，dirty 不受纯顺序变化影响", () => {
    expect(parseAnalyticsIds(" 9,7,9 ")).toEqual([7, 9]);
    const d = { ...draft(), projectIds: [9, 7, 9], userIds: "9,7", taskIds: "4,3" };
    const base = { startDate: d.startDate, endDate: d.endDate, projectIds: [7, 9] };
    expect(workLogAnalyticsSnapshot(d)).toEqual(base);
    expect(workLogAnalyticsSnapshot({ ...d, view: "analytics" })).toEqual(base);
    expect(workLogAnalyticsSnapshot({ ...d, view: "users" })).toEqual({ ...base, userIds: [7, 9] });
    expect(workLogAnalyticsSnapshot({ ...d, view: "tasks" })).toEqual({ ...base, taskIds: [3, 4] });
    expect(analyticsDraftIdentity(d)).toBe(
      analyticsDraftIdentity({ ...d, projectIds: [7, 9], userIds: "7,9" }),
    );
    expect(analyticsDraftIdentity({ ...d, userIds: "bad" })).not.toBe(analyticsDraftIdentity(d));
    expect(queryKeys.workLog.statisticsGroup("projects", base)).toEqual(
      queryKeys.workLog.statisticsGroup("projects", {
        ...base,
        projectIds: [9, 7, 7],
        userIds: [42],
      }),
    );
    expect(queryKeys.workLog.statisticsGroup("tasks", base)).not.toEqual(
      queryKeys.workLog.statisticsGroup("users", base),
    );
    for (const change of [{ endDate: "2026-11-01" }, { projectIds: [8] }])
      expect(queryKeys.workLog.analytics({ ...base, ...change })).not.toEqual(
        queryKeys.workLog.analytics(base),
      );
    expect(normalizeWorkLogAnalytics("users", { ...base, userIds: [] })).toEqual(base);
    expect(validWorkLogAnalyticsSnapshot({ ...base, projectIds: [] })).toBe(false);
    expect(validWorkLogAnalyticsSnapshot({ ...base, endDate: "bad" })).toBe(false);
    expect(validWorkLogAnalyticsSnapshot({ ...base, taskIds: [0] })).toBe(false);
  });
});
describe("完整统计响应聚合（不求和效率/比例/完成任务数）", () => {
  it("跨日期/冲刺累加、同名不同 ID、NULL 任务组、小数与零；分页不改变总数", () => {
    const source = [
      {
        taskId: 8,
        taskTitle: "研发",
        projectName: "项目七",
        sprintId: 1,
        totalHours: 1.25,
        completedTasks: 8,
        avgEfficiency: 100,
        effectiveHoursRatio: 0.5,
      },
      {
        taskId: 8,
        taskTitle: "研发",
        sprintId: 2,
        totalHours: 2.5,
        completedTasks: 9,
        avgEfficiency: 90,
        effectiveHoursRatio: 0.8,
      },
      { taskId: 9, taskTitle: "研发", totalHours: 0 },
      { taskId: null, totalHours: 0.25 },
    ];
    const result = aggregateWorkLogStatistics(source, "tasks");
    expect(result.total).toEqual({ state: "known", value: 4 });
    expect(result.groups.map((g) => [g.key, g.value])).toEqual([
      ["8", 3.75],
      ["unassociated", 0.25],
      ["9", 0],
    ]);
    expect(result.groups[0].label).toContain("项目七");
    expect(result.groups[1].label).toBe("未关联任务");
    expect(result.groups[0]).not.toHaveProperty("avgEfficiency");
    expect(result.groups[0]).not.toHaveProperty("completedTasks");
    expect(result.groups[0]).not.toHaveProperty("effectiveHoursRatio");
    result.groups.slice(0, 1);
    expect(result.total.value).toBe(4);
  });
  it.each([null, undefined, NaN, Infinity, -1, "2"])("部分未知/异常 %s 不冒充已知小计", (hours) => {
    const result = aggregateWorkLogStatistics(
      [
        { projectId: 7, totalHours: 2 },
        { projectId: 7, totalHours: hours },
      ],
      "projects",
    );
    expect(result.groups[0].value).toBeNull();
    expect(result.total.value).toBeNull();
    expect(result.total.state).toBe(hours == null ? "missing" : "invalid");
  });
  it("空数组、缺失、非数组与非法行/ID/溢出不同", () => {
    expect(aggregateWorkLogStatistics([], "projects").total.value).toBe(0);
    expect(aggregateWorkLogStatistics(null, "projects").state).toBe("missing");
    for (const source of [
      {},
      [null],
      [{ projectId: 0, totalHours: 2 }],
      [
        { projectId: 7, totalHours: Number.MAX_VALUE },
        { projectId: 7, totalHours: Number.MAX_VALUE },
      ],
    ])
      expect(aggregateWorkLogStatistics(source, "projects").state).toBe("invalid");
    expect(
      aggregateWorkLogStatistics(
        [{ userId: 42, userName: "name", userCnName: "中文", totalHours: 0 }],
        "users",
      ).groups[0].label,
    ).toBe("中文");
  });
});

it("全量卡片值等于所有实体值相加，避免行与组的浮点加法顺序差异", () => {
  const result = aggregateWorkLogStatistics(
    [
      { projectId: 7, totalHours: 0.1 },
      { projectId: 9, totalHours: 0.2 },
      { projectId: 7, totalHours: 0.3 },
    ],
    "projects",
  );
  expect(result.total.value).toBe(result.groups.reduce((sum, group) => sum + group.value!, 0));
});
