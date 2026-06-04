export type SchemaFieldType = "TEXT" | "TAG" | "NUMERIC" | "GEO" | "VECTOR";
export type SchemaField = Record<string, SchemaFieldType>;
export type SortOrder = "ASC" | "DESC";

export type NumericRange = [number | "-inf", number | "+inf"];

export type Condition =
  | { field: string; type: "tag"; value: string | string[] }
  | { field: string; type: "text"; value: string | string[] }
  | { field: string; type: "numeric"; range: NumericRange };

export type SearchOptions = {
  sortBy?: string;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
  returnPaths?: string[];
};

export type SearchResult<T = any> = {
  total: number;
  items: T[];
  page: number;
  limit: number;
};

