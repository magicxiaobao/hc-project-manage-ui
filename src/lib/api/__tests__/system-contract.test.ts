/**
 * 系统管理域（P5）契约测试：断言各域 API 的请求路径/动词/请求体结构。
 *
 * 覆盖的契约（实读后端 project-manage-system-biz Controller + DTO）：
 * - user/v1：createUser/updateUser/valid/{id}/invalid/{id}/delete/{id}（POST 状态变更）、
 *   findById/{id}（GET）、findByPage（POST {page,pageSize,bean}）、options（POST）、
 *   changePassword {id,oldPassword,newPassword}、assignRoles {userId,roleIds}、
 *   roles/{userId}（GET）、project-managers（GET）
 * - 头像上传 POST profile/avatar 与 POST {userId}/avatar 走 multipart FormData（不走 JSON）；
 *   GET {userId}/avatar/content 返回原始字节流（非 Result 信封），非 2xx 按无头像降级
 * - role/v1：createRole/valid/invalid/findByPage/list?keyword=/permissions/{roleId}/
 *   assignPermissions {roleId,permissionIds}
 * - permission/v1：createPermission/valid/invalid/delete/findByPage/tree（GET，只返回 enabled）
 * - menu/v1：createMenu/valid/invalid/findByPage/getMenuTree（GET）/
 *   getMenuTreeByUser?userId=/checkMenuPermission?userId=&permission=
 * - dictionary/v1：createDictionary/valid/invalid/findByPage/findByCode?code=/
 *   existsByCode/getAllValidDictionaries/batchValidateHashCode（POST map）；
 *   后端无删除端点，前端不建模删除
 * - dictionaryItem/v1：createDictionaryItem/valid/invalid/findByPage/
 *   findByDictId?dictId=/existsByValue?dictId=&value=
 * - systemConfig/v1：createSystemConfig/valid/invalid/findByPage/
 *   getConfigValue?configKey=/getConfigValues（POST 数组）/existsByConfigKey/
 *   getConfigsByType?configType=/validateConfigValue?configKey=&configValue=
 *
 * 运行：pnpm vitest run src/lib/api/__tests__/system-contract.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { systemApi } from '../system';
import { ApiBusinessError } from '../client';

const memStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memStore.set(k, v);
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
});

function mockFetchSequence(responses: Array<{ status?: number; body: unknown }>) {
  const mock = vi.fn();
  for (const r of responses) {
    mock.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.stubGlobal('fetch', mock);
  return mock;
}

function callOf(mock: ReturnType<typeof vi.fn>, index = 0): [string, RequestInit] {
  return mock.mock.calls[index] as [string, RequestInit];
}

beforeEach(() => {
  memStore.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memStore.set(k, v);
    },
    removeItem: (k: string) => {
      memStore.delete(k);
    },
  });
});

describe('用户域契约', () => {
  it('POST /user/v1/createUser，返回新建用户 id', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 10 } }]);
    const id = await systemApi.user.createUser({
      username: 'dev01',
      password: 'secret123',
      cnName: '开发一',
      email: 'dev01@example.com',
      enabled: true,
    });

    expect(id).toBe(10);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/createUser');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ username: 'dev01', password: 'secret123', enabled: true });
  });

  it('POST /user/v1/findByPage，标准分页请求体', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { list: [], total: 0, pageNumber: 1, pageSize: 20 } } },
    ]);
    await systemApi.user.findByPage({ page: 1, pageSize: 20, bean: { enabled: true } });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/findByPage');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      page: 1,
      pageSize: 20,
      bean: { enabled: true },
    });
  });

  it('POST /user/v1/valid/{id} / invalid/{id} / delete/{id}，id 拼在路径上', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await systemApi.user.validUser(5);
    await systemApi.user.invalidUser(6);
    await systemApi.user.deleteUser(7);

    expect(callOf(fetchMock, 0)[0]).toBe('/api/user/v1/valid/5');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/user/v1/invalid/6');
    expect(callOf(fetchMock, 2)[0]).toBe('/api/user/v1/delete/7');
    for (const i of [0, 1, 2]) expect(callOf(fetchMock, i)[1].method).toBe('POST');
  });

  it('GET /user/v1/findById/{id}', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 9, username: 'admin' } } },
    ]);
    const detail = await systemApi.user.findById(9);

    expect(detail.username).toBe('admin');
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/findById/9');
    expect(init.method).toBe('GET');
  });

  it('POST /user/v1/changePassword，请求体为 {id, oldPassword, newPassword}', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    await systemApi.user.changePassword({
      id: 9,
      oldPassword: 'old-secret',
      newPassword: 'new-secret-123',
    });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/changePassword');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      id: 9,
      oldPassword: 'old-secret',
      newPassword: 'new-secret-123',
    });
  });

  it('POST /user/v1/assignRoles，请求体为 {userId, roleIds}', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: '角色分配成功' } }]);
    await systemApi.user.assignRoles({ userId: 9, roleIds: [2, 3] });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/assignRoles');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ userId: 9, roleIds: [2, 3] });
  });

  it('GET /user/v1/roles/{userId} 回显已分配角色', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [{ id: 2, roleCode: 'ADMIN' }] } },
    ]);
    const roles = await systemApi.user.getUserRoles(9);

    expect(roles[0].roleCode).toBe('ADMIN');
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/roles/9');
    expect(init.method).toBe('GET');
  });

  it('POST /user/v1/options，用户选择项走分页信封', async () => {
    const fetchMock = mockFetchSequence([
      {
        body: {
          code: 1,
          msg: 'ok',
          result: {
            list: [{ id: 9, username: 'admin', cnName: '管理员', avatar: null }],
            total: 1,
            pageNumber: 1,
            pageSize: 10,
          },
        },
      },
    ]);
    const page = await systemApi.user.options({ page: 1, pageSize: 10, bean: {} });

    expect(page.list[0].username).toBe('admin');
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/options');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 10, bean: {} });
  });
});

describe('头像上传与读取契约', () => {
  it('POST /user/v1/profile/avatar 走 multipart FormData，不设 JSON Content-Type', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: null } }]);
    await systemApi.user.uploadProfileAvatar(new Blob(['img'], { type: 'image/png' }));

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/profile/avatar');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const contentType = new Headers(init.headers).get('Content-Type');
    expect(contentType === null || !contentType.includes('application/json')).toBe(true);
  });

  it('POST /user/v1/{userId}/avatar 管理员代传同样走 multipart', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: null } }]);
    await systemApi.user.uploadUserAvatar(9, new Blob(['img'], { type: 'image/png' }));

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/user/v1/9/avatar');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('GET /user/v1/{userId}/avatar/content 返回原始字节 Blob（非信封解析）', async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(new Blob(['bytes'], { type: 'image/png' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', mock);

    const blob = await systemApi.user.getAvatarContent(9);

    expect(blob).toBeInstanceOf(Blob);
    const [url, init] = callOf(mock);
    expect(url).toBe('/api/user/v1/9/avatar/content');
    expect(init.method === undefined || init.method === 'GET').toBe(true);
  });

  it('头像不存在（非 2xx）时抛 HttpResponseError 供上层降级占位', async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response('no avatar', { status: 400 }));
    vi.stubGlobal('fetch', mock);

    await expect(systemApi.user.getAvatarContent(9)).rejects.toMatchObject({
      name: 'HttpResponseError',
      httpStatus: 400,
    });
  });
});

describe('角色/权限/菜单域契约', () => {
  it('POST /role/v1/createRole，返回新建角色 id；valid/invalid 为 POST 路径拼接', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 20 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    const id = await systemApi.role.createRole({ roleName: '开发', roleCode: 'DEV' });
    await systemApi.role.validRole(20);

    expect(id).toBe(20);
    expect(callOf(fetchMock, 0)[0]).toBe('/api/role/v1/createRole');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/role/v1/valid/20');
    expect(callOf(fetchMock, 1)[1].method).toBe('POST');
  });

  it('POST /role/v1/assignPermissions，请求体为 {roleId, permissionIds}', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: '权限分配成功' } }]);
    await systemApi.role.assignPermissions({ roleId: 20, permissionIds: [1, 2, 3] });

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/role/v1/assignPermissions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ roleId: 20, permissionIds: [1, 2, 3] });
  });

  it('GET /role/v1/list?keyword=，角色选择器只走 enabled 查询', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [{ id: 20, roleCode: 'DEV' }] } },
    ]);
    await systemApi.role.list('开发');

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/role/v1/list?keyword=%E5%BC%80%E5%8F%91');
    expect(init.method).toBe('GET');
  });

  it('GET /role/v1/permissions/{roleId} 返回权限 id 数组', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: [1, 2] } }]);
    const ids = await systemApi.role.getRolePermissions(20);

    expect(ids).toEqual([1, 2]);
    expect(callOf(fetchMock)[0]).toBe('/api/role/v1/permissions/20');
  });

  it('POST /permission/v1/createPermission；GET /permission/v1/tree', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 30 } },
      { body: { code: 1, msg: 'ok', result: [{ id: 30, permissionCode: 'sys:user:view' }] } },
    ]);
    const id = await systemApi.permission.createPermission({
      permissionName: '查看用户',
      permissionCode: 'sys:user:view',
      groupName: '系统管理',
    });
    const tree = await systemApi.permission.tree();

    expect(id).toBe(30);
    expect(tree[0].permissionCode).toBe('sys:user:view');
    expect(callOf(fetchMock, 0)[0]).toBe('/api/permission/v1/createPermission');
    const [treeUrl, treeInit] = callOf(fetchMock, 1);
    expect(treeUrl).toBe('/api/permission/v1/tree');
    expect(treeInit.method).toBe('GET');
  });

  it('POST /permission/v1/delete/{id}，权限点仅标记为禁用，记录与关联保留', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 'success' } }]);
    await systemApi.permission.deletePermission(30);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/permission/v1/delete/30');
    expect(init.method).toBe('POST');
  });

  it('POST /menu/v1/createMenu，type/openType 为 Integer；GET getMenuTree', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 40 } },
      { body: { code: 1, msg: 'ok', result: [{ id: 40, name: '用户管理' }] } },
    ]);
    const id = await systemApi.menu.createMenu({ name: '用户管理', type: 2, path: '/sys/users' });
    const tree = await systemApi.menu.getMenuTree();

    expect(id).toBe(40);
    expect(tree[0].name).toBe('用户管理');
    const [url, init] = callOf(fetchMock, 0);
    expect(url).toBe('/api/menu/v1/createMenu');
    expect(JSON.parse(init.body as string)).toMatchObject({ name: '用户管理', type: 2 });
    const [treeUrl, treeInit] = callOf(fetchMock, 1);
    expect(treeUrl).toBe('/api/menu/v1/getMenuTree');
    expect(treeInit.method).toBe('GET');
  });

  it('GET /menu/v1/getMenuTreeByUser?userId=；GET checkMenuPermission 带两个查询参数', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [] } },
      { body: { code: 1, msg: 'ok', result: true } },
    ]);
    await systemApi.menu.getMenuTreeByUser(9);
    const allowed = await systemApi.menu.checkMenuPermission(9, 'sys:user:view');

    expect(allowed).toBe(true);
    expect(callOf(fetchMock, 0)[0]).toBe('/api/menu/v1/getMenuTreeByUser?userId=9');
    expect(callOf(fetchMock, 1)[0]).toBe(
      '/api/menu/v1/checkMenuPermission?userId=9&permission=sys%3Auser%3Aview',
    );
  });
});

describe('字典/字典项域契约', () => {
  it('POST /dictionary/v1/createDictionary，validStatus 为 Integer', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 50 } }]);
    const id = await systemApi.dictionary.createDictionary({
      code: 'TASK_PRIORITY',
      title: '任务优先级',
      valueType: 1,
      validStatus: 1,
    });

    expect(id).toBe(50);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/dictionary/v1/createDictionary');
    expect(JSON.parse(init.body as string)).toMatchObject({ code: 'TASK_PRIORITY', validStatus: 1 });
  });

  it('字典域不建模删除（后端无 delete 端点）', () => {
    expect('deleteDictionary' in systemApi.dictionary).toBe(false);
    expect('delete' in systemApi.dictionary).toBe(false);
  });

  it('GET findByCode / existsByCode，查询参数正确编码', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { id: 50, code: 'TASK_PRIORITY' } } },
      { body: { code: 1, msg: 'ok', result: false } },
    ]);
    const dict = await systemApi.dictionary.findByCode('TASK_PRIORITY');
    const exists = await systemApi.dictionary.existsByCode('TASK_PRIORITY');

    expect(dict.code).toBe('TASK_PRIORITY');
    expect(exists).toBe(false);
    expect(callOf(fetchMock, 0)[0]).toBe('/api/dictionary/v1/findByCode?code=TASK_PRIORITY');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/dictionary/v1/existsByCode?code=TASK_PRIORITY');
  });

  it('POST /dictionary/v1/batchValidateHashCode，请求体为 {code: hashCode} 映射', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { TASK_PRIORITY: true } } },
    ]);
    const result = await systemApi.dictionary.batchValidateHashCode({ TASK_PRIORITY: 'abc123' });

    expect(result).toEqual({ TASK_PRIORITY: true });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/dictionary/v1/batchValidateHashCode');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ TASK_PRIORITY: 'abc123' });
  });

  it('POST /dictionaryItem/v1/createDictionaryItem；GET existsByValue?dictId=&value=', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 60 } },
      { body: { code: 1, msg: 'ok', result: true } },
    ]);
    const id = await systemApi.dictionaryItem.createDictionaryItem({
      dictId: 50,
      value: 'high',
      name: '高',
    });
    const exists = await systemApi.dictionaryItem.existsByValue(50, 'high');

    expect(id).toBe(60);
    expect(exists).toBe(true);
    expect(callOf(fetchMock, 0)[0]).toBe('/api/dictionaryItem/v1/createDictionaryItem');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/dictionaryItem/v1/existsByValue?dictId=50&value=high');
  });

  it('GET /dictionaryItem/v1/findByDictId?dictId=', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [{ id: 60, value: 'high' }] } },
    ]);
    const items = await systemApi.dictionaryItem.findByDictId(50);

    expect(items[0].value).toBe('high');
    expect(callOf(fetchMock)[0]).toBe('/api/dictionaryItem/v1/findByDictId?dictId=50');
  });
});

describe('系统配置域契约', () => {
  it('POST /systemConfig/v1/createSystemConfig', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 70 } }]);
    const id = await systemApi.systemConfig.createSystemConfig({
      name: '站点名称',
      configKey: 'site.name',
      configValue: '恒川',
      configType: 'string',
    });

    expect(id).toBe(70);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/systemConfig/v1/createSystemConfig');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ configKey: 'site.name' });
  });

  it('GET getConfigValue?configKey=；GET getConfigsByType?configType=', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: '恒川' } },
      { body: { code: 1, msg: 'ok', result: [{ configKey: 'site.name' }] } },
    ]);
    const value = await systemApi.systemConfig.getConfigValue('site.name');
    const configs = await systemApi.systemConfig.getConfigsByType('string');

    expect(value).toBe('恒川');
    expect(configs[0].configKey).toBe('site.name');
    expect(callOf(fetchMock, 0)[0]).toBe('/api/systemConfig/v1/getConfigValue?configKey=site.name');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/systemConfig/v1/getConfigsByType?configType=string');
  });

  it('配置不存在时 getConfigValue/getConfigByKey 返回 null（后端 Result.success(null)）', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: null } },
      { body: { code: 1, msg: 'ok', result: null } },
    ]);
    const value = await systemApi.systemConfig.getConfigValue('no.such.key');
    const config = await systemApi.systemConfig.getConfigByKey('no.such.key');

    expect(value).toBeNull();
    expect(config).toBeNull();
    expect(callOf(fetchMock, 0)[0]).toBe('/api/systemConfig/v1/getConfigValue?configKey=no.such.key');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/systemConfig/v1/getConfigByKey?configKey=no.such.key');
  });

  it('POST /systemConfig/v1/getConfigValues，请求体为 key 数组', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: { 'site.name': '恒川' } } },
    ]);
    const result = await systemApi.systemConfig.getConfigValues(['site.name']);

    expect(result['site.name']).toBe('恒川');
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/systemConfig/v1/getConfigValues');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(['site.name']);
  });

  it('GET validateConfigValue?configKey=&configValue=；existsByConfigKey', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: true } },
      { body: { code: 1, msg: 'ok', result: false } },
    ]);
    const valid = await systemApi.systemConfig.validateConfigValue('site.name', '恒川');
    const exists = await systemApi.systemConfig.existsByConfigKey('site.name');

    expect(valid).toBe(true);
    expect(exists).toBe(false);
    expect(callOf(fetchMock, 0)[0]).toBe(
      '/api/systemConfig/v1/validateConfigValue?configKey=site.name&configValue=%E6%81%92%E5%B7%9D',
    );
    expect(callOf(fetchMock, 1)[0]).toBe(
      '/api/systemConfig/v1/existsByConfigKey?configKey=site.name',
    );
  });
});

describe('角色分配权限页契约补充', () => {
  it('keyword 特殊字符编码；空 keyword 不传，不携带服务端分页参数', async () => {
    const roles = [{ id: 20, roleName: '开发', roleCode: 'DEV', enabled: true }];
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: roles } },
      { body: { code: 1, msg: 'ok', result: roles } },
      { body: { code: 1, msg: 'ok', result: roles } },
    ]);
    expect(await systemApi.role.list(' 开发 &/+ ')).toEqual(roles);
    expect(callOf(fetchMock)[0]).toBe('/api/role/v1/list?keyword=%E5%BC%80%E5%8F%91%20%26%2F%2B');
    await systemApi.role.list('');
    await systemApi.role.list();
    for (const index of [1, 2]) {
      expect(callOf(fetchMock, index)[0]).toBe('/api/role/v1/list');
      expect(callOf(fetchMock, index)[1].body).toBeUndefined();
    }
  });
  it('tree 标准信封解包为扁平真实字段；不带 /system 前缀', async () => {
    const permissions = [{ id: 11, permissionName: '查看', permissionCode: 'sys:view', permissionType: 'MENU', groupName: '系统', enabled: true }];
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: permissions } }]);
    const actual = await systemApi.permission.tree();
    expect(actual).toEqual(permissions);
    expect(actual[0]).not.toHaveProperty('children');
    expect(callOf(fetchMock)[0]).toBe('/api/permission/v1/tree');
    expect(callOf(fetchMock)[1].body).toBeUndefined();
  });
  it('POST 空数组合法、仅发送 roleId/permissionIds，成功文案由 result 解包', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: '操作成功', result: '权限分配成功' } }]);
    expect(await systemApi.role.assignPermissions({ roleId: 20, permissionIds: [] })).toBe('权限分配成功');
    expect(callOf(fetchMock)[0]).toBe('/api/role/v1/assignPermissions');
    expect(JSON.parse(callOf(fetchMock)[1].body as string)).toEqual({ roleId: 20, permissionIds: [] });
  });
  it('成功空 tree 与业务失败、403、网络失败有不同结果', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [] } },
      { body: { code: 10001, msg: '权限加载失败', result: null } },
      { status: 403, body: { code: 10001, msg: '禁止访问', result: null } },
    ]);
    expect(await systemApi.permission.tree()).toEqual([]);
    await expect(systemApi.permission.tree()).rejects.toThrow('权限加载失败');
    await expect(systemApi.permission.tree()).rejects.toThrow('禁止访问');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(systemApi.permission.tree()).rejects.toThrow('fetch failed');
  });
});


describe('权限点管理完整契约', () => {
  it('findByPage 显式发送 page/pageSize/bean，读取原分页与 null/epoch秒', async () => {
    const result = { list: [{ id: 31, permissionName: null, permissionCode: 'disabled', permissionType: null, groupName: null, description: null, enabled: false, createdAt: null, updatedAt: 1767225600 }], total: 1, pageNumber: 1, pageSize: 100 };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result } }]);
    expect(await systemApi.permission.findByPage({ page: 1, pageSize: 100, bean: {} })).toEqual(result);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/permission/v1/findByPage'); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 100, bean: {} });
  });
  it('create/update 六字段；update 带 id、空字符串及 enabled=null 透传', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 31 } }, { body: { code: 1, msg: 'ok', result: '操作成功' } }]);
    const create = { permissionName: '查看', permissionCode: 'sys:view', permissionType: 'DATA', groupName: '', description: '', enabled: false };
    const update = { ...create, id: 31, enabled: null };
    expect(await systemApi.permission.createPermission(create)).toBe(31);
    expect(await systemApi.permission.updatePermission(update)).toBe('操作成功');
    for (const [index, path, payload] of [[0, 'createPermission', create], [1, 'updatePermission', update]] as const) {
      const [url, init] = callOf(fetchMock, index);
      expect(url).toBe(`/api/permission/v1/${path}`); expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual(payload);
    }
  });
  it.each(['validPermission', 'invalidPermission', 'deletePermission'] as const)('%s 为无 body POST，绝非 DELETE', async (method) => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: '操作成功' } }]);
    expect(await systemApi.permission[method](31)).toBe('操作成功');
    const [url, init] = callOf(fetchMock);
    expect(url).toBe(`/api/permission/v1/${method.replace('Permission', '')}/31`);
    expect(init.method).toBe('POST'); expect(init.body).toBeUndefined();
  });
  it('findById 与 findAll GET 解包；禁用详情可读取', async () => {
    const row = { id: 31, enabled: false };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: row } }, { body: { code: 1, msg: 'ok', result: [] } }]);
    expect(await systemApi.permission.findById(31)).toEqual(row);
    expect(await systemApi.permission.findAll()).toEqual([]);
    expect(callOf(fetchMock, 0)[0]).toBe('/api/permission/v1/findById/31');
    expect(callOf(fetchMock, 1)[0]).toBe('/api/permission/v1/findAll');
    expect(callOf(fetchMock, 0)[1].method).toBe('GET'); expect(callOf(fetchMock, 1)[1].method).toBe('GET');
  });
  it.each([10002, 10003])('HTTP400 信封 %s 转为 ApiBusinessError', async (code) => {
    mockFetchSequence([{ status: 400, body: { code, msg: '通用保存失败', result: null } }]);
    const error = await systemApi.permission.createPermission({ permissionName: '查看', permissionCode: 'sys:view' }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiBusinessError); expect(error).toMatchObject({ code, httpStatus: 400 });
  });
});

// MenuController annotations + MenuCreate/Update/QueryRequest + MenuResponse/AbstractResponse.
// Service returns root records without children; this contract does not prove permission filtering.
describe('菜单完整源码契约', () => {
  const row = {
    id: 41, parentId: 0, name: '目录', type: 1, icon: null, path: '', openType: 1,
    uri: null, permission: null, sort: 0, keepAlive: false, hidden: true, memo: null,
    createdAt: 1720000000, updatedAt: null,
  };
  it('scope create/update 精确数字字段；根 0、清空文本；不附带扩展字段', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 41 } },
      { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    const scope = { parentId: 0, name: '菜单', type: 2, icon: '', path: '', openType: 1, uri: '', permission: 'any 文本' };
    expect(await systemApi.menu.createMenu(scope)).toBe(41);
    expect(await systemApi.menu.updateMenu({ id: 41, ...scope })).toBe('success');
    for (const [index, endpoint, expected] of [
      [0, 'createMenu', { parentId: 0, name: '菜单', type: 2, icon: '', path: '', openType: 1, uri: '', permission: 'any 文本' }],
      [1, 'updateMenu', { id: 41, parentId: 0, name: '菜单', type: 2, icon: '', path: '', openType: 1, uri: '', permission: 'any 文本' }],
    ] as const) {
      const [url, init] = callOf(fetchMock, index);
      expect(url).toBe(`/api/menu/v1/${endpoint}`);
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual(expected);
      for (const key of ['type', 'openType', 'parentId']) expect(typeof body[key]).toBe('number');
      for (const key of ['sort', 'keepAlive', 'hidden', 'memo', 'children', 'validStatus']) expect(body).not.toHaveProperty(key);
    }
  });
  it('真实客户端保留 DTO 可选扩展字段支持', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 41 } }, { body: { code: 1, msg: 'ok', result: 'success' } },
    ]);
    await systemApi.menu.createMenu({ name: '目录', type: 1, sort: 8, keepAlive: true, hidden: false, memo: '备注' });
    await systemApi.menu.updateMenu({ id: 41, sort: 9, keepAlive: false, hidden: true, memo: '' });
    expect(JSON.parse(callOf(fetchMock, 0)[1].body as string)).toEqual({ name: '目录', type: 1, sort: 8, keepAlive: true, hidden: false, memo: '备注' });
    expect(JSON.parse(callOf(fetchMock, 1)[1].body as string)).toEqual({ id: 41, sort: 9, keepAlive: false, hidden: true, memo: '' });
  });
  it('valid/invalid POST 无 body；详情 GET；响应可空字段、epoch 秒、无 children/有效状态', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: 'success' } }, { body: { code: 1, msg: 'ok', result: 'success' } },
      { body: { code: 1, msg: 'ok', result: row } },
    ]);
    expect(await systemApi.menu.validMenu(41)).toBe('success');
    expect(await systemApi.menu.invalidMenu(41)).toBe('success');
    expect(await systemApi.menu.findById(41)).toEqual(row);
    for (const [index, endpoint, method] of [[0, 'valid', 'POST'], [1, 'invalid', 'POST'], [2, 'findById', 'GET']] as const) {
      const [url, init] = callOf(fetchMock, index);
      expect(url).toBe(`/api/menu/v1/${endpoint}/41`);
      expect(init.method).toBe(method); expect(init.body).toBeUndefined();
    }
    expect(row).not.toHaveProperty('children'); expect(row).not.toHaveProperty('validStatus');
  });
  it('分页 page/list 标准信封；无 pageNum/records', async () => {
    const page = { list: [row], total: 1, pageSize: 100, pageNumber: 1 };
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: page } }]);
    expect(await systemApi.menu.findByPage({ page: 1, pageSize: 100, bean: {} })).toEqual(page);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/menu/v1/findByPage'); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ page: 1, pageSize: 100, bean: {} });
    expect(page).not.toHaveProperty('records');
  });
  it('四个 GET 精确查询参数与编码，不发请求体', async () => {
    const fetchMock = mockFetchSequence([
      { body: { code: 1, msg: 'ok', result: [row] } }, { body: { code: 1, msg: 'ok', result: [row] } },
      { body: { code: 1, msg: 'ok', result: [row] } }, { body: { code: 1, msg: 'ok', result: true } },
    ]);
    expect(await systemApi.menu.getMenuTree()).toEqual([row]);
    expect(await systemApi.menu.getMenuTreeByUser(12)).toEqual([row]);
    expect(await systemApi.menu.getChildrenByParentId(41)).toEqual([row]);
    expect(await systemApi.menu.checkMenuPermission(12, 'menu:a b/读')).toBe(true);
    for (const [index, suffix] of ['getMenuTree', 'getMenuTreeByUser?userId=12', 'getChildrenByParentId?parentId=41', 'checkMenuPermission?userId=12&permission=menu%3Aa%20b%2F%E8%AF%BB'].entries()) {
      const [url, init] = callOf(fetchMock, index);
      expect(url).toBe(`/api/menu/v1/${suffix}`); expect(init.method).toBe('GET'); expect(init.body).toBeUndefined();
    }
  });
  it.each([{ status: 200, body: { code: 10112, msg: '创建失败', result: null } }, { status: 403, body: { code: 403, msg: '拒绝访问', result: null } }])('业务/403 错误拒绝成功分支', async (response) => {
    mockFetchSequence([response]);
    await expect(systemApi.menu.createMenu({ name: '目录', type: 1 })).rejects.toThrow();
  });
  it('0L 如实解包为 0，由 create hook 拒绝；无 deleteMenu 或其他删除客户端', async () => {
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: 0 } }]);
    expect(await systemApi.menu.createMenu({ name: '目录', type: 1 })).toBe(0);
    expect('deleteMenu' in systemApi.menu).toBe(false);
    expect(Object.keys(systemApi.menu).some((name) => /delete/i.test(name))).toBe(false);
    expect(callOf(fetchMock)[0]).toBe('/api/menu/v1/createMenu');
  });
});

describe('动态访问初始化契约', () => {
  it('用户菜单 GET/current userId/token/no body，解包 result', async () => {
    memStore.set('token', 'current-user-token');
    const rows = [{ id: 1, parentId: null, type: 1, path: null }];
    const fetchMock = mockFetchSequence([{ body: { code: 1, msg: 'ok', result: rows } }]);
    expect(await systemApi.menu.getMenuTreeByUser(7)).toEqual(rows);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/menu/v1/getMenuTreeByUser?userId=7');
    expect(init.method).toBe('GET'); expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get('token')).toBe('current-user-token');
  });
  it('非法或超安全整数 userId 不发请求', () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const id of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => systemApi.menu.getMenuTreeByUser(id)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("字典全量 24 方法契约", () => {
  const code = "类型 &+/?中文";
  const hashCode = "hash &+/?";
  const value = "1 &+/?";
  const dc = { code, title: "名称", valueType: 2, memo: "" };
  const du = { id: 9, title: "名称", valueType: 1, memo: "" };
  const ic = {
    dictId: 9,
    value,
    name: "",
    sort: -1,
    attributes: { nested: { ok: true } },
    memo: "",
  };
  const iu = { id: 8, value, name: "", sort: 0, attributes: {}, memo: "" };
  const dp = { page: 2, pageSize: 20, bean: { code, title: "名称", valueType: 2, validStatus: 1 } };
  const ip = { page: 1, pageSize: 10, bean: { dictId: 9, validStatus: 0 } };
  const cases: Array<{
    name: string;
    call: () => Promise<unknown>;
    path: string;
    method: string;
    body?: unknown;
    query?: Record<string, string>;
    result?: unknown;
  }> = [
    {
      name: "createDictionary",
      call: () => systemApi.dictionary.createDictionary(dc),
      path: "dictionary/v1/createDictionary",
      method: "POST",
      body: dc,
      result: 9,
    },
    {
      name: "updateDictionary",
      call: () => systemApi.dictionary.updateDictionary(du),
      path: "dictionary/v1/updateDictionary",
      method: "POST",
      body: du,
    },
    {
      name: "validDictionary",
      call: () => systemApi.dictionary.validDictionary(9),
      path: "dictionary/v1/valid/9",
      method: "POST",
    },
    {
      name: "invalidDictionary",
      call: () => systemApi.dictionary.invalidDictionary(9),
      path: "dictionary/v1/invalid/9",
      method: "POST",
    },
    {
      name: "dictionary.findById",
      call: () => systemApi.dictionary.findById(9),
      path: "dictionary/v1/findById/9",
      method: "GET",
    },
    {
      name: "dictionary.findByPage",
      call: () => systemApi.dictionary.findByPage(dp),
      path: "dictionary/v1/findByPage",
      method: "POST",
      body: dp,
    },
    {
      name: "findByCode",
      call: () => systemApi.dictionary.findByCode(code),
      path: "dictionary/v1/findByCode",
      method: "GET",
      query: { code },
    },
    {
      name: "getAllValidDictionaries",
      call: () => systemApi.dictionary.getAllValidDictionaries(),
      path: "dictionary/v1/getAllValidDictionaries",
      method: "GET",
    },
    {
      name: "existsByCode",
      call: () => systemApi.dictionary.existsByCode(code),
      path: "dictionary/v1/existsByCode",
      method: "GET",
      query: { code },
      result: false,
    },
    {
      name: "getDictionaryItemsByCode",
      call: () => systemApi.dictionary.getDictionaryItemsByCode(code),
      path: "dictionary/v1/getDictionaryItemsByCode",
      method: "GET",
      query: { code },
    },
    {
      name: "validateHashCode",
      call: () => systemApi.dictionary.validateHashCode(code, hashCode),
      path: "dictionary/v1/validateHashCode",
      method: "GET",
      query: { code, hashCode },
      result: true,
    },
    {
      name: "getHashCode",
      call: () => systemApi.dictionary.getHashCode(code),
      path: "dictionary/v1/getHashCode",
      method: "GET",
      query: { code },
      result: hashCode,
    },
    {
      name: "batchValidateHashCode",
      call: () => systemApi.dictionary.batchValidateHashCode({ [code]: hashCode }),
      path: "dictionary/v1/batchValidateHashCode",
      method: "POST",
      body: { [code]: hashCode },
      result: {},
    },
    {
      name: "createDictionaryItem",
      call: () => systemApi.dictionaryItem.createDictionaryItem(ic),
      path: "dictionaryItem/v1/createDictionaryItem",
      method: "POST",
      body: ic,
      result: 8,
    },
    {
      name: "updateDictionaryItem",
      call: () => systemApi.dictionaryItem.updateDictionaryItem(iu),
      path: "dictionaryItem/v1/updateDictionaryItem",
      method: "POST",
      body: iu,
    },
    {
      name: "validDictionaryItem",
      call: () => systemApi.dictionaryItem.validDictionaryItem(8),
      path: "dictionaryItem/v1/valid/8",
      method: "POST",
    },
    {
      name: "invalidDictionaryItem",
      call: () => systemApi.dictionaryItem.invalidDictionaryItem(8),
      path: "dictionaryItem/v1/invalid/8",
      method: "POST",
    },
    {
      name: "item.findById",
      call: () => systemApi.dictionaryItem.findById(8),
      path: "dictionaryItem/v1/findById/8",
      method: "GET",
    },
    {
      name: "item.findByPage",
      call: () => systemApi.dictionaryItem.findByPage(ip),
      path: "dictionaryItem/v1/findByPage",
      method: "POST",
      body: ip,
    },
    {
      name: "findByDictId",
      call: () => systemApi.dictionaryItem.findByDictId(9),
      path: "dictionaryItem/v1/findByDictId",
      method: "GET",
      query: { dictId: "9" },
    },
    {
      name: "findByDictCode",
      call: () => systemApi.dictionaryItem.findByDictCode(code),
      path: "dictionaryItem/v1/findByDictCode",
      method: "GET",
      query: { dictCode: code },
    },
    {
      name: "findValidByDictId",
      call: () => systemApi.dictionaryItem.findValidByDictId(9),
      path: "dictionaryItem/v1/findValidByDictId",
      method: "GET",
      query: { dictId: "9" },
    },
    {
      name: "findValidByDictCode",
      call: () => systemApi.dictionaryItem.findValidByDictCode(code),
      path: "dictionaryItem/v1/findValidByDictCode",
      method: "GET",
      query: { dictCode: code },
    },
    {
      name: "existsByValue",
      call: () => systemApi.dictionaryItem.existsByValue(9, value),
      path: "dictionaryItem/v1/existsByValue",
      method: "GET",
      query: { dictId: "9", value },
      result: true,
    },
  ];
  it.each(cases)("$name URL/动词/body/query", async (c) => {
    const result = c.result ?? "操作成功";
    const mock = mockFetchSequence([{ body: { code: 1, msg: "ok", result } }]);
    expect(await c.call()).toEqual(result);
    const [url, init] = callOf(mock);
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe(`/api/${c.path}`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual(c.query ?? {});
    expect(init.method).toBe(c.method);
    if (c.body === undefined) expect(init.body).toBeUndefined();
    else expect(JSON.parse(init.body as string)).toEqual(c.body);
  });
  it("更新/创建白名单不引入响应字段或删除端点", () => {
    expect(du).not.toHaveProperty("code");
    for (const key of ["dictCode", "validStatus", "hashCode"]) expect(ic).not.toHaveProperty(key);
    for (const key of ["dictId", "dictCode", "validStatus", "creator", "updater", "hashCode"])
      expect(iu).not.toHaveProperty(key);
    expect(Object.keys(systemApi.dictionary)).toHaveLength(13);
    expect(Object.keys(systemApi.dictionaryItem)).toHaveLength(11);
    expect(
      [...Object.keys(systemApi.dictionary), ...Object.keys(systemApi.dictionaryItem)].some((k) =>
        /delete/i.test(k),
      ),
    ).toBe(false);
  });
  it.each([true, false])("exists Boolean %s 原样返回", async (exists) => {
    mockFetchSequence([{ body: { code: 1, msg: "ok", result: exists } }]);
    expect(await systemApi.dictionary.existsByCode(code)).toBe(exists);
  });
  it("创建返回 0 不被 API 伪造成功 ID", async () => {
    mockFetchSequence([{ body: { code: 1, msg: "ok", result: 0 } }]);
    expect(await systemApi.dictionaryItem.createDictionaryItem(ic)).toBe(0);
  });
  it("业务错误/403/网络错误不能降为 hash false", async () => {
    mockFetchSequence([{ body: { code: -1, msg: "找不到字典", result: null } }]);
    await expect(
      systemApi.dictionary.batchValidateHashCode({ [code]: hashCode }),
    ).rejects.toThrow();
    mockFetchSequence([{ status: 403, body: { msg: "禁止访问" } }]);
    await expect(systemApi.dictionary.validateHashCode(code, hashCode)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(systemApi.dictionary.getHashCode(code)).rejects.toThrow();
  });
});

describe("系统配置完整 13 方法契约", () => {
  const configKey = "中文.key 空格&+#";
  const configValue = '{"a":"中文 &+#"}';
  const create = {
    name: "名称",
    configKey,
    configValue,
    configType: "JSON",
    description: "",
    enabled: false,
  };
  const update = { id: 9, ...create };
  const row = { ...update, memo: "保留", createdAt: 1767225600, updatedAt: 1767225610 };
  const cases: Array<{
    name: string;
    call: () => Promise<unknown>;
    path: string;
    method: string;
    body?: unknown;
    query?: Record<string, string>;
    result: unknown;
  }> = [
    {
      name: "createSystemConfig",
      call: () => systemApi.systemConfig.createSystemConfig(create),
      path: "createSystemConfig",
      method: "POST",
      body: create,
      result: 9,
    },
    {
      name: "updateSystemConfig",
      call: () => systemApi.systemConfig.updateSystemConfig(update),
      path: "updateSystemConfig",
      method: "POST",
      body: update,
      result: "操作成功",
    },
    {
      name: "validSystemConfig",
      call: () => systemApi.systemConfig.validSystemConfig(9),
      path: "valid/9",
      method: "POST",
      result: "操作成功",
    },
    {
      name: "invalidSystemConfig",
      call: () => systemApi.systemConfig.invalidSystemConfig(9),
      path: "invalid/9",
      method: "POST",
      result: "操作成功",
    },
    {
      name: "findById",
      call: () => systemApi.systemConfig.findById(9),
      path: "findById/9",
      method: "GET",
      result: row,
    },
    {
      name: "findByPage",
      call: () =>
        systemApi.systemConfig.findByPage({
          page: 2,
          pageSize: 20,
          bean: { configKey, configType: "JSON" },
        }),
      path: "findByPage",
      method: "POST",
      body: { page: 2, pageSize: 20, bean: { configKey, configType: "JSON" } },
      result: { list: [row], total: 21, pageSize: 20, pageNumber: 2 },
    },
    {
      name: "getConfigValue",
      call: () => systemApi.systemConfig.getConfigValue(configKey),
      path: "getConfigValue",
      method: "GET",
      query: { configKey },
      result: configValue,
    },
    {
      name: "getConfigByKey",
      call: () => systemApi.systemConfig.getConfigByKey(configKey),
      path: "getConfigByKey",
      method: "GET",
      query: { configKey },
      result: null,
    },
    {
      name: "getAllValidConfigs",
      call: () => systemApi.systemConfig.getAllValidConfigs(),
      path: "getAllValidConfigs",
      method: "GET",
      result: [row],
    },
    {
      name: "getConfigValues",
      call: () => systemApi.systemConfig.getConfigValues([configKey]),
      path: "getConfigValues",
      method: "POST",
      body: [configKey],
      result: { [configKey]: configValue },
    },
    {
      name: "existsByConfigKey",
      call: () => systemApi.systemConfig.existsByConfigKey(configKey),
      path: "existsByConfigKey",
      method: "GET",
      query: { configKey },
      result: false,
    },
    {
      name: "getConfigsByType",
      call: () => systemApi.systemConfig.getConfigsByType("JSON"),
      path: "getConfigsByType",
      method: "GET",
      query: { configType: "JSON" },
      result: [row],
    },
    {
      name: "validateConfigValue",
      call: () => systemApi.systemConfig.validateConfigValue(configKey, configValue),
      path: "validateConfigValue",
      method: "GET",
      query: { configKey, configValue },
      result: false,
    },
  ];
  it.each(cases)("$name 路径/动词/body/query/信封", async (c) => {
    const mock = mockFetchSequence([{ body: { code: 1, msg: "ok", result: c.result } }]);
    expect(await c.call()).toEqual(c.result);
    const [url, init] = callOf(mock);
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe(`/api/systemConfig/v1/${c.path}`);
    expect(init.method).toBe(c.method);
    expect(Object.fromEntries(parsed.searchParams)).toEqual(c.query ?? {});
    if (c.body === undefined) expect(init.body).toBeUndefined();
    else expect(JSON.parse(init.body as string)).toEqual(c.body);
  });
  it("空筛选 bean={}，无 delete/batch/import/export 管理方法", async () => {
    const mock = mockFetchSequence([
      { body: { code: 1, msg: "ok", result: { list: [], total: 0, pageSize: 10, pageNumber: 1 } } },
    ]);
    await systemApi.systemConfig.findByPage({ page: 1, pageSize: 10, bean: {} });
    expect(JSON.parse(callOf(mock)[1].body as string)).toEqual({ page: 1, pageSize: 10, bean: {} });
    expect(Object.keys(systemApi.systemConfig)).toHaveLength(13);
    expect(
      Object.keys(systemApi.systemConfig).some((key) => /delete|batch|import|export/i.test(key)),
    ).toBe(false);
  });
  it("创建 0、可空值和畸形预检原样交给 hooks 处理", async () => {
    mockFetchSequence([
      { body: { code: 1, msg: "ok", result: 0 } },
      { body: { code: 1, msg: "ok", result: null } },
      { body: { code: 1, msg: "ok", result: "false" } },
    ]);
    expect(await systemApi.systemConfig.createSystemConfig(create)).toBe(0);
    expect(await systemApi.systemConfig.getConfigValue(configKey)).toBeNull();
    expect(await systemApi.systemConfig.existsByConfigKey(configKey)).toBe("false");
  });
  it("业务错误/HTTP/网络失败抛异常，不能冒充 false", async () => {
    mockFetchSequence([{ body: { code: 10003, msg: "更新失败", result: null } }]);
    await expect(systemApi.systemConfig.updateSystemConfig(update)).rejects.toBeInstanceOf(
      ApiBusinessError,
    );
    mockFetchSequence([{ status: 403, body: { msg: "禁止访问" } }]);
    await expect(
      systemApi.systemConfig.validateConfigValue(configKey, configValue),
    ).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(systemApi.systemConfig.getConfigByKey(configKey)).rejects.toThrow();
  });
});
