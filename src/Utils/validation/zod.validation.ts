import {z, ZodError, ZodIssue, ZodType} from "zod";
import {TCustomErrorResponse} from "@/Utils/types/response.type";
import {TGenericErrorMessages} from "@/Utils/types/errors.type";

const errorValidation = (err: ZodError): TCustomErrorResponse => {
    const errors: TGenericErrorMessages[] = err.issues.map((issue: ZodIssue) => {
        return {
            path: issue.path[issue.path.length - 1],
            message: issue.message
        }
    })
    return {
        statusCode: 400,
        message: "validation error",
        errorMessages: errors,
    }
}

export const processZodValidation = {
    errorValidation
}
