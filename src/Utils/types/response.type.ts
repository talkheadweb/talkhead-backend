import { TGenericErrorMessages } from "@/Utils/types/errors.type";
import { Request } from "express";

export type TCustomErrorResponse = {
    statusCode: number;
    message: string;
    errorMessages?: TGenericErrorMessages[];
    stack?: string;
    req?: Request;
}

export type TGenericSuccessMessages<T, M> = {
    statusCode: number;
    message: string;
    data?: T;
    meta?: M;
    req?: Request;
}
