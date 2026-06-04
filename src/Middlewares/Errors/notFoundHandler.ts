import {Request, Response} from "express";
import {sendResponse} from "@/Utils/helper/sendResponse";

const notFoundHandler = async (req: Request, res: Response) => {

    sendResponse.error(res, {
        statusCode: 404,
        message: 'Not Found',
        errorMessages: [{
            path: req.originalUrl,
            message: 'path not found'
        }],
        req
    })
}

export default notFoundHandler