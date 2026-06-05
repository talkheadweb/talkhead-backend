import { pickFunction } from "@/Utils/helper/pickFunction";
import {
    IQueryItems,
    PaginationKeys,
    SortKeys,
    TPaginationOptions,
    TSearchOption,
    TSortOptions
} from "@/Utils/types/query.type";
import { Request } from "express";
import { Types } from "mongoose";
import CustomError from "../errors/customError.class";

export const calculatePagination = (data: Partial<TPaginationOptions>): TPaginationOptions => {
    const page  = Number(data.page  || 1);
    const limit = Number(data.limit || 10);
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
};

export const manageSorting = <T>(data: Partial<TSortOptions<T>>): TSortOptions<T> => {
    const sortOrder = data.sortOrder || "desc";
    const sortBy    = data.sortBy    || "createdAt";
    return { sortOrder, sortBy };
};

export const queryOptimization = <M>(
    req         : Request,
    fields      : (keyof M)[],
    extraFields : string[] = [],
): IQueryItems<Partial<M>> => {
    const search    : Partial<TSearchOption>    = pickFunction(req.query, ["search"]);
    const filter    = pickFunction(req.query, [
        ...fields.map((field) => String(field)),
        ...extraFields,
    ]) as Partial<M>;
    const pagination: Partial<TPaginationOptions> = pickFunction(req.query, PaginationKeys);
    const sort      : Partial<TSortOptions<M>>    = pickFunction(req.query, SortKeys);

    return {
        searchFields    : search ?? '',
        paginationFields: pagination,
        sortFields      : sort,
        filterFields    : filter,
    };
};

/**
 * Converts a query parameter value into a MongoDB filter fragment.
 *
 * fieldType controls how the value is interpreted:
 *  - "String"      → case-insensitive regex        { fieldName: { $regex, $options } }
 *  - "Number"      → exact number match            { fieldName: Number(value) }
 *  - "NumberRange" → min/max range ($gte/$lte)     { fieldName: { $gte?, $lte? } }
 *  - "Boolean"     → boolean match                 { fieldName: true|false }
 *  - "ObjectId"    → ObjectId equality             { fieldName: value }
 *  - "Date"        → same-day range                { fieldName: { $gte: startOfDay, $lte: endOfDay } }
 *
 * Usage in a service:
 *   // Exact match
 *   const filter = MongoQueryHelper("Number", "price", req.query.price as string);
 *
 *   // Range — pass an object with optional min and/or max
 *   const filter = MongoQueryHelper("NumberRange", "price", {
 *     min: req.query.min_price as string | undefined,
 *     max: req.query.max_price as string | undefined,
 *   });
 *
 *   Model.find(filter);
 */
export const MongoQueryHelper = (
    fieldType  : "String" | "Number" | "NumberRange" | "Boolean" | "ObjectId" | "Date",
    fieldName  : string,
    searchValue: string | { min?: string; max?: string },
): Record<string, unknown> => {

    // NumberRange takes an object — handle it before the string-only cases below
    if (fieldType === "NumberRange") {
        if (typeof searchValue !== "object")
            throw new CustomError(`NumberRange expects { min?, max? } for field "${fieldName}".`, 400);
        const { min, max } = searchValue;
        if (min === undefined && max === undefined)
            throw new CustomError(`At least one of min or max is required for field "${fieldName}".`, 400);
        const range: Record<string, number> = {};
        if (min !== undefined) {
            const n = Number(min);
            if (isNaN(n)) throw new CustomError(`Invalid min value for field "${fieldName}".`, 400);
            range.$gte = n;
        }
        if (max !== undefined) {
            const n = Number(max);
            if (isNaN(n)) throw new CustomError(`Invalid max value for field "${fieldName}".`, 400);
            range.$lte = n;
        }
        return { [fieldName]: range };
    }

    // All remaining types require a plain string value
    if (typeof searchValue !== "string")
        throw new CustomError(`Expected a string value for field "${fieldName}".`, 400);

    switch (fieldType) {

        case "Number": {
            const num = Number(searchValue);
            if (isNaN(num)) throw new CustomError(`Invalid number for field "${fieldName}".`, 400);
            return { [fieldName]: num };
        }

        case "Boolean": {
            // Use strict string comparison — Boolean("false") === true which is wrong
            if (searchValue !== "true" && searchValue !== "false") {
                throw new CustomError(`Invalid boolean for field "${fieldName}". Use "true" or "false".`, 400);
            }
            return { [fieldName]: searchValue === "true" };
        }

        case "ObjectId": {
            if (!Types.ObjectId.isValid(searchValue))
                throw new CustomError(`Invalid ObjectId for field "${fieldName}".`, 400);
            return { [fieldName]: searchValue };
        }

        case "Date": {
            const date = new Date(searchValue);
            if (isNaN(date.getTime()))
                throw new CustomError(`Invalid date format for field "${fieldName}".`, 400);
            const start = new Date(date); start.setHours(0, 0, 0, 0);
            const end   = new Date(date); end.setHours(23, 59, 59, 999);
            return { [fieldName]: { $gte: start, $lte: end } };
        }

        default: // "String"
            return { [fieldName]: { $regex: searchValue, $options: "i" } };
    }
};
