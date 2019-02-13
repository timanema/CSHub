import {DataList} from "./DataList";
import {Socket} from "socket.io";
import {
    ServerDataUpdated,
    IRealtimeEdit
} from "../../../../../cshub-shared/src/api-calls";
import dayjs, {Dayjs} from "dayjs";
// @ts-ignore
import Delta from "quill-delta/dist/Delta";
import {DatabaseResultSet, query} from "../../../utilities/DatabaseConnection";
import logger from "../../../utilities/Logger";
import {getRandomNumberLarge} from "../../../../../cshub-shared/src/utilities/Random";
import {io} from "./socket-receiver";
import {validateAccessToken} from "../../../auth/JWTHandler";
import async from "async";

type deltaReturnType = {
    fullDelta: Delta,
    oldDelta: Delta,
    latestTime: Dayjs
};

export class DataUpdatedHandler {

    public static postHistoryHandler = new DataList();

    private static isUpdatingPost = false;
    private static editQueue: IRealtimeEdit[] = [];

    public static async applyNewEdit(currEdit: IRealtimeEdit, currSocket: Socket): Promise<void> {

        DataUpdatedHandler.editQueue.push(currEdit);

        if (!DataUpdatedHandler.isUpdatingPost) {
            DataUpdatedHandler.isUpdatingPost = true;

            async.whilst(
                () => DataUpdatedHandler.editQueue.length !== 0,
                (next) => {

                    const edit = this.editQueue.shift();

                    const previousServerId = this.postHistoryHandler.getPreviousServerID(edit.postHash);

                    if (typeof edit.prevServerGeneratedId === "undefined") {
                        try {
                            edit.prevServerGeneratedId = this.postHistoryHandler.getPreviousServerIDOfUser(edit);
                        } catch {
                            const response = new ServerDataUpdated(null, "Wrong previous state!");
                            currSocket.emit(response.URL, response);
                            next();
                            return;
                        }
                    }

                    if (edit.prevServerGeneratedId !== previousServerId && previousServerId !== -1) {
                        logger.verbose("Performing operational transform");
                        logger.verbose(`Current server id: ${edit.serverGeneratedId}, previous: ${edit.prevServerGeneratedId} last few edits server id ${previousServerId}`);
                        try {
                            edit.delta = this.postHistoryHandler.transformArray(edit, false);
                        } catch {
                            logger.error("Invalid transform");
                            const response = new ServerDataUpdated(null, "Invalid transform!");
                            currSocket.emit(response.URL, response);
                            next();
                            return;
                        }

                        logger.verbose(`Done transforming: ${JSON.stringify(edit.delta)}`);
                    }

                    const serverGeneratedIdentifier = getRandomNumberLarge();
                    DataUpdatedHandler.postHistoryHandler.addPostEdit({
                        ...edit,
                        serverGeneratedId: serverGeneratedIdentifier,
                        prevServerGeneratedId: previousServerId
                    });

                    const userModel = validateAccessToken(currSocket.request.cookies["token"]);

                    const serverEdit: IRealtimeEdit = {
                        postHash: edit.postHash,
                        delta: edit.delta,
                        timestamp: dayjs(),
                        serverGeneratedId: serverGeneratedIdentifier,
                        prevServerGeneratedId: previousServerId,
                        userId: userModel.user.id,
                        userGeneratedId: edit.userGeneratedId,
                        prevUserGeneratedId: edit.prevUserGeneratedId
                    };

                    const roomId = `POST_${edit.postHash}`;

                    const response = new ServerDataUpdated(serverEdit);
                    io.to(roomId).emit(response.URL, response);

                    next();
                }, () => {
                    DataUpdatedHandler.isUpdatingPost = false;
                });
        }
    }

    public static getOldAndNewDeltas(postHash: number): Promise<deltaReturnType> {
        return query(`
          SELECT T1.content,
                 T1.datetime,
                 T1.approved
          FROM edits T1
                 INNER JOIN posts T2 ON T1.post = T2.id
          WHERE T2.hash = ?
          ORDER BY T1.datetime ASC
        `, postHash)
            .then((edits: DatabaseResultSet) => {

                const dbEdits: Array<{ content: Delta, datetime: Dayjs, approved: boolean }> = [];

                for (const editObj of edits) {
                    dbEdits.push({
                        content: new Delta(JSON.parse(editObj.getStringFromDB("content"))),
                        datetime: dayjs(editObj.getStringFromDB("datetime")),
                        approved: editObj.getNumberFromDB("approved") === 1
                    });
                }

                let fullDelta: Delta = null;
                let oldDelta: Delta = null;

                for (const dbEdit of dbEdits) {
                    if (fullDelta === null) {
                        fullDelta = dbEdit.content;
                    } else if (dbEdit.approved) {
                        fullDelta = fullDelta.compose(dbEdit.content);
                    } else {
                        oldDelta = fullDelta.slice();
                        fullDelta = fullDelta.compose(dbEdit.content);
                        break;
                    }
                }

                if (oldDelta === null && fullDelta !== null) {
                    oldDelta = fullDelta.slice();
                }

                if (oldDelta === null) {
                    oldDelta = new Delta();
                }

                if (fullDelta === null) {
                    fullDelta = new Delta();
                }

                let latestTime: Dayjs;

                if (dbEdits.length === 0) {
                    latestTime = null;
                } else {
                    latestTime = dbEdits[dbEdits.length - 1].datetime;
                }

                const returnedValue: deltaReturnType = {
                    fullDelta,
                    oldDelta,
                    latestTime
                };

                return returnedValue;
            })
            .catch(err => {
                logger.error(`Getting current post data failed`);
                logger.error(err);
                return null;
            });
    }

    public static async getCurrentPostData(postHash: number): Promise<IRealtimeEdit> {

        return this.getOldAndNewDeltas(postHash)
            .then((deltas: deltaReturnType) => {
                const prevEdit = this.postHistoryHandler.getPreviousServerID(postHash);

                const returnedValue: IRealtimeEdit = {
                    postHash,
                    delta: deltas.fullDelta,
                    timestamp: deltas.latestTime,
                    serverGeneratedId: prevEdit,
                    prevServerGeneratedId: null,
                    userGeneratedId: null
                };

                return returnedValue;
            });

    }
}
