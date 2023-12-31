const fs                            /**/ = require('fs');
const cors                          /**/ = require('cors');
import express, { Express, Request, Response, NextFunction } from 'express';
import { createPool }               /**/ from 'mysql2/promise';
import { DrumbeatMessageStatus }    /**/ from './drumbeatmessagestatus';
import { DrumbeatResponseStatus }   /**/ from './drumbeatresponsestatus';
import { DrumbeatMessage }          /**/ from './drumbeatmessage';

interface DrumbeatServerOptions {
    host:                           /**/ string,
    database:                       /**/ string,
    user:                           /**/ string,
    password?:                      /**/ string,
    ssl:                            /**/ boolean,
    waitForConnections:             /**/ boolean,
    connectionLimit:                /**/ number,
    queueLimit:                     /**/ number,
    tokens                          /**/: DrumbeatTokenDefinition[],
}

interface DrumbeatTokenDefinition {
    token:                          /**/ string,
    queue:                          /**/ string,
    isAdmin:                        /**/ boolean,
    isWorker:                       /**/ boolean,
}

type HandlerParameterList = (
    ':queue' |
    ':id' |
    'queryStatus' |
    'bodySubject' |
    'bodyStatus'
)[];

export class DrumbeatServer {

    #host                           /**/: string;
    #user                           /**/: string;
    #password?                      /**/: string;
    #database                       /**/: string;
    #ssl                            /**/: boolean;
    #waitForConnections             /**/: boolean;
    #connectionLimit                /**/: number;
    #queueLimit                     /**/: number;
    #tokens                         /**/: DrumbeatTokenDefinition[];

    #dbPool                         /**/: any;

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    //
    //
    //
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    constructor(opts: DrumbeatServerOptions) {
        this.#host                      /**/ = opts.host;
        this.#user                      /**/ = opts.user;
        this.#password                  /**/ = opts.password;
        this.#database                  /**/ = opts.database;
        this.#ssl                       /**/ = opts.ssl;
        this.#waitForConnections        /**/ = opts.waitForConnections          /**/ ?? true;
        this.#connectionLimit           /**/ = opts.connectionLimit             /**/ ?? 10;
        this.#queueLimit                /**/ = opts.queueLimit                  /**/ ?? 0;
        this.#tokens                    /**/ = opts.tokens;

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup express
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const app = express();
        app.use(cors());
        app.use(express.json());

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup handlers
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        app.post('/:queue',                 /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', 'bodySubject']));
        app.post('/:queue',                 /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.post('/:queue',                 /**/ async (req, res, next) => this.handleRequestCreate(req, res, next));

        app.get('/:queue/',                 /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue']));
        app.get('/:queue/',                 /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.get('/:queue/',                 /**/ async (req, res, next) => this.handleRequestList(req, res, next));

        app.get('/:queue/:id',              /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.get('/:queue/:id',              /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.get('/:queue/:id',              /**/ async (req, res, next) => this.handleRequestGet(req, res, next));

        app.delete('/:queue/:id',           /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.delete('/:queue/:id',           /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.delete('/:queue/:id',           /**/ async (req, res, next) => this.handleRequestDelete(req, res, next));

        app.patch('/:queue/:id/cancel',     /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.patch('/:queue/:id/cancel',     /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.patch('/:queue/:id/cancel',     /**/ async (req, res, next) => this.handleRequestCancel(req, res, next));

        app.patch('/:queue/:id/postback',   /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id', 'bodyStatus']));
        app.patch('/:queue/:id/postback',   /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.patch('/:queue/:id/postback',   /**/ async (req, res, next) => this.handleRequestPostback(req, res, next));

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup database
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        this.#dbPool = createPool({
            host:                       /**/ this.#host,
            user:                       /**/ this.#user,
            password:                   /**/ this.#password,
            database:                   /**/ this.#database,
            ...(
                this.#ssl ? { ssl: { ca: fs.readFileSync(__dirname + '/../../extras/DigiCertGlobalRootCA.crt.pem') } } : {}
            ),
            waitForConnections:         /**/ this.#waitForConnections,
            connectionLimit:            /**/ this.#connectionLimit,
            queueLimit:                 /**/ this.#queueLimit,
        });

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Server
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        app.listen(process.env.PORT || 3000, () => {
            console.log('Server is running');
        });
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbApplyBodies
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    dbApplyBodies(record: DrumbeatMessage) {
        record.status = DrumbeatMessageStatus.deserialize((record.status as unknown) as number);
        if (record.requestBody !== undefined) record.requestBody = JSON.parse(record.requestBody);
        if (record.responseBody !== undefined) record.responseBody = JSON.parse(record.responseBody);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbCreate
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbCreate(queue: string, subject: string, requestBody: any): Promise<number> {
        let [result] = await this.#dbPool.execute(`
            insert into message(
                queue,
                subject, 
                status, 
                timeStart, 
                requestBody
            )
            values(
                ?,
                ?,
                ?,
                NOW(),
                ?
            )
        `, [
            queue,
            subject,
            DrumbeatMessageStatus.serialize(DrumbeatMessageStatus.Pending),
            requestBody === undefined ? null : JSON.stringify(requestBody),
        ]);
        return result.insertId;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbGet
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbGet(queue: string, id: number): Promise<DrumbeatMessage | undefined> {
        let [rows]: [DrumbeatMessage[]] = await this.#dbPool.execute(`
            select      *
            from        message
            where       id=?
        `, [id]);

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Need to have found a record
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const record = rows[0];
        if (record === undefined) return undefined;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Record must belong to queue
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (record.queue !== queue) return undefined;

        this.dbApplyBodies(record);
        return record;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbDelete
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbDelete(id: number): Promise<void> {
        let [result]: [DrumbeatMessage[]] = await this.#dbPool.execute(`
            delete
            from        message
            where       id=?
        `, [id]);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbFeedback
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbFeedback(id: number, status: DrumbeatMessageStatus, responseBody?: any): Promise<void> {
        let [result]: [DrumbeatMessage[]] = await this.#dbPool.execute(`
            update      message
            set         status=?,
                        responsebody=?,
                        timeEnd=NOW()
            where       id=?
            and         status=?
        `, [
            DrumbeatMessageStatus.serialize(status),
            responseBody === undefined ? null : JSON.stringify(responseBody),
            id,
            DrumbeatMessageStatus.serialize(DrumbeatMessageStatus.Pending),
        ]);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbGetPendingBySubject
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbGetPendingBySubject(queue: string, subject: string): Promise<DrumbeatMessage | undefined> {
        let [rows]: [DrumbeatMessage[]] = await this.#dbPool.execute(`
            select      *
            from        message
            where       queue=?
            and         subject=?
            and         status=?
        `, [
            queue,
            subject,
            DrumbeatMessageStatus.serialize(DrumbeatMessageStatus.Pending),
        ]);

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Need to have found a record
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const record = rows[0];
        if (record === undefined) return undefined;

        this.dbApplyBodies(record);
        return record;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbList
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbList(queue: string, status?: DrumbeatMessageStatus): Promise<DrumbeatMessage[]> {
        let [rows]: [DrumbeatMessage[]] =
            status === undefined
                ? await this.#dbPool.execute(`
                    select      *
                    from        message
                    where       queue=?
                `, [queue])
                : await this.#dbPool.execute(`
                    select      *
                    from        message
                    where       queue=?
                    and         status=?
                `, [queue, DrumbeatMessageStatus.serialize(status)]);
        for (let record of rows) this.dbApplyBodies(record);
        return rows;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbCancel
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbCancel(id: number): Promise<void> {
        let [result]: [DrumbeatMessage[]] = await this.#dbPool.execute(`
            update      message
            set         status=?
            where       id=?
            and         status=?
        `, [
            DrumbeatMessageStatus.serialize(DrumbeatMessageStatus.Cancelled),
            id,
            DrumbeatMessageStatus.serialize(DrumbeatMessageStatus.Pending),
        ]);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpAccessDenied
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpAccessDenied(res: Response, result?: DrumbeatResponseStatus) {
        res.status(403).json({ result: result ?? DrumbeatResponseStatus.ErrorAccessDenied });
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpBadRequest
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpBadRequest(res: Response, result?: DrumbeatResponseStatus) {
        res.status(400).json({ result: result ?? DrumbeatResponseStatus.ErrorBadRequest });
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpBadRequest
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpNotFound(res: Response) {
        res.status(404).json({ result: DrumbeatResponseStatus.ErrorNotFound });
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpOk
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpOk(res: Response, data?: any) {
        res.status(200).json({ result: DrumbeatResponseStatus.Ok, data: data });
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramQueue
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramQueue(req: Request): string | undefined {
        return req.params?.queue === ':queue'
            ? undefined
            : req.params?.queue
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramId
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramId(req: Request): number | undefined {
        try {
            const rawValue = req.params?.id;
            if (rawValue === ':id') return undefined;
            const value = parseInt(rawValue);
            if (isNaN(value)) return undefined;
            return value;
        } catch (e) {
            return undefined;
        }
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramQueryStatus
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramQueryStatus(req: Request): DrumbeatMessageStatus | undefined {
        return DrumbeatMessageStatus.isValid(req.query.status)
            ? req.query.status as DrumbeatMessageStatus
            : undefined;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramBodyStatus
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramBodyStatus(req: Request): DrumbeatMessageStatus | undefined {
        return DrumbeatMessageStatus.isValid(req.body?.status)
            ? req.body?.status as DrumbeatMessageStatus
            : undefined;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramBodySubject
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramBodySubject(req: Request): string | undefined {
        return req.body?.subject as string | undefined;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    requireParameters
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    requireParameters(req: Request, res: Response, next: NextFunction, parameters: HandlerParameterList) {

        const testSingleParameter = (value: string | number | undefined) => {
            if (value === undefined) {
                this.httpBadRequest(res);
                return false;
            } else {
                return true;
            }
        }

        for (const name of parameters) {
            let value;
            switch (name) {
                case ':queue':
                    value = this.paramQueue(req);
                    break;
                case ':id':
                    value = this.paramId(req);
                    break;
                case 'queryStatus':
                    value = this.paramQueryStatus(req);
                    break;
                case 'bodyStatus':
                    value = this.paramBodyStatus(req);
                    break;
                case 'bodySubject':
                    value = this.paramBodySubject(req);
                    break;
            }
            if (!testSingleParameter(value)) return;
        }
        next();
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    messageFromParamQueuAndId
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async messageFromParamQueueAndId(req: Request, res: Response): Promise<DrumbeatMessage | undefined> {
        const queue = this.paramQueue(req)!;
        const id = this.paramId(req)!;

        let message = await this.dbGet(queue, id);
        if (message === undefined) {
            this.httpNotFound(res);
            return undefined;
        }

        return message;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    authGetToken
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    authGetToken(req: Request): string | undefined {

        const authHeader = req.headers.authorization;
        if (!authHeader) return undefined;
        if (!authHeader.startsWith('Bearer ')) return undefined;

        const token = authHeader.slice(7);
        return Buffer.from(token, 'base64').toString('utf8');
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    authIsWorker
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    authIsWorker(req: Request) {
        const queue = this.paramQueue(req)!;
        const token = this.authGetToken(req);
        if (token === undefined) return false;
        for (const authorization of this.#tokens) {
            if (authorization.token != token) continue;
            if (authorization.queue != queue) continue;
            if (authorization.isWorker) return true;
        }
        return false;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    authIsAdmin
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    authIsAdmin(req: Request) {
        const queue = this.paramQueue(req)!;
        const token = this.authGetToken(req);
        if (token === undefined) return false;
        for (const authorization of this.#tokens) {
            if (authorization.token != token) continue;
            if (authorization.queue != queue) continue;
            if (authorization.isAdmin) return true;
        }
        return false;
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    handleAuthRequireAdmin
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleAuthRequireAdmin(req: Request, res: Response, next: NextFunction) {
        if (this.authIsAdmin(req)) {
            next();
            return;
        }
        this.httpAccessDenied(res);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    handleAuthRequireWorker
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleAuthRequireWorker(req: Request, res: Response, next: NextFunction) {
        if (this.authIsWorker(req)) {
            next();
            return;
        }
        this.httpAccessDenied(res);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    handleAuthRequireAdminOrWorker
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleAuthRequireAdminOrWorker(req: Request, res: Response, next: NextFunction) {
        if (this.authIsAdmin(req) || this.authIsWorker(req)) {
            next();
            return;
        }
        this.httpAccessDenied(res);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestCreate(req: Request, res: Response, next: NextFunction) {
        console.log('handleRequestCreate()');

        const requestBody = req.body?.requestBody;
        const subject = this.paramBodySubject(req)!;
        const queue = this.paramQueue(req)!;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (await this.dbGetPendingBySubject(queue, subject) !== undefined) {
            this.httpBadRequest(res, DrumbeatResponseStatus.ErrorAlreadyScheduled);
            return;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Add
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = await this.dbCreate(queue, subject, requestBody);

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Send response to client
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        this.httpOk(res, id);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestGet(req: Request, res: Response, next: NextFunction) {

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined) return;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Non-admins, so workers, are only permitted to view pending messages
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (!this.authIsAdmin(req)) {
            if (message.status !== DrumbeatMessageStatus.Pending) {
                this.httpAccessDenied(res);
                return;
            }
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Send response to client
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        this.httpOk(res, message);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestDelete(req: Request, res: Response, next: NextFunction) {

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined) return;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req);
        await this.dbDelete(id!);
        this.httpOk(res);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestCancel(req: Request, res: Response, next: NextFunction) {
        console.log('handleRequestCancel()');

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined) return;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (message.status !== DrumbeatMessageStatus.Pending) {
            this.httpBadRequest(res, DrumbeatResponseStatus.ErrorNotPending);
            return;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req);
        await this.dbCancel(id!);
        this.httpOk(res);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestList(req: Request, res: Response, next: NextFunction) {
        const queue = this.paramQueue(req)!;
        let status = this.paramQueryStatus(req);

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Non-admins, so workers, are only permitted to view pending messages
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (!this.authIsAdmin(req)) {
            if (status === undefined) status = DrumbeatMessageStatus.Pending;
            if (status !== DrumbeatMessageStatus.Pending) {
                this.httpAccessDenied(res);
                return;
            }
        }

        const rows = await this.dbList(queue, status);
        this.httpOk(res, rows);
    }

    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestPostback(req: Request, res: Response, next: NextFunction) {

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //Status must be present and valid
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const status = this.paramBodyStatus(req);
        if (!DrumbeatMessageStatus.isValid(status)) {
            this.httpBadRequest(res);
            return;
        }

        // Accept only end statusses
        switch (status) {
            case DrumbeatMessageStatus.Failed:
            case DrumbeatMessageStatus.Completed:
                break;
            default:
                this.httpBadRequest(res);
                return;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined) return;

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (message.status !== DrumbeatMessageStatus.Pending) {
            this.httpBadRequest(res, DrumbeatResponseStatus.ErrorNotPending);
            return;
        }

        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Save
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req)!;
        await this.dbFeedback(id, status, req.body?.responseBody);

        this.httpOk(res);
    }

}