import { LogService } from '@/Config/logger/utils'
import morgan from 'morgan'

const morganMiddleware = morgan(':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', {
    stream: {
        write: (message: string) => LogService.NETWORK.http(message.trim()),
    },
})

export default morganMiddleware