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
    const page = Number(data.page || 1)
    const limit = Number(data.limit || 10)
    const skip = (page - 1) * limit
    return {
        page,
        limit,
        skip,
    }
}

export const manageSorting = <T>(data: Partial<TSortOptions<T>>): TSortOptions<T> => {
    const sortOrder = data.sortOrder || "desc"
    const sortBy = data.sortBy || "createdAt"
    return {
        sortOrder,
        sortBy
    }
}

export const queryOptimization = <M>(req: Request, fields: (keyof M)[], extraFields: string[] = []): IQueryItems<Partial<M>> => {
    const search: Partial<TSearchOption> = pickFunction(req.query, ["search"])
    const filter: any = pickFunction(req.query, [
        ...fields.map((field) => String(field)),
        ...extraFields
    ])
    const pagination: Partial<TPaginationOptions> = pickFunction(req.query, PaginationKeys)
    const sort: Partial<TSortOptions<M>> = pickFunction(req.query, SortKeys)

    return {
        searchFields: search ?? '',
        paginationFields: pagination,
        sortFields: sort,
        filterFields: filter,
    }
}

export const MongoQueryHelper = (fieldType: string, fieldName: string, searchValue: string) => {
    if (fieldType === "Number") {
        //number
        if (!isNaN(Number(searchValue))) {
            switch (fieldName) {
                case "min_price":
                    return {
                        price: {
                            $gte: Number(searchValue)
                        }
                    }
                case "max_price":
                    return {
                        price: {
                            $lte: Number(searchValue)
                        }
                    }
                default:
                    return {
                        [fieldName]: Number(searchValue)
                    }
            }

        } else {
            return {
                [fieldName]: {
                    $exists: false,
                }
            }
        }
    } else if (fieldType === 'ObjectId') {
        /*
        *  validate if you need to query by objectId=> Types.ObjectId.isValid(search)
        * */
        const validate = Types.ObjectId.isValid(searchValue)
        if (!validate) throw new CustomError(`Invalid ObjectId for ${fieldName}`, 400)
        return {
            [fieldName]: validate ? searchValue : {
                $exists: false,
            }
        }
    } else if (fieldType === 'Date') {
        /*
        *  validate if you need to query by Date
        * */
        const dateValue = new Date(searchValue);
        if (isNaN(dateValue.getTime())) {
            throw new CustomError(`Invalid date format for ${fieldName}`, 400);
        }
        
        // Handle specific date field scenarios based on hardcoded field names
        if (fieldName === 'startDate') {
            // For startDate: normalize to start of day and find records from that date onwards
            const startOfDay = new Date(dateValue);
            startOfDay.setHours(0, 0, 0, 0);
            return {
                createdAt: {
                    $gte: startOfDay
                }
            }
        } else if (fieldName === 'endDate') {
            // For endDate: normalize to end of day and find records up to that date
            const endOfDay = new Date(dateValue);
            endOfDay.setHours(23, 59, 59, 999);
            return {
                createdAt: {
                    $lte: endOfDay
                }
            }
        } else {
            // Default: exact date match (same day)
            const startOfDay = new Date(dateValue);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateValue);
            endOfDay.setHours(23, 59, 59, 999);
            
            return {
                [fieldName]: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            }
        }
    } else if (fieldType === 'Boolean') {
        /*
        *  validate if you need to query by Date
        * */
        return {
            [fieldName]: Boolean(searchValue)
        }
    } else {
        //default for string search
        return {
            [fieldName]: {
                $regex: searchValue.toString(),
                $options: "i"
            }
        }
    }
}