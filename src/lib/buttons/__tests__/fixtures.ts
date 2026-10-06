/** Explicit frontend fixtures, never production menu data. */
import { deriveSnapshot } from "../../access/snapshot";
import { getAccessSnapshot, publishAccess } from "../../access/store";
import type { AuthenticatedUser } from "../../api/types";
import type { MenuResponse } from "../../api/system-types";
export const FIXTURE_CODES = ["fixture:create", "fixture:edit"];
export function fixtureMenu(code: string, id: number): MenuResponse {
  return {
    id,
    name: code,
    parentId: null,
    type: 3,
    permission: code,
    path: null,
    icon: null,
    openType: null,
    uri: null,
    sort: 0,
    hidden: false,
    keepAlive: null,
    memo: null,
    createdAt: null,
    updatedAt: null,
  };
}
export function publishFixture({
  codes = FIXTURE_CODES,
  authorities = codes,
  userId = "7",
  generation = 3,
  revision = 9,
  roles = [],
}: {
  codes?: string[];
  authorities?: string[];
  userId?: string;
  generation?: number;
  revision?: number;
  roles?: string[];
} = {}) {
  const user: AuthenticatedUser = {
    userId,
    userName: "fixture",
    cnName: null,
    extraInfo: {},
    roles,
    authorities,
  };
  publishAccess(
    {
      ...getAccessSnapshot(),
      ...deriveSnapshot(
        user,
        codes.map((code, index) => fixtureMenu(code, index + 1)),
      ),
      userId,
      sessionGeneration: generation,
      revision,
      status: "ready",
      fetchedAt: 1,
      error: null,
    },
    "test-fixture",
  );
}
