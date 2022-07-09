import BigNumber from "bignumber.js";
import { Document, model, Schema } from "mongoose";
import BigNumberSchema from "mongoose-bignumber";

export type platforms = "PlayFab" | "Steam";

export interface ILog extends Document {
    ids: { platform: platforms; id: string }[];
    id: string;
    player: string;
    server: string;
    type: string;
    date: number;
    admin: string;
    reason?: string;
    duration?: BigNumber;
}

const subSchema = new Schema({
    platform: {
        type: String,
        required: true,
    },
    id: {
        type: String,
        required: false,
    },
});

export const logSchema = new Schema({
    ids: [subSchema],
    id: {
        type: String,
        required: true,
    },
    player: {
        type: String,
        required: false,
    },
    server: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        required: true,
    },
    date: {
        type: Number,
        required: true,
    },
    admin: {
        type: String,
        required: true,
    },
    reason: {
        type: String,
    },
    duration: {
        type: BigNumberSchema,
        required: false,
    },
});

export default model<ILog>("Log", logSchema);
