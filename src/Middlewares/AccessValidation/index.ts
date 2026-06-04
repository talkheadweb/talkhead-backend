// import { ESessionType } from "@/App/sso/Auth/auth.types";
// import RedisServices from "@/App/sso/Redis/services";
// import CustomError from "@/Utils/errors/customError.class";
// import catchAsync from "@/Utils/helper/catchAsync";
// import { NextFunction, Request, Response } from "express";

// const checkValidateAccess = catchAsync(async (req: Request, res: Response, next: NextFunction) => {

//     const sessionId = req.cookies['auth-session-id']
//     if (!sessionId) {
//         throw new CustomError('Access permission denied. ', 401)
//     }

//     const sessionData = await RedisServices.login.getSession({ sessionType: ESessionType.LOGIN, sessionId })

//     if (!sessionData) {
//         //delete current cookie
//         res.clearCookie('auth-session-id')
//         throw new CustomError('Access permission denied. ', 401)
//     }

//     req.headers['email'] = sessionData.email
//     req.headers['role'] = sessionData.role
//     req.headers['_id'] = sessionData._id.toString()
//     req.headers['name'] = sessionData.name
//     req.headers['profilePicture'] = sessionData.profilePicture

//     next()
// })

// export const AccessMiddlewares = {
//     checkValidateAccess
// }