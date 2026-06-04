import { Error, Types } from 'mongoose'
import { TCustomErrorResponse } from "@/Utils/types/response.type";

export const processMongooseValidationError = (err: Error.ValidationError | Error.CastError): TCustomErrorResponse => {
    let errorMessages;
    if ((err instanceof Error.ValidationError)) {
        errorMessages = Object.values(err.errors).map((each: Error.ValidatorError | Error.CastError) => {
            return {
                path: each?.path,
                message: each?.message
            }
        })
    } else if ((err instanceof Error.CastError)) {
        errorMessages = [{
            path: err.path || "",
            message: err.message || ""
        }]
    }

    const result: TCustomErrorResponse = {
        errorMessages,
        statusCode: 400,
        message: "Validation failed."
    }

    return result
}

export const isValidMongoID = (id: string): boolean => {
    return Types.ObjectId.isValid(id);
}