"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrumbeatServer = void 0;
const fs /**/ = require('fs');
const cors /**/ = require('cors');
const express_1 = __importDefault(require("express"));
const promise_1 = require("mysql2/promise");
const drumbeatmessagestatus_1 = require("./drumbeatmessagestatus");
const drumbeatresponsestatus_1 = require("./drumbeatresponsestatus");
class DrumbeatServer {
    #host /**/;
    #user /**/;
    #password;
    #database /**/;
    #ssl /**/;
    #waitForConnections /**/;
    #connectionLimit /**/;
    #queueLimit /**/;
    #tokens /**/;
    #dbPool /**/;
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    //
    //
    //
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    constructor(opts) {
        this.#host /**/ = opts.host;
        this.#user /**/ = opts.user;
        this.#password /**/ = opts.password;
        this.#database /**/ = opts.database;
        this.#ssl /**/ = opts.ssl;
        this.#waitForConnections /**/ = opts.waitForConnections /**/ ?? true;
        this.#connectionLimit /**/ = opts.connectionLimit /**/ ?? 10;
        this.#queueLimit /**/ = opts.queueLimit /**/ ?? 0;
        this.#tokens /**/ = opts.tokens;
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup express
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const app = (0, express_1.default)();
        app.use(cors());
        app.use(express_1.default.json());
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup handlers
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        app.post('/:queue', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', 'bodySubject']));
        app.post('/:queue', /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.post('/:queue', /**/ async (req, res, next) => this.handleRequestCreate(req, res, next));
        app.get('/:queue/', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue']));
        app.get('/:queue/', /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.get('/:queue/', /**/ async (req, res, next) => this.handleRequestList(req, res, next));
        app.get('/:queue/:id', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.get('/:queue/:id', /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.get('/:queue/:id', /**/ async (req, res, next) => this.handleRequestGet(req, res, next));
        app.delete('/:queue/:id', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.delete('/:queue/:id', /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.delete('/:queue/:id', /**/ async (req, res, next) => this.handleRequestDelete(req, res, next));
        app.patch('/:queue/:id/cancel', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id']));
        app.patch('/:queue/:id/cancel', /**/ async (req, res, next) => this.handleAuthRequireAdmin(req, res, next));
        app.patch('/:queue/:id/cancel', /**/ async (req, res, next) => this.handleRequestCancel(req, res, next));
        app.patch('/:queue/:id/postback', /**/ async (req, res, next) => this.requireParameters(req, res, next, [':queue', ':id', 'bodyStatus']));
        app.patch('/:queue/:id/postback', /**/ async (req, res, next) => this.handleAuthRequireAdminOrWorker(req, res, next));
        app.patch('/:queue/:id/postback', /**/ async (req, res, next) => this.handleRequestPostback(req, res, next));
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Setup database
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        this.#dbPool = (0, promise_1.createPool)({
            host: /**/ this.#host,
            user: /**/ this.#user,
            password: /**/ this.#password,
            database: /**/ this.#database,
            ...(this.#ssl ? { ssl: { ca: fs.readFileSync(__dirname + '/../../extras/DigiCertGlobalRootCA.crt.pem') } } : {}),
            waitForConnections: /**/ this.#waitForConnections,
            connectionLimit: /**/ this.#connectionLimit,
            queueLimit: /**/ this.#queueLimit,
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
    dbApplyBodies(record) {
        record.status = drumbeatmessagestatus_1.DrumbeatMessageStatus.deserialize(record.status);
        if (record.requestBody !== undefined)
            record.requestBody = JSON.parse(record.requestBody);
        if (record.responseBody !== undefined)
            record.responseBody = JSON.parse(record.responseBody);
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbCreate
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbCreate(queue, subject, requestBody) {
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
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending),
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
    async dbGet(queue, id) {
        let [rows] = await this.#dbPool.execute(`
            select      *
            from        message
            where       id=?
        `, [id]);
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Need to have found a record
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const record = rows[0];
        if (record === undefined)
            return undefined;
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Record must belong to queue
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (record.queue !== queue)
            return undefined;
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
    async dbDelete(id) {
        let [result] = await this.#dbPool.execute(`
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
    async dbFeedback(id, status, responseBody) {
        let [result] = await this.#dbPool.execute(`
            update      message
            set         status=?,
                        responsebody=?,
                        timeEnd=NOW()
            where       id=?
            and         status=?
        `, [
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(status),
            responseBody === undefined ? null : JSON.stringify(responseBody),
            id,
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending),
        ]);
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbGetPendingBySubject
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbGetPendingBySubject(queue, subject) {
        let [rows] = await this.#dbPool.execute(`
            select      *
            from        message
            where       queue=?
            and         subject=?
            and         status=?
        `, [
            queue,
            subject,
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending),
        ]);
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Need to have found a record
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const record = rows[0];
        if (record === undefined)
            return undefined;
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
    async dbList(queue, status) {
        let [rows] = status === undefined
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
                `, [queue, drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(status)]);
        for (let record of rows)
            this.dbApplyBodies(record);
        return rows;
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    dbCancel
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async dbCancel(id) {
        let [result] = await this.#dbPool.execute(`
            update      message
            set         status=?
            where       id=?
            and         status=?
        `, [
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(drumbeatmessagestatus_1.DrumbeatMessageStatus.Cancelled),
            id,
            drumbeatmessagestatus_1.DrumbeatMessageStatus.serialize(drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending),
        ]);
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpAccessDenied
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpAccessDenied(res, result) {
        res.status(403).json({ result: result ?? drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorAccessDenied });
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpBadRequest
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpBadRequest(res, result) {
        res.status(400).json({ result: result ?? drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorBadRequest });
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpBadRequest
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpNotFound(res) {
        res.status(404).json({ result: drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorNotFound });
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    httpOk
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    httpOk(res, data) {
        res.status(200).json({ result: drumbeatresponsestatus_1.DrumbeatResponseStatus.Ok, data: data });
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramQueue
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramQueue(req) {
        return req.params?.queue === ':queue'
            ? undefined
            : req.params?.queue;
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramId
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramId(req) {
        try {
            const rawValue = req.params?.id;
            if (rawValue === ':id')
                return undefined;
            const value = parseInt(rawValue);
            if (isNaN(value))
                return undefined;
            return value;
        }
        catch (e) {
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
    paramQueryStatus(req) {
        return drumbeatmessagestatus_1.DrumbeatMessageStatus.isValid(req.query.status)
            ? req.query.status
            : undefined;
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramBodyStatus
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramBodyStatus(req) {
        return drumbeatmessagestatus_1.DrumbeatMessageStatus.isValid(req.body?.status)
            ? req.body?.status
            : undefined;
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    paramBodySubject
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    paramBodySubject(req) {
        return req.body?.subject;
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    requireParameters
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    requireParameters(req, res, next, parameters) {
        const testSingleParameter = (value) => {
            if (value === undefined) {
                this.httpBadRequest(res);
                return false;
            }
            else {
                return true;
            }
        };
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
            if (!testSingleParameter(value))
                return;
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
    async messageFromParamQueueAndId(req, res) {
        const queue = this.paramQueue(req);
        const id = this.paramId(req);
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
    authGetToken(req) {
        const authHeader = req.headers.authorization;
        if (!authHeader)
            return undefined;
        if (!authHeader.startsWith('Bearer '))
            return undefined;
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
    authIsWorker(req) {
        const queue = this.paramQueue(req);
        const token = this.authGetToken(req);
        if (token === undefined)
            return false;
        for (const authorization of this.#tokens) {
            if (authorization.token != token)
                continue;
            if (authorization.queue != queue)
                continue;
            if (authorization.isWorker)
                return true;
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
    authIsAdmin(req) {
        const queue = this.paramQueue(req);
        const token = this.authGetToken(req);
        if (token === undefined)
            return false;
        for (const authorization of this.#tokens) {
            if (authorization.token != token)
                continue;
            if (authorization.queue != queue)
                continue;
            if (authorization.isAdmin)
                return true;
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
    async handleAuthRequireAdmin(req, res, next) {
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
    async handleAuthRequireWorker(req, res, next) {
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
    async handleAuthRequireAdminOrWorker(req, res, next) {
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
    async handleRequestCreate(req, res, next) {
        console.log('handleRequestCreate()');
        const requestBody = req.body?.requestBody;
        const subject = this.paramBodySubject(req);
        const queue = this.paramQueue(req);
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (await this.dbGetPendingBySubject(queue, subject) !== undefined) {
            this.httpBadRequest(res, drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorAlreadyScheduled);
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
    async handleRequestGet(req, res, next) {
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined)
            return;
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Non-admins, so workers, are only permitted to view pending messages
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (!this.authIsAdmin(req)) {
            if (message.status !== drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending) {
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
    async handleRequestDelete(req, res, next) {
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined)
            return;
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req);
        await this.dbDelete(id);
        this.httpOk(res);
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestCancel(req, res, next) {
        console.log('handleRequestCancel()');
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined)
            return;
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (message.status !== drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending) {
            this.httpBadRequest(res, drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorNotPending);
            return;
        }
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req);
        await this.dbCancel(id);
        this.httpOk(res);
    }
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // Function:    
    //
    // Description: 
    //
    /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    async handleRequestList(req, res, next) {
        const queue = this.paramQueue(req);
        let status = this.paramQueryStatus(req);
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Non-admins, so workers, are only permitted to view pending messages
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (!this.authIsAdmin(req)) {
            if (status === undefined)
                status = drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending;
            if (status !== drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending) {
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
    async handleRequestPostback(req, res, next) {
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //Status must be present and valid
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const status = this.paramBodyStatus(req);
        if (!drumbeatmessagestatus_1.DrumbeatMessageStatus.isValid(status)) {
            this.httpBadRequest(res);
            return;
        }
        // Accept only end statusses
        switch (status) {
            case drumbeatmessagestatus_1.DrumbeatMessageStatus.Failed:
            case drumbeatmessagestatus_1.DrumbeatMessageStatus.Completed:
                break;
            default:
                this.httpBadRequest(res);
                return;
        }
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Get message
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const message = await this.messageFromParamQueueAndId(req, res);
        if (message === undefined)
            return;
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        if (message.status !== drumbeatmessagestatus_1.DrumbeatMessageStatus.Pending) {
            this.httpBadRequest(res, drumbeatresponsestatus_1.DrumbeatResponseStatus.ErrorNotPending);
            return;
        }
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        // Save
        /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        const id = this.paramId(req);
        await this.dbFeedback(id, status, req.body?.responseBody);
        this.httpOk(res);
    }
}
exports.DrumbeatServer = DrumbeatServer;
//# sourceMappingURL=drumbeatserver.js.map