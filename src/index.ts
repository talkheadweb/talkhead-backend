/* 
    node application root file
*/

import app from "@/app";
import config from "@/Config";
import connectDB from "@/Config/db";
import { bootstrap } from "@/bootstrap";
import '@/Config/redis/connection';
import '@/Config/redis/events';
import http from "http";
import { LogService } from "./Config/logger/utils";

const server = http.createServer(app)
const log = LogService.APPLICATION
const { port } = config

const main = async () => {
    try {
        await connectDB()
        await bootstrap()
        server.listen(port, () => {
            log.info(`Server is listening on ${port}. Url: http://localhost:${port}`)
        })
    } catch (e) {
        log.error((e as Error).message)
    }
}

main()




process.on('unhandledRejection', (err) => {
    log.error('unhandledRejection =>', err as any)
})

process.on('uncaughtException', (err) => {
    log.error('unhandledException =>', err)
    setTimeout(() => {
        if (server) {
            server.close(() => {
                process.exit(1)
            })
        }
    }, 5000);
})

process.on('SIGTERM', () => {
    log.warn('SIGTERM signal received for graceful shutdown')

    setTimeout(() => {
        if (server) {
            server.close(() => {
                log.info('HTTP server closed, exiting process')
                process.exit(0);
            });
        } else {
            log.info('No server instance, exiting process')
            process.exit(0);
        }
    }, 5000);
});