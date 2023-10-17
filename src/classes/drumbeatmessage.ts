import { DrumbeatMessageStatus } from "./drumbeatmessagestatus";

export interface DrumbeatMessage {
    id:                         /**/ number;
    queue:                      /**/ string;
    status:                     /**/ DrumbeatMessageStatus;
    timeStart:                  /**/ Date;
    timeEnd?:                   /**/ Date;
    requestBody:                /**/ any;
    responseBody?:              /**/ any;
}
