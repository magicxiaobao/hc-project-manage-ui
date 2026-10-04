/**
 * query key 约定（P1 起所有数据获取统一使用）：
 * - 根命名空间 'hc'：避免与第三方库或其它 QueryClient 的缓存冲突
 * - 结构：['hc', <domain>, <kind>, ...params]，
 *   domain = project | requirement | task；kind = list | detail | enums | …
 * - 失效粒度：精确 key 失效单条；['hc', <domain>] 失效该域全部
 * - 参数只放可 JSON 序列化的原始值对象；同一语义的查询必须传同一形状的参数，
 *   否则缓存会被拆成多份
 */
function domainKeys(domain: 'project' | 'requirement' | 'task' | 'defect') {
  const all = ['hc', domain] as const;
  return {
    all,
    /** 列表查询：params 为请求参数对象（如 { page, pageSize, bean }） */
    list: (params: Record<string, unknown> = {}) => [...all, 'list', params] as const,
    /** 详情查询 */
    detail: (id: number | string) => [...all, 'detail', id] as const,
    /** 允许的状态流转：id + 当前状态（后端按 id 权威计算，状态仅作缓存区分） */
    allowed: (id: number | string, status: string) => [...all, 'allowed', id, status] as const,
    /** 状态流转历史 */
    history: (id: number | string) => [...all, 'history', id] as const,
    /** 需求追溯图：GET /requirement/v1/trace/{id} */
    trace: (id: number | string) => [...all, 'trace', id] as const,
    /** 需求影响范围：GET /requirement/v1/trace/{id}/impact */
    impact: (id: number | string) => [...all, 'impact', id] as const,
    /** 追溯矩阵分页：params 为矩阵查询参数对象 */
    matrix: (params: Record<string, unknown> = {}) => [...all, 'matrix', params] as const,
    /** 子需求列表：GET /requirement/v1/{id}/children */
    children: (id: number | string) => [...all, 'children', id] as const,
    /** 需求层级树：projectId 为空时查全部 */
    hierarchy: (projectId: number | null = null) => [...all, 'hierarchy', projectId] as const,
    /** 评论查询：params 为分页参数对象（如 { page, pageSize }） */
    comments: (id: number | string, params: Record<string, unknown> = {}) => [...all, 'comments', id, params] as const,
    /** 按业务 key（项目 key 等）解析 id 的查询 */
    byKey: (key: string) => [...all, 'byKey', key] as const,
    /** 枚举/选项查询 */
    enums: () => [...all, 'enums'] as const,
  };
}

export const queryKeys = {
  project: domainKeys('project'),
  requirement: domainKeys('requirement'),
  task: domainKeys('task'),
  defect: domainKeys('defect'),
};
