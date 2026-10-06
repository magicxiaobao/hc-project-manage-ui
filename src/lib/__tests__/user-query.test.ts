/**
 * p5-user-list：搜索表单 → 后端 bean 映射的单元测试。
 *
 * 回归目标：老前端 UserList.vue 的搜索表单是死代码（收集 keyword/status 却从不
 * 传给 findByPage）。本测试锁定新实现的映射语义：
 * - keyword 同时填入 username 与 cnName（后端同值时按 OR-like 处理）；
 * - 空 keyword 不传任何查询字段；
 * - 状态筛选不再映射为 bean.enabled（r4 P1-2）：后端 UserQueryRequest.enabled
 *   被 request2Query 丢弃（UserQuery/BaseUserQuery 无 enabled 字段），且
 *   findByPage 无条件 eq validStatus=VALID（UserServiceImpl.java:150）；
 *   发送 enabled 只会制造"筛选生效"假象，故 buildUserQuery 忽略该参数。
 */
import { describe, expect, it } from 'vitest';
import { buildUserQuery, normalizeUserListParams } from '../query/hooks/useUsers';

describe('buildUserQuery', () => {
  it('空 keyword 不产生任何查询字段', () => {
    expect(buildUserQuery('', 'all')).toEqual({});
    expect(buildUserQuery('   ', 'all')).toEqual({});
  });

  it('keyword 同时填入 username 与 cnName（后端 OR-like 语义）', () => {
    const bean = buildUserQuery('zhang', 'all');
    expect(bean.username).toBe('zhang');
    expect(bean.cnName).toBe('zhang');
  });

  it('keyword 两端空白被 trim', () => {
    const bean = buildUserQuery('  li  ', 'all');
    expect(bean.username).toBe('li');
    expect(bean.cnName).toBe('li');
  });

  it('状态筛选不再进入 bean（后端不识别 enabled，见文件头注释）', () => {
    expect(buildUserQuery('', 'enabled')).toEqual({});
    expect(buildUserQuery('', 'disabled')).toEqual({});
    expect(buildUserQuery('', 'all')).toEqual({});
  });

  it('keyword 与状态可组合：状态仍不进入 bean', () => {
    expect(buildUserQuery('wang', 'disabled')).toEqual({
      username: 'wang',
      cnName: 'wang',
    });
  });
});

describe('normalizeUserListParams', () => {
  it('默认 page/pageSize，keyword 归一化进 bean', () => {
    const normalized = normalizeUserListParams({});
    expect(normalized.page).toBe(1);
    expect(normalized.pageSize).toBe(20);
    expect(normalized.bean).toEqual({});
  });

  it('分页参数透传，搜索参数进入 bean（状态筛选不进入）', () => {
    const normalized = normalizeUserListParams({
      page: 3,
      pageSize: 50,
      keyword: ' zhao ',
      enabledFilter: 'enabled',
    });
    expect(normalized.page).toBe(3);
    expect(normalized.pageSize).toBe(50);
    expect(normalized.bean).toEqual({ username: 'zhao', cnName: 'zhao' });
  });

  it('同一语义的查询参数形状一致（缓存 key 不拆散）', () => {
    const a = normalizeUserListParams({ keyword: 'a' });
    const b = normalizeUserListParams({ keyword: 'a', enabledFilter: 'all', page: 1, pageSize: 20 });
    expect(a).toEqual(b);
  });
});
