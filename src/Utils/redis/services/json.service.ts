import { RedisClient } from "@/Config/redis/connection";

class RedisJsonService {
  private client = RedisClient;

  async setJSON(key: string, data: Record<string, any>, ttlSeconds?: number): Promise<"OK"> {
    const res = await this.client.call("JSON.SET", key, "$", JSON.stringify(data));
    if (ttlSeconds && ttlSeconds > 0) await this.client.expire(key, ttlSeconds);
    return res as "OK";
  }

  async updateJSON(key: string, updates: Record<string, any>, ttlSeconds?: number): Promise<boolean> {
    for (const [field, value] of Object.entries(updates)) {
      await this.client.call("JSON.SET", key, `$.${field}`, JSON.stringify(value));
    }
    if (ttlSeconds && ttlSeconds > 0) await this.client.expire(key, ttlSeconds);
    return true;
  }

  async getJSON<T = any>(key: string, path: string = "$"): Promise<T | null> {
    const res = (await this.client.call("JSON.GET", key, path)) as string | null;
    if (!res) return null;
    return JSON.parse(res) as T;
  }

  async mgetJSON<T = any>(keys: string[], path: string = "$"): Promise<(T | null)[]> {
    if (!keys.length) return [];
    const res = (await this.client.call("JSON.MGET", ...keys, path)) as Array<string | null>;
    return res.map(r => (r ? JSON.parse(r) : null));
  }

  async deleteKey(key: string): Promise<boolean> {
    const res = await this.client.del(key);
    return res === 1;
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.exists(key);
    return res === 1;
  }

  async scanByPrefix(prefix: string, count: number = 100): Promise<string[]> {
    let cursor = "0";
    const keys: string[] = [];
    do {
      const [next, found] = (await this.client.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", count)) as any[];
      cursor = next;
      if (Array.isArray(found)) keys.push(...found);
    } while (cursor !== "0");
    return keys;
  }
}

export { RedisJsonService };

