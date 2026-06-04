import { RedisClient } from "@/Config/redis/connection";
import { buildQuery } from "../logic/query";
import { Condition, SchemaField, SearchOptions, SearchResult } from "../types";

class RedisSearchService {
  private client = RedisClient;

  async createIndex(indexKey: string, prefix: string, schema: SchemaField): Promise<void> {
    const indexes = await this.client.call("FT._LIST");
    const exists = Array.isArray(indexes) && (indexes as any[]).includes(indexKey);
    if (exists) return;
    const schemaFields = Object.entries(schema).flatMap(([f, t]) => [f, t]);
    await this.client.call("FT.CREATE", indexKey, "ON", "JSON", "PREFIX", "1", prefix, "SCHEMA", ...schemaFields);
  }

  async dropIndex(indexKey: string): Promise<void> {
    await this.client.call("FT.DROP", indexKey);
  }

  async search<T = any>(indexKey: string, conditions?: Condition[] | string, options?: SearchOptions): Promise<SearchResult<T>> {
    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 10;
    const offset = (page - 1) * limit;
    const sortBy = options?.sortBy;
    const sortOrder = options?.sortOrder || "ASC";
    const returnPaths = options?.returnPaths && options.returnPaths.length ? options.returnPaths : ["$"];
    const query = buildQuery(conditions);

    const args: Array<string | number> = ["FT.SEARCH", indexKey, query];
    if (sortBy) args.push("SORTBY", sortBy, sortOrder);
    args.push("LIMIT", offset, limit);
    args.push("RETURN", returnPaths.length, ...returnPaths);

    const res = (await (this.client.call as any)(...args)) as any[];
    const total = (res && res[0]) || 0;
    const items: T[] = [];
    for (let i = 1; i < res.length; i += 2) {
      const fieldsArr = res[i + 1] as any[];
      if (Array.isArray(fieldsArr)) {
        const idx = fieldsArr.findIndex(v => v === "$");
        const jsonStr = idx >= 0 ? fieldsArr[idx + 1] : typeof fieldsArr[1] === "string" ? fieldsArr[1] : null;
        if (jsonStr) {
          try {
            items.push(JSON.parse(jsonStr));
          } catch {}
        }
      }
    }
    return { total: Number(total) || 0, items, page, limit };
  }
}

export { RedisSearchService };

