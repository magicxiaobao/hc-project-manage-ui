import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiBusinessError, createApiClient } from "../client";

afterEach(() => vi.unstubAllGlobals());

describe("raw 401 刷新重放", () => {
  it("刷新成功后返回重放的原始 Response，body 未被消费", async () => {
    let credential: string | null = String(1);
    const client = createApiClient({ baseUrl: "http://test", getToken: () => credential });
    const replay = new Response(new Uint8Array([0, 128, 255]), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 1, result: String(2) })))
      .mockResolvedValueOnce(replay);
    vi.stubGlobal("fetch", fetchMock);
    const refresh = vi.fn(async () => {
      const response = await client.post<string>("/auth/v1/refreshToken");
      credential = response;
      return true;
    });
    client.setTokenRefresher(refresh);

    const result = await client.raw("/user/v1/7/avatar/content", { method: "GET" });
    expect(result).toBe(replay);
    expect(result.bodyUsed).toBe(false);
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([0, 128, 255]));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe("http://test/user/v1/7/avatar/content");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("token")).toBe(credential);
  });

  it("刷新确认失效并清凭证后抛 ApiBusinessError 10109", async () => {
    let credential: string | null = String(1);
    const unauthorized = vi.fn();
    const client = createApiClient({ getToken: () => credential, onUnauthorized: unauthorized });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    client.setTokenRefresher(async () => {
      credential = null;
      return false;
    });

    const error = await client.raw("/user/v1/7/avatar/content").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(error).toMatchObject({ code: 10109, httpStatus: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("raw 和信封请求的并发 401 共用一次刷新", async () => {
    const client = createApiClient({ getToken: () => null });
    let finishRefresh!: (value: boolean) => void;
    let refreshStarted!: () => void;
    const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
    const refresh = vi.fn(() => {
      refreshStarted();
      return new Promise<boolean>((resolve) => { finishRefresh = resolve; });
    });
    client.setTokenRefresher(refresh);
    const replay = new Response("avatar");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(replay)
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 1, result: "me" })));
    vi.stubGlobal("fetch", fetchMock);

    const rawResult = client.raw("/user/v1/7/avatar/content");
    const requestResult = client.get("/auth/v1/me");
    await started;
    expect(refresh).toHaveBeenCalledTimes(1);
    finishRefresh(true);
    const [response, data] = await Promise.all([rawResult, requestResult]);
    expect(response).toBe(replay);
    expect(await response.text()).toBe("avatar");
    expect(data).toBe("me");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each(["/auth/v1/login", "/auth/v1/refreshToken"])("%s 自身 401 不刷新且保持原始响应", async (path) => {
    const client = createApiClient({ getToken: () => null });
    const refresh = vi.fn(async () => true);
    client.setTokenRefresher(refresh);
    const response = new Response("authentication error", { status: 401 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    expect(await client.raw(path)).toBe(response);
    expect(await response.text()).toBe("authentication error");
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("重放仍 401 时停止刷新并抛登录失效错误", async () => {
    const unauthorized = vi.fn();
    const client = createApiClient({ getToken: () => null, onUnauthorized: unauthorized });
    const refresh = vi.fn(async () => true);
    client.setTokenRefresher(refresh);
    const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.raw("/user/v1/7/avatar/content")).rejects.toMatchObject({ code: 10109 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });
});
