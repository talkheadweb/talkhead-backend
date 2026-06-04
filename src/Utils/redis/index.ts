import { RedisJsonService } from "./services/json.service";
import { RedisSearchService } from "./services/search.service";
export { RedisJsonService } from "./services/json.service";
export { RedisSearchService } from "./services/search.service";
export * from "./types";
export const RedisJSON = new RedisJsonService();
export const RedisSearch = new RedisSearchService();
